/* The quote Kristina actually writes: one price for the clean, the add-ons
   they asked for thrown in, and a recurring visit offered for afterwards.
   This is the payload the rebuilt builder posts, carried through the
   normalizer, the customer's email and the PDF — the three places the same
   quote has previously disagreed with itself. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLineItems } from '../functions/_lib/quotes.js';
import { buildCustomerQuoteEmail } from '../functions/_lib/email.js';
import { buildQuotePdf } from '../functions/_lib/quote-pdf.js';

/* Verbatim from the builder: requested add-ons arrive at '0', the optional
   offer is ticked, quantities are strings because they come from inputs. */
const POSTED = [
  { label: 'Deep clean', description: '', qty: '1', unit_dollars: '250', cadence: 'onetime', optional: false },
  { label: 'Inside the fridge', description: '', qty: '1', unit_dollars: '0', cadence: 'onetime', optional: false },
  { label: 'Inside the oven', description: '', qty: '1', unit_dollars: '0', cadence: 'onetime', optional: false },
  { label: 'Every two weeks after', description: '', qty: '1', unit_dollars: '110', cadence: 'biweekly', optional: true }
];

const n = normalizeLineItems(POSTED);
const quote = { ...n, line_items: n.items, id: 'q9', status: 'sent',
  customer_name: 'Maria Delgado', total: n.total, subtotal: n.subtotal, tax: 0,
  expires_at: '2026-10-22T12:00:00Z' };
const lead = { name: 'Maria Delgado', service_label: 'Deep clean', city: 'Lake Worth' };
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('a $250 deep clean with the add-ons included', async (t) => {
  await t.test('the total is the clean, not the clean plus the offer', () => {
    assert.equal(n.total, 25000, 'the optional recurring visit must stay out of it');
    assert.equal(n.subtotal, 25000);
  });

  await t.test('the add-ons they asked for carry no charge', () => {
    const free = n.items.filter((i) => i.total === 0).map((i) => i.label);
    assert.deepEqual(free, ['Inside the fridge', 'Inside the oven']);
  });

  await t.test('the email calls them Included, never $0.00', () => {
    const mail = buildCustomerQuoteEmail({}, { quote, lead, proposalUrl: 'https://x.test/proposal?t=abc' });
    const txt = strip(mail.customerHtml);
    assert.equal((txt.match(/Included/g) || []).length, 2);
    assert.ok(!/\$0\.00/.test(txt), 'a line she is throwing in should not read as nothing');
  });

  await t.test('the PDF agrees with the email', () => {
    const pdf = new TextDecoder('latin1').decode(buildQuotePdf({
      quote, lead, business: { name: 'Oasis Coastal Cleaning', phone: '(561) 201-7123', email: 'i@e.com' },
      settings: {}, proposalUrl: 'https://x.test/proposal?t=abc'
    }));
    assert.equal((pdf.match(/\(Included\)/g) || []).length, 2);
    assert.ok(!/\(\$0\.00\)/.test(pdf));
  });

  await t.test('the recurring offer is priced but outside the total', () => {
    const later = n.items.find((i) => i.optional);
    assert.equal(later.total, 11000);
    assert.equal(later.cadence, 'biweekly');
    assert.equal(n.items.filter((i) => !i.optional).reduce((s, i) => s + i.total, 0), n.total);
  });
});
