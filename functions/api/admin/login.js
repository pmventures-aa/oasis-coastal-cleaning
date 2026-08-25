/** POST /api/admin/login — sign Kristina in. */
import { json, clean, safeEqual } from '../../_lib/util.js';
import { makeSessionCookie, authConfigured } from '../../_lib/auth.js';

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
  if (!password || !safeEqual(password, env.ADMIN_PASSWORD)) {
    // Slow a guessing attempt down without making a real sign-in feel broken.
    await new Promise((r) => setTimeout(r, 600));
    return json({ error: 'That password is not right.' }, 401);
  }

  const secure = new URL(request.url).protocol === 'https:';
  return json({ ok: true }, 200, { 'Set-Cookie': await makeSessionCookie(env, secure) });
}
