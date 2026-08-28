/* Editing a quote that has already gone out — the flow Kristina asked for. */
import assert from 'node:assert/strict';
import { onRequestPatch } from '../functions/api/admin/quotes.js';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

/* A very small stand-in for D1: enough to see what the handler writes. */
function makeDb(quote) {
  const events = [];
  return {
    events,
    quote,
    prepare(sql) {
      return { bind: (...args) => ({
        first: async () => {
          if (/FROM quotes WHERE id/.test(sql)) return { ...quote };
          return null;
        },
        run: async () => {
          if (/INSERT INTO quote_events/.test(sql)) { events.push({ type: args[3], detail: args[4] }); return; }
          if (/^UPDATE quotes SET/.test(sql)) {
            const cols = sql.slice(sql.indexOf('SET') + 4, sql.indexOf(' WHERE')).split(',')
              .map((c) => c.trim().replace(/\s*=\s*\?$/, ''));
            cols.forEach((c, i) => { quote[c] = args[i]; });
          }
        },
        all: async () => ({ results: events })
      }) };
    }
  };
}

const req = (body) => new Request('https://x/api/admin/quotes', {
  method: 'PATCH', headers: { cookie: 'oasis_admin=stub' }, body: JSON.stringify(body)
});

// A real signed session, minted the same way the login endpoint does.
import { makeSessionCookie } from '../functions/_lib/auth.js';
const ENV = { ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'a-long-random-string-for-tests' };
const setCookie = await makeSessionCookie(ENV);
const COOKIE = setCookie.split(';')[0];

const signedReq = (body) => new Request('https://x/api/admin/quotes', {
  method: 'PATCH', headers: { cookie: COOKIE }, body: JSON.stringify(body)
});

async function patch(quote, body, env = {}) {
  const db = makeDb(quote);
  const res = await onRequestPatch({ request: signedReq(body), env: { DB: db, ...ENV, ...env } });
  return { res, body: await res.json(), db };
}

const LINES = [{ label: 'Home cleaning', qty: 1, unit_dollars: '175' }];
const base = (over) => ({ id: 'q1', status: 'draft', token: 't', line_items: '[]',
  subtotal: 0, total: 0, sent_at: null, archived_at: null, ...over });

// The handler signs in first; without a session everything is 401, which is
// itself worth pinning.
await t('an unauthenticated edit is refused', async () => {
  const res = await onRequestPatch({
    request: req({ id: 'q1', line_items: LINES }),
    env: { DB: makeDb(base()), ...ENV }
  });
  assert.equal(res.status, 401);
});

await t('a sent quote can be edited, and goes back to draft', async () => {
  const q = base({ status: 'sent', sent_at: '2026-08-01T10:00:00.000Z', total: 17500 });
  const { res, body, db } = await patch(q, { id: 'q1', line_items: [
    { label: 'Home cleaning', qty: 1, unit_dollars: '175' },
    { label: 'Oven (inside)', qty: 1, unit_dollars: '45' }] });
  assert.equal(res.status, 200);
  assert.equal(db.quote.status, 'draft', 'pulled back to draft while she works');
  assert.equal(db.quote.total, 22000, 'new total is stored');
  assert.equal(db.quote.token, 't', 'the customer link still works');
  assert.equal(db.quote.sent_at, '2026-08-01T10:00:00.000Z', 'original send is remembered');
  assert.ok(db.events.some((e) => e.type === 'revised'), 'the revision is on the record');
});

await t('a declined quote can be revised too', async () => {
  const q = base({ status: 'declined', sent_at: '2026-08-01T10:00:00.000Z' });
  const { res, db } = await patch(q, { id: 'q1', line_items: LINES });
  assert.equal(res.status, 200);
  assert.equal(db.quote.status, 'draft');
});

await t('an expired quote can be revised', async () => {
  const q = base({ status: 'expired', sent_at: '2026-08-01T10:00:00.000Z' });
  const { res, db } = await patch(q, { id: 'q1', line_items: LINES });
  assert.equal(res.status, 200);
  assert.equal(db.quote.status, 'draft');
});

await t('an accepted quote stays locked', async () => {
  const q = base({ status: 'accepted', sent_at: '2026-08-01T10:00:00.000Z', accepted_at: '2026-08-02T10:00:00.000Z' });
  const { res, body, db } = await patch(q, { id: 'q1', line_items: LINES });
  assert.equal(res.status, 400);
  assert.match(body.error, /accepted/i);
  assert.equal(db.quote.status, 'accepted', 'nothing was written');
  assert.equal(db.events.length, 0);
});

await t('an archived quote must be restored first', async () => {
  const q = base({ status: 'sent', archived_at: '2026-08-03T10:00:00.000Z' });
  const { res, body } = await patch(q, { id: 'q1', line_items: LINES });
  assert.equal(res.status, 400);
  assert.match(body.error, /restore/i);
});

await t('editing a draft still does not log a revision', async () => {
  const q = base({ status: 'draft' });
  const { res, db } = await patch(q, { id: 'q1', line_items: LINES });
  assert.equal(res.status, 200);
  assert.equal(db.events.filter((e) => e.type === 'revised').length, 0);
});

console.log('\n' + n + ' assertions passed');
