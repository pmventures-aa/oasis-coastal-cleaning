/**
 * Offering a customer a few times to pick from.
 *
 * The rules live here, apart from the routes, because both ends need them:
 * the admin screen builds an offer, the public page reads one, and the two
 * must agree about what a valid offer is and which of its times are still
 * free. Conflict detection itself is not re-implemented -- it is the same
 * findConflicts() the diary and the booking screen already use, so an offer
 * can never disagree with the calendar about whether a slot is taken.
 */
import { findConflicts, localStampToUtc, spanOf } from './schedule.js';

export const MAX_SLOTS = 5;
export const MIN_SLOTS = 1;
export const DEFAULT_DURATION = 120;
export const DEFAULT_EXPIRY_DAYS = 7;

/** Minutes she can choose for how long the clean takes. */
export const DURATIONS = [60, 90, 120, 150, 180, 240, 300, 360];

export function cleanDuration(v) {
  const n = Math.round(Number(v) || 0);
  if (!n || n < 15) return DEFAULT_DURATION;
  return Math.min(n, 12 * 60);
}

/**
 * Turn what the screen sent into slots we would store.
 *
 * Accepts either a pair of instants, or a local date and time plus the
 * duration -- the screen uses native date and time inputs, which give local
 * wall-clock values, and those become instants using the offset in force on
 * that date. Returns { slots, dropped } rather than throwing, because the
 * caller wants to tell her WHICH ones it would not take.
 */
export function normalizeSlots(input, durationMinutes = DEFAULT_DURATION, now = new Date()) {
  const duration = cleanDuration(durationMinutes);
  const slots = [];
  const dropped = [];
  const seen = new Set();

  for (const raw of Array.isArray(input) ? input : []) {
    if (!raw || typeof raw !== 'object') continue;

    let start = null;
    if (raw.start_at) {
      const d = new Date(raw.start_at);
      if (!isNaN(d)) start = d;
    } else if (raw.date && raw.time) {
      const d = localStampToUtc(String(raw.date), String(raw.time));
      if (d && !isNaN(d)) start = d;
    }
    if (!start) { dropped.push({ raw, why: 'That is not a date and time we could read.' }); continue; }

    let end = raw.end_at ? new Date(raw.end_at) : new Date(start.getTime() + duration * 60000);
    if (isNaN(end) || end <= start) end = new Date(start.getTime() + duration * 60000);

    if (start.getTime() <= now.getTime()) {
      dropped.push({ raw, start_at: start.toISOString(), why: 'That time has already passed.' });
      continue;
    }
    const key = start.toISOString() + '|' + end.toISOString();
    if (seen.has(key)) { dropped.push({ raw, why: 'That time was already on the list.' }); continue; }
    seen.add(key);

    slots.push({ start_at: start.toISOString(), end_at: end.toISOString() });
  }

  slots.sort((a, b) => a.start_at.localeCompare(b.start_at));

  /* Two offered times that overlap each other are a mistake she cannot see
     from the form -- whichever they pick, the other was never really free. */
  const kept = [];
  for (const s of slots) {
    const clash = kept.find((k) => overlapsPair(k, s));
    if (clash) { dropped.push({ raw: s, start_at: s.start_at, why: 'That overlaps another time on the list.' }); continue; }
    kept.push(s);
  }

  return { slots: kept.slice(0, MAX_SLOTS), dropped, duration };
}

function overlapsPair(a, b) {
  const x = spanOf({ all_day: 0, start_at: a.start_at, end_at: a.end_at });
  const y = spanOf({ all_day: 0, start_at: b.start_at, end_at: b.end_at });
  return !!x && !!y && x.start < y.end && y.start < x.end;
}

/** An offer nobody can answer any more, and why. */
export function offerState(offer, now = new Date()) {
  if (!offer) return { live: false, reason: 'not_found' };
  if (offer.status === 'booked') return { live: false, reason: 'booked' };
  if (offer.status === 'withdrawn') return { live: false, reason: 'withdrawn' };
  if (offer.expires_at && new Date(offer.expires_at).getTime() <= now.getTime()) {
    return { live: false, reason: 'expired' };
  }
  if (offer.status !== 'open') return { live: false, reason: offer.status || 'closed' };
  return { live: true, reason: null };
}

/**
 * Which of the offered times a customer could still take, right now.
 *
 * A slot is only offered if the live diary agrees it is free. Nothing here
 * assumes the offer is still good because it was good when it was sent --
 * that assumption is exactly what double-books a Saturday.
 */
export function slotAvailability(slots, { appointments = [], blocks = [], now = new Date() } = {}) {
  return (slots || []).map((s) => {
    const proposed = { all_day: 0, start_at: s.start_at, end_at: s.end_at };
    const past = new Date(s.start_at).getTime() <= now.getTime();
    const conflicts = past ? [] : findConflicts(proposed, { appointments, blocks });
    return {
      ...s,
      free: !past && conflicts.length === 0,
      gone: past ? 'past' : (conflicts.length ? 'taken' : null)
    };
  });
}

/** A link is only worth sending if something on it can still be picked. */
export function anyFree(slots) { return (slots || []).some((s) => s.free); }

export function expiryFrom(days = DEFAULT_EXPIRY_DAYS, now = new Date()) {
  const n = Math.min(Math.max(Math.round(Number(days) || DEFAULT_EXPIRY_DAYS), 1), 60);
  return new Date(now.getTime() + n * 86400000).toISOString();
}
