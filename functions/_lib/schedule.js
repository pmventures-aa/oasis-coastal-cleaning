/**
 * The diary: time maths, working hours, and the one function that decides
 * whether something can be booked.
 *
 * Everything here is in the business time zone. Florida observes daylight
 * saving, so "9am on March 8th" and "9am on March 9th" are not the same
 * number of hours after midnight UTC, and a calendar that assumes they are
 * shows the wrong thing twice a year. The conversions below ask Intl what
 * the offset actually was on the day in question.
 */

export const TZ = 'America/New_York';

/* Mon-Fri 7-7, Sat 8-5, Sun 9-3 — the hours already published on the site
   in public/js/data.js. Keep the two in step. Sunday = 0. */
export const WORKING_HOURS = [
  { open: '09:00', close: '15:00' },   // Sun
  { open: '07:00', close: '19:00' },   // Mon
  { open: '07:00', close: '19:00' },
  { open: '07:00', close: '19:00' },
  { open: '07:00', close: '19:00' },
  { open: '07:00', close: '19:00' },   // Fri
  { open: '08:00', close: '17:00' }    // Sat
];

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit'
});

/** The wall clock in Florida at a given instant. */
export function localParts(date) {
  const p = {};
  for (const part of PARTS.formatToParts(date)) p[part.type] = part.value;
  return {
    year: +p.year, month: +p.month, day: +p.day,
    /* Intl writes midnight as 24 in some runtimes. */
    hour: p.hour === '24' ? 0 : +p.hour,
    minute: +p.minute, second: +p.second
  };
}

/** How far ahead of UTC Florida was at that instant, in milliseconds. */
function offsetAt(date) {
  const p = localParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * A local wall-clock time to the instant it names.
 *
 * Guessing the offset from the guessed instant is circular, so it is applied
 * twice: the second pass is correct unless the time is inside a spring-
 * forward gap, where it lands on the hour the clocks jumped to. That is the
 * conventional reading of a time that does not exist.
 */
export function localToUtc(y, m, d, hh = 0, mm = 0) {
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0);
  let guess = new Date(naive - offsetAt(new Date(naive)));
  guess = new Date(naive - offsetAt(guess));
  return guess;
}

/** 'YYYY-MM-DD' + optional 'HH:MM' to the instant it names. */
export function localStampToUtc(dateStr, timeStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const [hh, mm] = String(timeStr || '00:00').split(':').map(Number);
  if (!y || !m || !d) return null;
  return localToUtc(y, m, d, hh || 0, mm || 0);
}

/** The local calendar date an instant falls on. */
export function localDateOf(date) {
  const p = localParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function todayLocal(now = new Date()) { return localDateOf(now); }

/** Calendar-day arithmetic that never trips over a 23- or 25-hour day. */
export function addDays(dateStr, n) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** Sunday = 0, for a local calendar date. */
export function weekdayOf(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * The half-open instant span [start, end) a row occupies.
 *
 * An all-day row runs from local midnight on its first day to local midnight
 * after its last, so it is 23, 24 or 25 hours long as the calendar requires.
 * A timed row that crosses midnight is simply a span whose end is on the
 * next day; nothing here needs to care.
 */
export function spanOf(row) {
  if (row.all_day) {
    const from = row.start_date;
    const to = row.end_date || row.start_date;
    if (!from) return null;
    const start = localStampToUtc(from, '00:00');
    const end = localStampToUtc(addDays(to, 1), '00:00');
    return start && end ? { start: start.getTime(), end: end.getTime() } : null;
  }
  if (!row.start_at || !row.end_at) return null;
  const start = Date.parse(row.start_at);
  const end = Date.parse(row.end_at);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { start, end };
}

/** Half-open, so a 10-12 and a 12-2 do not fight over noon. */
export function overlaps(a, b) {
  return !!a && !!b && a.start < b.end && b.start < a.end;
}

/* ------------------------------------------------------------- recurrence */

/**
 * A weekly block as the occurrences it actually has in a window.
 *
 * The rule is stored once; the occurrences are produced on read. A skipped
 * date is an exception to the series and simply does not appear.
 */
export function expandBlock(block, fromDate, toDate) {
  const base = { ...block, occurrence_of: null };
  if (block.repeat_freq !== 'weekly') return [base];

  let days = [];
  try { days = JSON.parse(block.repeat_days || '[]'); } catch { days = []; }
  if (!Array.isArray(days) || !days.length) return [base];

  let skip = [];
  try { skip = JSON.parse(block.skip_dates || '[]'); } catch { skip = []; }
  const skipped = new Set(skip);

  const first = block.all_day ? block.start_date : localDateOf(new Date(block.start_at));
  const last = block.repeat_until || null;

  /* An all-day repeat spanning several days repeats its whole length. */
  const lengthDays = block.all_day && block.end_date
    ? Math.max(0, Math.round(
        (localStampToUtc(block.end_date, '00:00') - localStampToUtc(block.start_date, '00:00'))
        / 86400000))
    : 0;

  const startTime = block.all_day ? null : hhmmOf(new Date(block.start_at));
  const endTime = block.all_day ? null : hhmmOf(new Date(block.end_at));
  const crossesMidnight = !block.all_day &&
    localDateOf(new Date(block.end_at)) !== localDateOf(new Date(block.start_at));

  const out = [];
  let cursor = fromDate < first ? first : fromDate;
  const stop = last && last < toDate ? last : toDate;

  for (let d = cursor; d <= stop; d = addDays(d, 1)) {
    if (d < first) continue;
    if (!days.includes(weekdayOf(d))) continue;
    if (skipped.has(d)) continue;
    out.push({
      ...block,
      id: block.id + '@' + d,
      occurrence_of: block.id,
      occurrence_date: d,
      start_date: block.all_day ? d : null,
      end_date: block.all_day ? addDays(d, lengthDays) : null,
      start_at: block.all_day ? null : localStampToUtc(d, startTime).toISOString(),
      end_at: block.all_day ? null
        : localStampToUtc(crossesMidnight ? addDays(d, 1) : d, endTime).toISOString()
    });
  }
  return out;
}

function hhmmOf(date) {
  const p = localParts(date);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}
export { hhmmOf };

/* --------------------------------------------------------------- conflicts */

/** Cancelled work releases its time. Everything else holds it. */
export const HOLDS_TIME = (a) => a.status !== 'cancelled' && !a.archived_at;

/**
 * Everything already in the diary that the proposed span runs into.
 *
 * One function, called by every path that writes an appointment, so the
 * calendar and the booking screen can never disagree about whether a slot
 * is free.
 */
export function findConflicts(proposed, { appointments = [], blocks = [], ignoreId = null } = {}) {
  const span = spanOf(proposed);
  if (!span) return [];
  const hits = [];

  for (const a of appointments) {
    if (a.id === ignoreId) continue;
    if (!HOLDS_TIME(a)) continue;
    if (overlaps(span, spanOf(a))) {
      hits.push({ kind: 'appointment', id: a.id, status: a.status,
        label: a.customer_name || a.title || 'A cleaning', row: a });
    }
  }
  for (const b of blocks) {
    if (b.archived_at) continue;
    if ((b.occurrence_of || b.id) === ignoreId) continue;
    if (overlaps(span, spanOf(b))) {
      hits.push({ kind: 'block', id: b.id, label: b.note || 'Unavailable', row: b });
    }
  }
  return hits;
}

/** Outside the hours she published, which is a warning rather than a bar. */
export function outsideWorkingHours(proposed) {
  const span = spanOf(proposed);
  if (!span || proposed.all_day) return false;
  const start = new Date(span.start);
  const day = WORKING_HOURS[weekdayOf(localDateOf(start))];
  if (!day) return false;
  const date = localDateOf(start);
  const open = localStampToUtc(date, day.open).getTime();
  const close = localStampToUtc(date, day.close).getTime();
  return span.start < open || span.end > close;
}

/**
 * Free gaps near a proposed time, within working hours and long enough.
 * Suggestions only — she decides.
 */
export function suggestSlots(proposed, { appointments = [], blocks = [], ignoreId = null, limit = 3 } = {}) {
  const span = spanOf(proposed);
  if (!span || proposed.all_day) return [];
  const minutes = Math.round((span.end - span.start) / 60000);
  if (minutes <= 0) return [];

  const out = [];
  let date = localDateOf(new Date(span.start));
  for (let d = 0; d < 7 && out.length < limit; d++, date = addDays(date, 1)) {
    const hours = WORKING_HOURS[weekdayOf(date)];
    if (!hours) continue;
    const dayOpen = localStampToUtc(date, hours.open).getTime();
    const dayClose = localStampToUtc(date, hours.close).getTime();

    for (let t = dayOpen; t + minutes * 60000 <= dayClose; t += 30 * 60000) {
      if (t < Date.now()) continue;
      if (t === span.start) continue;
      const trial = { all_day: 0,
        start_at: new Date(t).toISOString(),
        end_at: new Date(t + minutes * 60000).toISOString() };
      if (findConflicts(trial, { appointments, blocks, ignoreId }).length) continue;
      out.push(trial.start_at);
      if (out.length >= limit) break;
      t += 90 * 60000;            // spread them out rather than offer 9:00, 9:30, 10:00
    }
  }
  return out;
}
