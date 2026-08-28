/** Shared helpers for branded quotes with line items. */

import { newId } from './util.js';

export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'declined', 'expired', 'paid'];
export const EMAIL_STATUSES = ['pending', 'sending', 'sent', 'delivered', 'opened', 'failed', 'bounced'];

export const PAYMENT_METHODS = ['cash', 'zelle', 'paypal', 'other'];
export const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  zelle: 'Zelle',
  paypal: 'PayPal',
  other: 'Other'
};

/** Recurring visit cadence on a line item (null / omitted = one-time). */
export const LINE_FREQUENCIES = ['weekly', 'biweekly', 'monthly'];
export const LINE_FREQUENCY_LABELS = {
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  monthly: 'Monthly'
};

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
  expired: 'Quote Expired',
  paid: 'Marked Paid',
  payment_updated: 'Payment Updated',
  schedule_updated: 'Schedule Updated'
};

export function isRecurringFlag(value) {
  return value === true || value === 1 || value === '1' ||
    String(value || '').toLowerCase() === 'true';
}

export function normalizePaymentMethod(value) {
  const m = String(value || '').trim().toLowerCase();
  return PAYMENT_METHODS.includes(m) ? m : null;
}

export function normalizeLineFrequency(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  if (LINE_FREQUENCIES.includes(raw)) return raw;
  if (raw === 'every two weeks' || raw === 'bi-weekly' || raw === 'bi weekly') return 'biweekly';
  if (raw === 'one time' || raw === 'onetime' || raw === 'one-time') return null;
  if (raw === 'weekly') return 'weekly';
  if (raw === 'monthly') return 'monthly';
  return null;
}

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
    const unitPrice = Number.isFinite(+row.unit_price)
      ? Math.max(0, Math.round(+row.unit_price))
      : parseDollars(row.unit_dollars);
    const total = qty * unitPrice;
    const recurring = isRecurringFlag(row.recurring);
    const frequency = recurring ? (normalizeLineFrequency(row.frequency) || 'biweekly') : null;

    return {
      label,
      description,
      qty,
      unit_price: unitPrice,
      total,
      recurring: !!recurring,
      frequency
    };
  });

  const subtotal = items.reduce((sum, it) => sum + it.total, 0);
  return { items, subtotal, tax: 0, total: subtotal };
}

/** Overlay recurring / frequency onto existing line items without changing prices. */
export function applyScheduleToLineItems(existingItems, incoming) {
  if (!Array.isArray(existingItems) || !existingItems.length) {
    throw new Error('This quote has no line items.');
  }
  if (!Array.isArray(incoming) || incoming.length !== existingItems.length) {
    throw new Error('Line count does not match this quote.');
  }
  return existingItems.map((it, i) => {
    const row = incoming[i] || {};
    const recurring = isRecurringFlag(row.recurring);
    return {
      ...it,
      recurring: !!recurring,
      frequency: recurring ? (normalizeLineFrequency(row.frequency) || 'biweekly') : null
    };
  });
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
