/**
 * GET  /api/proposal/[token] — public quote view
 * POST /api/proposal/[token] — accept or decline
 *   { action: 'accept'|'decline', add_ons?: string[], reason?: string }
 */
import { json, clean, sendEmail } from '../../_lib/util.js';
import {
  quoteFromRow, isExpired, recordQuoteView, logQuoteEvent
} from '../../_lib/quotes.js';
import { availableAddons, resolveSelectedAddons } from '../../_lib/addons.js';
import { buildQuoteAcceptedEmail, buildQuoteDeclinedEmail } from '../../_lib/email.js';

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

    let quote = quoteFromRow(row);
    if (quote.status === 'draft') return json({ error: 'This quote is not ready yet.' }, 403);

    if (isExpired(quote) && quote.status === 'sent') {
      await env.DB.prepare(
        `UPDATE quotes SET status = 'expired', updated_at = ? WHERE id = ?`
      ).bind(new Date().toISOString(), quote.id).run();
      await logQuoteEvent(env.DB, quote.id, 'expired');
      quote.status = 'expired';
    }

    await recordQuoteView(env.DB, quote);
    const fresh = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(quote.id).first();
    quote = quoteFromRow(fresh || row);

    const addons = quote.status === 'sent'
      ? availableAddons(quote.line_items).map(({ id, label, note, group }) => ({ id, label, note, group }))
      : [];

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
        email_status: quote.email_status,
        email_delivered_at: quote.email_delivered_at,
        email_opened_at: quote.email_opened_at,
        first_viewed_at: quote.first_viewed_at,
        last_viewed_at: quote.last_viewed_at,
        view_count: quote.view_count,
        service_label: row.service_label,
        city: row.city,
        property_type: row.property_type,
        size_label: row.size_label
      },
      available_addons: addons,
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
    const reason = clean(body.reason, 1000);
    await env.DB.prepare(
      `UPDATE quotes SET status = 'declined', declined_at = ?, updated_at = ? WHERE id = ?`
    ).bind(now, now, quote.id).run();
    await logQuoteEvent(env.DB, quote.id, 'declined', reason ? { reason } : null);
    try {
      const mail = buildQuoteDeclinedEmail(env, { quote, lead: row, reason });
      await sendEmail(env, {
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        replyTo: row.lead_email || undefined
      });
    } catch (err) {
      console.error('Decline notification email failed:', err);
    }
    return json({ ok: true, status: 'declined' });
  }

  // Only allow add-ons that were not already on the quote.
  const allowed = new Set(availableAddons(quote.line_items).map((a) => a.id));
  const requestedIds = (Array.isArray(body.add_ons) ? body.add_ons : [])
    .map((id) => String(id || '').trim())
    .filter((id) => allowed.has(id));
  const requestedAddons = resolveSelectedAddons(requestedIds);

  await env.DB.prepare(
    `UPDATE quotes SET status = 'accepted', accepted_at = ?, updated_at = ? WHERE id = ?`
  ).bind(now, now, quote.id).run();
  await logQuoteEvent(
    env.DB,
    quote.id,
    'accepted',
    requestedAddons.length
      ? { add_ons: requestedAddons.map((a) => ({ id: a.id, label: a.label })) }
      : null
  );

  await env.DB.prepare(
    `UPDATE leads SET status = 'booked', updated_at = ? WHERE id = ?`
  ).bind(now, quote.lead_id).run();

  try {
    const mail = buildQuoteAcceptedEmail(env, { quote, lead: row, requestedAddons });
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
