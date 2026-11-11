/* Her own list of what things are and what she charges. Internal: the
   public site still carries no prices at all. */
import assert from 'node:assert/strict';
import { makeD1 } from './helpers/d1.mjs';
import { makeSessionCookie, hashPassword } from '../functions/_lib/auth.js';
import * as pb from '../functions/api/admin/price-book.js';

let n = 0;
const testAsync = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

const SECRET = 'price-book-secret';
const env = (d) => ({ DB: d, SESSION_SECRET: SECRET, ADMIN_PASSWORD: 'shared' });
const db = () => makeD1(['0011_schedule.sql', '0014_users.sql', '0016_price_book.sql']);
const owner = async (d) => (await makeSessionCookie(env(d), false)).split(';')[0];
const get = (c) => new Request('https://x.test/api/admin/price-book', { headers: { Cookie: c } });
const send = (c, m, b) => new Request('https://x.test/api/admin/price-book',
  { method: m, headers: { Cookie: c, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

await testAsync('an empty book says so rather than looking broken', async () => {
  const d = db(); const c = await owner(d);
  const b = await (await pb.onRequestGet({ request: get(c), env: env(d) })).json();
  assert.equal(b.empty, true);
  assert.ok(b.seedable > 10, 'and it knows what it could start from');
});

await testAsync('it can be started from the services already on the site', async () => {
  const d = db(); const c = await owner(d);
  const r = await pb.onRequestPost({ request: send(c, 'POST', { action: 'seed' }), env: env(d) });
  assert.equal(r.status, 201);
  const seeded = (await r.json()).seeded;
  assert.ok(seeded > 10);
  const b = await (await pb.onRequestGet({ request: get(c), env: env(d) })).json();
  assert.equal(b.items.length, seeded);
  /* Seeded with no prices on purpose: she fills them in, and nothing
     pretends to be free in the meantime. */
  assert.ok(b.items.every((i) => i.default_cents === null));
  assert.ok(b.items.some((i) => i.grp === 'Kitchen'));
});

await testAsync('seeding twice is refused rather than doubling the list', async () => {
  const d = db(); const c = await owner(d);
  await pb.onRequestPost({ request: send(c, 'POST', { action: 'seed' }), env: env(d) });
  const again = await pb.onRequestPost({ request: send(c, 'POST', { action: 'seed' }), env: env(d) });
  assert.equal(again.status, 409);
});

await testAsync('a line needs a name, and a price is optional', async () => {
  const d = db(); const c = await owner(d);
  assert.equal((await pb.onRequestPost({ request: send(c, 'POST', { label: '' }), env: env(d) })).status, 400);
  const r = await pb.onRequestPost({ request: send(c, 'POST',
    { label: 'Inside the oven', note: 'Racks and door glass', grp: 'Kitchen',
      default_cents: 4500, unit: 'each' }), env: env(d) });
  assert.equal(r.status, 201);
  assert.equal((await r.json()).item.default_cents, 4500);

  const noPrice = await pb.onRequestPost({ request: send(c, 'POST',
    { label: 'Whole-house deep clean' }), env: env(d) });
  assert.equal((await noPrice.json()).item.default_cents, null,
    'no price means quote it, not zero');
});

await testAsync('a silly price is refused rather than stored', async () => {
  const d = db(); const c = await owner(d);
  const r = await pb.onRequestPost({ request: send(c, 'POST',
    { label: 'Odd', default_cents: -500 }), env: env(d) });
  assert.equal((await r.json()).item.default_cents, null);
});

await testAsync('an unknown unit falls back to each', async () => {
  const d = db(); const c = await owner(d);
  const r = await pb.onRequestPost({ request: send(c, 'POST',
    { label: 'Thing', unit: 'furlong' }), env: env(d) });
  assert.equal((await r.json()).item.unit, 'each');
});

await testAsync('retiring a line hides it without losing it', async () => {
  const d = db(); const c = await owner(d);
  const made = await (await pb.onRequestPost({ request: send(c, 'POST',
    { label: 'Old thing' }), env: env(d) })).json();
  await pb.onRequestPatch({ request: send(c, 'PATCH',
    { id: made.item.id, active: false }), env: env(d) });
  const b = await (await pb.onRequestGet({ request: get(c), env: env(d) })).json();
  assert.equal(b.items.length, 0);
  const row = await d.prepare('SELECT * FROM price_book WHERE id = ?').bind(made.item.id).first();
  assert.equal(row.label, 'Old thing', 'retired, not deleted');
});

await testAsync('using a line is counted, so the list learns her habits', async () => {
  const d = db(); const c = await owner(d);
  const made = await (await pb.onRequestPost({ request: send(c, 'POST',
    { label: 'Fridge' }), env: env(d) })).json();
  await pb.onRequestPatch({ request: send(c, 'PATCH', { id: made.item.id, action: 'used' }), env: env(d) });
  await pb.onRequestPatch({ request: send(c, 'PATCH', { id: made.item.id, action: 'used' }), env: env(d) });
  const row = await d.prepare('SELECT times_used FROM price_book WHERE id = ?').bind(made.item.id).first();
  assert.equal(row.times_used, 2);
});

await testAsync('what she charges is hers: staff cannot read or change it', async () => {
  const d = db();
  for (const role of ['cleaner', 'staff_admin']) {
    const h = await hashPassword('pw');
    d._raw.prepare(`INSERT INTO users (id,created_at,name,email,role,password_hash,password_salt,
      iterations,active) VALUES (?,?,?,?,?,?,?,?,1)`)
      .run('u-' + role, '2026-11-11', role, role + '@x.test', role, h.hash, h.salt, h.iterations);
    const c = (await makeSessionCookie(env(d), false, 'u-' + role)).split(';')[0];
    assert.equal((await pb.onRequestGet({ request: get(c), env: env(d) })).status, 403, role);
    assert.equal((await pb.onRequestPost({ request: send(c, 'POST',
      { label: 'Sneak' }), env: env(d) })).status, 403, role);
  }
});

console.log('\n' + n + ' passed');
