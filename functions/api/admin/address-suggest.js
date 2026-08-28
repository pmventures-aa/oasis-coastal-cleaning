/**
 * GET /api/admin/address-suggest?q=…
 * Florida-only address autocomplete for the admin dashboard.
 */
import { json, clean } from '../../_lib/util.js';
import { isSignedIn } from '../../_lib/auth.js';
import { suggestFloridaAddresses } from '../../_lib/address-suggest.js';

export async function onRequestGet({ request, env }) {
  if (!await isSignedIn(request, env)) return json({ error: 'Please sign in.' }, 401);

  const q = clean(new URL(request.url).searchParams.get('q'), 120);
  if (q.length < 3) return json({ ok: true, suggestions: [] });

  const result = await suggestFloridaAddresses(q, env);
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
    provider: result.provider || null
  });
}
