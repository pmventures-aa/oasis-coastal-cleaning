/* Settings decide where alerts go and whether they go at all. */
import assert from 'node:assert/strict';
import { loadSettings, saveSettings, alertTarget, isOn, DEFAULTS, FIELDS } from '../functions/_lib/settings.js';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

function makeDb(rows = []) {
  const store = new Map(rows.map((r) => [r.key, r.value]));
  const ops = (...a) => ({
    all: async () => ({ results: [...store].map(([key, value]) => ({ key, value })) }),
    first: async () => ({ 1: 1 }),
    run: async () => { store.set(a[0], a[1]); }
  });
  return { store, prepare: () => Object.assign(ops(), { bind: ops }) };
}
const brokenDb = { prepare: () => { throw new Error('no such table: settings'); } };

await t('defaults stand before she has ever opened the page', async () => {
  assert.deepEqual(await loadSettings(makeDb()), DEFAULTS);
});

await t('a missing table returns defaults rather than throwing', async () => {
  assert.deepEqual(await loadSettings(brokenDb), DEFAULTS);
  assert.deepEqual(await loadSettings(null), DEFAULTS);
});

await t('stored values win over defaults', async () => {
  const s = await loadSettings(makeDb([{ key: 'quote_expiry_days', value: '30' }]));
  assert.equal(s.quote_expiry_days, '30');
  assert.equal(s.quote_terms, DEFAULTS.quote_terms, 'the rest are untouched');
});

await t('unknown keys are ignored coming in and going out', async () => {
  const s = await loadSettings(makeDb([{ key: 'sneaky', value: 'x' }]));
  assert.equal(s.sneaky, undefined);
  const db = makeDb();
  const r = await saveSettings(db, { sneaky: 'x' });
  assert.equal(r.ok, false, 'nothing valid to save');
  assert.equal(db.store.size, 0);
});

await t('an alert goes to her chosen address', async () => {
  const s = { ...DEFAULTS, notify_email: 'kr@example.com' };
  assert.equal(alertTarget(s, {}, 'accept'), 'kr@example.com');
});

await t('and falls back to the site address when she has set none', async () => {
  assert.equal(alertTarget(DEFAULTS, { QUOTE_TO_EMAIL: 'info@site.com' }, 'accept'), 'info@site.com');
});

await t('a toggle that is off stops the alert entirely', async () => {
  const s = { ...DEFAULTS, notify_on_decline: 'no' };
  assert.equal(alertTarget(s, { QUOTE_TO_EMAIL: 'info@site.com' }, 'decline'), null);
  assert.equal(alertTarget(s, { QUOTE_TO_EMAIL: 'info@site.com' }, 'accept'), 'info@site.com',
    'the others are unaffected');
});

await t('views are off out of the box, accepts are on', async () => {
  assert.equal(isOn(DEFAULTS.notify_on_view), false);
  assert.equal(isOn(DEFAULTS.notify_on_accept), true);
});

await t('every field on the settings screen is a real setting', async () => {
  FIELDS.forEach((f) => assert.ok(f.key in DEFAULTS, f.key + ' has no default'));
  const shown = new Set(FIELDS.map((f) => f.key));
  Object.keys(DEFAULTS).forEach((k) => assert.ok(shown.has(k), k + ' is a setting with no way to change it'));
});

console.log('\n' + n + ' settings cases passed');
