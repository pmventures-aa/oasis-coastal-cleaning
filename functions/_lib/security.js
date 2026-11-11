/**
 * The security log.
 *
 * What it records is deliberately narrow: who signed in, who failed to,
 * who was given or refused access, and when someone was signed out of
 * everywhere. Never a password, never a session value, never the contents
 * of anything. An address typed into a failed attempt is kept as typed,
 * because "someone has been trying info@..." is the question this exists
 * to answer, and an address that does not exist is still the answer.
 */
import { newId } from './util.js';

export const KINDS = {
  sign_in: 'Signed in',
  sign_in_failed: 'Sign-in refused',
  sign_out: 'Signed out',
  password_changed: 'Password changed',
  user_added: 'Person added',
  user_changed: 'Person changed',
  user_disabled: 'Access switched off',
  sessions_revoked: 'Everyone signed out'
};

/** The client's address, as Cloudflare reports it. */
export function ipOf(request) {
  return request.headers.get('CF-Connecting-IP') ||
         request.headers.get('X-Forwarded-For') || null;
}

/* A browser's own description of itself is long and mostly noise; the few
   words that tell her "this was a phone" are at the front. */
export function agentOf(request) {
  const ua = request.headers.get('User-Agent') || '';
  return ua ? ua.slice(0, 180) : null;
}

/**
 * Write one event. Never throws and never blocks the thing it records:
 * failing to log a sign-in must not stop the sign-in.
 */
export async function logSecurity(env, request, kind, info = {}) {
  if (!env || !env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO security_events (id, at, kind, user_id, email, detail, ip, user_agent)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind('sec-' + newId(), new Date().toISOString(), kind,
      info.userId || null, info.email || null, info.detail || null,
      request ? ipOf(request) : null, request ? agentOf(request) : null).run();
  } catch { /* the log is not worth failing the request over */ }
}

/** Recent events, newest first. */
export async function recentSecurity(db, limit = 50) {
  try {
    const r = await db.prepare(
      `SELECT * FROM security_events ORDER BY at DESC, rowid DESC LIMIT ?`
    ).bind(Math.min(200, Math.max(1, limit))).all();
    return r.results || [];
  } catch { return []; }
}
