/** Verify Svix-signed webhooks (used by Resend). */
import { safeEqual } from './util.js';

const TOLERANCE_SEC = 5 * 60;

function decodeSecret(secret) {
  const raw = String(secret || '').trim();
  const b64 = raw.startsWith('whsec_') ? raw.slice(6) : raw;
  // atob throws on anything that is not base64 — a pasted API key, a truncated
  // copy, a stray quote. Letting it throw turned a misconfigured secret into a
  // 500, which reads like the site is down rather than like a wrong value.
  let bin;
  try { bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/')); } catch { return null; }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Describe a webhook secret without revealing it, so the portal can tell the
 * difference between "not set", "that is the API key, not the signing secret"
 * and "set correctly but not the one Resend is signing with" — three problems
 * that otherwise look identical from the outside.
 */
export function describeWebhookSecret(secret) {
  const raw = String(secret || '').trim();
  if (!raw) return { set: false, usable: false, problem: 'missing' };
  if (raw.startsWith('re_')) {
    return { set: true, usable: false, problem: 'api-key' };
  }
  const bytes = decodeSecret(raw);
  if (!bytes) return { set: true, usable: false, problem: 'not-base64' };
  if (bytes.length < 16) {
    return { set: true, usable: false, problem: 'too-short', bytes: bytes.length };
  }
  return { set: true, usable: true, problem: null, bytes: bytes.length };
}

function toBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

async function sign(content, secretBytes) {
  const key = await crypto.subtle.importKey(
    'raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(content));
}

/** Returns null when valid, or an error string describing why it was rejected. */
export async function verifySvixWebhook(request, rawBody, secret) {
  // No secret means nothing can be verified, so nothing may be trusted. This
  // used to return null — treating an unconfigured webhook as a valid one, and
  // letting anyone post forged delivery and open events into the tracking.
  if (!secret) return 'Webhook secret is not configured.';

  const id = request.headers.get('svix-id');
  const timestamp = request.headers.get('svix-timestamp');
  const signatureHeader = request.headers.get('svix-signature');
  if (!id || !timestamp || !signatureHeader) {
    return 'Missing Svix signature headers.';
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return 'Invalid Svix timestamp.';
  const age = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (age > TOLERANCE_SEC) return 'Svix timestamp outside tolerance.';

  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const secretBytes = decodeSecret(secret);
  if (!secretBytes) return 'Webhook secret is not a valid signing secret.';
  const expected = toBase64(await sign(signedContent, secretBytes));

  // Compared with safeEqual rather than === for the same reason the admin
  // password is: a plain compare returns early on the first wrong byte.
  const valid = signatureHeader.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    return version === 'v1' && safeEqual(sig, expected);
  });

  return valid ? null : 'Invalid Svix signature.';
}

/* ------------------------------------------------------------------ outcome
   Shape tells "missing" from "that is the API key" from "unreadable", but it
   cannot tell a correct signing secret from a well-formed wrong one — and a
   wrong one is exactly what got this endpoint disabled. The only thing that
   knows is a real delivery, so remember how the last one went. */

const OUTCOME_KEY = 'webhook_last';
const THROTTLE_MS = 60 * 1000;

/** Record how Resend's most recent delivery was handled. Never throws. */
export async function recordWebhookOutcome(db, ok, reason) {
  if (!db) return;
  const now = Date.now();
  try {
    const prev = await readWebhookOutcome(db);
    // One unauthenticated request must not mean one write. Only record when
    // the answer changed, or when the last note is a minute old.
    if (prev && prev.ok === ok && now - Number(prev.at || 0) < THROTTLE_MS) return;
    const value = JSON.stringify({ ok, reason: ok ? null : String(reason || '').slice(0, 200), at: now });
    await db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).bind(OUTCOME_KEY, value, new Date(now).toISOString()).run();
  } catch { /* tracking must never break the webhook itself */ }
}

/** How the last delivery went, or null when none has arrived. */
export async function readWebhookOutcome(db) {
  if (!db) return null;
  try {
    const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(OUTCOME_KEY).first();
    if (!row || !row.value) return null;
    const parsed = JSON.parse(row.value);
    return (parsed && typeof parsed === 'object') ? parsed : null;
  } catch { return null; }
}
