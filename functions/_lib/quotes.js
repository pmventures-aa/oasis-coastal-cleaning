/** Shared helpers for branded quotes with line items. */

import { newId } from './util.js';

export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'declined', 'expired'];
export const EMAIL_STATUSES = ['pending', 'sending', 'sent', 'delivered', 'opened', 'failed', 'bounced'];

export const QUOTE_EVENT_LABELS = {
  created: 'Quote Created',
  sent: 'Email Sent',
  email_delivered: 'Email Delivered',
  email_opened: 'Email Opened',
  email_bounced: 'Email Bounced',
  email_failed: 'Email Failed',
  viewed: 'Quote Viewed',
  accepted: 'Quote Accepted',
  declined: 'Quote Declined',
  expired: 'Quote Expired'
};

/** Human-readable Title Case for status slugs shown in the admin UI. */
export function titleCase(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const newToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const formatMoney = (cents) => {
  const n = Number(cents);
  if (!Number.isFinite(n)) return '$0.00';
  return '$' + (n / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

export const parseDollars = (v) => {
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
};

/** Normalize line items and compute subtotal/total in cents. */
export function normalizeLineItems(raw) {
  if (!Array.isArray(raw) || !raw.length) {
    throw new Error('Add at least one line item.');
  }

  const items = raw.slice(0, 40).map((row, i) => {
    const label = String(row.label || '').trim().slice(0, 160);
    if (!label) throw new Error(`Line item ${i + 1} needs a description.`);

    const description = String(row.description || '').trim().slice(0, 400);
    const qty = Math.max(1, Math.min(999, Math.round(Number(row.qty) || 1)));
    // Both branches clamp. Only the first one used to, so a typed "-100" in the
    // dollars field produced a negative line, a negative total, and an emailed
    // quote that owed the customer money.
    const unitPrice = Math.max(0, Number.isFinite(+row.unit_price)
      ? Math.round(+row.unit_price)
      : parseDollars(row.unit_dollars));
    const total = qty * unitPrice;

    return { label, description, qty, unit_price: unitPrice, total };
  });

  const subtotal = items.reduce((sum, it) => sum + it.total, 0);
  return { items, subtotal, tax: 0, total: subtotal };
}

export function parseStoredLineItems(json) {
  try {
    const out = JSON.parse(json || '[]');
    return Array.isArray(out) ? out : [];
  } catch {
    return [];
  }
}

export function quoteFromRow(row) {
  if (!row) return null;
  return {
    ...row,
    line_items: parseStoredLineItems(row.line_items)
  };
}

export function isExpired(quote) {
  if (!quote || !quote.expires_at) return false;
  const t = Date.parse(quote.expires_at);
  return Number.isFinite(t) && t < Date.now();
}

export function proposalUrl(env, token) {
  const base = (env.SITE_URL || env.QUOTE_SITE_URL || 'https://www.oasiscoastalcleaning.com')
    .replace(/\/+$/, '');
  return `${base}/proposal?t=${encodeURIComponent(token)}`;
}

export function defaultExpiry(days = 14) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export async function logQuoteEvent(db, quoteId, kind, detail = null) {
  if (!db || !quoteId || !kind) return;
  await db.prepare(
    'INSERT INTO quote_events (id, quote_id, created_at, kind, detail) VALUES (?, ?, ?, ?, ?)'
  ).bind(
    newId(),
    quoteId,
    new Date().toISOString(),
    kind,
    detail ? JSON.stringify(detail) : null
  ).run();
}

export async function getQuoteEvents(db, quoteId) {
  if (!db || !quoteId) return [];
  try {
    const { results } = await db.prepare(
      'SELECT * FROM quote_events WHERE quote_id = ? ORDER BY created_at ASC'
    ).bind(quoteId).all();
    return results || [];
  } catch {
    return [];
  }
}

export function parseEventDetail(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return { message: raw }; }
}

export async function attachQuoteEvents(db, quotes) {
  const out = [];
  for (const row of quotes) {
    const quote = quoteFromRow(row);
    quote.events = await getQuoteEvents(db, quote.id);
    out.push(quote);
  }
  return out;
}

/* Link scanners, spam filters and chat previews all fetch a URL the moment it
   lands in an inbox. Counting those as views tells Kristina a customer read her
   quote when nobody has, and she chases someone who never opened it. */
const BOT_UA = /bot|crawl|spider|slurp|preview|fetch|monitor|scan|curl|wget|python-requests|headless|facebookexternalhit|whatsapp|telegram|slackbot|discord|twitterbot|linkedinbot|bingpreview|google-?(read-?aloud|other)|proofpoint|barracuda|mimecast|microsoft office|skypeuripreview/i;

export function looksAutomated(request) {
  if (!request) return false;
  const ua = request.headers.get('user-agent') || '';
  if (!ua.trim()) return true;              // no agent string at all
  return BOT_UA.test(ua);
}

export async function recordQuoteView(db, quote) {
  if (!db || !quote || quote.status === 'draft') return;
  const now = new Date().toISOString();
  const isFirst = !quote.first_viewed_at;
  await db.prepare(
    `UPDATE quotes SET
      first_viewed_at = COALESCE(first_viewed_at, ?),
      last_viewed_at = ?,
      view_count = COALESCE(view_count, 0) + 1,
      updated_at = ?
     WHERE id = ?`
  ).bind(now, now, now, quote.id).run();
  if (isFirst) await logQuoteEvent(db, quote.id, 'viewed');
}

export async function findQuoteByEmailProviderId(db, providerId) {
  if (!db || !providerId) return null;
  return db.prepare('SELECT * FROM quotes WHERE email_provider_id = ? LIMIT 1').bind(providerId).first();
}

export async function applyEmailWebhook(db, providerId, kind, detail = null) {
  const row = await findQuoteByEmailProviderId(db, providerId);
  if (!row) return null;

  const now = new Date().toISOString();
  const quote = quoteFromRow(row);

  if (kind === 'email_delivered') {
    await db.prepare(
      `UPDATE quotes SET email_status = 'delivered', email_delivered_at = COALESCE(email_delivered_at, ?), updated_at = ? WHERE id = ?`
    ).bind(now, now, quote.id).run();
  } else if (kind === 'email_opened') {
    await db.prepare(
      `UPDATE quotes SET email_status = 'opened', email_opened_at = COALESCE(email_opened_at, ?), updated_at = ? WHERE id = ?`
    ).bind(now, now, quote.id).run();
  } else if (kind === 'email_bounced') {
    await db.prepare(
      `UPDATE quotes SET email_status = 'bounced', email_error = ?, updated_at = ? WHERE id = ?`
    ).bind(detail?.message || 'Email bounced', now, quote.id).run();
  } else if (kind === 'email_failed') {
    await db.prepare(
      `UPDATE quotes SET email_status = 'failed', email_error = ?, updated_at = ? WHERE id = ?`
    ).bind(detail?.message || 'Email failed', now, quote.id).run();
  } else {
    return quote;
  }

  await logQuoteEvent(db, quote.id, kind, detail);
  return quoteFromRow(await db.prepare('SELECT * FROM quotes WHERE id = ?').bind(quote.id).first());
}

/* -------------------------------------------------------- who accepted this
   Cloudflare hands every request a set of facts about where it came from.
   Recording them at the moment of acceptance is the difference between "the
   quote says accepted" and "accepted from a phone in Boca Raton at 4:12pm on
   the 3rd, from this address". Kept for exactly the one event that matters. */
export function acceptanceTrail(request) {
  const h = (name) => request.headers.get(name) || '';
  const cf = request.cf || {};
  return {
    ip: h('cf-connecting-ip') || h('x-real-ip') || h('x-forwarded-for').split(',')[0].trim() || null,
    country: cf.country || h('cf-ipcountry') || null,
    region: cf.region || cf.regionCode || null,
    city: cf.city || null,
    userAgent: h('user-agent').slice(0, 400) || null
  };
}
