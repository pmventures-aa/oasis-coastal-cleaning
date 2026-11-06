-- Oasis Coastal Cleaning — the schedule.
--
-- Until now nothing in this database said WHEN a clean happens. A lead
-- carries "Within two weeks" and ["Tuesday","Thursday"]; the accepted quote
-- tells the customer that Kristina will text them to agree a date. That date
-- lived in her text messages and nowhere else, so there was nothing a
-- calendar could be a calendar of.
--
-- Two tables. An appointment is a clean in the diary. A block is time she is
-- not available. Both are checked by the same code before anything is saved,
-- because a calendar that can be contradicted by the booking screen is worse
-- than no calendar.
--
-- Times. A timed row stores UTC instants in start_at / end_at, which is the
-- only representation that survives a daylight-saving change. An all-day row
-- is a different animal — it is a claim about local calendar days, not about
-- instants — so it stores start_date / end_date as YYYY-MM-DD in the
-- business time zone and leaves the instants null. Everything that compares
-- the two converts the local dates to instants using the offset in force on
-- that date. See functions/_lib/schedule.js.
--
-- Apply with the Cloudflare dashboard (D1 -> oasis -> Console) or:
--   npx wrangler d1 migrations apply oasis --remote

CREATE TABLE IF NOT EXISTS appointments (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  updated_at    TEXT,

  -- What this clean is for. All optional: she can put a job in the diary
  -- before the paperwork exists, and a job can outlive the quote it came
  -- from. ON DELETE is not declared because D1 does not enforce it here;
  -- the API resolves a missing parent to a plain appointment.
  lead_id       TEXT,
  quote_id      TEXT,
  customer_id   TEXT,
  property_id   TEXT,

  -- Who and where, copied at the time of booking. A customer who moves does
  -- not rewrite the history of where she has already been.
  title         TEXT,
  customer_name TEXT,
  phone         TEXT,
  address       TEXT,
  city          TEXT,
  zip           TEXT,
  service_label TEXT,

  -- confirmed  — agreed, holds the time
  -- tentative  — pencilled in, holds the time, shown as provisional
  -- cancelled  — releases the time, kept for the record
  status        TEXT NOT NULL DEFAULT 'confirmed',

  all_day       INTEGER NOT NULL DEFAULT 0,
  start_at      TEXT,            -- UTC ISO, null when all_day
  end_at        TEXT,            -- UTC ISO, null when all_day
  start_date    TEXT,            -- YYYY-MM-DD local, all-day rows
  end_date      TEXT,            -- YYYY-MM-DD local, inclusive

  notes         TEXT,

  -- A recurring clean is a row per visit sharing a series_id, so one visit
  -- can be moved without touching the rest. series_rule records what it was
  -- generated from, for "change all the later ones".
  series_id     TEXT,
  series_rule   TEXT,

  cancelled_at  TEXT,
  archived_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_appt_start   ON appointments (start_at);
CREATE INDEX IF NOT EXISTS idx_appt_dates   ON appointments (start_date);
CREATE INDEX IF NOT EXISTS idx_appt_status  ON appointments (status);
CREATE INDEX IF NOT EXISTS idx_appt_series  ON appointments (series_id);
CREATE INDEX IF NOT EXISTS idx_appt_lead    ON appointments (lead_id);

CREATE TABLE IF NOT EXISTS availability_blocks (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  updated_at    TEXT,

  -- Optional, and the UI never insists on one. Why she is unavailable is
  -- nobody's business, including this database's. "Busy" is a complete
  -- answer; so is an address, for time she is somewhere that is not a job
  -- in the system.
  note          TEXT,
  address       TEXT,

  all_day       INTEGER NOT NULL DEFAULT 0,
  start_at      TEXT,
  end_at        TEXT,
  start_date    TEXT,
  end_date      TEXT,

  -- A weekly repeat is stored as the rule, not as a thousand rows: the days
  -- it falls on and the date it stops. Expanded when a range is read.
  repeat_freq   TEXT,            -- null | 'weekly'
  repeat_days   TEXT,            -- JSON [0..6], Sunday = 0
  repeat_until  TEXT,            -- YYYY-MM-DD local, inclusive

  -- Single dates lifted out of a repeat: "every Friday, except that one".
  skip_dates    TEXT,            -- JSON array of YYYY-MM-DD

  archived_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_block_start  ON availability_blocks (start_at);
CREATE INDEX IF NOT EXISTS idx_block_dates  ON availability_blocks (start_date);
CREATE INDEX IF NOT EXISTS idx_block_repeat ON availability_blocks (repeat_freq);

-- Every change to the diary, kept whatever happens to the row itself. The
-- login is shared, so this records that a change was made in the portal and
-- never claims to know which person made it.
CREATE TABLE IF NOT EXISTS schedule_events (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  subject_kind  TEXT NOT NULL,   -- 'appointment' | 'block'
  subject_id    TEXT NOT NULL,
  kind          TEXT NOT NULL,   -- created | moved | cancelled | restored | deleted | override
  detail        TEXT             -- JSON
);

CREATE INDEX IF NOT EXISTS idx_sched_ev ON schedule_events (subject_id, created_at);
