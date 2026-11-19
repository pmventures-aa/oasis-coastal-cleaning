/* ==========================================================================
   Oasis Coastal Cleaning — requests list smoke test
   --------------------------------------------------------------------------
   Drives the portal against a pipeline shaped like the real one (21 requests:
   6 unanswered, 12 quoted, 3 booked, oldest 3 months) and checks the grouping
   holds: the counts match the cards under them, the oldest unanswered request
   is first, the cards line up, and searching hides a band once nothing in it
   matches.

   Needs a Chromium; it is not part of `node --test tests/*.test.mjs`.

     node tools/smoke-requests.mjs

   Set CHROME to point at a different binary if yours lives elsewhere.
   ========================================================================== */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import pkg from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pkg;
const ROOT = new URL('../public/', import.meta.url).pathname;
const T = { '.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2','.webmanifest':'application/manifest+json' };
const srv = createServer(async (q,r)=>{const p=decodeURIComponent(q.url.split('?')[0]);try{const b=await readFile(join(ROOT,p==='/'?'index.html':p));r.writeHead(200,{'content-type':T[extname(p)]||'application/octet-stream'});r.end(b);}catch{r.writeHead(404).end('nf');}});
await new Promise(r=>srv.listen(9951,'127.0.0.1',r));

/* A pipeline shaped like the real one. Invented people; the shape -- how many
   are unanswered, how long each has been sitting -- is what the grouping has
   to cope with, and it is taken from the live data. */
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const MOCK = [
  [0,'new','Palm Beach Gardens'], [1,'new','NPB'], [1,'new','Royal Palm Beach'],
  [1,'new','Loxahatchee Groves'], [8,'new','Wellington'], [12,'new','West Palm Beach'],
  [13,'quoted','West Palm Beach'], [20,'booked','Wellington'], [22,'quoted','Lake Worth Beach'],
  [26,'quoted','Wellington'], [27,'booked','Delray Beach'], [28,'booked','West Palm Beach'],
  [29,'quoted','Royal Palm Beach'], [31,'quoted','West Palm Beach'], [35,'quoted','Loxahatchee'],
  [38,'quoted','Wellington'], [41,'quoted','LOXAHATCHEE'], [41,'quoted','West Palm Beach'],
  [41,'quoted','Wellington'], [41,'quoted','Lake worth'], [85,'quoted','Jupiter'],
].map(([age, status, city], i) => ({
  id: 'l' + i, created_at: daysAgo(age), status, city,
  name: 'Person ' + (i + 1), phone: '(561) 555-' + String(1000 + i),
  email: 'person' + i + '@example.com', service: 'home', service_label: 'Home Cleaning',
  followup: age === 85 ? 'visit' : 'none', archived_at: null, converted_at: null,
}));
const leads = MOCK;
const counts = {active: leads.length, archived: 0};
for (const l of leads) counts[l.status] = (counts[l.status]||0)+1;
const STATUS = { authConfigured:true, signedIn:true, databaseConfigured:true, emailConfigured:true,
  me:{id:'u1',name:'Kristina Roberts',role:'owner'},
  can:{money:true,everyoneSchedule:true,clientList:true,sendMail:true,manageUsers:true,settings:true,priceBook:true} };
const fails=[]; const ok=(n,c)=>{console.log((c?'PASS ':'FAIL ')+n); if(!c)fails.push(n);};
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror', e=>errs.push(e.message));
await p.route('**', r => r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort());
await p.route('**/api/**', r => r.fulfill({ status:200, contentType:'application/json', body:'{"ok":true}' }));
await p.route('**/api/admin/status**', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(STATUS) }));
await p.route('**/api/admin/leads**', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ leads, counts, view:'active' }) }));
await p.goto('http://127.0.0.1:9951/admin/index.html', { waitUntil: 'networkidle' });
await p.waitForTimeout(400);
await p.evaluate(() => document.querySelector('[data-view="active"]').click());
await p.waitForTimeout(500);

ok('every request is on screen', await p.locator('.lead').count() === leads.length);
ok('three bands', await p.locator('.band:visible').count() === 3);
ok('counts on the headers add up', await p.evaluate(() => {
  const n = [...document.querySelectorAll('.band')].map(b => +b.querySelector('.band__n').textContent);
  const cards = [...document.querySelectorAll('.band')].map(b => b.querySelectorAll('.lead').length);
  return JSON.stringify(n) === JSON.stringify(cards);
}));
ok('waiting-on-you is oldest first', await p.evaluate(() => {
  const band = document.querySelector('[data-band="you"]');
  const ages = [...band.querySelectorAll('.lead__when')].map(e => e.textContent);
  return /12 days/.test(ages[0]);
}));
ok('the 3-month-old one leads waiting-on-them', await p.evaluate(() =>
  /3 months/.test(document.querySelector('[data-band="them"] .lead__when').textContent)));
ok('cards all line up (same left edge for the name)', await p.evaluate(() => {
  const xs = new Set([...document.querySelectorAll('.lead__name')].map(e => Math.round(e.getBoundingClientRect().left)));
  return xs.size === 1;
}));

// opening a card still works
await p.locator('[data-band="you"] .lead__head').first().click();
await p.waitForTimeout(400);
ok('a card still opens', await p.locator('.lead.is-open').count() === 1);
await p.locator('.lead.is-open .lead__head').click();
await p.waitForTimeout(300);

// search must hide empty bands
await p.fill('#search', 'Jupiter');
await p.waitForTimeout(400);
ok('search narrows to the match', await p.locator('.lead:visible').count() === 1);
ok('and empty bands disappear', await p.locator('.band:visible').count() === 1);
await p.fill('#search', '');
await p.waitForTimeout(400);
ok('clearing search brings them all back', await p.locator('.band:visible').count() === 3);
ok('no page errors', errs.length === 0); if (errs.length) console.log('  ', errs.join(' | '));
await ctx.close(); await b.close(); srv.close();
console.log(fails.length ? '\nFAILURES: ' + fails.join('; ') : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
