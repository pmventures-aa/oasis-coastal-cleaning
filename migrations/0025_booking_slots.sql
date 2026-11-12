-- Times a client may take.
--
-- Not computed. There is no record anywhere of when Kristina works, and
-- guessing would mean offering a stranger a Sunday morning because the
-- diary happened to be empty. She puts up the times she is willing to
-- have taken, and those are the only ones anyone is ever shown.
--
-- A slot can be tied to one quote (offered only on that quote), to one
-- customer (their standing link), or to neither, which puts it in the
-- open pool any booking link may draw from.
--
-- Taking one is a race: two people can open the same link at once. The
-- claim is an UPDATE conditioned on it still being free, so the second
-- one loses and is told, rather than both being told yes.

CREATE TABLE IF NOT EXISTS booking_slots (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,

  start_at    TEXT NOT NULL,
  end_at      TEXT NOT NULL,

  quote_id    TEXT,
  customer_id TEXT,
  note        TEXT,

  booked_at             TEXT,
  booked_appointment_id TEXT,
  booked_name           TEXT,
  archived_at           TEXT
);
CREATE INDEX IF NOT EXISTS idx_booking_slots_open
  ON booking_slots(booked_at, archived_at, start_at);
CREATE INDEX IF NOT EXISTS idx_booking_slots_quote ON booking_slots(quote_id);
CREATE INDEX IF NOT EXISTS idx_booking_slots_customer ON booking_slots(customer_id);
