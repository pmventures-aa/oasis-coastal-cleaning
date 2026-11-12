-- When a request became a client.
--
-- Every lead is linked to a customer the moment it arrives, so
-- customer_id has never meant "converted" -- it means "we worked out who
-- this is". The moment that matters is when they said yes and the
-- request turned into work, which is when the lead goes to 'booked'.
--
-- Stamped rather than derived, for two reasons: the status can be moved
-- back by hand, and the date is the thing the record's history needs in
-- order to say "became a client" in the right place in the story.

ALTER TABLE leads ADD COLUMN converted_at TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_converted ON leads(converted_at, archived_at);
