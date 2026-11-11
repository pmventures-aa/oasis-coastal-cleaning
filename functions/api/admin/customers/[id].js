/**
 * GET /api/admin/customers/[id] — one client, and everything that has
 * happened with them in one list.
 *
 * The point of this route: the story of a client is currently spread over
 * four tables and three screens, so answering "when did I last hear from
 * her, and what did I send?" meant opening all of them. Here it is one
 * feed, newest first.
 *
 * This is HER view, not a client-facing one, so it holds the internal
 * things too. Nothing from here is ever rendered to a customer.
 */
import { json, clean } from '../../../_lib/util.js';
import { gate } from '../../../_lib/guard.js';
import { isSignedIn } from '../../../_lib/auth.js';

const guard = async (request, env) => {
  const _g = await gate(request, env, 'clientList');
  if (_g.response) return _g.response;
  if (!env.DB) return json({ error: 'No database connected.' }, 503);
  return null;
};

/* A table that is not there yet is not an error: the schedule and the email
   log were added later than customers, and a client with no visits should
   read as "no visits", not as a broken page. */
const soft = (p) => p.then((r) => r, () => ({ results: [] }));

const ev = (at, kind, title, detail, link) =>
  at ? { at, kind, title, detail: detail || '', link: link || null } : null;

export async function onRequestGet({ request, env, params }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;

  const id = clean(params.id, 60);
  if (!id) return json({ error: 'Which client?' }, 400);

  const customer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(id).first();
  if (!customer) return json({ error: 'That client is not here.' }, 404);

  const properties = (await soft(env.DB.prepare(
    'SELECT * FROM properties WHERE customer_id = ? AND archived_at IS NULL ORDER BY created_at'
  ).bind(id).all())).results || [];

  const leads = (await soft(env.DB.prepare(
    'SELECT * FROM leads WHERE customer_id = ? ORDER BY created_at DESC LIMIT 100'
  ).bind(id).all())).results || [];

  const leadIds = leads.map((l) => l.id);
  const marks = leadIds.map(() => '?').join(',');
  const quotes = leadIds.length
    ? (await soft(env.DB.prepare(
        `SELECT * FROM quotes WHERE lead_id IN (${marks}) ORDER BY created_at DESC`
      ).bind(...leadIds).all())).results || []
    : [];

  const visits = (await soft(env.DB.prepare(
    `SELECT * FROM appointments
      WHERE archived_at IS NULL AND (customer_id = ?${leadIds.length ? ` OR lead_id IN (${marks})` : ''})
      ORDER BY COALESCE(start_at, start_date) DESC LIMIT 200`
  ).bind(...(leadIds.length ? [id, ...leadIds] : [id])).all())).results || [];

  const letters = (await soft(env.DB.prepare(
    'SELECT * FROM email_log WHERE customer_id = ? ORDER BY created_at DESC LIMIT 100'
  ).bind(id).all())).results || [];

  /* ------------------------------------------------- one story, in order */
  const MAIL_WORDS = {
    request_received: 'request received', quote: 'the quote',
    booking_confirmation: 'the booking', visit_reminder: 'a reminder',
    on_my_way: 'on my way', visit_summary: 'the summary', invoice: 'the invoice'
  };

  const timeline = [];
  for (const l of leads) {
    timeline.push(ev(l.created_at, 'request', 'Request came in',
      [l.service_label || l.service, l.city].filter(Boolean).join(' · '),
      { kind: 'lead', id: l.id }));
  }
  for (const q of quotes) {
    timeline.push(ev(q.sent_at, 'quote', 'Quote sent', money(q.total), { kind: 'quote', id: q.id }));
    timeline.push(ev(q.first_viewed_at, 'quote', 'They opened the quote', ''));
    timeline.push(ev(q.accepted_at, 'accepted', 'They accepted', money(q.total)));
    timeline.push(ev(q.declined_at, 'declined', 'They declined', ''));
    timeline.push(ev(q.completed_at, 'done', 'Job marked done', ''));
    timeline.push(ev(q.paid_at, 'paid', 'Paid', money(q.total)));
  }
  for (const v of visits) {
    const at = v.all_day ? v.start_date : v.start_at;
    const word = v.status === 'cancelled' ? 'Visit cancelled'
      : v.status === 'tentative' ? 'Visit pencilled in' : 'Visit';
    timeline.push(ev(at, v.status === 'cancelled' ? 'cancelled' : 'visit', word,
      [v.service_label, v.address].filter(Boolean).join(' · '),
      { kind: 'appointment', id: v.id }));
  }
  for (const m of letters) {
    timeline.push(ev(m.created_at,
      m.status === 'failed' ? 'mail_failed' : 'mail',
      m.status === 'failed' ? 'Email did not go' : 'Emailed them',
      MAIL_WORDS[m.kind] || m.kind));
  }

  const feed = timeline.filter(Boolean)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));

  return json({ ok: true,
    customer, properties, timeline: feed,
    counts: {
      requests: leads.length,
      quotes: quotes.length,
      visits: visits.filter((v) => v.status !== 'cancelled').length,
      letters: letters.length
    }
  });
}

function money(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n) || n <= 0) return '';
  return '$' + (n / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
