/* The Clients screen. Cards sit in a grid row and stretch to the tallest so
   their buttons line up — which is right until one of them opens into a
   profile and becomes three times the height of its neighbours. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../public/js/admin.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/css/admin.css', import.meta.url), 'utf8');

test('an open profile does not stretch the cards beside it', async (t) => {
  await t.test('the row stops stretching while one is open', () => {
    /* Without this the closed neighbours grew to the open card's height and
       the auto margin on their buttons left 300-odd points of blank space
       above them. */
    assert.match(css, /\.ccards--open[^{]*\{[^}]*align-items: start/,
      'there is no rule that unsticks the row');
  });

  await t.test('and the class is set, not left to :has() alone', () => {
    assert.match(js, /ccards--open/);
    assert.match(js, /state\.openClient \? ' ccards--open'/);
  });

  await t.test('the stretch is still there when nothing is open', () => {
    assert.match(css, /\.ccards \{ align-items: stretch; \}/,
      'closed cards in a row should still end level');
  });
});

test('the card actions fit the card', () => {
  /* Three pills never fit ~290px, so the third always wrapped to a line of
     its own. */
  const card = js.slice(js.indexOf('function clientCard'), js.indexOf('function clientsHtml'));
  assert.match(card, /Their requests/, 'the long label was the one that broke the row');
  assert.ok(!/See their requests/.test(card));
  assert.match(card, /class="linkish ccard__more"/,
    'the least-used action should not be a third pill');
});
