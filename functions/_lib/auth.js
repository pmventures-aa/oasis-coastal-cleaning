/**
 * Single-admin session handling for the portal.
 *
 * There is one account — Kristina's — so there is no user table. The password
 * lives in ADMIN_PASSWORD and the cookie is an HMAC-signed expiry stamp, which
 * means sessions survive restarts without any storage behind them.
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

export async function makeSessionCookie(env, secure = true) {
  const expires = Date.now() + TTL_MS;
  const payload = String(expires);
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

export async function isSignedIn(request, env) {
  if (!env.SESSION_SECRET) return false;
  const raw = request.headers.get('Cookie') || '';
  const match = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!match) return false;

  const [payload, mac] = match[1].split('.');
  if (!payload || !mac) return false;

  const expected = await sign(payload, env.SESSION_SECRET);
  if (!safeEqual(mac, expected)) return false;

  const expires = Number(payload);
  return Number.isFinite(expires) && expires > Date.now();
}

/** True when the portal has everything it needs to let someone in. */
export const authConfigured = (env) => Boolean(env.ADMIN_PASSWORD && env.SESSION_SECRET);
