/**
 * POST /api/admin/property-lookup
 * Optional property data lookup (beds / baths / sqft) from an address.
 *
 * Zillow does not offer a public API for this. We use RentCast's property
 * records API when RENTCAST_API_KEY is set (free Developer tier: 50 lookups/mo).
 * https://developers.rentcast.io/
 *
 * Body: { address, city, state?, zip }
 * Returns: { ok, property: { bedrooms, bathrooms, square_footage, property_type,
 *   size_label, formatted_address } }
 */
import { json, clean } from '../../_lib/util.js';
import { isSignedIn } from '../../_lib/auth.js';

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

export async function onRequestPost({ request, env }) {
  if (!await isSignedIn(request, env)) return json({ error: 'Please sign in.' }, 401);

  if (!env.RENTCAST_API_KEY) {
    return json({
      error: 'Property lookup is not set up yet.',
      setup: 'Add secret RENTCAST_API_KEY (free at rentcast.io → API) and redeploy. Zillow does not offer a public API for beds/baths/sqft.'
    }, 503);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }

  const address = clean(body.address, 200);
  const city = clean(body.city, 80);
  const state = clean(body.state, 20) || 'FL';
  const zip = clean(body.zip, 12);

  if (!address) return json({ error: 'Add a street address first.' }, 400);
  if (!city && !zip) return json({ error: 'Add a city or ZIP so we can find the property.' }, 400);

  const parts = [address];
  if (city) parts.push(city);
  if (state) parts.push(state);
  if (zip) parts.push(zip);
  const fullAddress = parts.join(', ');

  const url = new URL('https://api.rentcast.io/v1/properties');
  url.searchParams.set('address', fullAddress);
  url.searchParams.set('limit', '1');

  let res;
  try {
    res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'X-Api-Key': env.RENTCAST_API_KEY
      }
    });
  } catch (err) {
    return json({ error: 'Lookup service unreachable.', detail: String(err && err.message || err) }, 502);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.error || `Lookup returned ${res.status}`;
    return json({ error: String(msg).slice(0, 300) }, 502);
  }

  const list = Array.isArray(data)
    ? data
    : (Array.isArray(data && data.properties) ? data.properties : null);
  const row = (list && list[0])
    || (data && typeof data === 'object' && !Array.isArray(data) && (data.formattedAddress || data.addressLine1) ? data : null);
  if (!row || typeof row !== 'object') {
    return json({ error: 'No property record found for that address.' }, 404);
  }

  const bedrooms = row.bedrooms != null ? String(row.bedrooms) : '';
  const bathrooms = row.bathrooms != null ? String(row.bathrooms) : '';
  const sqft = row.squareFootage != null ? Number(row.squareFootage) : null;
  const propertyType = mapPropertyType(row.propertyType);
  const sizeLabel = formatSizeLabel(bedrooms, bathrooms, sqft);

  if (!bedrooms && !bathrooms && !sqft) {
    return json({ error: 'Found the address, but no bed / bath / sq ft was listed.' }, 404);
  }

  return json({
    ok: true,
    property: {
      bedrooms,
      bathrooms,
      square_footage: sqft,
      property_type: propertyType,
      size_label: sizeLabel,
      formatted_address: row.formattedAddress || fullAddress,
      year_built: row.yearBuilt || null,
      source: 'rentcast'
    }
  });
}
