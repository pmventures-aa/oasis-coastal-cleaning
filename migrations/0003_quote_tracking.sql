-- Quote delivery, view, and response tracking.
-- Run: npx wrangler d1 migrations apply oasis --remote

ALTER TABLE quotes ADD COLUMN email_status TEXT DEFAULT 'pending';
ALTER TABLE quotes ADD COLUMN email_error TEXT;
ALTER TABLE quotes ADD COLUMN email_provider_id TEXT;
ALTER TABLE quotes ADD COLUMN email_delivered_at TEXT;
ALTER TABLE quotes ADD COLUMN email_opened_at TEXT;
ALTER TABLE quotes ADD COLUMN first_viewed_at TEXT;
ALTER TABLE quotes ADD COLUMN last_viewed_at TEXT;
ALTER TABLE quotes ADD COLUMN view_count INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS quote_events (
  id         TEXT PRIMARY KEY,
  quote_id   TEXT NOT NULL,
  created_at TEXT NOT NULL,
  kind       TEXT NOT NULL,
  detail     TEXT,
  FOREIGN KEY (quote_id) REFERENCES quotes(id)
);

CREATE INDEX IF NOT EXISTS idx_quote_events_quote ON quote_events(quote_id);
CREATE INDEX IF NOT EXISTS idx_quotes_email_provider ON quotes(email_provider_id);
