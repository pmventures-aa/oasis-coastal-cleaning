/* One answer to "have they paid?".
   Before this there were two, and they never spoke: recording money against
   an invoice settled the Money screen and left the same job filed under
   Accepted, while marking the quote paid left Money showing it owing for
   ever. Whichever she used, the other screen was wrong. */
import assert from 'node:assert/strict';
import { makeD1 } from './helpers/d1.mjs';
import { makeSessionCookie } from '../functions/_lib/auth.js';
import { quoteMoney, syncQuotePaid, invoicesForQuotes } from '../functions/_lib/money.js';
import * as inv from '../functions/api/admin/invoices.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const testAsync = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

function db() {
  const d = makeD1(['0011_schedule.sql', '0014_users.sql', '0017_invoices.sql']);
  d._raw.exec(`CREATE TABLE quotes (id TEXT PRIMARY KEY, lead_id TEXT, customer_name TEXT,
    customer_email TEXT, line_items TEXT, total INTEGER, customer_id TEXT,
    status TEXT, paid_at TEXT, paid_note TEXT, paid_source TEXT,
    completed_at TEXT, updated_at TEXT, archived_at TEXT)`);
  d._raw.exec(`CREATE TABLE leads (id TEXT PRIMARY KEY, name TEXT, email TEXT,
    address TEXT, city TEXT, customer_id TEXT)`);
  return d;
}
const env = (d) => ({ DB: d, ADMIN_PASSWORD: 'x', SESSION_SECRET: 's'.repeat(32) });
const owner = async (d) => (await makeSessionCookie(env(d), false)).split(';')[0];
const send = (c, m, b) => new Request('https://x.test/api/admin/invoices',
  { method: m, headers: { Cookie: c, 'Content-Type': 'application/json' },
    body: JSON.stringify(b) });

/* ------------------------------------------------------------- the rule */

test('with no invoice, her own mark is the answer', () => {
  assert.equal(quoteMoney({ total: 28500, paid_at: null }, [], {}).state, 'unpaid');
  const m = quoteMoney({ total: 28500, paid_at: '2026-11-11' }, [], {});
  assert.equal(m.state, 'paid');
  assert.equal(m.source, 'manual');
});

test('with an invoice, the payment rows are the answer and the flag is ignored', () => {
  const q = { total: 28500, paid_at: '2026-11-11' };   // a stale flag
  const invs = [{ id: 'i1', total: 28500, status: 'sent' }];
  const m = quoteMoney(q, invs, { i1: [{ amount: 15000 }] });
  assert.equal(m.state, 'part_paid');
  assert.equal(m.balance, 13500);
  assert.equal(m.source, 'invoice');
});

test('a voided payment is not money', () => {
  const invs = [{ id: 'i1', total: 28500, status: 'sent' }];
  const m = quoteMoney({}, invs, { i1: [{ amount: 28500, voided_at: '2026-11-11' }] });
  assert.equal(m.state, 'unpaid');
  assert.equal(m.settled, false);
});

test('a voided invoice is not owed', () => {
  const invs = [{ id: 'i1', total: 28500, status: 'void' }];
  assert.equal(quoteMoney({ total: 0 }, invs, {}).source, 'none');
});

test('several invoices on one quote add up', () => {
  const invs = [{ id: 'i1', total: 10000, status: 'sent' },
                { id: 'i2', total: 5000, status: 'sent' }];
  const m = quoteMoney({}, invs, { i1: [{ amount: 10000 }] });
  assert.equal(m.total, 15000);
  assert.equal(m.balance, 5000);
  assert.equal(m.settled, false);
});

/* ------------------------------------------------- the cache on the quote */

await testAsync('paying the invoice in full marks the quote, and says who did', async () => {
  const d = db(); const c = await owner(d);
  d._raw.exec(`INSERT INTO quotes (id, total, status) VALUES ('q1', 28500, 'accepted')`);
  const made = await inv.onRequestPost({ request: send(c, 'POST', {
    quote_id: null, customer_name: 'Maria',
    line_items: [{ label: 'Deep clean', qty: 1, unit_price: 28500 }] }), env: env(d) });
  const id = (await made.json()).invoice.id;
  d._raw.exec(`UPDATE invoices SET quote_id = 'q1' WHERE id = '${id}'`);

  await inv.onRequestPatch({ request: send(c, 'PATCH',
    { id, action: 'pay', amount: 28500, method: 'zelle' }), env: env(d) });

  const q = d._raw.prepare('SELECT * FROM quotes WHERE id = ?').get('q1');
  assert.ok(q.paid_at, 'the quote should now read as paid');
  assert.equal(q.paid_source, 'invoice');
  assert.ok(q.completed_at, 'paid work is finished work');
});

await testAsync('voiding that payment takes the mark back off', async () => {
  const d = db(); const c = await owner(d);
  d._raw.exec(`INSERT INTO quotes (id, total, status) VALUES ('q1', 10000, 'accepted')`);
  const made = await inv.onRequestPost({ request: send(c, 'POST', {
    customer_name: 'Maria',
    line_items: [{ label: 'Clean', qty: 1, unit_price: 10000 }] }), env: env(d) });
  const id = (await made.json()).invoice.id;
  d._raw.exec(`UPDATE invoices SET quote_id = 'q1' WHERE id = '${id}'`);
  await inv.onRequestPatch({ request: send(c, 'PATCH',
    { id, action: 'pay', amount: 10000, method: 'cash' }), env: env(d) });
  const payId = d._raw.prepare('SELECT id FROM payments WHERE invoice_id = ?').get(id).id;

  await inv.onRequestPatch({ request: send(c, 'PATCH',
    { id, action: 'void_payment', payment_id: payId }), env: env(d) });

  const q = d._raw.prepare('SELECT * FROM quotes WHERE id = ?').get('q1');
  assert.equal(q.paid_at, null, 'the money went away, so the mark must too');
  assert.equal(q.paid_source, null);
});

await testAsync('a mark she made by hand is never cleared by the sync', async () => {
  const d = db();
  /* No invoice at all: a cash job she never billed. The sync must not
     touch it, or her own answer would vanish on an unrelated write. */
  d._raw.exec(`INSERT INTO quotes (id, total, paid_at, paid_source)
    VALUES ('q1', 9000, '2026-11-01T00:00:00Z', 'manual')`);
  await syncQuotePaid(d, 'q1');
  const q = d._raw.prepare('SELECT * FROM quotes WHERE id = ?').get('q1');
  assert.equal(q.paid_at, '2026-11-01T00:00:00Z');
  assert.equal(q.paid_source, 'manual');
});

await testAsync('the invoices for a set of quotes come back in two reads', async () => {
  const d = db();
  d._raw.exec(`INSERT INTO quotes (id, total) VALUES ('q1', 100), ('q2', 200)`);
  d._raw.exec(`INSERT INTO invoices (id, created_at, quote_id, total, status, line_items)
    VALUES ('i1', '2026-11-11', 'q1', 100, 'sent', '[]')`);
  d._raw.exec(`INSERT INTO payments (id, invoice_id, created_at, paid_at, amount, method)
    VALUES ('p1', 'i1', '2026-11-11', '2026-11-11', 60, 'cash')`);
  const { byQuote, byInvoice } = await invoicesForQuotes(d, ['q1', 'q2']);
  assert.equal((byQuote.q1 || []).length, 1);
  assert.equal((byQuote.q2 || []).length, 0);
  assert.equal(byInvoice.i1[0].amount, 60);
});

await testAsync('a database hiccup does not un-pay a settled job', async () => {
  /* syncQuotePaid used to turn a failed read into an empty result set. A
     payments query that hiccuped therefore looked exactly like a job with no
     payments against it, and the function went on to clear paid_at: a fully
     settled job silently filed as outstanding, with nothing anywhere saying
     why. Reading nothing and failing to read are different answers. */
  const d = db();
  d._raw.exec(`INSERT INTO quotes (id, total, paid_at, paid_source)
    VALUES ('q1', 100, '2026-11-01T00:00:00Z', 'invoice')`);
  d._raw.exec(`INSERT INTO invoices (id, created_at, quote_id, total, status, line_items)
    VALUES ('i1', '2026-11-11', 'q1', 100, 'sent', '[]')`);
  d._raw.exec(`INSERT INTO payments (id, invoice_id, created_at, paid_at, amount, method)
    VALUES ('p1', 'i1', '2026-11-11', '2026-11-11', 100, 'cash')`);

  const flaky = {
    prepare(sql) {
      const stmt = d.prepare(sql);
      if (!/FROM payments/i.test(sql)) return stmt;
      return { bind: () => ({ all: () => Promise.reject(new Error('D1_ERROR: network')) }) };
    },
  };

  await syncQuotePaid(flaky, 'q1');
  const q = d._raw.prepare('SELECT * FROM quotes WHERE id = ?').get('q1');
  assert.equal(q.paid_at, '2026-11-01T00:00:00Z');
  assert.equal(q.paid_source, 'invoice');
});

await testAsync('a voided payment still clears the cache it wrote', async () => {
  /* The guard above must not have bought safety by making the function stop
     writing. With the reads working and the money gone, the flag goes. */
  const d = db();
  d._raw.exec(`INSERT INTO quotes (id, total, paid_at, paid_source)
    VALUES ('q1', 100, '2026-11-01T00:00:00Z', 'invoice')`);
  d._raw.exec(`INSERT INTO invoices (id, created_at, quote_id, total, status, line_items)
    VALUES ('i1', '2026-11-11', 'q1', 100, 'sent', '[]')`);
  await syncQuotePaid(d, 'q1');
  const q = d._raw.prepare('SELECT * FROM quotes WHERE id = ?').get('q1');
  assert.equal(q.paid_at, null);
  assert.equal(q.paid_source, null);
});

console.log('\n' + n + ' passed');
