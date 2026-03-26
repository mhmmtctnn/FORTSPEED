import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import postgres from '@fastify/postgres';
import websocket from '@fastify/websocket';
import Redis from 'ioredis';

export interface AppOptions {
  testing?: boolean;
  pgUrl?: string;
  redisUrl?: string;
  mockPg?: any;
  mockRedis?: any;
}

export async function buildApp(opts: AppOptions = {}): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: opts.testing ? false : true });

  fastify.register(cors, { origin: true });

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

  // 1. Webhook Ingestion
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
    const query = `
      SELECT
          c.CityID as id, c.CityName as name, c.IL as city,
          c.ULKE as country, c.KITA as continent,
          c.BOYLAM as lon, c.ENLEM as lat,
          gsm.DownloadSpeed as gsm_download, gsm.UploadSpeed as gsm_upload,
          gsm.Latency as gsm_latency, gsm.DeviceName as gsm_device, gsm.MeasuredAt as gsm_test_time,
          metro.DownloadSpeed as metro_download, metro.UploadSpeed as metro_upload,
          metro.Latency as metro_latency, metro.DeviceName as metro_device, metro.MeasuredAt as metro_test_time
      FROM Cities c
      LEFT JOIN LATERAL (
          SELECT ss.DownloadSpeed, ss.UploadSpeed, ss.Latency, ss.MeasuredAt, ss.DeviceName
          FROM SpeedStats ss WHERE ss.CityID = c.CityID AND ss.VpnTypeID = 2
          ORDER BY ss.MeasuredAt DESC LIMIT 1
      ) gsm ON true
      LEFT JOIN LATERAL (
          SELECT ss.DownloadSpeed, ss.UploadSpeed, ss.Latency, ss.MeasuredAt, ss.DeviceName
          FROM SpeedStats ss WHERE ss.CityID = c.CityID AND ss.VpnTypeID = 1
          ORDER BY ss.MeasuredAt DESC LIMIT 1
      ) metro ON true;
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
      WHERE ss.CityID = $1 AND ss.MeasuredAt > NOW() - INTERVAL '7 days'
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
      WHERE 1=1
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
             AVG(ss.Latency) as avg_latency,
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
      WHERE 1=1
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
    const { startDate, endDate, continent } = request.query as any;
    let query = `
      SELECT c.ULKE as country, c.KITA as continent,
             COUNT(DISTINCT c.CityID) as total_missions, COUNT(*) as total_tests,
             AVG(ss.DownloadSpeed) as avg_download, AVG(ss.UploadSpeed) as avg_upload,
             AVG(ss.Latency) as avg_latency, MAX(ss.DownloadSpeed) as max_download,
             MIN(ss.DownloadSpeed) as min_download, STDDEV(ss.DownloadSpeed) as stddev_download,
             MAX(ss.MeasuredAt) as last_test_time
      FROM Cities c LEFT JOIN SpeedStats ss ON ss.CityID = c.CityID
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIdx = 1;
    if (startDate) { query += ` AND ss.MeasuredAt >= $${paramIdx++}`; params.push(startDate); }
    if (endDate)   { query += ` AND ss.MeasuredAt <= $${paramIdx++}`; params.push(endDate); }
    if (continent) { query += ` AND c.KITA = $${paramIdx++}`; params.push(continent); }
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
  fastify.get('/api/reports/by-continent', async (_request, reply) => {
    const query = `
      SELECT c.KITA as continent,
             COUNT(DISTINCT c.CityID) as total_missions, COUNT(DISTINCT c.ULKE) as total_countries,
             COUNT(*) as total_tests,
             AVG(ss.DownloadSpeed) as avg_download, AVG(ss.UploadSpeed) as avg_upload,
             AVG(ss.Latency) as avg_latency,
             MAX(ss.DownloadSpeed) as max_download, MIN(ss.DownloadSpeed) as min_download,
             MAX(ss.MeasuredAt) as last_test_time
      FROM Cities c LEFT JOIN SpeedStats ss ON ss.CityID = c.CityID
      GROUP BY c.KITA ORDER BY avg_download DESC
    `;
    try {
      const { rows } = await fastify.pg.query(query);
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
             AVG(ss.Latency) as avg_latency,
             MAX(ss.DownloadSpeed) as max_download, MIN(ss.DownloadSpeed) as min_download,
             MAX(ss.MeasuredAt) as last_test_time
      FROM SpeedStats ss
      JOIN Cities c ON ss.CityID = c.CityID
      JOIN VpnTypes vt ON ss.VpnTypeID = vt.VpnTypeID
      WHERE 1=1
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
             AVG(ss.Latency) as avg_latency,
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
          AVG(ss.Latency) as global_avg_latency,
          (SELECT COUNT(DISTINCT ULKE) FROM Cities) as total_countries,
          (SELECT COUNT(DISTINCT KITA) FROM Cities) as total_continents,
          MAX(ss.MeasuredAt) as last_update_time,
          (SELECT json_agg(json_build_object('continent', agg.kita, 'avg_speed', agg.avg_speed))
           FROM (SELECT c2.KITA as kita, AVG(ss2.DownloadSpeed) as avg_speed
                 FROM Cities c2 LEFT JOIN SpeedStats ss2 ON c2.CityID = ss2.CityID
                 GROUP BY c2.KITA) agg) as by_continent
      FROM SpeedStats ss WHERE 1=1
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
    try {
      const { rows } = await fastify.pg.query(
        'SELECT CityID as id, CityName as name, KITA as continent, ULKE as country, IL as city, TURU as type, ENLEM as lat, BOYLAM as lon FROM Cities ORDER BY CityName'
      );
      return rows;
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });

  fastify.post('/api/cities', async (request, reply) => {
    const { name, continent, country, city, type, lat, lon } = request.body as any;
    if (!name) return reply.status(400).send({ error: 'name is required' });
    try {
      const { rows } = await fastify.pg.query(
        'INSERT INTO Cities (CityName, KITA, ULKE, IL, TURU, ENLEM, BOYLAM) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING CityID as id, CityName as name, KITA as continent, ULKE as country, IL as city, TURU as type, ENLEM as lat, BOYLAM as lon',
        [name, continent, country, city, type, lat, lon]
      );
      return reply.status(201).send(rows[0]);
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });

  fastify.put('/api/cities/:id', async (request, reply) => {
    const { id } = request.params as any;
    const { name, continent, country, city, type, lat, lon } = request.body as any;
    try {
      const { rows } = await fastify.pg.query(
        'UPDATE Cities SET CityName=$1, KITA=$2, ULKE=$3, IL=$4, TURU=$5, ENLEM=$6, BOYLAM=$7 WHERE CityID=$8 RETURNING CityID as id, CityName as name, KITA as continent, ULKE as country, IL as city, TURU as type, ENLEM as lat, BOYLAM as lon',
        [name, continent, country, city, type, lat, lon, id]
      );
      if (!rows.length) return reply.status(404).send({ error: 'Not found' });
      return rows[0];
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });

  fastify.delete('/api/cities/:id', async (request, reply) => {
    const { id } = request.params as any;
    try {
      await fastify.pg.query('DELETE FROM Cities WHERE CityID=$1', [id]);
      return { success: true };
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });

  fastify.addHook('onReady', async function () {
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
