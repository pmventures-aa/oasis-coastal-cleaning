/* The quote email is the one the customer opens first, and it has to agree
   with the PDF attached to it and the page it links to. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomerQuoteEmail } from '../functions/_lib/email.js';
import { normalizeLineItems } from '../functions/_lib/quotes.js';

const env = { QUOTE_FROM_EMAIL: 'Oasis <q@send.example.com>', QUOTE_TO_EMAIL: 'info@example.com' };
const lead = { name: 'Maria Alvarez', email: 'maria@example.com', service_label: 'Home Cleaning', city: 'Lake Worth' };

function build(lines) {
  const n = normalizeLineItems(lines);
  return buildCustomerQuoteEmail(env, {
    quote: { ...n, line_items: n.items, status: 'sent', customer_name: 'Maria Alvarez',
      total: n.total, subtotal: n.subtotal, tax: 0, expires_at: '2026-10-22T12:00:00Z' },
    lead, proposalUrl: 'https://www.oasiscoastalcleaning.com/proposal?t=abc'
  });
}
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const DEEP = { label: 'Deep clean', qty: 1, unit_dollars: '250', cadence: 'onetime' };
const FREE = { label: 'Inside the fridge', qty: 1, unit_dollars: '0', cadence: 'onetime' };
const LATER = { label: 'Recurring clean', qty: 1, unit_dollars: '150', cadence: 'biweekly', optional: true };

test('the customer quote email', async (t) => {
  await t.test('an optional line is not in the table of what they are paying', () => {
    const m = build([DEEP, LATER]);
    const body = strip(m.customerHtml);
    const table = body.slice(body.indexOf('Item'), body.indexOf('Subtotal'));
    assert.ok(!table.includes('Recurring clean'),
      'it used to sit here with its price, under a total that excluded it');
    assert.ok(body.includes('Afterwards, if you would like'), 'it has its own block');
    assert.ok(body.includes('Not part of the total above'));
  });

  await t.test('the figures shown add up to the total shown', () => {
    const m = build([DEEP, FREE, LATER]);
    const body = strip(m.customerHtml);
    const table = body.slice(body.indexOf('Item'), body.indexOf('Subtotal'));
    const amounts = [...table.matchAll(/\$([\d,]+)\.00/g)].map((x) => Number(x[1].replace(/,/g, '')));
    assert.deepEqual(amounts, [250], 'only the charged line carries a figure');
    assert.match(m.customerSubject, /\$250\.00/);
  });

  await t.test('a line priced at nothing reads as Included', () => {
    const body = strip(build([DEEP, FREE]).customerHtml);
    assert.ok(body.includes('Included'));
    assert.ok(!body.includes('$0.00'), '"$0.00" in an email reads as a mistake');
  });

  await t.test('a plain quote is unchanged by any of this', () => {
    const body = strip(build([DEEP]).customerHtml);
    assert.ok(body.includes('Deep clean'));
    assert.ok(!body.includes('Afterwards, if you would like'));
  });

  await t.test('the customer is not told a machine sent it', () => {
    const m = build([DEEP]);
    assert.ok(!m.customerHtml.includes('automated notification'),
      '"an automated notification from your website" is for Kristina, not her customer');
    assert.ok(m.adminHtml.includes('automated notification'), 'her own copy keeps it');
  });

  await t.test('the header image is one an inbox will actually load', () => {
    const m = build([DEEP]);
    assert.ok(m.customerHtml.includes('/print/logo-quote.jpg'),
      'the 1MB PNG went out in the header of every email');
    assert.ok(!m.customerHtml.includes('logo-primary-800.png'));
  });

  await t.test('there is a plain-text part, and it carries the link', () => {
    const m = build([DEEP]);
    assert.ok(m.customerText.length > 50);
    assert.ok(m.customerText.includes('proposal?t=abc'));
  });
});
