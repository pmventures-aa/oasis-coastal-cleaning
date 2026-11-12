/**
 * GET    /api/admin/issues   — the categories, and what has been reported
 * POST   /api/admin/issues   — report one, or add a category
 * PATCH  /api/admin/issues   — approve, un-approve, resolve, or edit a category
 *
 * The gate: a cleaner reports, and that is all it does. Nothing here is
 * client-safe until Kristina has ticked it through, and the tick is
 * undoable because she will mis-tap. Approving is also not the same act
 * as telling them, so sent_at is its own stamp.
 */
import { json, clean, newId } from '../../_lib/util.js';
import { gate } from '../../_lib/guard.js';
import { applySchema } from '../../_lib/schema.js';
import { can } from '../../_lib/auth.js';

export const SEVERITIES = ['note', 'attention', 'urgent'];
export const SEVERITY_WORDS = {
  note: 'Worth knowing', attention: 'Needs a look', urgent: 'Urgent'
};

const soft = (p) => p.then((r) => r, () => ({ results: [] }));

async function ready(db) {
  try { await db.prepare('SELECT 1 FROM visit_issues LIMIT 1').first(); return true; }
  catch {
    try { await applySchema(db); } catch { return false; }
    try { await db.prepare('SELECT 1 FROM visit_issues LIMIT 1').first(); return true; }
    catch { return false; }
  }
}

/* A cleaner may report on a visit and see what they reported. Everything
   else about an issue is Kristina's. */
const sees = (user) => can(user, 'everyoneSchedule') || can(user, 'clientList');

export async function onRequestGet({ request, env }) {
  const g = await gate(request, env);
  if (g.response) return g.response;
  if (!await ready(env.DB)) {
    return json({ error: 'Issues are not set up yet.', needsSetup: true }, 503);
  }
  const url = new URL(request.url);
  const apptId = clean(url.searchParams.get('appointment_id'), 80);

  const categories = ((await soft(env.DB.prepare(
    'SELECT * FROM issue_categories WHERE active = 1 ORDER BY sort, label'
  ).all())).results) || [];

  let issues = [];
  if (apptId) {
    /* Whoever is on the visit, or whoever can see the whole diary. This
       check was missing: the POST on this same route has it, and
       photos.js has it on both its read paths, so the rule existed twice
       and this was the copy that forgot. */
    if (!can(g.user, 'everyoneSchedule')) {
      const appt = await env.DB.prepare('SELECT assigned_to FROM appointments WHERE id = ?')
        .bind(apptId).first().catch(() => null);
      if (!appt || appt.assigned_to !== g.user.id) {
        return json({ error: 'That visit is not yours.' }, 403);
      }
    }
    issues = ((await soft(env.DB.prepare(
      `SELECT * FROM visit_issues WHERE appointment_id = ? AND archived_at IS NULL
        ORDER BY created_at DESC`
    ).bind(apptId).all())).results) || [];
  } else if (sees(g.user)) {
    /* Her review list: what is open, worst first, newest first within that. */
    issues = ((await soft(env.DB.prepare(
      `SELECT * FROM visit_issues
        WHERE archived_at IS NULL AND resolved_at IS NULL
        ORDER BY CASE severity WHEN 'urgent' THEN 0 WHEN 'attention' THEN 1 ELSE 2 END,
                 created_at DESC
        LIMIT 100`
    ).all())).results) || [];
  }

  return json({ ok: true, categories, issues,
    severities: SEVERITIES, severity_words: SEVERITY_WORDS,
    can_approve: !!can(g.user, 'clientList'),
    can_manage_categories: !!can(g.user, 'settings'),
    waiting: issues.filter((i) => !i.approved_at).length });
}

export async function onRequestPost({ request, env }) {
  const g = await gate(request, env);
  if (g.response) return g.response;
  if (!await ready(env.DB)) {
    return json({ error: 'Issues are not set up yet.', needsSetup: true }, 503);
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }
  const now = new Date().toISOString();

  /* Her own list of what can go wrong. */
  if (body.action === 'category') {
    if (!can(g.user, 'settings')) return json({ error: 'Not yours to change.' }, 403);
    const label = clean(body.label, 120);
    if (!label) return json({ error: 'What is it called?' }, 400);
    const id = 'ic-' + newId();
    await env.DB.prepare(
      `INSERT INTO issue_categories (id, created_at, label, note, sort)
       VALUES (?,?,?,?,?)`
    ).bind(id, now, label, clean(body.note, 300) || null,
      Number(body.sort) || 100).run();
    const row = await env.DB.prepare('SELECT * FROM issue_categories WHERE id = ?')
      .bind(id).first();
    return json({ ok: true, category: row }, 201);
  }

  /* Reporting one. Whoever is on the visit may do this. */
  const apptId = clean(body.appointment_id, 80);
  if (!apptId) return json({ error: 'Which visit?' }, 400);

  const appt = await env.DB.prepare(
    'SELECT id, customer_id, assigned_to FROM appointments WHERE id = ?'
  ).bind(apptId).first().catch(() => null);
  if (!appt) return json({ error: 'That visit is not here.' }, 404);

  /* A cleaner may report on their own visit, not on someone else's. */
  if (!can(g.user, 'everyoneSchedule') && appt.assigned_to !== g.user.id) {
    return json({ error: 'That visit is not yours.' }, 403);
  }

  let label = clean(body.category_label, 120);
  const catId = clean(body.category_id, 60) || null;
  if (catId) {
    const cat = await env.DB.prepare('SELECT label FROM issue_categories WHERE id = ?')
      .bind(catId).first().catch(() => null);
    if (cat) label = cat.label;
  }
  if (!label) return json({ error: 'What kind of thing is it?' }, 400);

  const severity = SEVERITIES.includes(body.severity) ? body.severity : 'note';
  const id = 'iss-' + newId();
  await env.DB.prepare(
    `INSERT INTO visit_issues (id, created_at, appointment_id, customer_id,
       category_id, category_label, severity, body, reported_by)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind(id, now, apptId, appt.customer_id || null, catId, label, severity,
    clean(body.body, 2000) || null, g.user.id).run();

  const row = await env.DB.prepare('SELECT * FROM visit_issues WHERE id = ?').bind(id).first();
  return json({ ok: true, issue: row }, 201);
}

export async function onRequestPatch({ request, env }) {
  const g = await gate(request, env);
  if (g.response) return g.response;
  if (!await ready(env.DB)) {
    return json({ error: 'Issues are not set up yet.', needsSetup: true }, 503);
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }
  const now = new Date().toISOString();
  const id = clean(body.id, 60);
  if (!id) return json({ error: 'Which one?' }, 400);

  if (body.action === 'category') {
    if (!can(g.user, 'settings')) return json({ error: 'Not yours to change.' }, 403);
    const sets = [], vals = [];
    if (body.label !== undefined) { sets.push('label = ?'); vals.push(clean(body.label, 120)); }
    if (body.note !== undefined) { sets.push('note = ?'); vals.push(clean(body.note, 300)); }
    if (body.active !== undefined) { sets.push('active = ?'); vals.push(body.active ? 1 : 0); }
    if (body.sort !== undefined && Number.isFinite(Number(body.sort))) {
      sets.push('sort = ?'); vals.push(Math.round(Number(body.sort)));
    }
    if (!sets.length) return json({ error: 'Nothing to change.' }, 400);
    vals.push(id);
    await env.DB.prepare(`UPDATE issue_categories SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...vals).run();
    const row = await env.DB.prepare('SELECT * FROM issue_categories WHERE id = ?')
      .bind(id).first();
    return json({ ok: true, category: row });
  }

  /* The gate itself. Only someone who can see clients can open it. */
  if (!can(g.user, 'clientList')) return json({ error: 'Not yours to decide.' }, 403);

  if (body.action === 'approve' || body.action === 'unapprove') {
    const on = body.action === 'approve';
    await env.DB.prepare(
      'UPDATE visit_issues SET approved_at = ?, approved_by = ? WHERE id = ?'
    ).bind(on ? now : null, on ? g.user.id : null, id).run();
    return finish(env, id);
  }

  if (body.action === 'sent') {
    /* Telling them is a separate act from deciding they may be told, and
       it cannot happen first. */
    const row = await env.DB.prepare('SELECT approved_at FROM visit_issues WHERE id = ?')
      .bind(id).first().catch(() => null);
    if (!row) return json({ error: 'That one is not here.' }, 404);
    if (!row.approved_at) {
      return json({ error: 'Tick it through first, then tell them.' }, 409);
    }
    await env.DB.prepare('UPDATE visit_issues SET sent_at = ? WHERE id = ?')
      .bind(now, id).run();
    return finish(env, id);
  }

  if (body.action === 'resolve' || body.action === 'unresolve') {
    await env.DB.prepare('UPDATE visit_issues SET resolved_at = ? WHERE id = ?')
      .bind(body.action === 'resolve' ? now : null, id).run();
    return finish(env, id);
  }

  return json({ error: 'Unknown change.' }, 400);
}

async function finish(env, id) {
  const row = await env.DB.prepare('SELECT * FROM visit_issues WHERE id = ?').bind(id).first();
  return json({ ok: true, issue: row });
}
