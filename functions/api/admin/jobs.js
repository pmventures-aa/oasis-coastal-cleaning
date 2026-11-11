/**
 * GET    /api/admin/jobs            — the arrangements, and what is unscheduled
 * POST   /api/admin/jobs            — set one up and write its visits down
 * PATCH  /api/admin/jobs            — skip one, end it, or change it from here on
 *
 * A job is the arrangement; its visits are ordinary appointment rows, so
 * everything that already understands the diary -- the calendar, the
 * conflict check, the gate codes, the email drawer -- understands them with
 * no changes at all.
 */
import { json, clean, newId } from '../../_lib/util.js';
import { gate } from '../../_lib/guard.js';
import { applySchema } from '../../_lib/schema.js';
import { conflictsForSpan } from '../../_lib/schedule-db.js';
import { addDays, localDateOf } from '../../_lib/schedule.js';
import {
  occurrences, plannedDates, spanFor, describe,
  cleanFreq, cleanDays, cleanDuration
} from '../../_lib/jobs.js';

const SETUP = 'Apply migration 0015 in D1 → oasis → Console.';

async function hasTables(db) {
  try { await db.prepare('SELECT 1 FROM jobs LIMIT 1').first(); return true; }
  catch {
    /* Apply everything, then ask again. Saying "yes" because the applier
       did not throw is how a screen gets past this check and then fails on
       a table that is still not there. */
    try { await applySchema(db); } catch { return false; }
    try { await db.prepare('SELECT 1 FROM jobs LIMIT 1').first(); return true; }
    catch { return false; }
  }
}

const soft = (p) => p.then((r) => r, () => ({ results: [] }));

/* ------------------------------------------------------------------ read */
export async function onRequestGet({ request, env }) {
  const g = await gate(request, env, 'everyoneSchedule');
  if (g.response) return g.response;
  if (!await hasTables(env.DB)) {
    return json({ error: 'Jobs are not set up yet.', setup: SETUP, needsSetup: true }, 503);
  }

  const rows = (await soft(env.DB.prepare(
    `SELECT * FROM jobs WHERE archived_at IS NULL ORDER BY status, created_at DESC LIMIT 200`
  ).all())).results || [];

  const today = localDateOf(new Date());
  const out = [];
  for (const j of rows) {
    const next = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM appointments
        WHERE job_id = ? AND archived_at IS NULL AND status <> 'cancelled'
          AND COALESCE(start_date, substr(start_at, 1, 10)) >= ?`
    ).bind(j.id, today).first().catch(() => null);
    const upcoming = Number((next && next.n) || 0);
    out.push({ ...j, rule: describe(j), upcoming,
      /* An arrangement that is live but has nothing in the diary is the one
         that falls through the cracks, so it is named rather than inferred. */
      unscheduled: j.status === 'open' && upcoming === 0 });
  }
  return json({ ok: true, jobs: out, today });
}

/* ---------------------------------------------------------------- create */
export async function onRequestPost({ request, env }) {
  const g = await gate(request, env, 'everyoneSchedule');
  if (g.response) return g.response;
  if (!await hasTables(env.DB)) {
    return json({ error: 'Jobs are not set up yet.', setup: SETUP, needsSetup: true }, 503);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }

  const name = clean(body.customer_name, 120);
  if (!name) return json({ error: 'Who is it for?' }, 400);
  const startDate = clean(body.start_date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return json({ error: 'Pick the first day.' }, 400);

  const job = {
    id: 'job-' + newId(),
    customer_id: clean(body.customer_id, 60) || null,
    property_id: clean(body.property_id, 60) || null,
    lead_id: clean(body.lead_id, 60) || null,
    quote_id: clean(body.quote_id, 60) || null,
    service_label: clean(body.service_label, 120) || null,
    customer_name: name,
    phone: clean(body.phone, 40) || null,
    address: clean(body.address, 200) || null,
    city: clean(body.city, 80) || null,
    notes: clean(body.notes, 2000) || null,
    freq: cleanFreq(body.freq),
    byday: JSON.stringify(cleanDays(body.byday)),
    start_date: startDate,
    until_date: clean(body.until_date, 10) || null,
    start_time: /^\d{2}:\d{2}$/.test(String(body.start_time || '')) ? body.start_time : '09:00',
    duration_min: cleanDuration(body.duration_min),
    assigned_to: clean(body.assigned_to, 60) || null
  };

  const dates = occurrences(job);
  if (!dates.length) return json({ error: 'That arrangement produces no visits.' }, 400);

  /* Every visit is checked before any of it is written, so she is told what
     clashes rather than finding out one booking at a time. */
  const clashes = [];
  for (const d of dates) {
    const span = spanFor(job, d);
    if (!span) continue;
    const hits = await conflictsForSpan(env.DB, { all_day: 0, ...span }, null);
    if (hits.length) clashes.push({ date: d, with: hits.map((h) => h.label) });
  }
  if (clashes.length && body.override !== true) {
    return json({ error: clashes.length === dates.length
      ? 'Every one of those times is already taken.'
      : clashes.length + ' of those ' + dates.length + ' times are already taken.',
      clashes, dates }, 409);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO jobs (id, created_at, customer_id, property_id, lead_id, quote_id,
       service_label, customer_name, phone, address, city, notes, status,
       freq, byday, start_date, until_date, start_time, duration_min, assigned_to)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'open',?,?,?,?,?,?,?)`
  ).bind(job.id, now, job.customer_id, job.property_id, job.lead_id, job.quote_id,
    job.service_label, job.customer_name, job.phone, job.address, job.city, job.notes,
    job.freq, job.byday, job.start_date, job.until_date, job.start_time,
    job.duration_min, job.assigned_to).run();

  const made = await writeVisits(env.DB, job, dates);
  const row = await env.DB.prepare('SELECT * FROM jobs WHERE id = ?').bind(job.id).first();
  return json({ ok: true, job: { ...row, rule: describe(row) }, visits: made,
    skipped_clashes: clashes.length || undefined }, 201);
}

/** Writes one appointment per date. Returns how many landed. */
async function writeVisits(db, job, dates) {
  const now = new Date().toISOString();
  let made = 0;
  for (const d of dates) {
    const span = spanFor(job, d);
    if (!span) continue;
    try {
      await db.prepare(
        `INSERT INTO appointments (id, created_at, job_id, occurrence_date, lead_id,
           quote_id, customer_id, property_id, title, customer_name, phone, address,
           city, service_label, status, all_day, start_at, end_at, notes, assigned_to)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'confirmed',0,?,?,?,?)`
      ).bind('apt-' + newId(), now, job.id, d, job.lead_id || null, job.quote_id || null,
        job.customer_id || null, job.property_id || null,
        job.service_label || 'Cleaning', job.customer_name, job.phone, job.address,
        job.city, job.service_label, span.start_at, span.end_at, job.notes,
        job.assigned_to || null).run();
      made++;
    } catch { /* one bad row must not take the arrangement down with it */ }
  }
  return made;
}

/* ---------------------------------------------------------------- change */
export async function onRequestPatch({ request, env }) {
  const g = await gate(request, env, 'everyoneSchedule');
  if (g.response) return g.response;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }

  const id = clean(body.id, 60);
  const action = clean(body.action, 30);
  if (!id) return json({ error: 'Which arrangement?' }, 400);

  const job = await env.DB.prepare('SELECT * FROM jobs WHERE id = ?').bind(id).first()
    .catch(() => null);
  if (!job) return json({ error: 'That arrangement is not here.' }, 404);
  const now = new Date().toISOString();

  /* Skip one occurrence. A row rather than a deletion, so it can be put
     back -- RFC 5545's EXDATE cannot be undone and that is a trap. */
  if (action === 'skip' || action === 'unskip') {
    const date = clean(body.date, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'Which day?' }, 400);
    if (action === 'skip') {
      await env.DB.prepare(
        `INSERT INTO job_exceptions (id, job_id, occurrence_date, kind, created_at)
         VALUES (?,?,?,'skipped',?)`
      ).bind('jex-' + newId(), id, date, now).run();
      await env.DB.prepare(
        `UPDATE appointments SET status = 'cancelled', updated_at = ?
          WHERE job_id = ? AND occurrence_date = ?`
      ).bind(now, id, date).run();
    } else {
      await env.DB.prepare(
        `DELETE FROM job_exceptions WHERE job_id = ? AND occurrence_date = ? AND kind = 'skipped'`
      ).bind(id, date).run();
      await env.DB.prepare(
        `UPDATE appointments SET status = 'confirmed', updated_at = ?
          WHERE job_id = ? AND occurrence_date = ?`
      ).bind(now, id, date).run();
    }
    return json({ ok: true, action });
  }

  /* End it. Visits already past stay as the record of work done; the ones
     still ahead go. */
  if (action === 'end') {
    const from = clean(body.from, 10) || localDateOf(new Date());
    await env.DB.prepare(
      `UPDATE jobs SET status = 'done', until_date = ?, updated_at = ? WHERE id = ?`
    ).bind(addDays(from, -1), now, id).run();
    await env.DB.prepare(
      `UPDATE appointments SET status = 'cancelled', updated_at = ?
        WHERE job_id = ? AND occurrence_date >= ? AND status <> 'cancelled'`
    ).bind(now, id, from).run();
    return json({ ok: true, action: 'end', from });
  }

  /* Change it from here on. RFC 5545 has no operator for this and neither
     does anybody else: the old arrangement is ended the day before, and a
     new one starts from this date carrying the changes. The visits already
     behind that line are left exactly as they were. */
  if (action === 'change_future') {
    const from = clean(body.from, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return json({ error: 'Changing from when?' }, 400);

    await env.DB.prepare(
      `UPDATE jobs SET until_date = ?, updated_at = ? WHERE id = ?`
    ).bind(addDays(from, -1), now, id).run();
    await env.DB.prepare(
      `UPDATE appointments SET status = 'cancelled', updated_at = ?
        WHERE job_id = ? AND occurrence_date >= ? AND status <> 'cancelled'`
    ).bind(now, id, from).run();

    const next = {
      ...job,
      id: 'job-' + newId(),
      start_date: from,
      until_date: clean(body.until_date, 10) || job.until_date || null,
      freq: body.freq !== undefined ? cleanFreq(body.freq) : cleanFreq(job.freq),
      byday: JSON.stringify(body.byday !== undefined ? cleanDays(body.byday) : cleanDays(job.byday)),
      start_time: /^\d{2}:\d{2}$/.test(String(body.start_time || ''))
        ? body.start_time : job.start_time,
      duration_min: body.duration_min !== undefined
        ? cleanDuration(body.duration_min) : job.duration_min,
      assigned_to: body.assigned_to !== undefined
        ? (clean(body.assigned_to, 60) || null) : job.assigned_to
    };
    await env.DB.prepare(
      `INSERT INTO jobs (id, created_at, customer_id, property_id, lead_id, quote_id,
         service_label, customer_name, phone, address, city, notes, status,
         freq, byday, start_date, until_date, start_time, duration_min, assigned_to)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'open',?,?,?,?,?,?,?)`
    ).bind(next.id, now, next.customer_id, next.property_id, next.lead_id, next.quote_id,
      next.service_label, next.customer_name, next.phone, next.address, next.city,
      next.notes, next.freq, next.byday, next.start_date, next.until_date,
      next.start_time, next.duration_min, next.assigned_to).run();

    const dates = occurrences(next);
    const made = await writeVisits(env.DB, next, dates);
    const row = await env.DB.prepare('SELECT * FROM jobs WHERE id = ?').bind(next.id).first();
    return json({ ok: true, action: 'change_future',
      job: { ...row, rule: describe(row) }, visits: made });
  }

  /* Top it up: write down any occurrence the rule produces that is not in
     the diary yet. An open-ended arrangement is only written a few months
     ahead, so this is how it keeps going. */
  if (action === 'extend') {
    const exceptions = (await soft(env.DB.prepare(
      'SELECT * FROM job_exceptions WHERE job_id = ?').bind(id).all())).results || [];
    const have = new Set(((await soft(env.DB.prepare(
      'SELECT occurrence_date FROM appointments WHERE job_id = ?').bind(id).all())).results || [])
      .map((r) => r.occurrence_date));
    const want = plannedDates(job, exceptions).filter((d) => !have.has(d));
    const made = await writeVisits(env.DB, job, want);
    return json({ ok: true, action: 'extend', visits: made });
  }

  return json({ error: 'Unknown change.' }, 400);
}
