/* A cleaner's own calendar link: their jobs, not the whole book of work. */
import assert from 'node:assert/strict';
import { makeD1 } from './helpers/d1.mjs';
import { makeSessionCookie, hashPassword } from '../functions/_lib/auth.js';
import * as feed from '../functions/api/calendar/[token].js';
import * as users from '../functions/api/admin/users.js';

let n = 0;
const testAsync = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

const env = (d) => ({ DB: d, ADMIN_PASSWORD: 'x', SESSION_SECRET: 's'.repeat(32) });
const db = () => makeD1(['0011_schedule.sql', '0014_users.sql', '0009_settings.sql',
  '0024_feed_tokens.sql']);
const owner = async (d) => (await makeSessionCookie(env(d), false)).split(';')[0];
const uPatch = (c, b) => new Request('https://x.test/api/admin/users',
  { method: 'PATCH', headers: { Cookie: c, 'Content-Type': 'application/json' },
    body: JSON.stringify(b) });

async function person(d, id, role = 'cleaner') {
  const h = await hashPassword('pw');
  d._raw.prepare(`INSERT INTO users (id,created_at,name,email,role,password_hash,
    password_salt,iterations,active) VALUES (?,?,?,?,?,?,?,?,1)`)
    .run(id, '2026-11-01', id === 'u-dani' ? 'Dani Alvarez' : 'Sam Office',
      id + '@x.test', role, h.hash, h.salt, h.iterations);
}
function visit(d, id, assigned, day = '2026-11-20') {
  d._raw.prepare(`INSERT INTO appointments (id,created_at,status,all_day,start_at,end_at,
    customer_name,address,assigned_to) VALUES (?,?,'confirmed',0,?,?,?,?,?)`)
    .run(id, '2026-11-01', day + 'T14:00:00Z', day + 'T16:00:00Z',
      'Client ' + id, '12 Ocean Ave', assigned);
}
const fetchFeed = (d, token) => feed.onRequestGet({
  request: new Request('https://x.test/api/calendar/' + token),
  params: { token }, env: env(d) });

async function tokenFor(d, c, id) {
  const res = await users.onRequestPatch({
    request: uPatch(c, { id, action: 'feed_link' }), env: env(d) });
  return (await res.json()).feed_token;
}

await testAsync('a cleaner’s link carries their visits and nobody else’s', async () => {
  const d = db(); const c = await owner(d);
  await person(d, 'u-dani'); await person(d, 'u-other');
  visit(d, 'a1', 'u-dani'); visit(d, 'a2', 'u-other');

  const token = await tokenFor(d, c, 'u-dani');
  assert.ok(token && token.length >= 32, 'it has to be unguessable');

  const ics = await (await fetchFeed(d, token)).text();
  assert.ok(ics.includes('Client a1'), 'their own visit should be there');
  assert.ok(!ics.includes('Client a2'), 'somebody else’s must not be');
});

await testAsync('her own days off stay off a cleaner’s calendar', async () => {
  const d = db(); const c = await owner(d);
  await person(d, 'u-dani');
  visit(d, 'a1', 'u-dani');
  d._raw.prepare(`INSERT INTO availability_blocks (id,created_at,all_day,start_date,note)
    VALUES ('b1','2026-11-01',1,'2026-11-21','Dentist')`).run();

  const ics = await (await fetchFeed(d, await tokenFor(d, c, 'u-dani'))).text();
  assert.ok(ics.includes('Client a1'));
  assert.ok(!ics.includes('Dentist'), 'her diary is hers');
});

await testAsync('an office person with the run of the diary sees all of it', async () => {
  const d = db(); const c = await owner(d);
  await person(d, 'u-sam', 'staff_admin');
  visit(d, 'a1', 'u-dani'); visit(d, 'a2', 'u-sam');
  const ics = await (await fetchFeed(d, await tokenFor(d, c, 'u-sam'))).text();
  assert.ok(ics.includes('Client a1') && ics.includes('Client a2'));
});

await testAsync('every timed visit carries an alarm, so the phone rings', async () => {
  const d = db(); const c = await owner(d);
  await person(d, 'u-dani'); visit(d, 'a1', 'u-dani');
  const ics = await (await fetchFeed(d, await tokenFor(d, c, 'u-dani'))).text();
  assert.ok(ics.includes('BEGIN:VALARM'), 'a subscription cannot be pushed to; it can ring');
  assert.ok(ics.includes('TRIGGER:-PT1H'));
});

await testAsync('replacing the link stops the old one that moment', async () => {
  const d = db(); const c = await owner(d);
  await person(d, 'u-dani'); visit(d, 'a1', 'u-dani');
  const first = await tokenFor(d, c, 'u-dani');
  assert.equal((await fetchFeed(d, first)).status, 200);

  const second = await tokenFor(d, c, 'u-dani');
  assert.notEqual(first, second);
  assert.equal((await fetchFeed(d, first)).status, 404, 'the old link must stop working');
  assert.equal((await fetchFeed(d, second)).status, 200);
});

await testAsync('taking the link back leaves them with nothing to subscribe to', async () => {
  const d = db(); const c = await owner(d);
  await person(d, 'u-dani'); visit(d, 'a1', 'u-dani');
  const token = await tokenFor(d, c, 'u-dani');
  await users.onRequestPatch({ request: uPatch(c, { id: 'u-dani', action: 'feed_revoke' }),
    env: env(d) });
  assert.equal((await fetchFeed(d, token)).status, 404);
});

await testAsync('a switched-off person’s link stops working', async () => {
  const d = db(); const c = await owner(d);
  await person(d, 'u-dani'); visit(d, 'a1', 'u-dani');
  const token = await tokenFor(d, c, 'u-dani');
  d._raw.prepare('UPDATE users SET active = 0 WHERE id = ?').run('u-dani');
  assert.equal((await fetchFeed(d, token)).status, 404);
});

await testAsync('a made-up token is not a calendar', async () => {
  const d = db();
  assert.equal((await fetchFeed(d, 'a'.repeat(48))).status, 404);
});

console.log('\n' + n + ' passed');
