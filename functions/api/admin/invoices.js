/**
 * GET    /api/admin/invoices  — what is owed and what has come in
 * POST   /api/admin/invoices  — raise one, from a quote, a visit, or nothing
 * PATCH  /api/admin/invoices  — record a payment, void one, mark it sent
 *
 * No card gateway. She is paid by Zelle, in cash, by cheque or on a card
 * machine that has nothing to do with this site, so this records money
 * rather than taking it.
 */
import { json, clean, newId } from '../../_lib/util.js';
import { gate } from '../../_lib/guard.js';
import { ensureScheduleTables } from '../../_lib/schema.js';
import { syncQuotePaid } from '../../_lib/money.js';
import {
  METHODS, cleanMethod, paidTotal, balanceOf, statusFor, checkPayment, live
} from '../../_lib/invoices.js';

const SETUP = 'Apply migration 0017 in D1 → oasis → Console.';

async function hasTables(db) {
  try { await db.prepare('SELECT 1 FROM invoices LIMIT 1').first(); return true; }
  catch { return ensureScheduleTables(db); }
}
const soft = (p) => p.then((r) => r, () => ({ results: [] }));

const lines = (v) => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; }
  catch { return []; } };

async function paymentsFor(db, ids) {
  if (!ids.length) return {};
  const marks = ids.map(() => '?').join(',');
  const rows = (await soft(db.prepare(
    `SELECT * FROM payments WHERE invoice_id IN (${marks}) ORDER BY paid_at`
  ).bind(...ids).all())).results || [];
  const by = {};
  for (const r of rows) (by[r.invoice_id] ||= []).push(r);
  return by;
}

/* The money is recomputed every time it is read, so a voided payment can
   never leave a stale balance behind. */
function dress(inv, pays) {
  return { ...inv, line_items: lines(inv.line_items), payments: pays || [],
    paid: paidTotal(pays), balance: balanceOf(inv, pays), state: statusFor(inv, pays) };
}

export async function onRequestGet({ request, env }) {
  const g = await gate(request, env, 'money');
  if (g.response) return g.response;
  if (!await hasTables(env.DB)) {
    return json({ error: 'Invoices are not set up yet.', setup: SETUP, needsSetup: true }, 503);
  }
  const url = new URL(request.url);
  const customerId = clean(url.searchParams.get('customer_id'), 60);

  const rows = (await soft(env.DB.prepare(
    customerId
      ? `SELECT * FROM invoices WHERE archived_at IS NULL AND customer_id = ?
           ORDER BY created_at DESC LIMIT 200`
      : `SELECT * FROM invoices WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT 200`
  ).bind(...(customerId ? [customerId] : [])).all())).results || [];

  const pays = await paymentsFor(env.DB, rows.map((r) => r.id));
  const invoices = rows.map((r) => dress(r, pays[r.id] || []));
  const owed = invoices.filter((i) => i.state !== 'void')
    .reduce((n, i) => n + Math.max(0, i.balance), 0);
  return json({ ok: true, methods: METHODS, invoices, outstanding: owed });
}

export async function onRequestPost({ request, env }) {
  const g = await gate(request, env, 'money');
  if (g.response) return g.response;
  if (!await hasTables(env.DB)) {
    return json({ error: 'Invoices are not set up yet.', setup: SETUP, needsSetup: true }, 503);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }

  let items = Array.isArray(body.line_items) ? body.line_items : null;
  let customer = {
    customer_id: clean(body.customer_id, 60) || null,
    customer_name: clean(body.customer_name, 120) || null,
    email: clean(body.email, 160) || null,
    address: clean(body.address, 200) || null,
    city: clean(body.city, 80) || null
  };
  let quoteId = clean(body.quote_id, 60) || null;

  /* Raising it from an accepted quote is the common case, and copying the
     lines across by hand is how a total stops matching what they agreed. */
  if (quoteId && !items) {
    const q = await env.DB.prepare(
      `SELECT q.*, l.name AS lead_name, l.email AS lead_email, l.address, l.city, l.customer_id
         FROM quotes q LEFT JOIN leads l ON l.id = q.lead_id WHERE q.id = ?`
    ).bind(quoteId).first().catch(() => null);
    if (!q) return json({ error: 'That quote is not here.' }, 404);
    items = lines(q.line_items).filter((it) => !it.optional);
    customer = {
      customer_id: q.customer_id || customer.customer_id,
      customer_name: q.customer_name || q.lead_name || customer.customer_name,
      email: q.customer_email || q.lead_email || customer.email,
      address: q.address || customer.address,
      city: q.city || customer.city
    };
  }

  items = (items || []).map((it) => ({
    label: clean(it.label, 200),
    qty: Math.max(1, Math.round(Number(it.qty) || 1)),
    unit_price: Math.max(0, Math.round(Number(it.unit_price) || 0))
  })).filter((it) => it.label);

  if (!items.length) return json({ error: 'An invoice needs at least one line.' }, 400);
  const subtotal = items.reduce((n, it) => n + it.qty * it.unit_price, 0);

  const id = 'inv-' + newId();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO invoices (id, created_at, number, customer_id, lead_id, quote_id,
       job_id, appointment_id, customer_name, email, address, city,
       line_items, subtotal, total, status, due_date, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?)`
  ).bind(id, now, clean(body.number, 40) || null, customer.customer_id,
    clean(body.lead_id, 60) || null, quoteId, clean(body.job_id, 60) || null,
    clean(body.appointment_id, 60) || null, customer.customer_name, customer.email,
    customer.address, customer.city, JSON.stringify(items), subtotal, subtotal,
    clean(body.due_date, 10) || null, clean(body.notes, 2000) || null).run();

  const row = await env.DB.prepare('SELECT * FROM invoices WHERE id = ?').bind(id).first();
  return json({ ok: true, invoice: dress(row, []) }, 201);
}

export async function onRequestPatch({ request, env }) {
  const g = await gate(request, env, 'money');
  if (g.response) return g.response;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }
  const id = clean(body.id, 60);
  if (!id) return json({ error: 'Which invoice?' }, 400);

  const inv = await env.DB.prepare('SELECT * FROM invoices WHERE id = ?').bind(id).first()
    .catch(() => null);
  if (!inv) return json({ error: 'That invoice is not here.' }, 404);

  const pays = ((await paymentsFor(env.DB, [id]))[id]) || [];
  const now = new Date().toISOString();

  /* Record money that arrived. */
  if (body.action === 'pay') {
    const check = checkPayment(inv, pays, body.amount);
    if (check.error) return json({ error: check.error }, 400);
    const method = cleanMethod(body.method);
    const note = clean(body.method_note, 120);
    if (method === 'other' && !note) {
      return json({ error: 'Say how they paid.' }, 400);
    }
    const pid = 'pay-' + newId();
    await env.DB.prepare(
      `INSERT INTO payments (id, invoice_id, created_at, paid_at, amount, method,
         method_note, reference, recorded_by)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).bind(pid, id, now, clean(body.paid_at, 30) || now, check.amount, method,
      note || null, clean(body.reference, 120) || null, g.user.id).run();
    return finish(env, id);
  }

  /* Undo one. Voided, not deleted: the money did arrive, and then it did
     not -- a bounced cheque is part of the story. */
  if (body.action === 'void_payment') {
    const pid = clean(body.payment_id, 60);
    if (!pid) return json({ error: 'Which payment?' }, 400);
    await env.DB.prepare(
      'UPDATE payments SET voided_at = ? WHERE id = ? AND invoice_id = ?'
    ).bind(now, pid, id).run();
    return finish(env, id);
  }

  if (body.action === 'sent') {
    await env.DB.prepare(
      `UPDATE invoices SET sent_at = ?, status = 'sent', updated_at = ? WHERE id = ?`
    ).bind(now, now, id).run();
    return finish(env, id);
  }

  if (body.action === 'void') {
    await env.DB.prepare(
      `UPDATE invoices SET status = 'void', updated_at = ? WHERE id = ?`
    ).bind(now, id).run();
    return finish(env, id);
  }

  return json({ error: 'Unknown change.' }, 400);
}

/* One place that writes the cached total and the derived status, so the two
   can never disagree with the payment rows. */
async function finish(env, id) {
  const inv = await env.DB.prepare('SELECT * FROM invoices WHERE id = ?').bind(id).first();
  /* Money moved, so the quote's cache of "have they paid" is restated from
     the payment rows rather than left to drift. */
  if (inv && inv.quote_id) await syncQuotePaid(env.DB, inv.quote_id);
  const pays = ((await paymentsFor(env.DB, [id]))[id]) || [];
  const paid = paidTotal(pays);
  const state = statusFor(inv, pays);
  await env.DB.prepare(
    'UPDATE invoices SET amount_paid = ?, status = ?, updated_at = ? WHERE id = ?'
  ).bind(paid, state, new Date().toISOString(), id).run();
  const fresh = await env.DB.prepare('SELECT * FROM invoices WHERE id = ?').bind(id).first();
  return json({ ok: true, invoice: dress(fresh, pays) });
}
