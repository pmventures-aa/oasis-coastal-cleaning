/**
 * POST /api/admin/property-lookup
 * Fill beds / baths / sq ft from a street address.
 *
 * Provider: RentCast Property Records API (free Developer tier = 50/mo).
 *   https://developers.rentcast.io/reference/property-records
 * Secret: RENTCAST_API_KEY  (Cloudflare Pages → Variables and secrets)
 *
 * Zillow does not offer a public API for this.
 *
 * Body: { address, city, state?, zip }
 * Returns: { ok, property: { bedrooms, bathrooms, square_footage, property_type,
 *   size_label, formatted_address, source } }
 *
 * GET returns whether lookup is configured (for the admin UI).
 */
import { json, clean } from '../../_lib/util.js';
import { isSignedIn } from '../../_lib/auth.js';

const RENTCAST_SETUP =
  'Create a free API key at https://app.rentcast.io/app/api (Developer plan, 50 lookups/month). ' +
  'In Cloudflare → Workers & Pages → oasis-coastal-cleaning → Settings → Variables and secrets, ' +
  'add secret RENTCAST_API_KEY, then Redeploy the latest deployment.';

function formatSizeLabel(bedrooms, bathrooms, sqft) {
  const bits = [];
  if (bedrooms != null && bedrooms !== '') bits.push(`${bedrooms} bed`);
  if (bathrooms != null && bathrooms !== '') bits.push(`${bathrooms} bath`);
  if (sqft != null && Number(sqft) > 0) {
    bits.push(`${Number(sqft).toLocaleString('en-US')} sq ft`);
  }
  return bits.join(' · ');
}

function mapPropertyType(raw) {
  const t = String(raw || '').toLowerCase();
  if (!t) return '';
  if (t.includes('condo') || t.includes('apartment')) return 'Condo or apartment';
  if (t.includes('town')) return 'Townhouse';
  if (t.includes('multi') || t.includes('duplex')) return 'House';
  if (t.includes('single') || t.includes('house') || t.includes('residential')) return 'House';
  return String(raw).slice(0, 80);
}

function pickRow(data) {
  if (Array.isArray(data) && data.length) return data[0];
  if (data && Array.isArray(data.properties) && data.properties.length) return data.properties[0];
  if (data && typeof data === 'object' && (data.formattedAddress || data.addressLine1 || data.bedrooms != null)) {
    return data;
  }
  return null;
}

function normalizeProperty(row, fallbackAddress) {
  if (!row || typeof row !== 'object') return null;

  const bedrooms = row.bedrooms != null && row.bedrooms !== '' ? String(row.bedrooms) : '';
  const bathrooms = row.bathrooms != null && row.bathrooms !== '' ? String(row.bathrooms) : '';
  const sqftRaw = row.squareFootage != null ? Number(row.squareFootage) : NaN;
  const sqft = Number.isFinite(sqftRaw) && sqftRaw > 0 ? sqftRaw : null;
  const propertyType = mapPropertyType(row.propertyType);
  const sizeLabel = formatSizeLabel(bedrooms, bathrooms, sqft);

  if (!bedrooms && !bathrooms && !sqft) return null;

  return {
    bedrooms,
    bathrooms,
    square_footage: sqft,
    property_type: propertyType,
    size_label: sizeLabel,
    formatted_address: row.formattedAddress || fallbackAddress,
    year_built: row.yearBuilt || null,
    lot_size: row.lotSize || null,
    source: 'rentcast'
  };
}

/** RentCast wants: Street, City, State, Zip */
function buildFullAddress({ address, city, state, zip }) {
  return [address, city, state, zip].filter(Boolean).join(', ');
}

async function rentcastFetch(apiKey, params) {
  const url = new URL('https://api.rentcast.io/v1/properties');
  Object.entries(params).forEach(([k, v]) => {
    if (v) url.searchParams.set(k, v);
  });

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'X-Api-Key': apiKey
    }
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function lookupRentCast(apiKey, { address, city, state, zip }) {
  const fullAddress = buildFullAddress({ address, city, state, zip });

  // 1) Exact address lookup (preferred — one record)
  let { res, data } = await rentcastFetch(apiKey, {
    address: fullAddress,
    limit: '1'
  });

  if (res.status === 401 || res.status === 403) {
    return {
      error: 'RentCast rejected the API key. Check RENTCAST_API_KEY in Cloudflare secrets.',
      status: 502
    };
  }

  if (res.status === 429) {
    return {
      error: 'RentCast rate limit hit (free plan is 50 lookups/month). Try again later or upgrade the plan.',
      status: 429
    };
  }

  let row = res.ok ? pickRow(data) : null;
  let property = normalizeProperty(row, fullAddress);

  // 2) Fallback: component search if the combined address misspelled slightly
  if (!property && city && state) {
    ({ res, data } = await rentcastFetch(apiKey, {
      address,
      city,
      state,
      zipCode: zip || undefined,
      limit: '5'
    }));
    if (res.ok) {
      const list = Array.isArray(data) ? data : [];
      // Prefer a row whose street roughly matches
      const needle = address.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      row = list.find((r) => {
        const hay = String(r.formattedAddress || r.addressLine1 || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ');
        return needle && hay.includes(needle.split(' ')[0]);
      }) || list[0];
      property = normalizeProperty(row, fullAddress);
    }
  }

  if (!res.ok && !property) {
    const msg = data.message || data.error || `RentCast returned ${res.status}`;
    return { error: String(msg).slice(0, 300), status: 502 };
  }

  if (!property) {
    return { error: 'No property record found for that address.', status: 404 };
  }

  return { property };
}

export async function onRequestGet({ request, env }) {
  if (!await isSignedIn(request, env)) return json({ error: 'Please sign in.' }, 401);
  const configured = Boolean(env.RENTCAST_API_KEY);
  return json({
    ok: true,
    configured,
    provider: 'rentcast',
    setupUrl: 'https://app.rentcast.io/app/api',
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
  const zip = clean(body.zip, 12).replace(/[^0-9].*$/, '').slice(0, 5);

  if (!address) return json({ error: 'Add a street address first.' }, 400);
  if (!city && !zip) return json({ error: 'Add a city or ZIP so we can find the property.' }, 400);

  try {
    const result = await lookupRentCast(env.RENTCAST_API_KEY, { address, city, state, zip });
    if (result.error) {
      return json({ error: result.error, setupUrl: 'https://app.rentcast.io/app/api' }, result.status || 502);
    }
    return json({ ok: true, property: result.property });
  } catch (err) {
    return json({
      error: 'Lookup service unreachable.',
      detail: String(err && err.message || err)
    }, 502);
  }
}
