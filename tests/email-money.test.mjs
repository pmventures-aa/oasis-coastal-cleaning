/**
 * Quote totals are stored in cents. Email builders must format via formatMoney
 * ($255.00), not the whole-dollar helper ($25,500).
 */
import assert from 'node:assert/strict';
import { formatMoney } from '../functions/_lib/quotes.js';
import { buildCustomerQuoteEmail, buildQuoteAcceptedEmail, buildQuoteDeclinedEmail } from '../functions/_lib/email.js';
import { availableAddons, addonAlreadyQuoted } from '../functions/_lib/addons.js';

const env = { SITE_URL: 'https://www.oasiscoastalcleaning.com' };

const quote = {
  customer_name: 'Kristina Roberts',
  customer_email: 'customer@example.com',
  total: 25500,
  subtotal: 25500,
  tax: 0,
  notes: '',
  terms: '',
  expires_at: '2026-09-10T00:00:00.000Z',
  line_items: [
    { label: 'Home Cleaning', qty: 1, unit_price: 20000, total: 20000 },
    { label: 'Laundry', qty: 5, unit_price: 1100, total: 5500 }
  ]
};

const lead = {
  lead_name: 'Kristina Roberts',
  lead_email: 'customer@example.com',
  service_label: 'Home Cleaning',
  city: 'Jupiter'
};

assert.equal(formatMoney(25500), '$255.00');
assert.equal(formatMoney(255), '$2.55');

const mailed = buildCustomerQuoteEmail(env, {
  quote,
  lead,
  proposalUrl: 'https://www.oasiscoastalcleaning.com/proposal?t=abc'
});

assert.match(mailed.customerSubject, /\$255\.00/);
assert.doesNotMatch(mailed.customerSubject, /\$25,500/);
assert.match(mailed.customerHtml, /\$255\.00/);
assert.match(mailed.customerText, /Total: \$255\.00/);
assert.match(mailed.adminSubject, /\$255\.00/);

const accepted = buildQuoteAcceptedEmail(env, {
  quote,
  lead,
  requestedAddons: [{ id: 'oven', label: 'Oven', note: 'Inside, racks and door glass' }]
});
assert.match(accepted.subject, /\$255\.00/);
assert.match(accepted.html, /Requested add-ons/);
assert.match(accepted.html, /Oven/);

const declined = buildQuoteDeclinedEmail(env, {
  quote,
  lead,
  reason: 'Looking for a later start date'
});
assert.match(declined.subject, /\$255\.00/);
assert.match(declined.html, /Looking for a later start date/);
assert.match(declined.text, /Looking for a later start date/);

assert.ok(addonAlreadyQuoted({ id: 'laundry', label: 'Laundry' }, quote.line_items));
const avail = availableAddons(quote.line_items);
assert.ok(!avail.some((a) => a.id === 'laundry'));
assert.ok(avail.some((a) => a.id === 'oven'));

console.log('email-money.test.mjs: ok');
