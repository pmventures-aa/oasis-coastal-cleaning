-- Oasis Coastal Cleaning — invoices, and the money actually received.
--
-- There is no card gateway here and that is deliberate: she is paid by
-- Zelle, in cash, by cheque, or by a card machine that is nothing to do
-- with this site. So this does not pretend to take payments. It records
-- them.
--
-- The important shape, and the one a status field cannot do: a PAYMENT IS
-- A ROW. Not a flag on the invoice. That is what makes "half by Zelle on
-- Tuesday, the rest in cash on Friday" expressible, and it is how the
-- balance stays honest when one of them is voided. amount_paid on the
-- invoice is a cache of those rows and never the truth.
--
-- Apply with the Cloudflare dashboard (D1 -> oasis -> Console) or:
--   npx wrangler d1 migrations apply oasis --remote

CREATE TABLE IF NOT EXISTS invoices (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  updated_at    TEXT,
  number        TEXT,                -- what she calls it: 2026-014

  customer_id   TEXT,
  lead_id       TEXT,
  quote_id      TEXT,
  job_id        TEXT,
  appointment_id TEXT,

  customer_name TEXT,
  email         TEXT,
  address       TEXT,
  city          TEXT,

  line_items    TEXT,                -- JSON, same shape as a quote's
  subtotal      INTEGER NOT NULL DEFAULT 0,
  total         INTEGER NOT NULL DEFAULT 0,

  -- A cache of the payment rows, kept in step on every write. The balance
  -- is always recomputed from the rows, never read from here.
  amount_paid   INTEGER NOT NULL DEFAULT 0,

  -- draft | sent | paid | part_paid | void
  status        TEXT NOT NULL DEFAULT 'draft',
  due_date      TEXT,
  sent_at       TEXT,
  notes         TEXT,
  archived_at   TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id            TEXT PRIMARY KEY,
  invoice_id    TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  paid_at       TEXT NOT NULL,       -- when the money actually arrived
  amount        INTEGER NOT NULL,

  -- zelle | cash | card | check | other. "other" carries its own words in
  -- method_note, because she will be paid in a way nobody listed.
  method        TEXT NOT NULL DEFAULT 'other',
  method_note   TEXT,
  reference     TEXT,                -- a Zelle confirmation, a cheque number
  recorded_by   TEXT,
  voided_at     TEXT                 -- voided, never deleted: it happened
);

CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status, archived_at);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id, paid_at);
