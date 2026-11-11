/* Every customer letter goes through one route. The rule under test
   throughout: nothing reaches a customer unless she asked for it. */
import assert from 'node:assert/strict';
import { makeD1 } from './helpers/d1.mjs';
import { buildManualEmail, whenWords } from '../functions/_lib/email.js';
import * as route from '../functions/api/admin/email.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const testAsync = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

const SECRET = 'test-secret-email-centre';
async function headers() {
  const expires = String(Date.now() + 3600000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(expires));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(mac)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { 'Content-Type': 'application/json', Cookie: 'oasis_admin=' + expires + '.' + b64 };
}

function db() {
  const d = makeD1(['0011_schedule.sql', '0012_email_log.sql']);
  d._raw.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)`);
  d._raw.exec(`CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, name TEXT, email TEXT,
    service TEXT, service_label TEXT, address TEXT, city TEXT, customer_id TEXT)`);
  d._raw.exec(`CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, name TEXT, email TEXT)`);
  d._raw.prepare(`INSERT INTO leads (id,name,email,service_label,address,city,customer_id)
    VALUES ('l1','Maria Delgado','maria@example.test','Deep clean','12 Ocean Ave','Lake Worth','c1')`).run();
  d._raw.prepare(`INSERT INTO customers (id,name,email) VALUES ('c1','Maria Delgado','maria@example.test')`).run();
  d._raw.prepare(`INSERT INTO appointments (id,created_at,status,all_day,start_at,end_at,
    customer_name,service_label,address,city,customer_id,lead_id)
    VALUES ('a1','2026-11-11','confirmed',0,'2026-11-14T14:00:00.000Z','2026-11-14T16:00:00.000Z',
    'Maria Delgado','Deep clean','12 Ocean Ave','Lake Worth','c1','l1')`).run();
  return d;
}
const env = (d, extra = {}) => ({ DB: d, SESSION_SECRET: SECRET, SITE_URL: 'https://x.test', ...extra });
const post = async (b) => new Request('https://x.test/api/admin/email',
  { method: 'POST', headers: await headers(), body: JSON.stringify(b) });
const get = async (q) => new Request('https://x.test/api/admin/email?' + q, { headers: await headers() });

const withFetch = async (ok, fn) => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => ok
    ? new Response(JSON.stringify({ id: 'e1' }), { status: 200 })
    : new Response('no', { status: 500 });
  try { return await fn(); } finally { globalThis.fetch = real; }
};

/* ---------------------------------------------------------- the letters */

test('a time reads as a person would say it, in Florida time', () => {
  // 14:00Z in November is 9 AM Eastern
  assert.equal(whenWords('2026-11-14T14:00:00Z', '2026-11-14T16:00:00Z'),
    'Saturday, November 14, 9 AM to 11 AM');
});

test('an unknown kind writes nothing rather than guessing', () => {
  assert.equal(buildManualEmail({}, 'not_a_letter', {}), null);
});

test('the preview text is what the letter actually says', () => {
  const m = buildManualEmail({}, 'on_my_way', { customer_name: 'Maria Delgado' });
  assert.ok(m.message.includes('Hi Maria'));
  assert.ok(m.html.includes('Heading over to you now'));
  assert.equal(m.edited, false);
});

test('her rewrite is what goes out, and it is marked as rewritten', () => {
  const m = buildManualEmail({}, 'on_my_way',
    { customer_name: 'Maria', message: 'Running ten minutes late, sorry.', subject: 'Slight delay' });
  assert.equal(m.edited, true);
  assert.equal(m.subject, 'Slight delay');
  assert.ok(m.html.includes('Running ten minutes late'));
  assert.ok(m.text.includes('Running ten minutes late'));
  assert.ok(!m.html.includes('Heading over to you now'));
});

/* A review button that goes nowhere is worse than no review button. */
test('the review ask is dropped when there is nowhere to send them', () => {
  const without = buildManualEmail({}, 'visit_summary', { customer_name: 'Maria', settings: {} });
  assert.ok(!/review/i.test(without.message));
  const withUrl = buildManualEmail({}, 'visit_summary',
    { customer_name: 'Maria', settings: { review_url: 'https://g.page/r/abc' } });
  assert.ok(withUrl.html.includes('https://g.page/r/abc'));
});

/* ------------------------------------------------------------ the route */

await testAsync('a preview sends nothing at all', async () => {
  const d = db();
  let called = 0;
  await withFetch(true, async () => {
    const real = globalThis.fetch;
    globalThis.fetch = async (...a) => { called++; return real(...a); };
    const r = await route.onRequestPost({ request: await post(
      { kind: 'on_my_way', entity_id: 'a1' }), env: env(d, { RESEND_API_KEY: 'k' }) });
    const b = await r.json();
    assert.equal(b.preview, true);
    assert.ok(b.message.includes('Hi Maria'));
    assert.equal(b.to, 'maria@example.test');
  });
  assert.equal(called, 0, 'no send attempt was made');
  assert.equal((await d.prepare('SELECT * FROM email_log').all()).results.length, 0,
    'and nothing was logged');
});

await testAsync('send: true is the only thing that posts a letter', async () => {
  const d = db();
  await withFetch(true, async () => {
    const r = await route.onRequestPost({ request: await post(
      { kind: 'booking_confirmation', entity_id: 'a1', send: true }),
      env: env(d, { RESEND_API_KEY: 'k' }) });
    assert.equal(r.status, 200);
    const b = await r.json();
    assert.equal(b.status, 'sent');
  });
  const rows = (await d.prepare('SELECT * FROM email_log').all()).results;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'booking_confirmation');
  assert.equal(rows[0].to_email, 'maria@example.test');
  assert.equal(rows[0].customer_id, 'c1', 'logged against the client, not just the visit');
  assert.equal(rows[0].status, 'sent');
  assert.equal(rows[0].edited, 0);
});

/* sendEmail returns null on success and a MESSAGE on failure. */
await testAsync('a failure is logged as a failure, never as a send', async () => {
  const d = db();
  await withFetch(false, async () => {
    const r = await route.onRequestPost({ request: await post(
      { kind: 'on_my_way', entity_id: 'a1', send: true }), env: env(d, { RESEND_API_KEY: 'k' }) });
    assert.equal(r.status, 502);
    const b = await r.json();
    assert.match(b.error, /did not go out/);
  });
  const rows = (await d.prepare('SELECT * FROM email_log').all()).results;
  assert.equal(rows.length, 1, 'the attempt is still a fact worth keeping');
  assert.equal(rows[0].status, 'failed');
  assert.ok(rows[0].error);
});

await testAsync('a rewritten letter is logged as rewritten', async () => {
  const d = db();
  await withFetch(true, async () => {
    await route.onRequestPost({ request: await post(
      { kind: 'on_my_way', entity_id: 'a1', send: true, message: 'Ten minutes away.' }),
      env: env(d, { RESEND_API_KEY: 'k' }) });
  });
  const row = await d.prepare('SELECT * FROM email_log').first();
  assert.equal(row.edited, 1);
});

await testAsync('no address on file means tell her, not fail silently', async () => {
  const d = db();
  d._raw.prepare(`UPDATE customers SET email = NULL WHERE id='c1'`).run();
  d._raw.prepare(`UPDATE leads SET email = NULL WHERE id='l1'`).run();
  const r = await route.onRequestPost({ request: await post(
    { kind: 'on_my_way', entity_id: 'a1', send: true }), env: env(d, { RESEND_API_KEY: 'k' }) });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /text it instead/);
  assert.equal((await d.prepare('SELECT * FROM email_log').all()).results.length, 0);
});

await testAsync('an unknown kind cannot be sent', async () => {
  const d = db();
  const r = await route.onRequestPost({ request: await post(
    { kind: 'wire_money', entity_id: 'a1', send: true }), env: env(d) });
  assert.equal(r.status, 400);
});

await testAsync('signed out, nothing can be previewed or sent', async () => {
  const d = db();
  const r = await route.onRequestPost({
    request: new Request('https://x.test/api/admin/email', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'on_my_way', entity_id: 'a1', send: true }) }),
    env: env(d, { RESEND_API_KEY: 'k' }) });
  assert.equal(r.status, 401);
  assert.equal((await d.prepare('SELECT * FROM email_log').all()).results.length, 0);
});

/* The interconnection: a letter sent from the diary shows on the client. */
await testAsync('the log reads back by visit and by client', async () => {
  const d = db();
  await withFetch(true, async () => {
    await route.onRequestPost({ request: await post(
      { kind: 'visit_reminder', entity_id: 'a1', send: true }), env: env(d, { RESEND_API_KEY: 'k' }) });
  });
  const byEntity = await (await route.onRequestGet({
    request: await get('entity_kind=appointment&entity_id=a1'), env: env(d) })).json();
  assert.equal(byEntity.sent.length, 1);
  const byCustomer = await (await route.onRequestGet({
    request: await get('customer_id=c1'), env: env(d) })).json();
  assert.equal(byCustomer.sent.length, 1, 'the same letter, found from the client profile');
});

/* --------------------------------------------------------- the drawer */
import { readFileSync } from 'node:fs';
const JS = readFileSync(new URL('../public/js/admin.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../public/css/admin.css', import.meta.url), 'utf8');

test('opening the drawer cannot send anything', () => {
  const fn = JS.slice(JS.indexOf('function previewMail('));
  const body = fn.slice(0, fn.indexOf('\n  }'));
  assert.ok(!/send:\s*true/.test(body), 'the preview call must never ask for a send');
});

test('only the Send button asks for a send', () => {
  const sends = JS.match(/send:\s*true/g) || [];
  assert.equal(sends.length, 1, 'exactly one place in the portal may send');
  const fn = JS.slice(JS.indexOf('function sendMail('));
  assert.match(fn.slice(0, fn.indexOf('\n  }')), /send:\s*true/);
});

test('she can read it, change it, copy it, or walk away', () => {
  assert.match(JS, /data-mail-subject/);
  assert.match(JS, /data-mail-message/);
  assert.match(JS, /data-mail-send/);
  assert.match(JS, /data-mail-copy/);
  assert.match(JS, /Do not send/);
});

/* Tapping Send does not always blur the field first. */
test('the letter is read from the field itself, not from a change event', () => {
  const fn = JS.slice(JS.indexOf('function sendMail('));
  const body = fn.slice(0, fn.indexOf('\n  }'));
  assert.match(body, /querySelector\('\[data-mail-subject\]'\)/);
  assert.match(body, /querySelector\('\[data-mail-message\]'\)/);
  assert.ok(body.indexOf('msgEl.value') < body.indexOf('api('),
    'the fields must be read before the request is built');
});

test('each letter says when it last went, in words', () => {
  assert.match(JS, /Sent ' \+ esc\(when\)|'Sent '/);
  assert.match(JS, /Did not go/);
  assert.match(JS, /Not sent/);
  assert.match(CSS, /\.mail__stamp--bad/);
});

/* Sand is this portal's warning colour; a list of letters is not a warning. */
test('the drawer does not borrow the warning colour', () => {
  const rule = CSS.slice(CSS.indexOf('.mail {'));
  assert.ok(!/oasis-sand/.test(rule.slice(0, rule.indexOf('}'))));
});

console.log('\n' + n + ' passed');
