/* The document a customer actually receives. These pin the things that went
   wrong in the quote Kristina sent Maria. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuotePdf, quoteRef } from '../functions/_lib/quote-pdf.js';
import { normalizeLineItems } from '../functions/_lib/quotes.js';
import { splitAddons } from '../functions/_lib/addons.js';

const BUSINESS = { name: 'Oasis Coastal Cleaning', tagline: 'Fresh Spaces. Happy Places.',
  phone: '(561) 201-7123', email: 'info@oasiscoastalcleaning.com' };

function build(lines, over = {}) {
  const n = normalizeLineItems(lines);
  return buildQuotePdf({
    quote: { ...n, line_items: n.items, id: 'q_abc12345', status: 'sent',
      customer_name: 'Maria Alvarez', total: n.total, subtotal: n.subtotal, tax: 0,
      created_at: '2026-10-08T12:00:00Z', expires_at: '2026-10-22T12:00:00Z', ...over },
    lead: { name: 'Maria Alvarez', service_label: 'Home Cleaning', city: 'Lake Worth' },
    business: BUSINESS, settings: {},
    proposalUrl: 'https://www.oasiscoastalcleaning.com/proposal?t=abc'
  });
}
const DEEP = { label: 'Home Cleaning', qty: 1, unit_dollars: '250', cadence: 'onetime' };

test('the quote document', async (t) => {
  await t.test('builds a readable PDF', () => {
    const b = build([DEEP]);
    assert.ok(b.length > 1000);
    assert.equal(new TextDecoder().decode(b.slice(0, 5)), '%PDF-');
  });

  await t.test('a plain quote fits on one page', () => {
    const b = build([DEEP], { notes: 'Hi Maria,\nHere is the quote.\nKristina' });
    const text = new TextDecoder('latin1').decode(b);
    assert.match(text, /Page 1 of 1/, 'single page, with a footer that says so');
  });

  await t.test('carries a short reference somebody could read down the phone', () => {
    const ref = quoteRef({ id: 'q_8f3a2b7c91de' });
    assert.match(ref, /^OCC-[A-Z0-9]{5}$/);
    assert.equal(quoteRef({ id: 'q_8f3a2b7c91de' }), ref, 'and is stable for the same quote');
  });

  await t.test('falls back to the token when there is no id yet', () => {
    assert.match(quoteRef({ token: 'abcdef123456' }), /^OCC-[A-Z0-9]{5}$/);
  });

  await t.test('an optional line never reaches the total', () => {
    const n = normalizeLineItems([DEEP,
      { label: 'Recurring', qty: 1, unit_dollars: '150', cadence: 'biweekly', optional: true }]);
    assert.equal(n.total, 25000);
  });

  await t.test('a $0 line is built without throwing and is not charged', () => {
    const n = normalizeLineItems([DEEP, { label: 'Inside the fridge', qty: 1, unit_dollars: '0' }]);
    assert.equal(n.total, 25000);
    assert.equal(n.items[1].total, 0);
    assert.ok(build([DEEP, { label: 'Inside the fridge', qty: 1, unit_dollars: '0' }]).length > 1000);
  });

  await t.test('every page is numbered, however long the quote runs', () => {
    const many = [DEEP];
    for (let i = 0; i < 30; i++) many.push({ label: 'Extra room ' + i, qty: 1, unit_dollars: '20',
      description: 'A description long enough to take more than one line on the page, so the table has to break.' });
    const text = new TextDecoder('latin1').decode(build(many));
    const m = text.match(/Page 1 of (\d+)/);
    assert.ok(m, 'page one is numbered');
    assert.ok(Number(m[1]) > 1, 'and knows there is more than one page');
  });
});

test('add-ons the customer already asked for', async (t) => {
  await t.test('are not offered again as extras', () => {
    const { included, available } = splitAddons([], ['Oven', 'Refrigerator']);
    assert.ok(included.some((a) => a.id === 'oven'), 'oven counts as already covered');
    assert.ok(!available.some((a) => a.id === 'oven'), 'and is not on the list to add');
    assert.ok(available.some((a) => a.id === 'blinds'), 'things never discussed still are');
  });

  await t.test('matching ignores case and punctuation', () => {
    const { available } = splitAddons([], ['  oven  ', 'interior window']);
    assert.ok(!available.some((a) => a.id === 'oven'));
    assert.ok(!available.some((a) => a.id === 'windows-in'));
  });

  await t.test('a quote line still suppresses its add-on', () => {
    const { available } = splitAddons([{ label: 'Oven (inside)' }], []);
    assert.ok(!available.some((a) => a.id === 'oven'));
  });

  await t.test('no requests means the whole catalogue is still offerable', () => {
    const { included, available } = splitAddons([], []);
    assert.equal(included.length, 0);
    assert.ok(available.length >= 14);
  });

  await t.test('junk in the stored list does not drop real add-ons', () => {
    const { available } = splitAddons([], [null, '', 123, {}]);
    assert.ok(available.length >= 14);
  });
});
