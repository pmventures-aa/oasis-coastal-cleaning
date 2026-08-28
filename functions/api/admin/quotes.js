/**
 * GET   /api/admin/quotes?lead_id=…  — quotes for one lead
 * POST  /api/admin/quotes            — create a draft quote
 * PATCH /api/admin/quotes            — update a draft quote
 */
import { json, clean, newId } from '../../_lib/util.js';
import { isSignedIn } from '../../_lib/auth.js';
import {
  newToken, normalizeLineItems, quoteFromRow, defaultExpiry, logQuoteEvent, attachQuoteEvents
} from '../../_lib/quotes.js';

const guard = async (request, env) => {
  if (!await isSignedIn(request, env)) return json({ error: 'Please sign in.' }, 401);
  if (!env.DB) return json({ error: 'No database connected.' }, 503);
  return null;
};

export async function onRequestGet({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;

  const leadId = clean(new URL(request.url).searchParams.get('lead_id'), 60);
  if (!leadId) return json({ error: 'Which lead?' }, 400);

  try {
    const includeArchived = new URL(request.url).searchParams.get('include_archived') === '1';
    const sql = includeArchived
      ? 'SELECT * FROM quotes WHERE lead_id = ? ORDER BY created_at DESC LIMIT 30'
      : 'SELECT * FROM quotes WHERE lead_id = ? AND archived_at IS NULL ORDER BY created_at DESC LIMIT 30';
    const { results } = await env.DB.prepare(sql).bind(leadId).all();
    const quotes = await attachQuoteEvents(env.DB, results || []);
    return json({ quotes });
  } catch (err) {
    return json({
      error: 'The quotes table is missing. Apply migration 0002_quotes.sql.',
      detail: String(err && err.message || err)
    }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }

  let leadId = clean(body.lead_id, 60);
  const customerName = clean(body.customer_name, 120);
  const customerEmail = clean(body.customer_email, 160);
  const phone = clean(body.phone, 20);
  const serviceLabel = clean(body.service_label, 120) || 'Custom quote';

  let normalized;
  try { normalized = normalizeLineItems(body.line_items); }
  catch (err) { return json({ error: String(err.message || err) }, 400); }

  const now = new Date().toISOString();
  let lead;

  if (!leadId) {
    if (!customerName) return json({ error: 'Customer name is required for a new quote.' }, 400);
    const address = clean(body.address, 200);
    const city = clean(body.city, 80);
    const zip = clean(body.zip, 12);
    leadId = newId();
    await env.DB.prepare(
      `INSERT INTO leads (
        id, created_at, updated_at, name, phone, email, service, service_label,
        address, city, zip, status, source_page
      ) VALUES (?, ?, ?, ?, ?, ?, 'custom', ?, ?, ?, ?, 'new', 'admin-new-quote')`
    ).bind(
      leadId, now, now,
      customerName,
      phone || '—',
      customerEmail || '',
      serviceLabel,
      address,
      city,
      zip
    ).run();
    lead = { id: leadId, name: customerName, email: customerEmail };
  } else {
    lead = await env.DB.prepare('SELECT id, name, email FROM leads WHERE id = ?').bind(leadId).first();
    if (!lead) return json({ error: 'Lead not found.' }, 404);
  }

  const id = newId();
  const token = newToken();
  const expiresDays = Math.min(Math.max(parseInt(body.expires_days, 10) || 14, 1), 90);
  const notes = clean(body.notes, 4000);
  const terms = clean(body.terms, 2000) ||
    'This quote is valid until the date shown. Prices include labor and supplies unless noted.';

  try {
    await env.DB.prepare(
      `INSERT INTO quotes (
        id, lead_id, created_at, updated_at, status, token,
        customer_name, customer_email, line_items, subtotal, tax, total,
        notes, terms, expires_at
      ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, leadId, now, now, token,
      customerName || clean(lead.name, 120),
      customerEmail || clean(lead.email, 160),
      JSON.stringify(normalized.items),
      normalized.subtotal, normalized.tax, normalized.total,
      notes, terms, defaultExpiry(expiresDays)
    ).run();

    const row = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(id).first();
    await logQuoteEvent(env.DB, id, 'created');
    return json({ quote: quoteFromRow(row), lead_id: leadId }, 201);
  } catch (err) {
    return json({
      error: 'Could not save quote. Is migration 0002 applied?',
      detail: String(err && err.message || err)
    }, 503);
  }
}

export async function onRequestPatch({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }

  const id = clean(body.id, 60);
  if (!id) return json({ error: 'Which quote?' }, 400);

  const existing = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(id).first();
  if (!existing) return json({ error: 'Quote not found.' }, 404);

  const action = clean(body.action, 20);
  if (action === 'archive') {
    await env.DB.prepare(
      'UPDATE quotes SET archived_at = ?, updated_at = ? WHERE id = ?'
    ).bind(new Date().toISOString(), new Date().toISOString(), id).run();
    return json({ ok: true, action: 'archived' });
  }
  if (action === 'restore') {
    await env.DB.prepare(
      'UPDATE quotes SET archived_at = NULL, updated_at = ? WHERE id = ?'
    ).bind(new Date().toISOString(), id).run();
    return json({ ok: true, action: 'restored' });
  }
  /* Accepted is not always final. The customer adds a room, the job changes,
     or a payment question turns up weeks later — she needs the quote back
     without losing what it said or who accepted it. Reopening is deliberate,
     dated and recorded; the acceptance details stay on the row. */
  if (action === 'reopen') {
    if (existing.status !== 'accepted') {
      return json({ error: 'Only an accepted quote needs reopening.' }, 400);
    }
    const at = new Date().toISOString();
    const reason = clean(body.reason, 500);
    await env.DB.prepare(
      `UPDATE quotes SET status = 'sent', reopened_at = ?, reopen_reason = ?, updated_at = ?
       WHERE id = ?`
    ).bind(at, reason || null, at, id).run().catch(async (err) => {
      console.error('Reopen columns missing:', err && err.message || err);
      await env.DB.prepare(
        `UPDATE quotes SET status = 'sent', updated_at = ? WHERE id = ?`
      ).bind(at, id).run();
    });
    await logQuoteEvent(env.DB, id, 'reopened', reason ? { reason } : null);
    return json({ ok: true, action: 'reopened' });
  }

  /* The two things that happen after a yes: the work, and the money. Each is
     a date rather than a flag, so "when did she finish it" and "when did they
     pay" are answerable later. Both can be undone — she will mis-tap. */
  if (action === 'complete' || action === 'uncomplete') {
    const at = action === 'complete' ? new Date().toISOString() : null;
    await env.DB.prepare('UPDATE quotes SET completed_at = ?, updated_at = ? WHERE id = ?')
      .bind(at, new Date().toISOString(), id).run();
    await logQuoteEvent(env.DB, id, action === 'complete' ? 'completed' : 'uncompleted');
    return json({ ok: true, action });
  }

  if (action === 'paid' || action === 'unpaid') {
    const at = action === 'paid' ? new Date().toISOString() : null;
    const note = clean(body.note, 200);
    await env.DB.prepare('UPDATE quotes SET paid_at = ?, paid_note = ?, updated_at = ? WHERE id = ?')
      .bind(at, at ? (note || null) : null, new Date().toISOString(), id).run();
    // Paid work is finished work, whether or not she remembered to say so.
    if (at) {
      await env.DB.prepare(
        'UPDATE quotes SET completed_at = COALESCE(completed_at, ?) WHERE id = ?'
      ).bind(at, id).run();
    }
    await logQuoteEvent(env.DB, id, action === 'paid' ? 'paid' : 'unpaid', note ? { note } : null);
    return json({ ok: true, action });
  }

  if (action === 'delete') {
    await env.DB.prepare('DELETE FROM quote_events WHERE quote_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM quotes WHERE id = ?').bind(id).run();
    return json({ ok: true, action: 'deleted' });
  }

  /* A quote that has gone out can still be fixed — she under-quoted, or the
     customer asked for the oven too. Editing pulls it back to a draft so the
     link stops showing a price she is halfway through changing, keeps the same
     token and the original sent_at, and waits for her to send it again.

     An accepted quote is a deal, not a document, so it stays locked. */
  if (existing.status === 'accepted') {
    return json({
      error: 'This quote was accepted, so it cannot be changed. Create a new quote for the extra work.'
    }, 400);
  }
  if (existing.archived_at) {
    return json({ error: 'Restore this quote before editing it.' }, 400);
  }

  const wasSent = existing.status !== 'draft';


  const sets = [];
  const values = [];

  if (wasSent) {
    sets.push('status = ?');
    values.push('draft');
  }

  if (body.line_items !== undefined) {
    let normalized;
    try { normalized = normalizeLineItems(body.line_items); }
    catch (err) { return json({ error: String(err.message || err) }, 400); }
    sets.push('line_items = ?', 'subtotal = ?', 'tax = ?', 'total = ?');
    values.push(JSON.stringify(normalized.items), normalized.subtotal, normalized.tax, normalized.total);
  }

  if (body.notes !== undefined) {
    sets.push('notes = ?');
    values.push(clean(body.notes, 4000));
  }

  if (body.terms !== undefined) {
    sets.push('terms = ?');
    values.push(clean(body.terms, 2000));
  }

  if (body.expires_days !== undefined) {
    const days = Math.min(Math.max(parseInt(body.expires_days, 10) || 14, 1), 90);
    sets.push('expires_at = ?');
    values.push(defaultExpiry(days));
  }

  if (body.customer_name !== undefined) {
    sets.push('customer_name = ?');
    values.push(clean(body.customer_name, 120));
  }

  if (body.customer_email !== undefined) {
    sets.push('customer_email = ?');
    values.push(clean(body.customer_email, 160));
  }

  if (!sets.length) return json({ error: 'Nothing to change.' }, 400);

  sets.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  await env.DB.prepare(`UPDATE quotes SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();

  // The history is the point of the trail: a quote that changed after the
  // customer already had it should say so.
  if (wasSent) await logQuoteEvent(env.DB, id, 'revised', { from_status: existing.status });
  const row = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(id).first();
  return json({ quote: quoteFromRow(row) });
}
