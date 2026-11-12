/**
 * The invoice for a quote they have just accepted.
 *
 * Copying the lines across by hand is how a total stops matching what
 * somebody agreed to, so it is done from the quote itself at the moment
 * of acceptance. Optional lines they did not take are left off: an
 * invoice is for the work, not for the menu.
 *
 * It is raised as a draft. Accepting a quote is not the same as being
 * sent a bill, and when she sends it is hers to decide.
 */
import { newId } from './util.js';

const lines = (v) => {
  try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; }
  catch { return []; }
};

export async function raiseInvoiceFromQuote(db, quoteId) {
  const q = await db.prepare(
    `SELECT q.*, l.name AS lead_name, l.email AS lead_email, l.address, l.city,
            l.customer_id
       FROM quotes q LEFT JOIN leads l ON l.id = q.lead_id
      WHERE q.id = ?`
  ).bind(quoteId).first();
  if (!q) return null;

  const items = lines(q.line_items)
    .filter((it) => !it.optional)
    .map((it) => ({
      label: String(it.label || '').slice(0, 200),
      qty: Math.max(1, Math.round(Number(it.qty) || 1)),
      unit_price: Math.max(0, Math.round(Number(it.unit_price) || 0))
    }))
    .filter((it) => it.label);

  if (!items.length) return null;
  const subtotal = items.reduce((n, it) => n + it.qty * it.unit_price, 0);

  const id = 'inv-' + newId();
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO invoices (id, created_at, customer_id, lead_id, quote_id,
       customer_name, email, address, city, line_items, subtotal, total, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'draft')`
  ).bind(id, now, q.customer_id || null, q.lead_id || null, q.id,
    q.customer_name || q.lead_name || null, q.customer_email || q.lead_email || null,
    q.address || null, q.city || null,
    JSON.stringify(items), subtotal, subtotal).run();

  return { id, total: subtotal, lines: items.length };
}
