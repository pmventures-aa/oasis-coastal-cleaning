/* ==========================================================================
   Oasis Coastal Cleaning — public site smoke test
   --------------------------------------------------------------------------
   The node tests in tests/ check the shipped files. This drives a real browser
   over the public pages and checks the two things only a browser can show:
   that everything still works with JavaScript on, and that every page reads
   correctly with JavaScript off -- which is what the prerendered markup is
   for, and the thing a stale snapshot would quietly break.

   Needs a Chromium; it is not part of `node --test tests/*.test.mjs`.

     node tools/smoke-public.mjs

   Set CHROME to point at a different binary if yours lives elsewhere.
   ========================================================================== */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import pkg from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pkg;
const ROOT = new URL('../public/', import.meta.url).pathname;
const T = { '.html':'text/html;charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon', '.webp':'image/webp', '.jpg':'image/jpeg', '.woff2':'font/woff2' };
const srv = createServer(async (q, r) => { const p = decodeURIComponent(q.url.split('?')[0]);
  try { const b = await readFile(join(ROOT, p === '/' ? 'index.html' : p)); r.writeHead(200, { 'content-type': T[extname(p)] || 'application/octet-stream' }); r.end(b); } catch { r.writeHead(404).end('nf'); } });
await new Promise(r => srv.listen(9922, '127.0.0.1', r));
const U = 'http://127.0.0.1:9922/';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const fails = [];
const ok = (n, c) => console.log((c ? 'PASS ' : 'FAIL ') + n) || (c || fails.push(n));

// ---- with JS, mobile
let ctx = await b.newContext({ viewport: { width: 375, height: 812 } });
let errs = [];
ctx.on('page', p => p.on('pageerror', e => errs.push(String(e))));
let pg = await ctx.newPage();

await pg.goto(U + 'service-areas.html', { waitUntil: 'networkidle' });
await pg.fill('#townfind', 'delray');
await pg.waitForTimeout(250);
ok('town search filters and answers', /Yes/.test(await pg.textContent('.townfind__said')));
ok('town search hides non-matching cards', (await pg.locator('.area-card:visible').count()) < (await pg.locator('.area-card').count()));
await pg.fill('#townfind', 'zzzz');
await pg.waitForTimeout(250);
ok('unknown town gets the honest answer', /not on the list/.test(await pg.textContent('.townfind__said')));

await pg.goto(U + 'index.html', { waitUntil: 'networkidle' });
const navBtn = pg.locator('.topbar [aria-expanded]').first();
ok('mobile nav toggle exists', await navBtn.count() > 0);
await navBtn.click();
await pg.waitForTimeout(200);
ok('mobile nav opens', (await navBtn.getAttribute('aria-expanded')) === 'true');
await navBtn.click();
await pg.waitForTimeout(200);
ok('mobile nav closes', (await navBtn.getAttribute('aria-expanded')) === 'false');

await pg.goto(U + 'services.html', { waitUntil: 'networkidle' });
const incl = pg.locator('details.incl').first();
ok('panels start closed on a phone', !(await incl.evaluate(d => d.open)));
await incl.locator('summary').click();
await pg.waitForTimeout(200);
ok('panel opens on tap', await incl.evaluate(d => d.open));

await pg.goto(U + 'quote.html', { waitUntil: 'networkidle' });
ok('wizard opens on step 1', /Step 1 of/.test(await pg.textContent('.wiz__count')));
ok('one progress segment is filled', await pg.locator('.wiz__seg.is-done').count() === 1);
await pg.locator('[data-act="next"]').click();
await pg.waitForTimeout(300);
const afterNext = await pg.textContent('.wiz__count');
ok('Next either advances or explains why not', /Step 2 of/.test(afterNext) || !(await pg.locator('#wiz-status').first().isHidden()));

// The add-ons step: every box present, none of them in the way.
await pg.goto(U + 'quote.html', { waitUntil: 'networkidle' });
await pg.locator('.tile').first().click();
for (let i = 0; i < 3; i++) { await pg.locator('[data-act="next"]').click(); await pg.waitForTimeout(200); }
ok('reached the add-ons step', /Anything else/.test(await pg.textContent('.wiz__title')));
const boxes = await pg.locator('.wiz__body input[type=checkbox]').count();
const bodyH = await pg.evaluate(() => document.querySelector('.wiz__body').offsetHeight);
ok(`add-ons step holds all ${boxes} boxes in ${bodyH}px (was ~1550)`, boxes >= 12 && bodyH < 800);
ok('groups are folded on a phone', await pg.locator('details.addon-group[open]').count() === 0);
await pg.locator('details.addon-group summary').first().click();
await pg.locator('details.addon-group input[type=checkbox]').first().check();
await pg.waitForTimeout(120);
ok('the group counts what you ticked', /1 chosen/.test(await pg.textContent('details.addon-group .addon-group__count')));
await pg.locator('[data-act="next"]').click(); await pg.waitForTimeout(250);
await pg.locator('[data-act="back"]').click(); await pg.waitForTimeout(250);
ok('the tick survives Back', await pg.locator('details.addon-group input:checked').count() === 1);
ok('and its group reopens itself', await pg.locator('details.addon-group:has(input:checked)').first().evaluate(d => d.open));

// Nothing a scroll lands on may sit behind the fixed bar at the bottom. It
// covered the whole Next button once, and a tap there opened the dialler.
await pg.evaluate(() => document.querySelector('.wiz__nav').scrollIntoView({ block: 'end' }));
await pg.waitForTimeout(300);
const clear = await pg.evaluate(() => {
  const n = document.querySelector('[data-act="next"]').getBoundingClientRect();
  const bar = document.querySelector('.stickybar').getBoundingClientRect();
  return Math.round(Math.max(0, n.bottom - bar.top));
});
ok(`Next is clear of the sticky bar when scrolled to it (overlap ${clear}px)`, clear === 0);
ok('and a tap at its own coordinates reaches it', await pg.evaluate(() => {
  const r = document.querySelector('[data-act="next"]').getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!(hit && hit.closest('[data-act="next"]'));
}));
await ctx.close();
ok('no page errors with JS on', errs.length === 0);
if (errs.length) console.log('   ', errs.join(' | '));

// ---- desktop: panels open from the start, without JS doing it
ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
pg = await ctx.newPage();
await pg.goto(U + 'services.html', { waitUntil: 'networkidle' });
ok('panel content is visible at desktop width', await pg.locator('details.incl .checklist').first().isVisible());
await ctx.close();

// ---- with JS off
ctx = await b.newContext({ viewport: { width: 375, height: 812 }, javaScriptEnabled: false });
pg = await ctx.newPage();
for (const [page, needle] of [['index.html', 'Fresh Spaces'], ['services.html', 'Add-ons'], ['faq.html', '?'], ['contact.html', 'Hours'], ['service-areas.html', 'Delray'], ['quote.html', 'Step 1 of'], ['pricing.html', 'quote']]) {
  await pg.goto(U + page, { waitUntil: 'load' });
  const t = await pg.innerText('body');
  ok(`JS off: ${page} renders (${t.length} chars) and contains "${needle}"`, t.length > 500 && t.toLowerCase().includes(needle.toLowerCase()));
}
await pg.goto(U + 'index.html', { waitUntil: 'load' });
ok('JS off: footer is present', (await pg.locator('.footer').count()) > 0);
ok('JS off: nav links are present', (await pg.locator('.topbar a, .footer a').count()) > 4);
ok('JS off: nothing is left invisible by a reveal class', (await pg.locator('.reveal:not(.reveal-in)').count()) === 0);
await ctx.close();

await b.close(); srv.close();
console.log(fails.length ? '\nFAILURES: ' + fails.join('; ') : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
