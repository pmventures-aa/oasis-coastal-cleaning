/** Shared helpers for branded quotes with line items. */

export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'declined', 'expired'];

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
