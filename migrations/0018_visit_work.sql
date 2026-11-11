-- Oasis Coastal Cleaning — what happens at the house.
--
-- A visit knew when and where. It did not know what was actually done, so
-- "did we do the oven last time?" was answered from memory.
--
-- Three things, all on the visit itself because that is where they happen:
--
--   checklist      what this clean is made of, ticked off as she goes
--   internal_note  gate was stuck, dog was out, took longer than usual --
--                  hers, never shown to anybody
--   client_summary the line that goes in the "all done" email
--
-- The two notes are separate fields rather than one, because the whole risk
-- here is a private note ending up in a customer's inbox. One field with a
-- rule about it would get that wrong eventually.
--
-- Photos are NOT here. They need object storage that this project does not
-- have yet, and a photo feature that cannot store a photo is worse than
-- none. See README.
--
-- Apply with the Cloudflare dashboard (D1 -> oasis -> Console) or:
--   npx wrangler d1 migrations apply oasis --remote

ALTER TABLE appointments ADD COLUMN checklist TEXT;         -- JSON [{label, done}]
ALTER TABLE appointments ADD COLUMN internal_note TEXT;
ALTER TABLE appointments ADD COLUMN client_summary TEXT;
ALTER TABLE appointments ADD COLUMN completed_at TEXT;
ALTER TABLE appointments ADD COLUMN completed_by TEXT;
