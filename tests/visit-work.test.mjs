/* What happens at the house: the checklist, the two notes, and done.
   The property that matters most: her private note has no path to a
   customer's inbox. */
import assert from 'node:assert/strict';
import { makeD1 } from './helpers/d1.mjs';
import { makeSessionCookie, hashPassword } from '../functions/_lib/auth.js';
import {
  buildChecklist, parseChecklist, progressOf, suggestTemplate, TEMPLATE_IDS
} from '../functions/_lib/checklists.js';
import * as sched from '../functions/api/admin/schedule.js';
import * as email from '../functions/api/admin/email.js';
import { buildManualEmail } from '../functions/_lib/email.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const testAsync = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

/* ------------------------------------------------------- the checklist */

test('a template becomes a list of unticked things', () => {
  const l = buildChecklist('deep');
  assert.ok(l.length > 4);
  assert.ok(l.every((i) => i.done === false && typeof i.label === 'string'));
});

test('the template is guessed from what the job is called', () => {
  assert.equal(suggestTemplate('Deep clean'), 'deep');
  assert.equal(suggestTemplate('Airbnb turnover'), 'turnover');
  assert.equal(suggestTemplate('Office clean'), 'office');
  assert.equal(suggestTemplate(''), 'standard');
  for (const id of TEMPLATE_IDS) assert.ok(buildChecklist(id).length);
});

test('rubbish in a checklist is dropped rather than trusted', () => {
  assert.deepEqual(parseChecklist('[{"label":"ok","done":true},null,{"done":true}]'),
    [{ label: 'ok', done: true }]);
  assert.deepEqual(parseChecklist('not json'), []);
});

test('progress counts what is actually ticked', () => {
  const l = buildChecklist('laundry');
  assert.equal(progressOf(l).done, 0);
  l[0].done = true; l[1].done = true;
  const p = progressOf(l);
  assert.equal(p.done, 2);
  assert.equal(p.all, false);
  l.forEach((i) => { i.done = true; });
  assert.equal(progressOf(l).all, true);
});

/* ----------------------------------------------------------- the route */

const SECRET = 'visit-work-secret';
const env = (d) => ({ DB: d, SESSION_SECRET: SECRET, ADMIN_PASSWORD: 'shared' });
function db() {
  const d = makeD1(['0011_schedule.sql', '0012_email_log.sql', '0014_users.sql', '0018_visit_work.sql']);
  d._raw.exec(`CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT, email TEXT)`);
  d._raw.exec(`CREATE TABLE leads (id TEXT PRIMARY KEY, email TEXT, customer_id TEXT)`);
  d._raw.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)`);
  d._raw.prepare(`INSERT INTO customers (id,name,email) VALUES ('c1','Maria','maria@x.test')`).run();
  d._raw.prepare(`INSERT INTO appointments (id,created_at,status,all_day,start_at,end_at,
    customer_name,service_label,customer_id,assigned_to)
    VALUES ('a1','2026-11-11','confirmed',0,'2026-11-20T14:00:00Z','2026-11-20T16:00:00Z',
    'Maria','Deep clean','c1','u-cleaner')`).run();
  return d;
}
async function cleaner(d, id = 'u-cleaner') {
  const h = await hashPassword('pw');
  d._raw.prepare(`INSERT OR REPLACE INTO users (id,created_at,name,email,role,password_hash,
    password_salt,iterations,active) VALUES (?,?,?,?, 'cleaner',?,?,?,1)`)
    .run(id, '2026-11-11', 'Dani', id + '@x.test', h.hash, h.salt, h.iterations);
  return (await makeSessionCookie(env(d), false, id)).split(';')[0];
}
const owner = async (d) => (await makeSessionCookie(env(d), false)).split(';')[0];
const patch = (c, b) => new Request('https://x.test/api/admin/schedule',
  { method: 'PATCH', headers: { Cookie: c, 'Content-Type': 'application/json' },
    body: JSON.stringify(b) });

await testAsync('a cleaner can tick off her own visit', async () => {
  const d = db(); const c = await cleaner(d);
  const list = buildChecklist('deep'); list[0].done = true;
  const r = await sched.onRequestPatch({ request: patch(c,
    { id: 'a1', action: 'checklist', checklist: list }), env: env(d) });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).progress.done, 1);
});

/* Doing the work is not the same as changing the diary. */
await testAsync('but she still cannot move or cancel it', async () => {
  const d = db(); const c = await cleaner(d);
  assert.equal((await sched.onRequestPatch({ request: patch(c,
    { id: 'a1', status: 'cancelled' }), env: env(d) })).status, 403);
  assert.equal((await sched.onRequestPost({ request: patch(c,
    { customer_name: 'X', start_at: '2026-11-21T14:00:00Z', end_at: '2026-11-21T16:00:00Z' }),
    env: env(d) })).status, 403);
});

await testAsync('she cannot touch somebody else’s visit', async () => {
  const d = db(); const c = await cleaner(d, 'u-other');
  const r = await sched.onRequestPatch({ request: patch(c,
    { id: 'a1', action: 'checklist', checklist: [] }), env: env(d) });
  assert.equal(r.status, 403);
  assert.match((await r.json()).error, /not one of your visits/);
});

await testAsync('marking it done records who and when', async () => {
  const d = db(); const c = await cleaner(d);
  await sched.onRequestPatch({ request: patch(c, { id: 'a1', action: 'complete' }), env: env(d) });
  const row = await d.prepare('SELECT * FROM appointments WHERE id = ?').bind('a1').first();
  assert.ok(row.completed_at);
  assert.equal(row.completed_by, 'u-cleaner');
});

await testAsync('the two notes are stored apart', async () => {
  const d = db(); const c = await owner(d);
  await sched.onRequestPatch({ request: patch(c, { id: 'a1', action: 'notes',
    internal_note: 'Gate stuck again, dog was loose.',
    client_summary: 'All done — the oven came up beautifully.' }), env: env(d) });
  const row = await d.prepare('SELECT * FROM appointments WHERE id = ?').bind('a1').first();
  assert.equal(row.internal_note, 'Gate stuck again, dog was loose.');
  assert.equal(row.client_summary, 'All done — the oven came up beautifully.');
});

/* The one that must never regress. */
await testAsync('her private note has no path to a customer email', async () => {
  const d = db(); const c = await owner(d);
  await sched.onRequestPatch({ request: patch(c, { id: 'a1', action: 'notes',
    internal_note: 'SECRET-GATE-9911, dog bites, took twice as long',
    client_summary: 'All done, thank you.' }), env: env(d) });

  const res = await email.onRequestPost({
    request: new Request('https://x.test/api/admin/email', { method: 'POST',
      headers: { Cookie: c, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'visit_summary', entity_id: 'a1' }) }),
    env: env(d) });
  const b = await res.json();
  const whole = JSON.stringify(b);
  assert.ok(!whole.includes('SECRET-GATE-9911'), 'the gate code leaked into the preview');
  assert.ok(!whole.includes('dog bites'));
  assert.ok(whole.includes('All done, thank you.'), 'but her line for them is there');
});

test('the builder itself only ever reads the client line', () => {
  const m = buildManualEmail({}, 'visit_summary', {
    customer_name: 'Maria', service_label: 'Deep clean',
    note: 'All done, thank you.', settings: {}
  });
  assert.ok(m.html.includes('All done, thank you.'));
  // there is no internal_note parameter at all: the only way in is `note`
  const m2 = buildManualEmail({}, 'visit_summary', {
    customer_name: 'Maria', internal_note: 'SECRET', settings: {} });
  assert.ok(!m2.html.includes('SECRET'));
  assert.ok(!m2.text.includes('SECRET'));
});

console.log('\n' + n + ' passed');
