/**
 * GET /api/admin/pipeline?stage=… — the quotes at one point in the work.
 *
 * The portal is arranged the way the work actually moves: a quote is written,
 * it goes out and waits, someone says yes, the job gets done, the money
 * arrives. Each of those is a question Kristina asks at a different moment,
 * so each is its own screen rather than a filter she has to remember to set.
 */
import { json, clean } from '../../_lib/util.js';
import { isSignedIn } from '../../_lib/auth.js';
import { quoteFromRow, attachQuoteEvents } from '../../_lib/quotes.js';

/* Each stage is a WHERE clause and an order. Nothing appears in two of them. */
const STAGES = {
  drafts: {
    where: `q.status = 'draft' AND q.archived_at IS NULL`,
    order: `q.updated_at DESC, q.created_at DESC`
  },
  pending: {
    where: `q.status IN ('sent', 'expired') AND q.archived_at IS NULL`,
    order: `q.sent_at DESC`
  },
  accepted: {
    where: `q.status = 'accepted' AND q.paid_at IS NULL AND q.archived_at IS NULL`,
    order: `q.completed_at IS NULL DESC, q.accepted_at DESC`
  },
  paid: {
    where: `q.paid_at IS NOT NULL AND q.archived_at IS NULL`,
    order: `q.paid_at DESC`
  },
  declined: {
    where: `q.status = 'declined' AND q.archived_at IS NULL`,
    order: `q.declined_at DESC`
  },
  archived: {
    where: `q.archived_at IS NOT NULL`,
    order: `q.archived_at DESC`
  }
};

const COUNTS = `
  SELECT
    SUM(CASE WHEN q.status = 'draft' AND q.archived_at IS NULL THEN 1 ELSE 0 END) AS drafts,
    SUM(CASE WHEN q.status IN ('sent','expired') AND q.archived_at IS NULL THEN 1 ELSE 0 END) AS pending,
    SUM(CASE WHEN q.status = 'accepted' AND q.paid_at IS NULL AND q.archived_at IS NULL THEN 1 ELSE 0 END) AS accepted,
    SUM(CASE WHEN q.paid_at IS NOT NULL AND q.archived_at IS NULL THEN 1 ELSE 0 END) AS paid,
    SUM(CASE WHEN q.status = 'declined' AND q.archived_at IS NULL THEN 1 ELSE 0 END) AS declined,
    SUM(CASE WHEN q.archived_at IS NOT NULL THEN 1 ELSE 0 END) AS archived,
    SUM(CASE WHEN q.status = 'accepted' AND q.completed_at IS NULL AND q.archived_at IS NULL THEN 1 ELSE 0 END) AS to_do,
    SUM(CASE WHEN q.status = 'accepted' AND q.paid_at IS NULL AND q.archived_at IS NULL THEN q.total ELSE 0 END) AS outstanding_cents
  FROM quotes q`;

export async function onRequestGet({ request, env }) {
  if (!await isSignedIn(request, env)) return json({ error: 'Please sign in.' }, 401);
  if (!env.DB) return json({ error: 'No database connected.' }, 503);

  const url = new URL(request.url);
  const stage = clean(url.searchParams.get('stage'), 20) || 'pending';
  const spec = STAGES[stage];
  if (!spec) return json({ error: 'Unknown stage.' }, 400);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 100));

  try {
    const rows = await env.DB.prepare(
      `SELECT q.*, l.name AS lead_name, l.phone AS lead_phone, l.email AS lead_email,
              l.city AS lead_city, l.address AS lead_address, l.service_label AS lead_service
       FROM quotes q LEFT JOIN leads l ON l.id = q.lead_id
       WHERE ${spec.where}
       ORDER BY ${spec.order}
       LIMIT ?`
    ).bind(limit).all();

    const quotes = (rows.results || []).map(quoteFromRow);
    await attachQuoteEvents(env.DB, quotes);

    /* Kristina marks a request "quoted" when she has told someone a price,
       which does not always mean she built one here. Those leads belong on
       the same screen as the drafts — from where she is standing they are the
       same thing, a quote in progress — with something to press that turns one
       into the other. */
    let openLeads = [];
    if (stage === 'drafts') {
      try {
        const rows = await env.DB.prepare(
          `SELECT l.* FROM leads l
           WHERE l.status = 'quoted'
             AND l.archived_at IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM quotes q
               WHERE q.lead_id = l.id AND q.archived_at IS NULL
             )
           ORDER BY l.updated_at DESC, l.created_at DESC
           LIMIT 100`
        ).all();
        openLeads = rows.results || [];
      } catch (err) {
        console.log('Could not read leads marked quoted:', err && err.message);
      }
    }

    const counts = (await env.DB.prepare(COUNTS).first()) || {};
    counts.drafts = (Number(counts.drafts) || 0) + openLeads.length;
    return json({ ok: true, stage, quotes, openLeads, counts });
  } catch (err) {
    return json({
      error: 'Could not load that list.',
      detail: String(err && err.message || err),
      needsSetup: /no such column|no such table/i.test(String(err && err.message || ''))
    }, 503);
  }
}
