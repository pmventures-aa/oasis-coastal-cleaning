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
