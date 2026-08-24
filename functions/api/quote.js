/**
 * POST /api/quote — the quote form handler.
 *
 * Cloudflare Pages Function. It does three things:
 *   1. checks the Turnstile token so bots do not fill the inbox,
 *   2. checks that the required fields are actually there,
 *   3. emails the lead to the business.
 *
 * Environment variables (Pages → Settings → Environment variables):
 *   TURNSTILE_SECRET_KEY  secret. Pairs with turnstileSiteKey in js/data.js.
 *                         Leave both unset and the check is skipped.
 *   RESEND_API_KEY        secret. Required for the email to send.
 *   QUOTE_TO_EMAIL        where leads land. Defaults to info@oasiscoastalcleaning.com.
 *   QUOTE_FROM_EMAIL      a verified Resend sender, e.g.
 *                         "Oasis Coastal Cleaning <quotes@oasiscoastalcleaning.com>".
 */

const MAX_BODY = 16 * 1024;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

const clean = (v, max = 500) =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

const escapeHtml = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

async function verifyTurnstile(token, secret, ip) {
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form
  });
  const out = await res.json();
  return out.success === true;
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: 'That request was too large.' }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'That request could not be read.' }, 400);
  }

  // Honeypot: a real person never sees this field.
  if (clean(body.company)) return json({ ok: true });

  const lead = {
    name: clean(body.name, 120),
    phone: clean(body.phone, 40),
    email: clean(body.email, 160),
    service: clean(body.serviceName, 80),
    property: clean(body.property, 80),
    size: clean(body.sizeLabel, 120),
    frequency: clean(body.frequencyLabel, 60),
    firstVisit: body.firstVisit === true,
    extras: Array.isArray(body.extraLabels) ? body.extraLabels.slice(0, 12).map((x) => clean(x, 80)) : [],
    city: clean(body.city, 80),
    notes: clean(body.notes, 2000),
    low: clean(String(body['estimate-low'] ?? ''), 12),
    high: clean(String(body['estimate-high'] ?? ''), 12),
    pageUrl: clean(body.pageUrl, 300)
  };

  if (!lead.name || !lead.phone || !lead.email || !lead.service) {
    return json({ error: 'Please fill in your name, phone, email and what you need.' }, 400);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lead.email)) {
    return json({ error: 'That email address does not look right.' }, 400);
  }

  const turnstileSecret = env.TURNSTILE_SECRET_KEY;
  if (turnstileSecret) {
    const token = clean(body.turnstileToken, 2048);
    const ok = token && await verifyTurnstile(
      token, turnstileSecret, request.headers.get('CF-Connecting-IP')
    );
    if (!ok) return json({ error: 'The “I am human” check did not pass. Try it once more.' }, 400);
  }

  const rows = [
    ['Name', lead.name],
    ['Phone', lead.phone],
    ['Email', lead.email],
    ['Service', lead.service],
    ['Property', lead.property],
    ['Size', lead.size],
    ['Frequency', lead.frequency],
    ['First visit', lead.firstVisit ? 'Yes — deeper first clean' : 'No'],
    ['Add-ons', lead.extras.join(', ') || 'None'],
    ['City', lead.city],
    ['Range shown', lead.low && lead.high ? `$${lead.low} – $${lead.high}` : '—'],
    ['Notes', lead.notes || '—']
  ];

  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n');
  const html =
    `<h2 style="font-family:Georgia,serif;color:#094045">New quote request</h2>` +
    `<table style="font-family:Arial,sans-serif;font-size:14px;color:#094045;border-collapse:collapse">` +
    rows.map(([k, v]) =>
      `<tr><td style="padding:6px 14px 6px 0;color:#6b7f81;white-space:nowrap">${escapeHtml(k)}</td>` +
      `<td style="padding:6px 0"><strong>${escapeHtml(v)}</strong></td></tr>`
    ).join('') +
    `</table>` +
    `<p style="font-family:Arial,sans-serif;font-size:12px;color:#6b7f81">Sent from ${escapeHtml(lead.pageUrl)}</p>`;

  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    // Never pretend a lead was delivered. The form falls back to email.
    console.log('Quote request received but RESEND_API_KEY is not set:\n' + text);
    return json({ error: 'Email is not set up on this site yet.' }, 501);
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.QUOTE_FROM_EMAIL || 'Oasis Coastal Cleaning <onboarding@resend.dev>',
      to: [env.QUOTE_TO_EMAIL || 'info@oasiscoastalcleaning.com'],
      reply_to: lead.email,
      subject: `Quote request — ${lead.service}${lead.city ? ' in ' + lead.city : ''}`,
      text,
      html
    })
  });

  if (!res.ok) {
    console.log('Resend rejected the quote email:', res.status, await res.text());
    return json({ error: 'The message could not be delivered just now.' }, 502);
  }

  return json({ ok: true });
}

export const onRequestGet = () =>
  new Response('Send this form with POST.', {
    status: 405,
    headers: { Allow: 'POST', 'Content-Type': 'text/plain' }
  });
