/**
 * GET  /api/q/:token   — the public quote a customer opens
 * POST /api/q/:token   — click to accept
 *
 * The token is the only credential. Anyone with the link can read the quote
 * and accept it; there is nothing else secret on the record.
 */
import { json, clean, sendEmail } from '../../../_lib/util.js';
import { buildQuoteAcceptedEmail } from '../../../_lib/email.js';
import { publicQuote } from '../../../_lib/quotes.js';

export async function onRequestGet({ params, env }) {
  const token = clean(params && params.token, 80);
  if (!token || !env.DB) return json({ error: 'That quote could not be found.' }, 404);

  try {
    const row = await env.DB.prepare('SELECT * FROM quotes WHERE token = ?').bind(token).first();
    if (!row) return json({ error: 'That quote could not be found.' }, 404);
    return json({ quote: publicQuote(row) });
  } catch (err) {
    return json({ error: 'That quote could not be found.' }, 404);
  }
}

export async function onRequestPost({ request, params, env }) {
  const token = clean(params && params.token, 80);
  if (!token || !env.DB) return json({ error: 'That quote could not be found.' }, 404);

  let body = {};
  try { body = await request.json(); } catch { body = {}; }

  let row;
  try {
    row = await env.DB.prepare('SELECT * FROM quotes WHERE token = ?').bind(token).first();
  } catch {
    return json({ error: 'That quote could not be found.' }, 404);
  }
  if (!row) return json({ error: 'That quote could not be found.' }, 404);

  if (row.status === 'accepted') {
    return json({ ok: true, already: true, quote: publicQuote(row) });
  }

  const acceptedName = clean(body.name, 120) || row.customer_name;
  const now = new Date().toISOString();
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ua = clean(request.headers.get('User-Agent') || '', 300);

  try {
    await env.DB.prepare(
      `UPDATE quotes SET status = 'accepted', accepted_at = ?, accepted_name = ?,
         accepted_ip = ?, accepted_ua = ?, sent_at = COALESCE(sent_at, ?), updated_at = ?
       WHERE token = ? AND status != 'accepted'`
    ).bind(now, acceptedName, ip, ua, now, now, token).run();
  } catch (err) {
    return json({ error: 'Could not accept that quote just now. Try once more.' }, 500);
  }

  if (row.lead_id) {
    try {
      await env.DB.prepare(
        `UPDATE leads SET status = CASE WHEN status = 'closed' THEN status ELSE 'booked' END,
           updated_at = ? WHERE id = ?`
      ).bind(now, row.lead_id).run();
    } catch { /* accepting the quote still stands if the lead stamp fails */ }
  }

  const accepted = {
    ...row,
    status: 'accepted',
    accepted_at: now,
    accepted_name: acceptedName,
    sent_at: row.sent_at || now
  };

  const { subject, text, html } = buildQuoteAcceptedEmail(env, accepted);
  await sendEmail(env, { subject, text, html });

  return json({ ok: true, already: false, quote: publicQuote(accepted) });
}
