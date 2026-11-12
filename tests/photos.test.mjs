/* Photos from a visit. The file goes in R2; what matters here is that the
   camera's notes come off, nothing is public, and a client sees one only
   because Kristina said so. */
import assert from 'node:assert/strict';
import { makeD1 } from './helpers/d1.mjs';
import { makeSessionCookie, hashPassword } from '../functions/_lib/auth.js';
import { stripJpegMetadata, isJpeg, isHeic } from '../functions/_lib/exif.js';
import * as ph from '../functions/api/admin/photos.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };
const testAsync = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

/* A JPEG carrying an APP1 block with a recognisable string in it. */
function jpegWithExif(secret = 'GPS-51.5074-0.1278') {
  const payload = Array.from(new TextEncoder().encode(secret));
  const len = payload.length + 2;
  return Uint8Array.from([
    0xFF, 0xD8,
    0xFF, 0xE1, (len >> 8) & 0xFF, len & 0xFF, ...payload,
    0xFF, 0xDB, 0x00, 0x04, 0x00, 0x00,
    0xFF, 0xDA, 0x00, 0x02,
    1, 2, 3, 4,
    0xFF, 0xD9
  ]);
}
const asText = (b) => new TextDecoder().decode(b);

/* A bucket that behaves like R2 for what this route asks of it. */
function bucket() {
  const store = new Map();
  return {
    store,
    async put(k, v) { store.set(k, v); },
    async get(k) { return store.has(k) ? { body: store.get(k) } : null; },
    async delete(k) { store.delete(k); }
  };
}

function db() {
  return makeD1(['0011_schedule.sql', '0014_users.sql', '0009_settings.sql', '0023_photos.sql']);
}
const env = (d, b) => ({ DB: d, PHOTOS: b, ADMIN_PASSWORD: 'x', SESSION_SECRET: 's'.repeat(32) });
const owner = async (d) => (await makeSessionCookie(env(d), false)).split(';')[0];
async function cleaner(d, id = 'u-dani') {
  const h = await hashPassword('pw');
  d._raw.prepare(`INSERT INTO users (id,created_at,name,email,role,password_hash,
    password_salt,iterations,active) VALUES (?,?,?,?,?,?,?,?,1)`)
    .run(id, '2026-11-01', 'Dani', id + '@x.test', 'cleaner', h.hash, h.salt, h.iterations);
  return (await makeSessionCookie(env(d), false, id)).split(';')[0];
}
function visit(d, id = 'a1', assigned = 'u-dani') {
  d._raw.prepare(`INSERT INTO appointments (id,created_at,status,all_day,start_at,end_at,
    customer_id,assigned_to) VALUES (?,?,'confirmed',0,?,?,'c1',?)`)
    .run(id, '2026-11-01', '2026-11-11T14:00:00Z', '2026-11-11T16:00:00Z', assigned);
}
function upload(cookie, apptId, bytes, name = 'photo.jpg', type = 'image/jpeg') {
  const fd = new FormData();
  fd.set('appointment_id', apptId);
  fd.set('file', new File([bytes], name, { type }));
  return new Request('https://x.test/api/admin/photos',
    { method: 'POST', headers: { Cookie: cookie }, body: fd });
}
const get = (c, q) => new Request('https://x.test/api/admin/photos' + q, { headers: { Cookie: c } });
const patch = (c, b) => new Request('https://x.test/api/admin/photos',
  { method: 'PATCH', headers: { Cookie: c, 'Content-Type': 'application/json' },
    body: JSON.stringify(b) });

/* ------------------------------------------------- the camera's notes */

test('the location comes out of a JPEG and the pixels stay', () => {
  const src = jpegWithExif();
  assert.ok(asText(src).includes('GPS-51.5074'), 'the fixture must carry it to start with');
  const r = stripJpegMetadata(src);
  assert.equal(r.stripped, true);
  assert.ok(!asText(r.bytes).includes('GPS-51.5074'), 'it must not survive');
  assert.deepEqual(Array.from(r.bytes.slice(-6)), [1, 2, 3, 4, 0xFF, 0xD9],
    'the scan and the end marker are the picture; they stay');
  assert.deepEqual(Array.from(r.bytes.slice(0, 2)), [0xFF, 0xD8], 'still a JPEG');
});

test('something that is not a JPEG is left alone rather than mangled', () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 1, 2, 3]);
  const r = stripJpegMetadata(png);
  assert.equal(r.stripped, false);
  assert.deepEqual(Array.from(r.bytes), Array.from(png));
});

test('a HEIC is recognised, because its location cannot be taken out cheaply', () => {
  assert.equal(isHeic(Uint8Array.from(
    [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])), true);
  assert.equal(isJpeg(jpegWithExif()), true);
});

/* ------------------------------------------------------------ storing */

await testAsync('an uploaded photo is stored without its metadata', async () => {
  const d = db(); const b = bucket(); const c = await cleaner(d); visit(d);
  const res = await ph.onRequestPost({ request: upload(c, 'a1', jpegWithExif()), env: env(d, b) });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.stripped, true);
  const stored = [...b.store.values()][0];
  assert.ok(!asText(stored).includes('GPS-51.5074'),
    'what reaches the bucket must not carry where the house is');
});

await testAsync('a HEIC is refused, and says what to change on the phone', async () => {
  const d = db(); const b = bucket(); const c = await cleaner(d); visit(d);
  const heic = Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70,
    0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0]);
  const res = await ph.onRequestPost({
    request: upload(c, 'a1', heic, 'IMG_0001.HEIC', 'image/heic'), env: env(d, b) });
  assert.equal(res.status, 415);
  assert.match((await res.json()).error, /Most Compatible/);
  assert.equal(b.store.size, 0, 'nothing with its location in it should be stored');
});

await testAsync('with no bucket bound it says so rather than losing the photo', async () => {
  const d = db(); const c = await cleaner(d); visit(d);
  const res = await ph.onRequestPost({ request: upload(c, 'a1', jpegWithExif()),
    env: env(d, null) });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).needsSetup, true);
});

/* --------------------------------------------------------- the gate */

await testAsync('a photo is not client-visible on arrival', async () => {
  const d = db(); const b = bucket(); const c = await cleaner(d); visit(d);
  const res = await ph.onRequestPost({ request: upload(c, 'a1', jpegWithExif()), env: env(d, b) });
  assert.equal((await res.json()).photo.client_visible, 0);
});

await testAsync('a cleaner cannot make their own photo client-visible', async () => {
  const d = db(); const b = bucket(); const c = await cleaner(d); visit(d);
  const made = await ph.onRequestPost({ request: upload(c, 'a1', jpegWithExif()), env: env(d, b) });
  const id = (await made.json()).photo.id;
  const res = await ph.onRequestPatch({ request: patch(c, { id, client_visible: true }),
    env: env(d, b) });
  assert.equal(res.status, 403);
  assert.equal(d._raw.prepare('SELECT client_visible FROM visit_photos WHERE id = ?')
    .get(id).client_visible, 0);
});

await testAsync('she ticks it through and can take it back off', async () => {
  const d = db(); const b = bucket(); const o = await owner(d);
  const c = await cleaner(d); visit(d);
  const made = await ph.onRequestPost({ request: upload(c, 'a1', jpegWithExif()), env: env(d, b) });
  const id = (await made.json()).photo.id;

  await ph.onRequestPatch({ request: patch(o, { id, client_visible: true }), env: env(d, b) });
  let row = d._raw.prepare('SELECT * FROM visit_photos WHERE id = ?').get(id);
  assert.equal(row.client_visible, 1);
  assert.ok(row.approved_at);

  await ph.onRequestPatch({ request: patch(o, { id, client_visible: false }), env: env(d, b) });
  row = d._raw.prepare('SELECT * FROM visit_photos WHERE id = ?').get(id);
  assert.equal(row.client_visible, 0);
  assert.equal(row.approved_at, null);
});

/* ------------------------------------------------------- who may look */

await testAsync('a cleaner cannot read photos from somebody else’s visit', async () => {
  const d = db(); const b = bucket(); const c = await cleaner(d);
  visit(d, 'a1', 'someone-else');
  const res = await ph.onRequestGet({ request: get(c, '?appointment_id=a1'), env: env(d, b) });
  assert.equal(res.status, 403);
});

await testAsync('the file comes back through the route, not from a public URL', async () => {
  const d = db(); const b = bucket(); const c = await cleaner(d); visit(d);
  const made = await ph.onRequestPost({ request: upload(c, 'a1', jpegWithExif()), env: env(d, b) });
  const id = (await made.json()).photo.id;
  const res = await ph.onRequestGet({ request: get(c, '?id=' + id + '&file=1'), env: env(d, b) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'image/jpeg');
  assert.match(res.headers.get('Cache-Control'), /private/);
});

await testAsync('deleting takes the row and the file', async () => {
  const d = db(); const b = bucket(); const c = await cleaner(d); visit(d);
  const made = await ph.onRequestPost({ request: upload(c, 'a1', jpegWithExif()), env: env(d, b) });
  const id = (await made.json()).photo.id;
  assert.equal(b.store.size, 1);
  await ph.onRequestDelete({
    request: new Request('https://x.test/api/admin/photos?id=' + id,
      { method: 'DELETE', headers: { Cookie: c } }), env: env(d, b) });
  assert.equal(b.store.size, 0, 'the file goes too, not just the row');
  assert.ok(d._raw.prepare('SELECT archived_at FROM visit_photos WHERE id = ?').get(id).archived_at);
});

await testAsync('signed out, it answers 401', async () => {
  const d = db();
  const res = await ph.onRequestGet({
    request: new Request('https://x.test/api/admin/photos?appointment_id=a1'), env: env(d, bucket()) });
  assert.equal(res.status, 401);
});

console.log('\n' + n + ' passed');
