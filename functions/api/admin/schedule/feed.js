/**
 * GET  /api/admin/schedule/feed  — the subscription link, if there is one
 * POST /api/admin/schedule/feed  — make one, or replace the one there is
 *
 * Replacing it is how a link gets taken back: the old URL stops working the
 * moment the new one is made, and whichever phone was following it simply
 * stops updating.
 */
import { json, newId } from '../../../_lib/util.js';
import { isSignedIn } from '../../../_lib/auth.js';
import { readSecret, writeSecret } from '../../../_lib/settings.js';

const KEY = 'calendar_token';
const urlFor = (request, token) => new URL('/api/calendar/' + token, request.url).toString();

export async function onRequestGet({ request, env }) {
  if (!await isSignedIn(request, env)) return json({ error: 'Please sign in.' }, 401);
  const token = await readSecret(env.DB, KEY);
  return json({ ok: true, enabled: !!token, url: token ? urlFor(request, token) : '' });
}

export async function onRequestPost({ request, env }) {
  if (!await isSignedIn(request, env)) return json({ error: 'Please sign in.' }, 401);

  let body = {};
  try { body = await request.json(); } catch { /* an empty body means "make me one" */ }

  if (body.action === 'off') {
    await writeSecret(env.DB, KEY, '');
    return json({ ok: true, enabled: false, url: '' });
  }

  /* Long enough that guessing it is not a strategy. It is the only thing
     standing between this URL and her customers' names and addresses. */
  const token = 'cal-' + newId() + newId();
  const saved = await writeSecret(env.DB, KEY, token);
  if (!saved) return json({ error: 'Could not save the link. Settings storage is not set up.' }, 503);
  return json({ ok: true, enabled: true, url: urlFor(request, token) });
}
