import test from 'node:test';
import assert from 'node:assert/strict';
import { verifySvixWebhook, describeWebhookSecret } from '../functions/_lib/webhook.js';

/* The published Svix test vector. If our signing ever drifts from this, every
   real delivery is rejected and Resend eventually disables the endpoint — which
   is exactly what happened, so it is worth pinning. */
const SECRET  = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
const PAYLOAD = '{"test": 2432232314}';
const ID      = 'msg_p5jXN8AQM9LWM0D4loKWxJek';

function headers(map) { return { headers: { get: (k) => (k in map ? map[k] : null) } }; }

async function signed(payload = PAYLOAD, secret = SECRET, ts = Math.floor(Date.now() / 1000)) {
  const b64 = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const key = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ID}.${ts}.${payload}`));
  return { ts: String(ts), sig: 'v1,' + btoa(String.fromCharCode(...new Uint8Array(sig))) };
}

test('webhook signature verification', async (t) => {
  await t.test('matches the published Svix vector', async () => {
    const { sig } = await signed(PAYLOAD, SECRET, 1614265330);
    assert.equal(sig, 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=');
  });

  await t.test('accepts a correctly signed delivery', async () => {
    const { ts, sig } = await signed();
    const req = headers({ 'svix-id': ID, 'svix-timestamp': ts, 'svix-signature': sig });
    assert.equal(await verifySvixWebhook(req, PAYLOAD, SECRET), null);
  });

  await t.test('accepts when the header carries several signatures (key rotation)', async () => {
    const { ts, sig } = await signed();
    const multi = 'v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= ' + sig;
    const req = headers({ 'svix-id': ID, 'svix-timestamp': ts, 'svix-signature': multi });
    assert.equal(await verifySvixWebhook(req, PAYLOAD, SECRET), null);
  });

  await t.test('accepts a secret pasted without the whsec_ prefix', async () => {
    const { ts, sig } = await signed();
    const req = headers({ 'svix-id': ID, 'svix-timestamp': ts, 'svix-signature': sig });
    assert.equal(await verifySvixWebhook(req, PAYLOAD, SECRET.slice(6)), null);
  });

  await t.test('rejects a tampered body', async () => {
    const { ts, sig } = await signed();
    const req = headers({ 'svix-id': ID, 'svix-timestamp': ts, 'svix-signature': sig });
    assert.equal(await verifySvixWebhook(req, '{"test": 1}', SECRET), 'Invalid Svix signature.');
  });

  await t.test('rejects a replayed delivery', async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    const { ts, sig } = await signed(PAYLOAD, SECRET, old);
    const req = headers({ 'svix-id': ID, 'svix-timestamp': ts, 'svix-signature': sig });
    assert.equal(await verifySvixWebhook(req, PAYLOAD, SECRET), 'Svix timestamp outside tolerance.');
  });

  await t.test('fails closed when no secret is configured', async () => {
    const { ts, sig } = await signed();
    const req = headers({ 'svix-id': ID, 'svix-timestamp': ts, 'svix-signature': sig });
    assert.equal(await verifySvixWebhook(req, PAYLOAD, ''), 'Webhook secret is not configured.');
  });

  await t.test('a malformed secret is rejected, not thrown', async () => {
    const { ts, sig } = await signed();
    const req = headers({ 'svix-id': ID, 'svix-timestamp': ts, 'svix-signature': sig });
    assert.equal(
      await verifySvixWebhook(req, PAYLOAD, 'whsec_not valid base64!!'),
      'Webhook secret is not a valid signing secret.'
    );
  });

  await t.test('missing headers are reported separately from a bad signature', async () => {
    const req = headers({});
    assert.equal(await verifySvixWebhook(req, PAYLOAD, SECRET), 'Missing Svix signature headers.');
  });
});

test('describeWebhookSecret names the problem without leaking the value', async (t) => {
  await t.test('a real signing secret is usable', () => {
    const d = describeWebhookSecret(SECRET);
    assert.equal(d.usable, true);
    assert.equal(d.problem, null);
    assert.ok(!JSON.stringify(d).includes('MfKQ'));
  });

  await t.test('an API key pasted by mistake is caught by name', () => {
    assert.deepEqual(
      describeWebhookSecret('re_1234567890abcdefghij'),
      { set: true, usable: false, problem: 'api-key' }
    );
  });

  await t.test('an unset secret reads as missing, not as working', () => {
    assert.equal(describeWebhookSecret('').usable, false);
    assert.equal(describeWebhookSecret(undefined).problem, 'missing');
  });

  await t.test('a truncated or unreadable secret is not usable', () => {
    assert.equal(describeWebhookSecret('whsec_!!!!').usable, false);
    assert.equal(describeWebhookSecret('whsec_YWI=').problem, 'too-short');
  });

  await t.test('whitespace around a pasted secret does not break it', () => {
    assert.equal(describeWebhookSecret('  ' + SECRET + '\n').usable, true);
  });
});

/* ------------------------------------------------------------- outcome note
   A well-formed but wrong secret is the case shape cannot see, so the last
   delivery's result is what the portal actually leans on. */
import { recordWebhookOutcome, readWebhookOutcome } from '../functions/_lib/webhook.js';

function makeDb() {
  const store = new Map();
  let writes = 0;
  const api = (...a) => ({
    first: async () => (store.has(a[0]) ? { value: store.get(a[0]) } : null),
    run: async () => { writes++; store.set(a[0], a[1]); }
  });
  return { store, get writes() { return writes; }, prepare: () => ({ bind: api, first: api().first }) };
}

test('remembering how the last delivery went', async (t) => {
  await t.test('records a rejection with its reason', async () => {
    const db = makeDb();
    await recordWebhookOutcome(db, false, 'Invalid Svix signature.');
    const out = await readWebhookOutcome(db);
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'Invalid Svix signature.');
    assert.ok(out.at > 0);
  });

  await t.test('records a success and drops the stale reason', async () => {
    const db = makeDb();
    await recordWebhookOutcome(db, false, 'Invalid Svix signature.');
    await recordWebhookOutcome(db, true, null);
    const out = await readWebhookOutcome(db);
    assert.equal(out.ok, true);
    assert.equal(out.reason, null);
  });

  await t.test('a burst of identical results is not a burst of writes', async () => {
    const db = makeDb();
    for (let i = 0; i < 25; i++) await recordWebhookOutcome(db, false, 'Invalid Svix signature.');
    assert.equal(db.writes, 1);
  });

  await t.test('but a change of result is always written through', async () => {
    const db = makeDb();
    await recordWebhookOutcome(db, false, 'Invalid Svix signature.');
    await recordWebhookOutcome(db, true, null);
    assert.equal(db.writes, 2);
  });

  await t.test('no database, or a broken one, never throws', async () => {
    await recordWebhookOutcome(null, false, 'x');
    const broken = { prepare: () => { throw new Error('no such table: settings'); } };
    await recordWebhookOutcome(broken, false, 'x');
    assert.equal(await readWebhookOutcome(broken), null);
    assert.equal(await readWebhookOutcome(null), null);
  });

  await t.test('unreadable stored value reads as unknown, not as working', async () => {
    const db = makeDb();
    db.store.set('webhook_last', 'not json');
    assert.equal(await readWebhookOutcome(db), null);
  });

  await t.test('the reason is capped so a long error cannot bloat the row', async () => {
    const db = makeDb();
    await recordWebhookOutcome(db, false, 'e'.repeat(5000));
    assert.equal((await readWebhookOutcome(db)).reason.length, 200);
  });
});
