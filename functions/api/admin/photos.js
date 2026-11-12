/**
 * GET    /api/admin/photos?appointment_id=…  — what was taken on a visit
 * GET    /api/admin/photos?id=…&file=1       — the image itself
 * POST   /api/admin/photos                   — upload one
 * PATCH  /api/admin/photos                   — caption it, or tick it through
 * DELETE /api/admin/photos?id=…              — take it back off
 *
 * The bucket is private. No public URL is ever minted: every read comes
 * back through here so that who is asking can be checked.
 *
 * The camera's notes are taken off before anything is stored. These are
 * photographs of the inside of people's houses and EXIF carries where
 * they were taken.
 */
import { json, clean, newId } from '../../_lib/util.js';
import { gate } from '../../_lib/guard.js';
import { applySchema } from '../../_lib/schema.js';
import { can } from '../../_lib/auth.js';
import { stripJpegMetadata, isJpeg, isHeic, KEEPABLE } from '../../_lib/exif.js';

const MAX_BYTES = 8 * 1024 * 1024;          // a phone photo, not a video
const soft = (p) => p.then((r) => r, () => ({ results: [] }));

async function ready(db) {
  try { await db.prepare('SELECT 1 FROM visit_photos LIMIT 1').first(); return true; }
  catch {
    try { await applySchema(db); } catch { return false; }
    try { await db.prepare('SELECT 1 FROM visit_photos LIMIT 1').first(); return true; }
    catch { return false; }
  }
}

const noBucket = () => json({
  error: 'There is nowhere to put photos yet.',
  detail: 'The PHOTOS bucket is not bound to this site.', needsSetup: true
}, 503);

/* A cleaner may work on their own visit; anyone who can see the whole
   diary may work on any of them. */
async function mayTouch(env, user, apptId) {
  if (can(user, 'everyoneSchedule')) return true;
  const row = await env.DB.prepare('SELECT assigned_to FROM appointments WHERE id = ?')
    .bind(apptId).first().catch(() => null);
  return !!(row && row.assigned_to === user.id);
}

export async function onRequestGet({ request, env }) {
  const g = await gate(request, env);
  if (g.response) return g.response;
  if (!await ready(env.DB)) return json({ error: 'Photos are not set up yet.' }, 503);

  const url = new URL(request.url);
  const one = clean(url.searchParams.get('id'), 60);

  /* The image itself. */
  if (one && url.searchParams.get('file') === '1') {
    if (!env.PHOTOS) return noBucket();
    const row = await env.DB.prepare(
      'SELECT * FROM visit_photos WHERE id = ? AND archived_at IS NULL'
    ).bind(one).first().catch(() => null);
    if (!row) return json({ error: 'That photo is not here.' }, 404);
    if (!await mayTouch(env, g.user, row.appointment_id)) {
      return json({ error: 'That visit is not yours.' }, 403);
    }
    const obj = await env.PHOTOS.get(row.object_key);
    if (!obj) return json({ error: 'The file is missing from storage.' }, 404);
    return new Response(obj.body, {
      headers: {
        'Content-Type': row.content_type || 'application/octet-stream',
        /* Private: it is somebody's house. */
        'Cache-Control': 'private, max-age=3600',
        'Content-Disposition': 'inline'
      }
    });
  }

  const apptId = clean(url.searchParams.get('appointment_id'), 80);
  if (!apptId) return json({ error: 'Which visit?' }, 400);
  if (!await mayTouch(env, g.user, apptId)) {
    return json({ error: 'That visit is not yours.' }, 403);
  }
  const rows = ((await soft(env.DB.prepare(
    `SELECT id, created_at, appointment_id, file_name, content_type, size_bytes,
            caption, client_visible, approved_at, uploaded_by
       FROM visit_photos WHERE appointment_id = ? AND archived_at IS NULL
      ORDER BY created_at`
  ).bind(apptId).all())).results) || [];

  return json({ ok: true, photos: rows,
    can_approve: !!can(g.user, 'clientList'),
    storage: !!env.PHOTOS });
}

export async function onRequestPost({ request, env }) {
  const g = await gate(request, env);
  if (g.response) return g.response;
  if (!await ready(env.DB)) return json({ error: 'Photos are not set up yet.' }, 503);
  if (!env.PHOTOS) return noBucket();

  let form;
  try { form = await request.formData(); }
  catch { return json({ error: 'That upload could not be read.' }, 400); }

  const apptId = clean(form.get('appointment_id'), 80);
  if (!apptId) return json({ error: 'Which visit?' }, 400);
  if (!await mayTouch(env, g.user, apptId)) {
    return json({ error: 'That visit is not yours.' }, 403);
  }

  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return json({ error: 'No photo came through.' }, 400);
  }
  if (file.size > MAX_BYTES) {
    return json({ error: 'That photo is too big — 8MB is the limit.' }, 413);
  }

  let bytes = new Uint8Array(await file.arrayBuffer());

  if (isHeic(bytes)) {
    /* Honest refusal. Taking the location out of a HEIC means rewriting a
       box structure, which costs more CPU than this platform allows, and
       storing it as it is would put the coordinates of somebody's front
       door in the bucket. */
    return json({
      error: 'That photo is in Apple’s HEIC format, which we cannot ' +
             'strip the location data out of. On the iPhone: Settings, ' +
             'Camera, Formats, Most Compatible. Then take it again.'
    }, 415);
  }

  let type = clean(file.type, 80) || 'application/octet-stream';
  let strippedOk = false;
  if (isJpeg(bytes)) {
    const r = stripJpegMetadata(bytes);
    bytes = r.bytes;
    strippedOk = r.stripped;
    type = 'image/jpeg';
    if (!strippedOk) {
      return json({ error: 'That photo could not be read properly. Try again.' }, 400);
    }
  } else if (!KEEPABLE.includes(type)) {
    return json({ error: 'Photos only — JPEG or PNG.' }, 415);
  }

  const id = 'ph-' + newId();
  const key = apptId + '/' + id;
  try {
    await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: type } });
  } catch (err) {
    return json({ error: 'That photo could not be stored.',
      detail: String(err && err.message || err) }, 503);
  }

  const appt = await env.DB.prepare('SELECT customer_id FROM appointments WHERE id = ?')
    .bind(apptId).first().catch(() => null);

  try {
    await env.DB.prepare(
      `INSERT INTO visit_photos (id, created_at, appointment_id, customer_id,
         object_key, file_name, content_type, size_bytes, uploaded_by)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).bind(id, new Date().toISOString(), apptId, (appt && appt.customer_id) || null,
      key, clean(file.name, 200) || null, type, bytes.length, g.user.id).run();
  } catch (err) {
    /* The row is what makes the object findable, so an object with no row
       is litter. Put it back. */
    try { await env.PHOTOS.delete(key); } catch { /* best effort */ }
    return json({ error: 'That photo could not be saved.',
      detail: String(err && err.message || err) }, 503);
  }

  const row = await env.DB.prepare(
    `SELECT id, created_at, appointment_id, file_name, content_type, size_bytes,
            caption, client_visible, approved_at, uploaded_by
       FROM visit_photos WHERE id = ?`
  ).bind(id).first();
  return json({ ok: true, photo: row, stripped: strippedOk }, 201);
}

export async function onRequestPatch({ request, env }) {
  const g = await gate(request, env);
  if (g.response) return g.response;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }
  const id = clean(body.id, 60);
  if (!id) return json({ error: 'Which photo?' }, 400);

  const row = await env.DB.prepare('SELECT * FROM visit_photos WHERE id = ?')
    .bind(id).first().catch(() => null);
  if (!row) return json({ error: 'That photo is not here.' }, 404);
  if (!await mayTouch(env, g.user, row.appointment_id)) {
    return json({ error: 'That visit is not yours.' }, 403);
  }

  const sets = [], vals = [];
  if (body.caption !== undefined) { sets.push('caption = ?'); vals.push(clean(body.caption, 300)); }

  if (body.client_visible !== undefined) {
    /* The gate, and only she holds it. */
    if (!can(g.user, 'clientList')) return json({ error: 'Not yours to decide.' }, 403);
    const on = !!body.client_visible;
    sets.push('client_visible = ?', 'approved_at = ?', 'approved_by = ?');
    vals.push(on ? 1 : 0, on ? new Date().toISOString() : null, on ? g.user.id : null);
  }

  if (!sets.length) return json({ error: 'Nothing to change.' }, 400);
  vals.push(id);
  await env.DB.prepare(`UPDATE visit_photos SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...vals).run();
  const out = await env.DB.prepare('SELECT * FROM visit_photos WHERE id = ?').bind(id).first();
  return json({ ok: true, photo: out });
}

export async function onRequestDelete({ request, env }) {
  const g = await gate(request, env);
  if (g.response) return g.response;
  const id = clean(new URL(request.url).searchParams.get('id'), 60);
  if (!id) return json({ error: 'Which photo?' }, 400);

  const row = await env.DB.prepare('SELECT * FROM visit_photos WHERE id = ?')
    .bind(id).first().catch(() => null);
  if (!row) return json({ error: 'That photo is not here.' }, 404);
  if (!await mayTouch(env, g.user, row.appointment_id)) {
    return json({ error: 'That visit is not yours.' }, 403);
  }
  await env.DB.prepare('UPDATE visit_photos SET archived_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), id).run();
  if (env.PHOTOS) { try { await env.PHOTOS.delete(row.object_key); } catch { /* best effort */ } }
  return json({ ok: true, deleted: id });
}
