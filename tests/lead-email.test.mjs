/* The email Kristina gets on her phone when a request comes in. It is the
   only thing she reads before calling back, so every field the form
   collected has to be in it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuoteEmail } from '../functions/_lib/email.js';

const FULL = {
  name: 'Maria Delgado', phone: '(561) 555-0142', email: 'maria@example.com',
  contact_pref: 'Text', best_time: 'Mornings',
  service: 'deep', service_label: 'Deep clean', property_type: 'Single-family home',
  size_label: '2,000–2,500 sq ft', bedrooms: '4', bathrooms: '3',
  frequency: 'One-time', first_visit: 1,
  add_ons: JSON.stringify(['Inside the fridge', 'Inside the oven']),
  conditions: JSON.stringify(['Pets in the home']),
  city: 'Lake Worth', zip: '33460', address: '12 Ocean Ave',
  start_when: 'Within two weeks',
  preferred_days: JSON.stringify(['Tuesday', 'Thursday']),
  access: 'I will be home',
  source_page: 'https://www.oasiscoastalcleaning.com/quote?from=%2Fairbnb-cleaning'
};
const cameFrom = (source_page) => {
  const m = buildQuoteEmail({}, { name: 'T', source_page }).text.match(/Came from:\s*(.*)/);
  return m ? m[1].trim() : null;
};

test('the new-request email', async (t) => {
  await t.test('carries every answer the form collected', () => {
    const { text } = buildQuoteEmail({}, FULL);
    for (const v of ['Maria Delgado', '(561) 555-0142', 'maria@example.com', 'Text', 'Mornings',
      'Deep clean', 'Single-family home', '2,000–2,500 sq ft', '4 / 3', 'One-time',
      'Inside the fridge', 'Pets in the home', 'Lake Worth', '33460', '12 Ocean Ave',
      'Within two weeks', 'Tuesday, Thursday', 'I will be home']) {
      assert.ok(text.includes(v), `"${v}" never made it into her email`);
    }
  });

  await t.test('names the page the request started from', () => {
    assert.equal(cameFrom(FULL.source_page), 'the vacation rentals page');
    assert.equal(cameFrom('https://www.oasiscoastalcleaning.com/quote'), 'the quote form');
    assert.equal(cameFrom('https://x.test/quote?service=turnover'), 'the vacation rentals page');
    assert.equal(cameFrom('https://x.test/quote?service=office'), 'the offices page');
    assert.equal(cameFrom('https://x.test/quote.html?from=%2Findex.html'), 'the home page');
    assert.equal(cameFrom('admin-phone'), 'Taken on the phone');
    assert.equal(cameFrom('admin-new-quote'), 'Started from a new quote');
  });

  await t.test('says nothing about where it came from rather than guessing', () => {
    assert.equal(cameFrom(''), null, 'an empty source should drop the row, not print "/"');
    assert.equal(cameFrom('/unknown-page'), '/unknown-page', 'an unmapped path prints as itself');
  });

  await t.test('never shows an estimate — there are no prices on the site', () => {
    const { text, html } = buildQuoteEmail({}, { ...FULL, estimate_low: 200, estimate_high: 400 });
    assert.ok(!/Estimate/i.test(text), 'the old pricing-wizard range is gone');
    assert.ok(!html.includes('$200'));
  });

  await t.test('leaves out rows the customer did not answer', () => {
    const { text } = buildQuoteEmail({}, { name: 'Jo', phone: '5615550000', source_page: '/quote' });
    assert.ok(text.includes('Jo'));
    assert.ok(!text.includes('Bedrooms'), 'blank fields should not print as empty labels');
    assert.ok(!text.includes('Access on the day'));
  });

  await t.test('links her straight into the portal', () => {
    const { text, html } = buildQuoteEmail({}, FULL);
    assert.ok(text.includes('/admin/'));
    assert.ok(html.includes('/admin/'));
  });
});
