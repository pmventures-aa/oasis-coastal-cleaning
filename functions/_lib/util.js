/** Shared helpers for the Pages Functions. */

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }
  });

export const clean = (v, max = 500) =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

export const cleanList = (v, max = 24, len = 90) =>
  Array.isArray(v) ? v.slice(0, max).map((x) => clean(x, len)).filter(Boolean) : [];

export const escapeHtml = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const isEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

/** Random id that sorts by creation time. */
export const newId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const rand = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${Date.now().toString(36)}-${rand}`;
};

/** Compare two strings without leaking length or position through timing. */
export const safeEqual = (a, b) => {
  const enc = new TextEncoder();
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
};

/** Turnstile is optional: with no secret set, the check is skipped. */
export async function verifyTurnstile(token, secret, ip) {
  if (!secret) return true;
  if (!token) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body: form
  });
  const out = await res.json().catch(() => ({}));
  return out.success === true;
}

/** Send through Resend. Returns null on success, or a reason string. */
export async function sendEmail(env, { subject, text, html, replyTo }) {
  if (!env.RESEND_API_KEY) return 'RESEND_API_KEY is not set';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.QUOTE_FROM_EMAIL || 'Oasis Coastal Cleaning <onboarding@resend.dev>',
      to: [env.QUOTE_TO_EMAIL || 'info@oasiscoastalcleaning.com'],
      reply_to: replyTo,
      subject, text, html
    })
  });
  if (res.ok) return null;
  return `Resend returned ${res.status}: ${await res.text()}`;
}
