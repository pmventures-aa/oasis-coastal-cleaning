/**
 * RentCast Property Records helper.
 * Docs: https://developers.rentcast.io/reference/search-queries.md
 *
 * Single-property lookup MUST send only `address` (Street, City, State, Zip)
 * and omit every other query parameter. Mixing city/state/zipCode/limit with
 * a street turns this into a bulk area search and often returns nothing useful.
 */

const ZIP_RE = /\b(\d{5})(?:-\d{4})?\b/;
const UNIT_RE = /\s+(?:apt\.?|apartment|unit|ste\.?|suite|bldg\.?|building|#)\s*.*$/i;

export function normalizeCityName(raw) {
  const t = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  if (/^somewhere else$/i.test(t)) return '';
  // Quote-form cities are already mixed-case ("Lauderdale-by-the-Sea"). Leave those.
  if (t !== t.toLowerCase() && t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

export function stripUnit(street) {
  return String(street || '').replace(UNIT_RE, '').replace(/\s+/g, ' ').trim();
}

/**
 * Pull Street / City / State / Zip out of intake fields.
 * People paste a full line into Address, or repeat the city in both fields.
 */
export function parseLocation(input = {}) {
  let address = String(input.address || '').trim();
  let city = String(input.city || '').trim();
  let state = String(input.state || 'FL').trim().toUpperCase();
  if (state === 'FLORIDA') state = 'FL';
  if (state.length > 2) state = state.slice(0, 2) || 'FL';
  if (!state) state = 'FL';

  let zip = '';
  const zipFromField = String(input.zip || '').match(ZIP_RE);
  if (zipFromField) zip = zipFromField[1];
  const zipFromAddress = address.match(ZIP_RE);
  if (!zip && zipFromAddress) zip = zipFromAddress[1];
  address = address.replace(/,?\s*\b\d{5}(?:-\d{4})?\b/g, '').trim();

  address = address.replace(/,?\s*\b(?:FL|Florida)\.?\s*$/i, '').trim();
  address = address.replace(/,+$/g, '').trim();

  city = normalizeCityName(city);

  const bits = address.split(',').map((s) => s.trim()).filter(Boolean);
  if (bits.length >= 2) {
    const lastNorm = normalizeCityName(bits[bits.length - 1]);
    if (!city || lastNorm.toLowerCase() === city.toLowerCase()) {
      city = city || lastNorm;
      address = bits.slice(0, -1).join(', ');
    } else {
      address = bits.join(', ');
    }
  } else {
    address = bits[0] || '';
    if (city && address.toLowerCase().endsWith(city.toLowerCase())) {
      address = address.slice(0, -city.length).replace(/[,\s]+$/g, '');
    }
  }

  return {
    address: address.replace(/\s+/g, ' ').trim(),
    city: normalizeCityName(city),
    state,
    zip
  };
}

/** RentCast single-property format: Street, City, State, Zip */
export function buildFullAddress({ address, city, state, zip }) {
  return [address, city, state, zip].filter(Boolean).join(', ');
}

export function formatSizeLabel(bedrooms, bathrooms, sqft) {
  const bits = [];
  if (bedrooms != null && bedrooms !== '') bits.push(`${bedrooms} bed`);
  if (bathrooms != null && bathrooms !== '') bits.push(`${bathrooms} bath`);
  if (sqft != null && Number(sqft) > 0) {
    bits.push(`${Number(sqft).toLocaleString('en-US')} sq ft`);
  }
  return bits.join(' · ');
}

export function mapPropertyType(raw) {
  const t = String(raw || '').toLowerCase();
  if (!t) return '';
  if (t.includes('condo') || t.includes('apartment')) return 'Condo or apartment';
  if (t.includes('town')) return 'Townhouse';
  if (t.includes('manufactured')) return 'House';
  if (t.includes('multi') || t.includes('duplex')) return 'House';
  if (t.includes('single') || t.includes('house') || t.includes('residential')) return 'House';
  if (t.includes('land')) return '';
  return String(raw).slice(0, 80);
}

export function pickRow(data) {
  if (Array.isArray(data) && data.length) return data[0];
  if (data && Array.isArray(data.properties) && data.properties.length) return data.properties[0];
  if (data && typeof data === 'object' && (data.formattedAddress || data.addressLine1 || data.bedrooms != null)) {
    return data;
  }
  return null;
}

export function normalizeProperty(row, fallbackAddress) {
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

function queryKeys(urlString) {
  const keys = [];
  new URL(urlString).searchParams.forEach((_, k) => keys.push(k));
  return keys;
}

async function rentcastGetByAddress(apiKey, fullAddress, fetchImpl) {
  const url = new URL('https://api.rentcast.io/v1/properties');
  url.searchParams.set('address', fullAddress);
  const res = await fetchImpl(url.toString(), {
    headers: {
      Accept: 'application/json',
      'X-Api-Key': apiKey
    }
  });
  const data = await res.json().catch(() => ({}));
  return { res, data, url: url.toString() };
}

/**
 * Look up one property. Follows RentCast "Retrieving a Single Property":
 * GET /v1/properties?address=Street,%20City,%20State,%20Zip
 * Header: X-Api-Key
 *
 * @param {string} apiKey
 * @param {{ address: string, city?: string, state?: string, zip?: string }} loc
 * @param {typeof fetch} [fetchImpl]
 */
export async function lookupRentCast(apiKey, loc, fetchImpl = globalThis.fetch) {
  const parsed = parseLocation(loc);
  if (!parsed.address) {
    return { error: 'Add a street address first.', status: 400 };
  }
  if (!parsed.city && !parsed.zip) {
    return { error: 'Add a city or ZIP so we can find the property.', status: 400 };
  }

  const candidates = [buildFullAddress(parsed)];
  const stripped = stripUnit(parsed.address);
  if (stripped && stripped !== parsed.address) {
    candidates.push(buildFullAddress({ ...parsed, address: stripped }));
  }

  let lastRes;
  let lastData;
  let lastTried = candidates[0];

  for (const fullAddress of candidates) {
    lastTried = fullAddress;
    const { res, data, url } = await rentcastGetByAddress(apiKey, fullAddress, fetchImpl);
    lastRes = res;
    lastData = data;

    const keys = queryKeys(url);
    if (keys.length !== 1 || keys[0] !== 'address') {
      return { error: 'Lookup built a bad RentCast query.', status: 500 };
    }

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

    if (res.ok) {
      const property = normalizeProperty(pickRow(data), fullAddress);
      if (property) return { property, parsed, tried: fullAddress };
    }
  }

  if (lastRes && !lastRes.ok && lastRes.status !== 404) {
    const msg = (lastData && (lastData.message || lastData.error)) || `RentCast returned ${lastRes.status}`;
    return { error: String(msg).slice(0, 300), status: 502, tried: lastTried };
  }

  return {
    error: `No property record found for ${lastTried}. Check the street, city, and ZIP on Intake.`,
    status: 404,
    tried: lastTried
  };
}
