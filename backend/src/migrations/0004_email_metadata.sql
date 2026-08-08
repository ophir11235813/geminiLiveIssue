-- Metadata specific to email-ingested documents. NULL/false for every other
-- document type (manual paste/upload) — these columns are optional context,
-- not required fields.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS sender TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS flagged BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS flag_reason TEXT;
