/**
 * Reading the diary out of the database.
 *
 * Extracted so that every path which needs to know what is already in the
 * calendar -- booking, moving, offering times, and a customer picking one of
 * them -- reads it the same way. A second copy of this query is how a
 * calendar starts disagreeing with the screen that writes to it.
 */
import { spanOf, findConflicts, expandBlock, addDays, localDateOf } from './schedule.js';

export async function loadWindowFor(db, from, to) {
  const pad = { from: addDays(from, -2), to: addDays(to, 2) };
  const appts = await db.prepare(
    `SELECT * FROM appointments
      WHERE archived_at IS NULL
        AND ( (all_day = 0 AND start_at < ? AND end_at > ?)
           OR (all_day = 1 AND start_date <= ? AND COALESCE(end_date, start_date) >= ?) )
      ORDER BY COALESCE(start_at, start_date)`
  ).bind(pad.to + 'T23:59:59.999Z', pad.from + 'T00:00:00.000Z', pad.to, pad.from).all();

  /* Repeating blocks are fetched whole and expanded -- their rule may reach
     into this window from a start date long before it. */
  const blockRows = await db.prepare(
    `SELECT * FROM availability_blocks WHERE archived_at IS NULL`
  ).all();

  const blocks = [];
  for (const b of blockRows.results || []) {
    for (const occ of expandBlock(b, pad.from, pad.to)) {
      if (spanOf(occ)) blocks.push(occ);
    }
  }
  return { appointments: appts.results || [], blocks };
}

/** Everything a proposed span runs into, read fresh from the database. */
export async function conflictsForSpan(db, proposed, ignoreId = null) {
  const span = spanOf(proposed);
  if (!span) return [];
  const date = localDateOf(new Date(span.start));
  const { appointments, blocks } = await loadWindowFor(db, addDays(date, -2), addDays(date, 2));
  return findConflicts(proposed, { appointments, blocks, ignoreId });
}
