/**
 * GET   /api/admin/leads          — list leads (active by default)
 * POST  /api/admin/leads          — log a phone/walk-in lead
 * PATCH /api/admin/leads          — edit fields, or action: archive | restore | delete
 */
import { json, clean, newId } from '../../_lib/util.js';
import { isSignedIn } from '../../_lib/auth.js';

const STATUSES = ['new', 'contacted', 'quoted', 'booked', 'closed'];

const guard = async (request, env) => {
  if (!await isSignedIn(request, env)) return json({ error: 'Please sign in.' }, 401);
  if (!env.DB) {
    return json({
      error: 'No database is connected to this project yet, so there are no ' +
             'saved leads to show. Quote requests are still being emailed.'
    }, 503);
  }
  return null;
};

export async function onRequestGet({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;

  const url = new URL(request.url);
  const status = clean(url.searchParams.get('status'), 20);
  const archived = clean(url.searchParams.get('archived'), 10);
  const followup = clean(url.searchParams.get('followup'), 10);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit'), 10) || 100, 1), 200);

  const showArchived = archived === '1' || archived === 'true';

  try {
    const where = [];
    const binds = [];

    where.push(showArchived ? 'archived_at IS NOT NULL' : 'archived_at IS NULL');

    if (status && STATUSES.includes(status)) {
      where.push('status = ?');
      binds.push(status);
    }

    if (followup === '1' || followup === 'true') {
      where.push("followup IN ('call', 'visit')");
    }

    binds.push(limit);
    const sql = `SELECT l.*,
      (SELECT q.status FROM quotes q WHERE q.lead_id = l.id AND q.archived_at IS NULL
       ORDER BY q.created_at DESC LIMIT 1) AS latest_quote_status
      FROM leads l WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC LIMIT ?`;
    const { results } = await env.DB.prepare(sql).bind(...binds).all();

    const counts = { active: 0, archived: 0 };
    try {
      const active = await env.DB.prepare(
        'SELECT status, COUNT(*) n FROM leads WHERE archived_at IS NULL GROUP BY status'
      ).all();
      (active.results || []).forEach((r) => { counts[r.status] = r.n; });
      const arch = await env.DB.prepare(
        'SELECT COUNT(*) n FROM leads WHERE archived_at IS NOT NULL'
      ).first();
      counts.archived = arch?.n || 0;
    } catch { /* optional */ }

    return json({ leads: results || [], counts, view: showArchived ? 'archived' : 'active' });
  } catch (err) {
    return json({
      error: 'The leads table is missing. Apply migrations with `npx wrangler d1 migrations apply oasis --remote`.',
      detail: String(err && err.message || err)
    }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }

  const name = clean(body.name, 120);
  const phone = clean(body.phone, 40);
  const email = clean(body.email, 160);
  const city = clean(body.city, 80);
  const serviceLabel = clean(body.service_label, 120) || clean(body.service, 80) || 'Phone inquiry';
  const notes = clean(body.notes, 2000);

  if (!name) return json({ error: 'Name is required.' }, 400);
  const phoneDigits = phone.replace(/\D/g, '');
  if (phoneDigits.length < 10) return json({ error: 'A valid phone number is required.' }, 400);

  const id = newId();
  const now = new Date().toISOString();

  try {
    await env.DB.prepare(
      `INSERT INTO leads (
        id, created_at, updated_at, name, phone, email, service, service_label,
        city, notes, status, source_page
      ) VALUES (?, ?, ?, ?, ?, ?, 'phone', ?, ?, ?, 'new', 'admin-phone')`
    ).bind(id, now, now, name, phone, email || '', serviceLabel, serviceLabel, city, notes).run();

    const row = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(id).first();
    return json({ lead: row }, 201);
  } catch (err) {
    return json({ error: 'Could not save lead.', detail: String(err && err.message || err) }, 503);
  }
}

export async function onRequestPatch({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }

  const id = clean(body.id, 60);
  if (!id) return json({ error: 'Which lead?' }, 400);

  const action = clean(body.action, 20);
  if (action === 'archive') {
    await env.DB.prepare(
      'UPDATE leads SET archived_at = ?, updated_at = ? WHERE id = ?'
    ).bind(new Date().toISOString(), new Date().toISOString(), id).run();
    return json({ ok: true, action: 'archived' });
  }
  if (action === 'restore') {
    await env.DB.prepare(
      'UPDATE leads SET archived_at = NULL, updated_at = ? WHERE id = ?'
    ).bind(new Date().toISOString(), id).run();
    return json({ ok: true, action: 'restored' });
  }
  if (action === 'delete') {
    await env.DB.prepare('DELETE FROM quote_events WHERE quote_id IN (SELECT id FROM quotes WHERE lead_id = ?)').bind(id).run();
    await env.DB.prepare('DELETE FROM quotes WHERE lead_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(id).run();
    return json({ ok: true, action: 'deleted' });
  }

  const EDITABLE = {
    name: 120, phone: 40, email: 160, best_time: 80, contact_pref: 40,
    property_type: 80, size_label: 140, bedrooms: 20, bathrooms: 20,
    city: 80, zip: 12, address: 200, access: 200,
    frequency: 60, notes: 2000, followup: 20,
    admin_notes: 4000, quoted_amount: 40, next_visit: 40
  };

  const sets = [], values = [];

  if (body.status !== undefined) {
    const status = clean(body.status, 20);
    if (!STATUSES.includes(status)) return json({ error: 'Unknown status.' }, 400);
    sets.push('status = ?'); values.push(status);
  }

  for (const [col, max] of Object.entries(EDITABLE)) {
    if (body[col] === undefined) continue;
    sets.push(`${col} = ?`);
    values.push(clean(body[col], max));
    if (col === 'quoted_amount' && clean(body[col], max)) {
      sets.push('quoted_at = COALESCE(quoted_at, ?)');
      values.push(new Date().toISOString());
    }
  }

  if (!sets.length) return json({ error: 'Nothing to change.' }, 400);

  sets.push('updated_at = ?'); values.push(new Date().toISOString());
  values.push(id);

  await env.DB.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
  return json({ ok: true });
}
