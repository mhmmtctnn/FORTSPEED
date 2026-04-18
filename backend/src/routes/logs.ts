import { FastifyInstance } from 'fastify';

export async function registerLogRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/logs/system', async (request, reply) => {
    const { severity, days } = request.query as any;
    const retentionDays = Math.min(Number(days) || 30, 30);
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
    const retentionDays = Math.min(Number(days) || 30, 30);
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
}
