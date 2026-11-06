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

/* A 200 whose body was not the shape we asked for threw before render(),
   leaving the settings screen reading "Loading your settings..." for good. */
test('a malformed settings response cannot strand the screen on Loading', () => {
  const fn = JS.slice(JS.indexOf('function loadSettings()'));
  const body = fn.slice(0, fn.indexOf('\n  }'));
  assert.match(body, /typeof r\.body\.settings === 'object'/);
  // the unguarded read must now sit after the guard, never before it
  assert.ok(body.indexOf('var shaped') < body.indexOf('r.body.settings.quote_note'));
  assert.match(body, /state\.settingsBroke = !!r\.ok/);
});

test('a broken load is not mistaken for an empty settings table', () => {
  assert.match(JS, /state\.settingsBroke/);
  assert.match(JS, /These did not load/);
  assert.match(JS, /will not help with this one/);
  // and the old advice still stands for the genuinely-empty case
  assert.match(JS, /There is nowhere to save them yet/);
});

/* Three cards in a row put their buttons at three different heights, and the
   shortest carried an empty well under its own. */
test('pipeline card actions are pinned to the bottom so they line up', () => {
  assert.match(CSS, /\.pcard \{ display: flex; flex-direction: column; \}/);
  assert.match(CSS, /\.pcard__acts \{ margin-top: auto; \}/);
});

/* ------------------------------------------------------- the month view */

test('month is the first tab and the view she lands on', () => {
  const views = JS.slice(JS.indexOf('var SCHED_VIEWS'), JS.indexOf('var DAY_NAMES'));
  const order = [...views.matchAll(/id: '(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(order, ['month', 'agenda', 'day', 'week']);
  assert.match(JS, /schedView: 'month'/);
});

/* A 46px phone cell truncates a name to nothing, so the phone gets dots and
   a written-out list; a 144px cell fits a chip that can be read. */
test('cells carry readable chips where there is room for one', () => {
  assert.match(JS, /class="mchip mchip--/);
  assert.match(JS, /shortClock\(a\.start_at\)/);
  assert.match(CSS, /\.mcell__chips \{ display: none; \}/);
  const wide = CSS.slice(CSS.indexOf('@media (min-width: 780px)',
    CSS.indexOf('.mcell__chips { display: none; }')));
  assert.match(wide.slice(0, wide.indexOf('\n}')), /\.mcell__chips \{ display: grid/);
});

test('a long name is cut with an ellipsis, never shrunk away', () => {
  assert.match(CSS, /\.mchip \{[^}]*text-overflow: ellipsis/s);
  // and the whole of it is still reachable
  assert.match(JS, /title="' \+\s*esc\(rangeOf\(a\) \+ ' — ' \+ who\)/);
});

/* monthHtml already ended with one; adding a second rendered the day twice. */
test('the chosen day is listed under the grid exactly once', () => {
  const fn = JS.slice(JS.indexOf('function monthHtml()'), JS.indexOf('function scheduleHtml()'));
  assert.equal((fn.match(/dayGroupHtml\(/g) || []).length, 1);
  assert.match(fn, /class="mpick"/);
});

test('the dot key shows where dots do the work and not where chips do', () => {
  assert.match(JS, /mkey--offer/);
  const keyAt = CSS.indexOf('.mgrid__key {');
  const hideAt = CSS.indexOf('.mgrid__key { display: none; }');
  assert.ok(keyAt > -1 && hideAt > keyAt,
    'the hide must come after the base rule or source order wins');
});

console.log('\n' + n + ' passed');
