/**
 * Quote line items, totals and the public shape of a quote.
 *
 * Kept free of Cloudflare / request objects so the same functions can be
 * unit-tested with plain Node.
 */

export const MAX_ITEMS = 40;
export const DESC_MAX = 200;

export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function defaultValidUntil(days = 14) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function parseItems(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const out = JSON.parse(raw);
    return Array.isArray(out) ? out : [];
  } catch {
    return [];
  }
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Coerce whatever the admin form sent into a clean list of line items.
 * Blank descriptions are dropped. Quantities default to 1.
 */
export function normalizeLineItems(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw.slice(0, MAX_ITEMS)) {
    if (!item || typeof item !== 'object') continue;
    const description = String(item.description || item.label || '')
      .trim()
      .slice(0, DESC_MAX);
    if (!description) continue;
    const qtyRaw = Number(item.qty);
    const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? roundMoney(qtyRaw) : 1;
    const priceRaw = Number(item.unit_price ?? item.price ?? item.amount);
    const unit_price = Number.isFinite(priceRaw) ? roundMoney(priceRaw) : 0;
    out.push({ description, qty, unit_price });
  }
  return out;
}

export function quoteTotals(items) {
  const lines = items.map((i) => ({
    description: i.description,
    qty: i.qty,
    unit_price: i.unit_price,
    amount: roundMoney(i.qty * i.unit_price)
  }));
  const total = roundMoney(lines.reduce((sum, i) => sum + i.amount, 0));
  return { lines, total };
}

export function formatMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '$0';
  const abs = Math.abs(x);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: abs % 1 ? 2 : 0,
    maximumFractionDigits: 2
  });
  return (x < 0 ? '-$' : '$') + formatted;
}

export function formatTotalLabel(total, priceNote) {
  const money = formatMoney(total);
  const note = String(priceNote || '').trim();
  return note ? `${money} ${note}` : money;
}

export function isExpired(validUntil, now = new Date()) {
  if (!validUntil) return false;
  const day = String(validUntil).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const end = new Date(`${day}T23:59:59.000Z`);
  return Number.isFinite(end.getTime()) && now.getTime() > end.getTime();
}

/** Fields a customer (or the quote page) is allowed to see. */
export function publicQuote(row) {
  const { lines, total } = quoteTotals(normalizeLineItems(parseItems(row.line_items)));
  return {
    status: row.status,
    customer_name: row.customer_name,
    service_label: row.service_label || '',
    frequency: row.frequency || '',
    intro: row.intro || '',
    notes: row.notes || '',
    price_note: row.price_note || '',
    valid_until: row.valid_until || '',
    line_items: lines,
    total,
    total_label: formatTotalLabel(total, row.price_note),
    sent_at: row.sent_at || null,
    accepted_at: row.accepted_at || null,
    accepted_name: row.accepted_name || '',
    expired: isExpired(row.valid_until)
  };
}

export function seedItemsFromLead(lead) {
  const items = [];
  const parts = [
    lead.service_label || lead.service,
    lead.size_label,
    lead.frequency
  ].filter(Boolean);
  if (parts.length) {
    items.push({ description: parts.join(' — '), qty: 1, unit_price: 0 });
  }
  const addOns = parseItems(lead.add_ons);
  addOns.forEach((label) => {
    if (label) items.push({ description: String(label), qty: 1, unit_price: 0 });
  });
  if (!items.length) {
    items.push({ description: '', qty: 1, unit_price: 0 });
  }
  return items;
}
