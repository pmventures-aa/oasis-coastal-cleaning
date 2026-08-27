-- Paste ONE statement at a time into the D1 Console and press Execute.
-- The console rejects comments and multiple statements together, which is
-- what "incomplete input: SQLITE_ERROR" means. These three have no comments
-- inside them and each is a single line.

-- ---------- statement 1 of 3 ----------
CREATE TABLE IF NOT EXISTS leads ( id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL, best_time TEXT, contact_pref TEXT, service TEXT NOT NULL, service_label TEXT, property_type TEXT, size_label TEXT, bedrooms TEXT, bathrooms TEXT, frequency TEXT, first_visit INTEGER DEFAULT 0, add_ons TEXT, conditions TEXT, notes TEXT, city TEXT, zip TEXT, address TEXT, start_when TEXT, preferred_days TEXT, access TEXT, status TEXT NOT NULL DEFAULT 'new', followup TEXT, quoted_amount TEXT, quoted_at TEXT, next_visit TEXT, admin_notes TEXT, estimate_low INTEGER, estimate_high INTEGER, source_page TEXT, user_agent TEXT );

-- ---------- statement 2 of 3 ----------
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads (created_at DESC);

-- ---------- statement 4 of 7 ----------
CREATE TABLE IF NOT EXISTS quotes ( id TEXT PRIMARY KEY, lead_id TEXT, token TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT, sent_at TEXT, accepted_at TEXT, status TEXT NOT NULL DEFAULT 'draft', customer_name TEXT NOT NULL, customer_email TEXT NOT NULL, customer_phone TEXT, service_label TEXT, frequency TEXT, intro TEXT, line_items TEXT NOT NULL, notes TEXT, price_note TEXT, valid_until TEXT, accepted_name TEXT, accepted_ip TEXT, accepted_ua TEXT );

-- ---------- statement 5 of 7 ----------
CREATE INDEX IF NOT EXISTS idx_quotes_lead ON quotes (lead_id);

-- ---------- statement 6 of 7 ----------
CREATE INDEX IF NOT EXISTS idx_quotes_token ON quotes (token);

-- ---------- statement 7 of 7 ----------
CREATE INDEX IF NOT EXISTS idx_quotes_created ON quotes (created_at DESC);
