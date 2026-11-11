/**
 * Who is signed in, and what they are allowed to see.
 *
 * Two ways in, on purpose:
 *
 *   The shared password in ADMIN_PASSWORD still works and signs in as the
 *   owner. It is the key to her own business and a deploy that took it away
 *   would lock her out from a phone in somebody's driveway.
 *
 *   A named user signs in with their email and their own password, and the
 *   cookie carries their id, so the portal can tell a cleaner from the owner.
 *
 * The cookie is still an HMAC-signed stamp with no storage behind it, so
 * sessions survive restarts. Sessions issued before named users existed are
 * still valid and read as the owner -- otherwise shipping this would have
 * signed her out mid-job.
 */
import { safeEqual } from './util.js';

const COOKIE = 'oasis_admin';
const TTL_MS = 1000 * 60 * 60 * 12;   // 12 hours

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return b64url(mac);
}

/* ------------------------------------------------------------ passwords
   PBKDF2-HMAC-SHA256 over a per-user random salt. 600,000 iterations is the
   current OWASP figure and measures at about 80ms here, which is nothing
   for something that happens a few times a day. The count is stored per
   user so it can be raised later without invalidating anyone. */
export const PBKDF2_ITERATIONS = 600000;

const fromB64url = (v) => {
  const pad = v.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '==='.slice((pad.length + 3) % 4));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
};

export async function hashPassword(password, saltBytes, iterations = PBKDF2_ITERATIONS) {
  const salt = saltBytes || crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return { hash: b64url(bits), salt: b64url(salt), iterations };
}

export async function verifyPassword(password, row) {
  if (!row || !row.password_hash || !row.password_salt) return false;
  const { hash } = await hashPassword(password, fromB64url(row.password_salt),
    Number(row.iterations) || PBKDF2_ITERATIONS);
  return safeEqual(hash, row.password_hash);
}

/* ------------------------------------------------------------- sessions */

export async function makeSessionCookie(env, secure = true, userId = null) {
  const expires = Date.now() + TTL_MS;
  /* "u:<id>:<expires>" for a named person, a bare stamp for the shared
     password. The bare form is also what every session issued before this
     existed looks like, which is why it is still understood. */
  const payload = userId ? `u:${userId}:${expires}` : String(expires);
  const mac = await sign(payload, env.SESSION_SECRET);
  const value = `${payload}.${mac}`;
  const bits = [
    `${COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(TTL_MS / 1000)}`
  ];
  if (secure) bits.push('Secure');
  return bits.join('; ');
}

export const clearSessionCookie = () =>
  `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

/** The signed, unexpired payload, or null. */
async function readCookie(request, env) {
  if (!env.SESSION_SECRET) return null;
  const raw = request.headers.get('Cookie') || '';
  const match = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!match) return null;

  /* The payload itself contains colons, so only the LAST dot separates it
     from the signature. Splitting on the first would have quietly broken
     every named-user session. */
  const value = match[1];
  const cut = value.lastIndexOf('.');
  if (cut <= 0) return null;
  const payload = value.slice(0, cut), mac = value.slice(cut + 1);

  const expected = await sign(payload, env.SESSION_SECRET);
  if (!safeEqual(mac, expected)) return null;

  if (payload.startsWith('u:')) {
    const bits = payload.split(':');
    const expires = Number(bits[2]);
    if (!Number.isFinite(expires) || expires <= Date.now()) return null;
    return { userId: bits[1], expires };
  }
  const expires = Number(payload);
  if (!Number.isFinite(expires) || expires <= Date.now()) return null;
  return { userId: null, expires };     // the shared password, or a legacy session
}

export async function isSignedIn(request, env) {
  return !!(await readCookie(request, env));
}

/* The roles, most powerful first. Everything that asks "may they?" asks it
   of this file, never of the screen. */
export const ROLES = ['owner', 'staff_admin', 'cleaner'];

export const OWNER = Object.freeze({
  id: 'owner', name: 'Owner', email: '', role: 'owner', shared: true
});

/**
 * Who is making this request, or null.
 *
 * The shared password has no row behind it and resolves to the owner. A
 * named user is read fresh every time rather than trusted from the cookie,
 * so switching someone off or changing their role takes effect on their
 * next request rather than whenever their session happens to expire.
 */
export async function currentUser(request, env) {
  const session = await readCookie(request, env);
  if (!session) return null;
  if (!session.userId) return OWNER;
  if (!env.DB) return null;
  let row = null;
  try {
    row = await env.DB.prepare(
      'SELECT id, name, email, role, active FROM users WHERE id = ?'
    ).bind(session.userId).first();
  } catch { return null; }
  if (!row || !row.active) return null;
  return { id: row.id, name: row.name, email: row.email,
    role: ROLES.includes(row.role) ? row.role : 'cleaner', shared: false };
}

/* ------------------------------------------------------------ what they may do
   One table, read by the server. The screen hides what it hides for tidiness;
   these are what actually decide. */
const CAN = {
  owner:       { money: true, everyoneSchedule: true, clientList: true,
                 sendMail: true, manageUsers: true, settings: true, priceBook: true },
  staff_admin: { money: false, everyoneSchedule: true, clientList: true,
                 sendMail: false, manageUsers: false, settings: false, priceBook: false },
  cleaner:     { money: false, everyoneSchedule: false, clientList: false,
                 sendMail: false, manageUsers: false, settings: false, priceBook: false }
};

export function can(user, what) {
  if (!user) return false;
  const row = CAN[user.role];
  return !!(row && row[what]);
}

/** True when the portal has everything it needs to let someone in. */
export const authConfigured = (env) => Boolean(env.ADMIN_PASSWORD && env.SESSION_SECRET);
