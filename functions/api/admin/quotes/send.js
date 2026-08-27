/**
 * POST /api/admin/quotes/send — email the customer and mark the quote sent.
 */
import { json, clean, sendEmail } from '../../../_lib/util.js';
import { isSignedIn } from '../../../_lib/auth.js';
import { quoteFromRow, proposalUrl, isExpired } from '../../../_lib/quotes.js';
import { buildCustomerQuoteEmail } from '../../../_lib/email.js';

const guard = async (request, env) => {
  if (!await isSignedIn(request, env)) return json({ error: 'Please sign in.' }, 401);
  if (!env.DB) return json({ error: 'No database connected.' }, 503);
  return null;
};

export async function onRequestPost({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }

  const id = clean(body.id, 60);
  if (!id) return json({ error: 'Which quote?' }, 400);

  const row = await env.DB.prepare(
    'SELECT q.*, l.name AS lead_name, l.email AS lead_email, l.service_label, l.city ' +
    'FROM quotes q JOIN leads l ON l.id = q.lead_id WHERE q.id = ?'
  ).bind(id).first();

  if (!row) return json({ error: 'Quote not found.' }, 404);
  if (row.status === 'accepted') return json({ error: 'This quote was already accepted.' }, 400);

  const quote = quoteFromRow(row);
  if (isExpired(quote)) return json({ error: 'This quote has expired. Edit the expiry and try again.' }, 400);

  const customerEmail = clean(body.customer_email, 160) || quote.customer_email || row.lead_email;
  if (!customerEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail)) {
    return json({ error: 'A valid customer email is required to send.' }, 400);
  }

  const now = new Date().toISOString();
  const url = proposalUrl(env, quote.token);
  const mail = buildCustomerQuoteEmail(env, { quote, lead: row, proposalUrl: url });

  const customerErr = await sendCustomerEmail(env, {
    to: customerEmail,
    subject: mail.customerSubject,
    html: mail.customerHtml,
    text: mail.customerText
  });

  // Also notify Kristina that a quote went out.
  const notifyErr = await sendEmail(env, {
    subject: mail.adminSubject,
    html: mail.adminHtml,
    text: mail.adminText
  });

  if (customerErr) {
    return json({ error: 'Could not send quote to customer.', detail: customerErr }, 502);
  }

  await env.DB.prepare(
    `UPDATE quotes SET status = 'sent', sent_at = ?, updated_at = ?, customer_email = ? WHERE id = ?`
  ).bind(now, now, customerEmail, id).run();

  await env.DB.prepare(
    `UPDATE leads SET status = 'quoted', updated_at = ?,
      quoted_amount = ?, quoted_at = COALESCE(quoted_at, ?)
     WHERE id = ?`
  ).bind(
    now,
    `$${(quote.total / 100).toFixed(2)}`,
    now,
    quote.lead_id
  ).run();

  const updated = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(id).first();
  return json({
    ok: true,
    quote: quoteFromRow(updated),
    proposalUrl: url,
    emailWarning: notifyErr || null
  });
}

async function sendCustomerEmail(env, { to, subject, text, html }) {
  if (env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.QUOTE_FROM_EMAIL || 'Oasis Coastal Cleaning <onboarding@resend.dev>',
        to: [to],
        reply_to: env.QUOTE_TO_EMAIL || 'info@oasiscoastalcleaning.com',
        subject, text, html
      })
    });
    if (res.ok) return null;
    return `Resend returned ${res.status}: ${await res.text()}`;
  }

  if (env.BREVO_API_KEY) {
    const fromEmail = (env.QUOTE_FROM_EMAIL || 'noreply@oasiscoastalcleaning.com').replace(/.*<([^>]+)>.*/, '$1').trim();
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: env.QUOTE_FROM_NAME || 'Oasis Coastal Cleaning', email: fromEmail },
        to: [{ email: to }],
        replyTo: { email: env.QUOTE_TO_EMAIL || 'info@oasiscoastalcleaning.com' },
        subject,
        textContent: text,
        htmlContent: html
      })
    });
    if (res.ok) return null;
    return `Brevo returned ${res.status}: ${await res.text()}`;
  }

  return 'No email provider configured for customer delivery.';
}
