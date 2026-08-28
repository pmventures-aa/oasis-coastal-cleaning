/* Keeping rubbish out without a third-party key — and never at the cost of a
   real customer. */
import assert from 'node:assert/strict';
import { checkSubmission, noteSubmission, HONEYPOT } from '../functions/_lib/spam.js';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

const req = (ip = '203.0.113.7') => new Request('https://site.test/api/quote', {
  method: 'POST', headers: { 'cf-connecting-ip': ip }
});
const db = (count = 0) => {
  const ops = () => ({ first: async () => ({ n: count }), run: async () => {}, all: async () => ({ results: [] }) });
  return { prepare: () => Object.assign(ops(), { bind: ops }) };
};
const brokenDb = { prepare: () => { throw new Error('no such table: submissions'); } };
const human = { formStartedAt: Date.now() - 45000 };

await t('a normal submission passes', async () => {
  const r = await checkSubmission({ DB: db(0) }, req(), human);
  assert.equal(r.ok, true, r.reasons.join());
});

await t('the invisible field catches a bot', async () => {
  const r = await checkSubmission({ DB: db(0) }, req(), { ...human, [HONEYPOT]: 'https://spam.example' });
  assert.equal(r.ok, false);
  assert.ok(r.reasons.includes('honeypot'));
});

await t('six steps filled in under four seconds is not a person', async () => {
  const r = await checkSubmission({ DB: db(0) }, req(), { formStartedAt: Date.now() - 900 });
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.startsWith('too fast')));
});

await t('but a careful person taking four minutes is fine', async () => {
  const r = await checkSubmission({ DB: db(0) }, req(), { formStartedAt: Date.now() - 240000 });
  assert.equal(r.ok, true);
});

await t('a form left open overnight is refused rather than trusted', async () => {
  const r = await checkSubmission({ DB: db(0) }, req(), { formStartedAt: Date.now() - 13 * 3600 * 1000 });
  assert.equal(r.ok, false);
  assert.ok(r.reasons.includes('stale form'));
});

await t('a seventh request in an hour from one address is stopped', async () => {
  const r = await checkSubmission({ DB: db(6) }, req(), human);
  assert.equal(r.ok, false);
  assert.ok(r.reasons.includes('rate limit'));
});

await t('a household sending three is not', async () => {
  const r = await checkSubmission({ DB: db(3) }, req(), human);
  assert.equal(r.ok, true);
});

await t('no timing information at all is not held against them', async () => {
  const r = await checkSubmission({ DB: db(0) }, req(), {});
  assert.equal(r.ok, true, 'an older cached page must still work');
});

await t('a broken database lets the customer through', async () => {
  const r = await checkSubmission({ DB: brokenDb }, req(), human);
  assert.equal(r.ok, true, 'a hiccup must never look like spam');
  await noteSubmission({ DB: brokenDb }, '203.0.113.7');   // must not throw
});

await t('no database at all still works', async () => {
  const r = await checkSubmission({}, req(), human);
  assert.equal(r.ok, true);
  assert.equal(r.ip, '203.0.113.7');
});

console.log('\n' + n + ' spam cases passed');
