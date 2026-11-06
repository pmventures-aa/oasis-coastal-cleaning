/**
 * GET    /api/admin/offers        — offers she has out
 * POST   /api/admin/offers        — offer a customer a few times
 * PATCH  /api/admin/offers        — withdraw one
 *
 * Creating an offer checks every time against the live diary, the same way
 * booking does, so she cannot offer a slot she has already filled. It does
 * NOT reserve them: three offered times for one job must not black out three
 * slots she could still sell. The offer is re-checked when the customer
 * answers, which is the only check that can be trusted.
 */
import { json, clean, newId, siteBase } from '../../_lib/util.js';
import { isSignedIn } from '../../_lib/auth.js';
import { ensureScheduleTables } from '../../_lib/schema.js';
import { loadWindowFor, conflictsForSpan } from '../../_lib/schedule-db.js';
import {
  normalizeSlots, slotAvailability, cleanDuration, expiryFrom,
  MAX_SLOTS, DEFAULT_DURATION
} from '../../_lib/offers.js';
import { localDateOf, addDays } from '../../_lib/schedule.js';

const SETUP = 'Apply migration 0012 in D1 → oasis → Console.';

const guard = async (request, env) => {
  if (!await isSignedIn(request, env)) return json({ error: 'Please sign in.' }, 401);
  if (!env.DB) return json({ error: 'No database connected.' }, 503);
  return null;
};

async function hasTables(db) {
  try { await db.prepare('SELECT 1 FROM time_offers LIMIT 1').first(); return true; }
  catch { return ensureScheduleTables(db); }
}

async function slotsOf(db, offerId) {
  const r = await db.prepare(
    'SELECT * FROM time_offer_slots WHERE offer_id = ? ORDER BY position, start_at'
  ).bind(offerId).all();
  return r.results || [];
}

/* ------------------------------------------------------------------ read */
export async function onRequestGet({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  if (!await hasTables(env.DB)) {
    return json({ error: 'Offers are not set up yet.', setup: SETUP, needsSetup: true }, 503);
  }

  const url = new URL(request.url);
  const only = clean(url.searchParams.get('status'), 20);

  try {
    const rows = await env.DB.prepare(
      `SELECT * FROM time_offers
        ${only ? 'WHERE status = ?' : "WHERE status IN ('open','booked')"}
        ORDER BY created_at DESC LIMIT 60`
    ).bind(...(only ? [only] : [])).all();

    const offers = [];
    for (const o of rows.results || []) {
      offers.push({ ...o, slots: await slotsOf(env.DB, o.id),
        url: siteBase(env) + '/offer?t=' + o.token });
    }
    return json({ ok: true, offers });
  } catch (err) {
    return json({ error: 'Could not read your offers.',
      detail: String(err && err.message || err) }, 503);
  }
}

/* ---------------------------------------------------------------- create */
export async function onRequestPost({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  if (!await hasTables(env.DB)) {
    return json({ error: 'Offers are not set up yet.', setup: SETUP, needsSetup: true }, 503);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }

  const duration = cleanDuration(body.duration_minutes || DEFAULT_DURATION);
  const { slots, dropped } = normalizeSlots(body.slots, duration);

  if (!slots.length) {
    return json({ error: 'Pick at least one time that has not already passed.', dropped }, 400);
  }

  /* Each offered time is checked against the diary now. She is told which
     ones clash rather than having them silently removed. */
  const first = new Date(slots[0].start_at);
  const last = new Date(slots[slots.length - 1].start_at);
  const win = await loadWindowFor(env.DB,
    addDays(localDateOf(first), -2), addDays(localDateOf(last), 2));
  const checked = slotAvailability(slots, win);
  const clashing = checked.filter((s) => !s.free);

  if (clashing.length && body.override !== true) {
    return json({
      error: clashing.length === checked.length
        ? 'Every one of those is already taken.'
        : 'Some of those are already taken.',
      slots: checked, dropped
    }, 409);
  }

  const now = new Date().toISOString();
  const id = 'off-' + newId();
  const token = newId() + newId();

  try {
    await env.DB.prepare(
      `INSERT INTO time_offers
         (id, token, created_at, lead_id, quote_id, customer_id, customer_name,
          email, phone, address, city, zip, service_label, duration_minutes,
          note, status, expires_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'open',?)`
    ).bind(id, token, now,
      clean(body.lead_id, 60) || null, clean(body.quote_id, 60) || null,
      clean(body.customer_id, 60) || null, clean(body.customer_name, 120) || null,
      clean(body.email, 160) || null, clean(body.phone, 40) || null,
      clean(body.address, 200) || null, clean(body.city, 80) || null,
      clean(body.zip, 20) || null, clean(body.service_label, 120) || null,
      duration, clean(body.note, 500) || null,
      expiryFrom(body.expiry_days)).run();

    let i = 0;
    for (const s of slots) {
      await env.DB.prepare(
        `INSERT INTO time_offer_slots (id, offer_id, position, start_at, end_at)
         VALUES (?,?,?,?,?)`
      ).bind('ofs-' + newId(), id, i++, s.start_at, s.end_at).run();
    }

    const row = await env.DB.prepare('SELECT * FROM time_offers WHERE id = ?').bind(id).first();
    return json({ ok: true,
      offer: { ...row, slots: await slotsOf(env.DB, id) },
      url: siteBase(env) + '/offer?t=' + token,
      dropped, overridden: clashing.length ? clashing : undefined }, 201);
  } catch (err) {
    return json({ error: 'Could not save that offer.',
      detail: String(err && err.message || err) }, 503);
  }
}

/* -------------------------------------------------------------- withdraw */
export async function onRequestPatch({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }
  const id = clean(body.id, 60);
  if (!id) return json({ error: 'Which offer?' }, 400);

  const row = await env.DB.prepare('SELECT * FROM time_offers WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'That offer is not here.' }, 404);
  if (row.status === 'booked') {
    return json({ error: 'They have already picked a time. Change the appointment instead.' }, 409);
  }

  await env.DB.prepare(
    `UPDATE time_offers SET status = 'withdrawn', updated_at = ? WHERE id = ?`
  ).bind(new Date().toISOString(), id).run();

  return json({ ok: true, status: 'withdrawn' });
}

export { MAX_SLOTS };
