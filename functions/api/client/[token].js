/**
 * GET  /api/client/<token>  — a regular's own page: what is coming up,
 *                             what they owe, and the times they can book
 * POST /api/client/<token>  — take one of those times
 *
 * The link does not expire, because the point of it is that somebody she
 * cleans for every fortnight does not need a new one each time. It is a
 * password to one customer's own record, so it carries their visits,
 * their invoices and nothing of anybody else's.
 *
 * No prices are invented and no times are computed. The money is the
 * money already on their invoices; the times are the ones she has put up.
 */
import { json, clean } from '../../_lib/util.js';
import { openSlots, takeSlot } from '../../_lib/booking.js';
import { statusFor, balanceOf, paidTotal } from '../../_lib/invoices.js';

const soft = (p) => p.then((r) => r, () => ({ results: [] }));
const lines = (v) => {
  try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; }
  catch { return []; }
};

async function customerFor(env, token) {
  if (!token || !env.DB) return null;
  return env.DB.prepare(
    'SELECT * FROM customers WHERE link_token = ? AND archived_at IS NULL'
  ).bind(token).first().catch(() => null);
}

export async function onRequestGet({ request, params, env }) {
  const token = clean(params.token, 80);
  const who = await customerFor(env, token);
  /* The same answer for a wrong token and a withdrawn one: a link that
     says "that customer exists but not for you" is a way of asking. */
  if (!who) return json({ error: 'This link is not working.' }, 404);

  const now = new Date().toISOString();

  const visits = ((await soft(env.DB.prepare(
    `SELECT id, start_at, end_at, all_day, start_date, service_label, status
       FROM appointments
      WHERE customer_id = ? AND archived_at IS NULL AND status != 'cancelled'
        AND (start_at >= ? OR start_date >= ?)
      ORDER BY COALESCE(start_at, start_date) LIMIT 10`
  ).bind(who.id, now, now.slice(0, 10)).all())).results) || [];

  /* What they owe, worked out from the payment rows rather than read off
     a cached status -- the same rule as everywhere else. */
  const invRows = ((await soft(env.DB.prepare(
    `SELECT * FROM invoices
      WHERE customer_id = ? AND archived_at IS NULL AND status != 'draft'
      ORDER BY created_at DESC LIMIT 20`
  ).bind(who.id).all())).results) || [];

  let pays = {};
  if (invRows.length) {
    const marks = invRows.map(() => '?').join(',');
    const rows = ((await soft(env.DB.prepare(
      `SELECT * FROM payments WHERE invoice_id IN (${marks})`
    ).bind(...invRows.map((i) => i.id)).all())).results) || [];
    for (const p of rows) (pays[p.invoice_id] ||= []).push(p);
  }

  const invoices = invRows.map((i) => ({
    id: i.id, created_at: i.created_at, number: i.number || null,
    total: i.total, paid: paidTotal(pays[i.id] || []),
    balance: balanceOf(i, pays[i.id] || []),
    state: statusFor(i, pays[i.id] || []),
    line_items: lines(i.line_items)
  }));

  const owed = invoices
    .filter((i) => i.state !== 'void')
    .reduce((n, i) => n + Math.max(0, i.balance), 0);

  return json({
    ok: true,
    customer: { name: who.name, company: who.company || null },
    visits,
    invoices,
    outstanding: owed,
    slots: await openSlots(env.DB, { customerId: who.id })
  });
}

export async function onRequestPost({ request, params, env }) {
  const token = clean(params.token, 80);
  const who = await customerFor(env, token);
  if (!who) return json({ error: 'This link is not working.' }, 404);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }
  if (clean(body.action, 20) !== 'book') return json({ error: 'Unknown action.' }, 400);

  const slotId = clean(body.slot_id, 60);
  if (!slotId) return json({ error: 'Which time?' }, 400);

  /* A slot put up for somebody else is not theirs to take, even with a
     valid link of their own. */
  const slot = await env.DB.prepare(
    'SELECT customer_id, quote_id FROM booking_slots WHERE id = ? AND archived_at IS NULL'
  ).bind(slotId).first().catch(() => null);
  if (!slot) return json({ error: 'That time is no longer offered.' }, 404);
  if ((slot.customer_id && slot.customer_id !== who.id) || slot.quote_id) {
    return json({ error: 'That time is not on offer here.' }, 403);
  }

  const taken = await takeSlot(env.DB, slotId, {
    name: who.name, customer_id: who.id, phone: who.phone || null,
    service_label: clean(body.service_label, 120) || null
  });
  if (!taken.ok) return json({ error: taken.error }, taken.status || 409);

  return json({ ok: true, booked: { start_at: taken.start_at, end_at: taken.end_at } });
}
