import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { FindCityIdFn } from '../helpers/find-city-id';

export async function registerSdwanRoutes(
  fastify: FastifyInstance,
  redis: Redis,
  findCityId: FindCityIdFn,
  testing: boolean,
): Promise<void> {
  fastify.post('/api/sdwan/inject', { config: { rateLimit: { max: testing ? 100000 : 120, timeWindow: '1 minute' } } }, async (request, reply) => {
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

  fastify.get('/api/sdwan', async (_request, reply) => {
    try {
      const res = await fastify.pg.query(`
        SELECT
          c.CityID   as city_id,
          c.CityName as city_name,
          ss.ActiveSeqID     as active_seq_id,
          ss.ActiveInterface as active_interface,
          GREATEST(ss.UpdatedAt, MAX(sm.UpdatedAt)) as updated_at,
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
}
