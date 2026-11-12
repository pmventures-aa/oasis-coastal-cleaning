/* ==========================================================================
   Oasis Coastal Cleaning — money screen smoke test
   --------------------------------------------------------------------------
   Drives the portal against mocked API replies to check the two things the
   node tests cannot see: what Kristina is actually shown when the money does
   not load, and whether the figure at the top of the Accepted screen agrees
   with the cards underneath it.

   Needs a Chromium; it is not part of `node --test tests/*.test.mjs`.

     node tools/smoke-money.mjs

   Set CHROME to point at a different binary if yours lives elsewhere.
   ========================================================================== */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import pkg from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pkg;
const ROOT = new URL('../public/', import.meta.url).pathname;
const T = { '.html':'text/html;charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2','.webmanifest':'application/manifest+json' };
const srv = createServer(async (q,r)=>{const p=decodeURIComponent(q.url.split('?')[0]);try{const b=await readFile(join(ROOT,p==='/'?'index.html':p));r.writeHead(200,{'content-type':T[extname(p)]||'application/octet-stream'});r.end(b);}catch{r.writeHead(404).end('nf');}});
await new Promise(r=>srv.listen(9928,'127.0.0.1',r));
const fails=[]; const ok=(n,c)=>{console.log((c?'PASS ':'FAIL ')+n); if(!c)fails.push(n);};
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });

const STATUS = { authConfigured:true, signedIn:true, databaseConfigured:true, emailConfigured:true,
  me:{id:'u1',name:'Kristina Roberts',role:'owner'},
  can:{money:true,everyoneSchedule:true,clientList:true,sendMail:true,manageUsers:true,settings:true,priceBook:true} };

async function page(invoicesReply, pipelineReply) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 900 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**', r => r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort());
  await p.route('**/api/**', r => r.fulfill({ status:200, contentType:'application/json', body:'{"ok":true}' }));
  await p.route('**/api/admin/status**', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(STATUS) }));
  if (pipelineReply) await p.route('**/api/admin/pipeline**', r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(pipelineReply) }));
  await p.route('**/api/admin/invoices**', r => r.fulfill(invoicesReply));
  await p.goto('http://127.0.0.1:9928/admin/index.html', { waitUntil: 'networkidle' });
  return { ctx, p, errs };
}

// 1. a read that failed must not read as "no invoices yet"
{
  const { ctx, p, errs } = await page({ status:503, contentType:'application/json',
    body: JSON.stringify({ error: 'The money could not be read just now, so nothing here is reliable. Nothing has been changed. Try again in a moment.' }) });
  await p.evaluate(() => document.querySelector('[data-view="money"]')?.click());
  await p.waitForTimeout(400);
  const t = await p.innerText('body');
  ok('a failed read does not say "No invoices yet"', !/No invoices yet/i.test(t));
  ok('a failed read does not claim the feature is off', !/not switched on/i.test(t));
  ok('a failed read says so', /would not load|could not be read/i.test(t));
  ok('and offers a way to retry', await p.locator('[data-act="reload"]').count() > 0);
  ok('the Try again button is wired', await p.evaluate(() => {
    let hit = false;
    const orig = window.fetch;
    window.fetch = (...a) => { if (String(a[0]).includes('invoices')) hit = true; return orig(...a); };
    document.querySelector('[data-act="reload"]').click();
    return new Promise(r => setTimeout(() => r(hit), 300));
  }));
  ok('no page errors', errs.length === 0); if (errs.length) console.log('   ', errs.join(' | '));
  await ctx.close();
}

// 2. tables genuinely absent still reads as setup, not as breakage
{
  const { ctx, p } = await page({ status:503, contentType:'application/json',
    body: JSON.stringify({ error:'Invoices are not set up yet.', setup:'Run the migration.', needsSetup:true }) });
  await p.evaluate(() => document.querySelector('[data-view="money"]')?.click());
  await p.waitForTimeout(400);
  ok('a missing table still reads as setup', /not switched on/i.test(await p.innerText('body')));
  await ctx.close();
}

// 3. the Accepted header adds up the same balances the cards show
{
  const pipeline = { ok:true, stage:'accepted',
    counts:{ outstanding_cents: 50000 },      // the old cached figure: the full total
    quotes:[
      { id:'q1', customer_name:'A Smith', total:50000, status:'accepted',
        money:{ source:'invoice', total:50000, paid:40000, balance:10000, state:'part_paid' } },
      { id:'q2', customer_name:'B Jones', total:20000, status:'accepted',
        money:{ source:'invoice', total:20000, paid:0, balance:20000, state:'unpaid' } },
    ] };
  const { ctx, p } = await page({ status:200, contentType:'application/json',
    body: JSON.stringify({ ok:true, methods:[], invoices:[], outstanding:0 }) }, pipeline);
  // Accepted is a stage tab inside Quotes, not a bottom-bar view.
  await p.evaluate(() => document.querySelector('[data-view="quotes"]').click());
  await p.waitForTimeout(400);
  await p.evaluate(() => document.querySelector('[data-view="accepted"]').click());
  await p.waitForTimeout(600);
  const sum = await p.locator('.pipeline__sum').first().textContent().catch(() => '');
  console.log('   header reads:', JSON.stringify((sum || '').trim()));
  ok('header shows $300 (10000 + 20000 cents), not the $500 cached total', /\$300/.test(sum || ''));
  await ctx.close();
}

await b.close(); srv.close();
console.log(fails.length ? '\nFAILURES: ' + fails.join('; ') : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
