import { FastifyInstance } from 'fastify';

export async function registerMissionRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/missions', async (_request, reply) => {
    const query = `
      SELECT
          c.CityID as id, c.CityName as name, c.IL as city,
          c.ULKE as country, c.KITA as continent,
          c.BOYLAM as lon, c.ENLEM as lat,
          c.IsStarlink as is_starlink,
          c.SatelliteType as satellite_type,
          c.TerrestrialType as terrestrial_type,
          c.MissionTags as mission_tags,
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
      return rows.map((r: any) => ({ ...r, tags: r.mission_tags ? JSON.parse(r.mission_tags) : [], mission_tags: undefined }));
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });

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
}
