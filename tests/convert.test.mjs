/* A request that became a client leaves the Requests list and lives on
   their record. */
import assert from 'node:assert/strict';
import { makeD1 } from './helpers/d1.mjs';
import { makeSessionCookie } from '../functions/_lib/auth.js';
import { syncConverted, CONVERTED_STATUS } from '../functions/_lib/convert.js';
import * as leads from '../functions/api/admin/leads.js';

let n = 0;
const testAsync = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

const env = (d) => ({ DB: d, ADMIN_PASSWORD: 'x', SESSION_SECRET: 's'.repeat(32) });
const owner = async (d) => (await makeSessionCookie(env(d), false)).split(';')[0];
const list = (c, q = '') => new Request('https://x.test/api/admin/leads' + q,
  { headers: { Cookie: c } });
const patch = (c, b) => new Request('https://x.test/api/admin/leads',
  { method: 'PATCH', headers: { Cookie: c, 'Content-Type': 'application/json' },
    body: JSON.stringify(b) });

function db() {
  const d = makeD1([]);
  d._raw.exec(`CREATE TABLE leads (id TEXT PRIMARY KEY, created_at TEXT, updated_at TEXT,
    name TEXT, email TEXT, phone TEXT, address TEXT, city TEXT, zip TEXT,
    status TEXT DEFAULT 'new', followup TEXT, service_label TEXT, notes TEXT,
    customer_id TEXT, property_id TEXT, archived_at TEXT, converted_at TEXT,
    contact_pref TEXT, best_time TEXT, add_ons TEXT, conditions TEXT,
    preferred_days TEXT, property_type TEXT, bedrooms TEXT, bathrooms TEXT,
    size_label TEXT, access TEXT, source TEXT)`);
  d._raw.exec(`CREATE TABLE quotes (id TEXT PRIMARY KEY, lead_id TEXT, status TEXT,
    archived_at TEXT, created_at TEXT)`);
  return d;
}
const addLead = (d, id, status = 'new') =>
  d._raw.prepare(`INSERT INTO leads (id,created_at,name,status) VALUES (?,?,?,?)`)
    .run(id, '2026-11-01', 'Lead ' + id, status);

await testAsync('saying yes is what converts, and it is stamped', async () => {
  const d = db(); addLead(d, 'l1');
  await syncConverted(d, 'l1', CONVERTED_STATUS, '2026-11-10T12:00:00Z');
  assert.equal(d._raw.prepare('SELECT converted_at FROM leads WHERE id = ?').get('l1').converted_at,
    '2026-11-10T12:00:00Z');
});

await testAsync('the date is when they first said yes, not the last touch', async () => {
  const d = db(); addLead(d, 'l1');
  await syncConverted(d, 'l1', CONVERTED_STATUS, '2026-11-10T12:00:00Z');
  await syncConverted(d, 'l1', CONVERTED_STATUS, '2026-12-01T12:00:00Z');
  assert.equal(d._raw.prepare('SELECT converted_at FROM leads WHERE id = ?').get('l1').converted_at,
    '2026-11-10T12:00:00Z');
});

await testAsync('moving it back off booked puts it back in play', async () => {
  const d = db(); addLead(d, 'l1');
  await syncConverted(d, 'l1', CONVERTED_STATUS, '2026-11-10T12:00:00Z');
  await syncConverted(d, 'l1', 'quoted');
  assert.equal(d._raw.prepare('SELECT converted_at FROM leads WHERE id = ?').get('l1').converted_at,
    null, 'she will mis-tap, and a request back in play belongs back in the list');
});

await testAsync('a converted request is gone from Requests', async () => {
  const d = db(); const c = await owner(d);
  addLead(d, 'l1'); addLead(d, 'l2');
  await syncConverted(d, 'l2', CONVERTED_STATUS, '2026-11-10T12:00:00Z');
  const body = await (await leads.onRequestGet({ request: list(c), env: env(d) })).json();
  assert.deepEqual(body.leads.map((l) => l.id), ['l1']);
});

await testAsync('but it can still be found, and is counted', async () => {
  const d = db(); const c = await owner(d);
  addLead(d, 'l1'); addLead(d, 'l2');
  await syncConverted(d, 'l2', CONVERTED_STATUS, '2026-11-10T12:00:00Z');

  const all = await (await leads.onRequestGet({ request: list(c), env: env(d) })).json();
  assert.equal(all.counts.converted, 1);

  const conv = await (await leads.onRequestGet({
    request: list(c, '?converted=1'), env: env(d) })).json();
  assert.deepEqual(conv.leads.map((l) => l.id), ['l2'], 'nothing is deleted, only moved on');
});

await testAsync('marking it booked through the route converts it', async () => {
  const d = db(); const c = await owner(d);
  addLead(d, 'l1');
  const res = await leads.onRequestPatch({
    request: patch(c, { id: 'l1', status: 'booked' }), env: env(d) });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).converted, true);
  assert.ok(d._raw.prepare('SELECT converted_at FROM leads WHERE id = ?').get('l1').converted_at);

  const body = await (await leads.onRequestGet({ request: list(c), env: env(d) })).json();
  assert.equal(body.leads.length, 0, 'it has left the list');
});

await testAsync('moving it back through the route returns it to the list', async () => {
  const d = db(); const c = await owner(d);
  addLead(d, 'l1');
  await leads.onRequestPatch({ request: patch(c, { id: 'l1', status: 'booked' }), env: env(d) });
  await leads.onRequestPatch({ request: patch(c, { id: 'l1', status: 'contacted' }), env: env(d) });
  const body = await (await leads.onRequestGet({ request: list(c), env: env(d) })).json();
  assert.deepEqual(body.leads.map((l) => l.id), ['l1']);
});

await testAsync('a lost request is not a converted one', async () => {
  const d = db(); const c = await owner(d);
  addLead(d, 'l1');
  /* 'closed' is what a declined quote writes. Lost is not converted, and
     a lost request stays visible until she archives it. */
  await leads.onRequestPatch({ request: patch(c, { id: 'l1', status: 'closed' }), env: env(d) });
  assert.equal(d._raw.prepare('SELECT converted_at FROM leads WHERE id = ?').get('l1').converted_at,
    null);
  const body = await (await leads.onRequestGet({ request: list(c), env: env(d) })).json();
  assert.equal(body.leads.length, 1);
});

await testAsync('before 0027 is applied, nothing breaks', async () => {
  /* The column arrives with the migration. Until then the stamp is a
     no-op rather than an error that loses a status change. */
  const d = makeD1([]);
  d._raw.exec(`CREATE TABLE leads (id TEXT PRIMARY KEY, created_at TEXT, status TEXT)`);
  d._raw.prepare(`INSERT INTO leads (id,created_at,status) VALUES ('l1','2026-11-01','new')`).run();
  await syncConverted(d, 'l1', CONVERTED_STATUS, '2026-11-10T12:00:00Z');
  assert.equal(d._raw.prepare('SELECT status FROM leads WHERE id = ?').get('l1').status, 'new');
});

console.log('\n' + n + ' passed');
