/**
 * GET /api/proposal/{token}/pdf — the customer's own copy.
 *
 * The token is the only credential, exactly as it is for viewing the quote,
 * and a draft is no more downloadable than it is viewable.
 */
import { json, clean } from '../../../_lib/util.js';
import { quoteFromRow } from '../../../_lib/quotes.js';
import { renderQuotePdf } from '../../../_lib/quote-doc.js';

export async function onRequestGet({ request, env, params }) {
  if (!env.DB) return json({ error: 'Service unavailable.' }, 503);

  const token = clean(params.token, 80);
  if (!token) return json({ error: 'Invalid link.' }, 400);

  let row;
  try {
    row = await env.DB.prepare(
    `SELECT q.*, l.name, l.service_label, l.city, l.address
     FROM quotes q JOIN leads l ON l.id = q.lead_id WHERE q.token = ?`
    ).bind(token).first();
  } catch (err) {
    console.error('Quote PDF lookup failed:', err && err.message || err);
    return json({ error: 'Service unavailable.' }, 503);
  }
  if (!row) return json({ error: 'Quote not found.' }, 404);

  const quote = quoteFromRow(row);
  if (quote.status === 'draft') return json({ error: 'This quote is not ready yet.' }, 403);

  let bytes, filename;
  try {
    ({ bytes, filename } = await renderQuotePdf(env, request, { quote, lead: row }));
  } catch (err) {
    console.error('Quote PDF build failed:', err && err.message || err);
    return json({ error: 'Could not build that PDF.' }, 500);
  }
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    }
  });
}
