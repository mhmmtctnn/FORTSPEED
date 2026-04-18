import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import postgres from '@fastify/postgres';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import Redis from 'ioredis';
import { registerItaiMiddleware } from './middleware/itai';
import { convertToMbps, resolveVpnType, parseSpeedTestBody, detectPayloadType, parseSdwanMembers, parseSdwanStatus, parseSdwanJson } from './helpers/webhook-parser';
import { registerTagRoutes } from './routes/tags';
import { registerCityRoutes } from './routes/cities';
import { registerLogRoutes } from './routes/logs';
import { registerMissionRoutes } from './routes/missions';
import { registerReportRoutes } from './routes/reports';
import { registerSdwanRoutes } from './routes/sdwan';
import { registerWebhookRoutes } from './routes/webhook';
import { createDbLog } from './helpers/db-log';
import { createFindCityId } from './helpers/find-city-id';

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

  const purgeOldLogs = async () => {
    try {
      const r1 = await fastify.pg.query(`DELETE FROM SystemLogs  WHERE CreatedAt < NOW() - INTERVAL '30 days'`);
      const r2 = await fastify.pg.query(`DELETE FROM WebhookLogs WHERE CreatedAt < NOW() - INTERVAL '30 days'`);
      if ((r1.rowCount ?? 0) > 0 || (r2.rowCount ?? 0) > 0) {
        fastify.log.info(`Log temizleme: ${r1.rowCount ?? 0} sistem + ${r2.rowCount ?? 0} webhook logu silindi (>30 gün)`);
      }
    } catch (e) { fastify.log.error(e, 'Log purge hatası'); }
  };

  fastify.addHook('onReady', async function () {
    // ── Auto-migration: eksik kolonları ekle ──
    try {
      await fastify.pg.query(`
        ALTER TABLE Cities ADD COLUMN IF NOT EXISTS DeviceName VARCHAR(100);
      `);
      await fastify.pg.query(`
        ALTER TABLE Cities ADD COLUMN IF NOT EXISTS IsStarlink BOOLEAN NOT NULL DEFAULT FALSE;
      `);
      await fastify.pg.query(`
        ALTER TABLE Cities ADD COLUMN IF NOT EXISTS SatelliteType VARCHAR(50) DEFAULT NULL;
      `);
      await fastify.pg.query(`
        UPDATE Cities SET SatelliteType = 'starlink' WHERE IsStarlink = TRUE AND SatelliteType IS NULL;
      `);
      await fastify.pg.query(`
        ALTER TABLE Cities ADD COLUMN IF NOT EXISTS TerrestrialType VARCHAR(50) DEFAULT NULL;
      `);
      await fastify.pg.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_cities_devicename
          ON Cities (UPPER(DeviceName))
          WHERE DeviceName IS NOT NULL AND DeviceName <> '';
      `);
      // Tags tablosu ve Cities.MissionTags kolonu
      await fastify.pg.query(`
        CREATE TABLE IF NOT EXISTS Tags (
          ID        SERIAL PRIMARY KEY,
          Name      VARCHAR(100) NOT NULL,
          Color     VARCHAR(20)  NOT NULL DEFAULT '#38bdf8',
          Icon      VARCHAR(20)  NOT NULL DEFAULT '🏷️',
          SortOrder INT          NOT NULL DEFAULT 0
        );
      `);
      await fastify.pg.query(`
        ALTER TABLE Cities ADD COLUMN IF NOT EXISTS MissionTags TEXT DEFAULT NULL;
      `);
      fastify.log.info('Migration OK: Cities.DeviceName + SatelliteType + Tags kolonları hazır.');
    } catch (err) {
      fastify.log.error(err, 'Migration failed: Cities.DeviceName');
    }
    // ── SDWAN tabloları (her ifadeyi ayrı query ile çalıştır) ──
    try {
      await fastify.pg.query(`
        CREATE TABLE IF NOT EXISTS SdwanMembers (
          ID        SERIAL  PRIMARY KEY,
          CityID    INTEGER REFERENCES Cities(CityID) ON DELETE CASCADE,
          SeqID     INTEGER NOT NULL,
          InterfaceName VARCHAR(100) NOT NULL,
          Cost      INTEGER,
          UpdatedAt TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE (CityID, SeqID)
        )
      `);
      await fastify.pg.query(`
        CREATE TABLE IF NOT EXISTS SdwanStatus (
          CityID          INTEGER PRIMARY KEY REFERENCES Cities(CityID) ON DELETE CASCADE,
          ActiveSeqID     INTEGER,
          ActiveInterface VARCHAR(100),
          UpdatedAt       TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await fastify.pg.query(`
        CREATE TABLE IF NOT EXISTS SdwanHistory (
          ID              SERIAL PRIMARY KEY,
          CityID          INTEGER REFERENCES Cities(CityID) ON DELETE CASCADE,
          FromInterface   VARCHAR(100),
          ToInterface     VARCHAR(100),
          ActiveSeqID     INTEGER,
          RecordedAt      TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await fastify.pg.query(`
        CREATE INDEX IF NOT EXISTS idx_sdwanhistory_city ON SdwanHistory (CityID, RecordedAt DESC)
      `);
      fastify.log.info('Migration OK: SdwanMembers + SdwanStatus + SdwanHistory tabloları hazır.');
    } catch (err) {
      fastify.log.error(err, 'Migration failed: SDWAN tables');
    }
    // ── Log temizleme — pg hazır olduktan sonra çalıştır ──
    if (!opts.testing) {
      purgeOldLogs();
      setInterval(purgeOldLogs, 24 * 60 * 60 * 1000);
    }
    // ── Index doğrulama ──
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
