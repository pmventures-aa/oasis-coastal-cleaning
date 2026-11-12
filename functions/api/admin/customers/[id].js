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
import { statusFor, balanceOf, paidTotal } from '../../../_lib/invoices.js';
import { clientFactGroups, completeness } from '../../../_lib/recordFacts.js';
import { attentionFor, standingFor, STANDING_WORDS } from '../../../_lib/attention.js';
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

  /* The money, worked out from the payment rows like everywhere else, so
     a profile cannot disagree with the Money screen about whether this
     person has paid. */
  const invRows = (await soft(env.DB.prepare(
    `SELECT * FROM invoices WHERE archived_at IS NULL AND customer_id = ?
      ORDER BY created_at DESC LIMIT 50`
  ).bind(id).all())).results || [];
  let paysBy = {};
  if (invRows.length) {
    const im = invRows.map(() => '?').join(',');
    const prows = (await soft(env.DB.prepare(
      `SELECT * FROM payments WHERE invoice_id IN (${im})`
    ).bind(...invRows.map((i) => i.id)).all())).results || [];
    for (const p of prows) (paysBy[p.invoice_id] ||= []).push(p);
  }
  const invoices = invRows.map((i) => ({
    id: i.id, created_at: i.created_at, total: i.total,
    paid: paidTotal(paysBy[i.id] || []),
    balance: balanceOf(i, paysBy[i.id] || []),
    state: statusFor(i, paysBy[i.id] || [])
  }));
  const outstanding = invoices
    .filter((i) => i.state !== 'void')
    .reduce((n, i) => n + Math.max(0, i.balance), 0);
  const lifetime = invoices
    .filter((i) => i.state !== 'void')
    .reduce((n, i) => n + i.paid, 0);

  /* Standing arrangements, which is what a regular actually is. */
  const jobs = (await soft(env.DB.prepare(
    `SELECT id, title, service_label, freq, byday, start_date, until_date,
            start_time, duration_min, status, created_at
       FROM jobs WHERE customer_id = ? AND archived_at IS NULL
      ORDER BY created_at DESC LIMIT 20`
  ).bind(id).all())).results || [];

  const now = new Date().toISOString();
  const next = visits.find((v) =>
    v.status !== 'cancelled' && String(v.start_at || v.start_date || '') >= now.slice(0, 10)) || null;

  /* What a cleaner found and she has not dealt with, which is the other
     half of "is anything wrong with this one". */
  const issues = (await soft(env.DB.prepare(
    `SELECT id, severity, category_label, approved_at, resolved_at, created_at
       FROM visit_issues WHERE customer_id = ? AND archived_at IS NULL
        AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 20`
  ).bind(id).all())).results || [];

  /* One module answers this for the record and for Today alike, so the
     two can never disagree about whether something is late. */
  const signals = { invoices, visits, issues, jobs, closed_at: customer.closed_at || null };
  const attention = attentionFor(signals, now);
  const standing = standingFor(signals, now);

  /* Her first address is the one the facts describe. A client with six
     rentals gets the rest in the places list rather than flattened into
     one set of access notes. */
  const factGroups = clientFactGroups(customer, properties[0] || {});

  return json({ ok: true,
    customer, properties, timeline: feed,
    invoices, outstanding, lifetime, jobs, issues,
    attention,
    standing, standing_words: STANDING_WORDS[standing] || null,
    fact_groups: factGroups,
    completeness: completeness(factGroups),
    next_visit: next,
    /* Their standing link, so she can hand it over from the profile
       rather than hunting for it. */
    link_token: customer.link_token || null,
    counts: {
      requests: leads.length,
      quotes: quotes.length,
      visits: visits.filter((v) => v.status !== 'cancelled').length,
      letters: letters.length,
      invoices: invoices.length
    }
  });
}

function money(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n) || n <= 0) return '';
  return '$' + (n / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
