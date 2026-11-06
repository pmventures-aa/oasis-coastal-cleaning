/* The server is the authority. The screen checks too, so she sees a clash
   before pressing anything, but these are the checks that decide — a stale
   tab, a retry and two phones all arrive here. Run against real SQLite with
   the real migration applied. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1 } from './helpers/d1.mjs';
import { localStampToUtc } from '../functions/_lib/schedule.js';
import * as route from '../functions/api/admin/schedule.js';

/* isSignedIn reads a cookie, so these sign one the way the app does and
   send it. The unauthorised case has a test of its own below. */
import { makeSessionCookie } from '../functions/_lib/auth.js';
const env = { DB: null, SESSION_SECRET: 'test-secret', ADMIN_PASSWORD: 'pw' };
const cookie = (await makeSessionCookie(env, false)).split(';')[0];
const authed = (url, body, method = 'POST') => ({
  url: 'https://x.test' + url, method,
  headers: { get: (h) => (h.toLowerCase() === 'cookie' ? cookie : null) },
  json: async () => body
});

const at = (d, a, b) => ({
  start_at: localStampToUtc(d, a).toISOString(),
  end_at: localStampToUtc(d, b).toISOString()
});
const fresh = () => ({ ...env, DB: makeD1() });
const body = async (res) => JSON.parse(await res.text());

test('booking a clean', async (t) => {
  await t.test('a free slot is accepted', async () => {
    const e = fresh();
    const res = await route.onRequestPost({ request: authed('/api/admin/schedule',
      { customer_name: 'Maria Delgado', ...at('2026-06-02', '10:00', '12:00') }), env: e });
    assert.equal(res.status, 201);
    const b = await body(res);
    assert.equal(b.row.customer_name, 'Maria Delgado');
    assert.equal(b.row.status, 'confirmed');
  });

  await t.test('a clash is refused and names what it hit', async () => {
    const e = fresh();
    await route.onRequestPost({ request: authed('/api/admin/schedule',
      { customer_name: 'Maria', ...at('2026-06-02', '10:00', '12:00') }), env: e });
    const res = await route.onRequestPost({ request: authed('/api/admin/schedule',
      { customer_name: 'Dan', ...at('2026-06-02', '11:00', '13:00') }), env: e });
    assert.equal(res.status, 409);
    const b = await body(res);
    assert.equal(b.conflicts.length, 1);
    assert.equal(b.conflicts[0].label, 'Maria');
    assert.ok(Array.isArray(b.suggestions), 'and offers somewhere else');
  });

  await t.test('back to back is not a clash', async () => {
    const e = fresh();
    await route.onRequestPost({ request: authed('/api/admin/schedule',
      { customer_name: 'Maria', ...at('2026-06-02', '10:00', '12:00') }), env: e });
    const res = await route.onRequestPost({ request: authed('/api/admin/schedule',
      { customer_name: 'Dan', ...at('2026-06-02', '12:00', '14:00') }), env: e });
    assert.equal(res.status, 201);
  });

  await t.test('an end before its start is refused', async () => {
    const e = fresh();
    const res = await route.onRequestPost({ request: authed('/api/admin/schedule',
      { customer_name: 'X', ...at('2026-06-02', '14:00', '10:00') }), env: e });
    assert.equal(res.status, 400);
  });
});

test('blocked time is as real as a booking', async (t) => {
  await t.test('a clean cannot be booked over a block', async () => {
    const e = fresh();
    await route.onRequestPost({ request: authed('/api/admin/schedule',
      { kind: 'block', note: 'School run', ...at('2026-06-02', '14:00', '16:00') }), env: e });
    const res = await route.onRequestPost({ request: authed('/api/admin/schedule',
      { customer_name: 'Dan', ...at('2026-06-02', '15:00', '17:00') }), env: e });
    assert.equal(res.status, 409);
    assert.equal((await body(res)).conflicts[0].kind, 'block');
  });

  await t.test('an all-day block closes the whole day', async () => {
    const e = fresh();
    await route.onRequestPost({ request: authed('/api/admin/schedule',
      { kind: 'block', all_day: true, start_date: '2026-06-03', note: '' }), env: e });
    const res = await route.onRequestPost({ request: authed('/api/admin/schedule',
      { customer_name: 'Dan', ...at('2026-06-03', '08:00', '10:00') }), env: e });
    assert.equal(res.status, 409);
  });

  await t.test('blocking over a clean never moves the clean', async () => {
    const e = fresh();
    const made = await body(await route.onRequestPost({ request: authed('/api/admin/schedule',
      { customer_name: 'Maria', ...at('2026-06-02', '10:00', '12:00') }), env: e }));
    const res = await route.onRequestPost({ request: authed('/api/admin/schedule',
      { kind: 'block', note: 'Dentist', ...at('2026-06-02', '09:00', '13:00') }), env: e });
    assert.equal(res.status, 201, 'she is allowed to block her own time');
    const b = await body(res);
    assert.equal(b.covering.length, 1, 'and is told what she just covered');
    assert.equal(b.covering[0].label, 'Maria');

    const still = await e.DB.prepare('SELECT status, start_at FROM appointments WHERE id = ?')
      .bind(made.row.id).first();
    assert.equal(still.status, 'confirmed', 'the clean is untouched');
    assert.equal(still.start_at, made.row.start_at);
  });
});

test('cancelling releases the time, restoring has to win it back', async (t) => {
  const e = fresh();
  let first;

  await t.test('a cancelled clean frees its slot', async () => {
    first = (await body(await route.onRequestPost({ request: authed('/api/admin/schedule',
      { customer_name: 'Maria', ...at('2026-06-04', '10:00', '12:00') }), env: e }))).row;
    await route.onRequestPatch({ request: authed('/api/admin/schedule',
      { id: first.id, action: 'cancel' }, 'PATCH'), env: e });
    const res = await route.onRequestPost({ request: authed('/api/admin/schedule',
      { customer_name: 'Dan', ...at('2026-06-04', '10:00', '12:00') }), env: e });
    assert.equal(res.status, 201);
  });

  await t.test('and it cannot quietly come back on top of what took it', async () => {
    const res = await route.onRequestPatch({ request: authed('/api/admin/schedule',
      { id: first.id, action: 'restore' }, 'PATCH'), env: e });
    assert.equal(res.status, 409);
    assert.equal((await body(res)).conflicts[0].label, 'Dan');
  });
});

test('retries and races', async (t) => {
  await t.test('the same request twice books once', async () => {
    const e = fresh();
    const payload = { customer_name: 'Maria', client_token: 'tap-1', ...at('2026-06-05', '10:00', '12:00') };
    const a = await body(await route.onRequestPost({ request: authed('/api/admin/schedule', payload), env: e }));
    const b = await body(await route.onRequestPost({ request: authed('/api/admin/schedule', payload), env: e }));
    assert.equal(b.duplicate, true);
    assert.equal(b.row.id, a.row.id, 'the second tap returns the first booking');
    const n = await e.DB.prepare('SELECT COUNT(*) AS n FROM appointments').first();
    assert.equal(n.n, 1);
  });

  await t.test('two saves landing together leave one booking', async () => {
    const e = fresh();
    const slot = at('2026-06-05', '10:00', '12:00');
    const [r1, r2] = await Promise.all([
      route.onRequestPost({ request: authed('/api/admin/schedule', { customer_name: 'Maria', ...slot }), env: e }),
      route.onRequestPost({ request: authed('/api/admin/schedule', { customer_name: 'Dan', ...slot }), env: e })
    ]);
    const kept = await e.DB.prepare("SELECT COUNT(*) AS n FROM appointments WHERE status != 'cancelled'").first();
    assert.equal(kept.n, 1, 'one of them has to lose');
    const codes = [r1.status, r2.status].sort();
    assert.deepEqual(codes, [201, 409], 'and be told so');
  });
});

test('an override is deliberate and leaves a trail', async () => {
  const e = fresh();
  await route.onRequestPost({ request: authed('/api/admin/schedule',
    { customer_name: 'Maria', ...at('2026-06-08', '10:00', '12:00') }), env: e });
  const res = await route.onRequestPost({ request: authed('/api/admin/schedule',
    { customer_name: 'Dan', override: true, ...at('2026-06-08', '10:00', '12:00') }), env: e });
  assert.equal(res.status, 201, 'she can double-book on purpose');

  const ev = await e.DB.prepare(
    "SELECT detail FROM schedule_events WHERE kind = 'created' ORDER BY created_at DESC").all();
  const latest = JSON.parse(ev.results[0].detail || '{}');
  assert.equal(latest.override, true, 'and it says so afterwards');
  assert.ok(latest.overrode && latest.overrode.length, 'naming what was overridden');
});

test('a quote outside working hours is flagged, not blocked', async () => {
  const e = fresh();
  const res = await route.onRequestPost({ request: authed('/api/admin/schedule',
    { customer_name: 'Maria', ...at('2026-06-07', '16:00', '18:00') }), env: e });   // Sunday, closes 3
  assert.equal(res.status, 201);
  assert.equal((await body(res)).outside_hours, true);
});

test('without a session it answers nothing', async () => {
  const e = fresh();
  const res = await route.onRequestGet({
    request: { url: 'https://x.test/api/admin/schedule', headers: { get: () => null } }, env: e });
  assert.equal(res.status, 401);
});

test('reading a window', async (t) => {
  await t.test('returns what falls inside it, and expands repeats', async () => {
    const e = fresh();
    await route.onRequestPost({ request: authed('/api/admin/schedule',
      { customer_name: 'Maria', ...at('2026-06-10', '10:00', '12:00') }), env: e });
    await route.onRequestPost({ request: authed('/api/admin/schedule',
      { kind: 'block', repeat_freq: 'weekly', repeat_days: [1], repeat_until: '2026-06-30',
        ...at('2026-06-01', '12:00', '13:00') }), env: e });

    const res = await route.onRequestGet({
      request: authed('/api/admin/schedule?from=2026-06-01&to=2026-06-30', null, 'GET'), env: e });
    const b = await body(res);
    assert.equal(b.appointments.length, 1);
    assert.equal(b.blocks.length, 5, 'five Mondays in June 2026');
    assert.ok(b.blocks.every((x) => x.occurrence_of), 'each one points back at the rule');
  });

  await t.test('a missing schedule says so rather than looking empty', async () => {
    const bare = { ...env, DB: { prepare: () => ({ bind: () => ({ first: async () => { throw new Error('no such table'); } }),
      first: async () => { throw new Error('no such table'); } }) } };
    const res = await route.onRequestGet({ request: authed('/api/admin/schedule', null, 'GET'), env: bare });
    assert.equal(res.status, 503);
    assert.equal((await body(res)).needsSetup, true,
      'an empty calendar must never be mistaken for a free day');
  });
});
