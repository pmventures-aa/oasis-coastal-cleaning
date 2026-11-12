/**
 * GET   /api/admin/security — who has access, and what has been happening
 * PATCH /api/admin/security — change your own password, or sign people out
 *
 * Owner only. A cleaner changing their own password goes through the user
 * routes; this screen is about who can get in at all.
 */
import { json, clean } from '../../_lib/util.js';
import { gate } from '../../_lib/guard.js';
import { applySchema } from '../../_lib/schema.js';
import { hashPassword, verifyPassword, ROLES } from '../../_lib/auth.js';
import { logSecurity, recentSecurity, KINDS } from '../../_lib/security.js';
import { MIN_PASSWORD } from './users.js';

const soft = (p) => p.then((r) => r, () => ({ results: [] }));

async function ready(db) {
  try { await db.prepare('SELECT 1 FROM security_events LIMIT 1').first(); return true; }
  catch {
    /* Apply everything, then ask again. Saying "yes" because the applier
       did not throw is how a screen gets past this check and then fails on
       a table that is still not there. */
    try { await applySchema(db); } catch { return false; }
    try { await db.prepare('SELECT 1 FROM security_events LIMIT 1').first(); return true; }
    catch { return false; }
  }
}

export async function onRequestGet({ request, env }) {
  const g = await gate(request, env, 'manageUsers');
  if (g.response) return g.response;
  await ready(env.DB);

  const people = ((await soft(env.DB.prepare(
    `SELECT id, name, email, role, active, last_seen_at, created_at
       FROM users ORDER BY active DESC, name`
  ).all())).results) || [];

  const events = await recentSecurity(env.DB, 60);

  /* Refusals in the last day, which is the number worth a second look.
     A handful is someone mistyping; a hundred is not. */
  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const failed = events.filter(
    (e) => e.kind === 'sign_in_failed' && e.at >= dayAgo).length;

  /* The shared password still opens the portal as the owner. That is
     deliberate -- a bad deploy must not lock her out of her own business --
     but she should be able to see that it is true. */
  return json({
    ok: true, people, events, kinds: KINDS, roles: ROLES,
    failed_today: failed,
    shared_password_active: !!env.ADMIN_PASSWORD,
    you: { id: g.user.id, name: g.user.name, email: g.user.email,
           role: g.user.role, shared: !!g.user.shared }
  });
}

export async function onRequestPatch({ request, env }) {
  const g = await gate(request, env, 'manageUsers');
  if (g.response) return g.response;
  await ready(env.DB);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }
  const now = Date.now();

  /* Sign everyone out, including herself: the line moves and every cookie
     issued before it stops working on the next request. */
  if (body.action === 'revoke_all') {
    await env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('sessions_valid_from', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value,
         updated_at = excluded.updated_at`
    ).bind(String(now), new Date().toISOString()).run();
    await logSecurity(env, request, 'sessions_revoked',
      { userId: g.user.id, detail: 'everyone' });
    return json({ ok: true, action: 'revoke_all', at: now });
  }

  /* Sign one person out of wherever they are. */
  if (body.action === 'revoke_user') {
    const id = clean(body.user_id, 60);
    if (!id) return json({ error: 'Which person?' }, 400);
    const row = await env.DB.prepare('SELECT name, email FROM users WHERE id = ?')
      .bind(id).first().catch(() => null);
    if (!row) return json({ error: 'That person is not here.' }, 404);
    await env.DB.prepare('UPDATE users SET sessions_valid_from = ? WHERE id = ?')
      .bind(now, id).run();
    await logSecurity(env, request, 'sessions_revoked',
      { userId: id, email: row.email, detail: 'one person' });
    return json({ ok: true, action: 'revoke_user' });
  }

  /* Change your own password. The shared-password owner has no row to
     change, and saying so is better than pretending it worked. */
  if (body.action === 'password') {
    if (g.user.shared) {
      return json({
        error: 'You are signed in with the shared password, which lives in ' +
               'Cloudflare rather than here. Add yourself as a person first, ' +
               'then sign in as yourself to set a password.'
      }, 400);
    }
    const current = clean(body.current, 200);
    const next = clean(body.password, 200);
    if (next.length < MIN_PASSWORD) {
      return json({ error: 'Make it at least ' + MIN_PASSWORD + ' characters.' }, 400);
    }
    const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(g.user.id).first().catch(() => null);
    if (!row) return json({ error: 'That person is not here.' }, 404);
    if (!await verifyPassword(current, row)) {
      await logSecurity(env, request, 'sign_in_failed',
        { userId: g.user.id, email: row.email, detail: 'wrong current password' });
      return json({ error: 'That current password is not right.' }, 401);
    }
    const made = await hashPassword(next);
    /* Changing it signs the old sessions out: if it was changed because
       somebody else had it, leaving them signed in defeats the change. */
    await env.DB.prepare(
      `UPDATE users SET password_hash = ?, password_salt = ?, iterations = ?,
         sessions_valid_from = ? WHERE id = ?`
    ).bind(made.hash, made.salt, made.iterations, now, g.user.id).run();
    await logSecurity(env, request, 'password_changed',
      { userId: g.user.id, email: row.email });
    return json({ ok: true, action: 'password', signed_out: true });
  }

  return json({ error: 'Unknown change.' }, 400);
}
