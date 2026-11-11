/* Hiding a button is tidiness. These are the gates that actually decide.
   The property under test: a cleaner with a valid login and the address bar
   cannot read money, the client list or the settings -- and the owner is
   refused nothing. */
import assert from 'node:assert/strict';
import { makeD1 } from './helpers/d1.mjs';
import { hashPassword, makeSessionCookie } from '../functions/_lib/auth.js';

import * as quotes from '../functions/api/admin/quotes.js';
import * as pipeline from '../functions/api/admin/pipeline.js';
import * as leads from '../functions/api/admin/leads.js';
import * as customers from '../functions/api/admin/customers.js';
import * as profile from '../functions/api/admin/customers/[id].js';
import * as settings from '../functions/api/admin/settings.js';
import * as email from '../functions/api/admin/email.js';
import * as feed from '../functions/api/admin/schedule/feed.js';
import * as schedule from '../functions/api/admin/schedule.js';

let n = 0;
const testAsync = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

const SECRET = 'role-gate-secret';
function db() {
  /* The real migrations, so assigned_to and the users table are exactly
     what production will have rather than a hand-rolled approximation. */
  const d = makeD1(['0011_schedule.sql', '0012_email_log.sql', '0014_users.sql']);
  d._raw.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)`);
  d._raw.exec(`CREATE TABLE customers (id TEXT PRIMARY KEY, created_at TEXT, name TEXT,
    company TEXT, phone TEXT, email TEXT, notes TEXT, archived_at TEXT)`);
  d._raw.exec(`CREATE TABLE properties (id TEXT PRIMARY KEY, customer_id TEXT, created_at TEXT,
    label TEXT, address TEXT, city TEXT, access TEXT, notes TEXT, archived_at TEXT,
    parking TEXT, pets TEXT, preferred_day TEXT)`);
  d._raw.exec(`CREATE TABLE leads (id TEXT PRIMARY KEY, created_at TEXT, customer_id TEXT,
    name TEXT, email TEXT, service TEXT, service_label TEXT, city TEXT, status TEXT,
    archived_at TEXT, followup TEXT)`);
  d._raw.exec(`CREATE TABLE quotes (id TEXT PRIMARY KEY, lead_id TEXT, created_at TEXT,
    status TEXT, total INTEGER, sent_at TEXT, accepted_at TEXT, paid_at TEXT, archived_at TEXT)`);
  return d;
}
const env = (d) => ({ DB: d, SESSION_SECRET: SECRET, ADMIN_PASSWORD: 'shared' });

async function who(d, role) {
  if (role === 'owner') return (await makeSessionCookie(env(d), false)).split(';')[0];
  const h = await hashPassword('pw');
  const id = 'u-' + role;
  d._raw.prepare(`INSERT OR REPLACE INTO users (id,created_at,name,email,role,password_hash,
    password_salt,iterations,active) VALUES (?,?,?,?,?,?,?,?,1)`)
    .run(id, '2026-11-11', role, role + '@x.test', role, h.hash, h.salt, h.iterations);
  return (await makeSessionCookie(env(d), false, id)).split(';')[0];
}
const get = (cookie, url = 'https://x.test/api/x') =>
  new Request(url, { headers: { Cookie: cookie } });
const send = (cookie, body) => new Request('https://x.test/api/x',
  { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(body) });

/* The thing that must never regress: staff change nothing for Kristina. */
await testAsync('the owner is refused nothing', async () => {
  const d = db(); const c = await who(d, 'owner');
  for (const [name, call] of [
    ['quotes', () => quotes.onRequestGet({ request: get(c), env: env(d) })],
    ['pipeline', () => pipeline.onRequestGet({ request: get(c, 'https://x.test/api/admin/pipeline?stage=pending'), env: env(d) })],
    ['leads', () => leads.onRequestGet({ request: get(c), env: env(d) })],
    ['customers', () => customers.onRequestGet({ request: get(c), env: env(d) })],
    ['settings', () => settings.onRequestGet({ request: get(c), env: env(d) })],
    ['email log', () => email.onRequestGet({ request: get(c, 'https://x.test/api/admin/email?entity_kind=lead&entity_id=l1'), env: env(d) })],
    ['calendar feed', () => feed.onRequestGet({ request: get(c), env: env(d) })],
    ['schedule', () => schedule.onRequestGet({ request: get(c, 'https://x.test/api/admin/schedule'), env: env(d) })]
  ]) {
    const r = await call();
    assert.notEqual(r.status, 403, name + ' refused the owner');
    assert.notEqual(r.status, 401, name + ' did not recognise the owner');
  }
});

await testAsync('a cleaner cannot reach money, however they ask', async () => {
  const d = db(); const c = await who(d, 'cleaner');
  for (const [name, call] of [
    ['quotes', () => quotes.onRequestGet({ request: get(c), env: env(d) })],
    ['pipeline', () => pipeline.onRequestGet({ request: get(c, 'https://x.test/api/admin/pipeline?stage=pending'), env: env(d) })]
  ]) {
    const r = await call();
    assert.equal(r.status, 403, name + ' let a cleaner in');
  }
});

await testAsync('a cleaner cannot read the client list or a client profile', async () => {
  const d = db(); const c = await who(d, 'cleaner');
  assert.equal((await customers.onRequestGet({ request: get(c), env: env(d) })).status, 403);
  assert.equal((await leads.onRequestGet({ request: get(c), env: env(d) })).status, 403);
  assert.equal((await profile.onRequestGet({ request: get(c), env: env(d), params: { id: 'c1' } })).status, 403);
});

await testAsync('a cleaner cannot touch the settings or send a letter', async () => {
  const d = db(); const c = await who(d, 'cleaner');
  assert.equal((await settings.onRequestGet({ request: get(c), env: env(d) })).status, 403);
  assert.equal((await email.onRequestPost({
    request: send(c, { kind: 'on_my_way', entity_id: 'a1', send: true }), env: env(d) })).status, 403);
});

await testAsync('a cleaner cannot take the calendar feed link', async () => {
  const d = db(); const c = await who(d, 'cleaner');
  assert.equal((await feed.onRequestGet({ request: get(c), env: env(d) })).status, 403);
});

/* A staff admin runs the diary and the client list, but not the money. */
await testAsync('a staff admin sees clients and the diary, never the money', async () => {
  const d = db(); const c = await who(d, 'staff_admin');
  assert.equal((await customers.onRequestGet({ request: get(c), env: env(d) })).status, 200);
  assert.notEqual((await schedule.onRequestGet({
    request: get(c, 'https://x.test/api/admin/schedule'), env: env(d) })).status, 403);
  assert.equal((await quotes.onRequestGet({ request: get(c), env: env(d) })).status, 403);
  assert.equal((await pipeline.onRequestGet({
    request: get(c, 'https://x.test/api/admin/pipeline?stage=pending'), env: env(d) })).status, 403);
  assert.equal((await settings.onRequestGet({ request: get(c), env: env(d) })).status, 403);
});

/* ------------------------------------------------- the diary, scoped */

await testAsync('a cleaner sees her own visits and nobody else’s', async () => {
  const d = db(); const c = await who(d, 'cleaner');
  const ins = (id, assigned) => d._raw.prepare(`INSERT INTO appointments
    (id,created_at,status,all_day,start_at,end_at,customer_name,assigned_to)
    VALUES (?,?,'confirmed',0,?,?,?,?)`).run(id, '2026-11-11',
      '2026-11-20T14:00:00Z', '2026-11-20T16:00:00Z', 'Someone', assigned);
  ins('a-mine', 'u-cleaner');
  ins('a-theirs', 'u-other');
  ins('a-nobody', null);
  d._raw.prepare(`INSERT INTO availability_blocks (id,created_at,note,all_day,start_at,end_at,skip_dates)
    VALUES ('b1','2026-11-11','Dentist',0,'2026-11-20T18:00:00Z','2026-11-20T19:00:00Z','[]')`).run();

  const b = await (await schedule.onRequestGet({
    request: get(c, 'https://x.test/api/admin/schedule?from=2026-11-01&to=2026-11-30'),
    env: env(d) })).json();
  assert.deepEqual(b.appointments.map((a) => a.id), ['a-mine']);
  assert.deepEqual(b.blocks, [], 'the owner’s blocked time is not hers to see');
  assert.equal(b.mine_only, true);
});

await testAsync('the owner sees all of it, including the blocks', async () => {
  const d = db(); const c = await who(d, 'owner');
  d._raw.prepare(`INSERT INTO appointments (id,created_at,status,all_day,start_at,end_at,assigned_to)
    VALUES ('a1','2026-11-11','confirmed',0,'2026-11-20T14:00:00Z','2026-11-20T16:00:00Z','u-other')`).run();
  d._raw.prepare(`INSERT INTO availability_blocks (id,created_at,note,all_day,start_at,end_at,skip_dates)
    VALUES ('b1','2026-11-11','Dentist',0,'2026-11-20T18:00:00Z','2026-11-20T19:00:00Z','[]')`).run();
  const b = await (await schedule.onRequestGet({
    request: get(c, 'https://x.test/api/admin/schedule?from=2026-11-01&to=2026-11-30'),
    env: env(d) })).json();
  assert.equal(b.appointments.length, 1);
  assert.equal(b.blocks.length, 1);
  assert.equal(b.mine_only, false);
});

await testAsync('a cleaner cannot book, move or cancel anything', async () => {
  const d = db(); const c = await who(d, 'cleaner');
  assert.equal((await schedule.onRequestPost({
    request: send(c, { customer_name: 'X', start_at: '2026-11-20T14:00:00Z',
      end_at: '2026-11-20T16:00:00Z' }), env: env(d) })).status, 403);
  assert.equal((await schedule.onRequestPatch({
    request: send(c, { id: 'a1', status: 'cancelled' }), env: env(d) })).status, 403);
});

await testAsync('signed out is 401 everywhere, not 403', async () => {
  const d = db();
  const bare = new Request('https://x.test/api/x');
  assert.equal((await quotes.onRequestGet({ request: bare, env: env(d) })).status, 401);
  assert.equal((await customers.onRequestGet({ request: bare, env: env(d) })).status, 401);
  assert.equal((await settings.onRequestGet({ request: bare, env: env(d) })).status, 401);
});

/* ----------------------------------------------- what the screen offers */
import { readFileSync } from 'node:fs';
const JS = readFileSync(new URL('../public/js/admin.js', import.meta.url), 'utf8');

await testAsync('the screen offers no door that the server keeps locked', async () => {
  assert.match(JS, /var VIEW_NEEDS = \{/);
  assert.match(JS, /function visibleViews\(\)/);
  // every money view is gated, and the client views too
  for (const v of ['quotes', 'pending', 'accepted', 'paid']) {
    assert.match(JS, new RegExp(v + ": 'money'"));
  }
  assert.match(JS, /settings: 'settings'/);
  // the diary is deliberately ungated: a cleaner needs it
  assert.ok(!/schedule: '/.test(JS.slice(JS.indexOf('var VIEW_NEEDS'), JS.indexOf('function visibleViews'))));
});

await testAsync('a login parked on a view it may not see is moved, not stranded', async () => {
  assert.match(JS, /VIEW_NEEDS\[state\.view\] && !state\.can\[VIEW_NEEDS\[state\.view\]\]/);
  assert.match(JS, /state\.view = 'schedule'/);
});

await testAsync('a hidden tab is still only tidiness, never the lock', async () => {
  // the client is not where the decision is made: the routes all gate again
  const guarded = (JS.match(/data-view=/g) || []).length;
  assert.ok(guarded > 0);
  const routes = readFileSync(new URL('../functions/_lib/guard.js', import.meta.url), 'utf8');
  assert.match(routes, /Hiding a button is tidiness, not security/);
});

console.log('\n' + n + ' passed');
