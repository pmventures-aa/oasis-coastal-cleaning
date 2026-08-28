-- Who accepted, from where, and on what. A quote acceptance is the moment a
-- price becomes an agreement, so it is worth being able to say later exactly
-- what was clicked and by whom.
ALTER TABLE quotes ADD COLUMN accepted_ip TEXT;
ALTER TABLE quotes ADD COLUMN accepted_country TEXT;
ALTER TABLE quotes ADD COLUMN accepted_region TEXT;
ALTER TABLE quotes ADD COLUMN accepted_city TEXT;
ALTER TABLE quotes ADD COLUMN accepted_user_agent TEXT;
-- Reopening an accepted quote is a deliberate act and is recorded as one.
ALTER TABLE quotes ADD COLUMN reopened_at TEXT;
ALTER TABLE quotes ADD COLUMN reopen_reason TEXT;
