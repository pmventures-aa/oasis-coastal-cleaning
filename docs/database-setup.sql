
CREATE TABLE IF NOT EXISTS leads (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL,
  updated_at     TEXT,

  -- ---- who they are (editable: people mistype their own email) ----
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL,
  email          TEXT NOT NULL,
  best_time      TEXT,
  contact_pref   TEXT,

  -- ---- what they want ----
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

  -- ---- where and when ----
  city           TEXT,
  zip            TEXT,
  address        TEXT,
  start_when     TEXT,
  preferred_days TEXT,          -- JSON array
  access         TEXT,

  -- ---- what Kristina decides ----
  status         TEXT NOT NULL DEFAULT 'new',  -- new|contacted|quoted|booked|closed
  followup       TEXT,                         -- call|visit|none
  quoted_amount  TEXT,                         -- free text: "$185 per visit"
  quoted_at      TEXT,                         -- stamped when first quoted
  next_visit     TEXT,
  admin_notes    TEXT,

  -- ---- kept but never shown; useful when something looks wrong ----
  estimate_low   INTEGER,
  estimate_high  INTEGER,
  source_page    TEXT,
  user_agent     TEXT
);

CREATE INDEX IF NOT EXISTS idx_leads_created ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status  ON leads (status);
