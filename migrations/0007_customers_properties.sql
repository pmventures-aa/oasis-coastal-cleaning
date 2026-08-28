-- People, and the places they own.
--
-- Until now one row held a person, an address and a job all at once. That is
-- true for most of Kristina's work and wrong for the part she wants to grow:
-- a manager with six Airbnbs, or a family with a house and a condo, arrived as
-- six unrelated rows that happened to share a phone number. She could not see
-- them together, and every new address meant retyping the person.
--
-- So: a customer is a person or a company. A property is somewhere she cleans.
-- One customer has many properties. Everything else — leads, quotes — hangs off
-- a property, and through it, off a customer.
--
-- This migration is additive. Existing leads keep every column they have; the
-- new ids are filled in below and nothing reads them until it finds them.

CREATE TABLE IF NOT EXISTS customers (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  updated_at    TEXT,
  name          TEXT NOT NULL,
  company       TEXT,                 -- set when the customer is a business
  phone         TEXT,
  email         TEXT,
  contact_pref  TEXT,
  best_time     TEXT,
  notes         TEXT,                 -- Kristina's notes about the person
  archived_at   TEXT
);

CREATE TABLE IF NOT EXISTS properties (
  id            TEXT PRIMARY KEY,
  customer_id   TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT,
  label         TEXT,                 -- "Unit 4B", "the beach house"
  address       TEXT,
  city          TEXT,
  zip           TEXT,
  property_type TEXT,
  bedrooms      TEXT,
  bathrooms     TEXT,
  size_label    TEXT,
  access        TEXT,                 -- how to get in
  notes         TEXT,                 -- what this place needs
  archived_at   TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

ALTER TABLE leads ADD COLUMN customer_id TEXT;
ALTER TABLE leads ADD COLUMN property_id TEXT;

CREATE INDEX IF NOT EXISTS idx_properties_customer ON properties(customer_id);
CREATE INDEX IF NOT EXISTS idx_leads_customer ON leads(customer_id);
CREATE INDEX IF NOT EXISTS idx_leads_property ON leads(property_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
