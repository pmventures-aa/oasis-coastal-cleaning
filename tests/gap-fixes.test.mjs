/* The gaps found in review, each pinned so it cannot come back. */
import assert from 'node:assert/strict';
import { normalizeLineItems, looksAutomated } from '../functions/_lib/quotes.js';
import { verifySvixWebhook } from '../functions/_lib/webhook.js';
import { addressKey, readPropertyCache, writePropertyCache } from '../functions/_lib/rentcast.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const testAsync = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

// 1 — a negative price cannot survive either branch
test('negative unit_price clamps to zero', () => {
  assert.equal(normalizeLineItems([{ label: 'A', unit_price: -10000 }]).total, 0);
});
test('negative unit_dollars clamps to zero', () => {
  assert.equal(normalizeLineItems([{ label: 'A', unit_dollars: '-100' }]).total, 0);
});
test('a negative line cannot drag a total below zero', () => {
  const r = normalizeLineItems([{ label: 'A', unit_dollars: '-100' }, { label: 'B', unit_dollars: '50' }]);
  assert.equal(r.subtotal, 5000);
  assert.ok(r.total >= 0);
});
test('normal prices still work', () => {
  assert.equal(normalizeLineItems([{ label: 'A', unit_dollars: '120', qty: 2 }]).total, 24000);
});

// 2 — an unconfigured webhook rejects rather than waving everything through
await testAsync('missing webhook secret rejects', async () => {
  const req = new Request('https://x/y', { method: 'POST' });
  assert.ok(await verifySvixWebhook(req, '{}', ''));
  assert.ok(await verifySvixWebhook(req, '{}', undefined));
});
await testAsync('a wrong signature still rejects', async () => {
  const req = new Request('https://x/y', { method: 'POST', headers: {
    'svix-id': 'msg_1', 'svix-timestamp': String(Math.floor(Date.now()/1000)), 'svix-signature': 'v1,bogus' } });
  assert.ok(await verifySvixWebhook(req, '{}', 'whsec_' + btoa('secret')));
});

// 7 — scanners do not count as the customer reading the quote
test('bots and blank agents are treated as automated', () => {
  const ua = (v) => new Request('https://x/y', { headers: v === null ? {} : { 'user-agent': v } });
  for (const b of ['Slackbot-LinkExpanding 1.0', 'facebookexternalhit/1.1', 'Mozilla/5.0 (compatible; Googlebot/2.1)',
                   'python-requests/2.31', 'curl/8.4.0', 'HeadlessChrome/120', 'Barracuda Sentinel', null]) {
    assert.equal(looksAutomated(ua(b)), true, 'should be automated: ' + b);
  }
});
test('real browsers are not', () => {
  const ua = (v) => new Request('https://x/y', { headers: { 'user-agent': v } });
  for (const h of [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0']) {
    assert.equal(looksAutomated(ua(h)), false, 'should be a person: ' + h);
  }
});

// 6 — the same address never costs two RentCast requests
test('address key ignores case, spacing and punctuation', () => {
  assert.equal(addressKey({ address: '123 N.E. 5th St.', city: 'Delray Beach', state: 'FL', zip: '33444' }),
               addressKey({ address: '123 ne 5th st',    city: 'delray  beach', state: 'fl', zip: '33444' }));
});
test('different addresses do not collide', () => {
  assert.notEqual(addressKey({ address: '123 Main St', city: 'Boca Raton', zip: '33432' }),
                  addressKey({ address: '124 Main St', city: 'Boca Raton', zip: '33432' }));
});
await testAsync('a cached hit and a cached miss both come back', async () => {
  const rows = new Map();
  const db = { prepare: (sql) => ({ bind: (...a) => ({
    first: async () => rows.get(a[0]) || null,
    run: async () => { if (/INSERT/.test(sql)) rows.set(a[0], { property: a[1], found: a[2] }); }
  }) }) };
  const k = addressKey({ address: '1 Ocean Blvd', city: 'Boca Raton', zip: '33432' });
  assert.equal(await readPropertyCache(db, k), null);
  await writePropertyCache(db, k, { found: true, property: { beds: 3, baths: 2 } });
  const hit = await readPropertyCache(db, k);
  assert.equal(hit.found, true);
  assert.equal(hit.property.beds, 3);
  await writePropertyCache(db, k, { found: false, property: null });
  assert.equal((await readPropertyCache(db, k)).found, false);
});
await testAsync('a broken cache never breaks a lookup', async () => {
  const db = { prepare: () => { throw new Error('d1 down'); } };
  assert.equal(await readPropertyCache(db, 'k'), null);
  await writePropertyCache(db, 'k', { found: true, property: {} });   // must not throw
});

console.log('\n' + n + ' assertions passed');

/* ---- the catalog carries no amounts, and an unpriced quote cannot be sent -- */
import { readFileSync } from 'node:fs';

test('the admin catalog stores no dollar amounts', () => {
  const src = readFileSync(new URL('../public/js/admin-catalog.js', import.meta.url), 'utf8');
  const globalRef = {};
  new Function('window', src)(globalRef);
  const cat = globalRef.OASIS_ADMIN_CATALOG;
  const all = [...cat.bases, ...cat.addOns];
  assert.ok(all.length >= 19, 'catalog should still list every service');
  for (const item of all) {
    assert.deepEqual(Object.keys(item).filter((k) => /dollar|price|amount|cent|rate/i.test(k)), [],
      'no money key on ' + item.label);
    assert.ok(item.id && item.label, 'still has id and label: ' + JSON.stringify(item));
  }
});

test('no digits-as-money survive anywhere in the catalog file', () => {
  const src = readFileSync(new URL('../public/js/admin-catalog.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('window.OASIS_ADMIN_CATALOG'));
  assert.equal(/:\s*\d+/.test(body), false, 'a bare number is left in the catalog data');
});

console.log('\n' + n + ' assertions passed (catalog)');

/* ---- every line of a quote says how often it happens ---------------------- */
import { CADENCES, cadenceById, isRecurring } from '../functions/_lib/quotes.js';

test('a line keeps the cadence it was given', () => {
  const r = normalizeLineItems([
    { label: 'Home cleaning', unit_dollars: '175', cadence: 'biweekly' },
    { label: 'Oven', unit_dollars: '45', cadence: 'onetime' },
    { label: 'Windows', unit_dollars: '60' }
  ]);
  assert.deepEqual(r.items.map((i) => i.cadence), ['biweekly', 'onetime', 'onetime']);
});

test('an unknown cadence becomes a one-off rather than being kept', () => {
  const r = normalizeLineItems([{ label: 'A', unit_dollars: '10', cadence: 'fortnightly-ish' }]);
  assert.equal(r.items[0].cadence, 'onetime');
});

test('recurring and one-off are told apart', () => {
  assert.equal(isRecurring('biweekly'), true);
  assert.equal(isRecurring('onetime'), false);
  assert.equal(isRecurring(''), false);
  assert.equal(isRecurring('nonsense'), false);
});

test('every cadence has a label and a short form', () => {
  CADENCES.forEach((c) => {
    assert.ok(c.id && c.label && c.short, JSON.stringify(c));
    assert.equal(cadenceById(c.id).id, c.id);
  });
  assert.equal(cadenceById('nope').id, 'onetime', 'the fallback is a one-off');
});

console.log('\n' + n + ' assertions passed (cadence)');

/* ---- the wizard asks questions that fit the service ---------------------- */
test('an office is never asked how many bedrooms it has', () => {
  const w = {};
  new Function('window', readFileSync(new URL('../public/js/data.js', import.meta.url), 'utf8'))(w);
  const D = w.OASIS;

  const office = D.spaceFields.office.map((f) => f.label.toLowerCase());
  assert.ok(!office.some((l) => l.includes('bedroom')), 'office asks: ' + office.join(', '));
  assert.deepEqual(D.groupLabels.office['Around the house'], 'Around the office');

  // Homes still get the plain words.
  assert.ok(D.spaceFields.home.some((f) => f.label === 'Bedrooms'));

  // Every service that asks anything asks for real options, and every service
  // named in groupLabels or spaceFields actually exists.
  const ids = new Set(D.services.map((s) => s.id));
  for (const [id, fields] of Object.entries(D.spaceFields)) {
    assert.ok(ids.has(id), id + ' has space fields but is not a service');
    fields.forEach((f) => {
      assert.ok(f.key && f.label && Array.isArray(f.options) && f.options.length,
        id + '.' + f.key + ' is incomplete');
    });
  }
  for (const id of Object.keys(D.groupLabels)) {
    assert.ok(ids.has(id), id + ' has group labels but is not a service');
  }

  // Services with no entry are asked nothing beyond their size, which is right
  // for laundry (hampers) and organizing (hours).
  assert.equal(D.spaceFields.laundry, undefined);
  assert.equal(D.spaceFields.organizing, undefined);
});

test('nothing on the customer side promises a discount', () => {
  const w = {};
  new Function('window', readFileSync(new URL('../public/js/data.js', import.meta.url), 'utf8'))(w);
  const note = w.OASIS.bundleNote;
  assert.ok(!/discount|come down|saving|% off|cheaper|less each/i.test(note),
    'bundleNote promises a price: ' + note);
});

console.log('\n' + n + ' assertions passed (service-aware wizard)');
