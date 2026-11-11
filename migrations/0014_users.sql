-- Oasis Coastal Cleaning — named people, instead of one shared password.
--
-- Until now there was one password and anyone holding it was "the admin".
-- That was honest while Kristina worked alone. It stops being honest the
-- day she hires somebody: a cleaner needs the address and the gate code for
-- the houses she is sent to, and has no business seeing what any of it was
-- sold for.
--
-- The shared password in ADMIN_PASSWORD KEEPS WORKING and signs in as the
-- owner. That is deliberate. A migration that swapped one for the other
-- would mean a bad deploy locks her out of her own business from a phone in
-- a driveway. Named users are added alongside it, not instead of it.
--
-- Passwords are PBKDF2-HMAC-SHA256 over a per-user random salt. The
-- iteration count is stored per row rather than baked in, so it can be
-- raised later without invalidating everybody's password.
--
-- Apply with the Cloudflare dashboard (D1 -> oasis -> Console) or:
--   npx wrangler d1 migrations apply oasis --remote

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  updated_at    TEXT,

  name          TEXT NOT NULL,
  email         TEXT NOT NULL,          -- what they sign in with
  phone         TEXT,

  -- owner       — Kristina: everything, including money and who else has access
  -- staff_admin — sees the whole diary and the client list, but no money
  -- cleaner     — only the visits assigned to them
  role          TEXT NOT NULL DEFAULT 'cleaner',

  password_hash TEXT,                   -- base64url of the derived bits
  password_salt TEXT,                   -- base64url, 16 random bytes
  iterations    INTEGER NOT NULL DEFAULT 600000,

  -- Switched off rather than deleted: their name stays readable on the
  -- visits they worked and the letters they sent.
  active        INTEGER NOT NULL DEFAULT 1,
  last_seen_at  TEXT,
  created_by    TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(lower(email));
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role, active);

-- Who is going to this one. A visit has one owner of the work; a second
-- pair of hands is a second assignment row later if it is ever needed.
ALTER TABLE appointments ADD COLUMN assigned_to TEXT;
CREATE INDEX IF NOT EXISTS idx_appointments_assigned ON appointments(assigned_to);
