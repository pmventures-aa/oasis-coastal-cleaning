-- Oasis Coastal Cleaning — her own list of what things are, and what she
-- usually charges for them.
--
-- This is INTERNAL. The public site deliberately carries no prices: every
-- job is quoted for the space. This is the opposite problem -- she retypes
-- "Inside the oven — racks and door glass" and a number on every quote, on
-- a phone, and a typo there is money.
--
-- A price here is a starting point, never a rate card. Every line is still
-- editable on the quote it lands on, because that is how she works.
--
-- Apply with the Cloudflare dashboard (D1 -> oasis -> Console) or:
--   npx wrangler d1 migrations apply oasis --remote

CREATE TABLE IF NOT EXISTS price_book (
  id           TEXT PRIMARY KEY,
  created_at   TEXT NOT NULL,
  updated_at   TEXT,

  label        TEXT NOT NULL,
  note         TEXT,
  grp          TEXT,                  -- Kitchen, Around the house, Windows...

  -- What she usually charges, in cents. Null means "always quoted fresh",
  -- which is a real answer and better than a zero that looks like free.
  default_cents INTEGER,

  -- each | hour | room | sqft — shown beside the price so "3" is not
  -- ambiguous on a quote.
  unit         TEXT NOT NULL DEFAULT 'each',

  active       INTEGER NOT NULL DEFAULT 1,
  sort         INTEGER NOT NULL DEFAULT 100,
  times_used   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_price_book_active ON price_book(active, grp, sort);
