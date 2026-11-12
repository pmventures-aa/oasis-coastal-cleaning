/**
 * When a request became a client.
 *
 * A lead is linked to a customer the moment it arrives, so customer_id
 * has never meant "converted" -- it means we worked out who this is. The
 * moment that matters is when they said yes, which is when the lead goes
 * to 'booked'.
 *
 * One function, called wherever a status is written, so the stamp cannot
 * be set in one place and forgotten in another.
 */
export const CONVERTED_STATUS = 'booked';

/**
 * Keep converted_at in step with the status. Moving a request back off
 * booked clears it, because she will mis-tap, and a request that is back
 * in play should be back in the list.
 */
export async function syncConverted(db, leadId, status, at) {
  if (!db || !leadId) return;
  const now = at || new Date().toISOString();
  try {
    if (status === CONVERTED_STATUS) {
      /* COALESCE: the date is when they first said yes, not when the
         status was last touched. */
      await db.prepare(
        'UPDATE leads SET converted_at = COALESCE(converted_at, ?) WHERE id = ?'
      ).bind(now, leadId).run();
    } else {
      await db.prepare('UPDATE leads SET converted_at = NULL WHERE id = ?')
        .bind(leadId).run();
    }
  } catch { /* the column arrives with 0027; until then this is a no-op */ }
}
