/* An arrangement, and the visits it is made of. */
import assert from 'node:assert/strict';
import { makeD1 } from './helpers/d1.mjs';
import { makeSessionCookie } from '../functions/_lib/auth.js';
import { occurrences, plannedDates, spanFor, describe, cleanDays } from '../functions/_lib/jobs.js';
import * as jobs from '../functions/api/admin/jobs.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const testAsync = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

/* --------------------------------------------------------- the rule */

test('a one-off is just its day', () => {
  assert.deepEqual(occurrences({ start_date: '2026-11-17' }), ['2026-11-17']);
});

test('fortnightly means every other week, not every 14 days of drift', () => {
  const d = occurrences({ start_date: '2026-11-17', freq: 'biweekly' }, { horizonDays: 70 });
  assert.deepEqual(d.slice(0, 4), ['2026-11-17', '2026-12-01', '2026-12-15', '2026-12-29']);
});

test('two days a week both happen, in order', () => {
  const d = occurrences({ start_date: '2026-11-16', freq: 'weekly', byday: [1, 4] },
    { horizonDays: 21 });
  assert.deepEqual(d.slice(0, 4), ['2026-11-16', '2026-11-19', '2026-11-23', '2026-11-26']);
});

/* "The 31st" in a month that has 30 days means the last day, not a skip. */
test('a monthly on the 31st lands on the last day of a short month', () => {
  const d = occurrences({ start_date: '2027-01-31', freq: 'monthly' }, { horizonDays: 3650, limit: 4 });
  assert.deepEqual(d, ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
});

test('an end date is respected and is inclusive', () => {
  const d = occurrences({ start_date: '2026-11-17', freq: 'weekly', until_date: '2026-12-01' },
    { horizonDays: 365 });
  assert.deepEqual(d, ['2026-11-17', '2026-11-24', '2026-12-01']);
});

test('an open-ended rule is written down a few months, not forever', () => {
  const d = occurrences({ start_date: '2026-11-17', freq: 'weekly' }, { horizonDays: 90 });
  assert.ok(d.length > 10 && d.length < 20, 'got ' + d.length);
});

/* A clean booked for nine stays at nine when the clocks change. */
test('the hour survives a daylight-saving change', () => {
  const job = { start_date: '2027-03-07', freq: 'weekly', start_time: '09:00', duration_min: 120 };
  const before = spanFor(job, '2027-03-07');     // EST
  const after = spanFor(job, '2027-03-21');      // EDT, clocks went forward the 14th
  const hour = (iso) => new Date(iso).toLocaleTimeString('en-US',
    { timeZone: 'America/New_York', hour: 'numeric' });
  assert.equal(hour(before.start_at), hour(after.start_at));
  assert.notEqual(before.start_at.slice(11, 16), after.start_at.slice(11, 16),
    'the UTC instant really did shift, which is the point');
});

test('a skipped day drops out of the plan but the rule is untouched', () => {
  const job = { start_date: '2026-11-17', freq: 'weekly' };
  const kept = plannedDates(job, [{ occurrence_date: '2026-11-24', kind: 'skipped' }],
    { horizonDays: 30 });
  assert.ok(!kept.includes('2026-11-24'));
  assert.ok(kept.includes('2026-11-17') && kept.includes('2026-12-01'));
  assert.ok(occurrences(job, { horizonDays: 30 }).includes('2026-11-24'),
    'the rule still produces it, so un-skipping can put it back');
});

test('the rule reads as a sentence', () => {
  assert.equal(describe({ start_date: '2026-11-17', freq: 'biweekly' }), 'Every other Tuesday');
  assert.equal(describe({ start_date: '2026-11-16', freq: 'weekly', byday: [1, 4] }),
    'Every Monday and Thursday');
  assert.equal(describe({ start_date: '2026-11-17' }), 'One visit');
});

test('rubbish in the day list is dropped, not trusted', () => {
  assert.deepEqual(cleanDays('[1,4,"x",9,-2,4]'), [1, 4]);
  assert.deepEqual(cleanDays(null), []);
});

/* ------------------------------------------------------- the route */

const SECRET = 'jobs-secret';
const env = (d) => ({ DB: d, SESSION_SECRET: SECRET, ADMIN_PASSWORD: 'shared' });
const db = () => makeD1(['0011_schedule.sql', '0014_users.sql', '0015_jobs.sql']);
async function owner(d) { return (await makeSessionCookie(env(d), false)).split(';')[0]; }
const send = (c, m, b) => new Request('https://x.test/api/admin/jobs',
  { method: m, headers: { Cookie: c, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const read = (c) => new Request('https://x.test/api/admin/jobs', { headers: { Cookie: c } });

await testAsync('setting one up writes every visit into the diary', async () => {
  const d = db(); const c = await owner(d);
  const r = await jobs.onRequestPost({ request: send(c, 'POST', {
    customer_name: 'Maria Delgado', service_label: 'Deep clean', address: '12 Ocean Ave',
    start_date: '2026-11-17', freq: 'biweekly', start_time: '09:00', duration_min: 120,
    until_date: '2026-12-30' }), env: env(d) });
  assert.equal(r.status, 201);
  const b = await r.json();
  assert.equal(b.visits, 4);
  const rows = (await d.prepare('SELECT * FROM appointments ORDER BY start_at').all()).results;
  assert.equal(rows.length, 4);
  assert.equal(rows[0].customer_name, 'Maria Delgado');
  assert.equal(rows[0].job_id, b.job.id, 'each visit knows its arrangement');
  assert.equal(rows[0].occurrence_date, '2026-11-17');
});

await testAsync('a clash is reported before anything is written', async () => {
  const d = db(); const c = await owner(d);
  d._raw.prepare(`INSERT INTO appointments (id,created_at,status,all_day,start_at,end_at,customer_name)
    VALUES ('x','2026-11-01','confirmed',0,'2026-11-17T14:00:00.000Z','2026-11-17T16:00:00.000Z','Someone')`).run();
  const r = await jobs.onRequestPost({ request: send(c, 'POST', {
    customer_name: 'Maria', start_date: '2026-11-17', freq: 'weekly',
    start_time: '09:00', until_date: '2026-12-01' }), env: env(d) });
  assert.equal(r.status, 409);
  const b = await r.json();
  assert.equal(b.clashes.length, 1);
  assert.equal(b.clashes[0].date, '2026-11-17');
  assert.equal((await d.prepare('SELECT * FROM jobs').all()).results.length, 0,
    'nothing written while she decides');
});

await testAsync('she can book it anyway on purpose', async () => {
  const d = db(); const c = await owner(d);
  d._raw.prepare(`INSERT INTO appointments (id,created_at,status,all_day,start_at,end_at,customer_name)
    VALUES ('x','2026-11-01','confirmed',0,'2026-11-17T14:00:00.000Z','2026-11-17T16:00:00.000Z','Someone')`).run();
  const r = await jobs.onRequestPost({ request: send(c, 'POST', {
    customer_name: 'Maria', start_date: '2026-11-17', freq: 'weekly',
    start_time: '09:00', until_date: '2026-12-01', override: true }), env: env(d) });
  assert.equal(r.status, 201);
  assert.equal((await r.json()).visits, 3);
});

await testAsync('skipping one cancels that visit and leaves the rest', async () => {
  const d = db(); const c = await owner(d);
  const made = await (await jobs.onRequestPost({ request: send(c, 'POST', {
    customer_name: 'Maria', start_date: '2026-11-17', freq: 'weekly',
    start_time: '09:00', until_date: '2026-12-08' }), env: env(d) })).json();
  await jobs.onRequestPatch({ request: send(c, 'PATCH',
    { id: made.job.id, action: 'skip', date: '2026-11-24' }), env: env(d) });
  const rows = (await d.prepare('SELECT occurrence_date, status FROM appointments ORDER BY occurrence_date').all()).results;
  const skipped = rows.find((r) => r.occurrence_date === '2026-11-24');
  assert.equal(skipped.status, 'cancelled');
  assert.equal(rows.filter((r) => r.status === 'confirmed').length, rows.length - 1);
});

await testAsync('un-skipping puts it back, which EXDATE could not', async () => {
  const d = db(); const c = await owner(d);
  const made = await (await jobs.onRequestPost({ request: send(c, 'POST', {
    customer_name: 'Maria', start_date: '2026-11-17', freq: 'weekly',
    start_time: '09:00', until_date: '2026-12-01' }), env: env(d) })).json();
  await jobs.onRequestPatch({ request: send(c, 'PATCH',
    { id: made.job.id, action: 'skip', date: '2026-11-24' }), env: env(d) });
  await jobs.onRequestPatch({ request: send(c, 'PATCH',
    { id: made.job.id, action: 'unskip', date: '2026-11-24' }), env: env(d) });
  const row = await d.prepare(
    'SELECT status FROM appointments WHERE occurrence_date = ?').bind('2026-11-24').first();
  assert.equal(row.status, 'confirmed');
  assert.equal((await d.prepare('SELECT * FROM job_exceptions').all()).results.length, 0);
});

/* The one RFC 5545 has no operator for. */
await testAsync('changing it from a date ends the old rule and starts a new one', async () => {
  const d = db(); const c = await owner(d);
  const made = await (await jobs.onRequestPost({ request: send(c, 'POST', {
    customer_name: 'Maria', start_date: '2026-11-17', freq: 'weekly',
    start_time: '09:00', until_date: '2026-12-22' }), env: env(d) })).json();

  const r = await jobs.onRequestPatch({ request: send(c, 'PATCH', {
    id: made.job.id, action: 'change_future', from: '2026-12-01',
    start_time: '13:00', freq: 'biweekly' }), env: env(d) });
  assert.equal(r.status, 200);
  const b = await r.json();

  const old = await d.prepare('SELECT * FROM jobs WHERE id = ?').bind(made.job.id).first();
  assert.equal(old.until_date, '2026-11-30', 'the old arrangement ends the day before');

  const kept = (await d.prepare(
    `SELECT * FROM appointments WHERE job_id = ? AND status <> 'cancelled'`
  ).bind(made.job.id).all()).results;
  assert.ok(kept.every((v) => v.occurrence_date < '2026-12-01'),
    'everything before the line is untouched');

  const fresh = (await d.prepare(
    `SELECT * FROM appointments WHERE job_id = ? ORDER BY occurrence_date`
  ).bind(b.job.id).all()).results;
  assert.ok(fresh.length >= 2);
  assert.equal(fresh[0].occurrence_date, '2026-12-01');
  assert.ok(fresh[0].start_at.includes('T18:00'), 'and it is at the new time (1pm ET)');
});

await testAsync('ending it keeps what is done and clears what is ahead', async () => {
  const d = db(); const c = await owner(d);
  const made = await (await jobs.onRequestPost({ request: send(c, 'POST', {
    customer_name: 'Maria', start_date: '2026-11-17', freq: 'weekly',
    start_time: '09:00', until_date: '2026-12-15' }), env: env(d) })).json();
  await jobs.onRequestPatch({ request: send(c, 'PATCH',
    { id: made.job.id, action: 'end', from: '2026-12-01' }), env: env(d) });
  const rows = (await d.prepare('SELECT occurrence_date, status FROM appointments ORDER BY occurrence_date').all()).results;
  for (const r of rows) {
    assert.equal(r.status, r.occurrence_date >= '2026-12-01' ? 'cancelled' : 'confirmed');
  }
  const job = await d.prepare('SELECT status FROM jobs WHERE id = ?').bind(made.job.id).first();
  assert.equal(job.status, 'done');
});

await testAsync('an arrangement with nothing in the diary is named, not inferred', async () => {
  const d = db(); const c = await owner(d);
  d._raw.prepare(`INSERT INTO jobs (id,created_at,customer_name,status,start_date)
    VALUES ('j-empty','2026-11-11','Nobody Booked','open','2026-11-17')`).run();
  const b = await (await jobs.onRequestGet({ request: read(c), env: env(d) })).json();
  const row = b.jobs.find((j) => j.id === 'j-empty');
  assert.equal(row.unscheduled, true);
  assert.equal(row.upcoming, 0);
});

await testAsync('a cleaner cannot set up or change an arrangement', async () => {
  const d = db();
  d._raw.prepare(`INSERT INTO users (id,created_at,name,email,role,active)
    VALUES ('u1','2026-11-11','Dani','d@x.test','cleaner',1)`).run();
  const c = (await makeSessionCookie(env(d), false, 'u1')).split(';')[0];
  assert.equal((await jobs.onRequestPost({ request: send(c, 'POST',
    { customer_name: 'X', start_date: '2026-11-17' }), env: env(d) })).status, 403);
  assert.equal((await jobs.onRequestGet({ request: read(c), env: env(d) })).status, 403);
});

console.log('\n' + n + ' passed');
