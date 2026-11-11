-- Oasis Coastal Cleaning — the things about a place she has to remember.
--
-- A property already carries how to get in (access) and what it needs
-- (notes). What it did not carry is the handful of facts she re-learns on
-- every visit and currently keeps in her head or in a text thread: where to
-- park, what the dog is called, which day they like.
--
-- These live on the PROPERTY rather than the customer because a client with
-- two addresses has two answers: the beach house has a lockbox and no dog,
-- the condo has a gate code and a cat that bolts.
--
-- Apply with the Cloudflare dashboard (D1 -> oasis -> Console) or:
--   npx wrangler d1 migrations apply oasis --remote

ALTER TABLE properties ADD COLUMN parking TEXT;        -- "driveway, not the street"
ALTER TABLE properties ADD COLUMN pets TEXT;           -- "Biscuit, friendly. Cat hides."
ALTER TABLE properties ADD COLUMN preferred_day TEXT;  -- "Tuesdays"
