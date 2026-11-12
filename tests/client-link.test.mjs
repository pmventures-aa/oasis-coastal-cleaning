/* A regular's standing link: their visits, their money, the times she has
   put up. Theirs and nobody else's. */
import assert from 'node:assert/strict';
import { makeD1 } from './helpers/d1.mjs';
import { makeSessionCookie } from '../functions/_lib/auth.js';
import * as client from '../functions/api/client/[token].js';
import * as customers from '../functions/api/admin/customers.js';

let n = 0;
const testAsync = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

const env = (d) => ({ DB: d, ADMIN_PASSWORD: 'x', SESSION_SECRET: 's'.repeat(32) });
const owner = async (d) => (await makeSessionCookie(env(d), false)).split(';')[0];
const soon = (h) => new Date(Date.now() + h * 3600000).toISOString();

function db() {
  const d = makeD1(['0011_schedule.sql', '0014_users.sql', '0009_settings.sql',
    '0017_invoices.sql', '0025_booking_slots.sql']);
  d._raw.exec(`CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT, company TEXT,
    phone TEXT, email TEXT, notes TEXT, created_at TEXT, updated_at TEXT,
    archived_at TEXT, link_token TEXT)`);
  d._raw.exec(`CREATE TABLE properties (id TEXT PRIMARY KEY, customer_id TEXT,
    address TEXT, archived_at TEXT)`);
  d._raw.exec(`INSERT INTO customers (id,name,created_at) VALUES
    ('c1','Maria Delgado','2026-01-01'), ('c2','Someone Else','2026-01-01')`);
  return d;
}
const hit = (d, token, init) => client[init ? 'onRequestPost' : 'onRequestGet']({
  request: new Request('https://x.test/api/client/' + token,
    init ? { method: 'POST', headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify(init) } : undefined),
  params: { token }, env: env(d) });

async function linkFor(d, c, id) {
  const res = await customers.onRequestPatch({
    request: new Request('https://x.test/api/admin/customers', { method: 'PATCH',
      headers: { Cookie: c, 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: id, action: 'client_link' }) }), env: env(d) });
  return (await res.json()).link_token;
}

await testAsync('the link shows their visits and nobody else’s', async () => {
  const d = db(); const c = await owner(d);
  d._raw.prepare(`INSERT INTO appointments (id,created_at,status,all_day,start_at,end_at,
    customer_id,customer_name) VALUES (?,?,'confirmed',0,?,?,?,?)`)
    .run('a1', '2026-01-01', soon(48), soon(50), 'c1', 'Maria Delgado');
  d._raw.prepare(`INSERT INTO appointments (id,created_at,status,all_day,start_at,end_at,
    customer_id,customer_name) VALUES (?,?,'confirmed',0,?,?,?,?)`)
    .run('a2', '2026-01-01', soon(48), soon(50), 'c2', 'Someone Else');

  const body = await (await hit(d, await linkFor(d, c, 'c1'))).json();
  assert.equal(body.customer.name, 'Maria Delgado');
  assert.equal(body.visits.length, 1);
  assert.equal(body.visits[0].id, 'a1');
});

await testAsync('what they owe comes from the payment rows', async () => {
  const d = db(); const c = await owner(d);
  d._raw.prepare(`INSERT INTO invoices (id,created_at,customer_id,total,status,line_items)
    VALUES ('i1','2026-01-01','c1',28500,'sent','[]')`).run();
  d._raw.prepare(`INSERT INTO payments (id,invoice_id,created_at,paid_at,amount,method)
    VALUES ('p1','i1','2026-01-01','2026-01-01',15000,'zelle')`).run();

  const body = await (await hit(d, await linkFor(d, c, 'c1'))).json();
  assert.equal(body.outstanding, 13500);
  assert.equal(body.invoices[0].state, 'part_paid');
});

await testAsync('a draft invoice is not shown to them', async () => {
  const d = db(); const c = await owner(d);
  d._raw.prepare(`INSERT INTO invoices (id,created_at,customer_id,total,status,line_items)
    VALUES ('i1','2026-01-01','c1',10000,'draft','[]')`).run();
  const body = await (await hit(d, await linkFor(d, c, 'c1'))).json();
  assert.equal(body.invoices.length, 0, 'a draft is not a bill yet');
  assert.equal(body.outstanding, 0);
});

await testAsync('they can take a time she put up for them', async () => {
  const d = db(); const c = await owner(d);
  d._raw.prepare(`INSERT INTO booking_slots (id,created_at,start_at,end_at,customer_id)
    VALUES ('s1','2026-01-01',?,?,'c1')`).run(soon(48), soon(50));
  const token = await linkFor(d, c, 'c1');
  const res = await hit(d, token, { action: 'book', slot_id: 's1' });
  assert.equal(res.status, 200);
  assert.equal(d._raw.prepare('SELECT COUNT(*) AS n FROM appointments').get().n, 1);
});

await testAsync('a time put up for somebody else is not theirs to take', async () => {
  const d = db(); const c = await owner(d);
  d._raw.prepare(`INSERT INTO booking_slots (id,created_at,start_at,end_at,customer_id)
    VALUES ('s1','2026-01-01',?,?,'c2')`).run(soon(48), soon(50));
  const res = await hit(d, await linkFor(d, c, 'c1'), { action: 'book', slot_id: 's1' });
  assert.equal(res.status, 403);
  assert.equal(d._raw.prepare('SELECT COUNT(*) AS n FROM appointments').get().n, 0);
});

await testAsync('a slot tied to a quote is not offered on a standing link', async () => {
  const d = db(); const c = await owner(d);
  d._raw.prepare(`INSERT INTO booking_slots (id,created_at,start_at,end_at,quote_id)
    VALUES ('s1','2026-01-01',?,?,'q1')`).run(soon(48), soon(50));
  const token = await linkFor(d, c, 'c1');
  const body = await (await hit(d, token)).json();
  assert.equal(body.slots.length, 0);
  assert.equal((await hit(d, token, { action: 'book', slot_id: 's1' })).status, 403);
});

await testAsync('the link does not expire', async () => {
  const d = db(); const c = await owner(d);
  const token = await linkFor(d, c, 'c1');
  assert.equal((await hit(d, token)).status, 200);
  /* Nothing about it is time-limited: that is the whole point for a
     fortnightly regular. */
  assert.equal((await hit(d, token)).status, 200);
});

await testAsync('replacing it stops the old one', async () => {
  const d = db(); const c = await owner(d);
  const first = await linkFor(d, c, 'c1');
  const second = await linkFor(d, c, 'c1');
  assert.notEqual(first, second);
  assert.equal((await hit(d, first)).status, 404);
  assert.equal((await hit(d, second)).status, 200);
});

await testAsync('a made-up token says the same as a withdrawn one', async () => {
  const d = db();
  const res = await hit(d, 'a'.repeat(48));
  assert.equal(res.status, 404);
  assert.match((await res.json()).error, /not working/);
});

console.log('\n' + n + ' passed');
