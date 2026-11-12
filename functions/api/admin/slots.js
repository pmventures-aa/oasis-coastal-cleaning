/**
 * GET    /api/admin/slots   — the times she has put up
 * POST   /api/admin/slots   — put one up
 * DELETE /api/admin/slots?id=…  — take one back down
 *
 * There is no record anywhere of when she works, so nothing here is
 * computed. She offers the times she is willing to have taken and those
 * are the only ones a client is ever shown.
 */
import { json, clean, newId } from '../../_lib/util.js';
import { gate } from '../../_lib/guard.js';
import { applySchema } from '../../_lib/schema.js';
import { loadWindowFor } from '../../_lib/schedule-db.js';
import { findConflicts, localDateOf } from '../../_lib/schedule.js';

const soft = (p) => p.then((r) => r, () => ({ results: [] }));

async function ready(db) {
  try { await db.prepare('SELECT 1 FROM booking_slots LIMIT 1').first(); return true; }
  catch {
    try { await applySchema(db); } catch { return false; }
    try { await db.prepare('SELECT 1 FROM booking_slots LIMIT 1').first(); return true; }
    catch { return false; }
  }
}

export async function onRequestGet({ request, env }) {
  const g = await gate(request, env, 'everyoneSchedule');
  if (g.response) return g.response;
  if (!await ready(env.DB)) return json({ error: 'Booking is not set up yet.' }, 503);

  const url = new URL(request.url);
  const quoteId = clean(url.searchParams.get('quote_id'), 60);
  const customerId = clean(url.searchParams.get('customer_id'), 60);

  const where = ['archived_at IS NULL'];
  const binds = [];
  if (quoteId) { where.push('quote_id = ?'); binds.push(quoteId); }
  else if (customerId) { where.push('customer_id = ?'); binds.push(customerId); }

  const rows = ((await soft(env.DB.prepare(
    `SELECT * FROM booking_slots WHERE ${where.join(' AND ')}
      ORDER BY start_at LIMIT 200`
  ).bind(...binds).all())).results) || [];

  return json({ ok: true, slots: rows });
}

export async function onRequestPost({ request, env }) {
  const g = await gate(request, env, 'everyoneSchedule');
  if (g.response) return g.response;
  if (!await ready(env.DB)) return json({ error: 'Booking is not set up yet.' }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }

  const start = clean(body.start_at, 40);
  const end = clean(body.end_at, 40);
  if (!start || !end) return json({ error: 'When is it?' }, 400);
  const s = new Date(start).getTime(), e = new Date(end).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) {
    return json({ error: 'That start and finish do not make sense.' }, 400);
  }
  if (s <= Date.now()) return json({ error: 'That time has already passed.' }, 400);

  /* Offering an hour she is already booked for is how a client is told
     yes and then telephoned to be told no. */
  try {
    const day = localDateOf(new Date(start));
    const win = await loadWindowFor(env.DB, day, day);
    const clash = findConflicts({ all_day: 0, start_at: start, end_at: end },
      { appointments: win.appointments, blocks: win.blocks });
    if (clash && clash.length) {
      return json({ error: 'You already have something then.',
        clashes: clash.length }, 409);
    }
  } catch { /* unreadable diary: let her put it up, the booking re-checks */ }

  const id = 'slot-' + newId();
  await env.DB.prepare(
    `INSERT INTO booking_slots (id, created_at, start_at, end_at, quote_id,
       customer_id, note) VALUES (?,?,?,?,?,?,?)`
  ).bind(id, new Date().toISOString(), start, end,
    clean(body.quote_id, 60) || null, clean(body.customer_id, 60) || null,
    clean(body.note, 200) || null).run();

  const row = await env.DB.prepare('SELECT * FROM booking_slots WHERE id = ?').bind(id).first();
  return json({ ok: true, slot: row }, 201);
}

export async function onRequestDelete({ request, env }) {
  const g = await gate(request, env, 'everyoneSchedule');
  if (g.response) return g.response;

  const id = clean(new URL(request.url).searchParams.get('id'), 60);
  if (!id) return json({ error: 'Which one?' }, 400);

  const row = await env.DB.prepare('SELECT * FROM booking_slots WHERE id = ?')
    .bind(id).first().catch(() => null);
  if (!row) return json({ error: 'That time is not here.' }, 404);
  if (row.booked_at) {
    /* Taking down a time somebody has already booked would leave them
       with a visit nobody meant to keep. Cancel the visit instead. */
    return json({ error: 'Somebody has taken that one. Cancel the visit in the diary instead.' }, 409);
  }
  await env.DB.prepare('UPDATE booking_slots SET archived_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), id).run();
  return json({ ok: true, removed: id });
}
