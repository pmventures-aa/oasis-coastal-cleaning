/* After she presses send, the only thing she can act on is "it arrived and
   they have not opened it". That used to be a run of grey text identical to
   the email address printed above it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../public/js/admin.js', import.meta.url), 'utf8');
const fn = src.slice(src.indexOf('function trackingChips'), src.indexOf('function deviceOf'));

test('the quote tracking line', async (t) => {
  await t.test('marks a quote that was delivered and never opened', () => {
    assert.match(fn, /Not opened yet/);
    assert.match(fn, /'wait'/, 'and marks it as the one to chase');
  });

  await t.test('a failed or bounced email is not styled as good news', () => {
    assert.match(fn, /failed.*bounced|bounced.*failed/s);
    assert.match(fn, /failed \? 'bad' : 'ok'/);
  });

  await t.test('says when, not just whether', () => {
    for (const re of [/last ' \+ when\(/, /'Accepted ' \+ when\(/, /'Declined ' \+ when\(/]) {
      assert.match(fn, re, 'a bare "Accepted" does not say if it was today or last month');
    }
  });

  await t.test('nothing to report renders nothing, not an empty row', () => {
    assert.match(fn, /chips\.length \? /);
  });
});

test('the quote card does not repeat its own status', () => {
  /* The summary it opens from reads "$250.00 · Sent" and the lead header
     above carries the same pill; a third copy stretched across the card. */
  assert.ok(!/function quotePill/.test(src), 'quotePill is gone, not merely unused');
  const card = src.slice(src.indexOf('function quoteCard('), src.indexOf('function settingField'));
  assert.ok(!/quotePill\(/.test(card));
});
