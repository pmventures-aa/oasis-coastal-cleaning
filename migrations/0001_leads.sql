-- Oasis Coastal Cleaning — lead storage
--
-- Apply with:
--   npx wrangler d1 migrations apply oasis --remote
--
-- Every quote request lands here. The site works without this table — the
-- form still emails Kristina — but the admin portal has nothing to show
-- until the database exists.

CREATE TABLE IF NOT EXISTS leads (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL,

  -- who they are
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL,
  email          TEXT NOT NULL,
  best_time      TEXT,
  contact_pref   TEXT,

  -- what they want
  service        TEXT NOT NULL,
  service_label  TEXT,
  property_type  TEXT,
  size_label     TEXT,
  bedrooms       TEXT,
  bathrooms      TEXT,
  frequency      TEXT,
  first_visit    INTEGER DEFAULT 0,
  add_ons        TEXT,          -- JSON array of labels
  conditions     TEXT,          -- JSON array of labels
  notes          TEXT,

  -- where and when
  city           TEXT,
  zip            TEXT,
  address        TEXT,
  start_when     TEXT,
  preferred_days TEXT,
  access         TEXT,

  -- what she should quote, computed from her own rates
  estimate_low   INTEGER,
  estimate_high  INTEGER,

  -- how she is handling it
  status         TEXT NOT NULL DEFAULT 'new',   -- new | contacted | quoted | booked | closed
  followup       TEXT,                          -- call | visit | none
  admin_notes    TEXT,

  -- provenance
  source_page    TEXT,
  user_agent     TEXT
);

CREATE INDEX IF NOT EXISTS idx_leads_created ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status  ON leads (status);
