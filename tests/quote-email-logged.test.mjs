/* The quote in the customer's email history.
   -------------------------------------------------------------------------
   The contact record reads a customer's email history straight out of
   email_log, and the manual email centre has always written a row there --
   success or failure, never rewritten. The route that sends the quote did
   not. So Kristina could open a client's record and find every follow-up
   note she had ever typed, and no sign of the quote they were replying to.

   The subtlety that nearly made the fix useless: customer_id lives on the
   lead, not on the quote, and the route's join did not select it. The row
   would have been written, filed under nobody, and never shown. */
import assert from 'node:assert/strict';
import { makeD1 } from './helpers/d1.mjs';
import { makeSessionCookie } from '../functions/_lib/auth.js';
import * as send from '../functions/api/admin/quotes/send.js';

let n = 0;
const testAsync = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

const env = (d, extra) => ({
  DB: d, ADMIN_PASSWORD: 'x', SESSION_SECRET: 's'.repeat(32),
  SITE_URL: 'https://www.oasiscoastalcleaning.com',
  QUOTE_TO_EMAIL: 'kr@test.co',
  /* No provider key at all, so sendEmail reports a reason and nothing leaves
     this process -- which is also the failure path worth checking. */
  ...extra
});
const owner = async (d) => (await makeSessionCookie(env(d), false)).split(';')[0];

function db() {
  const d = makeD1(['0011_schedule.sql', '0014_users.sql', '0009_settings.sql']);
  d._raw.exec(`CREATE TABLE quotes (id TEXT PRIMARY KEY, lead_id TEXT, created_at TEXT,
    updated_at TEXT, status TEXT, token TEXT, line_items TEXT, total INTEGER,
    subtotal INTEGER, tax INTEGER, customer_name TEXT, customer_email TEXT,
    sent_at TEXT, declined_at TEXT, expires_at TEXT, notes TEXT,
    email_status TEXT, email_error TEXT, email_provider_id TEXT, archived_at TEXT)`);
  d._raw.exec(`CREATE TABLE leads (id TEXT PRIMARY KEY, name TEXT, email TEXT,
    service_label TEXT, city TEXT, status TEXT, updated_at TEXT,
    quoted_amount TEXT, quoted_at TEXT, customer_id TEXT)`);
  d._raw.exec(`CREATE TABLE quote_events (id TEXT PRIMARY KEY, quote_id TEXT,
    created_at TEXT, kind TEXT, detail TEXT)`);
  d._raw.exec(`CREATE TABLE email_log (id TEXT PRIMARY KEY, created_at TEXT NOT NULL,
    kind TEXT NOT NULL, entity_kind TEXT, entity_id TEXT, customer_id TEXT,
    to_email TEXT NOT NULL, subject TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'sent',
    error TEXT, sent_by TEXT, edited INTEGER NOT NULL DEFAULT 0)`);
  d._raw.exec(`INSERT INTO leads (id, name, email, service_label, city, status, customer_id)
    VALUES ('l1','Maria Delgado','maria@test.co','Home Cleaning','Lake Worth','quoted','c1')`);
  d._raw.exec(`INSERT INTO quotes (id, lead_id, created_at, status, token, line_items,
    total, subtotal, tax, customer_name, customer_email, expires_at)
    VALUES ('q1','l1','2026-11-01','draft','tok1',
      '[{"label":"Deep clean","qty":1,"unit_price":25000}]', 25000, 25000, 0,
      'Maria Delgado','maria@test.co','2099-01-01T00:00:00Z')`);
  return d;
}

const post = (c, body) => new Request('https://x.test/api/admin/quotes/send', {
  method: 'POST', headers: { Cookie: c, 'Content-Type': 'application/json' },
  body: JSON.stringify(body) });

const logs = (d) => d._raw.prepare('SELECT * FROM email_log ORDER BY created_at').all();

await testAsync('a send that could not go out is still in the history', async () => {
  /* No provider is configured here, so the send fails -- and a failure is a
     fact she needs as much as a success. The manual email centre has always
     logged both. */
  const d = db(); const c = await owner(d);
  const res = await send.onRequestPost({ request: post(c, { id: 'q1' }), env: env(d) });
  assert.equal(res.status, 502, 'with no provider the send should report failure');

  const rows = logs(d);
  assert.equal(rows.length, 1, 'the attempt should be on the record');
  assert.equal(rows[0].status, 'failed');
  assert.equal(rows[0].entity_kind, 'quote');
  assert.equal(rows[0].entity_id, 'q1');
  assert.equal(rows[0].to_email, 'maria@test.co');
  assert.ok(rows[0].error, 'and should say why');
});

await testAsync('it is filed against the client, not against nobody', async () => {
  /* customer_id is on the lead. If the route's join does not carry it across,
     the row lands with a null and the contact record -- which reads
     email_log by customer_id -- never shows it. */
  const d = db(); const c = await owner(d);
  await send.onRequestPost({ request: post(c, { id: 'q1' }), env: env(d) });
  assert.equal(logs(d)[0].customer_id, 'c1');

  const mine = d._raw.prepare(
    'SELECT * FROM email_log WHERE customer_id = ? ORDER BY created_at DESC').all('c1');
  assert.equal(mine.length, 1, 'this is the query the contact record runs');
  assert.match(mine[0].subject, /quote/i);
});

await testAsync('a resend is logged as a resend, not as a second first send', async () => {
  const d = db(); const c = await owner(d);
  d._raw.exec(`UPDATE quotes SET status = 'sent', sent_at = '2026-11-02' WHERE id = 'q1'`);
  await send.onRequestPost({ request: post(c, { id: 'q1' }), env: env(d) });
  assert.equal(logs(d)[0].kind, 'quote_resent');
});

await testAsync('a quote that never had a lead still logs', async () => {
  /* The join is a LEFT JOIN and customer_id can be null. That is a client
     who has not been created yet, not a reason to skip the history. */
  const d = db(); const c = await owner(d);
  d._raw.exec(`UPDATE leads SET customer_id = NULL WHERE id = 'l1'`);
  await send.onRequestPost({ request: post(c, { id: 'q1' }), env: env(d) });
  const rows = logs(d);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].customer_id, null);
  assert.equal(rows[0].entity_id, 'q1', 'and is still findable by the quote');
});

console.log('\n' + n + ' passed');
