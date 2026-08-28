/* One table of cases, run through the server module and the browser copy, so
   the two files cannot drift apart. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as server from '../functions/_lib/format.js';

const w = {};
new Function('window', readFileSync(new URL('../public/js/format.js', import.meta.url), 'utf8'))(w);
const browser = w.OasisFormat;

let n = 0;
const check = (fn, input, expected) => {
  assert.equal(server[fn](input), expected, `server ${fn}(${JSON.stringify(input)})`);
  assert.equal(browser[fn](input), expected, `browser ${fn}(${JSON.stringify(input)})`);
  n++;
};

/* ---- phone numbers ---- */
[
  ['5613887879', '(561) 388-7879'],
  ['15613887879', '(561) 388-7879'],
  ['+1 (561) 388-7879', '(561) 388-7879'],
  ['561.388.7879', '(561) 388-7879'],
  ['561-388-7879', '(561) 388-7879'],
  ['  561 388 7879  ', '(561) 388-7879'],
  ['(561)3887879', '(561) 388-7879'],
  ['', ''],
  [null, ''],
  [undefined, ''],
  ['not a phone', 'not a phone'],       // left alone rather than mangled
  ['+44 20 7946 0958', '+44 20 7946 0958'],
  ['12345', '12345']
].forEach(([input, expected]) => check('formatPhone', input, expected));

/* ---- tel: links keep the digits, not the punctuation ---- */
[
  ['(561) 388-7879', 'tel:+15613887879'],
  ['5613887879', 'tel:+15613887879'],
  ['15613887879', 'tel:+15613887879'],
  ['', '']
].forEach(([input, expected]) => check('telHref', input, expected));

/* ---- everything is Florida time ---- */
// 01:30 UTC is the evening of the day before in Eastern.
[
  ['2026-08-29T01:30:00Z', 'August 28, 2026'],
  ['2026-01-01T04:59:00Z', 'December 31, 2025'],   // and across a year boundary
  ['2026-08-28T16:00:00Z', 'August 28, 2026'],
  ['', ''],
  ['nonsense', '']
].forEach(([input, expected]) => check('formatDate', input, expected));

[
  ['2026-08-29T01:30:00Z', 'Aug 28, 9:30 PM ET'],
  ['2026-08-28T16:00:00Z', 'Aug 28, 12:00 PM ET'],
  ['', '']
].forEach(([input, expected]) => check('formatStamp', input, expected));

[['2026-08-29T01:30:00Z', 'Aug 28'], ['', '']]
  .forEach(([input, expected]) => check('formatDateShort', input, expected));

/* Daylight saving is not something to be clever about — check both sides. */
assert.equal(server.formatStamp('2026-01-15T18:00:00Z'), 'Jan 15, 1:00 PM ET', 'winter, EST');
assert.equal(server.formatStamp('2026-07-15T18:00:00Z'), 'Jul 15, 2:00 PM ET', 'summer, EDT');
n += 2;

console.log(n + ' formatting cases agree across both copies');
