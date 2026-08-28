/**
 * POST /api/admin/property-lookup
 * Fill beds / baths / sq ft from a street address.
 *
 * Provider: RentCast Property Records API
 *   https://developers.rentcast.io/reference/introduction.md
 *   Single property: GET /v1/properties?address=Street, City, State, Zip
 *   Auth header: X-Api-Key
 * Secret: RENTCAST_API_KEY  (Cloudflare Pages → Variables and secrets)
 *
 * Body: { address, city, state?, zip }
 * GET returns whether lookup is configured (for the admin UI).
 */
import { json, clean } from '../../_lib/util.js';
import { isSignedIn } from '../../_lib/auth.js';
import { lookupRentCast } from '../../_lib/rentcast.js';

const RENTCAST_SETUP =
  'Create a free API key at https://app.rentcast.io/app/api (Developer plan, 50 lookups/month). ' +
  'In Cloudflare → Workers & Pages → oasis-coastal-cleaning → Settings → Variables and secrets, ' +
  'add secret RENTCAST_API_KEY, then Redeploy the latest deployment.';

export async function onRequestGet({ request, env }) {
  if (!await isSignedIn(request, env)) return json({ error: 'Please sign in.' }, 401);
  const configured = Boolean(env.RENTCAST_API_KEY);
  return json({
    ok: true,
    configured,
    provider: 'rentcast',
    setupUrl: 'https://app.rentcast.io/app/api',
    docsUrl: 'https://developers.rentcast.io/reference/introduction.md',
    setup: configured ? null : RENTCAST_SETUP
  });
}

export async function onRequestPost({ request, env }) {
  if (!await isSignedIn(request, env)) return json({ error: 'Please sign in.' }, 401);

  if (!env.RENTCAST_API_KEY) {
    return json({
      error: 'Property lookup is not set up yet.',
      setup: RENTCAST_SETUP,
      setupUrl: 'https://app.rentcast.io/app/api'
    }, 503);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }

  const address = clean(body.address, 200);
  const city = clean(body.city, 80);
  const state = (clean(body.state, 20) || 'FL').toUpperCase();
  const zip = clean(body.zip, 12);

  if (!address) return json({ error: 'Add a street address first.' }, 400);
  if (!city && !zip) return json({ error: 'Add a city or ZIP so we can find the property.' }, 400);

  try {
    const apiKey = String(env.RENTCAST_API_KEY || '').trim();
    const result = await lookupRentCast(apiKey, { address, city, state, zip });
    if (result.error) {
      return json({
        error: result.error,
        tried: result.tried || null,
        not_found: !!result.not_found,
        rentcast_status: result.rentcast_status || null,
        setupUrl: 'https://app.rentcast.io/app/api'
      }, result.status || 502);
    }
    return json({ ok: true, property: result.property });
  } catch (err) {
    return json({
      error: 'Lookup service unreachable.',
      detail: String(err && err.message || err)
    }, 502);
  }
}
