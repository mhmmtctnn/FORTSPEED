CREATE TABLE IF NOT EXISTS SdwanLinkEvents (
  ID        SERIAL PRIMARY KEY,
  CityID    INTEGER REFERENCES Cities(CityID) ON DELETE CASCADE,
  Interface VARCHAR(100) NOT NULL,
  OldState  VARCHAR(10),             -- 'dead' | 'alive' | NULL (SLA format has no oldState)
  NewState  VARCHAR(10)  NOT NULL,  -- 'dead' | 'alive'
  EventAt   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sdwan_link_events_city_at ON SdwanLinkEvents (CityID, EventAt DESC);
