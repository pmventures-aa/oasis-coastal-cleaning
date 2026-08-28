/**
 * GET /api/zip?z=33063 — which Florida town a ZIP is in.
 *
 * The built-in map covers Kristina's own service area, which is most of what
 * anyone types. Anything else is looked up against the same open geocoder the
 * portal already uses for addresses, so the whole state is covered without
 * anybody inventing a thousand rows of data that would quietly go stale.
 *
 * Every answer is kept, so a ZIP is only ever looked up once.
 *
 * Public on purpose: it takes a ZIP and gives back a town. There is nothing
 * here to protect, and the quote form needs it before anyone has signed in.
 */
import { json } from '../_lib/util.js';
import { SERVICE_AREA_ZIPS } from '../_lib/zips.js';

const FL_MIN = 32000, FL_MAX = 34999;

const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=86400' };

export async function onRequestGet({ request, env }) {
  const zip = String(new URL(request.url).searchParams.get('z') || '').replace(/\D/g, '').slice(0, 5);
  if (zip.length !== 5) return json({ error: 'Five digits, please.' }, 400);

  const n = Number(zip);
  if (n < FL_MIN || n > FL_MAX) {
    return json({ ok: true, zip, city: null, outsideFlorida: true }, 200, CACHE_HEADERS);
  }

  // 1. The service-area map, which needs no request at all.
  if (SERVICE_AREA_ZIPS[zip]) {
    return json({ ok: true, zip, city: SERVICE_AREA_ZIPS[zip], source: 'local' }, 200, CACHE_HEADERS);
  }

  // 2. Anything already looked up once.
  if (env.DB) {
    try {
      const row = await env.DB.prepare('SELECT city, county FROM zip_cache WHERE zip = ?').bind(zip).first();
      if (row) {
        await env.DB.prepare('UPDATE zip_cache SET hits = hits + 1 WHERE zip = ?').bind(zip).run();
        return json({ ok: true, zip, city: row.city, county: row.county, source: 'cache' }, 200, CACHE_HEADERS);
      }
    } catch { /* no table yet */ }
  }

  // 3. The rest of Florida.
  try {
    const url = new URL('https://photon.komoot.io/api/');
    url.searchParams.set('q', zip + ' Florida');
    url.searchParams.set('limit', '5');
    url.searchParams.set('lang', 'en');
    const res = await fetch(url.toString(), { headers: { 'User-Agent': 'oasiscoastalcleaning.com' } });
    if (!res.ok) throw new Error('geocoder ' + res.status);
    const data = await res.json();

    const hit = (data.features || [])
      .map((f) => f.properties || {})
      .find((p) => p.state === 'Florida' && (p.postcode === zip || !p.postcode) && (p.city || p.name));
    const city = hit ? (hit.city || hit.name) : null;
    const county = hit ? (hit.county || null) : null;

    if (city && env.DB) {
      try {
        await env.DB.prepare(
          `INSERT INTO zip_cache (zip, city, state, county, created_at, hits)
           VALUES (?, ?, 'FL', ?, ?, 0)
           ON CONFLICT(zip) DO UPDATE SET city = excluded.city, county = excluded.county`
        ).bind(zip, city, county, new Date().toISOString()).run();
      } catch { /* no table yet */ }
    }

    return json({ ok: true, zip, city, county, source: 'lookup' }, 200, CACHE_HEADERS);
  } catch (err) {
    // A ZIP we cannot place is not an error the customer should see; they can
    // simply type the town.
    console.log('ZIP lookup failed for', zip, err && err.message);
    return json({ ok: true, zip, city: null, source: 'unavailable' }, 200, CACHE_HEADERS);
  }
}
