-- Oasis Coastal Cleaning — what the cleaner found.
--
-- Two tables, because the list of what can go wrong is Kristina's, not
-- mine. A fixed catalogue of categories would be a guess about her work
-- that she cannot correct.
--
-- Nothing here reaches a client on its own. A cleaner reports; it sits
-- with Kristina; she ticks it through and only then is it client-safe.
-- That is the same rule as every other outbound thing in this portal:
-- nothing leaves without her hand on it.

CREATE TABLE IF NOT EXISTS issue_categories (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  label      TEXT NOT NULL,          -- "Damage", "Left a key out", "Pest"
  note       TEXT,                   -- what she means by it, for whoever reports
  sort       INTEGER NOT NULL DEFAULT 100,
  active     INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_issue_categories_active
  ON issue_categories(active, sort);

CREATE TABLE IF NOT EXISTS visit_issues (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  customer_id    TEXT,

  -- The category as chosen, and its label frozen at the time. If she
  -- renames or retires a category later, what was reported still reads
  -- the way it was reported.
  category_id    TEXT,
  category_label TEXT NOT NULL,

  severity       TEXT NOT NULL DEFAULT 'note',   -- note | attention | urgent
  body           TEXT,
  reported_by    TEXT,

  -- The gate. Client-safe only once she has ticked it, and the tick is
  -- undoable because she will mis-tap.
  approved_at    TEXT,
  approved_by    TEXT,
  -- When she actually told them, which is a separate act from approving.
  sent_at        TEXT,

  resolved_at    TEXT,
  archived_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_visit_issues_appt ON visit_issues(appointment_id);
CREATE INDEX IF NOT EXISTS idx_visit_issues_open
  ON visit_issues(resolved_at, archived_at, created_at DESC);
