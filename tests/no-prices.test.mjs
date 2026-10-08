/* "Remove all the amounts as well, KR is going to custom quote everybody."
   Nothing public may name, imply or promise a figure. Copy drifts back a
   line at a time — a meta description Google prints, a CTA that still says
   "see your range" — so the pages are checked rather than remembered. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../public/', import.meta.url);

/* The portal and the customer's own quote page are where money belongs.
   Everything else here is the public marketing site. */
const JS = ['js/site.js', 'js/data.js', 'js/quote.js', 'js/format.js'];

/* Phrasings that promise a figure the site no longer shows. */
const BANNED = [
  [/\$\s?\d/, 'a dollar amount'],
  [/\bstart(s|ing) at\b/i, '"starting at"'],
  [/\bper hour\b|\b\/\s?hr\b/i, 'an hourly rate'],
  [/\b(see|watch|get)\s+(your|the|a)\s+(estimate\s+)?range\b/i, 'a promise of a range'],
  [/\brange (appears|moves|you saw)\b/i, 'a promise of a range'],
  [/\brange\s+(as|while)\s+you\s+answer\b/i, 'a promise of a range']
];

/* Saying there is no price list is the point, not a violation. */
const ALLOWED = [
  /no price list/i,
  /price list to point you at/i,
  /"starting at" figures, they would go back on/
];

const offending = (text) => {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    if (ALLOWED.some((ok) => ok.test(line))) return;
    BANNED.forEach(([re, what]) => {
      if (re.test(line)) hits.push(`line ${i + 1}: ${what} — ${line.trim().slice(0, 110)}`);
    });
  });
  return hits;
};

test('the public site names no prices', async (t) => {
  const names = (await readdir(root)).filter((f) => f.endsWith('.html'));
  assert.ok(names.length >= 10, 'found the pages');

  for (const name of names) {
    await t.test(name, async () => {
      const hits = offending(await readFile(new URL(name, root), 'utf8'));
      assert.deepEqual(hits, [], `${name} still promises a figure:\n  ${hits.join('\n  ')}`);
    });
  }

  for (const rel of JS) {
    await t.test(rel, async () => {
      const hits = offending(await readFile(new URL(rel, root), 'utf8'));
      assert.deepEqual(hits, [], `${rel} still promises a figure:\n  ${hits.join('\n  ')}`);
    });
  }
});

test('a link preview says the same thing as the page', async (t) => {
  /* The pricing page shipped for weeks titled "Cleaning Prices in Palm Beach
     & Broward" in every share card, under a page that says there are none. */
  const names = (await readdir(root)).filter((f) => f.endsWith('.html'));
  for (const name of names) {
    if (name === 'proposal.html') continue;      // a private quote has no share card
    await t.test(name, async () => {
      const src = await readFile(new URL(name, root), 'utf8');
      const title = (src.match(/<title>([^<]*)<\/title>/) || [])[1];
      const og = (src.match(/property="og:title" content="([^"]*)"/) || [])[1];
      assert.ok(title, 'has a title');
      assert.equal(og, title, 'the share card title drifted from the page title');
    });
  }
});
