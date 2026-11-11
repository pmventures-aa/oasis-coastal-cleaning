/**
 * POST /api/admin/login — sign someone in.
 *
 * Two doors. The shared password in ADMIN_PASSWORD still opens the portal as
 * the owner, because taking that away would mean a bad deploy locks Kristina
 * out of her own business. A named person signs in with their email and
 * their own password.
 */
import { json, clean, safeEqual, isEmail } from '../../_lib/util.js';
import { makeSessionCookie, authConfigured, verifyPassword } from '../../_lib/auth.js';
import { logSecurity } from '../../_lib/security.js';

export async function onRequestPost({ request, env }) {
  if (!authConfigured(env)) {
    return json({
      error: 'The portal is not set up yet. ADMIN_PASSWORD and SESSION_SECRET ' +
             'need to be added to this project before anyone can sign in.'
    }, 503);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }

  const password = clean(body.password, 200);
  const email = clean(body.email, 160);
  const secure = new URL(request.url).protocol === 'https:';

  /* An email means they are claiming to be a particular person, so only
     that person's password will do -- the shared password must not sign
     anyone in as somebody else. */
  if (email) {
    if (!isEmail(email) || !password) {
      await new Promise((r) => setTimeout(r, 600));
      return json({ error: 'That email or password is not right.' }, 401);
    }
    let row = null;
    try {
      row = await env.DB.prepare(
        'SELECT * FROM users WHERE lower(email) = lower(?) AND active = 1'
      ).bind(email).first();
    } catch { row = null; }

    const ok = row ? await verifyPassword(password, row) : false;
    if (!ok) {
      await logSecurity(env, request, 'sign_in_failed', { email,
        detail: row ? 'wrong password' : 'no such person' });
      /* The same answer and the same wait either way, so the form cannot be
         used to find out which addresses exist. */
      await new Promise((r) => setTimeout(r, 600));
      return json({ error: 'That email or password is not right.' }, 401);
    }
    try {
      await env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?')
        .bind(new Date().toISOString(), row.id).run();
    } catch { /* signing in matters more than recording that they did */ }
    await logSecurity(env, request, 'sign_in',
      { userId: row.id, email: row.email, detail: row.role });
    return json({ ok: true, name: row.name, role: row.role }, 200,
      { 'Set-Cookie': await makeSessionCookie(env, secure, row.id) });
  }

  if (!password || !safeEqual(password, env.ADMIN_PASSWORD)) {
    await logSecurity(env, request, 'sign_in_failed',
      { detail: 'shared password' });
    // Slow a guessing attempt down without making a real sign-in feel broken.
    await new Promise((r) => setTimeout(r, 600));
    return json({ error: 'That password is not right.' }, 401);
  }

  await logSecurity(env, request, 'sign_in', { detail: 'shared password' });
  return json({ ok: true, role: 'owner' }, 200,
    { 'Set-Cookie': await makeSessionCookie(env, secure) });
}
