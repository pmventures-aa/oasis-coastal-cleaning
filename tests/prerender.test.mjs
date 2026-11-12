/* The public pages ship with a prerendered copy of everything the scripts
   build, so the first paint is the finished page. That copy is only true until
   someone edits js/data.js, a renderer, or the HTML, and the thing that keeps
   it true is remembering to run ./bump-version.sh. These tests are what notices
   when that was forgotten -- without a browser, so they run with the rest. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const ROOT = new URL('../public/', import.meta.url).pathname;
const pages = readdirSync(ROOT).filter(f => f.endsWith('.html'));
const read = f => readFileSync(ROOT + f, 'utf8');

/* The one slot left to the browser, and why, is documented in
   tools/prerender.mjs. Its space is held by .hdr-hold instead. */
const BROWSER_ONLY = new Set(['header']);

test('every prerenderable slot in every page actually carries its markup', () => {
  const empty = [];
  for (const f of pages) {
    const src = read(f);
    // Matching the closing tag is not possible with a regex when the
    // prerendered markup nests the same tag, so this checks the invariant
    // directly: the marker sits immediately after the opening tag.
    const re = /<\w+\b[^>]*\b(?:data-render|data-prerender)="(\w+)"[^>]*>/g;
    for (const m of src.matchAll(re)) {
      const name = m[1];
      if (BROWSER_ONLY.has(name)) continue;
      if (src.slice(m.index + m[0].length, m.index + m[0].length + 10) !== '<!--pre-->') {
        empty.push(`${f}: ${name}`);
      }
    }
  }
  assert.deepEqual(empty, [],
    'these slots are not prerendered, so they are a hole in the first paint — run ./bump-version.sh');
});

test('the header slot still reserves its height', () => {
  for (const f of pages) {
    const src = read(f);
    if (!src.includes('data-render="header"')) continue;
    assert.match(src, /<div data-render="header"><div class="hdr-hold"/,
      `${f}: the header is drawn by JS, so the page must hold its space or everything below it drops`);
  }
  assert.match(readFileSync(ROOT + 'css/site.css', 'utf8'), /\.hdr-hold\s*\{[^}]*height:/,
    '.hdr-hold needs a height or it reserves nothing');
});

test('nothing prerendered is left hidden by a reveal class', () => {
  /* setupMotion sets .reveal (opacity: 0) and fades blocks in. A snapshot taken
     after it ran would serve a reader with JS off an invisible page, which is
     why tools/prerender.mjs snapshots with reduced motion. */
  for (const f of pages) {
    for (const m of read(f).matchAll(/<!--pre-->([\s\S]*?)<!--\/pre-->/g)) {
      assert.doesNotMatch(m[1], /class="[^"]*\breveal\b/,
        `${f}: prerendered markup carries a reveal class, so it ships at opacity 0`);
      assert.doesNotMatch(m[1], /style="[^"]*transition-delay/,
        `${f}: prerendered markup carries a transition delay from setupMotion`);
    }
  }
});

test('the "what is included" panels ship closed', () => {
  /* Open on a phone would mean JS collapsing eight panels after the first
     paint. CSS opens them where there is room — see .incl in css/site.css. */
  for (const f of pages) {
    assert.doesNotMatch(read(f), /<details class="incl" open/,
      `${f}: a prerendered open panel collapses after paint on a narrow screen`);
  }
  assert.match(readFileSync(ROOT + 'css/site.css', 'utf8'),
    /@supports selector\(::details-content\)[\s\S]*?\.incl::details-content/,
    'the wide-screen open state must come from CSS, not from JS after paint');
});

test('every font the stylesheet asks for is in the repository', () => {
  const css = readFileSync(ROOT + 'tokens.css', 'utf8');
  const urls = [...css.matchAll(/url\('(\/fonts\/[^?']+)(\?v=[^']*)?'\)/g)];
  assert.ok(urls.length >= 6, 'expected the self-hosted faces to be declared in tokens.css');
  for (const [, path] of urls) {
    assert.ok(existsSync(ROOT + path.slice(1)), `tokens.css asks for ${path}, which is not here`);
  }
  assert.doesNotMatch(css, /fonts\.googleapis\.com|fonts\.gstatic\.com/,
    'the fonts are served from this domain; a Google URL would reintroduce the third-party round trips');
});

test('each font licence travels with its font', () => {
  /* The OFL permits this redistribution on condition the licence comes too. */
  for (const n of ['OFL-Montserrat.txt', 'OFL-Cinzel.txt', 'OFL-GreatVibes.txt']) {
    const txt = readFileSync(ROOT + 'fonts/' + n, 'utf8');
    assert.match(txt, /SIL Open Font License/, `${n} is not the licence text`);
    assert.match(txt, /Copyright/, `${n} is missing its copyright line`);
  }
});

test('a preloaded font URL is the same URL the stylesheet asks for', () => {
  /* If the two differ by so much as a version token the browser downloads
     every preloaded font twice and the preload has made things worse. */
  const css = readFileSync(ROOT + 'tokens.css', 'utf8');
  const declared = new Set([...css.matchAll(/url\('(\/fonts\/[^']+)'\)/g)].map(m => m[1]));
  let checked = 0;
  for (const f of [...pages, 'admin/index.html']) {
    for (const m of read(f).matchAll(/<link rel="preload" href="(\/fonts\/[^"]+)"/g)) {
      assert.ok(declared.has(m[1]),
        `${f} preloads ${m[1]}, which is not a URL tokens.css requests — that is a double download`);
      checked++;
    }
  }
  assert.ok(checked > 0, 'no font preloads found; the fonts would start loading a round trip late');
});

test('a preloaded font is declared crossorigin', () => {
  /* A font preload without it is a separate, anonymous request: the browser
     fetches the file twice and warns about the unused preload. */
  for (const f of [...pages, 'admin/index.html']) {
    for (const m of read(f).matchAll(/<link rel="preload" href="\/fonts\/[^"]+"[^>]*>/g)) {
      assert.match(m[0], /\bcrossorigin\b/, `${f}: ${m[0]}`);
      assert.match(m[0], /as="font"/, `${f}: ${m[0]}`);
      assert.match(m[0], /type="font\/woff2"/, `${f}: ${m[0]}`);
    }
  }
});

test('bump-version.sh is still what rebuilds the prerendered copy', () => {
  const sh = readFileSync(new URL('../bump-version.sh', import.meta.url).pathname, 'utf8');
  assert.match(sh, /node tools\/prerender\.mjs/,
    'without this the prerendered markup goes stale the first time data.js changes');
  assert.match(sh, /href="\/fonts\//,
    'the font preloads need the same version token as the url() in tokens.css');
});
