/**
 * Turning an arrangement into dates.
 *
 * "Every other Tuesday at nine until she says stop" is a rule. These
 * functions turn it into the days it actually falls on, so the rest of the
 * system can go on dealing in ordinary visits.
 *
 * Everything here is local-calendar arithmetic -- "the 14th", not "24 hours
 * later" -- because a fortnight across a daylight-saving change is not 336
 * hours and a clean booked for nine should still be at nine afterwards. The
 * conversion to an instant happens once, at the end, through the same
 * localStampToUtc the rest of the diary uses.
 */
import { addDays, weekdayOf, localStampToUtc, localDateOf } from './schedule.js';

export const FREQS = ['weekly', 'biweekly', 'monthly'];
export const MAX_VISITS = 120;          // about two years of fortnightly

export function cleanFreq(v) { return FREQS.includes(v) ? v : null; }

export function cleanDays(v) {
  let a = v;
  if (typeof v === 'string') { try { a = JSON.parse(v); } catch { a = []; } }
  if (!Array.isArray(a)) return [];
  const out = [...new Set(a.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))];
  return out.sort((x, y) => x - y);
}

export function cleanDuration(v, fallback = 120) {
  const n = Math.round(Number(v) || 0);
  if (!n || n < 15) return fallback;
  return Math.min(n, 12 * 60);
}

/**
 * The dates the rule produces, in order.
 *
 * A one-off (no freq) is simply its start date. `horizon` caps how far ahead
 * an open-ended arrangement is written down: the rule is the truth and more
 * can always be generated later, so there is no need to fill the database
 * with 2041.
 */
export function occurrences(job, { horizonDays = 180, limit = MAX_VISITS } = {}) {
  const start = String(job.start_date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return [];

  const freq = cleanFreq(job.freq);
  if (!freq) return [start];

  const lastAllowed = (() => {
    const byHorizon = addDays(localDateOf(new Date()), horizonDays);
    const until = job.until_date && /^\d{4}-\d{2}-\d{2}$/.test(job.until_date)
      ? job.until_date : null;
    if (!until) return byHorizon;
    return until < byHorizon ? until : byHorizon;
  })();
  if (lastAllowed < start) return [];

  const out = [];

  if (freq === 'monthly') {
    /* The same day of the month. A 31st in a short month lands on the last
       day of that month rather than skipping it or spilling into the next,
       which is what somebody means by "the 31st". */
    const [y0, m0, d0] = start.split('-').map(Number);
    for (let i = 0; out.length < limit; i++) {
      const y = y0 + Math.floor((m0 - 1 + i) / 12);
      const m = ((m0 - 1 + i) % 12) + 1;
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const d = Math.min(d0, last);
      const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (iso > lastAllowed) break;
      if (iso >= start) out.push(iso);
      if (i > 400) break;
    }
    return out;
  }

  /* Weekly and fortnightly. The days chosen are the days it happens; with
     none chosen it is whatever day the start date falls on. */
  const days = cleanDays(job.byday);
  const wanted = days.length ? days : [weekdayOf(start)];
  const step = freq === 'biweekly' ? 14 : 7;

  /* Walk from the Sunday of the starting week so a fortnight means the same
     week every time, whichever day inside it is picked. */
  const weekStart = addDays(start, -weekdayOf(start));
  for (let w = 0; out.length < limit; w += step) {
    const base = addDays(weekStart, w);
    if (base > lastAllowed && addDays(base, 6) > lastAllowed) break;
    for (const d of wanted) {
      const iso = addDays(base, d);
      if (iso < start || iso > lastAllowed) continue;
      out.push(iso);
      if (out.length >= limit) break;
    }
    if (w > 366 * 2) break;
  }
  return out.sort();
}

/** The occurrences a job should currently have, minus the ones she skipped. */
export function plannedDates(job, exceptions = [], opts = {}) {
  const skipped = new Set((exceptions || [])
    .filter((e) => e.kind === 'skipped').map((e) => e.occurrence_date));
  return occurrences(job, opts).filter((d) => !skipped.has(d));
}

/** One occurrence as an instant pair, using the job's time and length. */
export function spanFor(job, dateIso) {
  const time = /^\d{2}:\d{2}$/.test(String(job.start_time || '')) ? job.start_time : '09:00';
  const mins = cleanDuration(job.duration_min);
  const start = localStampToUtc(dateIso, time);
  if (!start || isNaN(start)) return null;
  return { start_at: start.toISOString(),
    end_at: new Date(start.getTime() + mins * 60000).toISOString() };
}

/** A sentence she can read, rather than a rule she has to decode. */
const DAY_WORDS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function describe(job) {
  const freq = cleanFreq(job.freq);
  if (!freq) return 'One visit';
  const days = cleanDays(job.byday);
  const names = (days.length ? days : [weekdayOf(job.start_date || '2026-01-04')])
    .map((d) => DAY_WORDS[d]);
  const list = names.length === 1 ? names[0]
    : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  const every = freq === 'weekly' ? 'Every ' : freq === 'biweekly' ? 'Every other ' : 'Monthly, on the ';
  const head = freq === 'monthly'
    ? 'Monthly, on day ' + Number(String(job.start_date || '').split('-')[2] || 1)
    : every + list;
  return head + (job.until_date ? ', until ' + job.until_date : '');
}
