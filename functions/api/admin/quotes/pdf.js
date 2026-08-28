/** GET /api/admin/quotes/pdf?id=… — the quote as a PDF, for Kristina. */
import { json, clean } from '../../../_lib/util.js';
import { isSignedIn } from '../../../_lib/auth.js';
import { quoteFromRow } from '../../../_lib/quotes.js';
import { renderQuotePdf } from '../../../_lib/quote-doc.js';

export async function onRequestGet({ request, env }) {
  if (!await isSignedIn(request, env)) return json({ error: 'Please sign in.' }, 401);
  if (!env.DB) return json({ error: 'No database connected.' }, 503);

  const id = clean(new URL(request.url).searchParams.get('id'), 60);
  if (!id) return json({ error: 'Which quote?' }, 400);

  let row;
  try {
    row = await env.DB.prepare(
    `SELECT q.*, l.name, l.service_label, l.city, l.address
     FROM quotes q LEFT JOIN leads l ON l.id = q.lead_id WHERE q.id = ?`
    ).bind(id).first();
  } catch (err) {
    return json({ error: 'Could not read that quote.', detail: String(err && err.message || err) }, 503);
  }
  if (!row) return json({ error: 'Quote not found.' }, 404);

  const quote = quoteFromRow(row);
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
