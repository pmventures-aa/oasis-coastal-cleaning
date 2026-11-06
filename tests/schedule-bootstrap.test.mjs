/* Production has no schedule tables. Nobody should have to find a setup
   button before a calendar works, so the first signed-in request builds
   what it needs. This runs against a database that has never seen them. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { makeSessionCookie } from '../functions/_lib/auth.js';
import { localStampToUtc } from '../functions/_lib/schedule.js';
import * as route from '../functions/api/admin/schedule.js';

/* An empty database, exactly as production's was before this shipped. */
function bareDb() {
  const raw = new DatabaseSync(':memory:');
  const wrap = (sql) => {
    const ops = (...a) => ({
      first: async () => { const r = raw.prepare(sql).all(...a); return r.length ? r[0] : null; },
      all: async () => ({ results: raw.prepare(sql).all(...a) }),
      run: async () => { raw.prepare(sql).run(...a); return { success: true }; }
    });
    return Object.assign(ops(), { bind: ops });
  };
  return { prepare: wrap, _raw: raw };
}

const base = { SESSION_SECRET: 'test-secret', ADMIN_PASSWORD: 'pw' };
const cookie = (await makeSessionCookie(base, false)).split(';')[0];
const authed = (url, body, method = 'POST') => ({
  url: 'https://x.test' + url, method,
  headers: { get: (h) => (h.toLowerCase() === 'cookie' ? cookie : null) },
  json: async () => body
});
const body = async (res) => JSON.parse(await res.text());

test('a database with no schedule in it', async (t) => {
  await t.test('builds the tables on the first look and returns a diary', async () => {
    const env = { ...base, DB: bareDb() };
    const tablesBefore = env.DB._raw
      .prepare("SELECT name FROM sqlite_master WHERE name='appointments'").all();
    assert.equal(tablesBefore.length, 0, 'starting from nothing');

    const res = await route.onRequestGet({
      request: authed('/api/admin/schedule?from=2026-06-01&to=2026-06-07', null, 'GET'), env });
    assert.equal(res.status, 200, 'she should not meet a setup screen');
    const b = await body(res);
    assert.deepEqual(b.appointments, []);
    assert.deepEqual(b.blocks, []);

    for (const t2 of ['appointments', 'availability_blocks', 'schedule_events']) {
      assert.equal(
        env.DB._raw.prepare('SELECT name FROM sqlite_master WHERE name=?').all(t2).length, 1,
        t2 + ' was not created');
    }
  });

  await t.test('and can take a booking straight away', async () => {
    const env = { ...base, DB: bareDb() };
    const res = await route.onRequestPost({ request: authed('/api/admin/schedule', {
      customer_name: 'Maria Delgado',
      start_at: localStampToUtc('2026-06-02', '10:00').toISOString(),
      end_at: localStampToUtc('2026-06-02', '12:00').toISOString() }), env });
    assert.equal(res.status, 201);
    assert.equal((await body(res)).row.customer_name, 'Maria Delgado');
  });

  await t.test('the gate works on tables it just made', async () => {
    const env = { ...base, DB: bareDb() };
    const slot = {
      start_at: localStampToUtc('2026-06-02', '10:00').toISOString(),
      end_at: localStampToUtc('2026-06-02', '12:00').toISOString() };
    await route.onRequestPost({ request: authed('/api/admin/schedule',
      { customer_name: 'Maria', ...slot }), env });
    const clash = await route.onRequestPost({ request: authed('/api/admin/schedule',
      { customer_name: 'Dan', ...slot }), env });
    assert.equal(clash.status, 409, 'a fresh schedule is still an authority');
  });

  await t.test('a database that cannot be written to still says so', async () => {
    /* Never an empty calendar that looks like a free day. */
    const dead = { prepare: () => { throw new Error('D1 unavailable'); } };
    const res = await route.onRequestGet({
      request: authed('/api/admin/schedule', null, 'GET'), env: { ...base, DB: dead } });
    assert.equal(res.status, 503);
    assert.equal((await body(res)).needsSetup, true);
  });

  await t.test('still refuses without a session', async () => {
    const env = { ...base, DB: bareDb() };
    const res = await route.onRequestGet({
      request: { url: 'https://x.test/api/admin/schedule', headers: { get: () => null } }, env });
    assert.equal(res.status, 401);
    assert.equal(env.DB._raw.prepare("SELECT name FROM sqlite_master WHERE name='appointments'").all().length,
      0, 'an unauthenticated poke must not create anything');
  });
});
