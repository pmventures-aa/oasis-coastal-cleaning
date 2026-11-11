/* The Security Centre: who can get in, what has been tried, and being able
   to end a session that is already out there. */
import assert from 'node:assert/strict';
import { makeD1 } from './helpers/d1.mjs';
import { makeSessionCookie, hashPassword, currentUser } from '../functions/_lib/auth.js';
import { logSecurity, recentSecurity, ipOf } from '../functions/_lib/security.js';
import * as sec from '../functions/api/admin/security.js';
import * as login from '../functions/api/admin/login.js';

let n = 0;
const testAsync = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

function db() {
  const d = makeD1(['0011_schedule.sql', '0014_users.sql', '0009_settings.sql',
    '0020_security.sql']);
  return d;
}
const env = (d) => ({ DB: d, ADMIN_PASSWORD: 'shared-pass', SESSION_SECRET: 's'.repeat(32) });
const owner = async (d) => (await makeSessionCookie(env(d), false)).split(';')[0];
const req = (c, m, b) => new Request('https://x.test/api/admin/security', m === 'GET'
  ? { headers: { Cookie: c } }
  : { method: m, headers: { Cookie: c, 'Content-Type': 'application/json' },
      body: JSON.stringify(b) });

async function addPerson(d, email, password, role = 'cleaner') {
  const made = await hashPassword(password);
  d._raw.exec(`INSERT INTO users (id, created_at, name, email, role,
    password_hash, password_salt, iterations, active)
    VALUES ('u-${email.replace(/\W/g, '')}', '2026-11-01', 'Dani', '${email}',
      '${role}', '${made.hash}', '${made.salt}', ${made.iterations}, 1)`);
  return 'u-' + email.replace(/\W/g, '');
}

/* ------------------------------------------------------------- the log */

await testAsync('a refused sign-in is recorded with the address as typed', async () => {
  const d = db();
  await login.onRequestPost({
    request: new Request('https://x.test/api/admin/login', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
      body: JSON.stringify({ email: 'nobody@oasis.test', password: 'guess' }) }),
    env: env(d) });
  const rows = await recentSecurity(d);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'sign_in_failed');
  assert.equal(rows[0].email, 'nobody@oasis.test');
  assert.equal(rows[0].detail, 'no such person');
  assert.equal(rows[0].ip, '203.0.113.9');
});

await testAsync('the log never holds the password that was tried', async () => {
  const d = db();
  await addPerson(d, 'dani@oasis.test', 'correct-horse-battery');
  await login.onRequestPost({
    request: new Request('https://x.test/api/admin/login', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dani@oasis.test', password: 'hunter2-secret' }) }),
    env: env(d) });
  const all = JSON.stringify(await recentSecurity(d));
  assert.ok(!all.includes('hunter2-secret'), 'a tried password must never be stored');
  assert.ok(all.includes('wrong password'));
});

await testAsync('a good sign-in is recorded too', async () => {
  const d = db();
  await addPerson(d, 'dani@oasis.test', 'correct-horse-battery');
  await login.onRequestPost({
    request: new Request('https://x.test/api/admin/login', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dani@oasis.test', password: 'correct-horse-battery' }) }),
    env: env(d) });
  const rows = await recentSecurity(d);
  assert.equal(rows[0].kind, 'sign_in');
});

/* --------------------------------------------------- signing people out */

await testAsync('signing everyone out stops a session already issued', async () => {
  const d = db();
  const cookie = await owner(d);
  const asRequest = () => new Request('https://x.test/api/admin/x',
    { headers: { Cookie: cookie } });

  assert.ok(await currentUser(asRequest(), env(d)), 'signed in to start with');

  /* The line is set to now; the cookie above was issued a moment earlier. */
  await new Promise((r) => setTimeout(r, 5));
  const res = await sec.onRequestPatch({ request: req(cookie, 'PATCH',
    { action: 'revoke_all' }), env: env(d) });
  assert.equal(res.status, 200);

  assert.equal(await currentUser(asRequest(), env(d)), null,
    'the old cookie must stop working');
});

await testAsync('one person can be signed out without touching anyone else', async () => {
  const d = db();
  const id = await addPerson(d, 'dani@oasis.test', 'correct-horse-battery');
  const theirs = (await makeSessionCookie(env(d), false, id)).split(';')[0];
  const ownerCookie = await owner(d);
  const asThem = () => new Request('https://x.test/api/admin/x',
    { headers: { Cookie: theirs } });
  const asOwner = () => new Request('https://x.test/api/admin/x',
    { headers: { Cookie: ownerCookie } });

  assert.ok(await currentUser(asThem(), env(d)));
  await new Promise((r) => setTimeout(r, 5));
  await sec.onRequestPatch({ request: req(ownerCookie, 'PATCH',
    { action: 'revoke_user', user_id: id }), env: env(d) });

  assert.equal(await currentUser(asThem(), env(d)), null, 'they are out');
  assert.ok(await currentUser(asOwner(), env(d)), 'she is still in');
});

/* ------------------------------------------------------------ passwords */

await testAsync('changing a password needs the current one', async () => {
  const d = db();
  const id = await addPerson(d, 'dani@oasis.test', 'correct-horse-battery', 'owner');
  const c = (await makeSessionCookie(env(d), false, id)).split(';')[0];
  const res = await sec.onRequestPatch({ request: req(c, 'PATCH',
    { action: 'password', current: 'wrong', password: 'a-much-longer-one' }),
    env: env(d) });
  assert.equal(res.status, 401);
});

await testAsync('a changed password signs the old sessions out', async () => {
  const d = db();
  const id = await addPerson(d, 'dani@oasis.test', 'correct-horse-battery', 'owner');
  const c = (await makeSessionCookie(env(d), false, id)).split(';')[0];
  await new Promise((r) => setTimeout(r, 5));
  const res = await sec.onRequestPatch({ request: req(c, 'PATCH',
    { action: 'password', current: 'correct-horse-battery',
      password: 'a-much-longer-one' }), env: env(d) });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).signed_out, true);
  assert.equal(await currentUser(new Request('https://x.test/api/admin/x',
    { headers: { Cookie: c } }), env(d)), null,
    'if it was changed because someone else had it, they must be out');
});

await testAsync('a short password is refused', async () => {
  const d = db();
  const id = await addPerson(d, 'dani@oasis.test', 'correct-horse-battery', 'owner');
  const c = (await makeSessionCookie(env(d), false, id)).split(';')[0];
  const res = await sec.onRequestPatch({ request: req(c, 'PATCH',
    { action: 'password', current: 'correct-horse-battery', password: 'short' }),
    env: env(d) });
  assert.equal(res.status, 400);
});

await testAsync('the shared-password owner is told why she has no password to change',
  async () => {
    const d = db();
    const c = await owner(d);
    const res = await sec.onRequestPatch({ request: req(c, 'PATCH',
      { action: 'password', current: 'x', password: 'a-much-longer-one' }),
      env: env(d) });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /shared password/i);
  });

/* ---------------------------------------------------------------- gates */

await testAsync('a cleaner cannot see the security screen', async () => {
  const d = db();
  const id = await addPerson(d, 'dani@oasis.test', 'correct-horse-battery', 'cleaner');
  const c = (await makeSessionCookie(env(d), false, id)).split(';')[0];
  const res = await sec.onRequestGet({ request: req(c, 'GET'), env: env(d) });
  assert.equal(res.status, 403);
});

await testAsync('signed out, it answers 401', async () => {
  const d = db();
  const res = await sec.onRequestGet({
    request: new Request('https://x.test/api/admin/security'), env: env(d) });
  assert.equal(res.status, 401);
});

await testAsync('the screen reports the refusals of the last day', async () => {
  const d = db();
  const c = await owner(d);
  for (let i = 0; i < 3; i++) {
    await logSecurity(env(d), new Request('https://x.test/'), 'sign_in_failed',
      { email: 'info@oasiscoastalcleaning.com' });
  }
  const res = await sec.onRequestGet({ request: req(c, 'GET'), env: env(d) });
  const body = await res.json();
  assert.equal(body.failed_today, 3);
  assert.equal(body.shared_password_active, true);
  assert.equal(body.you.shared, true);
});

/* ------------------------------------- before the migration has been run */

await testAsync('a named person still signs in before 0020 is applied', async () => {
  /* The column arrives with 0020. This database has the users table but
     not that column, which is exactly what production looks like between
     a deploy and the migration being run. Reading it threw, and a throw
     used to mean "not signed in", so shipping this would have locked every
     named person out of a live portal. */
  const d = makeD1(['0011_schedule.sql', '0014_users.sql', '0009_settings.sql']);
  const id = await addPerson(d, 'dani@oasis.test', 'correct-horse-battery');
  const c = (await makeSessionCookie(env(d), false, id)).split(';')[0];
  const who = await currentUser(new Request('https://x.test/api/admin/x',
    { headers: { Cookie: c } }), env(d));
  assert.ok(who, 'they must still be signed in');
  assert.equal(who.email, 'dani@oasis.test');
});

await testAsync('the screen brings its own schema with it', async () => {
  /* The database as production has it: everything up to 0018 and nothing
     after. The route used to fall back to ensureScheduleTables, which only
     knows the schedule tables, never touches columns, and returned true
     regardless -- so the screen sailed past its own check and then failed
     on a table that was never created. */
  const d = makeD1(['0011_schedule.sql', '0014_users.sql', '0009_settings.sql']);
  let had = true;
  try { d._raw.prepare('SELECT 1 FROM security_events').get(); } catch { had = false; }
  assert.equal(had, false, 'it must start without the table');

  const c = await owner(d);
  const res = await sec.onRequestGet({ request: req(c, 'GET'), env: env(d) });
  assert.equal(res.status, 200, 'it should set itself up and answer');
  const body = await res.json();
  assert.equal(body.ok, true);
  d._raw.prepare('SELECT 1 FROM security_events').get();   // throws if absent
  d._raw.prepare('SELECT sessions_valid_from FROM users').get();
});

console.log('\n' + n + ' passed');
