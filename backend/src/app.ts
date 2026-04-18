import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import postgres from '@fastify/postgres';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import Redis from 'ioredis';
import { registerItaiMiddleware } from './middleware/itai';
import { registerTagRoutes } from './routes/tags';
import { registerCityRoutes } from './routes/cities';
import { registerLogRoutes } from './routes/logs';
import { registerMissionRoutes } from './routes/missions';
import { registerReportRoutes } from './routes/reports';
import { registerSdwanRoutes } from './routes/sdwan';
import { registerWebhookRoutes } from './routes/webhook';
import { createDbLog } from './helpers/db-log';
import { createFindCityId } from './helpers/find-city-id';
import { registerMigrations } from './routes/migrations';

export interface AppOptions {
  testing?: boolean;
  itaiMode?: boolean;
  pgUrl?: string;
  redisUrl?: string;
  mockPg?: any;
  mockRedis?: any;
}

export async function buildApp(opts: AppOptions = {}): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: opts.testing ? false : true, trustProxy: true });

  fastify.register(cors, { origin: true });

  // Rate limiting — DoS/brute-force koruması
  // Test modunda plugin yine kaydedilir (CodeQL için), ama limit çok yüksektir
  fastify.register(rateLimit, {
    global: true,
    max: opts.testing ? 100000 : 300,   // 5 dakikada normalde 300 istek, testlerde 100000
    timeWindow: '5 minutes',
    allowList: ['127.0.0.1', '::1'], // localhost'tan gelen isteklere limit yok
    errorResponseBuilder: (_req, context) => ({
      status: 'Rate limit exceeded',
      message: `Too many requests. Retry after ${Math.ceil(context.ttl / 1000)}s`,
      retry_after: Math.ceil(context.ttl / 1000),
    }),
  });

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

  fastify.addContentTypeParser('text/plain', { parseAs: 'string' }, (_req, body, done) => done(null, body));
  fastify.addContentTypeParser('*', { parseAs: 'string' }, (_req, body, done) => done(null, body));

  const dbLog = createDbLog(fastify);
  const findCityId = createFindCityId(fastify, redis);

  // Webhook routes — routes/webhook.ts
  await registerWebhookRoutes(fastify, redis, dbLog, findCityId, opts.testing ?? false);

  // Logs + Activity — routes/logs.ts
  await registerLogRoutes(fastify);

  // Missions + Stats ��� routes/missions.ts
  await registerMissionRoutes(fastify);

  // Reporting API — routes/reports.ts
  await registerReportRoutes(fastify);

  // 12. Tags CRUD — routes/tags.ts
  await registerTagRoutes(fastify);

  // 13. Cities CRUD — routes/cities.ts
  await registerCityRoutes(fastify, redis);

  // SDWAN — routes/sdwan.ts
  await registerSdwanRoutes(fastify, redis, findCityId, opts.testing ?? false);

  // Migrations + onReady hook — routes/migrations.ts
  registerMigrations(fastify, opts.testing ?? false);

  return fastify;
}
