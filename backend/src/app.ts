import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import postgres from '@fastify/postgres';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import Redis from 'ioredis';
import { registerItaiMiddleware } from './middleware/itai';
import { convertToMbps, resolveVpnType, parseSpeedTestBody, detectPayloadType, parseSdwanMembers, parseSdwanStatus, parseSdwanJson } from './helpers/webhook-parser';
import { registerTagRoutes } from './routes/tags';
import { registerCityRoutes } from './routes/cities';
import { registerLogRoutes } from './routes/logs';
import { registerMissionRoutes } from './routes/missions';
import { registerReportRoutes } from './routes/reports';
import { registerSdwanRoutes } from './routes/sdwan';

export interface AppOptions {
  testing?: boolean;
  itaiMode?: boolean;
  pgUrl?: string;
  redisUrl?: string;
  mockPg?: any;
  mockRedis?: any;
}

export async function buildApp(opts: AppOptions = {}): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: opts.testing ? false : true, trustProxy: true });

  fastify.register(cors, { origin: true });

  // Rate limiting — DoS/brute-force koruması
  // Test modunda plugin yine kaydedilir (CodeQL için), ama limit çok yüksektir
  fastify.register(rateLimit, {
    global: true,
    max: opts.testing ? 100000 : 300,   // 5 dakikada normalde 300 istek, testlerde 100000
    timeWindow: '5 minutes',
    allowList: ['127.0.0.1', '::1'], // localhost'tan gelen isteklere limit yok
    errorResponseBuilder: (_req, context) => ({
      status: 'Rate limit exceeded',
      message: `Too many requests. Retry after ${Math.ceil(context.ttl / 1000)}s`,
      retry_after: Math.ceil(context.ttl / 1000),
    }),
  });

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
  // Fastify v5: '*' wildcard geçersiz/eksik Content-Type'ı yakalamıyor.
  // Webhook path'leri için onRequest'te content-type normalize edilir.
  fastify.addHook('onRequest', async (request, _reply) => {
    const url = request.url ?? '';
    if (url.startsWith('/webhook') || url.startsWith('/api/webhook')) {
      request.headers['content-type'] = 'text/plain; charset=utf-8';
    }
  });
  fastify.addContentTypeParser('text/plain', { parseAs: 'string' }, (_req, body, done) => done(null, body));
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
    // FortiGate otomasyon aksiyonları CLI prefix'i eklemez; cihaz adı query param'dan alınabilir
    const queryDevice = (request.query as any)?.device || (request.query as any)?.deviceName || null;

    fastify.log.info(`Webhook recv: type=${payloadType} len=${rawBody.length} queryDevice=${queryDevice}`);

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

    // ── Log raw webhook — TÜM tipler WebhookLogs'a yazılır (tanı amaçlı)
    const isSdwan = payloadType === 'sdwan_members' || payloadType === 'sdwan_status' || payloadType === 'sdwan_combined' || payloadType === 'sdwan_json';
    let webhookLogId: number | null = null;
    try {
      const logRes = await fastify.pg.query<{ webhooklogid: number }>(
        `INSERT INTO WebhookLogs (SourceIP, RawPayload, ParsedContext) VALUES ($1, $2, $3) RETURNING WebhookLogID`,
        [request.ip || 'UNKNOWN', rawBody, JSON.stringify({ payloadType, isSdwan })]
      );
      webhookLogId = logRes.rows[0]?.webhooklogid ?? null;
    } catch (err) {
      fastify.log.error(err, 'Failed to log webhook into WebhookLogs');
    }

    // ── SDWAN COMBINED (members + status aynı body'de) ───────────────────────
    if (payloadType === 'sdwan_combined') {
      try {
        const parsed0 = parseSdwanMembers(rawBody);
        const { activeMemberSeq } = parseSdwanStatus(rawBody);
        const deviceName = parsed0.deviceName || queryDevice;
        const members    = parsed0.members;

        fastify.log.info(`SDWAN combined parse: deviceName=${deviceName} members=${members.length} activeSeq=${activeMemberSeq}`);
        if (!deviceName) {
          fastify.log.warn(`SDWAN combined PARSE_ERROR: deviceName null (queryDevice=${queryDevice})`);
          return reply.status(400).send({ status: 'PARSE_ERROR', message: 'Cihaz adı parse edilemedi. URL\'ye ?device=CIHAZ_ADI ekleyin.' });
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
        const parsed1 = parseSdwanMembers(rawBody);
        const deviceName = parsed1.deviceName || queryDevice;
        const members    = parsed1.members;
        fastify.log.info(`SDWAN members parse: deviceName=${deviceName} members=${members.length} rawLen=${rawBody.length} rawStart=${JSON.stringify(rawBody.slice(0, 300))}`);
        if (!deviceName || members.length === 0) {
          fastify.log.warn(`SDWAN members PARSE_ERROR: deviceName=${deviceName} members=${members.length} queryDevice=${queryDevice}`);
          return reply.status(400).send({ status: 'PARSE_ERROR', message: 'SDWAN members parse edilemedi. URL\'ye ?device=CIHAZ_ADI ekleyin.' });
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
        const parsed2 = parseSdwanStatus(rawBody);
        const deviceName     = parsed2.deviceName || queryDevice;
        const activeMemberSeq = parsed2.activeMemberSeq;
        if (!deviceName) {
          fastify.log.warn(`SDWAN status PARSE_ERROR: deviceName null queryDevice=${queryDevice}`);
          return reply.status(400).send({ status: 'PARSE_ERROR', message: 'SDWAN status parse edilemedi. URL\'ye ?device=CIHAZ_ADI ekleyin.' });
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

  // Webhook route'ları için explicit rate-limit (CodeQL: missing rate limiting)
  // Global limit zaten aktif; burada webhook endpoint'leri için özel sınır tanımlanıyor
  const webhookRateLimit = { max: opts.testing ? 100000 : 60, timeWindow: '1 minute' }; // FortiGate'den dakikada 60 webhook yeterli

  fastify.post('/api/webhook', { config: { rateLimit: webhookRateLimit } }, webhookHandler);
  fastify.post('/webhook',     { config: { rateLimit: webhookRateLimit } }, webhookHandler);
  fastify.post('/',            { config: { rateLimit: webhookRateLimit } }, webhookHandler);
  fastify.get('/api/webhook',  { config: { rateLimit: webhookRateLimit } }, webhookHandler);
  fastify.get('/webhook',      { config: { rateLimit: webhookRateLimit } }, webhookHandler);

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

  // Logs + Activity — routes/logs.ts
  await registerLogRoutes(fastify);

  // Webhook stats endpoint — webhookStats webhook modülünde yaşıyor
  fastify.get('/api/webhook/stats', async () => webhookStats);

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
  fastify.post('/webhook/speedtest', { config: { rateLimit: { max: opts.testing ? 100000 : 60, timeWindow: '1 minute' } } }, async (request, reply) => {
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


  // Missions + Stats ��� routes/missions.ts
  await registerMissionRoutes(fastify);

  // Reporting API — routes/reports.ts
  await registerReportRoutes(fastify);

  // 12. Tags CRUD — routes/tags.ts
  await registerTagRoutes(fastify);

  // 13. Cities CRUD — routes/cities.ts
  await registerCityRoutes(fastify, redis);

  // SDWAN — routes/sdwan.ts
  await registerSdwanRoutes(fastify, redis, findCityId, opts.testing ?? false);

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
      // Tags tablosu ve Cities.MissionTags kolonu
      await fastify.pg.query(`
        CREATE TABLE IF NOT EXISTS Tags (
          ID        SERIAL PRIMARY KEY,
          Name      VARCHAR(100) NOT NULL,
          Color     VARCHAR(20)  NOT NULL DEFAULT '#38bdf8',
          Icon      VARCHAR(20)  NOT NULL DEFAULT '🏷️',
          SortOrder INT          NOT NULL DEFAULT 0
        );
      `);
      await fastify.pg.query(`
        ALTER TABLE Cities ADD COLUMN IF NOT EXISTS MissionTags TEXT DEFAULT NULL;
      `);
      fastify.log.info('Migration OK: Cities.DeviceName + SatelliteType + Tags kolonları hazır.');
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
