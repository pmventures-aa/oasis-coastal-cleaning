/**
 * GET /api/admin/address-suggest?q=…&zip=…
 *
 * ZIP-first Florida address autocomplete for the admin dashboard.
 * - ?zip=33063           → resolve city + map bias for that ZIP
 * - ?q=2156 NW 62nd&zip=33063 → street suggestions near that ZIP
 */
import { json, clean } from '../../_lib/util.js';
import { isSignedIn } from '../../_lib/auth.js';
import { resolveFloridaZip, suggestFloridaAddresses } from '../../_lib/address-suggest.js';

export async function onRequestGet({ request, env }) {
  if (!await isSignedIn(request, env)) return json({ error: 'Please sign in.' }, 401);

  const url = new URL(request.url);
  const q = clean(url.searchParams.get('q'), 120);
  const zip = clean(url.searchParams.get('zip'), 12).replace(/\D/g, '').slice(0, 5);
  const city = clean(url.searchParams.get('city'), 80);

  if (!q && zip.length === 5) {
    const place = await resolveFloridaZip(zip, fetch);
    if (!place) {
      return json({ ok: true, place: null, suggestions: [], hint: 'No Florida city found for that ZIP.' });
    }
    return json({ ok: true, place, suggestions: [] });
  }

  if (q.length < 3) return json({ ok: true, suggestions: [], place: null });

  const result = await suggestFloridaAddresses(q, env, fetch, { zip, city });
  if (result.error && !result.suggestions.length) {
    return json({
      error: result.error,
      detail: result.detail || null,
      suggestions: []
    }, result.status || 502);
  }
  return json({
    ok: true,
    suggestions: result.suggestions || [],
    provider: result.provider || null,
    place: result.place || null
  });
}
