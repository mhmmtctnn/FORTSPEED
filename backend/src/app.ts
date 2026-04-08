import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import postgres from '@fastify/postgres';
import websocket from '@fastify/websocket';
import Redis from 'ioredis';
import { registerItaiMiddleware } from './middleware/itai';
import { convertToMbps, resolveVpnType, parseSpeedTestBody, detectPayloadType, parseSdwanMembers, parseSdwanStatus } from './helpers/webhook-parser';

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

  fastify.addHook('onRequest', async (request, reply) => {
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

  /** Cihaz adına göre CityID bul — DeviceName önce, CityName fallback */
  const findCityId = async (deviceName: string): Promise<number | null> => {
    const res = await fastify.pg.query<{ cityid: number }>(
      `SELECT CityID FROM Cities
       WHERE (DeviceName IS NOT NULL AND DeviceName <> '' AND UPPER(DeviceName) = UPPER($1))
          OR (COALESCE(DeviceName, '') = '' AND UPPER(CityName) = UPPER($1))
       LIMIT 1`,
      [deviceName]
    );
    return res.rows.length > 0 ? res.rows[0].cityid : null;
  };

  // Handle various possible paths Fortigate might use
  const webhookHandler = async (request: any, reply: any) => {
    const rawBody = (request.body as string) || '';
    const payloadType = detectPayloadType(rawBody);

    fastify.log.info(`Webhook recv: type=${payloadType}`);

    // ── Log raw webhook — sadece speedtest ve unknown tipler WebhookLogs'a gider
    // SDWAN payload'ları kendi tablolarına (SdwanMembers/SdwanStatus) kaydedilir
    const isSdwan = payloadType === 'sdwan_members' || payloadType === 'sdwan_status' || payloadType === 'sdwan_combined';
    if (!isSdwan) {
      try {
        await fastify.pg.query(
          `INSERT INTO WebhookLogs (SourceIP, RawPayload, ParsedContext) VALUES ($1, $2, $3)`,
          [request.ip || 'UNKNOWN', rawBody, JSON.stringify({ payloadType })]
        );
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

        // Upsert status
        if (activeMemberSeq !== null) {
          await fastify.pg.query(
            `INSERT INTO SdwanStatus (CityID, ActiveSeqID, ActiveInterface, UpdatedAt)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (CityID) DO UPDATE
               SET ActiveSeqID = EXCLUDED.ActiveSeqID, ActiveInterface = EXCLUDED.ActiveInterface, UpdatedAt = NOW()`,
            [cityId, activeMemberSeq, activeInterface]
          );
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
        if (!deviceName || activeMemberSeq === null) {
          return reply.status(400).send({ status: 'PARSE_ERROR', message: 'SDWAN status parse edilemedi' });
        }
        const cityId = await findCityId(deviceName);
        if (!cityId) {
          return reply.status(400).send({ status: 'UNKNOWN_DEVICE', device: deviceName });
        }

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

      // WebhookLog'u tam parsed veri ile güncelle
      try {
        await fastify.pg.query(
          `UPDATE WebhookLogs SET ParsedContext = $1 WHERE WebhookLogID = (SELECT MAX(WebhookLogID) FROM WebhookLogs WHERE SourceIP = $2)`,
          [JSON.stringify({ ...parsed, payloadType: 'speedtest' }), request.ip || 'UNKNOWN']
        );
      } catch (_) { /* sessizce geç */ }

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

      if (downloadMbps === null || uploadMbps === null) {
        const missingField = downloadMbps === null && uploadMbps === null
          ? 'download ve upload'
          : downloadMbps === null ? 'download' : 'upload';
        const skipMsg = `Hız testi başarısız (${deviceName} / ${vpnTypeName}) — ${missingField} değeri alınamadı, SpeedStats'a yazılmadı.`;
        fastify.log.warn(skipMsg);
        await dbLog('WARN', skipMsg, { deviceName, vpnName: parsed.vpnName, missingField, rawBody: rawBody.slice(0, 200) });
        return reply.status(200).send({ status: 'SKIPPED', missing: missingField, device: deviceName, timestamp: new Date().toISOString() });
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

      await redis.publish('speedtest_updates', JSON.stringify({
        type: 'speedtest',
        cityId, vpnTypeId, vpnTypeName,
        download: downloadMbps, upload: uploadMbps,
        latency: latencyMs, deviceName,
        time: new Date().toISOString(),
      }));

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

  // ─── Logs API ───────────────────────────────────────────────────────────────
  fastify.get('/api/logs/system', async (request, reply) => {
    const { severity } = request.query as any;
    try {
      let query = `SELECT * FROM SystemLogs`;
      const params: any[] = [];
      if (severity && severity !== 'ALL') {
        query += ` WHERE Severity = $1`;
        params.push(severity);
      }
      query += ` ORDER BY CreatedAt DESC LIMIT 100`;
      const res = await fastify.pg.query(query, params);
      return reply.send(res.rows);
    } catch (err: any) {
      fastify.log.error(err, 'Failed to fetch SystemLogs');
      return reply.status(500).send({ error: 'Failed to fetch logs' });
    }
  });

  fastify.get('/api/logs/webhooks', async (request, reply) => {
    try {
      const res = await fastify.pg.query(`SELECT * FROM WebhookLogs ORDER BY CreatedAt DESC LIMIT 100`);
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

  // Debug: Son gelen webhook'u ve parse sonucunu göster
  fastify.get('/api/debug/webhook-last', async (_req, reply) => {
    try {
      const logs = await fastify.pg.query(
        `SELECT SourceIP, RawPayload, ParsedContext, CreatedAt
         FROM WebhookLogs ORDER BY CreatedAt DESC LIMIT 5`
      );
      const stats = await fastify.pg.query(
        `SELECT ss.StatID, c.CityName, vt.VpnTypeName, ss.DownloadSpeed, ss.UploadSpeed, ss.MeasuredAt
         FROM SpeedStats ss
         JOIN Cities c ON ss.CityID = c.CityID
         JOIN VpnTypes vt ON ss.VpnTypeID = vt.VpnTypeID
         ORDER BY ss.MeasuredAt DESC LIMIT 5`
      );
      const vpnTypes = await fastify.pg.query(
        `SELECT VpnTypeID, VpnTypeName FROM VpnTypes ORDER BY VpnTypeID`
      );
      return reply.send({
        recentWebhooks: logs.rows,
        recentSpeedStats: stats.rows,
        vpnTypes: vpnTypes.rows,
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
      await redis.publish('speedtest_updates', JSON.stringify({
        cityId, vpnTypeId, download: downloadSpeed, upload: uploadSpeed,
        latency: latency || 0.0, deviceName, time: new Date(),
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
      const continents = await fastify.pg.query('SELECT DISTINCT KITA FROM Cities WHERE KITA IS NOT NULL ORDER BY KITA');
      const countries  = await fastify.pg.query('SELECT DISTINCT ULKE FROM Cities WHERE ULKE IS NOT NULL ORDER BY ULKE');
      const vpnTypes   = await fastify.pg.query('SELECT DISTINCT VpnTypeName FROM VpnTypes ORDER BY VpnTypeName');
      return {
        continents: continents.rows.map((r: any) => r.kita),
        countries:  countries.rows.map((r: any) => r.ulke),
        vpnTypes:   vpnTypes.rows.map((r: any) => r.vpntypename),
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });
  // 13. Sparklines History
  fastify.get('/api/reports/sparklines', async (_request, reply) => {
    try {
      const queryDaily = `SELECT CityID as cid, VpnTypeID as vid, DATE_TRUNC('hour', MeasuredAt) as ts, AVG(DownloadSpeed) as dl, AVG(UploadSpeed) as ul FROM SpeedStats WHERE MeasuredAt > NOW() - INTERVAL '24 hours' GROUP BY CityID, VpnTypeID, DATE_TRUNC('hour', MeasuredAt) ORDER BY ts ASC`;
      const queryWeekly = `SELECT CityID as cid, VpnTypeID as vid, DATE_TRUNC('day', MeasuredAt) as ts, AVG(DownloadSpeed) as dl, AVG(UploadSpeed) as ul FROM SpeedStats WHERE MeasuredAt > NOW() - INTERVAL '7 days' GROUP BY CityID, VpnTypeID, DATE_TRUNC('day', MeasuredAt) ORDER BY ts ASC`;
      const queryMonthly = `SELECT CityID as cid, VpnTypeID as vid, DATE_TRUNC('day', MeasuredAt) as ts, AVG(DownloadSpeed) as dl, AVG(UploadSpeed) as ul FROM SpeedStats WHERE MeasuredAt > NOW() - INTERVAL '30 days' GROUP BY CityID, VpnTypeID, DATE_TRUNC('day', MeasuredAt) ORDER BY ts ASC`;

      const [resD, resW, resM] = await Promise.all([
        fastify.pg.query(queryDaily),
        fastify.pg.query(queryWeekly),
        fastify.pg.query(queryMonthly)
      ]);

      const data: Record<string, Record<string, any>> = {};
      
      const processRows = (rows: any[], periodName: string) => {
         rows.forEach(r => {
            const cid = String(r.cid);
            const vid = r.vid === 1 ? 'METRO' : r.vid === 2 ? 'GSM' : String(r.vid);
            if (!data[cid]) data[cid] = {};
            if (!data[cid][vid]) data[cid][vid] = { daily: [], weekly: [], monthly: [] };
            data[cid][vid][periodName].push({ ts: r.ts, dl: Number(r.dl).toFixed(1), ul: Number(r.ul).toFixed(1) });
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
    const intervalStr = period === 'daily' ? '1 day' : period === 'weekly' ? '7 days' : '30 days';

    const query = `
      SELECT c.CityID as id, c.CityName as name, c.ULKE as country, c.KITA as continent, 
             ss.VpnTypeID as vid,
             AVG(ss.DownloadSpeed) as dl, AVG(ss.UploadSpeed) as ul, COUNT(*) as test_count
      FROM Cities c 
      JOIN SpeedStats ss ON c.CityID = ss.CityID
      WHERE ss.MeasuredAt > NOW() - INTERVAL '${intervalStr}'
        AND ss.DownloadStatus = 'OK' AND ss.UploadStatus = 'OK'
      GROUP BY c.CityID, c.CityName, c.ULKE, c.KITA, ss.VpnTypeID
    `;

    try {
      const { rows } = await fastify.pg.query(query);

      const gsm_arr = rows.filter((r: any) => r.vid === 2).map((r: any) => ({ ...r, dl: Number(r.dl).toFixed(1), ul: Number(r.ul).toFixed(1) }));
      const metro_arr = rows.filter((r: any) => r.vid === 1).map((r: any) => ({ ...r, dl: Number(r.dl).toFixed(1), ul: Number(r.ul).toFixed(1) }));

      const top_gsm_dl = [...gsm_arr].sort((a: any, b: any) => Number(b.dl) - Number(a.dl)).slice(0, 10);
      const top_gsm_ul = [...gsm_arr].sort((a: any, b: any) => Number(b.ul) - Number(a.ul)).slice(0, 10);
      
      const top_metro_dl = [...metro_arr].sort((a: any, b: any) => Number(b.dl) - Number(a.dl)).slice(0, 10);
      const top_metro_ul = [...metro_arr].sort((a: any, b: any) => Number(b.ul) - Number(a.ul)).slice(0, 10);
      
      const bottlenecks = rows.filter((r: any) => {
        const dl = Number(r.dl);
        const ul = Number(r.ul);
        if (dl < 5 && ul < 5) return false;
        const diff = Math.abs(dl - ul);
        const max = Math.max(dl, ul, 0.001);
        return (diff / max) > 0.8;
      }).map((r: any) => ({ ...r, dl: Number(r.dl).toFixed(1), ul: Number(r.ul).toFixed(1) })).sort((a: any, b: any) => Number(b.dl) - Number(a.dl)).slice(0, 15);
      
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

      return { top_gsm_dl, top_gsm_ul, top_metro_dl, top_metro_ul, bottlenecks, top_continents };
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });

  // 12. Cities CRUD
  fastify.get('/api/cities', async (_request, reply) => {
    // CityID'ye göre sıralı dönür — Misyon Yönetiminde ID sıralı görünür
    const withDeviceName = 'SELECT CityID as id, CityName as name, KITA as continent, ULKE as country, IL as city, TURU as type, ENLEM as lat, BOYLAM as lon, DeviceName as device_name FROM Cities ORDER BY CityID ASC';
    const withoutDeviceName = 'SELECT CityID as id, CityName as name, KITA as continent, ULKE as country, IL as city, TURU as type, ENLEM as lat, BOYLAM as lon, NULL as device_name FROM Cities ORDER BY CityID ASC';
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
    const { name, continent, country, city, type, lat, lon, device_name } = request.body as any;
    if (!name) return reply.status(400).send({ error: 'name is required' });
    try {
      const { rows } = await fastify.pg.query(
        'INSERT INTO Cities (CityName, KITA, ULKE, IL, TURU, ENLEM, BOYLAM, DeviceName) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING CityID as id, CityName as name, KITA as continent, ULKE as country, IL as city, TURU as type, ENLEM as lat, BOYLAM as lon, DeviceName as device_name',
        [name, continent, country, city, type, lat, lon, device_name || null]
      );
      return reply.status(201).send(rows[0]);
    } catch {
      // DeviceName kolonu henüz yoksa onsuz ekle
      try {
        const { rows } = await fastify.pg.query(
          'INSERT INTO Cities (CityName, KITA, ULKE, IL, TURU, ENLEM, BOYLAM) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING CityID as id, CityName as name, KITA as continent, ULKE as country, IL as city, TURU as type, ENLEM as lat, BOYLAM as lon, NULL as device_name',
          [name, continent, country, city, type, lat, lon]
        );
        return reply.status(201).send(rows[0]);
      } catch (err2) {
        fastify.log.error(err2);
        return reply.status(500).send({ error: 'DB Error' });
      }
    }
  });

  fastify.put('/api/cities/:id', async (request, reply) => {
    const { id } = request.params as any;
    const { name, continent, country, city, type, lat, lon, device_name } = request.body as any;
    try {
      const { rows } = await fastify.pg.query(
        'UPDATE Cities SET CityName=$1, KITA=$2, ULKE=$3, IL=$4, TURU=$5, ENLEM=$6, BOYLAM=$7, DeviceName=$8 WHERE CityID=$9 RETURNING CityID as id, CityName as name, KITA as continent, ULKE as country, IL as city, TURU as type, ENLEM as lat, BOYLAM as lon, DeviceName as device_name',
        [name, continent, country, city, type, lat, lon, device_name || null, id]
      );
      if (!rows.length) return reply.status(404).send({ error: 'Not found' });
      return rows[0];
    } catch {
      // DeviceName kolonu henüz yoksa onsuz güncelle
      try {
        const { rows } = await fastify.pg.query(
          'UPDATE Cities SET CityName=$1, KITA=$2, ULKE=$3, IL=$4, TURU=$5, ENLEM=$6, BOYLAM=$7 WHERE CityID=$8 RETURNING CityID as id, CityName as name, KITA as continent, ULKE as country, IL as city, TURU as type, ENLEM as lat, BOYLAM as lon, NULL as device_name',
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
      await fastify.pg.query('DELETE FROM SpeedStats WHERE CityID = $1', [numId]);
      // Cities'den sil
      const result = await fastify.pg.query('DELETE FROM Cities WHERE CityID = $1 RETURNING CityID', [numId]);
      if (result.rowCount === 0) return reply.status(404).send({ error: 'Misyon bulunamadı' });
      fastify.log.info(`Misyon silindi: CityID=${numId}, ${result.rowCount} SpeedStats kaydı ile birlikte.`);
      return { success: true, deletedId: numId };
    } catch (err) {
      fastify.log.error(err, 'Misyon silme hatası');
      return reply.status(500).send({ error: 'Silme işlemi başarısız oldu.' });
    }
  });

  // ─── SDWAN API ───────────────────────────────────────────────────────────────
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
        CREATE UNIQUE INDEX IF NOT EXISTS idx_cities_devicename
          ON Cities (UPPER(DeviceName))
          WHERE DeviceName IS NOT NULL AND DeviceName <> '';
      `);
      fastify.log.info('Migration OK: Cities.DeviceName kolonu hazır.');
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
      fastify.log.info('Migration OK: SdwanMembers + SdwanStatus tabloları hazır.');
    } catch (err) {
      fastify.log.error(err, 'Migration failed: SDWAN tables');
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
