-- Soft-archive and cleanup support for leads and quotes.

ALTER TABLE leads ADD COLUMN archived_at TEXT;
ALTER TABLE quotes ADD COLUMN archived_at TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_archived ON leads(archived_at);
CREATE INDEX IF NOT EXISTS idx_quotes_archived ON quotes(archived_at);
