/* Named people alongside the shared password.
   The property under test throughout: adding users must not take anything
   away from Kristina, and a cleaner must not become an owner by any route. */
import assert from 'node:assert/strict';
import { makeD1 } from './helpers/d1.mjs';
import {
  hashPassword, verifyPassword, makeSessionCookie, currentUser,
  isSignedIn, can, OWNER, PBKDF2_ITERATIONS
} from '../functions/_lib/auth.js';
import * as login from '../functions/api/admin/login.js';

let n = 0;
const testAsync = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

const SECRET = 'test-session-secret-for-users';
const env = (d, extra = {}) => ({ DB: d, SESSION_SECRET: SECRET,
  ADMIN_PASSWORD: 'the-shared-one', ...extra });

function db() {
  const d = makeD1(['0011_schedule.sql']);
  d._raw.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, created_at TEXT, updated_at TEXT,
    name TEXT, email TEXT, phone TEXT, role TEXT DEFAULT 'cleaner',
    password_hash TEXT, password_salt TEXT, iterations INTEGER DEFAULT 600000,
    active INTEGER DEFAULT 1, last_seen_at TEXT, created_by TEXT)`);
  return d;
}
async function addUser(d, { id, name, email, role, password, active = 1 }) {
  const h = await hashPassword(password);
  d._raw.prepare(`INSERT INTO users (id,created_at,name,email,role,password_hash,
    password_salt,iterations,active) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, '2026-11-11', name, email, role, h.hash, h.salt, h.iterations, active);
}
const req = (cookie) => new Request('https://x.test/x',
  cookie ? { headers: { Cookie: cookie } } : {});
const post = (body) => new Request('https://x.test/api/admin/login',
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const cookieFrom = (res) => (res.headers.get('Set-Cookie') || '').split(';')[0];

/* ----------------------------------------------------------- passwords */

await testAsync('a password never round-trips in the clear', async () => {
  const h = await hashPassword('correct horse battery staple');
  assert.ok(!h.hash.includes('horse'));
  assert.equal(h.iterations, PBKDF2_ITERATIONS);
  assert.ok(h.salt.length >= 20 && h.hash.length >= 40);
});

await testAsync('the same password hashes differently for two people', async () => {
  const a = await hashPassword('same-password');
  const b = await hashPassword('same-password');
  assert.notEqual(a.salt, b.salt, 'each gets its own salt');
  assert.notEqual(a.hash, b.hash, 'so a stolen table cannot be grouped by hash');
});

await testAsync('verify accepts the right password and refuses the rest', async () => {
  const h = await hashPassword('letmein-please');
  const row = { password_hash: h.hash, password_salt: h.salt, iterations: h.iterations };
  assert.equal(await verifyPassword('letmein-please', row), true);
  assert.equal(await verifyPassword('letmein-pleas', row), false);
  assert.equal(await verifyPassword('', row), false);
  assert.equal(await verifyPassword('letmein-please', {}), false);
});

/* ------------------------------------------------------------ sessions */

/* Shipping this must not sign her out of a session she already has. */
await testAsync('a session issued before users existed still works, as the owner', async () => {
  const d = db();
  const legacy = await makeSessionCookie(env(d), false);        // no user id: the old shape
  const value = legacy.split(';')[0];
  assert.equal(await isSignedIn(req(value), env(d)), true);
  const who = await currentUser(req(value), env(d));
  assert.equal(who.role, 'owner');
  assert.equal(who.shared, true);
});

await testAsync('a named session says who it is', async () => {
  const d = db();
  await addUser(d, { id: 'u1', name: 'Dani', email: 'dani@x.test', role: 'cleaner', password: 'pw' });
  const value = (await makeSessionCookie(env(d), false, 'u1')).split(';')[0];
  const who = await currentUser(req(value), env(d));
  assert.equal(who.id, 'u1');
  assert.equal(who.name, 'Dani');
  assert.equal(who.role, 'cleaner');
});

/* The payload contains colons; splitting on the first dot would break it. */
await testAsync('a named cookie survives the signature split', async () => {
  const d = db();
  await addUser(d, { id: 'u1', name: 'Dani', email: 'd@x.test', role: 'cleaner', password: 'pw' });
  const value = (await makeSessionCookie(env(d), false, 'u1')).split(';')[0];
  assert.ok(value.includes('u:u1:'), 'the id really is in there');
  assert.equal(await isSignedIn(req(value), env(d)), true);
});

await testAsync('a tampered cookie is nobody', async () => {
  const d = db();
  await addUser(d, { id: 'u1', name: 'Dani', email: 'd@x.test', role: 'cleaner', password: 'pw' });
  const good = (await makeSessionCookie(env(d), false, 'u1')).split(';')[0];
  // swap the id for the owner's, keeping the signature
  const forged = good.replace('u:u1:', 'u:owner:');
  assert.equal(await currentUser(req(forged), env(d)), null);
  // and a mangled signature
  assert.equal(await currentUser(req(good.slice(0, -2) + 'xy'), env(d)), null);
});

/* Switching someone off has to bite immediately, not when their session ends. */
await testAsync('switching someone off ends their access on the next request', async () => {
  const d = db();
  await addUser(d, { id: 'u1', name: 'Dani', email: 'd@x.test', role: 'cleaner', password: 'pw' });
  const value = (await makeSessionCookie(env(d), false, 'u1')).split(';')[0];
  assert.ok(await currentUser(req(value), env(d)));
  d._raw.prepare(`UPDATE users SET active = 0 WHERE id='u1'`).run();
  assert.equal(await currentUser(req(value), env(d)), null);
});

await testAsync('a role change bites on the next request too', async () => {
  const d = db();
  await addUser(d, { id: 'u1', name: 'Dani', email: 'd@x.test', role: 'cleaner', password: 'pw' });
  const value = (await makeSessionCookie(env(d), false, 'u1')).split(';')[0];
  d._raw.prepare(`UPDATE users SET role = 'staff_admin' WHERE id='u1'`).run();
  assert.equal((await currentUser(req(value), env(d))).role, 'staff_admin');
});

await testAsync('an unknown role is treated as the least powerful one', async () => {
  const d = db();
  await addUser(d, { id: 'u1', name: 'X', email: 'x@x.test', role: 'wizard', password: 'pw' });
  const value = (await makeSessionCookie(env(d), false, 'u1')).split(';')[0];
  assert.equal((await currentUser(req(value), env(d))).role, 'cleaner');
});

/* --------------------------------------------------------------- login */

await testAsync('the shared password still signs her in as the owner', async () => {
  const d = db();
  const res = await login.onRequestPost({ request: post({ password: 'the-shared-one' }), env: env(d) });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).role, 'owner');
  const who = await currentUser(req(cookieFrom(res)), env(d));
  assert.equal(who.role, 'owner');
});

await testAsync('a named person signs in with their own password', async () => {
  const d = db();
  await addUser(d, { id: 'u1', name: 'Dani', email: 'dani@x.test', role: 'cleaner', password: 'dani-pw' });
  const res = await login.onRequestPost({
    request: post({ email: 'dani@x.test', password: 'dani-pw' }), env: env(d) });
  assert.equal(res.status, 200);
  const b = await res.json();
  assert.equal(b.role, 'cleaner');
  assert.equal((await currentUser(req(cookieFrom(res)), env(d))).id, 'u1');
});

/* The shared password must not let anyone in as somebody else. */
await testAsync('the shared password cannot be used against an email', async () => {
  const d = db();
  await addUser(d, { id: 'u1', name: 'Dani', email: 'dani@x.test', role: 'cleaner', password: 'dani-pw' });
  const res = await login.onRequestPost({
    request: post({ email: 'dani@x.test', password: 'the-shared-one' }), env: env(d) });
  assert.equal(res.status, 401);
});

await testAsync('a switched-off person cannot sign in at all', async () => {
  const d = db();
  await addUser(d, { id: 'u1', name: 'Gone', email: 'gone@x.test', role: 'cleaner',
    password: 'pw', active: 0 });
  const res = await login.onRequestPost({
    request: post({ email: 'gone@x.test', password: 'pw' }), env: env(d) });
  assert.equal(res.status, 401);
});

await testAsync('an unknown address answers exactly like a wrong password', async () => {
  const d = db();
  await addUser(d, { id: 'u1', name: 'Dani', email: 'dani@x.test', role: 'cleaner', password: 'pw' });
  const a = await login.onRequestPost({ request: post({ email: 'nobody@x.test', password: 'pw' }), env: env(d) });
  const b = await login.onRequestPost({ request: post({ email: 'dani@x.test', password: 'wrong' }), env: env(d) });
  assert.equal(a.status, b.status);
  assert.deepEqual(await a.json(), await b.json(), 'the form must not reveal who exists');
});

await testAsync('signing in records that they did, without blocking them', async () => {
  const d = db();
  await addUser(d, { id: 'u1', name: 'Dani', email: 'dani@x.test', role: 'cleaner', password: 'pw' });
  await login.onRequestPost({ request: post({ email: 'dani@x.test', password: 'pw' }), env: env(d) });
  const row = await d.prepare('SELECT last_seen_at FROM users WHERE id = ?').bind('u1').first();
  assert.ok(row.last_seen_at);
});

/* ---------------------------------------------------------- what they may */

await testAsync('the approved matrix is what the server actually enforces', async () => {
  const owner = OWNER;
  const admin = { role: 'staff_admin' };
  const cleaner = { role: 'cleaner' };
  for (const [what, expect] of Object.entries({
    money:            [true, false, false],
    everyoneSchedule: [true, true,  false],
    clientList:       [true, true,  false],
    sendMail:         [true, false, false],
    manageUsers:      [true, false, false],
    priceBook:        [true, false, false]
  })) {
    assert.equal(can(owner, what), expect[0], 'owner ' + what);
    assert.equal(can(admin, what), expect[1], 'staff_admin ' + what);
    assert.equal(can(cleaner, what), expect[2], 'cleaner ' + what);
  }
  assert.equal(can(null, 'money'), false, 'nobody may do anything');
  assert.equal(can({ role: 'made-up' }, 'money'), false);
});

/* ------------------------------------------------- adding and removing */
import * as users from '../functions/api/admin/users.js';

const asOwner = async (d) => (await makeSessionCookie(env(d), false)).split(';')[0];
const uGet = (c) => new Request('https://x.test/api/admin/users', { headers: { Cookie: c } });
const uSend = (c, method, body) => new Request('https://x.test/api/admin/users',
  { method, headers: { Cookie: c, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

await testAsync('she can add someone, and never sees their password again', async () => {
  const d = db(); const c = await asOwner(d);
  const r = await users.onRequestPost({ request: uSend(c, 'POST',
    { name: 'Dani', email: 'dani@x.test', role: 'cleaner', password: 'a-good-password' }), env: env(d) });
  assert.equal(r.status, 201);
  const b = await r.json();
  assert.equal(b.user.name, 'Dani');
  const text = JSON.stringify(b);
  assert.ok(!text.includes('a-good-password'));
  assert.ok(!text.includes('password_hash') && !text.includes('password_salt'));
});

await testAsync('the list never carries a hash either', async () => {
  const d = db(); const c = await asOwner(d);
  await addUser(d, { id: 'u1', name: 'Dani', email: 'd@x.test', role: 'cleaner', password: 'pw' });
  const b = await (await users.onRequestGet({ request: uGet(c), env: env(d) })).json();
  const text = JSON.stringify(b);
  assert.ok(!text.includes('password_hash') && !text.includes('password_salt'));
  assert.equal(b.users[0].name, 'Dani');
});

await testAsync('two people cannot share a sign-in address', async () => {
  const d = db(); const c = await asOwner(d);
  await addUser(d, { id: 'u1', name: 'Dani', email: 'dani@x.test', role: 'cleaner', password: 'pw' });
  const r = await users.onRequestPost({ request: uSend(c, 'POST',
    { name: 'Other', email: 'DANI@x.test', role: 'cleaner', password: 'another-password' }), env: env(d) });
  assert.equal(r.status, 409, 'and the check ignores case');
});

await testAsync('a too-short password is refused before anything is written', async () => {
  const d = db(); const c = await asOwner(d);
  const r = await users.onRequestPost({ request: uSend(c, 'POST',
    { name: 'Dani', email: 'dani@x.test', role: 'cleaner', password: 'short' }), env: env(d) });
  assert.equal(r.status, 400);
  assert.equal((await d.prepare('SELECT * FROM users').all()).results.length, 0);
});

await testAsync('an unknown role lands as a cleaner, not as an owner', async () => {
  const d = db(); const c = await asOwner(d);
  const b = await (await users.onRequestPost({ request: uSend(c, 'POST',
    { name: 'X', email: 'x@x.test', role: 'owner-ish', password: 'a-good-password' }), env: env(d) })).json();
  assert.equal(b.user.role, 'cleaner');
});

/* The lock-out guard. */
await testAsync('the only owner cannot be demoted or switched off', async () => {
  const d = db(); const c = await asOwner(d);
  await addUser(d, { id: 'o1', name: 'Kristina', email: 'k@x.test', role: 'owner', password: 'pw' });
  const demote = await users.onRequestPatch({ request: uSend(c, 'PATCH',
    { id: 'o1', role: 'cleaner' }), env: env(d) });
  assert.equal(demote.status, 409);
  const off = await users.onRequestPatch({ request: uSend(c, 'PATCH',
    { id: 'o1', active: false }), env: env(d) });
  assert.equal(off.status, 409);
  const still = await d.prepare('SELECT role, active FROM users WHERE id = ?').bind('o1').first();
  assert.equal(still.role, 'owner');
  assert.equal(still.active, 1);
});

await testAsync('with a second owner, the first may step down', async () => {
  const d = db(); const c = await asOwner(d);
  await addUser(d, { id: 'o1', name: 'Kristina', email: 'k@x.test', role: 'owner', password: 'pw' });
  await addUser(d, { id: 'o2', name: 'Second', email: 's@x.test', role: 'owner', password: 'pw' });
  const r = await users.onRequestPatch({ request: uSend(c, 'PATCH',
    { id: 'o1', role: 'staff_admin' }), env: env(d) });
  assert.equal(r.status, 200);
});

await testAsync('switching someone off keeps their name on what they did', async () => {
  const d = db(); const c = await asOwner(d);
  await addUser(d, { id: 'u1', name: 'Dani', email: 'd@x.test', role: 'cleaner', password: 'pw' });
  await users.onRequestPatch({ request: uSend(c, 'PATCH', { id: 'u1', active: false }), env: env(d) });
  const row = await d.prepare('SELECT * FROM users WHERE id = ?').bind('u1').first();
  assert.equal(row.active, 0);
  assert.equal(row.name, 'Dani', 'switched off, not deleted');
});

await testAsync('a reset password works and the old one stops', async () => {
  const d = db(); const c = await asOwner(d);
  await addUser(d, { id: 'u1', name: 'Dani', email: 'dani@x.test', role: 'cleaner', password: 'old-password' });
  await users.onRequestPatch({ request: uSend(c, 'PATCH',
    { id: 'u1', password: 'brand-new-password' }), env: env(d) });
  const oldTry = await login.onRequestPost({
    request: post({ email: 'dani@x.test', password: 'old-password' }), env: env(d) });
  assert.equal(oldTry.status, 401);
  const newTry = await login.onRequestPost({
    request: post({ email: 'dani@x.test', password: 'brand-new-password' }), env: env(d) });
  assert.equal(newTry.status, 200);
});

await testAsync('nobody but an owner can see or change who has a login', async () => {
  const d = db();
  for (const role of ['cleaner', 'staff_admin']) {
    const h = await hashPassword('pw');
    d._raw.prepare(`INSERT INTO users (id,created_at,name,email,role,password_hash,password_salt,
      iterations,active) VALUES (?,?,?,?,?,?,?,?,1)`)
      .run('x-' + role, '2026-11-11', role, role + '@x.test', role, h.hash, h.salt, h.iterations);
    const c = (await makeSessionCookie(env(d), false, 'x-' + role)).split(';')[0];
    assert.equal((await users.onRequestGet({ request: uGet(c), env: env(d) })).status, 403, role);
    assert.equal((await users.onRequestPost({ request: uSend(c, 'POST',
      { name: 'Sneak', email: 'sneak@x.test', role: 'owner', password: 'a-good-password' }),
      env: env(d) })).status, 403, role + ' could add an owner');
  }
});

console.log('\n' + n + ' passed');
