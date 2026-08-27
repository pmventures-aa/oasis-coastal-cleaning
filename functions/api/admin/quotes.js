/**
 * GET    /api/admin/quotes?lead_id=   — quotes for one lead, newest first
 * POST   /api/admin/quotes            — create (and optionally email) a quote
 * PATCH  /api/admin/quotes            — update a draft/sent quote; send or resend
 *
 * All require a signed-in session. Line-item totals are computed here, never
 * trusted from the browser.
 */
import { json, clean, isEmail, newId, sendEmail, siteBase } from '../../_lib/util.js';
import { isSignedIn } from '../../_lib/auth.js';
import { buildCustomerQuoteEmail } from '../../_lib/email.js';
import {
  normalizeLineItems, quoteTotals, publicQuote,
  formatTotalLabel, newToken, defaultValidUntil
} from '../../_lib/quotes.js';

const STATUSES = ['draft', 'sent', 'accepted'];

const guard = async (request, env) => {
  if (!await isSignedIn(request, env)) return json({ error: 'Please sign in.' }, 401);
  if (!env.DB) {
    return json({
      error: 'No database is connected, so quotes cannot be saved yet.'
    }, 503);
  }
  return null;
};

const missingTable = (err) => {
  const msg = String(err && err.message || err);
  return /no such table/i.test(msg);
};

export async function onRequestGet({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;

  const url = new URL(request.url);
  const leadId = clean(url.searchParams.get('lead_id'), 60);

  try {
    const sql = leadId
      ? 'SELECT * FROM quotes WHERE lead_id = ? ORDER BY created_at DESC LIMIT 20'
      : 'SELECT * FROM quotes ORDER BY created_at DESC LIMIT 50';
    const stmt = leadId
      ? env.DB.prepare(sql).bind(leadId)
      : env.DB.prepare(sql);
    const { results } = await stmt.all();
    return json({ quotes: (results || []).map(adminQuote) });
  } catch (err) {
    if (missingTable(err)) {
      return json({
        quotes: [],
        setup: true,
        error: 'The quotes table is missing. Apply migration 0002_quotes.sql with ' +
               '`npx wrangler d1 migrations apply oasis --remote`.'
      }, 503);
    }
    return json({ error: 'Could not load quotes.', detail: String(err && err.message || err) }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }

  const send = body.send === true;
  const items = normalizeLineItems(body.line_items);
  if (!items.length) return json({ error: 'Add at least one line item.' }, 400);

  const customer_name = clean(body.customer_name, 120);
  const customer_email = clean(body.customer_email, 160).toLowerCase();
  const customer_phone = clean(body.customer_phone, 40);
  if (!customer_name) return json({ error: 'A name is needed on the quote.' }, 400);
  if (!isEmail(customer_email)) return json({ error: 'That email address does not look right.' }, 400);

  const now = new Date().toISOString();
  let leadId = clean(body.lead_id, 60);

  try {
    if (!leadId) {
      leadId = await createLeadForQuote(env, {
        name: customer_name,
        email: customer_email,
        phone: customer_phone,
        service: clean(body.service, 60) || 'custom',
        service_label: clean(body.service_label, 80) || 'Custom quote',
        city: clean(body.city, 80),
        frequency: clean(body.frequency, 60),
        status: send ? 'quoted' : 'contacted',
        now
      });
    }

    const quote = {
      id: newId(),
      lead_id: leadId || null,
      token: newToken(),
      created_at: now,
      updated_at: now,
      sent_at: send ? now : null,
      accepted_at: null,
      status: send ? 'sent' : 'draft',
      customer_name,
      customer_email,
      customer_phone,
      service_label: clean(body.service_label, 80),
      frequency: clean(body.frequency, 60),
      intro: clean(body.intro, 2000),
      line_items: JSON.stringify(items),
      notes: clean(body.notes, 4000),
      price_note: clean(body.price_note, 80),
      valid_until: clean(body.valid_until, 10) || defaultValidUntil(),
      accepted_name: null,
      accepted_ip: null,
      accepted_ua: null
    };

    const cols = Object.keys(quote);
    await env.DB.prepare(
      `INSERT INTO quotes (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
    ).bind(...cols.map((c) => quote[c])).run();

    if (leadId) await stampLead(env, leadId, quote, send);

    let emailed = false;
    let mailProblem = null;
    if (send) {
      mailProblem = await emailQuote(env, quote);
      emailed = !mailProblem;
    }

    return json({
      ok: true,
      quote: adminQuote(quote),
      emailed,
      mailProblem,
      viewUrl: viewUrl(env, quote.token)
    });
  } catch (err) {
    if (missingTable(err)) {
      return json({
        setup: true,
        error: 'The quotes table is missing. Apply migration 0002_quotes.sql with ' +
               '`npx wrangler d1 migrations apply oasis --remote`.'
      }, 503);
    }
    return json({ error: 'Could not save that quote.', detail: String(err && err.message || err) }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }

  const id = clean(body.id, 60);
  if (!id) return json({ error: 'Which quote?' }, 400);

  let row;
  try {
    row = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(id).first();
  } catch (err) {
    if (missingTable(err)) {
      return json({ setup: true, error: 'The quotes table is missing.' }, 503);
    }
    return json({ error: 'Could not load that quote.' }, 500);
  }
  if (!row) return json({ error: 'That quote was not found.' }, 404);
  if (row.status === 'accepted') {
    return json({ error: 'This quote has already been accepted. Write a new one to change the price.' }, 409);
  }

  const send = body.send === true;
  const now = new Date().toISOString();
  const items = body.line_items !== undefined
    ? normalizeLineItems(body.line_items)
    : normalizeLineItems(parseMaybe(row.line_items));
  if (!items.length) return json({ error: 'Add at least one line item.' }, 400);

  const customer_name = body.customer_name !== undefined ? clean(body.customer_name, 120) : row.customer_name;
  const customer_email = body.customer_email !== undefined
    ? clean(body.customer_email, 160).toLowerCase()
    : row.customer_email;
  if (!customer_name) return json({ error: 'A name is needed on the quote.' }, 400);
  if (!isEmail(customer_email)) return json({ error: 'That email address does not look right.' }, 400);

  const next = {
    ...row,
    customer_name,
    customer_email,
    customer_phone: body.customer_phone !== undefined ? clean(body.customer_phone, 40) : row.customer_phone,
    service_label: body.service_label !== undefined ? clean(body.service_label, 80) : row.service_label,
    frequency: body.frequency !== undefined ? clean(body.frequency, 60) : row.frequency,
    intro: body.intro !== undefined ? clean(body.intro, 2000) : row.intro,
    line_items: JSON.stringify(items),
    notes: body.notes !== undefined ? clean(body.notes, 4000) : row.notes,
    price_note: body.price_note !== undefined ? clean(body.price_note, 80) : row.price_note,
    valid_until: body.valid_until !== undefined
      ? (clean(body.valid_until, 10) || defaultValidUntil())
      : row.valid_until,
    updated_at: now
  };

  if (send) {
    next.status = 'sent';
    next.sent_at = next.sent_at || now;
  }

  try {
    await env.DB.prepare(
      `UPDATE quotes SET
         customer_name = ?, customer_email = ?, customer_phone = ?,
         service_label = ?, frequency = ?, intro = ?, line_items = ?,
         notes = ?, price_note = ?, valid_until = ?,
         status = ?, sent_at = ?, updated_at = ?
       WHERE id = ?`
    ).bind(
      next.customer_name, next.customer_email, next.customer_phone,
      next.service_label, next.frequency, next.intro, next.line_items,
      next.notes, next.price_note, next.valid_until,
      next.status, next.sent_at, next.updated_at,
      id
    ).run();

    if (next.lead_id) await stampLead(env, next.lead_id, next, send);

    let emailed = false;
    let mailProblem = null;
    if (send) {
      mailProblem = await emailQuote(env, next);
      emailed = !mailProblem;
    }

    return json({
      ok: true,
      quote: adminQuote(next),
      emailed,
      mailProblem,
      viewUrl: viewUrl(env, next.token)
    });
  } catch (err) {
    return json({ error: 'Could not update that quote.', detail: String(err && err.message || err) }, 500);
  }
}

function parseMaybe(v) {
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string' || !v) return [];
  try { const out = JSON.parse(v); return Array.isArray(out) ? out : []; }
  catch { return []; }
}

function adminQuote(row) {
  const pub = publicQuote(row);
  return {
    ...pub,
    id: row.id,
    lead_id: row.lead_id,
    token: row.token,
    customer_email: row.customer_email,
    customer_phone: row.customer_phone || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
    view_path: `/q/${row.token}`
  };
}

function viewUrl(env, token) {
  return `${siteBase(env)}/q/${token}`;
}

async function emailQuote(env, quote) {
  const url = viewUrl(env, quote.token);
  const { subject, text, html } = buildCustomerQuoteEmail(env, quote, url);
  const bcc = env.QUOTE_TO_EMAIL || 'info@oasiscoastalcleaning.com';
  return sendEmail(env, {
    to: quote.customer_email,
    bcc,
    replyTo: env.QUOTE_TO_EMAIL || 'info@oasiscoastalcleaning.com',
    subject, text, html
  });
}

async function stampLead(env, leadId, quote, send) {
  const { total } = quoteTotals(normalizeLineItems(parseItemsSafe(quote.line_items)));
  const amount = formatTotalLabel(total, quote.price_note);
  const now = new Date().toISOString();
  if (send) {
    await env.DB.prepare(
      `UPDATE leads SET quoted_amount = ?, quoted_at = COALESCE(quoted_at, ?),
         status = CASE WHEN status IN ('booked', 'closed') THEN status ELSE 'quoted' END,
         updated_at = ? WHERE id = ?`
    ).bind(amount, now, now, leadId).run();
  } else {
    await env.DB.prepare(
      `UPDATE leads SET quoted_amount = ?, updated_at = ? WHERE id = ?`
    ).bind(amount, now, leadId).run();
  }
}

function parseItemsSafe(v) {
  return parseMaybe(v);
}

async function createLeadForQuote(env, { name, email, phone, service, service_label, city, frequency, status, now }) {
  const lead = {
    id: newId(),
    created_at: now,
    updated_at: now,
    name,
    phone: phone || '',
    email,
    service,
    service_label,
    city: city || '',
    frequency: frequency || '',
    status,
    followup: 'none',
    admin_notes: 'Created from a quote written in the portal.',
    add_ons: '[]',
    conditions: '[]',
    preferred_days: '[]',
    first_visit: 0
  };
  const cols = Object.keys(lead);
  await env.DB.prepare(
    `INSERT INTO leads (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
  ).bind(...cols.map((c) => lead[c])).run();
  return lead.id;
}
