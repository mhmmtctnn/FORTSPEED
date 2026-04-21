import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';

export type FindCityIdFn = (deviceName: string) => Promise<number | null>;

export function createFindCityId(fastify: FastifyInstance, redis: Redis): FindCityIdFn {
  return async (deviceName: string): Promise<number | null> => {
    const cacheKey = `cityid:${deviceName.toUpperCase()}`;
    const cached = await redis.get(cacheKey);
    if (cached === 'null') return null;
    if (cached !== null) return Number(cached);

    const res = await fastify.pg.query<{ cityid: number }>(
      `SELECT CityID FROM Cities
       WHERE (DeviceName IS NOT NULL AND DeviceName <> '' AND UPPER(DeviceName) = UPPER($1))
          OR (COALESCE(DeviceName, '') = '' AND UPPER(CityName) = UPPER($1))
       LIMIT 1`,
      [deviceName]
    );
    const cityId = res.rows.length > 0 ? res.rows[0].cityid : null;
    if (cityId !== null) {
      await redis.setex(cacheKey, 3600, String(cityId));
    } else {
      // Cache negative result with short TTL to prevent repeated DB hits for unknown devices
      await redis.setex(cacheKey, 300, 'null');
    }
    return cityId;
  };
}
