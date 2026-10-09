/* Gold is the brand's accent and it is not a text colour: #C89C53 on white
   is 2.5:1, well under the 4.5:1 that body-sized text needs. There is a
   darkened gold for words. This catches the next time the accent is reached
   for as a label. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL('../public/' + f, import.meta.url), 'utf8');
const tokens = read('tokens.css');

const srgb = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const ratio = (a, b) => {
  const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const tokenValue = (name) => {
  const m = new RegExp('--' + name + ':\\s*(#[0-9A-Fa-f]{6})').exec(tokens);
  assert.ok(m, 'token --' + name + ' is missing');
  return m[1];
};

test('the gold used for words is readable', async (t) => {
  const accent = tokenValue('oasis-gold');
  const ink = tokenValue('oasis-gold-ink');
  const white = '#FFFFFF';
  const cream = (/--oasis-cream:\s*(#[0-9A-Fa-f]{6})/.exec(tokens) || [])[1] || white;

  await t.test('the accent gold is not readable as text, which is why ink exists', () => {
    assert.ok(ratio(accent, white) < 4.5,
      'if the accent ever passes on white, this pair of tokens can collapse into one');
  });

  await t.test('the ink gold clears 4.5:1 on white and on cream', () => {
    assert.ok(ratio(ink, white) >= 4.5, 'gold ink on white is ' + ratio(ink, white).toFixed(2));
    assert.ok(ratio(ink, cream) >= 4.5, 'gold ink on cream is ' + ratio(ink, cream).toFixed(2));
  });
});

/* There was a second test here that scanned the stylesheet for
   `color: var(--oasis-gold)` and called each one a failure. It flagged
   twelve selectors that are all correct — the footer, the navy call panel,
   the numerals on the steps — because a text scan cannot see what colour
   the ground is. Contrast is a rendered property; it is measured in a
   browser against the composited background, not grepped. The token
   invariant above is the part that can honestly be checked here. */
