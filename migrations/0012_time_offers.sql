-- Oasis Coastal Cleaning — offering a customer a few times to pick from.
--
-- Until now agreeing a date meant a chain of texts: Kristina suggests three
-- times, the customer answers two days later, and by then she may have given
-- one of them away. Nothing in the database knew an offer had been made, so
-- nothing could stop that.
--
-- An offer is a short list of times sent to one customer with a link. It does
-- NOT hold the diary: offering three times for one job must not black out
-- three slots she can still sell. What it does instead is make the offer
-- visible on her own calendar, and re-check every time against the live
-- diary at the moment the customer picks. An offer is a question, never a
-- promise -- the appointment it creates is the promise.
--
-- Times are UTC instants, as in migration 0011. Offers are always timed, so
-- there is no all-day case here.
--
-- Apply with the Cloudflare dashboard (D1 -> oasis -> Console) or:
--   npx wrangler d1 migrations apply oasis --remote

CREATE TABLE IF NOT EXISTS time_offers (
  id            TEXT PRIMARY KEY,
  token         TEXT NOT NULL UNIQUE,     -- the public link
  created_at    TEXT NOT NULL,
  updated_at    TEXT,

  -- Where it came from. All optional: she can offer times to someone who is
  -- not yet a customer and has no quote.
  lead_id       TEXT,
  quote_id      TEXT,
  customer_id   TEXT,

  -- Copied at the time of offering, so later edits do not rewrite history.
  customer_name TEXT,
  email         TEXT,
  phone         TEXT,
  address       TEXT,
  city          TEXT,
  zip           TEXT,
  service_label TEXT,

  duration_minutes INTEGER NOT NULL DEFAULT 120,
  note          TEXT,                     -- a line from her, shown to them

  -- open      — sent, waiting for an answer, slots still offered
  -- booked    — they picked one; appointment_id is the result
  -- withdrawn — she pulled it back
  -- expired   — nobody answered in time
  status        TEXT NOT NULL DEFAULT 'open',
  expires_at    TEXT,

  appointment_id TEXT,                    -- set once booked
  chosen_slot_id TEXT,
  booked_at     TEXT
);

CREATE TABLE IF NOT EXISTS time_offer_slots (
  id        TEXT PRIMARY KEY,
  offer_id  TEXT NOT NULL,
  position  INTEGER NOT NULL DEFAULT 0,
  start_at  TEXT NOT NULL,                -- UTC ISO
  end_at    TEXT NOT NULL                 -- UTC ISO
);

CREATE INDEX IF NOT EXISTS idx_time_offers_token ON time_offers(token);
CREATE INDEX IF NOT EXISTS idx_time_offers_status ON time_offers(status);
CREATE INDEX IF NOT EXISTS idx_offer_slots_offer ON time_offer_slots(offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_slots_start ON time_offer_slots(start_at);
