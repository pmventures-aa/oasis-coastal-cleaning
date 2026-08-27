-- Branded quotes with line items that customers can accept online.
-- Run: npx wrangler d1 migrations apply oasis --remote

CREATE TABLE IF NOT EXISTS quotes (
  id             TEXT PRIMARY KEY,
  lead_id        TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT,

  status         TEXT NOT NULL DEFAULT 'draft',  -- draft | sent | accepted | declined | expired
  token          TEXT NOT NULL UNIQUE,

  customer_name  TEXT,
  customer_email TEXT,

  line_items     TEXT NOT NULL,                  -- JSON array of {label, description, qty, unit_price, total}
  subtotal       INTEGER NOT NULL DEFAULT 0,     -- cents
  tax            INTEGER NOT NULL DEFAULT 0,
  total          INTEGER NOT NULL DEFAULT 0,

  notes          TEXT,                           -- customer-facing message
  terms          TEXT,                           -- optional terms / validity note
  expires_at     TEXT,

  sent_at        TEXT,
  accepted_at    TEXT,
  declined_at    TEXT,

  FOREIGN KEY (lead_id) REFERENCES leads(id)
);

CREATE INDEX IF NOT EXISTS idx_quotes_lead ON quotes(lead_id);
CREATE INDEX IF NOT EXISTS idx_quotes_token ON quotes(token);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
