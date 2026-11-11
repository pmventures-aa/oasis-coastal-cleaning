/**
 * GET    /api/admin/price-book  — her list
 * POST   /api/admin/price-book  — add a line, or seed the list the first time
 * PATCH  /api/admin/price-book  — change one, or retire it
 *
 * Owner only: what she charges is hers.
 */
import { json, clean, newId } from '../../_lib/util.js';
import { gate } from '../../_lib/guard.js';
import { ensureScheduleTables } from '../../_lib/schema.js';
import { ADDON_CATALOG } from '../../_lib/addons.js';

const SETUP = 'Apply migration 0016 in D1 → oasis → Console.';
export const UNITS = ['each', 'hour', 'room', 'sqft'];

async function hasTable(db) {
  try { await db.prepare('SELECT 1 FROM price_book LIMIT 1').first(); return true; }
  catch { return ensureScheduleTables(db); }
}

const cents = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export async function onRequestGet({ request, env }) {
  const g = await gate(request, env, 'priceBook');
  if (g.response) return g.response;
  if (!await hasTable(env.DB)) {
    return json({ error: 'The price book is not set up yet.', setup: SETUP, needsSetup: true }, 503);
  }
  /* The quote builder wants only what she still offers. The Services
     screen wants everything, because bringing a retired line back is
     impossible if it cannot be seen. */
  const all = new URL(request.url).searchParams.get('all') === '1';
  const r = await env.DB.prepare(
    all
      ? 'SELECT * FROM price_book ORDER BY active DESC, grp, sort, label'
      : 'SELECT * FROM price_book WHERE active = 1 ORDER BY grp, sort, label'
  ).all().catch(() => ({ results: [] }));
  const items = r.results || [];
  return json({ ok: true, units: UNITS, items,
    /* An empty book is not a broken one -- it has never been filled. The
       screen offers to start it from the services she already lists. */
    empty: items.length === 0,
    seedable: ADDON_CATALOG.length });
}

export async function onRequestPost({ request, env }) {
  const g = await gate(request, env, 'priceBook');
  if (g.response) return g.response;
  if (!await hasTable(env.DB)) {
    return json({ error: 'The price book is not set up yet.', setup: SETUP, needsSetup: true }, 503);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }
  const now = new Date().toISOString();

  /* Start it from the services already on the site, with no prices: she
     fills those in as she goes, and an item with no price asks to be
     quoted rather than pretending to be free. */
  if (body.action === 'seed') {
    const existing = await env.DB.prepare('SELECT COUNT(*) AS n FROM price_book').first()
      .catch(() => ({ n: 0 }));
    if (Number(existing && existing.n)) {
      return json({ error: 'There is already a price book here.' }, 409);
    }
    let i = 0, made = 0;
    for (const a of ADDON_CATALOG) {
      try {
        await env.DB.prepare(
          `INSERT INTO price_book (id, created_at, label, note, grp, default_cents, unit, sort)
           VALUES (?,?,?,?,?,NULL,'each',?)`
        ).bind('pb-' + newId(), now, a.label, a.note || null, a.group || null, i++).run();
        made++;
      } catch { /* one odd row must not stop the rest */ }
    }
    return json({ ok: true, seeded: made }, 201);
  }

  const label = clean(body.label, 140);
  if (!label) return json({ error: 'What is it called?' }, 400);
  const id = 'pb-' + newId();
  await env.DB.prepare(
    `INSERT INTO price_book (id, created_at, label, note, grp, default_cents, unit, sort)
     VALUES (?,?,?,?,?,?,?,?)`
  ).bind(id, now, label, clean(body.note, 400) || null, clean(body.grp, 80) || null,
    cents(body.default_cents), UNITS.includes(body.unit) ? body.unit : 'each',
    Number(body.sort) || 100).run();
  const row = await env.DB.prepare('SELECT * FROM price_book WHERE id = ?').bind(id).first();
  return json({ ok: true, item: row }, 201);
}

export async function onRequestPatch({ request, env }) {
  const g = await gate(request, env, 'priceBook');
  if (g.response) return g.response;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }
  const id = clean(body.id, 60);
  if (!id) return json({ error: 'Which line?' }, 400);

  const sets = [], vals = [];
  if (body.label !== undefined) { sets.push('label = ?'); vals.push(clean(body.label, 140)); }
  if (body.note !== undefined) { sets.push('note = ?'); vals.push(clean(body.note, 400)); }
  if (body.grp !== undefined) { sets.push('grp = ?'); vals.push(clean(body.grp, 80)); }
  if (body.default_cents !== undefined) { sets.push('default_cents = ?'); vals.push(cents(body.default_cents)); }
  if (body.unit !== undefined && UNITS.includes(body.unit)) { sets.push('unit = ?'); vals.push(body.unit); }
  if (body.active !== undefined) { sets.push('active = ?'); vals.push(body.active ? 1 : 0); }
  /* Counting use is how the list sorts itself by what she actually reaches
     for, rather than by whatever order it was typed in. */
  if (body.action === 'used') { sets.push('times_used = times_used + 1'); }
  /* Her own order within a group, so the things she reaches for are where
     she put them rather than wherever the alphabet left them. */
  if (body.sort !== undefined && Number.isFinite(Number(body.sort))) {
    sets.push('sort = ?'); vals.push(Math.round(Number(body.sort)));
  }

  if (!sets.length) return json({ error: 'Nothing to change.' }, 400);
  sets.push('updated_at = ?'); vals.push(new Date().toISOString());
  vals.push(id);
  await env.DB.prepare(`UPDATE price_book SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  const row = await env.DB.prepare('SELECT * FROM price_book WHERE id = ?').bind(id).first();
  return json({ ok: true, item: row });
}
