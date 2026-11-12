/* Taking one of the times she has put up. The thing that must not happen
   is two people being told yes for the same hour. */
import assert from 'node:assert/strict';
import { makeD1 } from './helpers/d1.mjs';
import { makeSessionCookie } from '../functions/_lib/auth.js';
import { openSlots, takeSlot } from '../functions/_lib/booking.js';
import { raiseInvoiceFromQuote } from '../functions/_lib/invoiceFromQuote.js';
import * as slots from '../functions/api/admin/slots.js';

let n = 0;
const testAsync = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

const env = (d) => ({ DB: d, ADMIN_PASSWORD: 'x', SESSION_SECRET: 's'.repeat(32) });
const owner = async (d) => (await makeSessionCookie(env(d), false)).split(';')[0];
const post = (c, b) => new Request('https://x.test/api/admin/slots',
  { method: 'POST', headers: { Cookie: c, 'Content-Type': 'application/json' },
    body: JSON.stringify(b) });
const del = (c, id) => new Request('https://x.test/api/admin/slots?id=' + id,
  { method: 'DELETE', headers: { Cookie: c } });

function db() {
  const d = makeD1(['0011_schedule.sql', '0014_users.sql', '0009_settings.sql',
    '0017_invoices.sql', '0025_booking_slots.sql']);
  d._raw.exec(`CREATE TABLE quotes (id TEXT PRIMARY KEY, lead_id TEXT, customer_name TEXT,
    customer_email TEXT, line_items TEXT, total INTEGER, subtotal INTEGER,
    customer_id TEXT, status TEXT, archived_at TEXT)`);
  d._raw.exec(`CREATE TABLE leads (id TEXT PRIMARY KEY, name TEXT, email TEXT,
    address TEXT, city TEXT, customer_id TEXT)`);
  return d;
}
const soon = (hours) => new Date(Date.now() + hours * 3600000).toISOString();
function slot(d, id, from = soon(48), to = soon(50), extra = {}) {
  d._raw.prepare(`INSERT INTO booking_slots (id, created_at, start_at, end_at,
    quote_id, customer_id) VALUES (?,?,?,?,?,?)`)
    .run(id, new Date().toISOString(), from, to, extra.quote_id || null,
      extra.customer_id || null);
}

/* ------------------------------------------------------ what is offered */

await testAsync('only the times she put up are offered, never a guess', async () => {
  const d = db();
  slot(d, 's1');
  const open = await openSlots(d, {});
  assert.equal(open.length, 1);
  assert.equal(open[0].id, 's1');
});

await testAsync('a time already gone is not offered', async () => {
  const d = db();
  slot(d, 'past', new Date(Date.now() - 7200000).toISOString(),
    new Date(Date.now() - 3600000).toISOString());
  assert.equal((await openSlots(d, {})).length, 0);
});

await testAsync('a slot put up for one quote is not shown on another', async () => {
  const d = db();
  slot(d, 'mine', soon(48), soon(50), { quote_id: 'q1' });
  slot(d, 'open');
  const forQ1 = await openSlots(d, { quoteId: 'q1' });
  const forQ2 = await openSlots(d, { quoteId: 'q2' });
  assert.deepEqual(forQ1.map((x) => x.id).sort(), ['mine', 'open']);
  assert.deepEqual(forQ2.map((x) => x.id), ['open'], 'somebody else’s slot stays theirs');
});

/* --------------------------------------------------------- the race */

await testAsync('two people cannot take the same hour', async () => {
  const d = db();
  slot(d, 's1');
  const first = await takeSlot(d, 's1', { name: 'Maria' });
  const second = await takeSlot(d, 's1', { name: 'Someone else' });
  assert.equal(first.ok, true);
  assert.equal(second.ok, undefined);
  assert.equal(second.status, 409);
  assert.equal(d._raw.prepare('SELECT COUNT(*) AS n FROM appointments').get().n, 1,
    'exactly one visit, not two');
});

await testAsync('taking a slot writes the visit into the diary', async () => {
  const d = db();
  slot(d, 's1');
  const r = await takeSlot(d, 's1', { name: 'Maria Delgado', address: '12 Ocean Ave',
    service_label: 'Deep clean' });
  assert.equal(r.ok, true);
  const appt = d._raw.prepare('SELECT * FROM appointments WHERE id = ?').get(r.appointment_id);
  assert.equal(appt.customer_name, 'Maria Delgado');
  assert.equal(appt.status, 'confirmed');
  assert.equal(appt.start_at, r.start_at);
});

await testAsync('a time she has since filled herself is refused', async () => {
  const d = db();
  const from = soon(48), to = soon(50);
  slot(d, 's1', from, to);
  /* She booked something into that hour after putting the slot up. */
  d._raw.prepare(`INSERT INTO appointments (id,created_at,status,all_day,start_at,end_at,
    customer_name) VALUES ('other','2026-01-01','confirmed',0,?,?,'Someone')`).run(from, to);
  const r = await takeSlot(d, 's1', { name: 'Maria' });
  assert.equal(r.status, 409);
  assert.match(r.error, /no longer free/);
});

await testAsync('a slot that no longer exists cannot be taken', async () => {
  const d = db();
  const r = await takeSlot(d, 'nope', {});
  assert.equal(r.status, 404);
});

/* ------------------------------------------------------- putting them up */

await testAsync('she cannot offer an hour she is already booked for', async () => {
  const d = db(); const c = await owner(d);
  const from = soon(48), to = soon(50);
  d._raw.prepare(`INSERT INTO appointments (id,created_at,status,all_day,start_at,end_at,
    customer_name) VALUES ('a1','2026-01-01','confirmed',0,?,?,'Maria')`).run(from, to);
  const res = await slots.onRequestPost({ request: post(c, { start_at: from, end_at: to }),
    env: env(d) });
  assert.equal(res.status, 409);
});

await testAsync('a time in the past is refused', async () => {
  const d = db(); const c = await owner(d);
  const res = await slots.onRequestPost({ request: post(c, {
    start_at: new Date(Date.now() - 7200000).toISOString(),
    end_at: new Date(Date.now() - 3600000).toISOString() }), env: env(d) });
  assert.equal(res.status, 400);
});

await testAsync('a taken slot cannot be quietly withdrawn', async () => {
  const d = db(); const c = await owner(d);
  slot(d, 's1');
  await takeSlot(d, 's1', { name: 'Maria' });
  const res = await slots.onRequestDelete({ request: del(c, 's1'), env: env(d) });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /Cancel the visit/);
});

await testAsync('signed out, slots are nobody’s business', async () => {
  const d = db();
  const res = await slots.onRequestGet({
    request: new Request('https://x.test/api/admin/slots'), env: env(d) });
  assert.equal(res.status, 401);
});

/* ------------------------------------------------- the invoice that follows */

await testAsync('the invoice carries the lines they agreed to', async () => {
  const d = db();
  d._raw.prepare(`INSERT INTO quotes (id, customer_name, line_items, total, subtotal, status)
    VALUES ('q1','Maria Delgado',?,28500,28500,'accepted')`)
    .run(JSON.stringify([
      { label: 'Deep clean', qty: 1, unit_price: 25000 },
      { label: 'Inside the oven', qty: 1, unit_price: 3500 },
      { label: 'Windows', qty: 1, unit_price: 9000, optional: true }
    ]));
  const made = await raiseInvoiceFromQuote(d, 'q1');
  assert.equal(made.lines, 2, 'the optional one they did not take is left off');
  assert.equal(made.total, 28500);
  const inv = d._raw.prepare('SELECT * FROM invoices WHERE id = ?').get(made.id);
  assert.equal(inv.status, 'draft', 'accepting is not the same as being sent a bill');
  assert.equal(inv.quote_id, 'q1');
});

console.log('\n' + n + ' passed');
