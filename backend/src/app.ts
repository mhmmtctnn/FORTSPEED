import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import postgres from '@fastify/postgres';
import websocket from '@fastify/websocket';
import Redis from 'ioredis';
import { registerItaiMiddleware } from './middleware/itai';
import { convertToMbps, resolveVpnType, parseSpeedTestBody, detectPayloadType, parseSdwanMembers, parseSdwanStatus, parseSdwanJson } from './helpers/webhook-parser';

export interface AppOptions {
  testing?: boolean;
  itaiMode?: boolean;
  pgUrl?: string;
  redisUrl?: string;
  mockPg?: any;
  mockRedis?: any;
}

export async function buildApp(opts: AppOptions = {}): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: opts.testing ? false : true });

  fastify.register(cors, { origin: true });

  // ITAI Hub integration — SSO, trace ID, cookie config
  await registerItaiMiddleware(fastify, { itaiMode: opts.itaiMode });

  if (opts.mockPg) {
    fastify.decorate('pg', opts.mockPg);
  } else {
    fastify.register(postgres, {
      connectionString: opts.pgUrl || process.env.DATABASE_URL,
    });
  }

  fastify.register(websocket);

  const redis: Redis = opts.mockRedis || new Redis(opts.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');
  const subRedis: Redis = opts.mockRedis || new Redis(opts.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');

  fastify.register(async (f) => {
    f.get('/ws', { websocket: true }, (_connection, _req) => {
      f.log.info('Yeni WebSocket bağlantısı');
    });
  });

  if (!opts.testing) {
    subRedis.subscribe('speedtest_updates');
    subRedis.on('message', (_channel: string, message: string) => {
      fastify.websocketServer.clients.forEach((client: any) => {
        if (client.readyState === 1) client.send(message);
      });
    });
  }


  // ─── Webhook Stats tracker (in-memory) ──────────────────────────────────────
  const webhookStats = { total: 0, today: 0, lastDay: '' };

  // ─── Raw webhook ring buffer (son 10 istek — SDWAN format tanısı için) ───────
  interface WebhookRingEntry { ts: string; method: string; url: string; type: string; bodySnippet: string; ip: string; }
  const webhookRing: WebhookRingEntry[] = [];

  fastify.addHook('onRequest', async (request, _reply) => {
    fastify.log.info(`[DEBUG] INCOMING: ${request.method} ${request.url} from ${request.ip}`);
  });

  // ─── Logging Utility ────────────────────────────────────────────────────────
  const dbLog = async (severity: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL', message: string, context?: any) => {
    try {
      await fastify.pg.query(
        `INSERT INTO SystemLogs (Severity, Message, Context) VALUES ($1, $2, $3)`,
        [severity, message, context ? JSON.stringify(context) : null]
      );
    } catch (e: any) {
      fastify.log.error(e, 'Failed to write to SystemLogs');
    }
  };

  function trackWebhookStat() {
    const today = new Date().toISOString().split('T')[0];
    if (webhookStats.lastDay === today) { webhookStats.today++; }
    else { webhookStats.today = 1; webhookStats.lastDay = today; }
    webhookStats.total++;
  }

  // ─── 1b. FortiGate Raw Text Webhook (BW/server.ps1 equivalent) ─────────────
  fastify.addContentTypeParser('text/plain', { parseAs: 'string' }, (_req, body, done) => done(null, body));
  
  // Catch-all parser for FortiManager (e.g. urlencoded or custom content types) to prevent 415 Unsupported Media Type
  fastify.addContentTypeParser('*', { parseAs: 'string' }, (_req, body, done) => done(null, body));

  /** Cihaz adına göre CityID bul — Redis cache (1 saat TTL), sonra DB.
   *  null sonuç cache'lenmez: şehir sonradan eklenince bir sonraki webhook otomatik eşleşir. */
  const findCityId = async (deviceName: string): Promise<number | null> => {
    const cacheKey = `cityid:${deviceName.toUpperCase()}`;
    const cached = await redis.get(cacheKey);
    if (cached !== null) return Number(cached); // sadece pozitif sonuçlar cache'lendi

    const res = await fastify.pg.query<{ cityid: number }>(
      `SELECT CityID FROM Cities
       WHERE (DeviceName IS NOT NULL AND DeviceName <> '' AND UPPER(DeviceName) = UPPER($1))
          OR (COALESCE(DeviceName, '') = '' AND UPPER(CityName) = UPPER($1))
       LIMIT 1`,
      [deviceName]
    );
    const cityId = res.rows.length > 0 ? res.rows[0].cityid : null;
    // Yalnızca bulunduğunda cache'le — null cache'lemek misyon eklendikten sonra
    // webhook'un hâlâ UNKNOWN_DEVICE dönmesine yol açar
    if (cityId !== null) {
      await redis.setex(cacheKey, 3600, String(cityId));
    }
    return cityId;
  };

  // Handle various possible paths Fortigate might use
  const webhookHandler = async (request: any, reply: any) => {
    const rawBody = (request.body as string) || '';
    const payloadType = detectPayloadType(rawBody);

    fastify.log.info(`Webhook recv: type=${payloadType} len=${rawBody.length}`);

    // Ring buffer — tanı amaçlı son 10 webhook'u bellekte tut
    webhookRing.push({
      ts: new Date().toISOString(),
      method: request.method,
      url: request.url,
      type: payloadType,
      bodySnippet: rawBody.slice(0, 600),
      ip: request.ip || 'UNKNOWN',
    });
    if (webhookRing.length > 10) webhookRing.shift();

    // ── Log raw webhook — sadece speedtest ve unknown tipler WebhookLogs'a gider
    // SDWAN payload'ları kendi tablolarına (SdwanMembers/SdwanStatus) kaydedilir
    const isSdwan = payloadType === 'sdwan_members' || payloadType === 'sdwan_status' || payloadType === 'sdwan_combined' || payloadType === 'sdwan_json';
    let webhookLogId: number | null = null;
    if (!isSdwan) {
      try {
        const logRes = await fastify.pg.query<{ webhooklogid: number }>(
          `INSERT INTO WebhookLogs (SourceIP, RawPayload, ParsedContext) VALUES ($1, $2, $3) RETURNING WebhookLogID`,
          [request.ip || 'UNKNOWN', rawBody, JSON.stringify({ payloadType })]
        );
        webhookLogId = logRes.rows[0]?.webhooklogid ?? null;
      } catch (err) {
        fastify.log.error(err, 'Failed to log webhook into WebhookLogs');
      }
    }

    // ── SDWAN COMBINED (members + status aynı body'de) ───────────────────────
    if (payloadType === 'sdwan_combined') {
      try {
        const { deviceName, members } = parseSdwanMembers(rawBody);
        const { activeMemberSeq }     = parseSdwanStatus(rawBody);

        fastify.log.info(`SDWAN combined parse: deviceName=${deviceName} members=${members.length} activeSeq=${activeMemberSeq}`);
        if (!deviceName) {
          fastify.log.warn(`SDWAN combined PARSE_ERROR: deviceName null`);
          return reply.status(400).send({ status: 'PARSE_ERROR', message: 'Cihaz adı parse edilemedi' });
        }
        const cityId = await findCityId(deviceName);
        fastify.log.info(`SDWAN combined cityId: device=${deviceName} cityId=${cityId}`);
        if (!cityId) {
          fastify.log.warn(`SDWAN combined UNKNOWN_DEVICE: ${deviceName}`);
          return reply.status(400).send({ status: 'UNKNOWN_DEVICE', device: deviceName });
        }

        // Upsert members
        for (const m of members) {
          await fastify.pg.query(
            `INSERT INTO SdwanMembers (CityID, SeqID, InterfaceName, Cost, UpdatedAt)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (CityID, SeqID) DO UPDATE
               SET InterfaceName = EXCLUDED.InterfaceName, Cost = EXCLUDED.Cost, UpdatedAt = NOW()`,
            [cityId, m.seqId, m.interfaceName, m.cost]
          );
        }

        // Aktif interface — members'dan çek (yeni kaydedilenleri dahil)
        let activeInterface: string | null = null;
        if (activeMemberSeq !== null) {
          const found = members.find(m => m.seqId === activeMemberSeq);
          activeInterface = found?.interfaceName ?? null;
        }

        // Upsert status + geçmiş kaydı
        if (activeMemberSeq !== null) {
          // Önceki aktif interface'i oku
          const prevRes = await fastify.pg.query<{ activeinterface: string }>(
            `SELECT ActiveInterface FROM SdwanStatus WHERE CityID = $1`, [cityId]
          );
          const prevInterface = prevRes.rows[0]?.activeinterface ?? null;

          await fastify.pg.query(
            `INSERT INTO SdwanStatus (CityID, ActiveSeqID, ActiveInterface, UpdatedAt)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (CityID) DO UPDATE
               SET ActiveSeqID = EXCLUDED.ActiveSeqID, ActiveInterface = EXCLUDED.ActiveInterface, UpdatedAt = NOW()`,
            [cityId, activeMemberSeq, activeInterface]
          );

          // Değişiklik varsa geçmişe yaz
          if (prevInterface !== activeInterface) {
            await fastify.pg.query(
              `INSERT INTO SdwanHistory (CityID, FromInterface, ToInterface, ActiveSeqID) VALUES ($1, $2, $3, $4)`,
              [cityId, prevInterface, activeInterface, activeMemberSeq]
            );
          }
        }

        fastify.log.info(`SDWAN combined: ${deviceName} → ${members.length} üye, aktif seq=${activeMemberSeq} (${activeInterface ?? '?'})`);

        await redis.publish('speedtest_updates', JSON.stringify({
          type: 'sdwan_combined', cityId, deviceName, members, activeMemberSeq, activeInterface,
          time: new Date().toISOString(),
        }));

        return reply.send({ status: 'OK', type: 'sdwan_combined', device: deviceName, members, activeMemberSeq, activeInterface });
      } catch (err) {
        fastify.log.error(err, 'SDWAN combined DB error');
        return reply.status(500).send({ status: 'Error', message: 'DB error' });
      }
    }

    // ── SDWAN JSON (manuel test / alternatif format) ──────────────────────────
    if (payloadType === 'sdwan_json') {
      try {
        const { deviceName, members, activeMemberSeq } = parseSdwanJson(rawBody);
        fastify.log.info(`SDWAN JSON parse: deviceName=${deviceName} members=${members.length} activeSeq=${activeMemberSeq}`);
        if (!deviceName || members.length === 0) {
          return reply.status(400).send({ status: 'PARSE_ERROR', message: 'deviceName veya members parse edilemedi' });
        }
        const cityId = await findCityId(deviceName);
        if (!cityId) {
          fastify.log.warn(`SDWAN JSON UNKNOWN_DEVICE: ${deviceName}`);
          return reply.status(400).send({ status: 'UNKNOWN_DEVICE', device: deviceName });
        }
        for (const m of members) {
          await fastify.pg.query(
            `INSERT INTO SdwanMembers (CityID, SeqID, InterfaceName, Cost, UpdatedAt)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (CityID, SeqID) DO UPDATE
               SET InterfaceName = EXCLUDED.InterfaceName, Cost = EXCLUDED.Cost, UpdatedAt = NOW()`,
            [cityId, m.seqId, m.interfaceName, m.cost]
          );
        }
        let activeInterface: string | null = null;
        if (activeMemberSeq !== null) {
          const found = members.find(m => m.seqId === activeMemberSeq);
          activeInterface = found?.interfaceName ?? null;
          const prevRes = await fastify.pg.query<{ activeinterface: string }>(
            `SELECT ActiveInterface FROM SdwanStatus WHERE CityID = $1`, [cityId]
          );
          const prevInterface = prevRes.rows[0]?.activeinterface ?? null;
          await fastify.pg.query(
            `INSERT INTO SdwanStatus (CityID, ActiveSeqID, ActiveInterface, UpdatedAt)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (CityID) DO UPDATE
               SET ActiveSeqID = EXCLUDED.ActiveSeqID, ActiveInterface = EXCLUDED.ActiveInterface, UpdatedAt = NOW()`,
            [cityId, activeMemberSeq, activeInterface]
          );
          if (prevInterface !== activeInterface) {
            await fastify.pg.query(
              `INSERT INTO SdwanHistory (CityID, FromInterface, ToInterface, ActiveSeqID) VALUES ($1, $2, $3, $4)`,
              [cityId, prevInterface, activeInterface, activeMemberSeq]
            );
          }
        }
        await redis.publish('speedtest_updates', JSON.stringify({
          type: 'sdwan_combined', cityId, deviceName, members, activeMemberSeq, activeInterface,
          time: new Date().toISOString(),
        }));
        fastify.log.info(`SDWAN JSON: ${deviceName} → ${members.length} üye, aktif seq=${activeMemberSeq} (${activeInterface ?? '?'})`);
        return reply.send({ status: 'OK', type: 'sdwan_json', device: deviceName, members, activeMemberSeq, activeInterface });
      } catch (err) {
        fastify.log.error(err, 'SDWAN JSON DB error');
        return reply.status(500).send({ status: 'Error', message: 'DB error' });
      }
    }

    // ── SDWAN MEMBERS ─────────────────────────────────────────────────────────
    if (payloadType === 'sdwan_members') {
      try {
        const { deviceName, members } = parseSdwanMembers(rawBody);
        fastify.log.info(`SDWAN members parse: deviceName=${deviceName} members=${members.length} rawLen=${rawBody.length} rawStart=${JSON.stringify(rawBody.slice(0, 300))}`);
        if (!deviceName || members.length === 0) {
          fastify.log.warn(`SDWAN members PARSE_ERROR: deviceName=${deviceName} members=${members.length}`);
          return reply.status(400).send({ status: 'PARSE_ERROR', message: 'SDWAN members parse edilemedi' });
        }
        const cityId = await findCityId(deviceName);
        fastify.log.info(`SDWAN members cityId lookup: device=${deviceName} cityId=${cityId}`);
        if (!cityId) {
          fastify.log.warn(`SDWAN members UNKNOWN_DEVICE: ${deviceName}`);
          return reply.status(400).send({ status: 'UNKNOWN_DEVICE', device: deviceName });
        }
        // Upsert her member
        for (const m of members) {
          await fastify.pg.query(
            `INSERT INTO SdwanMembers (CityID, SeqID, InterfaceName, Cost, UpdatedAt)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (CityID, SeqID) DO UPDATE
               SET InterfaceName = EXCLUDED.InterfaceName,
                   Cost = EXCLUDED.Cost,
                   UpdatedAt = NOW()`,
            [cityId, m.seqId, m.interfaceName, m.cost]
          );
        }
        fastify.log.info(`SDWAN members güncellendi: ${deviceName} → ${members.length} üye`);

        // WebSocket broadcast
        await redis.publish('speedtest_updates', JSON.stringify({
          type: 'sdwan_members',
          cityId, deviceName,
          members,
          time: new Date().toISOString(),
        }));

        return reply.send({ status: 'OK', type: 'sdwan_members', device: deviceName, members });
      } catch (err) {
        fastify.log.error(err, 'SDWAN members DB error');
        return reply.status(500).send({ status: 'Error', message: 'DB error' });
      }
    }

    // ── SDWAN STATUS ──────────────────────────────────────────────────────────
    if (payloadType === 'sdwan_status') {
      try {
        const { deviceName, activeMemberSeq } = parseSdwanStatus(rawBody);
        if (!deviceName) {
          return reply.status(400).send({ status: 'PARSE_ERROR', message: 'SDWAN status parse edilemedi' });
        }
        // activeMemberSeq yoksa sadece komut satırı geldi (çıktı henüz yok) — 200 dön, DB'ye yazma
        if (activeMemberSeq === null) {
          fastify.log.info(`SDWAN status komut satırı alındı (veri yok): device=${deviceName}`);
          return reply.send({ status: 'OK', type: 'sdwan_cmd', device: deviceName, note: 'command received, no data' });
        }
        const cityId = await findCityId(deviceName);
        if (!cityId) {
          return reply.status(400).send({ status: 'UNKNOWN_DEVICE', device: deviceName });
        }

        // Önceki aktif interface'i oku
        const prevRes2 = await fastify.pg.query<{ activeinterface: string }>(
          `SELECT ActiveInterface FROM SdwanStatus WHERE CityID = $1`, [cityId]
        );
        const prevInterface2 = prevRes2.rows[0]?.activeinterface ?? null;

        // Aktif interface adını SdwanMembers'dan bul
        const ifaceRes = await fastify.pg.query<{ interfacename: string }>(
          `SELECT InterfaceName FROM SdwanMembers WHERE CityID = $1 AND SeqID = $2 LIMIT 1`,
          [cityId, activeMemberSeq]
        );
        const activeInterface = ifaceRes.rows[0]?.interfacename ?? null;

        await fastify.pg.query(
          `INSERT INTO SdwanStatus (CityID, ActiveSeqID, ActiveInterface, UpdatedAt)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (CityID) DO UPDATE
             SET ActiveSeqID = EXCLUDED.ActiveSeqID,
                 ActiveInterface = EXCLUDED.ActiveInterface,
                 UpdatedAt = NOW()`,
          [cityId, activeMemberSeq, activeInterface]
        );

        // Değişiklik varsa geçmişe yaz
        if (prevInterface2 !== activeInterface) {
          await fastify.pg.query(
            `INSERT INTO SdwanHistory (CityID, FromInterface, ToInterface, ActiveSeqID) VALUES ($1, $2, $3, $4)`,
            [cityId, prevInterface2, activeInterface, activeMemberSeq]
          );
        }
        fastify.log.info(`SDWAN status güncellendi: ${deviceName} → seq=${activeMemberSeq} (${activeInterface ?? '?'})`);

        // WebSocket broadcast
        await redis.publish('speedtest_updates', JSON.stringify({
          type: 'sdwan_status',
          cityId, deviceName,
          activeMemberSeq, activeInterface,
          time: new Date().toISOString(),
        }));

        return reply.send({ status: 'OK', type: 'sdwan_status', device: deviceName, activeMemberSeq, activeInterface });
      } catch (err) {
        fastify.log.error(err, 'SDWAN status DB error');
        return reply.status(500).send({ status: 'Error', message: 'DB error' });
      }
    }

    // ── SPEED TEST (mevcut mantık) ─────────────────────────────────────────────
    try {
      const parsed = parseSpeedTestBody(rawBody);
      const deviceName = (parsed.deviceName || 'UNKNOWN').trim();
      const vpnTypeName = resolveVpnType(parsed.vpnName);
      const uploadMbps   = parsed.upValue && parsed.upUnit ? convertToMbps(parsed.upValue, parsed.upUnit) : null;
      const downloadMbps = parsed.downValue && parsed.downUnit ? convertToMbps(parsed.downValue, parsed.downUnit) : null;
      const latencyMs    = parsed.latencyMs ?? null;
      const uploadStatus   = uploadMbps   !== null ? 'OK' : 'N/A';
      const downloadStatus = downloadMbps !== null ? 'OK' : 'N/A';

      fastify.log.info(`SpeedTest: device=${deviceName} vpn=${vpnTypeName} up=${uploadMbps} down=${downloadMbps}`);
      if (uploadMbps === null || downloadMbps === null) {
        fastify.log.warn(`SpeedTest PARSE_MISS: rawBody(first 2000)=${JSON.stringify(rawBody.slice(0, 2000))}`);
      }

      // WebhookLog'u tam parsed veri ile güncelle — RETURNING ile alınan ID kullanılır
      if (webhookLogId !== null) {
        try {
          await fastify.pg.query(
            `UPDATE WebhookLogs SET ParsedContext = $1 WHERE WebhookLogID = $2`,
            [JSON.stringify({ ...parsed, payloadType: 'speedtest' }), webhookLogId]
          );
        } catch (_) { /* sessizce geç */ }
      }

      const cityId = await findCityId(deviceName);

      if (!cityId) {
        const warnMsg = `Bilinmeyen cihaz: "${deviceName}" Misyon Yönetimi listesinde kayıtlı değil. SpeedStats kaydedilmedi.`;
        fastify.log.warn(warnMsg);
        await dbLog('WARN', warnMsg, { deviceName, vpnName: parsed.vpnName, rawBody: rawBody.slice(0, 200) });
        await redis.publish('speedtest_updates', JSON.stringify({
          type: 'unknown_device',
          deviceName,
          vpnName: parsed.vpnName,
          time: new Date().toISOString(),
        }));
        return reply.status(400).send({
          status: 'UNKNOWN_DEVICE',
          message: `"${deviceName}" misyon listesinde kayıtlı değil.`,
          device: deviceName,
          timestamp: new Date().toISOString(),
        });
      }

      // Hız değeri yoksa logla ama yine de SpeedStats'a yaz (Status = 'N/A')
      // Harita/raporlar zaten DownloadStatus='OK' filtresi kullanıyor — N/A kayıtlar görünmez
      // ama cihazın yaşadığını ve ne zaman bağlandığını kayıt altına almak için yazılır
      if (downloadMbps === null || uploadMbps === null) {
        const missingField = downloadMbps === null && uploadMbps === null
          ? 'download ve upload'
          : downloadMbps === null ? 'download' : 'upload';
        fastify.log.warn(`SpeedTest PARSE_MISS: rawBody(first 2000)=${JSON.stringify(rawBody.slice(0, 2000))}`);
        fastify.log.info(`Hız değeri alınamadı (${deviceName} / ${vpnTypeName}) — ${missingField} eksik, SpeedStats'a N/A olarak yazılıyor.`);
      }

      const vpnRes = await fastify.pg.query<{ vpntypeid: number }>(
        `INSERT INTO VpnTypes (VpnTypeName) VALUES ($1)
         ON CONFLICT (VpnTypeName) DO UPDATE SET VpnTypeName = EXCLUDED.VpnTypeName
         RETURNING VpnTypeID`,
        [vpnTypeName]
      );
      const vpnTypeId = vpnRes.rows[0].vpntypeid;

      await fastify.pg.query(
        `INSERT INTO SpeedStats (CityID, VpnTypeID, DeviceName, DownloadSpeed, UploadSpeed, Latency, UploadStatus, DownloadStatus, MeasuredAt)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [cityId, vpnTypeId, deviceName, downloadMbps, uploadMbps, latencyMs, uploadStatus, downloadStatus]
      );

      // WebSocket'e sadece gerçek hız verisi varsa bildir — N/A kayıtlar haritayı güncellememeli
      if (downloadMbps !== null || uploadMbps !== null) {
        await redis.publish('speedtest_updates', JSON.stringify({
          type: 'speedtest',
          cityId, vpnTypeId, vpnTypeName,
          download: downloadMbps, upload: uploadMbps,
          latency: latencyMs, deviceName,
          time: new Date().toISOString(),
        }));
      }

      trackWebhookStat();

      return reply.send({
        status: 'OK',
        timestamp: new Date().toISOString(),
        device: deviceName,
        vpn_connection: parsed.vpnName,
        vpn_type: vpnTypeName,
        upload_mbps: uploadMbps,
        download_mbps: downloadMbps,
        upload_status: uploadStatus,
        download_status: downloadStatus,
        webhook_stats: { total: webhookStats.total, today: webhookStats.today },
      });
    } catch (err) {
      fastify.log.error(err, 'Webhook DB error');
      return reply.status(500).send({ status: 'Error', message: 'DB error' });
    }
  };

  fastify.post('/api/webhook', webhookHandler);
  fastify.post('/webhook', webhookHandler);
  fastify.post('/', webhookHandler);
  fastify.get('/api/webhook', webhookHandler);
  fastify.get('/webhook', webhookHandler);

  // ─── Logs API ───────────────────────────────────────────────────────────────
  // Log retention: 30 gün — uygulama başlangıcında ve her gece temizlenir
  const purgeOldLogs = async () => {
    try {
      const r1 = await fastify.pg.query(`DELETE FROM SystemLogs  WHERE CreatedAt < NOW() - INTERVAL '30 days'`);
      const r2 = await fastify.pg.query(`DELETE FROM WebhookLogs WHERE CreatedAt < NOW() - INTERVAL '30 days'`);
      if ((r1.rowCount ?? 0) > 0 || (r2.rowCount ?? 0) > 0) {
        fastify.log.info(`Log temizleme: ${r1.rowCount ?? 0} sistem + ${r2.rowCount ?? 0} webhook logu silindi (>30 gün)`);
      }
    } catch (e) { fastify.log.error(e, 'Log purge hatası'); }
  };
  // purgeOldLogs başlangıcı onReady içinde çağrılır — fastify.pg hazır olduktan sonra
  // (burada çağrılırsa pg henüz register edilmemiş olur)

  fastify.get('/api/logs/system', async (request, reply) => {
    const { severity, days } = request.query as any;
    const retentionDays = Math.min(Number(days) || 30, 30); // max 30 gün
    try {
      const params: any[] = [retentionDays];
      let query = `SELECT * FROM SystemLogs WHERE CreatedAt >= NOW() - ($1 || ' days')::INTERVAL`;
      if (severity && severity !== 'ALL') {
        query += ` AND Severity = $2`;
        params.push(severity);
      }
      query += ` ORDER BY CreatedAt DESC LIMIT 5000`;
      const res = await fastify.pg.query(query, params);
      return reply.send(res.rows);
    } catch (err: any) {
      fastify.log.error(err, 'Failed to fetch SystemLogs');
      return reply.status(500).send({ error: 'Failed to fetch logs' });
    }
  });

  fastify.get('/api/logs/webhooks', async (request, reply) => {
    const { days } = request.query as any;
    const retentionDays = Math.min(Number(days) || 30, 30); // max 30 gün
    try {
      const res = await fastify.pg.query(
        `SELECT * FROM WebhookLogs WHERE CreatedAt >= NOW() - ($1 || ' days')::INTERVAL ORDER BY CreatedAt DESC LIMIT 5000`,
        [retentionDays]
      );
      return reply.send(res.rows);
    } catch (err: any) {
      fastify.log.error(err, 'Failed to fetch WebhookLogs');
      return reply.status(500).send({ error: 'Failed to fetch logs' });
    }
  });

  // Webhook stats endpoint
  fastify.get('/api/webhook/stats', async () => webhookStats);

  // Son 30 SpeedStats kaydını ActivityEntry formatında döndür (Dashboard başlangıç yüklemesi)
  fastify.get('/api/activity/recent', async (_request, reply) => {
    try {
      const { rows } = await fastify.pg.query(`
        SELECT
          ss.StatID as id,
          ss.CityID as "cityId",
          c.CityName as "missionName",
          vt.VpnTypeName as "vpnType",
          ss.DownloadSpeed as download,
          ss.UploadSpeed as upload,
          ss.Latency as latency,
          ss.MeasuredAt as time
        FROM SpeedStats ss
        JOIN Cities c ON ss.CityID = c.CityID
        JOIN VpnTypes vt ON ss.VpnTypeID = vt.VpnTypeID
        ORDER BY ss.MeasuredAt DESC
        LIMIT 30
      `);
      return rows.map((r: any) => ({
        id: String(r.id),
        cityId: r.cityId,
        missionName: r.missionName,
        vpnType: r.vpnType,
        download: Number(r.download ?? 0),
        upload: Number(r.upload ?? 0),
        latency: Number(r.latency ?? 0),
        time: new Date(r.time).toLocaleTimeString('tr-TR'),
      }));
    } catch (err: any) {
      fastify.log.error(err, 'Failed to fetch recent activity');
      return reply.status(500).send({ error: 'DB Error' });
    }
  });

  // Debug: Sistem tanı — son SpeedStats, webhook ve parse durumu
  fastify.get('/api/debug/webhook-last', async (_req, reply) => {
    try {
      const logs = await fastify.pg.query(
        `SELECT SourceIP, RawPayload, ParsedContext, CreatedAt
         FROM WebhookLogs ORDER BY CreatedAt DESC LIMIT 10`
      );
      const stats = await fastify.pg.query(
        `SELECT ss.StatID, c.CityName, vt.VpnTypeName,
                ss.DownloadSpeed, ss.UploadSpeed, ss.Latency,
                ss.DownloadStatus, ss.UploadStatus, ss.MeasuredAt
         FROM SpeedStats ss
         JOIN Cities c ON ss.CityID = c.CityID
         JOIN VpnTypes vt ON ss.VpnTypeID = vt.VpnTypeID
         ORDER BY ss.MeasuredAt DESC LIMIT 20`
      );
      const vpnTypes = await fastify.pg.query(
        `SELECT VpnTypeID, VpnTypeName FROM VpnTypes ORDER BY VpnTypeID`
      );
      // Son başarılı SpeedStats
      const lastOk = await fastify.pg.query(
        `SELECT c.CityName, vt.VpnTypeName, ss.DownloadSpeed, ss.MeasuredAt
         FROM SpeedStats ss
         JOIN Cities c ON ss.CityID = c.CityID
         JOIN VpnTypes vt ON ss.VpnTypeID = vt.VpnTypeID
         WHERE ss.DownloadStatus = 'OK'
         ORDER BY ss.MeasuredAt DESC LIMIT 1`
      );
      // Günlük webhook sayısı (son 7 gün)
      const dailyCounts = await fastify.pg.query(
        `SELECT DATE(CreatedAt) as day, COUNT(*) as count
         FROM WebhookLogs
         WHERE CreatedAt >= NOW() - INTERVAL '7 days'
         GROUP BY DATE(CreatedAt)
         ORDER BY day DESC`
      );
      return reply.send({
        lastSuccessfulSpeedTest: lastOk.rows[0] ?? null,
        recentWebhooks: logs.rows,
        recentSpeedStats: stats.rows,
        vpnTypes: vpnTypes.rows,
        dailyWebhookCounts: dailyCounts.rows,
        recentRawWebhooks: [...webhookRing].reverse(), // en yeni önde
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ─── 1. Legacy JSON Webhook (backward compat) ───────────────────────────────
  fastify.post('/webhook/speedtest', async (request, reply) => {
    const { cityId, vpnTypeId, deviceName, downloadSpeed, uploadSpeed, latency, uploadStatus, downloadStatus } = request.body as any;
    const query = `
      INSERT INTO SpeedStats (CityID, VpnTypeID, DeviceName, DownloadSpeed, UploadSpeed, Latency, UploadStatus, DownloadStatus, MeasuredAt)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *;
    `;
    try {
      const result = await fastify.pg.query(query, [
        cityId, vpnTypeId,
        deviceName || 'Unknown Device',
        downloadSpeed, uploadSpeed,
        latency || 0.0,
        uploadStatus || 'OK',
        downloadStatus || 'OK',
      ]);
      // VpnTypeName'i DB'den çek — frontend sınıflandırması için gerekli
      const vtRes = await fastify.pg.query<{ vpntypename: string }>(
        `SELECT VpnTypeName FROM VpnTypes WHERE VpnTypeID = $1`, [vpnTypeId]
      );
      const vpnTypeName = vtRes.rows[0]?.vpntypename ?? 'METRO';
      await redis.publish('speedtest_updates', JSON.stringify({
        type: 'speedtest',
        cityId, vpnTypeId, vpnTypeName,
        download: downloadSpeed, upload: uploadSpeed,
        latency: latency || 0.0, deviceName,
        time: new Date().toISOString(),
      }));
      return { status: 'success', data: result.rows[0] };
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });


  // 2. Map API
  fastify.get('/api/missions', async (_request, reply) => {
    // VpnTypeID kullanmak yerine VpnTypeName ile join yapıyoruz — ID sırası DB'ye göre değişebilir
    const query = `
      SELECT
          c.CityID as id, c.CityName as name, c.IL as city,
          c.ULKE as country, c.KITA as continent,
          c.BOYLAM as lon, c.ENLEM as lat,
          c.IsStarlink as is_starlink,
          c.SatelliteType as satellite_type,
          c.TerrestrialType as terrestrial_type,
          gsm.DownloadSpeed   as gsm_download,   gsm.UploadSpeed   as gsm_upload,
          gsm.Latency         as gsm_latency,    gsm.DeviceName    as gsm_device,    gsm.MeasuredAt as gsm_test_time,
          metro.DownloadSpeed as metro_download,  metro.UploadSpeed as metro_upload,
          metro.Latency       as metro_latency,   metro.DeviceName  as metro_device,  metro.MeasuredAt as metro_test_time,
          hub.DownloadSpeed   as hub_download,    hub.UploadSpeed   as hub_upload,
          hub.Latency         as hub_latency,     hub.DeviceName    as hub_device,    hub.MeasuredAt as hub_test_time
      FROM Cities c
      LEFT JOIN LATERAL (
          SELECT ss.DownloadSpeed, ss.UploadSpeed, ss.Latency, ss.MeasuredAt, ss.DeviceName
          FROM SpeedStats ss
          JOIN VpnTypes vt ON ss.VpnTypeID = vt.VpnTypeID
          WHERE ss.CityID = c.CityID AND UPPER(vt.VpnTypeName) = 'GSM'
            AND ss.DownloadStatus = 'OK' AND ss.UploadStatus = 'OK'
          ORDER BY ss.MeasuredAt DESC LIMIT 1
      ) gsm ON true
      LEFT JOIN LATERAL (
          SELECT ss.DownloadSpeed, ss.UploadSpeed, ss.Latency, ss.MeasuredAt, ss.DeviceName
          FROM SpeedStats ss
          JOIN VpnTypes vt ON ss.VpnTypeID = vt.VpnTypeID
          WHERE ss.CityID = c.CityID AND UPPER(vt.VpnTypeName) = 'METRO'
            AND ss.DownloadStatus = 'OK' AND ss.UploadStatus = 'OK'
          ORDER BY ss.MeasuredAt DESC LIMIT 1
      ) metro ON true
      LEFT JOIN LATERAL (
          SELECT ss.DownloadSpeed, ss.UploadSpeed, ss.Latency, ss.MeasuredAt, ss.DeviceName
          FROM SpeedStats ss
          JOIN VpnTypes vt ON ss.VpnTypeID = vt.VpnTypeID
          WHERE ss.CityID = c.CityID AND UPPER(vt.VpnTypeName) = 'HUB'
            AND ss.DownloadStatus = 'OK' AND ss.UploadStatus = 'OK'
          ORDER BY ss.MeasuredAt DESC LIMIT 1
      ) hub ON true;
    `;
    try {
      const { rows } = await fastify.pg.query(query);
      return rows;
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });

  // 3. Analytics API
  fastify.get('/api/stats/:cityId', async (request, reply) => {
    const { cityId } = request.params as any;
    const query = `
      SELECT vt.VpnTypeName as vpn_type, ss.MeasuredAt as time,
             ss.DownloadSpeed as download, ss.UploadSpeed as upload, ss.Latency as latency
      FROM SpeedStats ss
      JOIN VpnTypes vt ON ss.VpnTypeID = vt.VpnTypeID
      WHERE ss.CityID = $1
        AND ss.MeasuredAt > NOW() - INTERVAL '7 days'
        AND ss.DownloadStatus = 'OK' AND ss.UploadStatus = 'OK'
      ORDER BY ss.MeasuredAt ASC;
    `;
    try {
      const { rows } = await fastify.pg.query(query, [cityId]);
      return rows;
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });

  // 4. Reporting API
  fastify.get('/api/reports', async (request, reply) => {
    const { startDate, endDate, cityId, country, continent, vpnTypeId, minSpeed, maxSpeed } = request.query as any;
    let query = `
      SELECT ss.StatID, c.CityName, c.ULKE as Country, c.KITA as Continent,
             vt.VpnTypeName, ss.DeviceName, ss.DownloadSpeed, ss.UploadSpeed, ss.Latency, ss.MeasuredAt
      FROM SpeedStats ss
      JOIN Cities c ON ss.CityID = c.CityID
      JOIN VpnTypes vt ON ss.VpnTypeID = vt.VpnTypeID
      WHERE ss.DownloadStatus = 'OK' AND ss.UploadStatus = 'OK'
    `;
    const params: unknown[] = [];
    let paramIdx = 1;
    if (startDate) { query += ` AND ss.MeasuredAt >= $${paramIdx++}`; params.push(startDate); }
    if (endDate)   { query += ` AND ss.MeasuredAt <= $${paramIdx++}`; params.push(endDate); }
    if (cityId)    { query += ` AND ss.CityID = $${paramIdx++}`; params.push(cityId); }
    if (country)   { query += ` AND c.ULKE = $${paramIdx++}`; params.push(country); }
    if (continent) { query += ` AND c.KITA = $${paramIdx++}`; params.push(continent); }
    if (vpnTypeId) { query += ` AND ss.VpnTypeID = $${paramIdx++}`; params.push(vpnTypeId); }
    if (minSpeed)  { query += ` AND ss.DownloadSpeed >= $${paramIdx++}`; params.push(Number(minSpeed)); }
    if (maxSpeed)  { query += ` AND ss.DownloadSpeed <= $${paramIdx++}`; params.push(Number(maxSpeed)); }
    query += ` ORDER BY ss.MeasuredAt DESC LIMIT 1000`;
    try {
      const { rows } = await fastify.pg.query(query, params);
      return rows;
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });

  // 5. Mission-based reports
  fastify.get('/api/reports/by-mission', async (request, reply) => {
    const { startDate, endDate, continent, country, cityId, minSpeed, maxSpeed } = request.query as any;
    let query = `
      SELECT c.CityID, c.CityName as mission_name, c.ULKE as country, c.KITA as continent,
             c.IL as city, c.TURU as type,
             COUNT(*) as total_tests,
             AVG(ss.DownloadSpeed) as avg_download, AVG(ss.UploadSpeed) as avg_upload,
             AVG(NULLIF(ss.Latency, 0)) as avg_latency,
             MAX(ss.DownloadSpeed) as max_download, MIN(ss.DownloadSpeed) as min_download,
             MAX(ss.UploadSpeed) as max_upload, MIN(ss.UploadSpeed) as min_upload,
             MAX(ss.MeasuredAt) as last_test_time,
             (SELECT json_agg(json_build_object('vpn_type', y.vpn_type, 'avg_speed', y.avg_speed))
              FROM (
                SELECT vt.VpnTypeName as vpn_type, AVG(ss2.DownloadSpeed) as avg_speed
                FROM SpeedStats ss2 LEFT JOIN VpnTypes vt ON ss2.VpnTypeID = vt.VpnTypeID
                WHERE ss2.CityID = c.CityID GROUP BY vt.VpnTypeName
              ) y) as by_vpn_type
      FROM Cities c LEFT JOIN SpeedStats ss ON ss.CityID = c.CityID
      WHERE (ss.StatID IS NULL OR (ss.DownloadStatus = 'OK' AND ss.UploadStatus = 'OK'))
    `;
    const params: unknown[] = [];
    let paramIdx = 1;
    if (startDate) { query += ` AND ss.MeasuredAt >= $${paramIdx++}`; params.push(startDate); }
    if (endDate)   { query += ` AND ss.MeasuredAt <= $${paramIdx++}`; params.push(endDate); }
    if (country)   { query += ` AND c.ULKE = $${paramIdx++}`; params.push(country); }
    if (continent) { query += ` AND c.KITA = $${paramIdx++}`; params.push(continent); }
    if (cityId)    { query += ` AND c.CityID = $${paramIdx++}`; params.push(cityId); }
    if (minSpeed)  { query += ` AND ss.DownloadSpeed >= $${paramIdx++}`; params.push(Number(minSpeed)); }
    if (maxSpeed)  { query += ` AND ss.DownloadSpeed <= $${paramIdx++}`; params.push(Number(maxSpeed)); }
    query += ` GROUP BY c.CityID, c.CityName, c.ULKE, c.KITA, c.IL, c.TURU ORDER BY avg_download DESC`;
    try {
      const { rows } = await fastify.pg.query(query, params);
      return rows;
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });

  // 6. Country-based reports
  fastify.get('/api/reports/by-country', async (request, reply) => {
    const { startDate, endDate, continent, country, cityId, minSpeed, maxSpeed } = request.query as any;
    let query = `
      SELECT c.ULKE as country, c.KITA as continent,
             COUNT(DISTINCT c.CityID) as total_missions, COUNT(*) as total_tests,
             AVG(ss.DownloadSpeed) as avg_download, AVG(ss.UploadSpeed) as avg_upload,
             AVG(NULLIF(ss.Latency, 0)) as avg_latency, MAX(ss.DownloadSpeed) as max_download,
             MIN(ss.DownloadSpeed) as min_download, STDDEV(ss.DownloadSpeed) as stddev_download,
             MAX(ss.MeasuredAt) as last_test_time
      FROM Cities c LEFT JOIN SpeedStats ss ON ss.CityID = c.CityID
      WHERE (ss.StatID IS NULL OR (ss.DownloadStatus = 'OK' AND ss.UploadStatus = 'OK'))
    `;
    const params: unknown[] = [];
    let paramIdx = 1;
    if (startDate) { query += ` AND ss.MeasuredAt >= $${paramIdx++}`; params.push(startDate); }
    if (endDate)   { query += ` AND ss.MeasuredAt <= $${paramIdx++}`; params.push(endDate); }
    if (continent) { query += ` AND c.KITA = $${paramIdx++}`; params.push(continent); }
    if (country)   { query += ` AND c.ULKE = $${paramIdx++}`; params.push(country); }
    if (cityId)    { query += ` AND c.CityID = $${paramIdx++}`; params.push(cityId); }
    if (minSpeed)  { query += ` AND ss.DownloadSpeed >= $${paramIdx++}`; params.push(Number(minSpeed)); }
    if (maxSpeed)  { query += ` AND ss.DownloadSpeed <= $${paramIdx++}`; params.push(Number(maxSpeed)); }
    query += ` GROUP BY c.ULKE, c.KITA ORDER BY avg_download DESC`;
    try {
      const { rows } = await fastify.pg.query(query, params);
      return rows;
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });

  // 7. Continent-based reports
  fastify.get('/api/reports/by-continent', async (request, reply) => {
    const { continent, country, cityId } = request.query as any;
    let query = `
      SELECT c.KITA as continent,
             COUNT(DISTINCT c.CityID) as total_missions, COUNT(DISTINCT c.ULKE) as total_countries,
             COUNT(*) as total_tests,
             AVG(ss.DownloadSpeed) as avg_download, AVG(ss.UploadSpeed) as avg_upload,
             AVG(NULLIF(ss.Latency, 0)) as avg_latency,
             MAX(ss.DownloadSpeed) as max_download, MIN(ss.DownloadSpeed) as min_download,
             MAX(ss.MeasuredAt) as last_test_time
      FROM Cities c LEFT JOIN SpeedStats ss ON ss.CityID = c.CityID
      WHERE (ss.StatID IS NULL OR (ss.DownloadStatus = 'OK' AND ss.UploadStatus = 'OK'))
    `;
    const params: unknown[] = [];
    let paramIdx = 1;
    if (continent) { query += ` AND c.KITA = $${paramIdx++}`; params.push(continent); }
    if (country)   { query += ` AND c.ULKE = $${paramIdx++}`; params.push(country); }
    if (cityId)    { query += ` AND c.CityID = $${paramIdx++}`; params.push(cityId); }
    query += ` GROUP BY c.KITA ORDER BY avg_download DESC`;
    try {
      const { rows } = await fastify.pg.query(query, params);
      return rows;
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });

  // 8. VPN Type based reports
  fastify.get('/api/reports/by-vpntype', async (request, reply) => {
    const { startDate, endDate, country, continent } = request.query as any;
    let query = `
      SELECT vt.VpnTypeName as vpn_type,
             COUNT(DISTINCT c.CityID) as total_missions, COUNT(*) as total_tests,
             AVG(ss.DownloadSpeed) as avg_download, AVG(ss.UploadSpeed) as avg_upload,
             AVG(NULLIF(ss.Latency, 0)) as avg_latency,
             MAX(ss.DownloadSpeed) as max_download, MIN(ss.DownloadSpeed) as min_download,
             MAX(ss.MeasuredAt) as last_test_time
      FROM SpeedStats ss
      JOIN Cities c ON ss.CityID = c.CityID
      JOIN VpnTypes vt ON ss.VpnTypeID = vt.VpnTypeID
      WHERE ss.DownloadStatus = 'OK' AND ss.UploadStatus = 'OK'
    `;
    const params: any[] = [];
    let paramIdx = 1;
    if (startDate) { query += ` AND ss.MeasuredAt >= $${paramIdx++}`; params.push(startDate); }
    if (endDate)   { query += ` AND ss.MeasuredAt <= $${paramIdx++}`; params.push(endDate); }
    if (country)   { query += ` AND c.ULKE = $${paramIdx++}`; params.push(country); }
    if (continent) { query += ` AND c.KITA = $${paramIdx++}`; params.push(continent); }
    query += ` GROUP BY vt.VpnTypeName ORDER BY avg_download DESC`;
    try {
      const { rows } = await fastify.pg.query(query, params);
      return rows;
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });

  // 9. Performance comparison over time
  fastify.get('/api/reports/performance-comparison', async (request, reply) => {
    const { cityId, startDate, endDate } = request.query as any;
    if (!cityId) return reply.status(400).send({ error: 'cityId required' });
    let query = `
      SELECT DATE_TRUNC('hour', ss.MeasuredAt) as time_period,
             COUNT(*) as test_count,
             AVG(ss.DownloadSpeed) as avg_download, AVG(ss.UploadSpeed) as avg_upload,
             AVG(NULLIF(ss.Latency, 0)) as avg_latency,
             MAX(ss.DownloadSpeed) as max_download, MIN(ss.DownloadSpeed) as min_download,
             STDDEV(ss.DownloadSpeed) as stddev_download
      FROM SpeedStats ss WHERE ss.CityID = $1
    `;
    const params: any[] = [cityId];
    let paramIdx = 2;
    if (startDate) { query += ` AND ss.MeasuredAt >= $${paramIdx++}`; params.push(startDate); }
    if (endDate)   { query += ` AND ss.MeasuredAt <= $${paramIdx++}`; params.push(endDate); }
    query += ` GROUP BY DATE_TRUNC('hour', ss.MeasuredAt) ORDER BY time_period ASC`;
    try {
      const { rows } = await fastify.pg.query(query, params);
      return rows;
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });

  // 10. Summary dashboard
  fastify.get('/api/reports/summary', async (request, reply) => {
    const { startDate, endDate } = request.query as any;
    let query = `
      SELECT
          (SELECT COUNT(DISTINCT CityID) FROM Cities) as total_missions,
          COUNT(DISTINCT ss.CityID) as missions_with_data,
          COUNT(*) as total_tests,
          AVG(ss.DownloadSpeed) as global_avg_download,
          AVG(ss.UploadSpeed) as global_avg_upload,
          AVG(NULLIF(ss.Latency, 0)) as global_avg_latency,
          (SELECT COUNT(DISTINCT ULKE) FROM Cities) as total_countries,
          (SELECT COUNT(DISTINCT KITA) FROM Cities) as total_continents,
          MAX(ss.MeasuredAt) as last_update_time,
          (SELECT json_agg(json_build_object('continent', agg.kita, 'avg_speed', agg.avg_speed))
           FROM (SELECT c2.KITA as kita, AVG(ss2.DownloadSpeed) as avg_speed
                 FROM Cities c2 LEFT JOIN SpeedStats ss2 ON c2.CityID = ss2.CityID
                 GROUP BY c2.KITA) agg) as by_continent
      FROM SpeedStats ss WHERE ss.DownloadStatus = 'OK' AND ss.UploadStatus = 'OK'
    `;
    const params: any[] = [];
    let paramIdx = 1;
    if (startDate) { query += ` AND ss.MeasuredAt >= $${paramIdx++}`; params.push(startDate); }
    if (endDate)   { query += ` AND ss.MeasuredAt <= $${paramIdx++}`; params.push(endDate); }
    try {
      const { rows } = await fastify.pg.query(query, params);
      return rows[0] || {};
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });

  // 11. Filter values
  fastify.get('/api/reports/filters', async (_request, reply) => {
    try {
      const { rows } = await fastify.pg.query(`
        SELECT 'continent' as type, KITA as val FROM Cities WHERE KITA IS NOT NULL
        UNION ALL
        SELECT 'country',           ULKE        FROM Cities WHERE ULKE IS NOT NULL
        UNION ALL
        SELECT 'vpntype',           VpnTypeName FROM VpnTypes
        ORDER BY type, val
      `);
      return {
        continents: rows.filter((r: any) => r.type === 'continent').map((r: any) => r.val).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i).sort(),
        countries:  rows.filter((r: any) => r.type === 'country').map((r: any) => r.val).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i).sort(),
        vpnTypes:   rows.filter((r: any) => r.type === 'vpntype').map((r: any) => r.val),
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });
  // 13. Sparklines History
  fastify.get('/api/reports/sparklines', async (_request, reply) => {
    try {
      const queryDaily = `SELECT ss.CityID as cid, vt.VpnTypeName as vpn_type, DATE_TRUNC('hour', ss.MeasuredAt) as ts, AVG(ss.DownloadSpeed) as dl, AVG(ss.UploadSpeed) as ul FROM SpeedStats ss JOIN VpnTypes vt ON ss.VpnTypeID = vt.VpnTypeID WHERE ss.MeasuredAt > NOW() - INTERVAL '24 hours' GROUP BY ss.CityID, vt.VpnTypeName, DATE_TRUNC('hour', ss.MeasuredAt) ORDER BY ts ASC`;
      const queryWeekly = `SELECT ss.CityID as cid, vt.VpnTypeName as vpn_type, DATE_TRUNC('day', ss.MeasuredAt) as ts, AVG(ss.DownloadSpeed) as dl, AVG(ss.UploadSpeed) as ul FROM SpeedStats ss JOIN VpnTypes vt ON ss.VpnTypeID = vt.VpnTypeID WHERE ss.MeasuredAt > NOW() - INTERVAL '7 days' GROUP BY ss.CityID, vt.VpnTypeName, DATE_TRUNC('day', ss.MeasuredAt) ORDER BY ts ASC`;
      const queryMonthly = `SELECT ss.CityID as cid, vt.VpnTypeName as vpn_type, DATE_TRUNC('day', ss.MeasuredAt) as ts, AVG(ss.DownloadSpeed) as dl, AVG(ss.UploadSpeed) as ul FROM SpeedStats ss JOIN VpnTypes vt ON ss.VpnTypeID = vt.VpnTypeID WHERE ss.MeasuredAt > NOW() - INTERVAL '30 days' GROUP BY ss.CityID, vt.VpnTypeName, DATE_TRUNC('day', ss.MeasuredAt) ORDER BY ts ASC`;

      const [resD, resW, resM] = await Promise.all([
        fastify.pg.query(queryDaily),
        fastify.pg.query(queryWeekly),
        fastify.pg.query(queryMonthly)
      ]);

      const data: Record<string, Record<string, any>> = {};

      const processRows = (rows: any[], periodName: string) => {
         rows.forEach(r => {
            const cid = String(r.cid);
            const vpnType = String(r.vpn_type);
            if (!data[cid]) data[cid] = {};
            if (!data[cid][vpnType]) data[cid][vpnType] = { daily: [], weekly: [], monthly: [] };
            data[cid][vpnType][periodName].push({ ts: r.ts, dl: Number(r.dl).toFixed(1), ul: Number(r.ul).toFixed(1) });
         });
      };

      processRows(resD.rows, 'daily');
      processRows(resW.rows, 'weekly');
      processRows(resM.rows, 'monthly');

      return data;
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });

  // 14. NOC Executive Summary
  fastify.get('/api/reports/noc-summary', async (request, reply) => {
    const { period } = request.query as { period?: 'daily' | 'weekly' | 'monthly' };
    const INTERVALS: Record<string, string> = { daily: '1 day', weekly: '7 days', monthly: '30 days' };
    const intervalStr = INTERVALS[period || ''] ?? '30 days';

    const query = `
      SELECT c.CityID as id, c.CityName as name, c.ULKE as country, c.KITA as continent,
             vt.VpnTypeName as vpn_type,
             AVG(ss.DownloadSpeed) as dl, AVG(ss.UploadSpeed) as ul, COUNT(*) as test_count
      FROM Cities c
      JOIN SpeedStats ss ON c.CityID = ss.CityID
      JOIN VpnTypes vt ON ss.VpnTypeID = vt.VpnTypeID
      WHERE ss.MeasuredAt > NOW() - $1::interval
        AND ss.DownloadStatus = 'OK' AND ss.UploadStatus = 'OK'
      GROUP BY c.CityID, c.CityName, c.ULKE, c.KITA, vt.VpnTypeName
    `;

    try {
      const { rows } = await fastify.pg.query(query, [intervalStr]);

      const toRow = (r: any) => ({ ...r, dl: Number(r.dl).toFixed(1), ul: Number(r.ul).toFixed(1) });
      const top = (arr: any[], key: 'dl' | 'ul', n = 10) =>
        [...arr].sort((a, b) => Number(b[key]) - Number(a[key])).slice(0, n);

      const gsm_arr   = rows.filter((r: any) => r.vpn_type === 'GSM').map(toRow);
      const metro_arr = rows.filter((r: any) => r.vpn_type === 'METRO').map(toRow);
      const hub_arr   = rows.filter((r: any) => r.vpn_type === 'HUB').map(toRow);

      const top_gsm_dl   = top(gsm_arr, 'dl');
      const top_gsm_ul   = top(gsm_arr, 'ul');
      const top_metro_dl = top(metro_arr, 'dl');
      const top_metro_ul = top(metro_arr, 'ul');
      const top_hub_dl   = top(hub_arr, 'dl');
      const top_hub_ul   = top(hub_arr, 'ul');

      const bottlenecks = rows.filter((r: any) => {
        const dl = Number(r.dl);
        const ul = Number(r.ul);
        if (dl < 5 && ul < 5) return false;
        const diff = Math.abs(dl - ul);
        const max = Math.max(dl, ul, 0.001);
        return (diff / max) > 0.8;
      }).map(toRow).sort((a: any, b: any) => Number(b.dl) - Number(a.dl)).slice(0, 15);

      const continentsMap: Record<string, { dl: number, count: number }> = {};
      rows.forEach((r: any) => {
        const k = r.continent || 'Bilinmeyen';
        if (!continentsMap[k]) continentsMap[k] = { dl: 0, count: 0 };
        continentsMap[k].dl += Number(r.dl);
        continentsMap[k].count++;
      });

      const top_continents = Object.keys(continentsMap).map(k => ({
        name: k,
        dl: continentsMap[k].count > 0 ? (continentsMap[k].dl / continentsMap[k].count).toFixed(1) : 0
      })).sort((a: any, b: any) => Number(b.dl) - Number(a.dl));

      // Period'a göre özet istatistikler — stat kartları için
      const uniqueCities = new Set(rows.map((r: any) => r.id));
      const global_avg_download = rows.length > 0
        ? (rows.reduce((s: number, r: any) => s + Number(r.dl), 0) / rows.length).toFixed(2)
        : '0.00';
      const global_avg_upload = rows.length > 0
        ? (rows.reduce((s: number, r: any) => s + Number(r.ul), 0) / rows.length).toFixed(2)
        : '0.00';

      // Toplam misyon sayısını DB'den al (period bağımsız)
      const totalRes = await fastify.pg.query(`SELECT COUNT(*) as cnt FROM Cities`);
      const total_missions = Number(totalRes.rows[0]?.cnt ?? 0);
      const missions_with_data = uniqueCities.size;

      return {
        top_gsm_dl, top_gsm_ul, top_metro_dl, top_metro_ul,
        top_hub_dl, top_hub_ul, bottlenecks, top_continents,
        total_missions, missions_with_data,
        global_avg_download, global_avg_upload,
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });

  // 12. Cities CRUD
  fastify.get('/api/cities', async (_request, reply) => {
    // CityID'ye göre sıralı dönür — Misyon Yönetiminde ID sıralı görünür
    const withDeviceName = 'SELECT CityID as id, CityName as name, KITA as continent, ULKE as country, IL as city, TURU as type, ENLEM as lat, BOYLAM as lon, DeviceName as device_name, IsStarlink as is_starlink, SatelliteType as satellite_type, TerrestrialType as terrestrial_type FROM Cities ORDER BY CityID ASC';
    const withoutDeviceName = 'SELECT CityID as id, CityName as name, KITA as continent, ULKE as country, IL as city, TURU as type, ENLEM as lat, BOYLAM as lon, NULL as device_name, FALSE as is_starlink, NULL as satellite_type, NULL as terrestrial_type FROM Cities ORDER BY CityID ASC';
    try {
      const { rows } = await fastify.pg.query(withDeviceName);
      return rows;
    } catch {
      try {
        const { rows } = await fastify.pg.query(withoutDeviceName);
        return rows;
      } catch (err2) {
        fastify.log.error(err2);
        return reply.status(500).send({ error: 'DB Error' });
      }
    }
  });

  fastify.post('/api/cities', async (request, reply) => {
    const { name, continent, country, city, type, lat, lon, device_name, is_starlink, satellite_type, terrestrial_type } = request.body as any;
    if (!name) return reply.status(400).send({ error: 'name is required' });
    const satType = satellite_type || null;
    const terrType = terrestrial_type || null;
    const isStarlinkVal = satType === 'starlink' ? true : (is_starlink ?? false);
    try {
      const { rows } = await fastify.pg.query(
        'INSERT INTO Cities (CityName, KITA, ULKE, IL, TURU, ENLEM, BOYLAM, DeviceName, IsStarlink, SatelliteType, TerrestrialType) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING CityID as id, CityName as name, KITA as continent, ULKE as country, IL as city, TURU as type, ENLEM as lat, BOYLAM as lon, DeviceName as device_name, IsStarlink as is_starlink, SatelliteType as satellite_type, TerrestrialType as terrestrial_type',
        [name, continent, country, city, type, lat, lon, device_name || null, isStarlinkVal, satType, terrType]
      );
      // Redis cache'i temizle — yeni şehir webhook'ta hemen eşleşsin
      const cacheKeys = [`cityid:${name.toUpperCase()}`];
      if (device_name) cacheKeys.push(`cityid:${device_name.toUpperCase()}`);
      await Promise.all(cacheKeys.map(k => redis.del(k)));
      return reply.status(201).send(rows[0]);
    } catch {
      // DeviceName/IsStarlink kolonu henüz yoksa onsuz ekle
      try {
        const { rows } = await fastify.pg.query(
          'INSERT INTO Cities (CityName, KITA, ULKE, IL, TURU, ENLEM, BOYLAM) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING CityID as id, CityName as name, KITA as continent, ULKE as country, IL as city, TURU as type, ENLEM as lat, BOYLAM as lon, NULL as device_name, FALSE as is_starlink',
          [name, continent, country, city, type, lat, lon]
        );
        return reply.status(201).send(rows[0]);
      } catch (err2) {
        fastify.log.error(err2);
        return reply.status(500).send({ error: 'DB Error' });
      }
    }
  });

  fastify.post('/api/cities/bulk', async (request, reply) => {
    const rows = request.body as Array<{
      name: string; continent?: string; country?: string; city?: string;
      type?: string; device_name?: string; lat?: number | null; lon?: number | null;
      satellite_type?: string | null; terrestrial_type?: string | null;
    }>;
    if (!Array.isArray(rows) || rows.length === 0)
      return reply.status(400).send({ error: 'empty body' });

    const results: { success: number; inserted: string[]; errors: Array<{ row: string; error: string }> } =
      { success: 0, inserted: [], errors: [] };

    for (const row of rows) {
      if (!row.name?.trim()) {
        results.errors.push({ row: String(row.name ?? '?'), error: 'Misyon adı boş olamaz' });
        continue;
      }
      const satType = row.satellite_type?.trim() || null;
      const terrType = row.terrestrial_type?.trim() || null;
      const isStarlink = satType === 'starlink';
      try {
        await fastify.pg.query(
          `INSERT INTO Cities (CityName, KITA, ULKE, IL, TURU, ENLEM, BOYLAM, DeviceName, IsStarlink, SatelliteType, TerrestrialType)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [row.name.trim(), row.continent || null, row.country || null, row.city || null,
           row.type || null, row.lat ?? null, row.lon ?? null,
           row.device_name?.trim() || null, isStarlink, satType, terrType]
        );
        const keys = [`cityid:${row.name.toUpperCase()}`];
        if (row.device_name) keys.push(`cityid:${row.device_name.toUpperCase()}`);
        await Promise.all(keys.map(k => redis.del(k)));
        results.success++;
        results.inserted.push(row.name.trim());
      } catch (e: any) {
        results.errors.push({ row: row.name, error: e.detail ?? e.message ?? 'DB Error' });
      }
    }

    return reply.status(200).send(results);
  });

  fastify.put('/api/cities/:id', async (request, reply) => {
    const { id } = request.params as any;
    const { name, continent, country, city, type, lat, lon, device_name, is_starlink, satellite_type, terrestrial_type } = request.body as any;
    const satType = satellite_type || null;
    const terrType = terrestrial_type || null;
    const isStarlinkVal = satType === 'starlink' ? true : (is_starlink ?? false);
    try {
      const { rows } = await fastify.pg.query(
        'UPDATE Cities SET CityName=$1, KITA=$2, ULKE=$3, IL=$4, TURU=$5, ENLEM=$6, BOYLAM=$7, DeviceName=$8, IsStarlink=$9, SatelliteType=$10, TerrestrialType=$11 WHERE CityID=$12 RETURNING CityID as id, CityName as name, KITA as continent, ULKE as country, IL as city, TURU as type, ENLEM as lat, BOYLAM as lon, DeviceName as device_name, IsStarlink as is_starlink, SatelliteType as satellite_type, TerrestrialType as terrestrial_type',
        [name, continent, country, city, type, lat, lon, device_name || null, isStarlinkVal, satType, terrType, id]
      );
      if (!rows.length) return reply.status(404).send({ error: 'Not found' });
      // Redis cache'i temizle — değişen cihaz adı bir sonraki webhook'ta geçerli olsun
      const cacheKeys = [`cityid:${name.toUpperCase()}`];
      if (device_name) cacheKeys.push(`cityid:${device_name.toUpperCase()}`);
      await Promise.all(cacheKeys.map(k => redis.del(k)));
      return rows[0];
    } catch {
      // DeviceName/IsStarlink kolonu henüz yoksa onsuz güncelle
      try {
        const { rows } = await fastify.pg.query(
          'UPDATE Cities SET CityName=$1, KITA=$2, ULKE=$3, IL=$4, TURU=$5, ENLEM=$6, BOYLAM=$7 WHERE CityID=$8 RETURNING CityID as id, CityName as name, KITA as continent, ULKE as country, IL as city, TURU as type, ENLEM as lat, BOYLAM as lon, NULL as device_name, FALSE as is_starlink, NULL as satellite_type, NULL as terrestrial_type',
          [name, continent, country, city, type, lat, lon, id]
        );
        if (!rows.length) return reply.status(404).send({ error: 'Not found' });
        return rows[0];
      } catch (err2) {
        fastify.log.error(err2);
        return reply.status(500).send({ error: 'DB Error' });
      }
    }
  });

  fastify.delete('/api/cities/:id', async (request, reply) => {
    const { id } = request.params as any;
    const numId = Number(id);
    if (!numId || isNaN(numId)) return reply.status(400).send({ error: 'Geçersiz ID' });
    try {
      // SpeedStats'taki bağlı kayıtları önce temizle (FK constraint)
      // Silinecek şehrin adını ve cihaz adını cache temizliği için önce al
      const cityRes = await fastify.pg.query<{ cityname: string; devicename: string | null }>(
        'SELECT CityName as cityname, DeviceName as devicename FROM Cities WHERE CityID = $1', [numId]
      );
      await fastify.pg.query('DELETE FROM SpeedStats WHERE CityID = $1', [numId]);
      // Cities'den sil
      const result = await fastify.pg.query('DELETE FROM Cities WHERE CityID = $1 RETURNING CityID', [numId]);
      if (result.rowCount === 0) return reply.status(404).send({ error: 'Misyon bulunamadı' });
      // Redis cache'i temizle
      if (cityRes.rows.length) {
        const { cityname, devicename } = cityRes.rows[0];
        const cacheKeys = [`cityid:${cityname.toUpperCase()}`];
        if (devicename) cacheKeys.push(`cityid:${devicename.toUpperCase()}`);
        await Promise.all(cacheKeys.map(k => redis.del(k)));
      }
      fastify.log.info(`Misyon silindi: CityID=${numId}, ${result.rowCount} SpeedStats kaydı ile birlikte.`);
      return { success: true, deletedId: numId };
    } catch (err) {
      fastify.log.error(err, 'Misyon silme hatası');
      return reply.status(500).send({ error: 'Silme işlemi başarısız oldu.' });
    }
  });

  // ─── SDWAN API ───────────────────────────────────────────────────────────────

  /** Manuel SDWAN veri enjeksiyonu — FortiGate webhook olmadan test için.
   *  Body: { deviceName: string, members: [{seqId, interfaceName, cost?}], activeMemberSeq?: number } */
  fastify.post('/api/sdwan/inject', async (request, reply) => {
    const body = request.body as any;
    const { deviceName, members, activeMemberSeq } = body || {};
    if (!deviceName || !Array.isArray(members) || members.length === 0) {
      return reply.status(400).send({ error: 'deviceName ve members[] gerekli' });
    }
    try {
      const cityId = await findCityId(String(deviceName));
      if (!cityId) return reply.status(400).send({ status: 'UNKNOWN_DEVICE', device: deviceName });

      for (const m of members) {
        await fastify.pg.query(
          `INSERT INTO SdwanMembers (CityID, SeqID, InterfaceName, Cost, UpdatedAt)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (CityID, SeqID) DO UPDATE
             SET InterfaceName = EXCLUDED.InterfaceName, Cost = EXCLUDED.Cost, UpdatedAt = NOW()`,
          [cityId, m.seqId, m.interfaceName, m.cost ?? null]
        );
      }

      let activeInterface: string | null = null;
      if (activeMemberSeq != null) {
        const found = members.find((m: any) => m.seqId === activeMemberSeq);
        activeInterface = found?.interfaceName ?? null;

        const prevRes = await fastify.pg.query<{ activeinterface: string }>(
          `SELECT ActiveInterface FROM SdwanStatus WHERE CityID = $1`, [cityId]
        );
        const prevInterface = prevRes.rows[0]?.activeinterface ?? null;

        await fastify.pg.query(
          `INSERT INTO SdwanStatus (CityID, ActiveSeqID, ActiveInterface, UpdatedAt)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (CityID) DO UPDATE
             SET ActiveSeqID = EXCLUDED.ActiveSeqID, ActiveInterface = EXCLUDED.ActiveInterface, UpdatedAt = NOW()`,
          [cityId, activeMemberSeq, activeInterface]
        );

        if (prevInterface !== activeInterface) {
          await fastify.pg.query(
            `INSERT INTO SdwanHistory (CityID, FromInterface, ToInterface, ActiveSeqID) VALUES ($1, $2, $3, $4)`,
            [cityId, prevInterface, activeInterface, activeMemberSeq]
          );
        }
      }

      await redis.publish('speedtest_updates', JSON.stringify({
        type: 'sdwan_combined', cityId, deviceName, members, activeMemberSeq, activeInterface,
        time: new Date().toISOString(),
      }));

      fastify.log.info(`SDWAN inject: ${deviceName} → ${members.length} üye, activeSeq=${activeMemberSeq}`);
      return reply.send({ status: 'OK', cityId, deviceName, members, activeMemberSeq, activeInterface });
    } catch (err) {
      fastify.log.error(err, 'SDWAN inject error');
      return reply.status(500).send({ error: 'DB error' });
    }
  });

  // SDWAN geçiş geçmişi
  fastify.get('/api/sdwan/history', async (request, reply) => {
    const { cityId, limit = 200 } = request.query as { cityId?: string; limit?: number };
    try {
      let query = `
        SELECT h.ID as id, h.CityID as city_id, c.CityName as city_name,
               h.FromInterface as from_interface, h.ToInterface as to_interface,
               h.ActiveSeqID as active_seq_id, h.RecordedAt as recorded_at
        FROM SdwanHistory h
        JOIN Cities c ON c.CityID = h.CityID
      `;
      const params: any[] = [];
      if (cityId) { query += ` WHERE h.CityID = $1`; params.push(Number(cityId)); }
      query += ` ORDER BY h.RecordedAt DESC LIMIT $${params.length + 1}`;
      params.push(Number(limit));
      const { rows } = await fastify.pg.query(query, params);
      return reply.send(rows);
    } catch (err) {
      fastify.log.error(err, 'SDWAN history API error');
      return reply.status(500).send({ error: 'SDWAN geçmiş alınamadı' });
    }
  });

  // Tüm misyonların SDWAN durumunu tek sorguda döndür
  fastify.get('/api/sdwan', async (_request, reply) => {
    try {
      const res = await fastify.pg.query(`
        SELECT
          c.CityID   as city_id,
          c.CityName as city_name,
          ss.ActiveSeqID     as active_seq_id,
          ss.ActiveInterface as active_interface,
          ss.UpdatedAt       as updated_at,
          json_agg(
            json_build_object(
              'seq_id',   sm.SeqID,
              'interface', sm.InterfaceName,
              'cost',     sm.Cost
            ) ORDER BY sm.SeqID
          ) FILTER (WHERE sm.ID IS NOT NULL) as members
        FROM Cities c
        LEFT JOIN SdwanStatus  ss ON ss.CityID = c.CityID
        LEFT JOIN SdwanMembers sm ON sm.CityID = c.CityID
        GROUP BY c.CityID, c.CityName, ss.ActiveSeqID, ss.ActiveInterface, ss.UpdatedAt
        ORDER BY c.CityID
      `);
      return reply.send(res.rows);
    } catch (err) {
      fastify.log.error(err, 'SDWAN API error');
      return reply.status(500).send({ error: 'SDWAN veri alınamadı' });
    }
  });

  fastify.addHook('onReady', async function () {
    // ── Auto-migration: eksik kolonları ekle ──
    try {
      await fastify.pg.query(`
        ALTER TABLE Cities ADD COLUMN IF NOT EXISTS DeviceName VARCHAR(100);
      `);
      await fastify.pg.query(`
        ALTER TABLE Cities ADD COLUMN IF NOT EXISTS IsStarlink BOOLEAN NOT NULL DEFAULT FALSE;
      `);
      await fastify.pg.query(`
        ALTER TABLE Cities ADD COLUMN IF NOT EXISTS SatelliteType VARCHAR(50) DEFAULT NULL;
      `);
      await fastify.pg.query(`
        UPDATE Cities SET SatelliteType = 'starlink' WHERE IsStarlink = TRUE AND SatelliteType IS NULL;
      `);
      await fastify.pg.query(`
        ALTER TABLE Cities ADD COLUMN IF NOT EXISTS TerrestrialType VARCHAR(50) DEFAULT NULL;
      `);
      await fastify.pg.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_cities_devicename
          ON Cities (UPPER(DeviceName))
          WHERE DeviceName IS NOT NULL AND DeviceName <> '';
      `);
      fastify.log.info('Migration OK: Cities.DeviceName + SatelliteType kolonları hazır.');
    } catch (err) {
      fastify.log.error(err, 'Migration failed: Cities.DeviceName');
    }
    // ── SDWAN tabloları (her ifadeyi ayrı query ile çalıştır) ──
    try {
      await fastify.pg.query(`
        CREATE TABLE IF NOT EXISTS SdwanMembers (
          ID        SERIAL  PRIMARY KEY,
          CityID    INTEGER REFERENCES Cities(CityID) ON DELETE CASCADE,
          SeqID     INTEGER NOT NULL,
          InterfaceName VARCHAR(100) NOT NULL,
          Cost      INTEGER,
          UpdatedAt TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE (CityID, SeqID)
        )
      `);
      await fastify.pg.query(`
        CREATE TABLE IF NOT EXISTS SdwanStatus (
          CityID          INTEGER PRIMARY KEY REFERENCES Cities(CityID) ON DELETE CASCADE,
          ActiveSeqID     INTEGER,
          ActiveInterface VARCHAR(100),
          UpdatedAt       TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await fastify.pg.query(`
        CREATE TABLE IF NOT EXISTS SdwanHistory (
          ID              SERIAL PRIMARY KEY,
          CityID          INTEGER REFERENCES Cities(CityID) ON DELETE CASCADE,
          FromInterface   VARCHAR(100),
          ToInterface     VARCHAR(100),
          ActiveSeqID     INTEGER,
          RecordedAt      TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await fastify.pg.query(`
        CREATE INDEX IF NOT EXISTS idx_sdwanhistory_city ON SdwanHistory (CityID, RecordedAt DESC)
      `);
      fastify.log.info('Migration OK: SdwanMembers + SdwanStatus + SdwanHistory tabloları hazır.');
    } catch (err) {
      fastify.log.error(err, 'Migration failed: SDWAN tables');
    }
    // ── Log temizleme — pg hazır olduktan sonra çalıştır ──
    if (!opts.testing) {
      purgeOldLogs();
      setInterval(purgeOldLogs, 24 * 60 * 60 * 1000);
    }
    // ── Index doğrulama ──
    try {
      await fastify.pg.query(`
        CREATE INDEX IF NOT EXISTS idx_speedstats_perf ON SpeedStats(MeasuredAt DESC, CityID, VpnTypeID);
        CREATE INDEX IF NOT EXISTS idx_speedstats_dl ON SpeedStats(DownloadSpeed DESC);
        CREATE INDEX IF NOT EXISTS idx_speedstats_ul ON SpeedStats(UploadSpeed DESC);
      `);
      fastify.log.info('PostgreSQL SpeedStats indexing verification complete.');
    } catch (err) {
      fastify.log.error(err, 'DB Index creation failed');
    }
  });

  return fastify;
}
