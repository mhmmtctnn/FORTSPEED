import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { DbLogFn } from '../helpers/db-log';
import { FindCityIdFn } from '../helpers/find-city-id';
import {
  convertToMbps, resolveVpnType, parseSpeedTestBody, detectPayloadType,
  parseSdwanMembers, parseSdwanStatus, parseSdwanJson, parsePayloadTimestamp,
  parseSdwanLinkState,
} from '../helpers/webhook-parser';

interface WebhookRingEntry {
  ts: string; method: string; url: string; type: string; bodySnippet: string; ip: string;
}

export async function registerWebhookRoutes(
  fastify: FastifyInstance,
  redis: Redis,
  dbLog: DbLogFn,
  findCityId: FindCityIdFn,
  testing: boolean,
): Promise<void> {
  const webhookStats = { total: 0, today: 0, lastDay: '' };
  const webhookRing: WebhookRingEntry[] = [];

  function trackWebhookStat() {
    const today = new Date().toISOString().split('T')[0];
    if (webhookStats.lastDay === today) { webhookStats.today++; }
    else { webhookStats.today = 1; webhookStats.lastDay = today; }
    webhookStats.total++;
  }

  // Normalize content-type for webhook paths so Fastify parses body as plain text
  fastify.addHook('onRequest', async (request, _reply) => {
    const url = request.url ?? '';
    if (url.startsWith('/webhook') || url.startsWith('/api/webhook')) {
      request.headers['content-type'] = 'text/plain; charset=utf-8';
    }
  });

  const webhookHandler = async (request: any, reply: any) => {
    const rawBody = (request.body as string) || '';
    const payloadType = detectPayloadType(rawBody);
    const queryDevice = (request.query as any)?.device || (request.query as any)?.deviceName || null;

    fastify.log.info(`Webhook recv: type=${payloadType} len=${rawBody.length} queryDevice=${queryDevice}`);

    const isSdwan = payloadType === 'sdwan_members' || payloadType === 'sdwan_status' || payloadType === 'sdwan_combined' || payloadType === 'sdwan_json' || payloadType === 'sdwan_linkstate';

    if (!isSdwan) {
      webhookRing.push({
        ts: new Date().toISOString(),
        method: request.method,
        url: request.url,
        type: payloadType,
        bodySnippet: rawBody.slice(0, 600),
        ip: request.ip || 'UNKNOWN',
      });
      if (webhookRing.length > 10) webhookRing.shift();
    }
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

    // ── SDWAN COMBINED ────────────────────────────────────────────────────────
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
        }

        if (activeMemberSeq !== null) {
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

          if (prevInterface !== activeInterface && activeInterface !== null) {
            await fastify.pg.query(
              `INSERT INTO SdwanHistory (CityID, FromInterface, ToInterface, ActiveSeqID)
               SELECT $1, $2::varchar, $3::varchar, $4
               WHERE COALESCE($2::varchar, '') <> $3::varchar
                 AND NOT EXISTS (
                   SELECT 1 FROM SdwanHistory
                   WHERE CityID = $1
                     AND COALESCE(FromInterface, '') = COALESCE($2::varchar, '')
                     AND ToInterface = $3::varchar
                     AND RecordedAt > NOW() - INTERVAL '2 minutes'
                 )`,
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

    // ── SDWAN JSON ────────────────────────────────────────────────────────────
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
          if (prevInterface !== activeInterface && activeInterface !== null) {
            await fastify.pg.query(
              `INSERT INTO SdwanHistory (CityID, FromInterface, ToInterface, ActiveSeqID)
               SELECT $1, $2::varchar, $3::varchar, $4
               WHERE COALESCE($2::varchar, '') <> $3::varchar
                 AND NOT EXISTS (
                   SELECT 1 FROM SdwanHistory
                   WHERE CityID = $1
                     AND COALESCE(FromInterface, '') = COALESCE($2::varchar, '')
                     AND ToInterface = $3::varchar
                     AND RecordedAt > NOW() - INTERVAL '2 minutes'
                 )`,
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
        const deviceName      = parsed2.deviceName || queryDevice;
        const activeMemberSeq = parsed2.activeMemberSeq;
        if (!deviceName) {
          fastify.log.warn(`SDWAN status PARSE_ERROR: deviceName null queryDevice=${queryDevice}`);
          return reply.status(400).send({ status: 'PARSE_ERROR', message: 'SDWAN status parse edilemedi. URL\'ye ?device=CIHAZ_ADI ekleyin.' });
        }
        if (activeMemberSeq === null) {
          fastify.log.info(`SDWAN status komut satırı alındı (veri yok): device=${deviceName}`);
          return reply.send({ status: 'OK', type: 'sdwan_cmd', device: deviceName, note: 'command received, no data' });
        }
        const cityId = await findCityId(deviceName);
        if (!cityId) {
          return reply.status(400).send({ status: 'UNKNOWN_DEVICE', device: deviceName });
        }

        const prevRes2 = await fastify.pg.query<{ activeinterface: string }>(
          `SELECT ActiveInterface FROM SdwanStatus WHERE CityID = $1`, [cityId]
        );
        const prevInterface2 = prevRes2.rows[0]?.activeinterface ?? null;

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

        if (prevInterface2 !== activeInterface && activeInterface !== null) {
          await fastify.pg.query(
            `INSERT INTO SdwanHistory (CityID, FromInterface, ToInterface, ActiveSeqID)
             SELECT $1, $2::varchar, $3::varchar, $4
             WHERE COALESCE($2::varchar, '') <> $3::varchar
               AND NOT EXISTS (
                 SELECT 1 FROM SdwanHistory
                 WHERE CityID = $1
                   AND COALESCE(FromInterface, '') = COALESCE($2::varchar, '')
                   AND ToInterface = $3::varchar
                   AND RecordedAt > NOW() - INTERVAL '2 minutes'
               )`,
            [cityId, prevInterface2, activeInterface, activeMemberSeq]
          );
        }
        fastify.log.info(`SDWAN status güncellendi: ${deviceName} → seq=${activeMemberSeq} (${activeInterface ?? '?'})`);

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

    // ── SDWAN LINKSTATE ───────────────────────────────────────────────────────
    if (payloadType === 'sdwan_linkstate') {
      try {
        const events = parseSdwanLinkState(rawBody);
        let processed = 0;
        for (const ev of events) {
          if (!ev.deviceName || !ev.interface || !ev.newState) continue;
          const cityId = await findCityId(ev.deviceName);
          if (!cityId) {
            fastify.log.warn(`SDWAN linkstate UNKNOWN_DEVICE: ${ev.deviceName}`);
            continue;
          }
          // Dedup: DB'deki en son state zaten aynıysa (dead→dead veya alive→alive) blokla.
          // Farklı bir state geldiyse (alive→dead veya dead→alive) her zaman geçir.
          await fastify.pg.query(
            `INSERT INTO SdwanLinkEvents (CityID, Interface, OldState, NewState, EventAt)
             SELECT $1, $2::varchar, $3::varchar, $4::varchar, $5
             WHERE NOT EXISTS (
               SELECT 1 FROM SdwanLinkEvents
               WHERE CityID = $1 AND Interface = $2::varchar
                 AND NewState = $4::varchar
                 AND EventAt = (
                   SELECT MAX(EventAt) FROM SdwanLinkEvents
                   WHERE CityID = $1 AND Interface = $2::varchar
                 )
             )`,
            [cityId, ev.interface, ev.oldState ?? null, ev.newState, ev.eventAt ?? new Date()]
          );
          await redis.publish('speedtest_updates', JSON.stringify({
            type: 'sdwan_linkstate', cityId, interface: ev.interface,
            oldState: ev.oldState, newState: ev.newState,
            eventAt: (ev.eventAt ?? new Date()).toISOString(),
          }));
          processed++;
        }
        fastify.log.info(`SDWAN linkstate: ${processed} olay işlendi`);
        return reply.send({ status: 'OK', type: 'sdwan_linkstate', processed });
      } catch (err) {
        fastify.log.error(err, 'SDWAN linkstate DB error');
        return reply.status(500).send({ status: 'Error', message: 'DB error' });
      }
    }

    // ── SPEED TEST ────────────────────────────────────────────────────────────
    try {
      const parsed = parseSpeedTestBody(rawBody);
      const payloadTimestamp = parsePayloadTimestamp(rawBody);
      const deviceName = (parsed.deviceName || queryDevice || '').trim();
      if (!deviceName) {
        const msg = 'SpeedTest payload alındı ancak cihaz adı çıkarılamadı. URL\'ye ?device=CIHAZ_ADI ekleyin.';
        fastify.log.warn(msg);
        await dbLog('WARN', msg, { rawBody: rawBody.slice(0, 400) });
        return reply.status(400).send({ status: 'PARSE_ERROR', message: msg });
      }
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

      if (webhookLogId !== null) {
        try {
          await fastify.pg.query(
            `UPDATE WebhookLogs SET ParsedContext = $1 WHERE WebhookLogID = $2`,
            [JSON.stringify({ ...parsed, payloadType: 'speedtest', payloadTimestamp: payloadTimestamp?.toISOString() ?? null }), webhookLogId]
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
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [cityId, vpnTypeId, deviceName, downloadMbps, uploadMbps, latencyMs, uploadStatus, downloadStatus, payloadTimestamp ?? new Date()]
      );

      if (downloadMbps !== null || uploadMbps !== null) {
        await redis.publish('speedtest_updates', JSON.stringify({
          type: 'speedtest',
          cityId, vpnTypeId, vpnTypeName,
          download: downloadMbps, upload: uploadMbps,
          latency: latencyMs, deviceName,
          time: (payloadTimestamp ?? new Date()).toISOString(),
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

  const webhookRateLimit = { max: testing ? 100000 : 60, timeWindow: '1 minute' };

  // codeql[js/missing-rate-limiting] — @fastify/rate-limit global + per-route config applied
  fastify.post('/api/webhook', { config: { rateLimit: webhookRateLimit } }, webhookHandler);
  fastify.post('/webhook',     { config: { rateLimit: webhookRateLimit } }, webhookHandler);
  fastify.post('/',            { config: { rateLimit: webhookRateLimit } }, webhookHandler);
  fastify.get('/api/webhook',  { config: { rateLimit: webhookRateLimit } }, webhookHandler);
  fastify.get('/webhook',      { config: { rateLimit: webhookRateLimit } }, webhookHandler);

  fastify.get('/api/webhook/stats', async () => webhookStats);

  fastify.get('/api/debug/webhook-last', async (_req, reply) => {
    try {
      const logs = await fastify.pg.query(
        `SELECT SourceIP, RawPayload, ParsedContext, CreatedAt
         FROM WebhookLogs
         WHERE (ParsedContext->>'isSdwan')::boolean IS NOT TRUE
         ORDER BY CreatedAt DESC LIMIT 10`
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
      const lastOk = await fastify.pg.query(
        `SELECT c.CityName, vt.VpnTypeName, ss.DownloadSpeed, ss.MeasuredAt
         FROM SpeedStats ss
         JOIN Cities c ON ss.CityID = c.CityID
         JOIN VpnTypes vt ON ss.VpnTypeID = vt.VpnTypeID
         WHERE ss.DownloadStatus = 'OK'
         ORDER BY ss.MeasuredAt DESC LIMIT 1`
      );
      const dailyCounts = await fastify.pg.query(
        `SELECT DATE(CreatedAt) as day, COUNT(*) as count
         FROM WebhookLogs
         WHERE CreatedAt >= NOW() - INTERVAL '7 days'
           AND (ParsedContext->>'isSdwan')::boolean IS NOT TRUE
         GROUP BY DATE(CreatedAt)
         ORDER BY day DESC`
      );
      return reply.send({
        lastSuccessfulSpeedTest: lastOk.rows[0] ?? null,
        recentWebhooks: logs.rows,
        recentSpeedStats: stats.rows,
        vpnTypes: vpnTypes.rows,
        dailyWebhookCounts: dailyCounts.rows,
        recentRawWebhooks: [...webhookRing].reverse(),
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // codeql[js/missing-rate-limiting] — @fastify/rate-limit global + per-route config applied
  fastify.post('/webhook/speedtest', { config: { rateLimit: { max: testing ? 100000 : 60, timeWindow: '1 minute' } } }, async (request, reply) => {
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
}
