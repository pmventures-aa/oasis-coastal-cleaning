/**
 * What an invoice is owed, and what it has actually been paid.
 *
 * The balance is always computed from the payment rows, never read from a
 * stored total. That is the whole point of keeping payments as rows: when
 * one is voided the balance is right again with nothing to repair.
 */
export const METHODS = ['zelle', 'cash', 'card', 'check', 'other'];
export const METHOD_WORDS = {
  zelle: 'Zelle', cash: 'Cash', card: 'Card', check: 'Check', other: 'Other'
};

export const cleanMethod = (v) => (METHODS.includes(v) ? v : 'other');

/** Only payments that still count. A voided one happened, but not for this. */
export const live = (payments) => (payments || []).filter((p) => !p.voided_at);

export function paidTotal(payments) {
  return live(payments).reduce((n, p) => n + (Number(p.amount) || 0), 0);
}

export function balanceOf(invoice, payments) {
  const total = Number(invoice && invoice.total) || 0;
  return total - paidTotal(payments);
}

/**
 * The status the money says it is.
 *
 * Derived rather than set, so an invoice cannot be marked paid while money
 * is still outstanding, or sit unpaid after the last payment lands.
 */
export function statusFor(invoice, payments) {
  if (invoice && invoice.status === 'void') return 'void';
  const total = Number(invoice && invoice.total) || 0;
  const paid = paidTotal(payments);
  if (total > 0 && paid >= total) return 'paid';
  if (paid > 0) return 'part_paid';
  /* Never fall back to the stored status. It is itself derived and cached,
     so reading it here made the answer depend on its own previous answer:
     voiding the only payment left an invoice still saying "paid". Only
     "void" is authored, and "sent" is a fact with a timestamp. */
  return invoice && invoice.sent_at ? 'sent' : 'draft';
}

/**
 * Whether this payment can be taken.
 *
 * Overpayment is refused rather than absorbed: if the numbers do not add
 * up she has mistyped something, and a silent acceptance turns one typo
 * into a wrong balance she will chase later.
 */
export function checkPayment(invoice, payments, amount) {
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n) || n <= 0) return { error: 'How much was it?' };
  const outstanding = balanceOf(invoice, payments);
  if (outstanding <= 0) return { error: 'That invoice is already settled.' };
  if (n > outstanding) {
    return { error: 'That is more than the ' + money(outstanding) + ' still owed.' };
  }
  return { amount: n };
}

export function money(cents) {
  const n = Number(cents) || 0;
  return '$' + (n / 100).toLocaleString('en-US',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "Zelle $150.00 on 14 Nov, cash $135.00 on 18 Nov" */
export function paymentWords(payments) {
  return live(payments).map((p) =>
    (p.method === 'other' && p.method_note ? p.method_note : METHOD_WORDS[p.method] || 'Payment') +
    ' ' + money(p.amount)).join(', ');
}
