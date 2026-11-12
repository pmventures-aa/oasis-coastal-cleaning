/* Marking a client finished.
   -------------------------------------------------------------------------
   attention.js has worked out a client's standing from their bookings, their
   unpaid bills and their standing arrangements since it was written, with
   sixty days of grace because this work is seasonal. Its first line defers to
   a manual override -- "she said so, which beats any signal" -- and the
   record route has always passed customer.closed_at into it. The column was
   never created, so that value was undefined on every call and the override
   could not fire: a client Kristina had actually parted with went on reading
   as active for two months. 0028 adds the column; these check the way in. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeD1 } from './helpers/d1.mjs';
import { makeSessionCookie } from '../functions/_lib/auth.js';
import { standingFor } from '../functions/_lib/attention.js';
import * as customers from '../functions/api/admin/customers.js';

let n = 0;
const testAsync = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

const env = (d) => ({ DB: d, ADMIN_PASSWORD: 'x', SESSION_SECRET: 's'.repeat(32) });
const owner = async (d) => (await makeSessionCookie(env(d), false)).split(';')[0];

function db() {
  const d = makeD1(['0011_schedule.sql', '0014_users.sql']);
  d._raw.exec(`CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT, company TEXT,
    phone TEXT, email TEXT, contact_pref TEXT, best_time TEXT, notes TEXT,
    created_at TEXT, updated_at TEXT, archived_at TEXT, link_token TEXT, closed_at TEXT)`);
  d._raw.exec(`CREATE TABLE properties (id TEXT PRIMARY KEY, customer_id TEXT,
    address TEXT, archived_at TEXT)`);
  d._raw.exec(`INSERT INTO customers (id,name,created_at) VALUES ('c1','Maria Delgado','2026-01-01')`);
  return d;
}

const patch = (c, body) => new Request('https://x.test/api/admin/customers', {
  method: 'PATCH', headers: { Cookie: c, 'Content-Type': 'application/json' },
  body: JSON.stringify(body) });

const row = (d) => d._raw.prepare('SELECT * FROM customers WHERE id = ?').get('c1');

await testAsync('the migration adds the column attention.js already read', () => {
  const sql = readFileSync(new URL('../migrations/0028_customer_closed.sql', import.meta.url), 'utf8');
  assert.match(sql, /ALTER TABLE customers ADD COLUMN closed_at TEXT/);
  /* And setup can create it on a database that predates the migration. */
  const schema = readFileSync(new URL('../functions/_lib/schema.js', import.meta.url), 'utf8');
  assert.match(schema, /\['customers', 'closed_at', 'TEXT'\]/,
    'a column missing from schema.js is a column the in-app setup cannot add');
});

await testAsync('marking a client finished writes a timestamp', async () => {
  const d = db(); const c = await owner(d);
  const res = await customers.onRequestPatch({ request: patch(c, { customer_id: 'c1', action: 'close' }), env: env(d) });
  const out = await res.json();
  assert.equal(res.status, 200);
  assert.ok(out.closed_at, 'the route should say when');
  assert.ok(row(d).closed_at, 'and store it');
});

await testAsync('and the record then reads as past against live signals', async () => {
  const d = db(); const c = await owner(d);
  await customers.onRequestPatch({ request: patch(c, { customer_id: 'c1', action: 'close' }), env: env(d) });
  const signals = {
    visits: [{ status: 'confirmed', start_at: '2099-01-01T14:00:00Z' }],
    invoices: [{ state: 'sent', balance: 9000, created_at: '2026-11-01' }],
    closed_at: row(d).closed_at
  };
  assert.equal(standingFor(signals, '2026-11-12T12:00:00Z'), 'past');
});

await testAsync('putting them back on the books clears it', async () => {
  const d = db(); const c = await owner(d);
  await customers.onRequestPatch({ request: patch(c, { customer_id: 'c1', action: 'close' }), env: env(d) });
  await customers.onRequestPatch({ request: patch(c, { customer_id: 'c1', action: 'reopen' }), env: env(d) });
  assert.equal(row(d).closed_at, null);
});

await testAsync('closing does not archive, and archiving does not close', async () => {
  /* Two different ideas that would be easy to fold together. Archive takes
     the record out of the lists; finished leaves them there, reading as a
     past client. */
  const d = db(); const c = await owner(d);
  await customers.onRequestPatch({ request: patch(c, { customer_id: 'c1', action: 'close' }), env: env(d) });
  assert.equal(row(d).archived_at, null, 'closing should not hide the record');

  await customers.onRequestPatch({ request: patch(c, { customer_id: 'c1', action: 'reopen' }), env: env(d) });
  await customers.onRequestPatch({ request: patch(c, { customer_id: 'c1', action: 'archive' }), env: env(d) });
  assert.ok(row(d).archived_at);
  assert.equal(row(d).closed_at, null, 'archiving should not decide their standing');
});

await testAsync('a standing belongs to the client, not to one of their addresses', async () => {
  const d = db(); const c = await owner(d);
  const res = await customers.onRequestPatch({
    request: patch(c, { property_id: 'p1', action: 'close' }), env: env(d) });
  assert.equal(res.status, 400);
});

await testAsync('a signed-out caller cannot change anyone’s standing', async () => {
  const d = db();
  const res = await customers.onRequestPatch({
    request: new Request('https://x.test/api/admin/customers', { method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: 'c1', action: 'close' }) }), env: env(d) });
  assert.ok(res.status === 401 || res.status === 403, 'expected the guard to refuse, got ' + res.status);
  assert.equal(row(d).closed_at, null);
});

console.log('\n' + n + ' passed');
