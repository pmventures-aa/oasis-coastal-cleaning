-- A standing link for a regular.
--
-- A quote's link belongs to that quote and dies with it. Somebody she
-- cleans for every fortnight should not need a new link each time: this
-- one is theirs, it does not expire, and it shows whatever times she
-- currently has up.
--
-- It is also how they see what they owe, so it is a password to their
-- own record and nothing else. She can replace it, which stops the old
-- one that moment.

ALTER TABLE customers ADD COLUMN link_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_link_token ON customers(link_token);
