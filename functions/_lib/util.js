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

/* ---------------------------------------------------------------- notifying
   Kristina should not be locked to one email company. Whichever key is set
   decides who carries the message; nothing else in the code changes. If more
   than one is set they all fire, so a move from one provider to another can
   overlap for a few days without a gap in the leads.

     RESEND_API_KEY        Resend        3,000 a month free
     BREVO_API_KEY         Brevo         300 a day free
     NOTIFY_WEBHOOK_URL    anything      Zapier, Make, Shortcuts, Slack

   Returns null when at least one of them accepted the message, or a reason
   string when none did. */
export function siteBase(env) {
  const raw = (env && (env.SITE_URL || env.QUOTE_SITE_URL)) || 'https://www.oasiscoastalcleaning.com';
  return String(raw).replace(/\/+$/, '');
}

export async function sendEmail(env, { to, bcc, subject, text, html, replyTo }) {
  const dest = to || env.QUOTE_TO_EMAIL || 'info@oasiscoastalcleaning.com';
  const fromName = env.QUOTE_FROM_NAME || 'Oasis Coastal Cleaning';
  const jobs = [];

  if (env.RESEND_API_KEY) jobs.push(sendResend(env, { to: dest, bcc, fromName, subject, text, html, replyTo }));
  if (env.BREVO_API_KEY) jobs.push(sendBrevo(env, { to: dest, bcc, fromName, subject, text, html, replyTo }));
  if (env.NOTIFY_WEBHOOK_URL) jobs.push(sendWebhook(env, { to: dest, subject, text, replyTo }));

  if (!jobs.length) return 'No notification channel is configured';

  const results = await Promise.all(jobs.map(p => p.catch(err => String(err && err.message || err))));
  if (results.some(r => r === null)) return null;
  return results.filter(Boolean).join(' | ');
}

function asList(value) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map((v) => String(v).trim()).filter(Boolean);
}

async function sendResend(env, { to, bcc, fromName, subject, text, html, replyTo }) {
  const payload = {
    from: env.QUOTE_FROM_EMAIL || `${fromName} <onboarding@resend.dev>`,
    to: asList(to),
    reply_to: replyTo,
    subject, text, html
  };
  const bccList = asList(bcc).filter((addr) => !payload.to.includes(addr));
  if (bccList.length) payload.bcc = bccList;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (res.ok) return null;
  return `Resend returned ${res.status}: ${await res.text()}`;
}

async function sendBrevo(env, { to, bcc, fromName, subject, text, html, replyTo }) {
  // Brevo wants the address on its own, not inside a "Name <addr>" string.
  const fromEmail = bareAddress(env.QUOTE_FROM_EMAIL) || 'noreply@oasiscoastalcleaning.com';
  const toList = asList(to).map((email) => ({ email }));
  const bccList = asList(bcc)
    .filter((email) => !asList(to).includes(email))
    .map((email) => ({ email }));
  const payload = {
    sender: { name: fromName, email: fromEmail },
    to: toList,
    replyTo: replyTo ? { email: replyTo } : undefined,
    subject,
    textContent: text,
    htmlContent: html
  };
  if (bccList.length) payload.bcc = bccList;
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload)
  });
  if (res.ok) return null;
  return `Brevo returned ${res.status}: ${await res.text()}`;
}

/* A plain POST of the same information, for anyone who would rather wire this
   into Zapier, Make, an Apple Shortcut, or a Slack incoming webhook than run
   an email account. */
async function sendWebhook(env, { to, subject, text, replyTo }) {
  const res = await fetch(env.NOTIFY_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, text, replyTo, source: 'oasiscoastalcleaning.com' })
  });
  if (res.ok) return null;
  return `Webhook returned ${res.status}`;
}

/** "Oasis <hi@example.com>" and "hi@example.com" both come back bare. */
function bareAddress(value) {
  if (!value) return '';
  const angled = /<([^>]+)>/.exec(value);
  return (angled ? angled[1] : value).trim();
}
