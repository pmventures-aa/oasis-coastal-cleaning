/**
 * One answer to "have they paid?".
 *
 * There were two. A quote carried paid_at, set by a button on the pipeline;
 * an invoice derived its state from its payment rows. Neither wrote to the
 * other, so recording $285 against an invoice settled the Money screen and
 * left the same job filed under Accepted, and marking the quote paid left
 * Money showing $285 owing for ever. Whichever she used, the other screen
 * was wrong.
 *
 * Payments are now the truth. A quote that has an invoice is as paid as its
 * invoices are, and paid_at on the quote is only a cache of that, written in
 * one place. A quote with no invoice at all -- a cash job she never billed --
 * can still be marked by hand, and paid_source records which of the two it
 * was so the cache is never cleared out from under her.
 */
import { statusFor, balanceOf, paidTotal, live } from './invoices.js';

export const PAID_SOURCES = ['invoice', 'manual'];

/** The money on one quote, given the invoices raised against it. */
export function quoteMoney(quote, invoices, paymentsByInvoice) {
  const rows = (invoices || []).filter((i) => i && i.status !== 'void');

  if (rows.length) {
    let total = 0, paid = 0;
    for (const inv of rows) {
      const pays = (paymentsByInvoice && paymentsByInvoice[inv.id]) || [];
      total += Number(inv.total) || 0;
      paid += paidTotal(pays);
    }
    const balance = Math.max(0, total - paid);
    return {
      source: 'invoice',
      total, paid, balance,
      state: total > 0 && paid >= total ? 'paid' : paid > 0 ? 'part_paid' : 'unpaid',
      settled: total > 0 && paid >= total
    };
  }

  /* No invoice: her own mark is all there is, and it is a real answer for
     a job that was done for cash and never billed. */
  const at = quote && quote.paid_at;
  return {
    source: at ? 'manual' : 'none',
    total: Number(quote && quote.total) || 0,
    paid: at ? (Number(quote && quote.total) || 0) : 0,
    balance: at ? 0 : (Number(quote && quote.total) || 0),
    state: at ? 'paid' : 'unpaid',
    settled: !!at
  };
}

/** The invoices for a set of quotes, with their payments, in two reads. */
export async function invoicesForQuotes(db, quoteIds) {
  const ids = (quoteIds || []).filter(Boolean);
  if (!ids.length) return { byQuote: {}, byInvoice: {} };
  const marks = ids.map(() => '?').join(',');
  const soft = (p) => p.then((r) => r, () => ({ results: [] }));

  const invs = (await soft(db.prepare(
    `SELECT * FROM invoices WHERE archived_at IS NULL AND quote_id IN (${marks})`
  ).bind(...ids).all())).results || [];

  const byQuote = {};
  for (const i of invs) (byQuote[i.quote_id] ||= []).push(i);

  const byInvoice = {};
  if (invs.length) {
    const im = invs.map(() => '?').join(',');
    const pays = (await soft(db.prepare(
      `SELECT * FROM payments WHERE invoice_id IN (${im})`
    ).bind(...invs.map((i) => i.id)).all())).results || [];
    for (const p of pays) (byInvoice[p.invoice_id] ||= []).push(p);
  }
  return { byQuote, byInvoice };
}

/**
 * Keep the quote's cache in step with its invoices. Called wherever a
 * payment moves. It only ever touches a cache it owns: a mark she made by
 * hand on a quote with no invoice is left exactly as she left it.
 */
export async function syncQuotePaid(db, quoteId) {
  if (!quoteId) return;

  /* A read that fails is not a read that found nothing, and the difference
     decides whether a paid job stays paid. This used to swallow both into an
     empty list: if the payments query hiccuped, the quote looked unpaid, fell
     through to the branch below and had its paid_at cleared -- a settled job
     marked outstanding by a transient error, with nothing to say it happened.
     A failure now returns null and the function stops without writing. */
  const soft = (p) => p.then((r) => r, () => null);

  const invRead = await soft(db.prepare(
    'SELECT * FROM invoices WHERE archived_at IS NULL AND quote_id = ?'
  ).bind(quoteId).all());
  if (!invRead) return;
  const invs = invRead.results || [];
  if (!invs.length) return;

  const im = invs.map(() => '?').join(',');
  const payRead = await soft(db.prepare(
    `SELECT * FROM payments WHERE invoice_id IN (${im})`
  ).bind(...invs.map((i) => i.id)).all());
  if (!payRead) return;
  const pays = payRead.results || [];
  const byInvoice = {};
  for (const p of pays) (byInvoice[p.invoice_id] ||= []).push(p);

  const m = quoteMoney(null, invs, byInvoice);
  const now = new Date().toISOString();

  if (m.settled) {
    await db.prepare(
      `UPDATE quotes SET paid_at = COALESCE(paid_at, ?), paid_source = 'invoice',
         completed_at = COALESCE(completed_at, ?), updated_at = ? WHERE id = ?`
    ).bind(now, now, now, quoteId).run().catch(() => {});
    return;
  }
  /* It is no longer settled -- a payment was voided. Clear the cache, but
     only the one this wrote. */
  await db.prepare(
    `UPDATE quotes SET paid_at = NULL, paid_source = NULL, updated_at = ?
      WHERE id = ? AND paid_source = 'invoice'`
  ).bind(now, quoteId).run().catch(() => {});
}

export { statusFor, balanceOf, live };
