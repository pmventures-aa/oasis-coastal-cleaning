/**
 * GET  /api/offer/[token] — the times a customer has been offered
 * POST /api/offer/[token] — pick one   { slot_id }
 *
 * The offer is a question, not a promise. Between Kristina sending it and
 * the customer answering, she may have filled one of those times herself,
 * or offered the same hour to somebody else who answered first. So the
 * diary is read fresh on both requests, and a time is only shown -- and
 * only accepted -- if the live calendar still says it is free.
 *
 * Nothing here tells the customer a time is theirs until the row is written
 * and re-checked. An offer that has gone says so plainly and shows what is
 * left, rather than quietly booking them something they did not choose.
 */
import { json, clean, newId, sendEmail, siteBase } from '../../_lib/util.js';
import { ensureScheduleTables } from '../../_lib/schema.js';
import { loadWindowFor, conflictsForSpan } from '../../_lib/schedule-db.js';
import { slotAvailability, offerState } from '../../_lib/offers.js';
import { localDateOf, addDays } from '../../_lib/schedule.js';
import { loadSettings, alertTarget } from '../../_lib/settings.js';

async function tables(db) {
  try { await db.prepare('SELECT 1 FROM time_offers LIMIT 1').first(); return true; }
  catch { return ensureScheduleTables(db); }
}

async function load(db, token) {
  const offer = await db.prepare('SELECT * FROM time_offers WHERE token = ?').bind(token).first();
  if (!offer) return null;
  const r = await db.prepare(
    'SELECT * FROM time_offer_slots WHERE offer_id = ? ORDER BY position, start_at'
  ).bind(offer.id).all();
  return { offer, slots: r.results || [] };
}

/* Only what the customer needs. The offer row also carries her internal ids
   and the address on file, which this link is not a reason to hand out. */
const publicOffer = (offer) => ({
  customer_name: offer.customer_name || null,
  service_label: offer.service_label || null,
  city: offer.city || null,
  note: offer.note || null,
  duration_minutes: offer.duration_minutes,
  expires_at: offer.expires_at || null,
  status: offer.status
});

async function freshSlots(db, slots) {
  if (!slots.length) return [];
  const first = new Date(slots[0].start_at);
  const last = new Date(slots[slots.length - 1].start_at);
  const win = await loadWindowFor(db,
    addDays(localDateOf(first), -2), addDays(localDateOf(last), 2));
  return slotAvailability(slots, win).map((s) => ({
    id: s.id, start_at: s.start_at, end_at: s.end_at, free: s.free, gone: s.gone
  }));
}

/* --------------------------------------------------------------- read */
export async function onRequestGet({ env, params }) {
  if (!env.DB) return json({ error: 'Service unavailable.' }, 503);
  const token = clean(params.token, 120);
  if (!token) return json({ error: 'Invalid link.' }, 400);
  if (!await tables(env.DB)) return json({ error: 'Not found.' }, 404);

  const found = await load(env.DB, token);
  if (!found) return json({ error: 'Not found.' }, 404);
  const { offer, slots } = found;

  const state = offerState(offer);
  if (!state.live) {
    /* A booked offer still answers, so the customer who already picked can
       reopen the link and see what they chose rather than a dead page. */
    let chosen = null;
    if (state.reason === 'booked' && offer.chosen_slot_id) {
      chosen = slots.find((s) => s.id === offer.chosen_slot_id) || null;
    }
    return json({ ok: true, live: false, reason: state.reason,
      offer: publicOffer(offer), chosen });
  }

  const fresh = await freshSlots(env.DB, slots);
  return json({ ok: true, live: true, offer: publicOffer(offer), slots: fresh });
}

/* --------------------------------------------------------------- pick */
export async function onRequestPost({ request, env, params }) {
  if (!env.DB) return json({ error: 'Service unavailable.' }, 503);
  const token = clean(params.token, 120);
  if (!token) return json({ error: 'Invalid link.' }, 400);
  if (!await tables(env.DB)) return json({ error: 'Not found.' }, 404);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }
  const slotId = clean(body.slot_id, 80);

  const found = await load(env.DB, token);
  if (!found) return json({ error: 'Not found.' }, 404);
  const { offer, slots } = found;

  /* Tapping twice, or coming back to a link already answered, is not an
     error -- it is the same answer. Show them what they picked. */
  if (offer.status === 'booked') {
    const chosen = slots.find((s) => s.id === offer.chosen_slot_id) || null;
    return json({ ok: true, already: true, status: 'booked',
      chosen, offer: publicOffer(offer) });
  }

  const state = offerState(offer);
  if (!state.live) {
    return json({ error: state.reason === 'expired'
      ? 'This link has expired. Message Kristina and she will send some new times.'
      : 'These times are no longer being offered. Message Kristina for new ones.',
      reason: state.reason }, 410);
  }

  const slot = slots.find((s) => s.id === slotId);
  if (!slot) return json({ error: 'Pick one of the times offered.' }, 400);

  if (new Date(slot.start_at).getTime() <= Date.now()) {
    return json({ error: 'That time has already passed.',
      slots: await freshSlots(env.DB, slots) }, 409);
  }

  const proposed = { all_day: 0, start_at: slot.start_at, end_at: slot.end_at };

  /* The diary decides, not the offer. */
  const before = await conflictsForSpan(env.DB, proposed, null);
  if (before.length) {
    return json({ error: 'Sorry — that time has just been taken.',
      taken: true, slots: await freshSlots(env.DB, slots) }, 409);
  }

  const now = new Date().toISOString();
  const apptId = 'apt-' + newId();

  try {
    await env.DB.prepare(
      `INSERT INTO appointments
         (id, created_at, lead_id, quote_id, customer_id, title, customer_name,
          phone, address, city, zip, service_label, status, all_day,
          start_at, end_at, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'confirmed',0,?,?,?)`
    ).bind(apptId, now, offer.lead_id || null, offer.quote_id || null,
      offer.customer_id || null, offer.service_label || 'Cleaning',
      offer.customer_name || null, offer.phone || null, offer.address || null,
      offer.city || null, offer.zip || null, offer.service_label || null,
      slot.start_at, slot.end_at,
      'Picked by the customer from the times offered.').run();

    /* Two customers can both pass the check above before either has
       written. The booking is cheap to undo and a double booking is not, so
       it is checked again and the loser withdraws. */
    const after = await conflictsForSpan(env.DB, proposed, apptId);
    if (after.length) {
      await env.DB.prepare('DELETE FROM appointments WHERE id = ?').bind(apptId).run();
      return json({ error: 'Sorry — that time went while you were picking it.',
        taken: true, raced: true, slots: await freshSlots(env.DB, slots) }, 409);
    }

    await env.DB.prepare(
      `UPDATE time_offers SET status = 'booked', appointment_id = ?,
         chosen_slot_id = ?, booked_at = ?, updated_at = ? WHERE id = ? AND status = 'open'`
    ).bind(apptId, slot.id, now, now, offer.id).run();

    try {
      await env.DB.prepare(
        `INSERT INTO schedule_events (id, created_at, subject_kind, subject_id, kind, detail)
         VALUES (?,?,?,?,?,?)`
      ).bind('se-' + newId(), now, 'appointment', apptId, 'created',
        JSON.stringify({ from_offer: offer.id, picked_by: 'customer' })).run();
    } catch { /* the booking stands without its own history line */ }

    /* Tell Kristina. She is the one whose day just changed. */
    try {
      const to = alertTarget(await loadSettings(env.DB), env, 'accept');
      if (to) {
        const when = new Date(slot.start_at).toLocaleString('en-US',
          { timeZone: 'America/New_York', weekday: 'long', month: 'long',
            day: 'numeric', hour: 'numeric', minute: '2-digit' });
        const who = offer.customer_name || 'A customer';
        await sendEmail(env, {
          to,
          subject: who + ' picked ' + when,
          text: who + ' picked ' + when + ' from the times you offered.\n\n' +
            (offer.service_label ? offer.service_label + '\n' : '') +
            (offer.address ? offer.address + (offer.city ? ', ' + offer.city : '') + '\n' : '') +
            (offer.phone ? offer.phone + '\n' : '') +
            '\nIt is on your calendar: ' + siteBase(env) + '/admin/',
          html: '<p><strong>' + who + '</strong> picked <strong>' + when +
            '</strong> from the times you offered.</p>' +
            (offer.service_label ? '<p>' + offer.service_label + '</p>' : '') +
            (offer.address ? '<p>' + offer.address +
              (offer.city ? ', ' + offer.city : '') + '</p>' : '') +
            (offer.phone ? '<p>' + offer.phone + '</p>' : '') +
            '<p>It is on your calendar: <a href="' + siteBase(env) + '/admin/">open the portal</a></p>'
        });
      }
    } catch (err) {
      console.error('Offer booking notification failed:', err);
    }

    return json({ ok: true, status: 'booked',
      chosen: { id: slot.id, start_at: slot.start_at, end_at: slot.end_at },
      offer: publicOffer({ ...offer, status: 'booked' }) });
  } catch (err) {
    return json({ error: 'Could not book that time. Please try again.',
      detail: String(err && err.message || err) }, 503);
  }
}
