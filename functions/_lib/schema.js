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
  ['visit_photos', `CREATE TABLE IF NOT EXISTS visit_photos (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, appointment_id TEXT NOT NULL,
    customer_id TEXT, object_key TEXT NOT NULL, file_name TEXT, content_type TEXT,
    size_bytes INTEGER, caption TEXT, client_visible INTEGER NOT NULL DEFAULT 0,
    approved_at TEXT, approved_by TEXT, uploaded_by TEXT, archived_at TEXT)`],
  ['issue_categories', `CREATE TABLE IF NOT EXISTS issue_categories (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, label TEXT NOT NULL,
    note TEXT, sort INTEGER NOT NULL DEFAULT 100, active INTEGER NOT NULL DEFAULT 1)`],
  ['visit_issues', `CREATE TABLE IF NOT EXISTS visit_issues (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, appointment_id TEXT NOT NULL,
    customer_id TEXT, category_id TEXT, category_label TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'note', body TEXT, reported_by TEXT,
    approved_at TEXT, approved_by TEXT, sent_at TEXT,
    resolved_at TEXT, archived_at TEXT)`],
  ['security_events', `CREATE TABLE IF NOT EXISTS security_events (
    id TEXT PRIMARY KEY, at TEXT NOT NULL, kind TEXT NOT NULL,
    user_id TEXT, email TEXT, detail TEXT, ip TEXT, user_agent TEXT)`],
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
    id TEXT PRIMARY KEY, ip TEXT, created_at TEXT NOT NULL, kind TEXT)`],

  /* The diary. See migrations/0011_schedule.sql for why timed rows hold
     instants and all-day rows hold local dates. */
  ['appointments', `CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT,
    lead_id TEXT, quote_id TEXT, customer_id TEXT, property_id TEXT,
    title TEXT, customer_name TEXT, phone TEXT, address TEXT, city TEXT, zip TEXT,
    service_label TEXT, status TEXT NOT NULL DEFAULT 'confirmed',
    all_day INTEGER NOT NULL DEFAULT 0,
    start_at TEXT, end_at TEXT, start_date TEXT, end_date TEXT,
    notes TEXT, series_id TEXT, series_rule TEXT,
    cancelled_at TEXT, archived_at TEXT)`],

  ['availability_blocks', `CREATE TABLE IF NOT EXISTS availability_blocks (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT,
    note TEXT, address TEXT, all_day INTEGER NOT NULL DEFAULT 0,
    start_at TEXT, end_at TEXT, start_date TEXT, end_date TEXT,
    repeat_freq TEXT, repeat_days TEXT, repeat_until TEXT, skip_dates TEXT,
    archived_at TEXT)`],

  ['schedule_events', `CREATE TABLE IF NOT EXISTS schedule_events (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL,
    subject_kind TEXT NOT NULL, subject_id TEXT NOT NULL,
    kind TEXT NOT NULL, detail TEXT)`],

  /* Every customer email she sends, written down once and never rewritten.
     See migration 0012. */
  /* Invoices, and the money actually received. See migration 0017. */
  ['invoices', `CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT, number TEXT,
    customer_id TEXT, lead_id TEXT, quote_id TEXT, job_id TEXT, appointment_id TEXT,
    customer_name TEXT, email TEXT, address TEXT, city TEXT,
    line_items TEXT, subtotal INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0, amount_paid INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft', due_date TEXT, sent_at TEXT,
    notes TEXT, archived_at TEXT)`],
  ['payments', `CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL, created_at TEXT NOT NULL,
    paid_at TEXT NOT NULL, amount INTEGER NOT NULL,
    method TEXT NOT NULL DEFAULT 'other', method_note TEXT, reference TEXT,
    recorded_by TEXT, voided_at TEXT)`],

  /* Her own list of what things are and what she charges. Migration 0016. */
  ['price_book', `CREATE TABLE IF NOT EXISTS price_book (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT,
    label TEXT NOT NULL, note TEXT, grp TEXT, default_cents INTEGER,
    unit TEXT NOT NULL DEFAULT 'each', active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 100, times_used INTEGER NOT NULL DEFAULT 0)`],

  /* The arrangement, and the visits it is made of. See migration 0015. */
  ['jobs', `CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT,
    customer_id TEXT, property_id TEXT, lead_id TEXT, quote_id TEXT,
    title TEXT, service_label TEXT, customer_name TEXT, phone TEXT,
    address TEXT, city TEXT, zip TEXT, notes TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    freq TEXT, byday TEXT, start_date TEXT, until_date TEXT,
    start_time TEXT, duration_min INTEGER NOT NULL DEFAULT 120,
    assigned_to TEXT, archived_at TEXT)`],
  ['job_exceptions', `CREATE TABLE IF NOT EXISTS job_exceptions (
    id TEXT PRIMARY KEY, job_id TEXT NOT NULL, occurrence_date TEXT NOT NULL,
    kind TEXT NOT NULL, created_at TEXT NOT NULL)`],

  /* Named people, alongside the shared password. See migration 0014. */
  ['users', `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT,
    name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT,
    role TEXT NOT NULL DEFAULT 'cleaner',
    password_hash TEXT, password_salt TEXT,
    iterations INTEGER NOT NULL DEFAULT 600000,
    active INTEGER NOT NULL DEFAULT 1, last_seen_at TEXT, created_by TEXT)`],

  ['email_log', `CREATE TABLE IF NOT EXISTS email_log (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, kind TEXT NOT NULL,
    entity_kind TEXT, entity_id TEXT, customer_id TEXT,
    to_email TEXT NOT NULL, subject TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent', error TEXT, sent_by TEXT,
    edited INTEGER NOT NULL DEFAULT 0)`],


];

/* Columns added to tables that already existed. SQLite has no
   ADD COLUMN IF NOT EXISTS, so each is tried and a duplicate is ignored. */
const COLUMNS = [
  /* A cleaner's own calendar feed (0024). */
  ['users', 'feed_token', 'TEXT'],
  /* What the cleaner reads at the door (0021). */
  ['properties', 'bins', 'TEXT'],
  ['properties', 'supplies', 'TEXT'],
  ['properties', 'do_not_touch', 'TEXT'],
  ['properties', 'warnings', 'TEXT'],
  /* Sign everyone out, for a stateless cookie (0020). */
  ['users', 'sessions_valid_from', 'INTEGER NOT NULL DEFAULT 0'],
  /* Which of the two ways a quote came to be marked paid (0019). */
  ['quotes', 'paid_source', 'TEXT'],
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
  ['leads', 'property_id', 'TEXT'],
  /* The facts she re-learns on every visit. See migration 0013. */
  ['properties', 'parking', 'TEXT'],
  ['properties', 'pets', 'TEXT'],
  ['properties', 'preferred_day', 'TEXT'],
  ['appointments', 'assigned_to', 'TEXT'],
  ['appointments', 'job_id', 'TEXT'],
  ['appointments', 'occurrence_date', 'TEXT'],
  /* What happens at the house. See migration 0018. */
  ['appointments', 'checklist', 'TEXT'],
  ['appointments', 'internal_note', 'TEXT'],
  ['appointments', 'client_summary', 'TEXT'],
  ['appointments', 'completed_at', 'TEXT'],
  ['appointments', 'completed_by', 'TEXT']
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
  'CREATE INDEX IF NOT EXISTS idx_submissions_ip ON submissions(ip, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_appt_start ON appointments(start_at)',
  'CREATE INDEX IF NOT EXISTS idx_appt_dates ON appointments(start_date)',
  'CREATE INDEX IF NOT EXISTS idx_appt_status ON appointments(status)',
  'CREATE INDEX IF NOT EXISTS idx_appt_series ON appointments(series_id)',
  'CREATE INDEX IF NOT EXISTS idx_appt_lead ON appointments(lead_id)',
  'CREATE INDEX IF NOT EXISTS idx_block_start ON availability_blocks(start_at)',
  'CREATE INDEX IF NOT EXISTS idx_block_dates ON availability_blocks(start_date)',
  'CREATE INDEX IF NOT EXISTS idx_sched_ev ON schedule_events(subject_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_email_log_entity ON email_log(entity_kind, entity_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_email_log_customer ON email_log(customer_id, created_at)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(lower(email))',
  'CREATE INDEX IF NOT EXISTS idx_users_role ON users(role, active)',
  'CREATE INDEX IF NOT EXISTS idx_appointments_assigned ON appointments(assigned_to)',
  'CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, archived_at)',
  'CREATE INDEX IF NOT EXISTS idx_job_exceptions ON job_exceptions(job_id, occurrence_date)',
  'CREATE INDEX IF NOT EXISTS idx_appointments_job ON appointments(job_id)',
  'CREATE INDEX IF NOT EXISTS idx_price_book_active ON price_book(active, grp, sort)',
  'CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id, paid_at)'
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
/* The three schedule tables on their own.
 *
 * Asking someone to press a setup button before a feature works is how a
 * finished feature sits switched off. The schedule creates its own tables
 * the first time a signed-in request needs them: the statements are the
 * same ones setup runs, they are safe to run twice, and the caller is
 * already behind the login. */
const SCHEDULE_TABLES = ['appointments', 'availability_blocks', 'schedule_events',
  'email_log', 'users', 'jobs', 'job_exceptions', 'price_book',
  'invoices', 'payments'];

export async function ensureScheduleTables(db) {
  if (!db) return false;
  try {
    for (const [name, ddl] of TABLES) {
      if (SCHEDULE_TABLES.includes(name)) await db.prepare(ddl).run();
    }
    for (const sql of INDEXES) {
      if (SCHEDULE_TABLES.some((t) => sql.includes(' ON ' + t + '('))) {
        try { await db.prepare(sql).run(); } catch { /* an index is an optimisation */ }
      }
    }
    await db.prepare('SELECT 1 FROM appointments LIMIT 1').first();
    return true;
  } catch {
    return false;
  }
}

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
