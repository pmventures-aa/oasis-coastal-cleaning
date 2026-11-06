/* The navigation and the calendar-sharing panel, pinned where a browser
   measurement found them wanting. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../public/css/admin.css', import.meta.url), 'utf8');
const JS = readFileSync(new URL('../public/js/admin.js', import.meta.url), 'utf8');

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

/* Measured at 28px in Chromium, beside 44px arrows in the same toolbar. */
test('the view tabs are a 44px tap target', () => {
  const block = CSS.slice(CSS.indexOf('.vtabs button {'));
  assert.match(block.slice(0, block.indexOf('}')), /min-height:\s*44px/);
});

/* Eight stages as wrapped pills measured 193px tall at 375px. */
test('the phone gets one dropdown instead of the eight pipeline pills', () => {
  assert.ok(JS.includes('data-pipe-select'));
  assert.match(CSS, /\.vtabs--pipeline\s*\{\s*display:\s*none/);
  assert.match(CSS, /\.toolbar__pipe\s*\{\s*display:\s*block/);
});

/* Both rules are plain class selectors, so source order decides. The base
   rule shipped below the override once and the dropdown never appeared. */
test('the base display:none is declared above the block that turns it on', () => {
  const base = CSS.indexOf('.toolbar__pipe { display: none; }');
  const on = CSS.indexOf('.toolbar__pipe { display: block;');
  assert.ok(base > -1 && on > -1);
  assert.ok(base < on, 'the override must come after the base rule to win');
});

test('the dropdown offers every view the tabs do, and navigates like them', () => {
  const views = [...JS.matchAll(/\{ id: '([a-z]+)',\s+label:/g)].map((m) => m[1]);
  assert.ok(views.includes('active') && views.includes('settings'));
  // one shared path, so a dropdown choice cannot drift from a tab click
  assert.match(JS, /function goView\(id\)/);
  assert.match(JS, /\[data-pipe-select\]'\)\) \{ goView\(e\.target\.value\)/);
  assert.match(JS, /\[data-view\]'\)\) \{ goView\(hit\.dataset\.view\)/);
});

/* A warning that your phone will not sync back means nothing before there
   is a link on a phone. */
test('the refresh-timing detail waits until a link exists', () => {
  const feed = JS.slice(JS.indexOf('function feedHtml()'), JS.indexOf('function howtoHtml()'));
  assert.ok(!/usually refreshes|picks up changes/.test(feed),
    'timing detail does not belong in the always-on copy');
  const how = JS.slice(JS.indexOf('function howtoHtml()'));
  assert.match(how.slice(0, how.indexOf('\n  }')), /picks up changes within the hour/);
  assert.match(feed, /\(f\.enabled \|\| f\.share_enabled\) \? howtoHtml\(\)/);
});

test('the one-way nature is still stated up front', () => {
  const feed = JS.slice(JS.indexOf('function feedHtml()'), JS.indexOf('function howtoHtml()'));
  assert.match(feed, /only goes one way/);
});

test('copying a link no longer leaves her with nowhere to put it', () => {
  assert.match(JS, /Add Subscribed Calendar/);   // iPhone
  assert.match(JS, /From URL/);                  // Google
});

/* Re-rendering a <details> drops its open attribute, which shut the panel
   on the very link it had just made. The nested one has the same fault. */
test('both drawers remember whether they were open', () => {
  assert.match(JS, /state\.feedOpen \? ' open' : ''/);
  assert.match(JS, /state\.feedHow \? ' open' : ''/);
  assert.match(JS, /\[data-feedhow\]'\)\) state\.feedHow = e\.target\.open/);
  assert.match(JS, /feedHow: false/);
});

console.log('\n' + n + ' passed');
