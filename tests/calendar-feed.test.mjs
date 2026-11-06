/* The feed her phone subscribes to. It is one-way by construction: there is
   no route that reads anything back, so these also pin the honesty of the
   claim the portal makes next to the link. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1 } from './helpers/d1.mjs';
import { localStampToUtc } from '../functions/_lib/schedule.js';
import * as feed from '../functions/api/calendar/[token].js';

const TOKEN = 'tok-abcdefghijklmnop';
const SHARE = 'busy-abcdefghijklmnop';
const envWith = async (rows = [], blocks = []) => {
  const DB = makeD1();
  /* The feed reads settings through loadSettings, which needs the table. */
  DB._raw.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)`);
  DB._raw.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('calendar_token', TOKEN);
  DB._raw.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('calendar_share_token', SHARE);
  for (const r of rows) {
    DB._raw.prepare(`INSERT INTO appointments
      (id, created_at, customer_name, phone, address, city, service_label, status,
       all_day, start_at, end_at, start_date, end_date, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      r.id, '2026-01-01', r.customer_name ?? null, r.phone ?? null, r.address ?? null,
      r.city ?? null, r.service_label ?? null, r.status ?? 'confirmed',
      r.all_day ?? 0, r.start_at ?? null, r.end_at ?? null,
      r.start_date ?? null, r.end_date ?? null, r.notes ?? null);
  }
  for (const b of blocks) {
    DB._raw.prepare(`INSERT INTO availability_blocks
      (id, created_at, note, address, all_day, start_at, end_at, start_date, end_date,
       repeat_freq, repeat_days, repeat_until, skip_dates)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      b.id, '2026-01-01', b.note ?? null, b.address ?? null, b.all_day ?? 0,
      b.start_at ?? null, b.end_at ?? null, b.start_date ?? null, b.end_date ?? null,
      b.repeat_freq ?? null, b.repeat_days ?? null, b.repeat_until ?? null, b.skip_dates ?? '[]');
  }
  return { DB };
};
const soon = (days, h) => {
  const d = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  return localStampToUtc(d, h).toISOString();
};
const get = (env, token) =>
  feed.onRequestGet({ request: { url: 'https://x.test/api/calendar/' + token },
    params: { token }, env });

test('the feed', async (t) => {
  await t.test('a wrong token is a 404, not a hint', async () => {
    const env = await envWith();
    const res = await get(env, 'tok-wrongwrongwrong');
    assert.equal(res.status, 404);
    assert.equal(await res.text(), 'Not found');
  });

  await t.test('no token set means no feed at all', async () => {
    const DB = makeD1();
    DB._raw.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)');
    const res = await get({ DB }, TOKEN);
    assert.equal(res.status, 404, 'an unset token must not match an empty one');
  });

  await t.test('serves a calendar a phone will accept', async () => {
    const env = await envWith([{ id: 'a1', customer_name: 'Maria Delgado',
      service_label: 'Deep clean', address: '12 Ocean Ave', city: 'Lake Worth',
      start_at: soon(2, '09:00'), end_at: soon(2, '12:00') }]);
    const res = await get(env, TOKEN);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('Content-Type'), /text\/calendar/);
    const body = await res.text();
    assert.ok(body.startsWith('BEGIN:VCALENDAR\r\n'));
    assert.ok(body.trimEnd().endsWith('END:VCALENDAR'));
    assert.match(body, /SUMMARY:Maria Delgado/);
    assert.match(body, /LOCATION:12 Ocean Ave\\, Lake Worth/, 'commas are escaped, not structural');
    assert.ok(body.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75),
      'every line folds to 75 octets');
  });

  await t.test('a cancelled cleaning is simply not in it', async () => {
    const env = await envWith([{ id: 'a1', customer_name: 'Gone', status: 'cancelled',
      start_at: soon(2, '09:00'), end_at: soon(2, '12:00') }]);
    assert.ok(!(await (await get(env, TOKEN)).text()).includes('Gone'));
  });

  await t.test('a tentative one says so rather than looking agreed', async () => {
    const env = await envWith([{ id: 'a1', customer_name: 'Dan', status: 'tentative',
      start_at: soon(2, '09:00'), end_at: soon(2, '12:00') }]);
    const body = await (await get(env, TOKEN)).text();
    assert.match(body, /SUMMARY:Dan \(tentative\)/);
    assert.match(body, /STATUS:TENTATIVE/);
  });

  await t.test('an all-day block ends the day after, as the format requires', async () => {
    const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const next = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const env = await envWith([], [{ id: 'b1', note: 'Away', all_day: 1,
      start_date: day, end_date: day }]);
    const body = await (await get(env, TOKEN)).text();
    assert.ok(body.includes('DTSTART;VALUE=DATE:' + day.replace(/-/g, '')));
    assert.ok(body.includes('DTEND;VALUE=DATE:' + next.replace(/-/g, '')),
      'an inclusive end would swallow the following day');
  });

  await t.test('a weekly block appears as each of its occurrences', async () => {
    const start = new Date(Date.now() + 1 * 86400000).toISOString().slice(0, 10);
    const until = new Date(Date.now() + 29 * 86400000).toISOString().slice(0, 10);
    const dow = new Date(start + 'T00:00:00Z').getUTCDay();
    const env = await envWith([], [{ id: 'b1', note: 'School run',
      start_at: localStampToUtc(start, '14:00').toISOString(),
      end_at: localStampToUtc(start, '16:00').toISOString(),
      repeat_freq: 'weekly', repeat_days: JSON.stringify([dow]), repeat_until: until }]);
    const body = await (await get(env, TOKEN)).text();
    const n = (body.match(/SUMMARY:School run/g) || []).length;
    assert.ok(n >= 4, 'four or five of them in a month, got ' + n);
  });

  await t.test('nothing in it can change anything here', () => {
    /* One-way is a property of the code, not a promise in the copy: the
       module exports a GET and nothing else. */
    assert.deepEqual(Object.keys(feed).sort(), ['onRequestGet']);
  });
});

test('the link she can give somebody else', async (t) => {
  /* She asked whether the calendar is something she can share. It is — but
     not the one on her own phone, which names her customers and says where
     they live. The shared link says only that the time is taken. */
  const PRIVATE = ['Maria Delgado', '12 Ocean Ave', 'Lake Worth', '5615550142',
                   'Deep clean', 'Gate code 4417'];
  const withJob = () => envWith([{ id: 'a1', customer_name: 'Maria Delgado',
    service_label: 'Deep clean', address: '12 Ocean Ave', city: 'Lake Worth',
    phone: '5615550142', notes: 'Gate code 4417',
    start_at: soon(2, '09:00'), end_at: soon(2, '12:00') }]);

  await t.test('hers still shows the job', async () => {
    const body = await (await get(await withJob(), TOKEN)).text();
    for (const secret of PRIVATE) assert.ok(body.includes(secret), secret + ' is missing from her own feed');
  });

  await t.test('the shared one says only that she is busy', async () => {
    const body = await (await get(await withJob(), SHARE)).text();
    assert.match(body, /SUMMARY:Busy/);
    for (const secret of PRIVATE) {
      assert.ok(!body.includes(secret), 'the shared link leaks "' + secret + '"');
    }
    assert.ok(!/LOCATION:/.test(body), 'no address line at all');
    assert.ok(!/DESCRIPTION:/.test(body), 'no notes line at all');
  });

  await t.test('but the time itself is exact, or it is useless', async () => {
    const body = await (await get(await withJob(), SHARE)).text();
    assert.ok(body.includes('DTSTART:' + soon(2, '09:00').replace(/[-:]/g, '').replace(/\.\d{3}/, '')));
    assert.ok(body.includes('DTEND:' + soon(2, '12:00').replace(/[-:]/g, '').replace(/\.\d{3}/, '')));
  });

  await t.test('blocked time is busy too, and its note stays hers', async () => {
    const env = await envWith([], [{ id: 'b1', note: 'Hospital appointment',
      start_at: soon(3, '14:00'), end_at: soon(3, '16:00') }]);
    const body = await (await get(env, SHARE)).text();
    assert.match(body, /SUMMARY:Busy/);
    assert.ok(!body.includes('Hospital'), 'why she is unavailable is nobody else\u2019s business');
  });

  await t.test('turning one off does not touch the other', async () => {
    const env = await envWith();
    env.DB._raw.prepare('UPDATE settings SET value = ? WHERE key = ?').run('', 'calendar_share_token');
    assert.equal((await get(env, SHARE)).status, 404);
    assert.equal((await get(env, TOKEN)).status, 200);
  });

  await t.test('an empty share token does not match an empty guess', async () => {
    const env = await envWith();
    env.DB._raw.prepare('UPDATE settings SET value = ? WHERE key = ?').run('', 'calendar_share_token');
    assert.equal((await get(env, '')).status, 404);
  });
});
