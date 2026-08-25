/**
 * GET   /api/admin/leads          — the list, newest first
 * PATCH /api/admin/leads          — change one lead's status or notes
 *
 * Both require a signed-in session.
 */
import { json, clean } from '../../_lib/util.js';
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
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit'), 10) || 100, 1), 200);

  try {
    const sql = status && STATUSES.includes(status)
      ? 'SELECT * FROM leads WHERE status = ? ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM leads ORDER BY created_at DESC LIMIT ?';
    const stmt = status && STATUSES.includes(status)
      ? env.DB.prepare(sql).bind(status, limit)
      : env.DB.prepare(sql).bind(limit);
    const { results } = await stmt.all();

    const counts = {};
    try {
      const c = await env.DB.prepare('SELECT status, COUNT(*) n FROM leads GROUP BY status').all();
      (c.results || []).forEach((r) => { counts[r.status] = r.n; });
    } catch { /* counts are a nicety, not worth failing the page over */ }

    return json({ leads: results || [], counts });
  } catch (err) {
    // Almost always "no such table" — the migration has not been applied.
    return json({
      error: 'The leads table is missing. Apply the migration with ' +
             '`npx wrangler d1 migrations apply oasis --remote`.',
      detail: String(err && err.message || err)
    }, 503);
  }
}

export async function onRequestPatch({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }

  const id = clean(body.id, 60);
  if (!id) return json({ error: 'Which lead?' }, 400);

  const sets = [], values = [];
  if (body.status !== undefined) {
    const status = clean(body.status, 20);
    if (!STATUSES.includes(status)) return json({ error: 'Unknown status.' }, 400);
    sets.push('status = ?'); values.push(status);
  }
  if (body.adminNotes !== undefined) {
    sets.push('admin_notes = ?'); values.push(clean(body.adminNotes, 4000));
  }
  if (!sets.length) return json({ error: 'Nothing to change.' }, 400);

  values.push(id);
  await env.DB.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
  return json({ ok: true });
}
