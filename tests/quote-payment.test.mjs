/**
 * Quote payment methods, paid status, and recurring line-item cadence.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  QUOTE_STATUSES,
  PAYMENT_METHODS,
  LINE_FREQUENCIES,
  normalizePaymentMethod,
  normalizeLineFrequency,
  normalizeLineItems,
  applyScheduleToLineItems,
  isRecurringFlag
} from '../functions/_lib/quotes.js';
import { buildCustomerQuoteEmail } from '../functions/_lib/email.js';

assert.ok(QUOTE_STATUSES.includes('paid'));
assert.deepEqual(PAYMENT_METHODS, ['cash', 'zelle', 'paypal', 'other']);
assert.deepEqual(LINE_FREQUENCIES, ['weekly', 'biweekly', 'monthly']);

assert.equal(normalizePaymentMethod('Zelle'), 'zelle');
assert.equal(normalizePaymentMethod('PayPal'), 'paypal');
assert.equal(normalizePaymentMethod('cash'), 'cash');
assert.equal(normalizePaymentMethod('venmo'), null);
assert.equal(normalizePaymentMethod(''), null);

assert.equal(normalizeLineFrequency('every two weeks'), 'biweekly');
assert.equal(normalizeLineFrequency('bi-weekly'), 'biweekly');
assert.equal(normalizeLineFrequency('Weekly'), 'weekly');
assert.equal(normalizeLineFrequency('one time'), null);
assert.equal(normalizeLineFrequency('yearly'), null);

assert.equal(isRecurringFlag(true), true);
assert.equal(isRecurringFlag('true'), true);
assert.equal(isRecurringFlag(1), true);
assert.equal(isRecurringFlag(false), false);

const normalized = normalizeLineItems([
  { label: 'Home Cleaning', qty: 1, unit_dollars: '185', recurring: true, frequency: 'weekly' },
  { label: 'Oven (inside)', qty: 1, unit_dollars: '45', recurring: false }
]);
assert.equal(normalized.items[0].recurring, true);
assert.equal(normalized.items[0].frequency, 'weekly');
assert.equal(normalized.items[1].recurring, false);
assert.equal(normalized.items[1].frequency, null);
assert.equal(normalized.total, 23000);

const defaultFreq = normalizeLineItems([
  { label: 'Home Cleaning', qty: 1, unit_price: 12000, recurring: true }
]);
assert.equal(defaultFreq.items[0].frequency, 'biweekly');

const scheduled = applyScheduleToLineItems(normalized.items, [
  { recurring: true, frequency: 'monthly' },
  { recurring: true, frequency: 'weekly' }
]);
assert.equal(scheduled[0].unit_price, 18500);
assert.equal(scheduled[0].frequency, 'monthly');
assert.equal(scheduled[1].recurring, true);
assert.equal(scheduled[1].frequency, 'weekly');
assert.equal(scheduled[1].total, 4500);

assert.throws(
  () => applyScheduleToLineItems(normalized.items, [{ recurring: true }]),
  /Line count/
);

const env = { SITE_URL: 'https://www.oasiscoastalcleaning.com' };
const mailed = buildCustomerQuoteEmail(env, {
  quote: {
    customer_name: 'Ada',
    total: 18500,
    subtotal: 18500,
    tax: 0,
    notes: '',
    terms: '',
    expires_at: '2026-09-10T00:00:00.000Z',
    line_items: [
      { label: 'Home Cleaning', qty: 1, unit_price: 18500, total: 18500, recurring: true, frequency: 'biweekly' }
    ]
  },
  lead: { lead_name: 'Ada', service_label: 'Home Cleaning', city: 'Margate' },
  proposalUrl: 'https://www.oasiscoastalcleaning.com/proposal?t=abc'
});
assert.match(mailed.customerHtml, /Every two weeks/);
assert.match(mailed.customerText, /Every two weeks/);

const here = dirname(fileURLToPath(import.meta.url));
const admin = readFileSync(join(here, '../public/js/admin.js'), 'utf8');
assert.match(admin, /Mark accepted/);
assert.match(admin, /Mark paid/);
assert.match(admin, /quote-recurring/);
assert.match(admin, /data-pay-method/);
assert.match(admin, /update_schedule/);
assert.match(admin, /Cash/);
assert.match(admin, /Zelle/);
assert.match(admin, /PayPal/);
assert.match(admin, /leadQuoteBadge/);

const quotesApi = readFileSync(join(here, '../functions/api/admin/quotes.js'), 'utf8');
assert.match(quotesApi, /action === 'accept'/);
assert.match(quotesApi, /action === 'pay'/);
assert.match(quotesApi, /action === 'unpay'/);
assert.match(quotesApi, /action === 'update_schedule'/);
assert.match(quotesApi, /payment_method/);

const migration = readFileSync(join(here, '../migrations/0005_quote_payment.sql'), 'utf8');
assert.match(migration, /paid_at/);
assert.match(migration, /payment_method/);
assert.match(migration, /payment_note/);

const proposal = readFileSync(join(here, '../public/js/proposal.js'), 'utf8');
assert.match(proposal, /proposal__recur/);
assert.match(proposal, /status === 'paid'/);

const leadsApi = readFileSync(join(here, '../functions/api/admin/leads.js'), 'utf8');
assert.match(leadsApi, /latest_payment_method/);

console.log('quote-payment.test.mjs: ok');
