/* One client, and everything that happened with them, in one list. */
import assert from 'node:assert/strict';
import { makeD1 } from './helpers/d1.mjs';
import * as route from '../functions/api/admin/customers/[id].js';

let n = 0;
const testAsync = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

const SECRET = 'test-secret-profile';
async function headers() {
  const expires = String(Date.now() + 3600000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(expires));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(mac)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { Cookie: 'oasis_admin=' + expires + '.' + b64 };
}
const env = (d) => ({ DB: d, SESSION_SECRET: SECRET });
const call = async (d, id) => route.onRequestGet({
  request: new Request('https://x.test/api/admin/customers/' + id, { headers: await headers() }),
  env: env(d), params: { id } });

function base(withLater = true) {
  const d = makeD1(withLater ? ['0011_schedule.sql', '0012_email_log.sql'] : []);
  d._raw.exec(`CREATE TABLE customers (id TEXT PRIMARY KEY, created_at TEXT, name TEXT,
    company TEXT, phone TEXT, email TEXT, notes TEXT, archived_at TEXT)`);
  d._raw.exec(`CREATE TABLE properties (id TEXT PRIMARY KEY, customer_id TEXT, created_at TEXT,
    label TEXT, address TEXT, city TEXT, access TEXT, notes TEXT, archived_at TEXT,
    parking TEXT, pets TEXT, preferred_day TEXT)`);
  d._raw.exec(`CREATE TABLE leads (id TEXT PRIMARY KEY, created_at TEXT, customer_id TEXT,
    service TEXT, service_label TEXT, city TEXT, status TEXT)`);
  d._raw.exec(`CREATE TABLE quotes (id TEXT PRIMARY KEY, lead_id TEXT, created_at TEXT,
    total INTEGER, sent_at TEXT, first_viewed_at TEXT, accepted_at TEXT, declined_at TEXT,
    completed_at TEXT, paid_at TEXT)`);
  d._raw.prepare(`INSERT INTO customers (id,created_at,name,email) VALUES
    ('c1','2026-01-01T00:00:00Z','Maria Delgado','maria@example.test')`).run();
  d._raw.prepare(`INSERT INTO properties (id,customer_id,created_at,address,city,access,parking,pets,preferred_day)
    VALUES ('p1','c1','2026-01-01T00:00:00Z','12 Ocean Ave','Lake Worth','Gate code 4417',
    'Driveway, not the street','Biscuit, friendly','Tuesdays')`).run();
  return d;
}

await testAsync('a client with nothing yet reads as empty, not broken', async () => {
  const d = base();
  const b = await (await call(d, 'c1')).json();
  assert.equal(b.ok, true);
  assert.equal(b.customer.name, 'Maria Delgado');
  assert.deepEqual(b.timeline, []);
  assert.equal(b.counts.requests, 0);
});

await testAsync('the things she has to remember travel with the address', async () => {
  const d = base();
  const b = await (await call(d, 'c1')).json();
  const p = b.properties[0];
  assert.equal(p.access, 'Gate code 4417');
  assert.equal(p.parking, 'Driveway, not the street');
  assert.equal(p.pets, 'Biscuit, friendly');
  assert.equal(p.preferred_day, 'Tuesdays');
});

await testAsync('every source lands in one list, newest first', async () => {
  const d = base();
  d._raw.prepare(`INSERT INTO leads (id,created_at,customer_id,service_label,city,status)
    VALUES ('l1','2026-03-01T10:00:00Z','c1','Deep clean','Lake Worth','quoted')`).run();
  d._raw.prepare(`INSERT INTO quotes (id,lead_id,created_at,total,sent_at,first_viewed_at,accepted_at,paid_at)
    VALUES ('q1','l1','2026-03-02T10:00:00Z',28500,'2026-03-02T11:00:00Z','2026-03-02T15:00:00Z',
    '2026-03-03T09:00:00Z','2026-03-20T09:00:00Z')`).run();
  d._raw.prepare(`INSERT INTO appointments (id,created_at,status,all_day,start_at,end_at,
    customer_id,service_label,address) VALUES ('a1','2026-03-04T00:00:00Z','confirmed',0,
    '2026-03-10T14:00:00Z','2026-03-10T16:00:00Z','c1','Deep clean','12 Ocean Ave')`).run();
  d._raw.prepare(`INSERT INTO email_log (id,created_at,kind,entity_kind,entity_id,customer_id,
    to_email,subject,status) VALUES ('e1','2026-03-09T12:00:00Z','visit_reminder','appointment','a1',
    'c1','maria@example.test','A reminder','sent')`).run();

  const b = await (await call(d, 'c1')).json();
  const kinds = b.timeline.map((e) => e.kind);
  for (const k of ['request', 'quote', 'accepted', 'paid', 'visit', 'mail']) {
    assert.ok(kinds.includes(k), 'missing ' + k + ' in ' + kinds.join(','));
  }
  // newest first, strictly
  const times = b.timeline.map((e) => e.at);
  assert.deepEqual(times, [...times].sort().reverse());
  // the paid event is the most recent thing that happened
  assert.equal(b.timeline[0].title, 'Paid');
  assert.equal(b.timeline[0].detail, '$285.00');
  assert.equal(b.counts.requests, 1);
  assert.equal(b.counts.visits, 1);
  assert.equal(b.counts.letters, 1);
});

await testAsync('a cancelled visit says so rather than vanishing', async () => {
  const d = base();
  d._raw.prepare(`INSERT INTO appointments (id,created_at,status,all_day,start_at,end_at,customer_id)
    VALUES ('a9','2026-03-01','cancelled',0,'2026-03-10T14:00:00Z','2026-03-10T16:00:00Z','c1')`).run();
  const b = await (await call(d, 'c1')).json();
  assert.equal(b.timeline[0].title, 'Visit cancelled');
  assert.equal(b.counts.visits, 0, 'a cancelled visit is not a visit she did');
});

await testAsync('a failed email reads as failed', async () => {
  const d = base();
  d._raw.prepare(`INSERT INTO email_log (id,created_at,kind,customer_id,to_email,subject,status)
    VALUES ('e2','2026-04-01T00:00:00Z','on_my_way','c1','x@y.test','On my way','failed')`).run();
  const b = await (await call(d, 'c1')).json();
  assert.equal(b.timeline[0].kind, 'mail_failed');
  assert.match(b.timeline[0].title, /did not go/);
});

/* customers predates the schedule and the email log, so a database that has
   not had those migrations yet must still open a profile. */
await testAsync('a profile opens even where the newer tables do not exist', async () => {
  const d = base(false);
  const r = await call(d, 'c1');
  assert.equal(r.status, 200);
  const b = await r.json();
  assert.equal(b.ok, true);
  assert.deepEqual(b.timeline, []);
});

await testAsync('an unknown client is a 404, and signed out is a 401', async () => {
  const d = base();
  assert.equal((await call(d, 'nobody')).status, 404);
  const out = await route.onRequestGet({
    request: new Request('https://x.test/api/admin/customers/c1'), env: env(d), params: { id: 'c1' } });
  assert.equal(out.status, 401);
});

/* ------------------------------ the facts reaching her at the door */
import * as sched from '../functions/api/admin/schedule.js';

const schedReq = async () => new Request('https://x.test/api/admin/schedule?from=2026-03-01&to=2026-03-31',
  { headers: await headers() });

function schedDb() {
  const d = makeD1(['0011_schedule.sql']);
  d._raw.exec(`CREATE TABLE properties (id TEXT PRIMARY KEY, customer_id TEXT, address TEXT,
    access TEXT, parking TEXT, pets TEXT, archived_at TEXT)`);
  return d;
}

await testAsync('the gate code rides along with the visit', async () => {
  const d = schedDb();
  d._raw.prepare(`INSERT INTO properties (id,customer_id,address,access,parking,pets)
    VALUES ('p1','c1','12 Ocean Ave','Gate code 4417','Driveway','Biscuit')`).run();
  d._raw.prepare(`INSERT INTO appointments (id,created_at,status,all_day,start_at,end_at,
    customer_id,address) VALUES ('a1','2026-03-01','confirmed',0,
    '2026-03-10T14:00:00Z','2026-03-10T16:00:00Z','c1','12 Ocean Ave')`).run();
  const b = await (await sched.onRequestGet({ request: await schedReq(), env: env(d) })).json();
  assert.equal(b.appointments[0].place.access, 'Gate code 4417');
  assert.equal(b.appointments[0].place.pets, 'Biscuit');
});

await testAsync('the gate code survives a database without the newer columns', async () => {
  /* bins, supplies, do_not_touch and warnings arrive with 0021. This is a
     database at the state production is in before it runs: asking for them
     throws, and throwing used to mean no facts at all, so every gate code
     would have vanished from every visit until the migration landed. */
  const d = schedDb();
  try { d._raw.prepare('ALTER TABLE properties DROP COLUMN bins').run(); } catch { /* never had it */ }
  try { d._raw.prepare('ALTER TABLE properties DROP COLUMN supplies').run(); } catch { /* ditto */ }
  try { d._raw.prepare('ALTER TABLE properties DROP COLUMN do_not_touch').run(); } catch { /* ditto */ }
  try { d._raw.prepare('ALTER TABLE properties DROP COLUMN warnings').run(); } catch { /* ditto */ }
  let gone = false;
  try { d._raw.prepare('SELECT warnings FROM properties').get(); } catch { gone = true; }
  assert.equal(gone, true, 'the column must really be absent for this to mean anything');

  d._raw.prepare(`INSERT INTO properties (id,customer_id,address,access,parking,pets)
    VALUES ('p1','c1','12 Ocean Ave','Gate code 4417','Driveway','Biscuit')`).run();
  d._raw.prepare(`INSERT INTO appointments (id,created_at,status,all_day,start_at,end_at,
    customer_id,address) VALUES ('a1','2026-03-01','confirmed',0,
    '2026-03-10T14:00:00Z','2026-03-10T16:00:00Z','c1','12 Ocean Ave')`).run();
  const b = await (await sched.onRequestGet({ request: await schedReq(), env: env(d) })).json();
  assert.equal(b.appointments[0].place.access, 'Gate code 4417');
});

/* A code for the wrong house is worse than no code. */
await testAsync('two addresses and no match means no facts, not the wrong ones', async () => {
  const d = schedDb();
  d._raw.prepare(`INSERT INTO properties (id,customer_id,address,access)
    VALUES ('p1','c1','12 Ocean Ave','Gate code 4417')`).run();
  d._raw.prepare(`INSERT INTO properties (id,customer_id,address,access)
    VALUES ('p2','c1','88 Palm Way','Lockbox 9900')`).run();
  d._raw.prepare(`INSERT INTO appointments (id,created_at,status,all_day,start_at,end_at,
    customer_id,address) VALUES ('a1','2026-03-01','confirmed',0,
    '2026-03-10T14:00:00Z','2026-03-10T16:00:00Z','c1','somewhere else entirely')`).run();
  const b = await (await sched.onRequestGet({ request: await schedReq(), env: env(d) })).json();
  assert.equal(b.appointments[0].place, undefined);
});

await testAsync('the right one of two addresses is matched, punctuation aside', async () => {
  const d = schedDb();
  d._raw.prepare(`INSERT INTO properties (id,customer_id,address,access)
    VALUES ('p1','c1','12 Ocean Ave','Gate code 4417')`).run();
  d._raw.prepare(`INSERT INTO properties (id,customer_id,address,access)
    VALUES ('p2','c1','88 Palm Way','Lockbox 9900')`).run();
  d._raw.prepare(`INSERT INTO appointments (id,created_at,status,all_day,start_at,end_at,
    customer_id,address) VALUES ('a1','2026-03-01','confirmed',0,
    '2026-03-10T14:00:00Z','2026-03-10T16:00:00Z','c1','88 palm way.')`).run();
  const b = await (await sched.onRequestGet({ request: await schedReq(), env: env(d) })).json();
  assert.equal(b.appointments[0].place.access, 'Lockbox 9900');
});

/* It is read, never copied, so yesterday's code is never shown. */
await testAsync('changing the code on the profile changes it on the visit', async () => {
  const d = schedDb();
  d._raw.prepare(`INSERT INTO properties (id,customer_id,address,access)
    VALUES ('p1','c1','12 Ocean Ave','Gate code 4417')`).run();
  d._raw.prepare(`INSERT INTO appointments (id,created_at,status,all_day,start_at,end_at,
    customer_id,address) VALUES ('a1','2026-03-01','confirmed',0,
    '2026-03-10T14:00:00Z','2026-03-10T16:00:00Z','c1','12 Ocean Ave')`).run();
  d._raw.prepare(`UPDATE properties SET access = 'Gate code 9999' WHERE id='p1'`).run();
  const b = await (await sched.onRequestGet({ request: await schedReq(), env: env(d) })).json();
  assert.equal(b.appointments[0].place.access, 'Gate code 9999');
});

await testAsync('a database without the newer columns still returns a diary', async () => {
  const d = makeD1(['0011_schedule.sql']);   // no properties table at all
  d._raw.prepare(`INSERT INTO appointments (id,created_at,status,all_day,start_at,end_at,customer_id)
    VALUES ('a1','2026-03-01','confirmed',0,'2026-03-10T14:00:00Z','2026-03-10T16:00:00Z','c1')`).run();
  const r = await sched.onRequestGet({ request: await schedReq(), env: env(d) });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).appointments.length, 1);
});

console.log('\n' + n + ' passed');
