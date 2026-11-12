/**
 * Taking one of the times she has put up.
 *
 * Two people can have the same link open. The claim is therefore an
 * UPDATE conditioned on the slot still being free -- whoever the database
 * serves second changes no rows and is told the time has gone, rather
 * than both being told yes and one of them turning up to a locked door.
 *
 * The diary is checked again at the moment of booking as well. She can
 * put a slot up on Monday and book something else into that hour herself
 * on Tuesday, and the slot would still be sitting there looking free.
 */
import { newId } from './util.js';
import { loadWindowFor } from './schedule-db.js';
import { findConflicts } from './schedule.js';
import { localDateOf } from './schedule.js';

/** The times still going, for a quote, a customer, or the open pool. */
export async function openSlots(db, { quoteId = null, customerId = null, limit = 40 } = {}) {
  const now = new Date().toISOString();
  const where = ['booked_at IS NULL', 'archived_at IS NULL', 'start_at > ?'];
  const binds = [now];

  /* A slot put up for one quote belongs to that quote. One put up for a
     customer belongs to them. One with neither is open to any link. */
  if (quoteId) {
    where.push('(quote_id = ? OR (quote_id IS NULL AND customer_id IS NULL))');
    binds.push(quoteId);
  } else if (customerId) {
    where.push('(customer_id = ? OR (quote_id IS NULL AND customer_id IS NULL))');
    binds.push(customerId);
  } else {
    where.push('quote_id IS NULL AND customer_id IS NULL');
  }

  try {
    const r = await db.prepare(
      `SELECT id, start_at, end_at, note FROM booking_slots
        WHERE ${where.join(' AND ')} ORDER BY start_at LIMIT ?`
    ).bind(...binds, Math.min(100, limit)).all();
    return r.results || [];
  } catch { return []; }
}

/**
 * Claim a slot and write the visit. Returns { ok, appointment } or
 * { error, status }.
 */
export async function takeSlot(db, slotId, who = {}) {
  const slot = await db.prepare(
    'SELECT * FROM booking_slots WHERE id = ? AND archived_at IS NULL'
  ).bind(slotId).first().catch(() => null);
  if (!slot) return { error: 'That time is no longer offered.', status: 404 };
  if (slot.booked_at) return { error: 'Someone has just taken that time.', status: 409 };
  if (new Date(slot.start_at).getTime() <= Date.now()) {
    return { error: 'That time has passed.', status: 409 };
  }

  /* The diary may have moved since she put this up. */
  const day = localDateOf(new Date(slot.start_at));
  try {
    const win = await loadWindowFor(db, day, day);
    const clash = findConflicts(
      { all_day: 0, start_at: slot.start_at, end_at: slot.end_at },
      { appointments: win.appointments, blocks: win.blocks });
    if (clash && clash.length) {
      return { error: 'That time is no longer free.', status: 409 };
    }
  } catch { /* cannot read the diary: the claim below is still the guard */ }

  const now = new Date().toISOString();
  const apptId = 'apt-' + newId();

  /* The race is settled here: only one caller can move it from free. */
  let claimed;
  try {
    claimed = await db.prepare(
      `UPDATE booking_slots SET booked_at = ?, booked_appointment_id = ?, booked_name = ?
        WHERE id = ? AND booked_at IS NULL AND archived_at IS NULL`
    ).bind(now, apptId, who.name || null, slotId).run();
  } catch (err) {
    return { error: 'That booking could not be saved.', status: 503 };
  }
  const changed = claimed && claimed.meta
    ? (claimed.meta.changes != null ? claimed.meta.changes : claimed.meta.rows_written)
    : null;
  if (changed === 0) return { error: 'Someone has just taken that time.', status: 409 };

  try {
    await db.prepare(
      `INSERT INTO appointments (id, created_at, updated_at, status, all_day,
         start_at, end_at, customer_id, customer_name, phone, address, city,
         service_label, notes, lead_id, quote_id)
       VALUES (?,?,?,'confirmed',0,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(apptId, now, now, slot.start_at, slot.end_at,
      slot.customer_id || who.customer_id || null, who.name || null, who.phone || null,
      who.address || null, who.city || null, who.service_label || null,
      who.notes || null, who.lead_id || null, slot.quote_id || who.quote_id || null).run();
  } catch (err) {
    /* The visit is the point. Without it the slot is held for nothing, so
       it goes back up rather than disappearing into a booked state with
       nothing behind it. */
    try {
      await db.prepare(
        `UPDATE booking_slots SET booked_at = NULL, booked_appointment_id = NULL,
           booked_name = NULL WHERE id = ?`
      ).bind(slotId).run();
    } catch { /* best effort */ }
    return { error: 'That booking could not be saved.', status: 503,
      detail: String(err && err.message || err) };
  }

  return { ok: true, appointment_id: apptId, start_at: slot.start_at, end_at: slot.end_at };
}
