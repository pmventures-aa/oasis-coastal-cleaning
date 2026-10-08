/* An optional line is quoted but not charged. If it ever reaches the total,
   a customer is shown a bigger number than the one they agreed to. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLineItems } from '../functions/_lib/quotes.js';

const DEEP = { label: 'Deep clean — everything included', unit_dollars: '250', qty: 1, cadence: 'onetime' };
const RECUR = { label: 'Recurring clean', unit_dollars: '110', qty: 1, cadence: 'biweekly', optional: true };

test('optional lines stay out of the total', async (t) => {
  await t.test('the exact quote Kristina wants to send', () => {
    const q = normalizeLineItems([DEEP, RECUR]);
    assert.equal(q.total, 25000, 'total is the deep clean only');
    assert.equal(q.subtotal, 25000);
    assert.equal(q.items.length, 2, 'the offer is still on the quote');
    assert.equal(q.items[1].optional, true);
    assert.equal(q.items[1].unit_price, 11000, 'and still carries its price');
    assert.equal(q.items[1].cadence, 'biweekly');
  });

  await t.test('without the flag it would have been added — the bug this prevents', () => {
    const q = normalizeLineItems([DEEP, { ...RECUR, optional: false }]);
    assert.equal(q.total, 36000);
  });

  await t.test('several optional lines all stay out', () => {
    const q = normalizeLineItems([
      DEEP,
      RECUR,
      { label: 'Monthly deep', unit_dollars: '200', cadence: 'monthly', optional: true }
    ]);
    assert.equal(q.total, 25000);
  });

  await t.test('a quote cannot be nothing but optional lines', () => {
    assert.throws(() => normalizeLineItems([RECUR]), /at least one line that is not optional/);
  });

  await t.test('the flag is accepted in the shapes a form and JSON produce', () => {
    for (const v of [true, 1, 'on']) {
      assert.equal(normalizeLineItems([DEEP, { ...RECUR, optional: v }]).total, 25000, String(v));
    }
  });

  await t.test('anything else means not optional, so money is never dropped by accident', () => {
    for (const v of [false, 0, '', null, undefined, 'no', 'false']) {
      const q = normalizeLineItems([DEEP, { ...RECUR, optional: v }]);
      assert.equal(q.total, 36000, JSON.stringify(v));
      assert.equal(q.items[1].optional, false);
    }
  });

  await t.test('an optional line is still clamped against a negative price', () => {
    const q = normalizeLineItems([DEEP, { ...RECUR, unit_dollars: '-500' }]);
    assert.equal(q.items[1].unit_price, 0);
    assert.equal(q.total, 25000);
  });

  await t.test('quantity still multiplies on an optional line it is shown with', () => {
    const q = normalizeLineItems([DEEP, { ...RECUR, qty: 3 }]);
    assert.equal(q.items[1].total, 33000);
    assert.equal(q.total, 25000, 'but never reaches the total');
  });

  await t.test('an ordinary quote is completely unaffected', () => {
    const q = normalizeLineItems([DEEP]);
    assert.equal(q.total, 25000);
    assert.equal(q.items[0].optional, false);
  });
});
