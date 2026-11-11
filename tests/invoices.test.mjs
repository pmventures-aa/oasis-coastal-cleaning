/* Invoices, and the money actually received. No gateway: this records
   payments rather than taking them. */
import assert from 'node:assert/strict';
import { makeD1 } from './helpers/d1.mjs';
import { makeSessionCookie, hashPassword } from '../functions/_lib/auth.js';
import { statusFor, balanceOf, checkPayment, paymentWords, money } from '../functions/_lib/invoices.js';
import * as inv from '../functions/api/admin/invoices.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const testAsync = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

/* ------------------------------------------------------------ the money */

test('the balance comes from the payment rows, not a stored total', () => {
  const i = { total: 28500 };
  assert.equal(balanceOf(i, []), 28500);
  assert.equal(balanceOf(i, [{ amount: 15000 }]), 13500);
  assert.equal(balanceOf(i, [{ amount: 15000 }, { amount: 13500 }]), 0);
});

test('a voided payment gives the balance back', () => {
  const i = { total: 28500 };
  const pays = [{ amount: 15000 }, { amount: 13500, voided_at: '2026-11-11' }];
  assert.equal(balanceOf(i, pays), 13500);
  assert.equal(statusFor(i, pays), 'part_paid');
});

/* The bug this caught: the fallback used to read invoice.status, which is
   itself derived and cached, so the answer depended on its own last answer
   and a voided payment left an invoice still saying "paid". */
test('a stale cached status cannot leak through', () => {
  const i = { total: 10000, status: 'paid' };
  assert.equal(statusFor(i, []), 'draft');
  assert.equal(statusFor({ ...i, sent_at: 'x' }, []), 'sent');
});

test('the status is derived, so it cannot contradict the money', () => {
  const i = { total: 10000 };
  assert.equal(statusFor(i, []), 'draft');
  assert.equal(statusFor({ ...i, sent_at: 'x' }, []), 'sent');
  assert.equal(statusFor(i, [{ amount: 4000 }]), 'part_paid');
  assert.equal(statusFor(i, [{ amount: 10000 }]), 'paid');
  assert.equal(statusFor({ ...i, status: 'void' }, [{ amount: 10000 }]), 'void');
});

/* A typo that quietly becomes a wrong balance is worse than being told. */
test('overpayment is refused, not absorbed', () => {
  const i = { total: 10000 };
  assert.match(checkPayment(i, [{ amount: 6000 }], 5000).error, /more than the \$40\.00/);
  assert.equal(checkPayment(i, [{ amount: 6000 }], 4000).amount, 4000);
  assert.match(checkPayment(i, [{ amount: 10000 }], 100).error, /already settled/);
  assert.match(checkPayment(i, [], 0).error, /How much/);
  assert.match(checkPayment(i, [], -50).error, /How much/);
});

test('split methods read as a sentence', () => {
  assert.equal(paymentWords([{ amount: 15000, method: 'zelle' }, { amount: 13500, method: 'cash' }]),
    'Zelle $150.00, Cash $135.00');
  assert.equal(paymentWords([{ amount: 5000, method: 'other', method_note: 'Venmo' }]),
    'Venmo $50.00');
});

/* ------------------------------------------------------------ the route */

const SECRET = 'invoice-secret';
const env = (d) => ({ DB: d, SESSION_SECRET: SECRET, ADMIN_PASSWORD: 'shared' });
function db() {
  const d = makeD1(['0011_schedule.sql', '0014_users.sql', '0017_invoices.sql']);
  d._raw.exec(`CREATE TABLE quotes (id TEXT PRIMARY KEY, lead_id TEXT, customer_name TEXT,
    customer_email TEXT, line_items TEXT, total INTEGER, customer_id TEXT)`);
  d._raw.exec(`CREATE TABLE leads (id TEXT PRIMARY KEY, name TEXT, email TEXT,
    address TEXT, city TEXT, customer_id TEXT)`);
  return d;
}
const owner = async (d) => (await makeSessionCookie(env(d), false)).split(';')[0];
const get = (c, q = '') => new Request('https://x.test/api/admin/invoices' + q, { headers: { Cookie: c } });
const send = (c, m, b) => new Request('https://x.test/api/admin/invoices',
  { method: m, headers: { Cookie: c, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

await testAsync('an invoice adds up from its lines', async () => {
  const d = db(); const c = await owner(d);
  const r = await inv.onRequestPost({ request: send(c, 'POST', {
    customer_name: 'Maria Delgado',
    line_items: [{ label: 'Deep clean', qty: 1, unit_price: 24000 },
                 { label: 'Inside the oven', qty: 1, unit_price: 4500 }] }), env: env(d) });
  assert.equal(r.status, 201);
  const b = await r.json();
  assert.equal(b.invoice.total, 28500);
  assert.equal(b.invoice.balance, 28500);
  assert.equal(b.invoice.state, 'draft');
});

await testAsync('an invoice with no lines is refused', async () => {
  const d = db(); const c = await owner(d);
  const r = await inv.onRequestPost({ request: send(c, 'POST',
    { customer_name: 'X', line_items: [] }), env: env(d) });
  assert.equal(r.status, 400);
});

await testAsync('it can be raised from an accepted quote without retyping', async () => {
  const d = db(); const c = await owner(d);
  d._raw.prepare(`INSERT INTO leads (id,name,email,address,city,customer_id)
    VALUES ('l1','Maria Delgado','maria@x.test','12 Ocean Ave','Lake Worth','c1')`).run();
  d._raw.prepare(`INSERT INTO quotes (id,lead_id,line_items,total,customer_id)
    VALUES ('q1','l1',?,28500,'c1')`).run(JSON.stringify([
      { label: 'Deep clean', qty: 1, unit_price: 24000 },
      { label: 'Inside the oven', qty: 1, unit_price: 4500 },
      { label: 'Fortnightly afterwards', qty: 1, unit_price: 12000, optional: true }]));
  const b = await (await inv.onRequestPost({ request: send(c, 'POST',
    { quote_id: 'q1' }), env: env(d) })).json();
  assert.equal(b.invoice.customer_name, 'Maria Delgado');
  assert.equal(b.invoice.line_items.length, 2, 'the optional line is not something they owe');
  assert.equal(b.invoice.total, 28500);
  assert.equal(b.invoice.customer_id, 'c1', 'and it lands on the client profile');
});

await testAsync('half by Zelle and the rest in cash both land', async () => {
  const d = db(); const c = await owner(d);
  const made = await (await inv.onRequestPost({ request: send(c, 'POST', {
    customer_name: 'Maria', line_items: [{ label: 'Clean', qty: 1, unit_price: 28500 }] }),
    env: env(d) })).json();
  const id = made.invoice.id;

  let b = await (await inv.onRequestPatch({ request: send(c, 'PATCH',
    { id, action: 'pay', amount: 15000, method: 'zelle', reference: 'conf 9931' }),
    env: env(d) })).json();
  assert.equal(b.invoice.state, 'part_paid');
  assert.equal(b.invoice.balance, 13500);

  b = await (await inv.onRequestPatch({ request: send(c, 'PATCH',
    { id, action: 'pay', amount: 13500, method: 'cash' }), env: env(d) })).json();
  assert.equal(b.invoice.state, 'paid');
  assert.equal(b.invoice.balance, 0);
  assert.equal(b.invoice.payments.length, 2);

  const row = await d.prepare('SELECT amount_paid, status FROM invoices WHERE id = ?').bind(id).first();
  assert.equal(row.amount_paid, 28500, 'the cached total is kept in step');
  assert.equal(row.status, 'paid');
});

await testAsync('a payment beyond the balance is refused by the route too', async () => {
  const d = db(); const c = await owner(d);
  const made = await (await inv.onRequestPost({ request: send(c, 'POST', {
    customer_name: 'Maria', line_items: [{ label: 'Clean', qty: 1, unit_price: 10000 }] }),
    env: env(d) })).json();
  const r = await inv.onRequestPatch({ request: send(c, 'PATCH',
    { id: made.invoice.id, action: 'pay', amount: 15000, method: 'cash' }), env: env(d) });
  assert.equal(r.status, 400);
  assert.equal((await d.prepare('SELECT * FROM payments').all()).results.length, 0);
});

await testAsync('"other" has to say what it was', async () => {
  const d = db(); const c = await owner(d);
  const made = await (await inv.onRequestPost({ request: send(c, 'POST', {
    customer_name: 'M', line_items: [{ label: 'C', qty: 1, unit_price: 5000 }] }), env: env(d) })).json();
  const bad = await inv.onRequestPatch({ request: send(c, 'PATCH',
    { id: made.invoice.id, action: 'pay', amount: 5000, method: 'other' }), env: env(d) });
  assert.equal(bad.status, 400);
  const good = await inv.onRequestPatch({ request: send(c, 'PATCH',
    { id: made.invoice.id, action: 'pay', amount: 5000, method: 'other', method_note: 'Venmo' }),
    env: env(d) });
  assert.equal(good.status, 200);
  assert.equal((await good.json()).invoice.payments[0].method_note, 'Venmo');
});

await testAsync('voiding a payment restores the balance and the status', async () => {
  const d = db(); const c = await owner(d);
  const made = await (await inv.onRequestPost({ request: send(c, 'POST', {
    customer_name: 'M', line_items: [{ label: 'C', qty: 1, unit_price: 10000 }] }), env: env(d) })).json();
  const paid = await (await inv.onRequestPatch({ request: send(c, 'PATCH',
    { id: made.invoice.id, action: 'pay', amount: 10000, method: 'check', reference: '#201' }),
    env: env(d) })).json();
  assert.equal(paid.invoice.state, 'paid');

  const after = await (await inv.onRequestPatch({ request: send(c, 'PATCH',
    { id: made.invoice.id, action: 'void_payment', payment_id: paid.invoice.payments[0].id }),
    env: env(d) })).json();
  assert.equal(after.invoice.balance, 10000, 'a bounced cheque is owed again');
  assert.equal(after.invoice.state, 'draft', 'and not the stale "paid" it was cached as');
  const rows = (await d.prepare('SELECT * FROM payments').all()).results;
  assert.equal(rows.length, 1, 'voided, not deleted: it did happen');
  assert.ok(rows[0].voided_at);
});

await testAsync('the list totals what is still owed', async () => {
  const d = db(); const c = await owner(d);
  for (const amt of [10000, 20000]) {
    await inv.onRequestPost({ request: send(c, 'POST', {
      customer_name: 'M', line_items: [{ label: 'C', qty: 1, unit_price: amt }] }), env: env(d) });
  }
  const b = await (await inv.onRequestGet({ request: get(c), env: env(d) })).json();
  assert.equal(b.outstanding, 30000);
  assert.equal(b.invoices.length, 2);
});

await testAsync('money is the owner’s business alone', async () => {
  const d = db();
  for (const role of ['cleaner', 'staff_admin']) {
    const h = await hashPassword('pw');
    d._raw.prepare(`INSERT INTO users (id,created_at,name,email,role,password_hash,password_salt,
      iterations,active) VALUES (?,?,?,?,?,?,?,?,1)`)
      .run('u-' + role, '2026-11-11', role, role + '@x.test', role, h.hash, h.salt, h.iterations);
    const c = (await makeSessionCookie(env(d), false, 'u-' + role)).split(';')[0];
    assert.equal((await inv.onRequestGet({ request: get(c), env: env(d) })).status, 403, role);
    assert.equal((await inv.onRequestPatch({ request: send(c, 'PATCH',
      { id: 'x', action: 'pay', amount: 100 }), env: env(d) })).status, 403, role);
  }
});

console.log('\n' + n + ' passed');
