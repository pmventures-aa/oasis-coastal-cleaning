/* The customer quote page is built as one big string, so a value read before
   its `var` runs fails silently: the name is simply absent and the sentence
   still reads like a sentence. That is how "Thank you, ." reached the page
   every customer sees after saying yes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../public/js/proposal.js', import.meta.url), 'utf8');

test('the quote page greeting', async (t) => {
  await t.test('the name is declared before the accepted block reads it', () => {
    const declared = src.indexOf("var first = (q.customer_name");
    const used = src.indexOf("'<p>Thank you, ' + esc(first)");
    assert.ok(declared !== -1, 'the greeting name is still declared');
    assert.ok(used !== -1, 'the thank-you line is still there');
    assert.ok(declared < used,
      'var hoists the name but not the value — declaring it after this line ' +
      'renders "Thank you, ." to every customer who accepts');
  });

  await t.test('it falls back to a word rather than nothing', () => {
    assert.match(src, /\(q\.customer_name \|\| ''\)\.split\(' '\)\[0\] \|\| 'there'/);
  });
});

test('every closing state offers a way to reach her', async (t) => {
  // Each one tells the customer to get in touch; each one has to mean it.
  for (const state of ['accepted', 'declined', 'expired']) {
    await t.test(state + ' calls reachHer()', () => {
      const i = src.indexOf("status === '" + state + "'");
      assert.ok(i !== -1, state + ' branch exists');
      const block = src.slice(i, i + 700);
      assert.ok(block.includes('reachHer('),
        state + ' tells them to contact her, so it must give them a way');
    });
  }

  await t.test('reachHer builds real tel: and sms: links', () => {
    assert.match(src, /href="sms:\+1'/);
    assert.match(src, /href="tel:\+1'/);
  });
});
