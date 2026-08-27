/**
 * GET  /api/proposal/[token] — public quote view
 * POST /api/proposal/[token] — accept or decline { action: 'accept'|'decline' }
 */
import { json, clean, sendEmail } from '../../_lib/util.js';
import {
  quoteFromRow, isExpired
} from '../../_lib/quotes.js';
import { buildQuoteAcceptedEmail } from '../../_lib/email.js';

export async function onRequestGet({ request, env, params }) {
  if (!env.DB) return json({ error: 'Service unavailable.' }, 503);

  const token = clean(params.token, 80);
  if (!token) return json({ error: 'Invalid link.' }, 400);

  try {
    const row = await env.DB.prepare(
      `SELECT q.*, l.service_label, l.city, l.property_type, l.size_label
       FROM quotes q JOIN leads l ON l.id = q.lead_id WHERE q.token = ?`
    ).bind(token).first();

    if (!row) return json({ error: 'Quote not found.' }, 404);

    const quote = quoteFromRow(row);
    if (quote.status === 'draft') return json({ error: 'This quote is not ready yet.' }, 403);

    if (isExpired(quote) && quote.status === 'sent') {
      await env.DB.prepare(
        `UPDATE quotes SET status = 'expired', updated_at = ? WHERE id = ?`
      ).bind(new Date().toISOString(), quote.id).run();
      quote.status = 'expired';
    }

    return json({
      quote: {
        id: quote.id,
        status: quote.status,
        customer_name: quote.customer_name,
        line_items: quote.line_items,
        subtotal: quote.subtotal,
        tax: quote.tax,
        total: quote.total,
        notes: quote.notes,
        terms: quote.terms,
        expires_at: quote.expires_at,
        sent_at: quote.sent_at,
        accepted_at: quote.accepted_at,
        declined_at: quote.declined_at,
        service_label: row.service_label,
        city: row.city,
        property_type: row.property_type,
        size_label: row.size_label
      },
      business: {
        name: 'Oasis Coastal Cleaning',
        phone: '(561) 201-7123',
        email: 'info@oasiscoastalcleaning.com'
      }
    });
  } catch (err) {
    return json({ error: 'Service unavailable.', detail: String(err && err.message || err) }, 503);
  }
}

export async function onRequestPost({ request, env, params }) {
  if (!env.DB) return json({ error: 'Service unavailable.' }, 503);

  const token = clean(params.token, 80);
  if (!token) return json({ error: 'Invalid link.' }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }

  const action = clean(body.action, 20);
  if (action !== 'accept' && action !== 'decline') {
    return json({ error: 'Unknown action.' }, 400);
  }

  const row = await env.DB.prepare(
    `SELECT q.*, l.name AS lead_name, l.email AS lead_email, l.service_label, l.city
     FROM quotes q JOIN leads l ON l.id = q.lead_id WHERE q.token = ?`
  ).bind(token).first();

  if (!row) return json({ error: 'Quote not found.' }, 404);

  const quote = quoteFromRow(row);
  if (quote.status === 'accepted') return json({ ok: true, status: 'accepted', message: 'Already accepted.' });
  if (quote.status === 'declined') return json({ ok: true, status: 'declined', message: 'Already declined.' });
  if (quote.status !== 'sent') return json({ error: 'This quote cannot be answered yet.' }, 403);
  if (isExpired(quote)) {
    await env.DB.prepare(
      `UPDATE quotes SET status = 'expired', updated_at = ? WHERE id = ?`
    ).bind(new Date().toISOString(), quote.id).run();
    return json({ error: 'This quote has expired. Contact Kristina for an updated quote.' }, 410);
  }

  const now = new Date().toISOString();

  if (action === 'decline') {
    await env.DB.prepare(
      `UPDATE quotes SET status = 'declined', declined_at = ?, updated_at = ? WHERE id = ?`
    ).bind(now, now, quote.id).run();
    return json({ ok: true, status: 'declined' });
  }

  await env.DB.prepare(
    `UPDATE quotes SET status = 'accepted', accepted_at = ?, updated_at = ? WHERE id = ?`
  ).bind(now, now, quote.id).run();

  await env.DB.prepare(
    `UPDATE leads SET status = 'booked', updated_at = ? WHERE id = ?`
  ).bind(now, quote.lead_id).run();

  try {
    const mail = buildQuoteAcceptedEmail(env, { quote, lead: row });
    await sendEmail(env, {
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      replyTo: row.lead_email || undefined
    });
  } catch (err) {
    console.error('Accept notification email failed:', err);
  }

  return json({
    ok: true,
    status: 'accepted',
    message: 'Thank you — Kristina will be in touch to confirm your first visit.'
  });
}
