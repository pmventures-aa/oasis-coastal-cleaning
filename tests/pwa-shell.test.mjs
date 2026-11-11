/* The portal as something she adds to her Home Screen and runs from the van. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../public/admin/index.html', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../public/css/admin.css', import.meta.url), 'utf8');
const MANIFEST = JSON.parse(readFileSync(new URL('../public/admin/app.webmanifest', import.meta.url), 'utf8'));
const BUMP = readFileSync(new URL('../bump-version.sh', import.meta.url), 'utf8');

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

/* Added from the portal it must open the portal. The site manifest at the
   root starts at "/", so without its own she would land on the marketing
   site every time she opened the icon. */
test('the portal has its own manifest, scoped to itself', () => {
  assert.equal(MANIFEST.start_url, '/admin/');
  assert.equal(MANIFEST.scope, '/admin/');
  assert.equal(MANIFEST.display, 'standalone');
  assert.match(HTML, /<link rel="manifest" href="\/admin\/app\.webmanifest/);
});

test('it carries the icons iOS and Android each look for', () => {
  const sizes = MANIFEST.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  assert.ok(MANIFEST.icons.some((i) => i.purpose === 'maskable'));
  // iOS ignores the manifest's icons and reads this one
  assert.match(HTML, /rel="apple-touch-icon" sizes="180x180"/);
});

/* iOS reads the apple-* metas, not the manifest, for standalone mode. */
test('iOS is told it may run standalone, and what to call it', () => {
  assert.match(HTML, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(HTML, /name="mobile-web-app-capable" content="yes"/);
  assert.match(HTML, /name="apple-mobile-web-app-title" content="Oasis Portal"/);
  assert.match(HTML, /name="apple-mobile-web-app-status-bar-style"/);
});

/* Without viewport-fit=cover every safe-area inset reports 0, so the rules
   below would be dead on the device they were written for. */
test('the viewport opts into the full screen', () => {
  assert.match(HTML, /name="viewport"[^>]*viewport-fit=cover/);
});

test('the header clears the notch and the page clears the home indicator', () => {
  assert.match(CSS, /env\(safe-area-inset-top/);
  assert.match(CSS, /env\(safe-area-inset-bottom/);
  assert.match(CSS, /env\(safe-area-inset-left/);
});

/* A shorthand resets every side, so an inset declared above it is thrown
   away silently -- which is exactly what happened when this was written. */
test('the inset paddings are declared after the padding shorthand', () => {
  const rule = CSS.slice(CSS.indexOf('.adminwrap {'));
  const body = rule.slice(0, rule.indexOf('}'));
  assert.ok(body.indexOf('padding:') < body.indexOf('padding-bottom:'),
    'the shorthand must come first or it wipes the inset');
  assert.ok(body.indexOf('padding:') < body.indexOf('padding-left:'));
});

/* The manifest is a static asset, so the edge caches it: a changed start_url
   or icon would never reach a phone that had already seen the old one. */
test('the manifest is cache-busted like the css and js', () => {
  assert.match(BUMP, /app\\\.webmanifest/);
  assert.match(HTML, /app\.webmanifest\?v=\d+/);
});

console.log('\n' + n + ' passed');
