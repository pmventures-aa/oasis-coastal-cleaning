/**
 * RentCast Property Records helper.
 * Docs: https://developers.rentcast.io/reference/search-queries.md
 *
 * Single-property lookup MUST send only `address` (Street, City, State, Zip)
 * and omit every other query parameter.
 */

const ZIP_RE = /\b(\d{5})(?:-\d{4})?\b/;
const UNIT_RE = /\s+(?:apt\.?|apartment|unit|ste\.?|suite|bldg\.?|building|#)\s*.*$/i;

export function sanitizeApiKey(raw) {
  let key = String(raw || '').trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  return key;
}

export function normalizeCityName(raw) {
  const t = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  if (/^somewhere else$/i.test(t)) return '';
  if (t !== t.toLowerCase() && t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

export function stripUnit(street) {
  return String(street || '').replace(UNIT_RE, '').replace(/\s+/g, ' ').trim();
}

const DIR_MAP = {
  n: 'North', s: 'South', e: 'East', w: 'West',
  ne: 'Northeast', nw: 'Northwest', se: 'Southeast', sw: 'Southwest'
};
const SUFFIX_MAP = {
  st: 'Street', str: 'Street', ave: 'Avenue', av: 'Avenue', blvd: 'Boulevard',
  rd: 'Road', dr: 'Drive', ln: 'Lane', ct: 'Court', cir: 'Circle', pl: 'Place',
  ter: 'Terrace', trl: 'Trail', pkwy: 'Parkway', hwy: 'Highway', way: 'Way'
};

/** Generate street-line variants (abbrev ↔ full) to improve RentCast hit rate. */
export function streetVariants(street) {
  const base = String(street || '').replace(/\s+/g, ' ').trim();
  if (!base) return [];

  const variants = new Set([base]);
  const add = (s) => { if (s && s.trim()) variants.add(s.replace(/\s+/g, ' ').trim()); };

  // Directional: "100 E Ocean Ave" ↔ "100 East Ocean Avenue"
  const dirMatch = base.match(/^(\d+\S*)\s+([NSEW]{1,2})\.?\s+(.+)$/i);
  if (dirMatch) {
    const [, num, dir, rest] = dirMatch;
    const expanded = DIR_MAP[dir.toLowerCase()];
    if (expanded) add(`${num} ${expanded} ${rest}`);
  }
  for (const [abbr, full] of Object.entries(DIR_MAP)) {
    const re = new RegExp(`^(\\d+\\S*)\\s+${full}\\s+(.+)$`, 'i');
    const m = base.match(re);
    if (m) add(`${m[1]} ${abbr.toUpperCase()} ${m[2]}`);
  }

  // Suffix: St ↔ Street, Ave ↔ Avenue, etc.
  const suffixMatch = base.match(/^(.+?)\s+([A-Za-z]+)\.?$/);
  if (suffixMatch) {
    const [, stem, suf] = suffixMatch;
    const key = suf.toLowerCase();
    if (SUFFIX_MAP[key]) add(`${stem} ${SUFFIX_MAP[key]}`);
    for (const [abbr, full] of Object.entries(SUFFIX_MAP)) {
      if (full.toLowerCase() === key) add(`${stem} ${abbr.charAt(0).toUpperCase()}${abbr.slice(1)}`);
    }
  }

  add(stripUnit(base));
  return [...variants];
}

function normalizeStreetKey(street) {
  return String(street || '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\b(north|south|east|west)\b/g, (m) => ({ north: 'n', south: 's', east: 'e', west: 'w' })[m] || m)
    .replace(/\b(street|avenue|boulevard|road|drive|lane|court|circle|place|terrace|trail|parkway|highway|way)\b/g, (m) => {
      const map = { street: 'st', avenue: 'ave', boulevard: 'blvd', road: 'rd', drive: 'dr', lane: 'ln',
        court: 'ct', circle: 'cir', place: 'pl', terrace: 'ter', trail: 'trl', parkway: 'pkwy', highway: 'hwy', way: 'way' };
      return map[m] || m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchPropertyByStreet(rows, street) {
  if (!Array.isArray(rows) || !rows.length || !street) return null;
  const target = normalizeStreetKey(street);
  const targetNum = (target.match(/^\d+/) || [])[0];
  let best = null;
  let bestScore = 0;

  for (const row of rows) {
    const line = row.addressLine1 || row.formattedAddress || '';
    const key = normalizeStreetKey(line);
    if (!key) continue;
    let score = 0;
    if (key === target) score = 100;
    else if (targetNum && key.startsWith(targetNum) && key.includes(target.replace(/^\d+\s*/, '').slice(0, 8))) score = 80;
    else if (targetNum && key.startsWith(targetNum)) score = 50;
    if (score > bestScore) { bestScore = score; best = row; }
  }
  return bestScore >= 50 ? best : null;
}

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

/** RentCast format with comma before ZIP: Street, City, State, Zip */
export function buildFullAddress({ address, city, state, zip }) {
  return [address, city, state, zip].filter(Boolean).join(', ');
}

/** RentCast often stores formattedAddress as Street, City, State Zip (no comma before ZIP). */
export function buildFullAddressAlt({ address, city, state, zip }) {
  const parts = [address, city].filter(Boolean);
  if (state && zip) parts.push(`${state} ${zip}`);
  else if (state) parts.push(state);
  else if (zip) parts.push(zip);
  return parts.join(', ');
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

  const features = row.features && typeof row.features === 'object' ? row.features : {};
  const bedroomsRaw = row.bedrooms ?? features.bedrooms;
  const bathroomsRaw = row.bathrooms ?? features.bathrooms;
  const sqftRaw = row.squareFootage ?? row.livingArea ?? features.squareFootage ?? features.livingArea;

  const bedrooms = bedroomsRaw != null && bedroomsRaw !== '' ? String(bedroomsRaw) : '';
  const bathrooms = bathroomsRaw != null && bathroomsRaw !== '' ? String(bathroomsRaw) : '';
  const sqftNum = sqftRaw != null ? Number(sqftRaw) : NaN;
  const sqft = Number.isFinite(sqftNum) && sqftNum > 0 ? sqftNum : null;
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

function rentcastErrorMessage(data, status) {
  if (!data || typeof data !== 'object') return `RentCast returned ${status}`;
  if (typeof data.message === 'string' && data.message) return data.message;
  if (typeof data.error === 'string' && data.error) {
    return data.message ? `${data.error}: ${data.message}` : data.error;
  }
  try { return JSON.stringify(data).slice(0, 280); } catch { return `RentCast returned ${status}`; }
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
  let data = {};
  if (typeof res.text === 'function') {
    const text = await res.text().catch(() => '');
    try { data = text ? JSON.parse(text) : {}; } catch { data = { message: String(text).slice(0, 280) }; }
  } else if (typeof res.json === 'function') {
    data = await res.json().catch(() => ({}));
  }
  return { res, data, url: url.toString() };
}

async function rentcastSearchByZip(apiKey, parsed, fetchImpl) {
  if (!parsed.zip) return null;
  const url = new URL('https://api.rentcast.io/v1/properties');
  url.searchParams.set('zipCode', parsed.zip);
  url.searchParams.set('state', parsed.state || 'FL');
  if (parsed.city) url.searchParams.set('city', parsed.city);
  url.searchParams.set('limit', '25');
  const res = await fetchImpl(url.toString(), {
    headers: { Accept: 'application/json', 'X-Api-Key': apiKey }
  });
  let data = {};
  if (typeof res.text === 'function') {
    const text = await res.text().catch(() => '');
    try { data = text ? JSON.parse(text) : {}; } catch { return null; }
  } else if (typeof res.json === 'function') {
    data = await res.json().catch(() => ({}));
  }
  if (!res.ok) return null;
  const rows = Array.isArray(data) ? data : (data.properties || []);
  return matchPropertyByStreet(rows, parsed.address);
}

function buildAddressCandidates(parsed) {
  const streets = streetVariants(parsed.address);
  const bases = streets.length ? streets : [parsed.address];
  const out = [];
  for (const street of bases) {
    const loc = { ...parsed, address: street };
    out.push(buildFullAddress(loc), buildFullAddressAlt(loc));
    const stripped = stripUnit(street);
    if (stripped && stripped !== street) {
      const loc2 = { ...parsed, address: stripped };
      out.push(buildFullAddress(loc2), buildFullAddressAlt(loc2));
    }
  }
  return uniqueAddresses(out.filter(Boolean));
}

function uniqueAddresses(candidates) {
  const seen = new Set();
  const out = [];
  for (const addr of candidates) {
    const key = addr.toLowerCase();
    if (!addr || seen.has(key)) continue;
    seen.add(key);
    out.push(addr);
  }
  return out;
}

/**
 * Look up one property. GET /v1/properties?address=Street, City, State, Zip
 * Header: X-Api-Key
 */
export async function lookupRentCast(apiKey, loc, fetchImpl = globalThis.fetch) {
  const key = sanitizeApiKey(apiKey);
  if (!key) {
    return { error: 'Property lookup is not set up yet.', status: 503 };
  }

  const parsed = parseLocation(loc);
  if (!parsed.address) {
    return { error: 'Add a street address first.', status: 400 };
  }
  if (!parsed.city && !parsed.zip) {
    return { error: 'Add a city or ZIP so we can find the property.', status: 400 };
  }

  const candidates = buildAddressCandidates(parsed);

  let lastRes;
  let lastData;
  let lastTried = candidates[0];
  let authFailed = false;
  let emptyHits = 0;

  for (const fullAddress of candidates) {
    lastTried = fullAddress;
    const { res, data, url } = await rentcastGetByAddress(key, fullAddress, fetchImpl);
    lastRes = res;
    lastData = data;

    const keys = queryKeys(url);
    if (keys.length !== 1 || keys[0] !== 'address') {
      return { error: 'Lookup built a bad RentCast query.', status: 500 };
    }

    if (res.status === 401 || res.status === 403) {
      authFailed = true;
      break;
    }
    if (res.status === 429) {
      return {
        error: 'RentCast rate limit hit. Try again later or check your plan at rentcast.io.',
        status: 429
      };
    }

    if (res.ok) {
      const row = pickRow(data);
      const property = normalizeProperty(row, fullAddress);
      if (property) return { property, parsed, tried: fullAddress };
      if (row) emptyHits += 1;
    } else if (![404, 400].includes(res.status)) {
      return {
        error: rentcastErrorMessage(data, res.status),
        status: 502,
        tried: fullAddress,
        rentcast_status: res.status
      };
    }
  }

  // Last resort: search the ZIP and match street number + name.
  const bulkRow = await rentcastSearchByZip(key, parsed, fetchImpl);
  if (bulkRow) {
    const property = normalizeProperty(bulkRow, buildFullAddress(parsed));
    if (property) {
      return { property, parsed, tried: buildFullAddress(parsed), via: 'zip_search' };
    }
  }

  if (authFailed) {
    return {
      error: 'RentCast rejected the API key. In Cloudflare, check secret RENTCAST_API_KEY (no extra spaces or quotes), then redeploy.',
      status: 502,
      rentcast_status: lastRes?.status || 401
    };
  }

  if (lastRes && !lastRes.ok && lastRes.status !== 404) {
    return {
      error: rentcastErrorMessage(lastData, lastRes.status),
      status: 502,
      tried: lastTried,
      rentcast_status: lastRes.status
    };
  }

  return {
    error: emptyHits
      ? 'RentCast found this address but has no beds/baths/sq ft on file. Enter them manually on Profile.'
      : `No property record for this address. RentCast may not cover it — enter beds, baths, and sq ft manually on Profile.`,
    status: 404,
    tried: lastTried,
    not_found: true
  };
}
