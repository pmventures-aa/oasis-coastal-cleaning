-- The Security Centre.
--
-- Sign-ins were not recorded anywhere, so "has anyone been trying to get
-- in?" had no answer, and sessions were stateless, so "sign everyone out"
-- was not a thing the portal could do.

CREATE TABLE IF NOT EXISTS security_events (
  id         TEXT PRIMARY KEY,
  at         TEXT NOT NULL,
  -- sign_in | sign_in_failed | sign_out | password_changed
  -- user_added | user_changed | user_disabled | sessions_revoked
  kind       TEXT NOT NULL,
  user_id    TEXT,
  -- Kept as typed, so a failed attempt on an address that does not exist
  -- is still answerable. Never a password.
  email      TEXT,
  detail     TEXT,
  ip         TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_security_events_at ON security_events(at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_kind ON security_events(kind, at DESC);

-- Sessions carry the moment they were issued. Anything issued before this
-- is refused, which is what signing someone out of everywhere means when
-- the cookie itself is stateless. Milliseconds since the epoch.
ALTER TABLE users ADD COLUMN sessions_valid_from INTEGER NOT NULL DEFAULT 0;
