/**
 * GET    /api/admin/schedule?from=&to=   — the diary for a window
 * POST   /api/admin/schedule             — create an appointment or a block
 * PATCH  /api/admin/schedule             — move, re-status, edit, skip, restore
 * DELETE /api/admin/schedule?id=&kind=   — remove one outright
 *
 * Every write runs through checkWrite(). The screen also checks, so she sees
 * a conflict before she presses anything, but the screen's check is a
 * courtesy — this one decides. Two phones, a retry and a stale tab all end
 * up here.
 */
import { json, clean, newId } from '../../_lib/util.js';
import { isSignedIn } from '../../_lib/auth.js';
import { ensureScheduleTables } from '../../_lib/schema.js';
import {
  spanOf, findConflicts, outsideWorkingHours, suggestSlots,
  localDateOf, addDays, todayLocal
} from '../../_lib/schedule.js';
/* One reader for the diary, shared with the offer routes, so nothing can
   form a second opinion about what is already booked. */
import { loadWindowFor as loadWindow, conflictsForSpan } from '../../_lib/schedule-db.js';
import { gate } from '../../_lib/guard.js';
import { can } from '../../_lib/auth.js';
import { parseChecklist, progressOf, buildChecklist, suggestTemplate,
  TEMPLATES, TEMPLATE_IDS } from '../../_lib/checklists.js';

const SETUP = 'Apply migration 0011 in D1 → oasis → Console.';

/* Reading the diary is allowed to everyone signed in, but a cleaner is
   shown only what is hers -- see scopeForUser below. Changing the diary is
   not a cleaner's job, so the writes ask for everyoneSchedule. */
const guard = async (request, env, capability) => {
  const g = await gate(request, env, capability || null);
  return g.response || null;
};
const whoFor = async (request, env) => (await gate(request, env)).user || null;

/**
 * What this person is allowed to see of the diary.
 *
 * A cleaner gets the visits assigned to her and nothing else: not the other
 * cleaners' rounds, and not the owner's blocked-out time, which is her
 * private business and no use to anyone else.
 */
function scopeForUser(user, appointments, blocks) {
  if (!user || can(user, 'everyoneSchedule')) return { appointments, blocks };
  const mine = (appointments || []).filter((a) => a.assigned_to && a.assigned_to === user.id);
  return { appointments: mine, blocks: [] };
}

/* Builds them if they are not there. She should not have to find a setup
   button before her calendar works — the first time she opens it, it makes
   what it needs. Everything here is behind the login already. */
async function hasTables(db) {
  try { await db.prepare('SELECT 1 FROM appointments LIMIT 1').first(); return true; }
  catch { return ensureScheduleTables(db); }
}

/** A window wide enough to catch anything that might overlap the edges. */
/**
 * The gate. Returns null to allow, or a 409 body describing exactly what the
 * proposed time runs into and when it could go instead.
 */
async function checkWrite(db, proposed, { ignoreId = null, override = false } = {}) {
  const span = spanOf(proposed);
  if (!span) return { error: 'That needs a start and an end.' };
  if (span.end <= span.start) return { error: 'It has to end after it starts.' };

  const date = localDateOf(new Date(span.start));
  const { appointments, blocks } = await loadWindow(db, addDays(date, -2), addDays(date, 2));
  const conflicts = findConflicts(proposed, { appointments, blocks, ignoreId });

  if (conflicts.length && !override) {
    return {
      error: 'That time is already taken.',
      conflicts: conflicts.map((c) => ({
        kind: c.kind, id: c.id, status: c.status || null, label: c.label,
        all_day: !!c.row.all_day,
        start_at: c.row.start_at || null, end_at: c.row.end_at || null,
        start_date: c.row.start_date || null, end_date: c.row.end_date || null
      })),
      suggestions: suggestSlots(proposed, { appointments, blocks, ignoreId })
    };
  }
  return null;
}

/**
 * The gate code, where to park and what the dog is called, read live off the
 * property and hung on each visit.
 *
 * Read rather than copied: a code she changes on the client's profile is the
 * code on next week's visit, and on the one already in the diary. Copying it
 * onto the appointment at booking time would have been simpler and would
 * have left her standing at a gate with last month's number.
 *
 * One query for the whole window, not one per visit.
 */
async function attachPlaceFacts(db, appointments) {
  const ids = [...new Set((appointments || [])
    .map((a) => a.customer_id).filter(Boolean))];
  if (!ids.length) return;
  let rows = [];
  const marks = ids.map(() => '?').join(',');
  const read = (cols) => db.prepare(
    `SELECT customer_id, address, ${cols} FROM properties
      WHERE customer_id IN (${marks}) AND archived_at IS NULL`
  ).bind(...ids).all();
  try {
    rows = (await read('access, parking, pets, bins, supplies, do_not_touch, warnings')).results || [];
  } catch {
    /* bins, supplies, do_not_touch and warnings arrive with 0021. Before
       that this query throws, and throwing used to mean no facts at all --
       so every gate code would have disappeared from every visit in the
       window between this deploying and the migration running. Ask again
       for the ones that have always been there. */
    try {
      rows = (await read('access, parking, pets')).results || [];
    } catch { return; }       // no properties table at all: no facts, no error
  }

  const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const a of appointments) {
    if (!a.customer_id) continue;
    const mine = rows.filter((r) => r.customer_id === a.customer_id);
    if (!mine.length) continue;
    /* A client with two addresses gets the one this visit is at. With only
       one on file, that is the one. With several and no match, none of them
       -- a gate code for the wrong house is worse than no gate code. */
    const hit = mine.length === 1 ? mine[0]
      : mine.find((r) => a.address && norm(r.address) === norm(a.address));
    if (!hit) continue;
    const place = {
      access: hit.access || '', parking: hit.parking || '', pets: hit.pets || '',
      bins: hit.bins || '', supplies: hit.supplies || '',
      do_not_touch: hit.do_not_touch || '', warnings: hit.warnings || ''
    };
    /* Only attach it when there is something to say, so the card can use
       "is there a place?" to decide whether to draw the panel at all. */
    if (Object.keys(place).some((k) => place[k])) a.place = place;
  }
}

/**
 * What happened at the house.
 *
 * The two notes are kept apart all the way through. internal_note is hers
 * -- the gate was stuck, the dog was out -- and there is no path from it to
 * a customer. client_summary is the line that goes in the "all done" email.
 * Separate columns rather than one field with a rule about it, because a
 * rule about a field is the kind of thing that gets it wrong once.
 */
async function workPatch(env, user, id, body, now) {
  const sets = [], vals = [];

  if (body.action === 'checklist') {
    sets.push('checklist = ?');
    vals.push(JSON.stringify(parseChecklist(body.checklist)));
  }

  /* Start a list from a template. The service decides which one unless she
     picks, so the common case is one tap. */
  if (body.action === 'checklist_template') {
    let tid = TEMPLATE_IDS.includes(body.template) ? body.template : null;
    if (!tid) {
      const row = await env.DB.prepare('SELECT service_label FROM appointments WHERE id = ?')
        .bind(id).first().catch(() => null);
      tid = suggestTemplate(row && row.service_label);
    }
    sets.push('checklist = ?');
    vals.push(JSON.stringify(buildChecklist(tid)));
  }

  if (body.action === 'notes') {
    if (body.internal_note !== undefined) {
      sets.push('internal_note = ?'); vals.push(clean(body.internal_note, 4000));
    }
    if (body.client_summary !== undefined) {
      sets.push('client_summary = ?'); vals.push(clean(body.client_summary, 2000));
    }
  }

  if (body.action === 'complete') {
    sets.push('completed_at = ?', 'completed_by = ?', 'status = ?');
    vals.push(now, user.id, 'confirmed');
  }
  if (body.action === 'uncomplete') {
    sets.push('completed_at = ?', 'completed_by = ?');
    vals.push(null, null);
  }

  if (!sets.length) return json({ error: 'Nothing to change.' }, 400);
  sets.push('updated_at = ?'); vals.push(now);
  vals.push(id);
  try {
    await env.DB.prepare(`UPDATE appointments SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...vals).run();
  } catch (err) {
    return json({ error: 'Could not save that.',
      detail: String(err && err.message || err) }, 503);
  }
  const row = await env.DB.prepare('SELECT * FROM appointments WHERE id = ?').bind(id).first();
  return json({ ok: true, row, progress: progressOf(row && row.checklist) });
}

async function logEvent(db, kind, subjectKind, subjectId, detail) {
  try {
    await db.prepare(
      `INSERT INTO schedule_events (id, created_at, subject_kind, subject_id, kind, detail)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind('se-' + newId(), new Date().toISOString(), subjectKind, subjectId, kind,
           detail ? JSON.stringify(detail) : null).run();
  } catch { /* the diary still works without its own history */ }
}

/* ------------------------------------------------------------------- read */

export async function onRequestGet({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  if (!await hasTables(env.DB)) {
    return json({ error: 'The schedule is not set up yet.', setup: SETUP, needsSetup: true }, 503);
  }
  const url = new URL(request.url);
  const today = todayLocal();
  const from = clean(url.searchParams.get('from'), 10) || today;
  const to = clean(url.searchParams.get('to'), 10) || addDays(from, 42);

  try {
    const all = await loadWindow(env.DB, from, to);
    const me = await whoFor(request, env);
    const { appointments, blocks } = scopeForUser(me, all.appointments, all.blocks);
    await attachPlaceFacts(env.DB, appointments);
    /* The template names live in one place on the server; the screen
       offers them rather than keeping its own copy to drift. */
    const templates = TEMPLATE_IDS.map((id) => ({ id, label: TEMPLATES[id].label }));
    return json({ ok: true, from, to, today, appointments, blocks, templates,
      role: me ? me.role : null, mine_only: !!(me && !can(me, 'everyoneSchedule')) });
  } catch (err) {
    return json({ error: 'Could not read the schedule.',
      detail: String(err && err.message || err) }, 503);
  }
}

/* ----------------------------------------------------------------- create */

const TIMING = (body) => {
  const allDay = body.all_day === true || body.all_day === 1 || body.all_day === 'on';
  if (allDay) {
    const from = clean(body.start_date, 10);
    return { all_day: 1, start_date: from, end_date: clean(body.end_date, 10) || from,
             start_at: null, end_at: null };
  }
  return { all_day: 0, start_date: null, end_date: null,
           start_at: clean(body.start_at, 40), end_at: clean(body.end_at, 40) };
};

export async function onRequestPost({ request, env }) {
  const blocked = await guard(request, env, 'everyoneSchedule');
  if (blocked) return blocked;
  if (!await hasTables(env.DB)) {
    return json({ error: 'The schedule is not set up yet.', setup: SETUP, needsSetup: true }, 503);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }

  const kind = body.kind === 'block' ? 'block' : 'appointment';
  const timing = TIMING(body);
  const override = body.override === true;
  const now = new Date().toISOString();

  /* A tapped-twice button, a retried request and a flaky connection all send
     the same thing. The client stamps each attempt; the second one returns
     the row the first one made rather than a second booking. */
  const clientToken = clean(body.client_token, 60);
  if (clientToken) {
    const seen = await env.DB.prepare(
      `SELECT subject_id, subject_kind FROM schedule_events
        WHERE kind = 'created' AND detail LIKE ? LIMIT 1`
    ).bind('%"client_token":"' + clientToken + '"%').first().catch(() => null);
    if (seen) {
      const table = seen.subject_kind === 'block' ? 'availability_blocks' : 'appointments';
      const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`)
        .bind(seen.subject_id).first().catch(() => null);
      if (row) return json({ ok: true, duplicate: true, kind: seen.subject_kind, row });
    }
  }

  try {
    if (kind === 'block') {
      const id = 'blk-' + newId();
      const repeatFreq = body.repeat_freq === 'weekly' ? 'weekly' : null;
      const repeatDays = Array.isArray(body.repeat_days)
        ? JSON.stringify(body.repeat_days.map(Number).filter((n) => n >= 0 && n <= 6)) : null;

      /* Blocking time must never move or cancel a clean. She is told what
         she is covering and decides; the appointment is not touched either
         way. */
      const clash = await checkWrite(env.DB, timing, { override: true });
      if (clash && clash.error) return json(clash, 400);
      const covering = await conflictsFor(env.DB, timing, null);

      await env.DB.prepare(
        `INSERT INTO availability_blocks
           (id, created_at, note, address, all_day, start_at, end_at, start_date, end_date,
            repeat_freq, repeat_days, repeat_until, skip_dates)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')`
      ).bind(id, now, clean(body.note, 300) || null, clean(body.address, 200) || null,
             timing.all_day,
             timing.start_at, timing.end_at, timing.start_date, timing.end_date,
             repeatFreq, repeatDays, clean(body.repeat_until, 10) || null).run();

      await logEvent(env.DB, 'created', 'block', id,
        { client_token: clientToken || undefined, covering: covering.length || undefined });
      const row = await env.DB.prepare('SELECT * FROM availability_blocks WHERE id = ?').bind(id).first();
      return json({ ok: true, kind: 'block', row, covering }, 201);
    }

    const verdict = await checkWrite(env.DB, timing, { override });
    if (verdict) return json(verdict, verdict.conflicts ? 409 : 400);

    const id = 'apt-' + newId();
    await env.DB.prepare(
      `INSERT INTO appointments
         (id, created_at, lead_id, quote_id, customer_id, property_id, title,
          customer_name, phone, address, city, zip, service_label, status,
          all_day, start_at, end_at, start_date, end_date, notes, series_id, series_rule)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, now,
      clean(body.lead_id, 60) || null, clean(body.quote_id, 60) || null,
      clean(body.customer_id, 60) || null, clean(body.property_id, 60) || null,
      clean(body.title, 140) || null, clean(body.customer_name, 140) || null,
      clean(body.phone, 40) || null, clean(body.address, 200) || null,
      clean(body.city, 80) || null, clean(body.zip, 12) || null,
      clean(body.service_label, 140) || null,
      body.status === 'tentative' ? 'tentative' : 'confirmed',
      timing.all_day, timing.start_at, timing.end_at, timing.start_date, timing.end_date,
      clean(body.notes, 2000) || null,
      clean(body.series_id, 60) || null, clean(body.series_rule, 200) || null).run();

    /* Two requests can both pass the gate before either has written. The
       write is cheap to undo and a double booking is not, so the check runs
       again afterwards and the loser withdraws. */
    const after = await conflictsFor(env.DB, timing, id);
    if (after.length && !override) {
      await env.DB.prepare('DELETE FROM appointments WHERE id = ?').bind(id).run();
      return json({ error: 'That time was taken while you were saving.',
        conflicts: after, raced: true }, 409);
    }

    await logEvent(env.DB, 'created', 'appointment', id, {
      client_token: clientToken || undefined,
      override: override || undefined,
      overrode: override && after.length ? after.map((c) => c.id) : undefined,
      outside_hours: outsideWorkingHours(timing) || undefined
    });
    const row = await env.DB.prepare('SELECT * FROM appointments WHERE id = ?').bind(id).first();
    return json({ ok: true, kind: 'appointment', row,
      outside_hours: outsideWorkingHours(timing) }, 201);
  } catch (err) {
    return json({ error: 'Could not save that.', detail: String(err && err.message || err) }, 503);
  }
}

async function conflictsFor(db, timing, ignoreId) {
  return (await conflictsForSpan(db, timing, ignoreId)).map((c) => ({
    kind: c.kind, id: c.id, status: c.status || null, label: c.label,
    all_day: !!c.row.all_day,
    start_at: c.row.start_at || null, end_at: c.row.end_at || null,
    start_date: c.row.start_date || null, end_date: c.row.end_date || null
  }));
}

/* ----------------------------------------------------------------- update */

/* Doing the work is not the same as changing the diary.
   Ticking a checklist, writing up what happened and marking a visit done
   is a cleaner's actual job, so it is allowed on HER OWN visits without
   letting her move, cancel or create anything. */
const WORK_ACTIONS = new Set(['checklist', 'checklist_template', 'notes',
  'complete', 'uncomplete']);

export async function onRequestPatch({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }
  const id = clean(body.id, 80);
  const now = new Date().toISOString();

  if (WORK_ACTIONS.has(body.action) && body.kind !== 'block') {
    const g = await gate(request, env);
    if (g.response) return g.response;
    if (!id) return json({ error: 'Which one?' }, 400);
    if (!can(g.user, 'everyoneSchedule')) {
      const own = await env.DB.prepare(
        'SELECT assigned_to FROM appointments WHERE id = ?'
      ).bind(id).first().catch(() => null);
      if (!own || !own.assigned_to || own.assigned_to !== g.user.id) {
        return json({ error: 'That is not one of your visits.' }, 403);
      }
    }
    return workPatch(env, g.user, id, body, now);
  }

  const blocked = await guard(request, env, 'everyoneSchedule');
  if (blocked) return blocked;
  if (!id) return json({ error: 'Which one?' }, 400);

  try {
    if (body.kind === 'block') {
      /* Lifting one date out of a repeat leaves the rule alone. */
      if (body.action === 'skip') {
        const date = clean(body.date, 10);
        const baseId = id.split('@')[0];
        const row = await env.DB.prepare('SELECT * FROM availability_blocks WHERE id = ?')
          .bind(baseId).first();
        if (!row) return json({ error: 'That block is gone.' }, 404);
        let skip = [];
        try { skip = JSON.parse(row.skip_dates || '[]'); } catch { skip = []; }
        if (!skip.includes(date)) skip.push(date);
        await env.DB.prepare('UPDATE availability_blocks SET skip_dates = ?, updated_at = ? WHERE id = ?')
          .bind(JSON.stringify(skip), now, baseId).run();
        await logEvent(env.DB, 'skipped', 'block', baseId, { date });
        return json({ ok: true, action: 'skipped', date });
      }

      const baseId = id.split('@')[0];
      const timing = TIMING(body);
      const sets = ['updated_at = ?'];
      const vals = [now];
      if (body.note !== undefined) { sets.push('note = ?'); vals.push(clean(body.note, 300) || null); }
      if (body.address !== undefined) { sets.push('address = ?'); vals.push(clean(body.address, 200) || null); }
      if (body.start_at || body.start_date) {
        sets.push('all_day = ?', 'start_at = ?', 'end_at = ?', 'start_date = ?', 'end_date = ?');
        vals.push(timing.all_day, timing.start_at, timing.end_at, timing.start_date, timing.end_date);
      }
      if (body.repeat_until !== undefined) {
        sets.push('repeat_until = ?'); vals.push(clean(body.repeat_until, 10) || null);
      }
      vals.push(baseId);
      await env.DB.prepare(`UPDATE availability_blocks SET ${sets.join(', ')} WHERE id = ?`)
        .bind(...vals).run();
      await logEvent(env.DB, 'moved', 'block', baseId, null);
      const row = await env.DB.prepare('SELECT * FROM availability_blocks WHERE id = ?').bind(baseId).first();
      return json({ ok: true, kind: 'block', row,
        covering: body.start_at || body.start_date ? await conflictsFor(env.DB, timing, baseId) : [] });
    }

    const existing = await env.DB.prepare('SELECT * FROM appointments WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'That appointment is gone.' }, 404);

    /* Cancelling releases the time; restoring has to win it back, because
       something else may have taken it in the meantime. */
    if (body.action === 'cancel' || body.action === 'restore') {
      const cancelling = body.action === 'cancel';
      if (!cancelling) {
        const back = await conflictsFor(env.DB, existing, id);
        if (back.length && body.override !== true) {
          return json({ error: 'Its time was taken while it was cancelled.',
            conflicts: back }, 409);
        }
      }
      await env.DB.prepare(
        `UPDATE appointments SET status = ?, cancelled_at = ?, updated_at = ? WHERE id = ?`
      ).bind(cancelling ? 'cancelled' : 'confirmed', cancelling ? now : null, now, id).run();
      await logEvent(env.DB, cancelling ? 'cancelled' : 'restored', 'appointment', id,
        { reason: clean(body.reason, 300) || undefined });
      return json({ ok: true, action: body.action });
    }

    const sets = ['updated_at = ?'];
    const vals = [now];
    const FIELDS = { title: 140, customer_name: 140, phone: 40, address: 200,
                     city: 80, zip: 12, service_label: 140, notes: 2000 };
    for (const [col, max] of Object.entries(FIELDS)) {
      if (body[col] !== undefined) { sets.push(`${col} = ?`); vals.push(clean(body[col], max) || null); }
    }
    if (body.status === 'confirmed' || body.status === 'tentative') {
      sets.push('status = ?', 'cancelled_at = ?'); vals.push(body.status, null);
    }

    let moved = false;
    if (body.start_at || body.start_date) {
      const timing = TIMING(body);
      const verdict = await checkWrite(env.DB, timing, { ignoreId: id, override: body.override === true });
      if (verdict) return json(verdict, verdict.conflicts ? 409 : 400);
      sets.push('all_day = ?', 'start_at = ?', 'end_at = ?', 'start_date = ?', 'end_date = ?');
      vals.push(timing.all_day, timing.start_at, timing.end_at, timing.start_date, timing.end_date);
      moved = true;
    }

    vals.push(id);
    await env.DB.prepare(`UPDATE appointments SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    await logEvent(env.DB, moved ? 'moved' : 'edited', 'appointment', id,
      { from: moved ? { start_at: existing.start_at, start_date: existing.start_date } : undefined,
        override: body.override === true || undefined });
    const row = await env.DB.prepare('SELECT * FROM appointments WHERE id = ?').bind(id).first();
    return json({ ok: true, kind: 'appointment', row });
  } catch (err) {
    return json({ error: 'Could not save that.', detail: String(err && err.message || err) }, 503);
  }
}

/* ----------------------------------------------------------------- delete */

export async function onRequestDelete({ request, env }) {
  const blocked = await guard(request, env, 'everyoneSchedule');
  if (blocked) return blocked;
  const url = new URL(request.url);
  const id = clean(url.searchParams.get('id'), 80);
  const kind = url.searchParams.get('kind') === 'block' ? 'block' : 'appointment';
  if (!id) return json({ error: 'Which one?' }, 400);

  const baseId = id.split('@')[0];
  const table = kind === 'block' ? 'availability_blocks' : 'appointments';
  try {
    await env.DB.prepare(`UPDATE ${table} SET archived_at = ? WHERE id = ?`)
      .bind(new Date().toISOString(), baseId).run();
    await logEvent(env.DB, 'deleted', kind, baseId, null);
    return json({ ok: true, action: 'deleted' });
  } catch (err) {
    return json({ error: 'Could not remove that.', detail: String(err && err.message || err) }, 503);
  }
}
