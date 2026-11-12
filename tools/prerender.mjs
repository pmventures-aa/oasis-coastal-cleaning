/* ==========================================================================
   Oasis Coastal Cleaning — prerender
   --------------------------------------------------------------------------
   Every public page is assembled in the browser: the pages mark empty slots
   with data-render="name" and js/site.js fills them from js/data.js. That is
   a pleasant way to edit a site -- one file to change -- but it means the
   first paint of /services was a page with a 220px hole in it and /quote one
   with a 546px hole, and everything below the hole jumped down the moment the
   script ran. Google measured that jump on the home page at 1.018, four times
   its "poor" threshold, on a business whose customers arrive from local
   search. It also means a reader with JavaScript off, or a crawler that does
   not run it, is served a page with no services, no FAQ and no footer.

   Nothing on these pages actually needs a browser to be known: data.js is a
   static file in this repository. So this script renders each page once with
   the real renderers, copies the result back into the HTML between <!--pre-->
   markers, and the browser then re-renders the same markup into the same box
   -- no hole, no jump, and the page reads correctly with no JavaScript at all.

   Run via ./bump-version.sh, which runs it after any css/js change. Re-runs
   replace the previous block rather than nesting inside it.

   One slot is left to the browser: header. Its renderer attaches the mobile
   menu's click handler, so a prerendered copy would put the markup in the page
   twice over with the listener on only one of them -- the kind of thing that
   looks fine and breaks later. The reserved .hdr-hold box keeps its space, so
   it costs no jump. The town search moved out of renderAreas into
   setupTownFind for the same reason, which is what made that slot safe.
   ========================================================================== */

import { createServer } from 'node:http';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import pkg from '/opt/node-tools/node_modules/playwright/index.js';

const { chromium } = pkg;
const ROOT = new URL('../public/', import.meta.url).pathname;
const SKIP = new Set(['header']);
const PORT = 9917;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  try {
    const body = await readFile(join(ROOT, path === '/' ? 'index.html' : path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

const pages = (await readdir(ROOT)).filter(f => f.endsWith('.html'));
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
  args: ['--no-sandbox'],
});
// Reduced motion keeps setupMotion from stamping .reveal (opacity: 0) and a
// transition-delay onto every card before we copy the markup out. A reader
// with JS off would have been served an invisible page.
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });

let touched = 0, slots = 0;
for (const file of pages) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/${file}`, { waitUntil: 'load' });
  const found = await page.evaluate(skip => {
    const out = [];
    // data-render slots belong to js/site.js. data-prerender marks a block some
    // other script builds -- the quote wizard's first step -- that is just as
    // knowable ahead of time and left just as big a hole in the page.
    for (const n of document.querySelectorAll('[data-render], [data-prerender]')) {
      const attr = n.hasAttribute('data-render') ? 'data-render' : 'data-prerender';
      const name = n.getAttribute(attr);
      if (skip.includes(name)) continue;
      if (!n.innerHTML.trim()) continue;
      // Most renderers also set the slot's own class -- the FAQ slot becomes
      // .faq, a card grid becomes .grid.grid--3 -- so copying only the children
      // would lay them out in an unstyled box until the script ran.
      // Snapshot a copy, with the one piece of after-paint state normalised
      // away: syncDisclosures opens the "what is included" panels at this
      // width, and baking that in would show every panel expanded on a phone
      // and then collapse them. Closed is the markup's own default, and CSS
      // opens them where there is room. See .incl in css/site.css.
      const copy = n.cloneNode(true);
      for (const d of copy.querySelectorAll('details.incl[open]')) d.removeAttribute('open');
      out.push({ attr, name, html: copy.innerHTML, cls: n.getAttribute('class') || '' });
    }
    return out;
  }, [...SKIP]);
  await page.close();

  if (errors.length) throw new Error(`${file}: ${errors.join(' | ')}`);

  let src = await readFile(join(ROOT, file), 'utf8');
  const before = src;
  for (const { attr, name, html, cls } of found) {
    const re = new RegExp(
      `(<(\\w+)\\b)([^>]*\\b${attr}="${name}"[^>]*)(>)(?:<!--pre-->[\\s\\S]*?<!--/pre-->)?(</\\2>)`,
    );
    if (!re.test(src)) throw new Error(`${file}: no single-line slot found for ${attr}="${name}"`);
    src = src.replace(re, (_m, open, _tag, attrs, gt, close) => {
      const kept = attrs.replace(/\s*\bclass="[^"]*"/, '');
      const klass = cls ? ` class="${cls}"` : '';
      return `${open}${klass}${kept}${gt}<!--pre-->${html}<!--/pre-->${close}`;
    });
    slots++;
  }
  if (src !== before) { await writeFile(join(ROOT, file), src); touched++; }
}

await browser.close();
server.close();
console.log(`prerendered ${slots} slots across ${touched} pages`);
