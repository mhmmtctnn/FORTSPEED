-- SDWAN üye (member) konfigürasyonu — FortiGate'den gelen "config members" bloğu
CREATE TABLE IF NOT EXISTS SdwanMembers (
    ID        SERIAL  PRIMARY KEY,
    CityID    INTEGER REFERENCES Cities(CityID) ON DELETE CASCADE,
    SeqID     INTEGER NOT NULL,          -- edit 1 / edit 2 / edit 3
    InterfaceName VARCHAR(100) NOT NULL, -- "BALGAT_GSM" / "BALGAT_KARASAL"
    Cost      INTEGER,                   -- set cost 15
    UpdatedAt TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (CityID, SeqID)
);

-- Anlık aktif SDWAN üyesi — FortiGate'den gelen "sdwan_mbr_seq=N" değeri
CREATE TABLE IF NOT EXISTS SdwanStatus (
    CityID          INTEGER PRIMARY KEY REFERENCES Cities(CityID) ON DELETE CASCADE,
    ActiveSeqID     INTEGER,
    ActiveInterface VARCHAR(100),
    UpdatedAt       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sdwan_members_city ON SdwanMembers (CityID);
