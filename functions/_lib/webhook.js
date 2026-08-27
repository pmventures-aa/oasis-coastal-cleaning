/** Verify Svix-signed webhooks (used by Resend). */

const TOLERANCE_SEC = 5 * 60;

function decodeSecret(secret) {
  const raw = String(secret || '').trim();
  const b64 = raw.startsWith('whsec_') ? raw.slice(6) : raw;
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
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

/** Returns null when valid, or an error string. Skips check when secret is unset. */
export async function verifySvixWebhook(request, rawBody, secret) {
  if (!secret) return null;

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
  const expected = toBase64(await sign(signedContent, secretBytes));

  const valid = signatureHeader.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    return version === 'v1' && sig === expected;
  });

  return valid ? null : 'Invalid Svix signature.';
}
