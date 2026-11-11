/**
 * GET  /api/admin/schedule/feed  — the subscription link, if there is one
 * POST /api/admin/schedule/feed  — make one, or replace the one there is
 *
 * Replacing it is how a link gets taken back: the old URL stops working the
 * moment the new one is made, and whichever phone was following it simply
 * stops updating.
 */
import { json, newId } from '../../../_lib/util.js';
import { gate } from '../../../_lib/guard.js';
import { isSignedIn } from '../../../_lib/auth.js';
import { readSecret, writeSecret } from '../../../_lib/settings.js';

/* Three, because they answer three different questions.
   'mine'  — her own phone: everything.
   'staff' — somebody who works with her: everything, because a cleaner
             needs the address and the name, but on its own token so it can
             be taken back when they leave without disturbing her phone.
   'share' — somebody who only needs to know when she is free: Busy and
             the times, nothing else. */
const KEYS = { mine: 'calendar_token', staff: 'calendar_staff_token',
               share: 'calendar_share_token' };
const keyFor = (kind) => KEYS[kind] || KEYS.mine;
const urlFor = (request, token) => new URL('/api/calendar/' + token, request.url).toString();

export async function onRequestGet({ request, env }) {
  const _g = await gate(request, env, 'everyoneSchedule');
  if (_g.response) return _g.response;
  const mine = await readSecret(env.DB, KEYS.mine);
  const staff = await readSecret(env.DB, KEYS.staff);
  const share = await readSecret(env.DB, KEYS.share);
  return json({ ok: true,
    enabled: !!mine, url: mine ? urlFor(request, mine) : '',
    staff_enabled: !!staff, staff_url: staff ? urlFor(request, staff) : '',
    share_enabled: !!share, share_url: share ? urlFor(request, share) : '' });
}

export async function onRequestPost({ request, env }) {
  const _g = await gate(request, env, 'everyoneSchedule');
  if (_g.response) return _g.response;

  let body = {};
  try { body = await request.json(); } catch { /* an empty body means "make me one" */ }

  const kind = KEYS[body.kind] ? body.kind : 'mine';
  const key = keyFor(kind);

  if (body.action === 'off') {
    await writeSecret(env.DB, key, '');
    return json({ ok: true, kind, enabled: false, url: '' });
  }

  /* Long enough that guessing it is not a strategy. It is the only thing
     standing between this URL and her customers' names and addresses. */
  const token = (kind === 'share' ? 'busy-' : kind === 'staff' ? 'team-' : 'cal-') +
    newId() + newId();
  const saved = await writeSecret(env.DB, key, token);
  if (!saved) return json({ error: 'Could not save the link. Settings storage is not set up.' }, 503);
  return json({ ok: true, kind, enabled: true, url: urlFor(request, token) });
}
