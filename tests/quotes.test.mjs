import { strict as assert } from 'node:assert';
import {
  normalizeLineItems, quoteTotals, formatMoney, formatTotalLabel,
  publicQuote, seedItemsFromLead, isExpired, defaultValidUntil
} from '../functions/_lib/quotes.js';
import { buildCustomerQuoteEmail, buildQuoteAcceptedEmail } from '../functions/_lib/email.js';
import { siteBase } from '../functions/_lib/util.js';

const items = normalizeLineItems([
  { description: 'Weekly office clean', qty: 1, unit_price: 185 },
  { description: '  ', qty: 2, unit_price: 40 },
  { label: 'High-touch sanitizing', qty: '2', price: '25.5' },
  { description: 'Discount', qty: 1, unit_price: -20 }
]);

assert.equal(items.length, 3);
assert.equal(items[1].description, 'High-touch sanitizing');
assert.equal(items[1].qty, 2);
assert.equal(items[1].unit_price, 25.5);

const { lines, total } = quoteTotals(items);
assert.equal(lines[0].amount, 185);
assert.equal(lines[1].amount, 51);
assert.equal(total, 216);
assert.equal(formatMoney(216), '$216');
assert.equal(formatMoney(25.5), '$25.50');
assert.equal(formatTotalLabel(185, 'per visit'), '$185 per visit');

const pub = publicQuote({
  status: 'sent',
  customer_name: 'Alex Rivera',
  customer_email: 'alex@example.com',
  customer_phone: '5615550100',
  service_label: 'Corporate & Office Cleaning',
  frequency: 'Weekly',
  intro: 'Here is the number we talked about.',
  line_items: JSON.stringify(items),
  notes: 'First visit is a deeper clean.',
  price_note: 'per visit',
  valid_until: '2099-01-15',
  token: 'secret-token',
  accepted_ip: '1.2.3.4'
});

assert.equal(pub.total, 216);
assert.equal(pub.total_label, '$216 per visit');
assert.equal(pub.line_items.length, 3);
assert.equal(pub.expired, false);
assert.equal(pub.token, undefined);
assert.equal(pub.customer_email, undefined);
assert.equal(pub.accepted_ip, undefined);

assert.equal(isExpired('2000-01-01', new Date('2026-08-27')), true);
assert.equal(isExpired('2099-01-01', new Date('2026-08-27')), false);
assert.equal(isExpired('', new Date()), false);

const until = defaultValidUntil(14);
assert.match(until, /^\d{4}-\d{2}-\d{2}$/);

const seeded = seedItemsFromLead({
  service_label: 'Airbnb & Short-Term Rentals',
  size_label: '2 bedrooms',
  frequency: 'Per turnover',
  add_ons: JSON.stringify(['Linen laundry', 'Photo report'])
});
assert.equal(seeded[0].description, 'Airbnb & Short-Term Rentals — 2 bedrooms — Per turnover');
assert.equal(seeded.length, 3);

const env = {};
assert.equal(siteBase(env), 'https://www.oasiscoastalcleaning.com');
assert.equal(siteBase({ SITE_URL: 'https://example.com/' }), 'https://example.com');

const mail = buildCustomerQuoteEmail(env, {
  customer_name: 'Alex Rivera',
  service_label: 'Corporate & Office Cleaning',
  frequency: 'Weekly',
  intro: 'Thanks for the walkthrough.',
  line_items: JSON.stringify(items),
  notes: 'Evenings after 6.',
  price_note: 'per visit',
  valid_until: '2099-01-15'
}, 'https://www.oasiscoastalcleaning.com/q/abc123');

assert.match(mail.subject, /Oasis Coastal Cleaning/);
assert.match(mail.html, /View and accept this quote/);
assert.match(mail.html, /https:\/\/www\.oasiscoastalcleaning\.com\/q\/abc123/);
assert.match(mail.html, /Thanks for the walkthrough/);
assert.doesNotMatch(mail.html, /automated notification from your website/);
assert.match(mail.text, /\$216 per visit/);

const accepted = buildQuoteAcceptedEmail(env, {
  customer_name: 'Alex Rivera',
  accepted_name: 'Alex Rivera',
  customer_email: 'alex@example.com',
  customer_phone: '(561) 555-0100',
  service_label: 'Corporate & Office Cleaning',
  line_items: JSON.stringify(items),
  price_note: 'per visit'
});
assert.match(accepted.subject, /Quote accepted/);
assert.match(accepted.html, /accepted the quote/);
assert.match(accepted.text, /alex@example.com/);

console.log('ok — quote math, public payload, and branded emails');
