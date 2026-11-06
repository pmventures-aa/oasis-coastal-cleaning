/* Offering a customer a few times to pick from.
   The rule under test throughout: an offer is a question, never a promise.
   Nothing may be booked that the live diary does not still say is free. */
import assert from 'node:assert/strict';
import { makeD1 } from './helpers/d1.mjs';
import {
  normalizeSlots, slotAvailability, offerState, cleanDuration, anyFree, expiryFrom
} from '../functions/_lib/offers.js';
import { onRequestGet as offerGet, onRequestPost as offerPost } from '../functions/api/offer/[token].js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const testAsync = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

const iso = (d) => d.toISOString();
const hoursFromNow = (h) => new Date(Date.now() + h * 3600000);

/* ------------------------------------------------------------ pure rules */

test('a time already gone is never offered', () => {
  const { slots, dropped } = normalizeSlots([
    { start_at: iso(hoursFromNow(-2)) },
    { start_at: iso(hoursFromNow(48)) }
  ], 120);
  assert.equal(slots.length, 1);
  assert.match(dropped[0].why, /already passed/);
});

test('the same time twice is one offer', () => {
  const at = iso(hoursFromNow(24));
  const { slots } = normalizeSlots([{ start_at: at }, { start_at: at }], 120);
  assert.equal(slots.length, 1);
});

/* Whichever they pick, the other was never really free. */
test('two offered times that overlap each other are not both offered', () => {
  const base = hoursFromNow(24);
  const { slots, dropped } = normalizeSlots([
    { start_at: iso(base) },
    { start_at: iso(new Date(base.getTime() + 3600000)) }   // 1h later, 2h long
  ], 120);
  assert.equal(slots.length, 1);
  assert.match(dropped[0].why, /overlaps/);
});

test('offered times come back in time order however they were typed', () => {
  const { slots } = normalizeSlots([
    { start_at: iso(hoursFromNow(72)) },
    { start_at: iso(hoursFromNow(24)) }
  ], 60);
  assert.ok(slots[0].start_at < slots[1].start_at);
});

test('a local day and time becomes the right instant', () => {
  const { slots } = normalizeSlots([{ date: '2027-07-04', time: '09:00' }], 120);
  assert.equal(slots.length, 1);
  // July, so EDT = UTC-4
  assert.equal(slots[0].start_at, '2027-07-04T13:00:00.000Z');
  assert.equal(slots[0].end_at, '2027-07-04T15:00:00.000Z');
});

test('a winter date uses the winter offset, not July’s', () => {
  const { slots } = normalizeSlots([{ date: '2027-01-12', time: '09:00' }], 60);
  assert.equal(slots[0].start_at, '2027-01-12T14:00:00.000Z');   // EST = UTC-5
});

test('no more than five times go on one offer', () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ start_at: iso(hoursFromNow(24 + i * 24)) }));
  assert.equal(normalizeSlots(many, 60).slots.length, 5);
});

test('a silly duration falls back to something sane', () => {
  assert.equal(cleanDuration(0), 120);
  assert.equal(cleanDuration(-5), 120);
  assert.equal(cleanDuration(99999), 720);
  assert.equal(cleanDuration(90), 90);
});

test('an offer that has been answered, withdrawn or has expired is not live', () => {
  assert.equal(offerState({ status: 'open', expires_at: iso(hoursFromNow(24)) }).live, true);
  assert.equal(offerState({ status: 'booked' }).reason, 'booked');
  assert.equal(offerState({ status: 'withdrawn' }).reason, 'withdrawn');
  assert.equal(offerState({ status: 'open', expires_at: iso(hoursFromNow(-1)) }).reason, 'expired');
});

test('a slot the diary has filled is not free', () => {
  const start = hoursFromNow(24), end = new Date(start.getTime() + 7200000);
  const slots = [{ id: 's1', start_at: iso(start), end_at: iso(end) }];
  const booked = [{ id: 'a1', status: 'confirmed', all_day: 0,
    start_at: iso(new Date(start.getTime() + 3600000)), end_at: iso(new Date(end.getTime() + 3600000)) }];
  assert.equal(slotAvailability(slots, { appointments: booked })[0].free, false);
  assert.equal(slotAvailability(slots, { appointments: [] })[0].free, true);
});

test('a cancelled cleaning releases the time it was holding', () => {
  const start = hoursFromNow(24), end = new Date(start.getTime() + 7200000);
  const slots = [{ id: 's1', start_at: iso(start), end_at: iso(end) }];
  const cancelled = [{ id: 'a1', status: 'cancelled', all_day: 0, start_at: iso(start), end_at: iso(end) }];
  assert.equal(slotAvailability(slots, { appointments: cancelled })[0].free, true);
});

test('a link with nothing left on it is worth nothing', () => {
  assert.equal(anyFree([{ free: false }, { free: false }]), false);
  assert.equal(anyFree([{ free: false }, { free: true }]), true);
});

test('expiry is clamped to something reasonable', () => {
  assert.ok(new Date(expiryFrom(0)) > new Date());
  const far = new Date(expiryFrom(9999)).getTime() - Date.now();
  assert.ok(far <= 61 * 86400000);
});

/* ------------------------------------------------- the route, end to end */

const DB = () => makeD1(['0011_schedule.sql', '0012_time_offers.sql']);
const env = (db) => ({ DB: db });

async function seedOffer(db, slots, extra = {}) {
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO time_offers (id, token, created_at, customer_name, service_label,
       phone, address, city, duration_minutes, status, expires_at, note)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind('off-1', 'tok-1', now, 'Maria Delgado', 'Deep clean', '5615550142',
    '12 Ocean Ave', 'Lake Worth', 120, extra.status || 'open',
    extra.expires_at || new Date(Date.now() + 7 * 86400000).toISOString(),
    'Whichever suits you').run();
  let i = 0;
  for (const s of slots) {
    await db.prepare(
      `INSERT INTO time_offer_slots (id, offer_id, position, start_at, end_at) VALUES (?,?,?,?,?)`
    ).bind('ofs-' + (++i), 'off-1', i, s.start_at, s.end_at).run();
  }
  return 'tok-1';
}

const twoSlots = () => {
  const a = hoursFromNow(48), b = hoursFromNow(72);
  return [
    { start_at: iso(a), end_at: iso(new Date(a.getTime() + 7200000)) },
    { start_at: iso(b), end_at: iso(new Date(b.getTime() + 7200000)) }
  ];
};

const req = (body) => new Request('https://x.test/api/offer/tok-1', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

await testAsync('the public page never sees her internal ids', async () => {
  const db = DB();
  await seedOffer(db, twoSlots());
  const r = await offerGet({ env: env(db), params: { token: 'tok-1' } });
  const b = await r.json();
  const text = JSON.stringify(b);
  assert.ok(b.live);
  assert.equal(b.offer.customer_name, 'Maria Delgado');
  for (const secret of ['off-1', 'tok-1', 'lead_id', '12 Ocean Ave', '5615550142']) {
    assert.ok(!text.includes(secret), 'leaked ' + secret);
  }
});

await testAsync('picking a free time books it, at exactly that time', async () => {
  const db = DB();
  const slots = twoSlots();                 // the ones actually seeded
  await seedOffer(db, slots);
  const r = await offerPost({ request: req({ slot_id: 'ofs-1' }), env: env(db), params: { token: 'tok-1' } });
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.equal(b.status, 'booked');
  const appt = await db.prepare('SELECT * FROM appointments').first();
  assert.equal(appt.status, 'confirmed');
  assert.equal(appt.customer_name, 'Maria Delgado');
  assert.equal(appt.start_at, slots[0].start_at);   // the whole instant, not a prefix
  assert.equal(appt.end_at, slots[0].end_at);
  assert.equal(appt.all_day, 0);
  // the details she needs on the day travel with it
  assert.equal(appt.address, '12 Ocean Ave');
  assert.equal(appt.phone, '5615550142');
  const offer = await db.prepare('SELECT * FROM time_offers WHERE id = ?').bind('off-1').first();
  assert.equal(offer.status, 'booked');
  assert.equal(offer.chosen_slot_id, 'ofs-1');
  assert.equal(offer.appointment_id, appt.id);
});

/* The one that matters: she filled the slot herself after sending the link. */
await testAsync('a time taken since the link was sent is refused, not double-booked', async () => {
  const db = DB();
  const slots = twoSlots();
  await seedOffer(db, slots);
  await db.prepare(
    `INSERT INTO appointments (id, created_at, status, all_day, start_at, end_at, customer_name)
     VALUES (?,?,?,?,?,?,?)`
  ).bind('apt-other', new Date().toISOString(), 'confirmed', 0,
    slots[0].start_at, slots[0].end_at, 'Somebody else').run();

  const r = await offerPost({ request: req({ slot_id: 'ofs-1' }), env: env(db), params: { token: 'tok-1' } });
  const b = await r.json();
  assert.equal(r.status, 409);
  assert.equal(b.taken, true);
  const count = (await db.prepare('SELECT * FROM appointments').all()).results.length;
  assert.equal(count, 1, 'nothing new was written');
  // and it hands back the list so they can take the other one
  assert.equal(b.slots.find((s) => s.id === 'ofs-1').free, false);
  assert.equal(b.slots.find((s) => s.id === 'ofs-2').free, true);
});

await testAsync('a taken time is shown as gone rather than hidden', async () => {
  const db = DB();
  const slots = twoSlots();
  await seedOffer(db, slots);
  await db.prepare(
    `INSERT INTO appointments (id, created_at, status, all_day, start_at, end_at)
     VALUES (?,?,?,?,?,?)`
  ).bind('apt-x', new Date().toISOString(), 'confirmed', 0, slots[1].start_at, slots[1].end_at).run();
  const b = await (await offerGet({ env: env(db), params: { token: 'tok-1' } })).json();
  assert.equal(b.slots.length, 2);
  assert.equal(b.slots[1].free, false);
  assert.equal(b.slots[1].gone, 'taken');
});

await testAsync('tapping twice books once and shows the same answer', async () => {
  const db = DB();
  await seedOffer(db, twoSlots());
  const first = await (await offerPost({ request: req({ slot_id: 'ofs-1' }), env: env(db), params: { token: 'tok-1' } })).json();
  const second = await offerPost({ request: req({ slot_id: 'ofs-2' }), env: env(db), params: { token: 'tok-1' } });
  const b = await second.json();
  assert.equal(second.status, 200);
  assert.equal(b.already, true);
  assert.equal(b.chosen.id, 'ofs-1', 'the second tap must not move the booking');
  assert.equal((await db.prepare('SELECT * FROM appointments').all()).results.length, 1);
  assert.equal(first.chosen.id, 'ofs-1');
});

await testAsync('an expired link books nothing', async () => {
  const db = DB();
  await seedOffer(db, twoSlots(), { expires_at: new Date(Date.now() - 1000).toISOString() });
  const r = await offerPost({ request: req({ slot_id: 'ofs-1' }), env: env(db), params: { token: 'tok-1' } });
  assert.equal(r.status, 410);
  assert.equal((await db.prepare('SELECT * FROM appointments').all()).results.length, 0);
});

await testAsync('a withdrawn offer books nothing', async () => {
  const db = DB();
  await seedOffer(db, twoSlots(), { status: 'withdrawn' });
  const r = await offerPost({ request: req({ slot_id: 'ofs-1' }), env: env(db), params: { token: 'tok-1' } });
  assert.equal(r.status, 410);
  assert.equal((await db.prepare('SELECT * FROM appointments').all()).results.length, 0);
});

await testAsync('a slot id from somebody else’s offer is refused', async () => {
  const db = DB();
  await seedOffer(db, twoSlots());
  const r = await offerPost({ request: req({ slot_id: 'ofs-999' }), env: env(db), params: { token: 'tok-1' } });
  assert.equal(r.status, 400);
  assert.equal((await db.prepare('SELECT * FROM appointments').all()).results.length, 0);
});

await testAsync('an unknown token says nothing about whether it ever existed', async () => {
  const db = DB();
  await seedOffer(db, twoSlots());
  const r = await offerGet({ env: env(db), params: { token: 'not-a-token' } });
  assert.equal(r.status, 404);
  const b = await r.json();
  assert.equal(b.error, 'Not found.');
});

/* ------------------------------------------------------- the admin side */
import { onRequestPost as adminPost, onRequestGet as adminGet }
  from '../functions/api/admin/offers.js';

/* A real signed-in request, so the gate is passed and the conflict check
   is genuinely exercised. Accepting "401 or 409" would have let this test
   pass on the gate alone and prove nothing. */
const SECRET = 'test-secret-for-offers';
async function signedHeaders() {
  const expires = String(Date.now() + 3600000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(expires));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(mac)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { 'Content-Type': 'application/json', Cookie: 'oasis_admin=' + expires + '.' + b64 };
}
const adminEnv = (db) => ({ DB: db, SESSION_SECRET: SECRET, SITE_URL: 'https://x.test' });

const adminReq = async (body) => new Request('https://x.test/api/admin/offers', {
  method: 'POST', headers: await signedHeaders(), body: JSON.stringify(body)
});

await testAsync('a signed-in request really does reach the offer routes', async () => {
  const db = DB();
  const r = await adminGet({ request: new Request('https://x.test/api/admin/offers',
    { headers: await signedHeaders() }), env: adminEnv(db) });
  assert.equal(r.status, 200, 'the gate should let a signed request through');
});

await testAsync('she cannot offer a time she has already filled', async () => {
  const db = DB();
  const when = hoursFromNow(48);
  await db.prepare(
    `INSERT INTO appointments (id, created_at, status, all_day, start_at, end_at, customer_name)
     VALUES (?,?,?,?,?,?,?)`
  ).bind('apt-busy', new Date().toISOString(), 'confirmed', 0,
    iso(when), iso(new Date(when.getTime() + 7200000)), 'Already booked').run();

  const r = await adminPost({
    request: await adminReq({ customer_name: 'Maria', duration_minutes: 120,
      slots: [{ start_at: iso(when) }] }),
    env: adminEnv(db)
  });
  assert.equal(r.status, 409, 'the clash must be refused, not saved');
  const b = await r.json();
  assert.match(b.error, /taken/);
  assert.equal((await db.prepare('SELECT * FROM time_offers').all()).results.length, 0);
});

await testAsync('she can send the free ones anyway when she means to', async () => {
  const db = DB();
  const busy = hoursFromNow(48), free = hoursFromNow(72);
  await db.prepare(
    `INSERT INTO appointments (id, created_at, status, all_day, start_at, end_at)
     VALUES (?,?,?,?,?,?)`
  ).bind('apt-busy', new Date().toISOString(), 'confirmed', 0,
    iso(busy), iso(new Date(busy.getTime() + 7200000))).run();

  const r = await adminPost({
    request: await adminReq({ customer_name: 'Maria', duration_minutes: 120,
      slots: [{ start_at: iso(busy) }, { start_at: iso(free) }], override: true }),
    env: adminEnv(db)
  });
  assert.equal(r.status, 201);
  const b = await r.json();
  // extension-less, like the quote links: it is texted to people
  assert.match(b.url, /\/offer\?t=/);
  assert.ok(!b.url.includes('.html'), 'no redirect hop in a link she texts');
  // the clashing one is still ON the offer, but the public page will show it
  // as gone rather than pretend it was never offered
  assert.equal(b.offer.slots.length, 2);
});

await testAsync('an offer with only past times is refused outright', async () => {
  const db = DB();
  const r = await adminPost({
    request: await adminReq({ customer_name: 'Maria',
      slots: [{ start_at: iso(hoursFromNow(-5)) }] }),
    env: adminEnv(db)
  });
  assert.equal(r.status, 400);
  assert.equal((await db.prepare('SELECT * FROM time_offers').all()).results.length, 0);
});



/* ------------------------------------------------- emailing it to them */

/* sendEmail returns null when it went and a MESSAGE when it did not, which
   is the opposite of what a truthy check would assume. A send reported as
   successful when it failed leaves her believing a link went out. */
const mailEnv = (db, outcome) => ({
  DB: db, SESSION_SECRET: SECRET, SITE_URL: 'https://x.test',
  RESEND_API_KEY: 'test-key',
  // the real sendEmail talks to Resend; stub fetch so nothing leaves here
  __outcome: outcome
});

const withFetch = async (outcome, fn) => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => outcome === 'ok'
    ? new Response(JSON.stringify({ id: 'e1' }), { status: 200 })
    : new Response('nope', { status: 500 });
  try { return await fn(); } finally { globalThis.fetch = real; }
};

await testAsync('nothing is emailed unless she ticks the box', async () => {
  const db = DB();
  let called = 0;
  await withFetch('ok', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = async (...a) => { called++; return real(...a); };
    const r = await adminPost({
      request: await adminReq({ customer_name: 'Maria', email: 'maria@example.test',
        slots: [{ start_at: iso(hoursFromNow(48)) }] }),
      env: mailEnv(db)
    });
    assert.equal(r.status, 201);
    const b = await r.json();
    assert.equal(b.emailed, false);
  });
  assert.equal(called, 0, 'no send attempt was made');
});

await testAsync('ticking the box with no address is refused before anything is saved', async () => {
  const db = DB();
  const r = await adminPost({
    request: await adminReq({ customer_name: 'Maria', send_email: true,
      slots: [{ start_at: iso(hoursFromNow(48)) }] }),
    env: mailEnv(db)
  });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /email address/i);
  assert.equal((await db.prepare('SELECT * FROM time_offers').all()).results.length, 0);
});

await testAsync('a malformed address is refused too', async () => {
  const db = DB();
  const r = await adminPost({
    request: await adminReq({ customer_name: 'Maria', send_email: true, email: 'not-an-address',
      slots: [{ start_at: iso(hoursFromNow(48)) }] }),
    env: mailEnv(db)
  });
  assert.equal(r.status, 400);
  assert.equal((await db.prepare('SELECT * FROM time_offers').all()).results.length, 0);
});

await testAsync('ticking the box emails it and says so', async () => {
  const db = DB();
  await withFetch('ok', async () => {
    const r = await adminPost({
      request: await adminReq({ customer_name: 'Maria', send_email: true,
        email: 'maria@example.test', service_label: 'Deep clean',
        slots: [{ start_at: iso(hoursFromNow(48)) }, { start_at: iso(hoursFromNow(72)) }] }),
      env: mailEnv(db)
    });
    assert.equal(r.status, 201);
    const b = await r.json();
    assert.equal(b.emailed, true);
    assert.equal(b.emailedTo, 'maria@example.test');
    assert.equal(b.emailError, null);
  });
});

/* The trap: a failed send must never read as a sent one. */
await testAsync('a failed send is reported as failed, and the link still works', async () => {
  const db = DB();
  await withFetch('fail', async () => {
    const r = await adminPost({
      request: await adminReq({ customer_name: 'Maria', send_email: true,
        email: 'maria@example.test', slots: [{ start_at: iso(hoursFromNow(48)) }] }),
      env: mailEnv(db)
    });
    assert.equal(r.status, 201, 'the offer itself is not rolled back for a bad email');
    const b = await r.json();
    assert.equal(b.emailed, false, 'a failure must not read as a send');
    assert.ok(b.emailError, 'and it must say what happened');
    assert.equal(b.emailedTo, null);
    assert.match(b.url, /\/offer\?t=/);     // she can still text it
  });
  assert.equal((await db.prepare('SELECT * FROM time_offers').all()).results.length, 1);
});

await testAsync('with no mail provider configured at all it does not claim a send', async () => {
  const db = DB();
  const r = await adminPost({
    request: await adminReq({ customer_name: 'Maria', send_email: true,
      email: 'maria@example.test', slots: [{ start_at: iso(hoursFromNow(48)) }] }),
    env: { DB: db, SESSION_SECRET: SECRET, SITE_URL: 'https://x.test' }   // no keys
  });
  const b = await r.json();
  assert.equal(b.emailed, false);
  assert.match(b.emailError, /notification channel|did not go out/i);
});

await testAsync('the email lists the times, not just a bare link', async () => {
  const { buildOfferEmail } = await import('../functions/_lib/email.js');
  const start = new Date('2027-07-04T13:00:00.000Z');       // 9am EDT
  const mail = buildOfferEmail({ SITE_URL: 'https://x.test' }, {
    offer: { customer_name: 'Maria Delgado', service_label: 'Deep clean', note: 'Any of these suit?' },
    slots: [{ start_at: start.toISOString(), end_at: new Date(start.getTime() + 7200000).toISOString() }],
    offerUrl: 'https://x.test/offer?t=abc'
  });
  assert.match(mail.subject, /pick whichever suits you/i);
  for (const src of [mail.html, mail.text]) {
    assert.match(src, /Sunday, July 4/);
    assert.match(src, /9 AM|9:00/);
    assert.match(src, /x\.test\/offer\?t=abc/);
  }
  assert.match(mail.html, /Any of these suit\?/);
  assert.match(mail.html, /not held/);         // honest about what an offer is
});

/* ------------------------------------------------------- the two screens */
import { readFileSync } from 'node:fs';
const ADMIN = readFileSync(new URL('../public/js/admin.js', import.meta.url), 'utf8');
const PUBJS = readFileSync(new URL('../public/js/offer.js', import.meta.url), 'utf8');
const ADMINCSS = readFileSync(new URL('../public/css/admin.css', import.meta.url), 'utf8');

test('the form never opens on a day that is already behind her', () => {
  const fn = ADMIN.slice(ADMIN.indexOf('function blankOfferSlot'));
  const body = fn.slice(0, fn.indexOf('\n  }'));
  assert.match(body, /isoDateET\(new Date\(\)\)/);
  assert.match(body, /day <= today/);
  // localIso takes a date STRING plus a time; calling it with a Date throws
  assert.ok(!/localIso\(new Date\(\)\)/.test(body));
});

test('an offered time on the calendar cannot be mistaken for a booking', () => {
  assert.match(ADMIN, /ev--offer/);
  assert.match(ADMIN, /Waiting for an answer — not booked/);
  assert.match(ADMIN, /pill--offer/);
  // said in words, not only in a dashed border
  assert.match(ADMINCSS, /\.ev--offer \{ border-style: dashed/);
});

test('an offered time reads the same clock format as a booking', () => {
  const fn = ADMIN.slice(ADMIN.indexOf('function offerSlotHtml'));
  assert.match(fn.slice(0, fn.indexOf('\n  }')), /rangeOf\(slot\)/);
});

test('a day holding an offer is not called free', () => {
  assert.match(ADMIN, /offered \? 'Nothing booked yet'/);
});

/* The page must never claim a time is theirs before the server says so. */
test('the picker only celebrates once the server has confirmed', () => {
  assert.match(PUBJS, /if \(r\.ok && r\.body\.ok\)/);
  // the booked screen is reached from state the server set, not from the tap
  assert.match(PUBJS, /state\.chosen = r\.body\.chosen/);
  assert.match(PUBJS, /Nothing is booked until you choose/);
});

test('when the server sends a fresher list the page uses it, not its own', () => {
  assert.match(PUBJS, /if \(r\.body\.slots\) state\.slots = r\.body\.slots/);
});

test('a time that has gone is shown struck through AND labelled', () => {
  const css = readFileSync(new URL('../public/css/site.css', import.meta.url), 'utf8');
  assert.match(css, /\.pslot--gone/);
  assert.match(PUBJS, /Just taken/);
  assert.match(PUBJS, /Already passed/);
});

test('the email is opt-in, and the address only asked for when ticked', () => {
  assert.match(ADMIN, /data-of-send/);
  assert.match(ADMIN, /Email it to them as well as giving me the link/);
  // the address field is rendered only when the box is ticked
  assert.match(ADMIN, /f\.sendEmail\s*\?\s*'<label class="bfield"><span>Their email/);
  // and a new form starts unticked
  assert.match(ADMIN, /sendEmail: false/);
});

test('the button admits that it is about to email a customer', () => {
  assert.match(ADMIN, /Email it and make the link/);
  assert.match(ADMIN, /f\.sendEmail \? 'Sending…'/);
});

test('the panel says whether it emailed, and never guesses', () => {
  assert.match(ADMIN, /f\.made\.emailed/);
  assert.match(ADMIN, /It did not email/);
  assert.match(ADMIN, /The link below still works/);
  assert.match(ADMINCSS, /\.bform__sent/);
  assert.match(ADMINCSS, /\.bform__err/);   // was used in two places, styled in none
});

test('success is read from null, which is what sendEmail returns when it went', async () => {
  const src = readFileSync(new URL('../functions/api/admin/offers.js', import.meta.url), 'utf8');
  assert.match(src, /emailed = sent === null/);
  assert.ok(!/sent !== false/.test(src), 'a truthy check here reports every failure as a send');
});

console.log('\n' + n + ' passed');
