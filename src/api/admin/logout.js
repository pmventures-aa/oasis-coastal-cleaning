/** POST /api/admin/logout — drop the session cookie. */
import { json } from '../../lib/util.js';
import { clearSessionCookie } from '../../lib/auth.js';

export const onRequestPost = () =>
  json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
