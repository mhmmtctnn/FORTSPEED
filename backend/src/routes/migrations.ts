import { FastifyInstance } from 'fastify';

async function purgeOldLogs(fastify: FastifyInstance): Promise<void> {
  try {
    const r1 = await fastify.pg.query(`DELETE FROM SystemLogs  WHERE CreatedAt < NOW() - INTERVAL '30 days'`);
    const r2 = await fastify.pg.query(`DELETE FROM WebhookLogs WHERE CreatedAt < NOW() - INTERVAL '30 days'`);
    if ((r1.rowCount ?? 0) > 0 || (r2.rowCount ?? 0) > 0) {
      fastify.log.info(`Log temizleme: ${r1.rowCount ?? 0} sistem + ${r2.rowCount ?? 0} webhook logu silindi (>30 gün)`);
    }
  } catch (e) { fastify.log.error(e, 'Log purge hatası'); }
}

export function registerMigrations(fastify: FastifyInstance, testing: boolean): void {
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
      await fastify.pg.query(`
        CREATE TABLE IF NOT EXISTS Tags (
          ID        SERIAL PRIMARY KEY,
          Name      VARCHAR(100) NOT NULL,
          Color     VARCHAR(20)  NOT NULL DEFAULT '#38bdf8',
          Icon      VARCHAR(200) NOT NULL DEFAULT '🏷️',
          SortOrder INT          NOT NULL DEFAULT 0
        );
      `);
      await fastify.pg.query(`
        ALTER TABLE Tags ALTER COLUMN Icon TYPE VARCHAR(200);
      `);
      await fastify.pg.query(`
        ALTER TABLE Cities ADD COLUMN IF NOT EXISTS MissionTags TEXT DEFAULT NULL;
      `);
      await fastify.pg.query(`
        CREATE TABLE IF NOT EXISTS AuthConfig (
          ID      INTEGER PRIMARY KEY DEFAULT 1,
          Provider VARCHAR(20) NOT NULL DEFAULT 'local',
          Config  JSONB        NOT NULL DEFAULT '{}',
          UpdatedAt TIMESTAMPTZ DEFAULT NOW(),
          CONSTRAINT authconfig_single_row CHECK (ID = 1)
        );
      `);
      fastify.log.info('Migration OK: Cities.DeviceName + SatelliteType + Tags + AuthConfig kolonları hazır.');
    } catch (err) {
      fastify.log.error(err, 'Migration failed: Cities.DeviceName');
    }
    // ── SDWAN tabloları ──
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
    // ── Log temizleme ──
    if (!testing) {
      purgeOldLogs(fastify);
      setInterval(() => { purgeOldLogs(fastify).catch((err) => fastify.log.error(err, 'purgeOldLogs failed')); }, 24 * 60 * 60 * 1000);
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
}
