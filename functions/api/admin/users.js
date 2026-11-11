/**
 * GET    /api/admin/users  — who has a login
 * POST   /api/admin/users  — add someone
 * PATCH  /api/admin/users  — change their role, rename them, reset their
 *                            password, switch them off or back on
 *
 * Owner only, enforced here. Everything about this route is written so that
 * Kristina cannot accidentally lock herself out of her own business:
 * the shared password always works, and the last owner cannot be demoted or
 * switched off.
 */
import { json, clean, newId, isEmail } from '../../_lib/util.js';
import { gate } from '../../_lib/guard.js';
import { hashPassword, ROLES } from '../../_lib/auth.js';
import { applySchema } from '../../_lib/schema.js';

const SETUP = 'Apply migration 0014 in D1 → oasis → Console.';

async function hasTable(db) {
  try { await db.prepare('SELECT 1 FROM users LIMIT 1').first(); return true; }
  catch {
    /* Apply everything, then ask again. Saying "yes" because the applier
       did not throw is how a screen gets past this check and then fails on
       a table that is still not there. */
    try { await applySchema(db); } catch { return false; }
    try { await db.prepare('SELECT 1 FROM users LIMIT 1').first(); return true; }
    catch { return false; }
  }
}

/* Never the hash, never the salt. */
const slim = (u) => ({
  id: u.id, name: u.name, email: u.email, phone: u.phone || '',
  role: u.role, active: !!u.active, created_at: u.created_at,
  last_seen_at: u.last_seen_at || null
});

export async function onRequestGet({ request, env }) {
  const g = await gate(request, env, 'manageUsers');
  if (g.response) return g.response;
  if (!await hasTable(env.DB)) {
    return json({ error: 'Logins are not set up yet.', setup: SETUP, needsSetup: true }, 503);
  }
  const r = await env.DB.prepare(
    'SELECT * FROM users ORDER BY active DESC, name'
  ).all().catch(() => ({ results: [] }));
  return json({ ok: true, roles: ROLES, users: (r.results || []).map(slim) });
}

export async function onRequestPost({ request, env }) {
  const g = await gate(request, env, 'manageUsers');
  if (g.response) return g.response;
  if (!await hasTable(env.DB)) {
    return json({ error: 'Logins are not set up yet.', setup: SETUP, needsSetup: true }, 503);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }

  const name = clean(body.name, 120);
  const email = clean(body.email, 160);
  const role = ROLES.includes(body.role) ? body.role : 'cleaner';
  const password = clean(body.password, 200);

  if (!name) return json({ error: 'What is their name?' }, 400);
  if (!isEmail(email)) return json({ error: 'That email address does not look right.' }, 400);
  /* Long enough to be worth hashing. Their own, not one she reuses. */
  if (password.length < 8) {
    return json({ error: 'Give them a password of at least 8 characters.' }, 400);
  }

  const taken = await env.DB.prepare(
    'SELECT id FROM users WHERE lower(email) = lower(?)'
  ).bind(email).first().catch(() => null);
  if (taken) return json({ error: 'Someone already signs in with that address.' }, 409);

  /* Anything thrown past here reached the browser as an edge error page
     rather than as an answer, and the screen could only say "that did not
     save". Say what went wrong instead. */
  try {
    const h = await hashPassword(password);
    const id = 'usr-' + newId();
    await env.DB.prepare(
      `INSERT INTO users (id, created_at, name, email, phone, role,
         password_hash, password_salt, iterations, active, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,1,?)`
    ).bind(id, new Date().toISOString(), name, email, clean(body.phone, 40) || null,
      role, h.hash, h.salt, h.iterations, g.user.id).run();

    const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
    return json({ ok: true, user: slim(row) }, 201);
  } catch (err) {
    return json({ error: 'Could not save them.',
      detail: String(err && err.message || err) }, 503);
  }
}

export async function onRequestPatch({ request, env }) {
  const g = await gate(request, env, 'manageUsers');
  if (g.response) return g.response;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }

  const id = clean(body.id, 60);
  if (!id) return json({ error: 'Which person?' }, 400);

  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()
    .catch(() => null);
  if (!row) return json({ error: 'That person is not here.' }, 404);

  const sets = [], vals = [];
  const wantsRole = body.role !== undefined && ROLES.includes(body.role);
  const wantsOff = body.active === false;

  /* The guard that matters. If this is the only owner with a login, it must
     not stop being one -- otherwise nobody can add anyone ever again, and
     the only way back in is the shared password she may not have to hand. */
  if (row.role === 'owner' && (wantsOff || (wantsRole && body.role !== 'owner'))) {
    const others = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM users WHERE role = 'owner' AND active = 1 AND id <> ?`
    ).bind(id).first().catch(() => ({ n: 0 }));
    if (!Number(others && others.n)) {
      return json({ error: 'That is the only owner. Make someone else an owner first.' }, 409);
    }
  }

  if (body.name !== undefined) { sets.push('name = ?'); vals.push(clean(body.name, 120)); }
  if (body.phone !== undefined) { sets.push('phone = ?'); vals.push(clean(body.phone, 40)); }
  if (wantsRole) { sets.push('role = ?'); vals.push(body.role); }
  if (body.active !== undefined) { sets.push('active = ?'); vals.push(body.active ? 1 : 0); }

  if (body.password !== undefined) {
    const pw = clean(body.password, 200);
    if (pw.length < 8) return json({ error: 'A password needs at least 8 characters.' }, 400);
    const h = await hashPassword(pw);
    sets.push('password_hash = ?', 'password_salt = ?', 'iterations = ?');
    vals.push(h.hash, h.salt, h.iterations);
  }

  if (!sets.length) return json({ error: 'Nothing to change.' }, 400);
  sets.push('updated_at = ?'); vals.push(new Date().toISOString());
  vals.push(id);
  await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

  const fresh = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  return json({ ok: true, user: slim(fresh) });
}
