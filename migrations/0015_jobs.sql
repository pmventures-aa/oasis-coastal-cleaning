-- Oasis Coastal Cleaning — the job, and the visits it is made of.
--
-- Until now a cleaning was one row in appointments and that was the whole
-- story. That works for a one-off. It falls apart for "every other Tuesday
-- until she says stop", which is most of her work: there was nowhere to say
-- the arrangement exists, so each visit was typed in again by hand.
--
-- The split is the one every field service system lands on: a JOB is the
-- arrangement (who, where, what, how often) and a VISIT is one trip. A job
-- may have one visit or fifty. A recurring job stays OPEN across its visits
-- and closes when the arrangement ends, not when a visit is done.
--
-- Visits are generated as real rows rather than expanded on read, because
-- each one has to be movable, assignable and completable on its own -- and
-- because the conflict check already works on appointment rows and must not
-- grow a second opinion.
--
-- Recurrence follows RFC 5545 in spirit: the job holds the rule, and
-- exceptions are rows rather than edits to the rule. "Change this one"
-- writes an exception. "Change this and everything after" ends the rule on
-- that date and starts a new job from it, because RFC 5545 has no operator
-- for that and neither does anyone else.
--
-- Apply with the Cloudflare dashboard (D1 -> oasis -> Console) or:
--   npx wrangler d1 migrations apply oasis --remote

CREATE TABLE IF NOT EXISTS jobs (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  updated_at    TEXT,

  customer_id   TEXT,
  property_id   TEXT,
  lead_id       TEXT,
  quote_id      TEXT,

  title         TEXT,
  service_label TEXT,
  customer_name TEXT,
  phone         TEXT,
  address       TEXT,
  city          TEXT,
  zip           TEXT,
  notes         TEXT,

  -- open      — the arrangement is live (a recurring job stays here)
  -- done      — finished, by agreement or because it was a one-off that ran
  -- cancelled — called off
  status        TEXT NOT NULL DEFAULT 'open',

  -- The arrangement. freq null means a one-off.
  --   weekly | biweekly | monthly
  -- byday is a JSON array of 0-6 (Sunday first), used by weekly and biweekly.
  freq          TEXT,
  byday         TEXT,
  start_date    TEXT,              -- YYYY-MM-DD local, the first visit
  until_date    TEXT,              -- YYYY-MM-DD local, inclusive; null = open-ended
  start_time    TEXT,              -- HH:MM local
  duration_min  INTEGER NOT NULL DEFAULT 120,

  assigned_to   TEXT,              -- whose round this is, by default
  archived_at   TEXT
);

-- One occurrence that does not follow the rule. Skipped stays skipped and
-- can be un-skipped, which is why this is a row rather than a deletion.
CREATE TABLE IF NOT EXISTS job_exceptions (
  id            TEXT PRIMARY KEY,
  job_id        TEXT NOT NULL,
  occurrence_date TEXT NOT NULL,   -- YYYY-MM-DD local, the date the rule produced
  kind          TEXT NOT NULL,     -- skipped | moved
  created_at    TEXT NOT NULL
);

ALTER TABLE appointments ADD COLUMN job_id TEXT;
ALTER TABLE appointments ADD COLUMN occurrence_date TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_customer ON jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, archived_at);
CREATE INDEX IF NOT EXISTS idx_job_exceptions ON job_exceptions(job_id, occurrence_date);
CREATE INDEX IF NOT EXISTS idx_appointments_job ON appointments(job_id);
