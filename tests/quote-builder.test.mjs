/* The quote builder. These pin the three things Kristina found wrong with
   it: the card read as four controls of equal weight, "include every add-on"
   pasted the whole catalogue as prose, and the saved list was forty controls
   to find one service. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../public/js/admin.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/css/admin.css', import.meta.url), 'utf8');
const slice = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));

test('the add-ons they asked for', async (t) => {
  await t.test('arrive as their own lines at zero, not as prose', () => {
    const seed = slice('function catalogQuoteLinesFromLead', 'var CADENCES');
    assert.match(seed, /unit_dollars: '0'/,
      'a requested add-on should read "Included", not sit with a blank amount');
    assert.ok(!/everyAddonSentence/.test(src),
      'the catalogue-as-a-sentence filler is gone, not merely unused');
  });

  await t.test('the top-up button matches through the catalogue', () => {
    /* "Interior windows" must not land beside the "Interior window" the
       quote already carries. */
    const handler = slice("hit.matches('[data-add-asked]')", "if (hit.matches('[data-save-quote]')");
    assert.match(handler, /findCatalogByLabel/);
    assert.match(handler, /have\[key\]/, 'and it skips anything already on the quote');
  });

  await t.test('it only appears when they actually asked for something', () => {
    const editor = slice('function quoteEditorHtml', 'function newQuotePanelHtml');
    assert.match(editor, /asked\.length\s*\n?\s*\?/);
  });
});

test('the saved-services picker', async (t) => {
  const picker = slice('function quoteCatalogHtml', 'function quoteEditorHtml');

  await t.test('is one box she types into, not five tabs of rows', () => {
    assert.match(picker, /role="combobox"/);
    assert.ok(!/data-catalog-tab/.test(src), 'the tab strip is gone');
    assert.ok(!/data-add-catalog/.test(src), 'and the per-row Add buttons with it');
  });

  await t.test('narrows as she types, best match first', () => {
    const m = slice('function svcMatches', 'function svcRender');
    assert.match(m, /indexOf\(needle\) === 0/, 'a prefix match outranks a middle match');
    assert.match(m, /starts\.concat\(has\)/);
  });

  await t.test('anything not on the list can still be typed', () => {
    assert.match(picker, /as typed/);
    const commit = slice('function svcCommit', 'function newQuotePanelHtml');
    assert.match(commit, /svcAdd\(pick, input\.value/);
  });

  await t.test('the line it adds is priced on the line, not in the picker', () => {
    const add = slice('function svcAdd', 'function svcCommit');
    assert.match(add, /unit_dollars: ''/, 'every job is priced for the job');
    assert.match(add, /priceEl\.focus\(\)/, 'and the cursor lands on the one thing left to decide');
  });

  await t.test('it answers to the keyboard', () => {
    const keys = src.slice(src.indexOf("e.target.matches('[data-svcpick-input]')"));
    for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape']) {
      assert.ok(keys.includes(key), key + ' does nothing in the combobox');
    }
  });
});

test('one line of a quote is one card', async (t) => {
  await t.test('no bordered panels inside the card', () => {
    assert.ok(!/qline__opt/.test(css), 'the optional tick had a box of its own');
    assert.ok(!/qline__meta/.test(css), 'and sat in a second bordered column');
    assert.ok(!/qline__fill/.test(css), 'beside a sand button heavier than the field it filled');
  });

  await t.test('the description gets the full width', () => {
    assert.ok(!/\.qline \{[^}]*grid-template-columns: minmax\(0, 1\.55fr\)/s.test(css),
      'splitting the card put the only customer-facing field in a 400px box');
  });

  await t.test('qty and amount share a row on a phone', () => {
    assert.match(css, /grid-template-areas: 'name name' 'qty amount'/);
  });
});
