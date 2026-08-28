-- RentCast's free tier is 50 lookups a month and the admin button can be tapped
-- again and again on the same lead, so the allowance can go in an afternoon by
-- accident. Every answer — including "no record for this address" — is kept here
-- and served back without spending a request.
CREATE TABLE IF NOT EXISTS property_cache (
  address_key TEXT PRIMARY KEY,
  property    TEXT,
  found       INTEGER NOT NULL DEFAULT 0,
  provider    TEXT NOT NULL DEFAULT 'rentcast',
  created_at  TEXT NOT NULL,
  hits        INTEGER NOT NULL DEFAULT 0
);
