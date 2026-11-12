/* Buttons that do nothing.
   -------------------------------------------------------------------------
   The portal is built by writing HTML strings and reading them back in
   delegated listeners, which means a control and the code that answers it are
   hundreds of lines apart and nothing connects them but a matching name. Five
   times in this project a screen shipped with markup and no handler: the login
   email field, the whole invoices screen, the visit checklist, the add-someone
   button in Settings, and Edit on a contact record. Each time it looked
   finished and did nothing, and each time it was found by a person pressing it
   rather than by anything here.

   This reads every data- attribute the portal writes into markup and checks
   that something, somewhere in the same file, asks about it. It cannot prove
   the handler is correct. It does prove there is one. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FILES = ['public/js/admin.js', 'public/js/quote.js', 'public/js/site.js', 'public/js/client.js'];

/* Attributes that carry a value for a handler keyed on a different attribute,
   or that CSS alone acts on. Each one needs a reason to be here. */
const DATA_ONLY = new Set([
  'data-link',        // the payload a feed button copies; read via dataset.link
  'data-kind',        // which feed a feed button means; read via dataset.kind
  'data-label',       // the text renderTextButton puts on its button
  'data-filter',      // which FAQ subset a page wants
  'data-limit',       // how many FAQs a page wants
  'data-skip',        // the service a card grid leaves out
  'data-render',      // the slot name site.js renders into
  'data-prerender',   // the slot name tools/prerender.mjs fills
  'data-page',        // the page name, for CSS and for analytics
  'data-cta',         // which call-to-action was pressed, for analytics
  'data-sitekey',     // Turnstile's own attribute
  'data-theme',       // Turnstile's own attribute
  'data-action',      // Turnstile's own attribute
]);

/* A stylesheet reading an attribute counts: .qstep[data-qstep="2"] is how the
   quote editor shows one step at a time, and no script needs to know. */
const CSS = ['public/css/admin.css', 'public/css/site.css']
  .map(f => readFileSync(new URL('../' + f, import.meta.url).pathname, 'utf8')).join('\n');

for (const file of FILES) {
  test(`every data- attribute written in ${file} has something that reads it`, () => {
    const src = readFileSync(new URL('../' + file, import.meta.url).pathname, 'utf8') + '\n' + CSS;

    // Attributes as they appear in the HTML strings this file builds.
    const written = new Set();
    for (const m of src.matchAll(/(?:^|[\s'"])(data-[a-z][a-z0-9-]*)\s*=\s*["'\\]/g)) {
      written.add(m[1]);
    }

    const orphans = [];
    for (const attr of written) {
      if (DATA_ONLY.has(attr)) continue;
      const camel = attr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const read =
        // a selector, whether closed, valued, or built by concatenation:
        // [data-foo]  [data-foo="x"]  '[data-foo="' + id + '"]'
        src.includes(`[${attr}]`) ||
        src.includes(`[${attr}=`) ||
        src.includes(`'${attr}'`) ||                       // getAttribute / hasAttribute
        src.includes(`"${attr}"`) ||
        new RegExp(`dataset\\.${camel}\\b`).test(src) ||    // dataset.fooBar
        new RegExp(`dataset\\[['"]${camel}['"]\\]`).test(src);
      if (!read) orphans.push(attr);
    }

    assert.deepEqual(orphans.sort(), [],
      'these are written into markup and nothing reads them — the control will ' +
      'look finished and do nothing when pressed');
  });
}

test('no two handlers claim the same attribute for different payloads', () => {
  /* data-feed-copy was claimed by the schedule screen and then again by the
     users screen, which sat earlier in the same listener and read a different
     attribute for its id. Copy wrote an empty string to the clipboard and
     reported "Copied". A name used by two screens needs to mean one thing. */
  const src = readFileSync(new URL('../public/js/admin.js', import.meta.url).pathname, 'utf8');
  const counts = {};
  for (const m of src.matchAll(/hit\.matches\('\[(data-[a-z0-9-]+)[\]=]/g)) {
    counts[m[1]] = (counts[m[1]] || 0) + 1;
  }
  const twice = Object.entries(counts).filter(([, n]) => n > 1).map(([a]) => a);
  assert.deepEqual(twice, [],
    'claimed by more than one branch of the same delegated listener; the first ' +
    'one wins everywhere and the second is dead');
});

test('no function in a portal script is declared twice', () => {
  /* copyText was declared twice in admin.js. Declarations hoist, so the later
     one won at every call site, and the three that did copyText(...).then(...)
     threw on every press -- while the text usually reached the clipboard
     first, so the only symptom was that nothing ever said "Copied". */
  for (const file of FILES) {
    const src = readFileSync(new URL('../' + file, import.meta.url).pathname, 'utf8');
    const seen = {};
    for (const m of src.matchAll(/^\s*function ([A-Za-z_$][\w$]*)\s*\(/gm)) {
      seen[m[1]] = (seen[m[1]] || 0) + 1;
    }
    const dupes = Object.entries(seen).filter(([, n]) => n > 1).map(([f]) => f);
    assert.deepEqual(dupes, [], `${file}: declared more than once, so only the last one exists`);
  }
});
