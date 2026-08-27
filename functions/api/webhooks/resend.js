/**
 * POST /api/webhooks/resend — delivery, open, and bounce events for quote emails.
 *
 * Configure in Resend dashboard → Webhooks → add endpoint:
 *   https://www.oasiscoastalcleaning.com/api/webhooks/resend
 *
 * Optional: set RESEND_WEBHOOK_SECRET and verify the svix signature.
 */
import { json } from '../../_lib/util.js';
import { applyEmailWebhook } from '../../_lib/quotes.js';
import { sendEmail } from '../../_lib/util.js';
import { buildQuoteDeliveryEmail } from '../../_lib/email.js';

const EVENT_MAP = {
  'email.delivered': 'email_delivered',
  'email.opened': 'email_opened',
  'email.bounced': 'email_bounced',
  'email.delivery_delayed': 'email_failed',
  'email.complained': 'email_failed'
};

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'No database.' }, 503);

  const raw = await request.text();
  let payload;
  try { payload = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON.' }, 400); }

  const type = payload.type;
  const kind = EVENT_MAP[type];
  if (!kind) return json({ ok: true, ignored: type || 'unknown' });

  const emailId = payload.data?.email_id || payload.data?.id;
  if (!emailId) return json({ error: 'Missing email id.' }, 400);

  const detail = {
    type,
    to: payload.data?.to,
    subject: payload.data?.subject,
    message: payload.data?.bounce?.message || payload.data?.failed?.reason || null
  };

  const quote = await applyEmailWebhook(env.DB, emailId, kind, detail);
  if (!quote) return json({ ok: true, unmatched: emailId });

  if (kind === 'email_bounced' || kind === 'email_failed') {
    try {
      const mail = buildQuoteDeliveryEmail(env, { quote, kind, detail });
      await sendEmail(env, { subject: mail.subject, html: mail.html, text: mail.text });
    } catch (err) {
      console.error('Delivery alert email failed:', err);
    }
  }

  return json({ ok: true, quote_id: quote.id, kind });
}

export async function onRequestGet() {
  return json({ ok: true, service: 'resend-webhook' });
}
