/* A quote was declined on the customer's behalf by opening their own link,
   and the note typed in — "found it for $70 elsewhere" — was never meant
   for them. These hold the note on Kristina's side of the wall. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildQuoteDeclinedEmail } from '../functions/_lib/email.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const route = read('functions/api/proposal/[token].js');
const SECRET = 'they found it for $70 elsewhere';

test('the decline note goes to her and no further', async (t) => {
  await t.test('the alert is addressed to her, not the customer', () => {
    const block = route.slice(route.indexOf("if (action === 'decline')"), route.indexOf("// Only allow add-ons"));
    assert.match(block, /alertTarget\(/, 'the recipient is her notify address');
    assert.ok(!/customer_email|lead_email/.test(block.split('sendEmail')[1] || ''),
      'nothing in the send names the customer');
  });

  await t.test('and it carries no reply-to pointing at the customer', () => {
    /* With the customer as reply-to, one tap of Reply returns the whole
       quoted message — note and all — to them. */
    const block = route.slice(route.indexOf("if (action === 'decline')"), route.indexOf("// Only allow add-ons"));
    assert.ok(!/replyTo/.test(block), 'the decline alert must not be repliable to the customer');
  });

  await t.test('the accepted alert keeps its reply-to — it holds nothing private', () => {
    const block = route.slice(route.indexOf("const to = alertTarget(await loadSettings(env.DB), env, 'accept')"));
    assert.match(block, /replyTo: row\.lead_email/);
  });

  await t.test('the note appears only in an email built for her', () => {
    const mail = buildQuoteDeclinedEmail({}, {
      quote: { customer_name: 'Maria', total: 25000 }, lead: {}, reason: SECRET
    });
    assert.ok(mail.html.includes('$70'), 'she does need to read it');
    assert.match(mail.html, /declined your quote/, 'and it is plainly written to her');
    assert.match(mail.html, /Open lead in portal|\/admin\//);
  });
});

test('she can record a no without opening the customer page', async (t) => {
  const api = read('functions/api/admin/quotes.js');
  const ui = read('public/js/admin.js');

  await t.test('the portal has the action at all', () => {
    assert.match(api, /action === 'decline'/,
      'with nowhere else to mark a no, the customer link was the only way');
    assert.match(ui, /data-quote-action="decline"/);
  });

  await t.test('recording one emails nobody', () => {
    const block = api.slice(api.indexOf("if (action === 'decline')"), api.indexOf("/* The two things that happen after a yes"));
    assert.ok(!/sendEmail|buildQuote/.test(block), 'her own note needs no notification');
  });

  await t.test('the note is stored as hers, not as theirs', () => {
    const block = api.slice(api.indexOf("if (action === 'decline')"), api.indexOf("/* The two things that happen after a yes"));
    assert.match(block, /by: 'staff'/);
    assert.match(block, /note\b/);
    assert.ok(!/reason/.test(block), 'reason is what the customer typed; this is not that');
  });

  await t.test('the prompt says who will see it', () => {
    const block = ui.slice(ui.indexOf("if (action === 'decline')"), ui.indexOf("if (action === 'reopen')"));
    assert.match(block, /internal note/i);
    assert.match(block, /never sees it|not emailed/i);
  });

  await t.test('the timeline keeps the two apart', () => {
    assert.match(ui, /they said/, 'what the customer wrote');
    assert.match(ui, /your note/, 'what she wrote');
  });
});

test('nothing the customer can load carries the note', () => {
  /* The decline note is not a column on the quote — it lives in the detail
     of a quote_events row. So the invariant is simply that the page the
     customer holds never reads that table.

     (An earlier version of this test grepped the response for the word
     "note" and failed on two honest ones: the add-on catalogue's public
     description, and Kristina's own note written to be read on the quote.) */
  assert.ok(!/quote_events/.test(route),
    'the customer-facing route reads the table the decline note lives in');

  const page = read('public/js/proposal.js');
  const declined = page.slice(page.indexOf("status === 'declined'"), page.indexOf("status === 'expired'"));
  assert.ok(!/reason|detail|note/.test(declined),
    'the declined screen renders something back at them');
});
