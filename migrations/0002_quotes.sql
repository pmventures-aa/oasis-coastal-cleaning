-- Oasis Coastal Cleaning — branded quotes customers can open and accept.
--
-- One quote is a list of custom line items Kristina writes in the portal,
-- emailed to the customer as a branded message with a private link. They
-- open it and click Accept. Apply with:
--   npx wrangler d1 migrations apply oasis --remote

CREATE TABLE IF NOT EXISTS quotes (
  id              TEXT PRIMARY KEY,
  lead_id         TEXT,
  token           TEXT NOT NULL UNIQUE,
  created_at      TEXT NOT NULL,
  updated_at      TEXT,
  sent_at         TEXT,
  accepted_at     TEXT,
  status          TEXT NOT NULL DEFAULT 'draft',  -- draft|sent|accepted

  customer_name   TEXT NOT NULL,
  customer_email  TEXT NOT NULL,
  customer_phone  TEXT,
  service_label   TEXT,
  frequency       TEXT,

  intro           TEXT,           -- personal note at the top of the quote
  line_items      TEXT NOT NULL,  -- JSON: [{description, qty, unit_price}]
  notes           TEXT,           -- shown under the total (what's included, terms)
  price_note      TEXT,           -- e.g. "per visit" next to the total
  valid_until     TEXT,           -- YYYY-MM-DD

  accepted_name   TEXT,
  accepted_ip     TEXT,
  accepted_ua     TEXT
);

CREATE INDEX IF NOT EXISTS idx_quotes_lead  ON quotes (lead_id);
CREATE INDEX IF NOT EXISTS idx_quotes_token ON quotes (token);
CREATE INDEX IF NOT EXISTS idx_quotes_created ON quotes (created_at DESC);
