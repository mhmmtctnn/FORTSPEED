import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';

export async function registerCityRoutes(fastify: FastifyInstance, redis: Redis): Promise<void> {
  fastify.get('/api/cities', async (_request, reply) => {
    const withDeviceName = 'SELECT CityID as id, CityName as name, KITA as continent, ULKE as country, IL as city, TURU as type, ENLEM as lat, BOYLAM as lon, DeviceName as device_name, IsStarlink as is_starlink, SatelliteType as satellite_type, TerrestrialType as terrestrial_type, MissionTags as mission_tags FROM Cities ORDER BY CityID ASC';
    const withoutDeviceName = 'SELECT CityID as id, CityName as name, KITA as continent, ULKE as country, IL as city, TURU as type, ENLEM as lat, BOYLAM as lon, NULL as device_name, FALSE as is_starlink, NULL as satellite_type, NULL as terrestrial_type, NULL as mission_tags FROM Cities ORDER BY CityID ASC';
    const parseTags = (r: any) => ({ ...r, tags: r.mission_tags ? JSON.parse(r.mission_tags) : [], mission_tags: undefined });
    try {
      const { rows } = await fastify.pg.query(withDeviceName);
      return rows.map(parseTags);
    } catch (err: unknown) {
      if ((err as { code?: string }).code !== '42703') {
        fastify.log.error(err);
        return reply.status(500).send({ error: 'DB Error' });
      }
      // Fallback: schema lacks extended columns (old deployment) — 42703 undefined_column
      try {
        const { rows } = await fastify.pg.query(withoutDeviceName);
        return rows.map(parseTags);
      } catch (err2) {
        fastify.log.error(err2);
        return reply.status(500).send({ error: 'DB Error' });
      }
    }
  });

  fastify.post('/api/cities', {
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name:             { type: 'string', minLength: 1, maxLength: 128 },
          continent:        { type: 'string', maxLength: 64 },
          country:          { type: 'string', maxLength: 64 },
          city:             { type: 'string', maxLength: 128 },
          type:             { type: 'string', maxLength: 64 },
          lat:              { type: ['number', 'null'] },
          lon:              { type: ['number', 'null'] },
          device_name:      { type: 'string', maxLength: 128 },
          is_starlink:      { type: 'boolean' },
          satellite_type:   { type: 'string', maxLength: 64 },
          terrestrial_type: { type: 'string', maxLength: 64 },
          tags:             { type: 'array', items: { type: 'object' } },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { name, continent, country, city, type, lat, lon, device_name, is_starlink, satellite_type, terrestrial_type, tags } = request.body as any;
    const satType = satellite_type || null;
    const terrType = terrestrial_type || null;
    const isStarlinkVal = satType === 'starlink' ? true : (is_starlink ?? false);
    const missionTags = Array.isArray(tags) && tags.length ? JSON.stringify(tags) : null;
    try {
      const { rows } = await fastify.pg.query(
        'INSERT INTO Cities (CityName, KITA, ULKE, IL, TURU, ENLEM, BOYLAM, DeviceName, IsStarlink, SatelliteType, TerrestrialType, MissionTags) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING CityID as id, CityName as name, KITA as continent, ULKE as country, IL as city, TURU as type, ENLEM as lat, BOYLAM as lon, DeviceName as device_name, IsStarlink as is_starlink, SatelliteType as satellite_type, TerrestrialType as terrestrial_type, MissionTags as mission_tags',
        [name, continent, country, city, type, lat, lon, device_name || null, isStarlinkVal, satType, terrType, missionTags]
      );
      const cacheKeys = [`cityid:${name.toUpperCase()}`];
      if (device_name) cacheKeys.push(`cityid:${device_name.toUpperCase()}`);
      await Promise.all(cacheKeys.map(k => redis.del(k)));
      return reply.status(201).send({ ...rows[0], tags: rows[0].mission_tags ? JSON.parse(rows[0].mission_tags) : [], mission_tags: undefined });
    } catch (err: unknown) {
      if ((err as { code?: string }).code !== '42703') {
        fastify.log.error(err);
        return reply.status(500).send({ error: 'DB Error' });
      }
      // Fallback: schema lacks extended columns (old deployment) — 42703 undefined_column
      try {
        const { rows } = await fastify.pg.query(
          'INSERT INTO Cities (CityName, KITA, ULKE, IL, TURU, ENLEM, BOYLAM) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING CityID as id, CityName as name, KITA as continent, ULKE as country, IL as city, TURU as type, ENLEM as lat, BOYLAM as lon, NULL as device_name, FALSE as is_starlink',
          [name, continent, country, city, type, lat, lon]
        );
        return reply.status(201).send({ ...rows[0], tags: [] });
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

  fastify.put('/api/cities/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name:             { type: 'string', minLength: 1, maxLength: 128 },
          continent:        { type: 'string', maxLength: 64 },
          country:          { type: 'string', maxLength: 64 },
          city:             { type: 'string', maxLength: 128 },
          type:             { type: 'string', maxLength: 64 },
          lat:              { type: ['number', 'null'] },
          lon:              { type: ['number', 'null'] },
          device_name:      { type: 'string', maxLength: 128 },
          is_starlink:      { type: 'boolean' },
          satellite_type:   { type: 'string', maxLength: 64 },
          terrestrial_type: { type: 'string', maxLength: 64 },
          tags:             { type: 'array', items: { type: 'object' } },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as any;
    const { name, continent, country, city, type, lat, lon, device_name, is_starlink, satellite_type, terrestrial_type, tags } = request.body as any;
    const satType = satellite_type || null;
    const terrType = terrestrial_type || null;
    const isStarlinkVal = satType === 'starlink' ? true : (is_starlink ?? false);
    const missionTags = Array.isArray(tags) && tags.length ? JSON.stringify(tags) : null;
    try {
      const { rows } = await fastify.pg.query(
        'UPDATE Cities SET CityName=$1, KITA=$2, ULKE=$3, IL=$4, TURU=$5, ENLEM=$6, BOYLAM=$7, DeviceName=$8, IsStarlink=$9, SatelliteType=$10, TerrestrialType=$11, MissionTags=$12 WHERE CityID=$13 RETURNING CityID as id, CityName as name, KITA as continent, ULKE as country, IL as city, TURU as type, ENLEM as lat, BOYLAM as lon, DeviceName as device_name, IsStarlink as is_starlink, SatelliteType as satellite_type, TerrestrialType as terrestrial_type, MissionTags as mission_tags',
        [name, continent, country, city, type, lat, lon, device_name || null, isStarlinkVal, satType, terrType, missionTags, id]
      );
      if (!rows.length) return reply.status(404).send({ error: 'Not found' });
      const cacheKeys = [`cityid:${name.toUpperCase()}`];
      if (device_name) cacheKeys.push(`cityid:${device_name.toUpperCase()}`);
      await Promise.all(cacheKeys.map(k => redis.del(k)));
      return { ...rows[0], tags: rows[0].mission_tags ? JSON.parse(rows[0].mission_tags) : [], mission_tags: undefined };
    } catch (err: unknown) {
      if ((err as { code?: string }).code !== '42703') {
        fastify.log.error(err);
        return reply.status(500).send({ error: 'DB Error' });
      }
      // Fallback: schema lacks extended columns (old deployment) — 42703 undefined_column
      try {
        const { rows } = await fastify.pg.query(
          'UPDATE Cities SET CityName=$1, KITA=$2, ULKE=$3, IL=$4, TURU=$5, ENLEM=$6, BOYLAM=$7 WHERE CityID=$8 RETURNING CityID as id, CityName as name, KITA as continent, ULKE as country, IL as city, TURU as type, ENLEM as lat, BOYLAM as lon, NULL as device_name, FALSE as is_starlink, NULL as satellite_type, NULL as terrestrial_type',
          [name, continent, country, city, type, lat, lon, id]
        );
        if (!rows.length) return reply.status(404).send({ error: 'Not found' });
        return { ...rows[0], tags: [] };
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
      const cityRes = await fastify.pg.query<{ cityname: string; devicename: string | null }>(
        'SELECT CityName as cityname, DeviceName as devicename FROM Cities WHERE CityID = $1', [numId]
      );
      await fastify.pg.query('DELETE FROM SpeedStats WHERE CityID = $1', [numId]);
      const result = await fastify.pg.query('DELETE FROM Cities WHERE CityID = $1 RETURNING CityID', [numId]);
      if (result.rowCount === 0) return reply.status(404).send({ error: 'Misyon bulunamadı' });
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
}
