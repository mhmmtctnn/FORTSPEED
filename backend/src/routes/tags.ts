import { FastifyInstance } from 'fastify';

export async function registerTagRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/tags', async (_request, reply) => {
    try {
      const { rows } = await fastify.pg.query('SELECT ID as id, Name as name, Color as color, Icon as icon, SortOrder as sort_order FROM Tags ORDER BY SortOrder ASC, ID ASC');
      return rows;
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });

  fastify.post('/api/tags', async (request, reply) => {
    const { name, color, icon, sort_order } = request.body as any;
    if (!name?.trim()) return reply.status(400).send({ error: 'name is required' });
    try {
      const { rows } = await fastify.pg.query(
        'INSERT INTO Tags (Name, Color, Icon, SortOrder) VALUES ($1,$2,$3,$4) RETURNING ID as id, Name as name, Color as color, Icon as icon, SortOrder as sort_order',
        [name.trim(), color || '#38bdf8', icon || '🏷️', sort_order ?? 0]
      );
      return reply.status(201).send(rows[0]);
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });

  fastify.put('/api/tags/:id', async (request, reply) => {
    const { id } = request.params as any;
    const { name, color, icon, sort_order } = request.body as any;
    if (!name?.trim()) return reply.status(400).send({ error: 'name is required' });
    try {
      const { rows } = await fastify.pg.query(
        'UPDATE Tags SET Name=$1, Color=$2, Icon=$3, SortOrder=$4 WHERE ID=$5 RETURNING ID as id, Name as name, Color as color, Icon as icon, SortOrder as sort_order',
        [name.trim(), color || '#38bdf8', icon || '🏷️', sort_order ?? 0, id]
      );
      if (!rows.length) return reply.status(404).send({ error: 'Not found' });
      return rows[0];
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });

  fastify.delete('/api/tags/:id', async (request, reply) => {
    const { id } = request.params as any;
    try {
      const { rows: cities } = await fastify.pg.query('SELECT CityID, MissionTags FROM Cities WHERE MissionTags IS NOT NULL');
      for (const city of cities) {
        try {
          const tags: number[] = JSON.parse(city.MissionTags || '[]');
          const filtered = tags.filter((t: number) => t !== Number(id));
          await fastify.pg.query('UPDATE Cities SET MissionTags=$1 WHERE CityID=$2',
            [filtered.length ? JSON.stringify(filtered) : null, city.CityID]
          );
        } catch {}
      }
      await fastify.pg.query('DELETE FROM Tags WHERE ID=$1', [id]);
      return reply.status(204).send();
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'DB Error' });
    }
  });
}
