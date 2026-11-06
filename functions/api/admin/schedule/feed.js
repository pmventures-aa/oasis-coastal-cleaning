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

/* 'mine' shows the job; 'share' shows only that the time is taken. */
const KEYS = { mine: 'calendar_token', share: 'calendar_share_token' };
const keyFor = (kind) => (kind === 'share' ? KEYS.share : KEYS.mine);
const urlFor = (request, token) => new URL('/api/calendar/' + token, request.url).toString();

export async function onRequestGet({ request, env }) {
  if (!await isSignedIn(request, env)) return json({ error: 'Please sign in.' }, 401);
  const mine = await readSecret(env.DB, KEYS.mine);
  const share = await readSecret(env.DB, KEYS.share);
  return json({ ok: true,
    enabled: !!mine, url: mine ? urlFor(request, mine) : '',
    share_enabled: !!share, share_url: share ? urlFor(request, share) : '' });
}

export async function onRequestPost({ request, env }) {
  if (!await isSignedIn(request, env)) return json({ error: 'Please sign in.' }, 401);

  let body = {};
  try { body = await request.json(); } catch { /* an empty body means "make me one" */ }

  const kind = body.kind === 'share' ? 'share' : 'mine';
  const key = keyFor(kind);

  if (body.action === 'off') {
    await writeSecret(env.DB, key, '');
    return json({ ok: true, kind, enabled: false, url: '' });
  }

  /* Long enough that guessing it is not a strategy. It is the only thing
     standing between this URL and her customers' names and addresses. */
  const token = (kind === 'share' ? 'busy-' : 'cal-') + newId() + newId();
  const saved = await writeSecret(env.DB, key, token);
  if (!saved) return json({ error: 'Could not save the link. Settings storage is not set up.' }, 503);
  return json({ ok: true, kind, enabled: true, url: urlFor(request, token) });
}
