-- 06_logs.sql
-- Create tracking tables for application and webhook events

-- We keep the structure very loose for maximum flexibility
CREATE TABLE IF NOT EXISTS SystemLogs (
    LogID SERIAL PRIMARY KEY,
    Severity VARCHAR(20) NOT NULL DEFAULT 'INFO', -- 'INFO', 'WARN', 'ERROR', 'CRITICAL'
    Message TEXT NOT NULL,
    Context JSONB,
    CreatedAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS WebhookLogs (
    WebhookLogID SERIAL PRIMARY KEY,
    SourceIP VARCHAR(100),
    RawPayload TEXT,
    ParsedContext JSONB,
    CreatedAt TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Index created_at for fast descending sorts on large tables
CREATE INDEX IF NOT EXISTS idx_systemlogs_created_at ON SystemLogs (CreatedAt DESC);
CREATE INDEX IF NOT EXISTS idx_webhooklogs_created_at ON WebhookLogs (CreatedAt DESC);
CREATE INDEX IF NOT EXISTS idx_systemlogs_severity ON SystemLogs (Severity);
