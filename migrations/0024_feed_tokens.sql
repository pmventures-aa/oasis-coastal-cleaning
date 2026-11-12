-- A calendar feed per person.
--
-- There were three links: hers, one for staff, and one that shows only
-- that a time is taken. The staff link carries everything hers does, so a
-- cleaner subscribing to it saw every job in the business rather than
-- their own.
--
-- This is the cleaner's own link. It is unguessable, it carries only the
-- visits assigned to them, and she can replace it for one person without
-- touching anybody else's phone.

ALTER TABLE users ADD COLUMN feed_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_feed_token ON users(feed_token);
