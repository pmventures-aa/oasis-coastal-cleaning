-- Run once in Cloudflare → D1 → oasis → Console if wrangler is unavailable.
-- Safe to re-run: uses IF NOT EXISTS. Duplicate ALTER COLUMN errors can be ignored.

-- 0002 quotes
CREATE TABLE IF NOT EXISTS quotes (
  id             TEXT PRIMARY KEY,
  lead_id        TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT,
  status         TEXT NOT NULL DEFAULT 'draft',
  token          TEXT NOT NULL UNIQUE,
  customer_name  TEXT,
  customer_email TEXT,
  line_items     TEXT NOT NULL,
  subtotal       INTEGER NOT NULL DEFAULT 0,
  tax            INTEGER NOT NULL DEFAULT 0,
  total          INTEGER NOT NULL DEFAULT 0,
  notes          TEXT,
  terms          TEXT,
  expires_at     TEXT,
  sent_at        TEXT,
  accepted_at    TEXT,
  declined_at    TEXT,
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);
CREATE INDEX IF NOT EXISTS idx_quotes_lead ON quotes(lead_id);
CREATE INDEX IF NOT EXISTS idx_quotes_token ON quotes(token);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);

-- 0003 tracking (ignore errors if columns already exist)
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

-- 0004 archive (ignore errors if columns already exist)
ALTER TABLE leads ADD COLUMN archived_at TEXT;
ALTER TABLE quotes ADD COLUMN archived_at TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_archived ON leads(archived_at);
CREATE INDEX IF NOT EXISTS idx_quotes_archived ON quotes(archived_at);

-- 0005 payment (ignore errors if columns already exist)
ALTER TABLE quotes ADD COLUMN paid_at TEXT;
ALTER TABLE quotes ADD COLUMN payment_method TEXT;
ALTER TABLE quotes ADD COLUMN payment_note TEXT;
