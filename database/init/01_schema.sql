-- PostgreSQL Schema Conversion from MSSQL SpeedTestsDb

-- 1. VpnTypes Table
CREATE TABLE IF NOT EXISTS VpnTypes (
    VpnTypeID SERIAL PRIMARY KEY,
    VpnTypeName VARCHAR(50) NOT NULL UNIQUE
);

-- 2. Cities Table
CREATE TABLE IF NOT EXISTS Cities (
    CityID SERIAL PRIMARY KEY,
    CityName VARCHAR(100) NOT NULL UNIQUE,
    KITA VARCHAR(50),
    ULKE VARCHAR(100),
    IL VARCHAR(100),
    TURU VARCHAR(50),
    ENLEM DOUBLE PRECISION,
    BOYLAM DOUBLE PRECISION
);

-- 3. SpeedStats Table
CREATE TABLE IF NOT EXISTS SpeedStats (
    StatID SERIAL PRIMARY KEY,
    CityID INT NOT NULL REFERENCES Cities(CityID),
    VpnTypeID INT NOT NULL REFERENCES VpnTypes(VpnTypeID),
    DeviceName VARCHAR(100) NOT NULL,
    UploadSpeed DECIMAL(10, 2),
    DownloadSpeed DECIMAL(10, 2),
    Latency DECIMAL(10, 2) DEFAULT 0.0,
    UploadStatus VARCHAR(10) NOT NULL DEFAULT 'OK',
    DownloadStatus VARCHAR(10) NOT NULL DEFAULT 'OK',
    MeasuredAt TIMESTAMP(0) NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_speedstats_cityid ON SpeedStats(CityID);
CREATE INDEX IF NOT EXISTS idx_speedstats_vpntypeid ON SpeedStats(VpnTypeID);
CREATE INDEX IF NOT EXISTS idx_speedstats_measuredat ON SpeedStats(MeasuredAt);
