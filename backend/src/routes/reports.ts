import { FastifyInstance } from 'fastify';

export async function registerReportRoutes(fastify: FastifyInstance): Promise<void> {
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

      const uniqueCities = new Set(rows.map((r: any) => r.id));
      const global_avg_download = rows.length > 0
        ? (rows.reduce((s: number, r: any) => s + Number(r.dl), 0) / rows.length).toFixed(2)
        : '0.00';
      const global_avg_upload = rows.length > 0
        ? (rows.reduce((s: number, r: any) => s + Number(r.ul), 0) / rows.length).toFixed(2)
        : '0.00';

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
}
