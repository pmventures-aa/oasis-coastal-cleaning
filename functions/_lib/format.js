/**
 * How dates, times and phone numbers are written, everywhere.
 *
 * Two things were wrong before this existed. Nothing named a timezone, so a
 * date rendered wherever the code happened to run — and the emails run in a
 * Worker, which is UTC. A quote sent at nine on a Thursday evening in Florida
 * told the customer it was Friday. And phone numbers were shown exactly as
 * they were typed, so the same person appeared as 5613887879 in one place and
 * (561) 388-7879 in another.
 *
 * public/js/format.js is the browser copy of this file. tests/format.test.mjs
 * runs the same table of cases through both so they cannot drift.
 */

/** Kristina's business runs on Florida time, and so does everything she reads. */
export const TZ = 'America/New_York';

const DATE = { timeZone: TZ, month: 'long', day: 'numeric', year: 'numeric' };
const SHORT = { timeZone: TZ, month: 'short', day: 'numeric' };
const STAMP = {
  timeZone: TZ, month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit'
};

const parse = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d) ? null : d;
};

/** "September 4, 2026" */
export function formatDate(value) {
  const d = parse(value);
  return d ? d.toLocaleDateString('en-US', DATE) : '';
}

/** "Sep 4" */
export function formatDateShort(value) {
  const d = parse(value);
  return d ? d.toLocaleDateString('en-US', SHORT) : '';
}

/** "Sep 4, 3:45 PM ET" — the ET is worth the four characters. */
export function formatStamp(value) {
  const d = parse(value);
  if (!d) return '';
  return d.toLocaleString('en-US', STAMP).replace(/ /g, ' ') + ' ET';
}

/**
 * "(561) 388-7879" from anything recognisable, including 15613887879,
 * +1 561 388 7879 and 561.388.7879. Anything that is not a US number comes
 * back as it went in, because a half-formatted number is worse than a raw one.
 */
export function formatPhone(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  const ten = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
  if (ten.length !== 10) return raw;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/** The digits a phone app needs, not the ones a person reads. */
export function telHref(value) {
  const digits = String(value == null ? '' : value).replace(/\D/g, '');
  if (!digits) return '';
  return 'tel:+' + (digits.length === 10 ? '1' + digits : digits);
}
