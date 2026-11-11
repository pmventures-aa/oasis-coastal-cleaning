/* What the cleaner found, and the gate in front of it. Nothing reaches a
   client because a cleaner typed it: Kristina ticks it through first. */
import assert from 'node:assert/strict';
import { makeD1 } from './helpers/d1.mjs';
import { makeSessionCookie, hashPassword } from '../functions/_lib/auth.js';
import * as iss from '../functions/api/admin/issues.js';

let n = 0;
const testAsync = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

function db() {
  const d = makeD1(['0011_schedule.sql', '0014_users.sql', '0009_settings.sql', '0022_issues.sql']);
  return d;
}
const env = (d) => ({ DB: d, ADMIN_PASSWORD: 'x', SESSION_SECRET: 's'.repeat(32) });
const owner = async (d) => (await makeSessionCookie(env(d), false)).split(';')[0];
const get = (c, q = '') => new Request('https://x.test/api/admin/issues' + q, { headers: { Cookie: c } });
const send = (c, m, b) => new Request('https://x.test/api/admin/issues',
  { method: m, headers: { Cookie: c, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

async function cleaner(d, id = 'u-dani') {
  const h = await hashPassword('pw');
  d._raw.prepare(`INSERT INTO users (id,created_at,name,email,role,password_hash,
    password_salt,iterations,active) VALUES (?,?,?,?,?,?,?,?,1)`)
    .run(id, '2026-11-01', 'Dani', id + '@x.test', 'cleaner', h.hash, h.salt, h.iterations);
  return (await makeSessionCookie(env(d), false, id)).split(';')[0];
}
function visit(d, id = 'a1', assigned = 'u-dani') {
  d._raw.prepare(`INSERT INTO appointments (id,created_at,status,all_day,start_at,end_at,
    customer_id,assigned_to) VALUES (?,?,'confirmed',0,?,?,'c1',?)`)
    .run(id, '2026-11-01', '2026-11-11T14:00:00Z', '2026-11-11T16:00:00Z', assigned);
}

/* ------------------------------------------------------- her own list */

await testAsync('the categories are hers, not a fixed catalogue', async () => {
  const d = db(); const c = await owner(d);
  const res = await iss.onRequestPost({ request: send(c, 'POST',
    { action: 'category', label: 'Left a key out', note: 'Anywhere a key should not be' }),
    env: env(d) });
  assert.equal(res.status, 201);
  const got = await iss.onRequestGet({ request: get(c), env: env(d) });
  const body = await got.json();
  assert.equal(body.categories.length, 1);
  assert.equal(body.categories[0].label, 'Left a key out');
});

await testAsync('a cleaner cannot invent categories', async () => {
  const d = db(); const c = await cleaner(d);
  const res = await iss.onRequestPost({ request: send(c, 'POST',
    { action: 'category', label: 'Whatever' }), env: env(d) });
  assert.equal(res.status, 403);
});

await testAsync('a retired category keeps its wording on what was reported', async () => {
  const d = db(); const c = await owner(d); visit(d);
  const made = await iss.onRequestPost({ request: send(c, 'POST',
    { action: 'category', label: 'Damage' }), env: env(d) });
  const catId = (await made.json()).category.id;
  await iss.onRequestPost({ request: send(c, 'POST',
    { appointment_id: 'a1', category_id: catId, severity: 'urgent' }), env: env(d) });
  await iss.onRequestPatch({ request: send(c, 'PATCH',
    { action: 'category', id: catId, label: 'Damage (old)', active: false }), env: env(d) });
  const row = d._raw.prepare('SELECT category_label FROM visit_issues').get();
  assert.equal(row.category_label, 'Damage',
    'what was reported must still read the way it was reported');
});

/* ------------------------------------------------------------ the gate */

await testAsync('a reported issue starts un-approved', async () => {
  const d = db(); const c = await cleaner(d); visit(d);
  const res = await iss.onRequestPost({ request: send(c, 'POST',
    { appointment_id: 'a1', category_label: 'Damage', severity: 'urgent',
      body: 'Cracked tile in the hall' }), env: env(d) });
  assert.equal(res.status, 201);
  const issue = (await res.json()).issue;
  assert.equal(issue.approved_at, null, 'nothing is client-safe on arrival');
  assert.equal(issue.sent_at, null);
});

await testAsync('a cleaner cannot tick their own report through', async () => {
  const d = db(); const c = await cleaner(d); visit(d);
  const made = await iss.onRequestPost({ request: send(c, 'POST',
    { appointment_id: 'a1', category_label: 'Damage' }), env: env(d) });
  const id = (await made.json()).issue.id;
  const res = await iss.onRequestPatch({ request: send(c, 'PATCH',
    { id, action: 'approve' }), env: env(d) });
  assert.equal(res.status, 403);
  assert.equal(d._raw.prepare('SELECT approved_at FROM visit_issues WHERE id = ?')
    .get(id).approved_at, null);
});

await testAsync('she ticks it through, and can untick it', async () => {
  const d = db(); const c = await owner(d); const dani = await cleaner(d); visit(d);
  const made = await iss.onRequestPost({ request: send(dani, 'POST',
    { appointment_id: 'a1', category_label: 'Damage' }), env: env(d) });
  const id = (await made.json()).issue.id;

  await iss.onRequestPatch({ request: send(c, 'PATCH', { id, action: 'approve' }), env: env(d) });
  assert.ok(d._raw.prepare('SELECT approved_at FROM visit_issues WHERE id = ?').get(id).approved_at);

  await iss.onRequestPatch({ request: send(c, 'PATCH', { id, action: 'unapprove' }), env: env(d) });
  assert.equal(d._raw.prepare('SELECT approved_at FROM visit_issues WHERE id = ?')
    .get(id).approved_at, null, 'she will mis-tap, so it has to come back off');
});

await testAsync('telling them cannot happen before ticking it through', async () => {
  const d = db(); const c = await owner(d); visit(d);
  const made = await iss.onRequestPost({ request: send(c, 'POST',
    { appointment_id: 'a1', category_label: 'Damage' }), env: env(d) });
  const id = (await made.json()).issue.id;
  const res = await iss.onRequestPatch({ request: send(c, 'PATCH',
    { id, action: 'sent' }), env: env(d) });
  assert.equal(res.status, 409);
  assert.equal(d._raw.prepare('SELECT sent_at FROM visit_issues WHERE id = ?').get(id).sent_at, null);
});

await testAsync('approving and telling them are separate acts', async () => {
  const d = db(); const c = await owner(d); visit(d);
  const made = await iss.onRequestPost({ request: send(c, 'POST',
    { appointment_id: 'a1', category_label: 'Damage' }), env: env(d) });
  const id = (await made.json()).issue.id;
  await iss.onRequestPatch({ request: send(c, 'PATCH', { id, action: 'approve' }), env: env(d) });
  let row = d._raw.prepare('SELECT * FROM visit_issues WHERE id = ?').get(id);
  assert.ok(row.approved_at);
  assert.equal(row.sent_at, null, 'deciding they may be told is not telling them');
  await iss.onRequestPatch({ request: send(c, 'PATCH', { id, action: 'sent' }), env: env(d) });
  assert.ok(d._raw.prepare('SELECT sent_at FROM visit_issues WHERE id = ?').get(id).sent_at);
});

/* -------------------------------------------------------- who sees what */

await testAsync('a cleaner cannot report on somebody else’s visit', async () => {
  const d = db(); const c = await cleaner(d); visit(d, 'a1', 'someone-else');
  const res = await iss.onRequestPost({ request: send(c, 'POST',
    { appointment_id: 'a1', category_label: 'Damage' }), env: env(d) });
  assert.equal(res.status, 403);
});

await testAsync('a cleaner is not handed the whole review list', async () => {
  const d = db(); const c = await cleaner(d); const o = await owner(d);
  visit(d, 'a1', 'u-dani'); visit(d, 'a2', 'other');
  await iss.onRequestPost({ request: send(o, 'POST',
    { appointment_id: 'a2', category_label: 'Damage' }), env: env(d) });
  const res = await iss.onRequestGet({ request: get(c), env: env(d) });
  const body = await res.json();
  assert.equal(body.issues.length, 0, 'with no visit named, a cleaner gets nothing');
  assert.equal(body.can_approve, false);
});

await testAsync('her review list puts the urgent ones first', async () => {
  const d = db(); const c = await owner(d); visit(d);
  for (const s of ['note', 'urgent', 'attention']) {
    await iss.onRequestPost({ request: send(c, 'POST',
      { appointment_id: 'a1', category_label: 'Thing', severity: s }), env: env(d) });
  }
  const body = await (await iss.onRequestGet({ request: get(c), env: env(d) })).json();
  assert.deepEqual(body.issues.map((i) => i.severity), ['urgent', 'attention', 'note']);
  assert.equal(body.waiting, 3);
});

await testAsync('signed out, it answers 401', async () => {
  const d = db();
  const res = await iss.onRequestGet({
    request: new Request('https://x.test/api/admin/issues'), env: env(d) });
  assert.equal(res.status, 401);
});

await testAsync('it brings its own schema', async () => {
  const d = makeD1(['0011_schedule.sql', '0014_users.sql', '0009_settings.sql']);
  const c = await owner(d);
  const res = await iss.onRequestGet({ request: get(c), env: env(d) });
  assert.equal(res.status, 200);
  d._raw.prepare('SELECT 1 FROM visit_issues').get();   // throws if absent
});

console.log('\n' + n + ' passed');
