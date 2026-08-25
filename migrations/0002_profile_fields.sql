-- Adds the fields Kristina fills in herself, as opposed to the ones the
-- customer sent. Safe to run on a database that already has leads in it.
--
-- Apply with:  npx wrangler d1 migrations apply oasis --remote
-- Or paste into the D1 Console in the Cloudflare dashboard.

ALTER TABLE leads ADD COLUMN quoted_amount TEXT;
ALTER TABLE leads ADD COLUMN quoted_at     TEXT;
ALTER TABLE leads ADD COLUMN next_visit    TEXT;
ALTER TABLE leads ADD COLUMN updated_at    TEXT;
