/**
 * The database schema, applied by the site itself.
 *
 * The migrations in /migrations are the record of how the schema grew, and
 * they had to be pasted into the D1 console by hand — which meant features
 * sat switched off because nobody had run a file. Everything needed is listed
 * here as statements that are safe to run twice, so the portal can bring its
 * own database up to date and say what it did.
 *
 * Adding a column: put it in COLUMNS. Adding a table: put it in TABLES. Both
 * are checked and applied every time setup runs, so this file is the thing to
 * keep true and the migrations are the history.
 */

const TABLES = [
  ['quotes', `CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT,
    status TEXT NOT NULL DEFAULT 'draft', token TEXT NOT NULL UNIQUE,
    customer_name TEXT, customer_email TEXT, line_items TEXT NOT NULL,
    subtotal INTEGER NOT NULL DEFAULT 0, tax INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0, notes TEXT, terms TEXT, expires_at TEXT,
    sent_at TEXT, accepted_at TEXT, declined_at TEXT)`],

  ['quote_events', `CREATE TABLE IF NOT EXISTS quote_events (
    id TEXT PRIMARY KEY, quote_id TEXT NOT NULL, created_at TEXT NOT NULL,
    kind TEXT NOT NULL, detail TEXT)`],

  ['property_cache', `CREATE TABLE IF NOT EXISTS property_cache (
    address_key TEXT PRIMARY KEY, property TEXT, found INTEGER NOT NULL DEFAULT 0,
    provider TEXT NOT NULL DEFAULT 'rentcast', created_at TEXT NOT NULL,
    hits INTEGER NOT NULL DEFAULT 0)`],

  ['customers', `CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT,
    name TEXT NOT NULL, company TEXT, phone TEXT, email TEXT,
    contact_pref TEXT, best_time TEXT, notes TEXT, archived_at TEXT)`],

  ['properties', `CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT,
    label TEXT, address TEXT, city TEXT, zip TEXT, property_type TEXT,
    bedrooms TEXT, bathrooms TEXT, size_label TEXT, access TEXT, notes TEXT, archived_at TEXT)`],

  ['settings', `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)`],

  ['zip_cache', `CREATE TABLE IF NOT EXISTS zip_cache (
    zip TEXT PRIMARY KEY, city TEXT, state TEXT, county TEXT,
    created_at TEXT NOT NULL, hits INTEGER NOT NULL DEFAULT 0)`],

  ['submissions', `CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY, ip TEXT, created_at TEXT NOT NULL, kind TEXT)`]
];

/* Columns added to tables that already existed. SQLite has no
   ADD COLUMN IF NOT EXISTS, so each is tried and a duplicate is ignored. */
const COLUMNS = [
  ['quotes', 'email_provider_id', 'TEXT'],
  ['quotes', 'email_status', 'TEXT'],
  ['quotes', 'email_delivered_at', 'TEXT'],
  ['quotes', 'email_opened_at', 'TEXT'],
  ['quotes', 'first_viewed_at', 'TEXT'],
  ['quotes', 'last_viewed_at', 'TEXT'],
  ['quotes', 'view_count', 'INTEGER DEFAULT 0'],
  ['quotes', 'archived_at', 'TEXT'],
  ['quotes', 'accepted_ip', 'TEXT'],
  ['quotes', 'accepted_country', 'TEXT'],
  ['quotes', 'accepted_region', 'TEXT'],
  ['quotes', 'accepted_city', 'TEXT'],
  ['quotes', 'accepted_user_agent', 'TEXT'],
  ['quotes', 'reopened_at', 'TEXT'],
  ['quotes', 'reopen_reason', 'TEXT'],
  ['quotes', 'completed_at', 'TEXT'],
  ['quotes', 'paid_at', 'TEXT'],
  ['quotes', 'paid_note', 'TEXT'],
  ['leads', 'archived_at', 'TEXT'],
  ['leads', 'customer_id', 'TEXT'],
  ['leads', 'property_id', 'TEXT']
];

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_quotes_lead ON quotes(lead_id)',
  'CREATE INDEX IF NOT EXISTS idx_quotes_token ON quotes(token)',
  'CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status)',
  'CREATE INDEX IF NOT EXISTS idx_quote_events_quote ON quote_events(quote_id)',
  'CREATE INDEX IF NOT EXISTS idx_properties_customer ON properties(customer_id)',
  'CREATE INDEX IF NOT EXISTS idx_leads_customer ON leads(customer_id)',
  'CREATE INDEX IF NOT EXISTS idx_leads_property ON leads(property_id)',
  'CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)',
  'CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email)',
  'CREATE INDEX IF NOT EXISTS idx_submissions_ip ON submissions(ip, created_at)'
];

/* Turns the leads that already exist into customers and properties. Only ever
   touches rows that have not been linked, so running it again does nothing. */
const BACKFILL = [
  `INSERT INTO customers (id, created_at, name, phone, email, contact_pref, best_time)
   SELECT 'c-' || MIN(l.id), MIN(l.created_at), MIN(l.name), MIN(l.phone),
          LOWER(TRIM(MIN(l.email))), MIN(l.contact_pref), MIN(l.best_time)
   FROM leads l WHERE l.customer_id IS NULL
   GROUP BY COALESCE(NULLIF(LOWER(TRIM(l.email)), ''),
     'phone:' || REPLACE(REPLACE(REPLACE(REPLACE(l.phone,'(',''),')',''),'-',''),' ',''))`,

  `UPDATE leads SET customer_id = (
     SELECT c.id FROM customers c
     WHERE (NULLIF(LOWER(TRIM(leads.email)), '') IS NOT NULL AND c.email = LOWER(TRIM(leads.email)))
        OR (NULLIF(LOWER(TRIM(leads.email)), '') IS NULL
            AND REPLACE(REPLACE(REPLACE(REPLACE(c.phone,'(',''),')',''),'-',''),' ','')
              = REPLACE(REPLACE(REPLACE(REPLACE(leads.phone,'(',''),')',''),'-',''),' ',''))
     LIMIT 1) WHERE customer_id IS NULL`,

  `INSERT INTO properties (id, customer_id, created_at, address, city, zip, property_type,
                           bedrooms, bathrooms, size_label, access)
   SELECT 'p-' || l.id, l.customer_id, l.created_at, l.address, l.city, l.zip,
          l.property_type, l.bedrooms, l.bathrooms, l.size_label, l.access
   FROM leads l WHERE l.property_id IS NULL AND l.customer_id IS NOT NULL`,

  `UPDATE leads SET property_id = 'p-' || id
   WHERE property_id IS NULL AND customer_id IS NOT NULL`
];

/**
 * What is missing, without changing anything.
 *
 * The health panel used to ask only whether tables existed, so a release that
 * added a column left the portal insisting everything was fine while the
 * screens that needed it failed. It checks columns now too.
 */
export async function checkSchema(db) {
  const missingTables = [], missingColumns = [];
  if (!db) return { ok: false, missingTables, missingColumns, noDatabase: true };

  for (const [name] of TABLES) {
    try { await db.prepare(`SELECT 1 FROM ${name} LIMIT 1`).first(); }
    catch { missingTables.push(name); }
  }

  // One read per table tells us every column it has.
  const seen = {};
  for (const [table, column] of COLUMNS) {
    if (missingTables.includes(table)) continue;
    if (!seen[table]) {
      try {
        const info = await db.prepare(`PRAGMA table_info(${table})`).all();
        seen[table] = new Set((info.results || []).map((r) => r.name));
      } catch {
        seen[table] = null;
      }
    }
    if (seen[table] && !seen[table].has(column)) missingColumns.push(`${table}.${column}`);
  }

  return {
    ok: !missingTables.length && !missingColumns.length,
    missingTables,
    missingColumns
  };
}

const isDuplicate = (message) =>
  /duplicate column|already exists/i.test(String(message || ''));

/**
 * Brings the database up to date. Safe to run any number of times.
 * Returns what it created, what was already there, and anything that failed.
 */
export async function applySchema(db) {
  const created = [], existed = [], failed = [];
  if (!db) return { ok: false, created, existed, failed: ['No database is connected.'] };

  for (const [name, ddl] of TABLES) {
    let before = true;
    try { await db.prepare(`SELECT 1 FROM ${name} LIMIT 1`).first(); }
    catch { before = false; }
    try {
      await db.prepare(ddl).run();
      (before ? existed : created).push(name);
    } catch (err) {
      failed.push(`${name}: ${err && err.message || err}`);
    }
  }

  for (const [table, column, type] of COLUMNS) {
    try {
      await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
      created.push(`${table}.${column}`);
    } catch (err) {
      if (!isDuplicate(err && err.message)) {
        failed.push(`${table}.${column}: ${err && err.message || err}`);
      }
    }
  }

  for (const sql of INDEXES) {
    try { await db.prepare(sql).run(); }
    catch (err) { failed.push(`index: ${err && err.message || err}`); }
  }

  let linked = 0;
  try {
    for (const sql of BACKFILL) {
      const res = await db.prepare(sql).run();
      linked += (res && res.meta && res.meta.changes) || 0;
    }
  } catch (err) {
    failed.push(`linking existing leads: ${err && err.message || err}`);
  }

  return { ok: failed.length === 0, created, existed, failed, linked };
}
