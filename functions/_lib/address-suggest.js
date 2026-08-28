/**
 * Florida-biased address suggestions for the admin UI.
 *
 * Default: Photon (OpenStreetMap), no API key.
 * Optional: MAPBOX_ACCESS_TOKEN for Mapbox Geocoding (still FL-only).
 *
 * Flow: ZIP first → city + lat/lon bias → street refine.
 * Abbreviations like NW/Ave are expanded; typed house numbers are kept
 * even when OSM only has the street centerline.
 */

const FL_BBOX = {
  minLon: -87.63,
  minLat: 24.39,
  maxLon: -79.97,
  maxLat: 31.0
};

/** Palm Beach / Broward fallback when ZIP is unknown */
const DEFAULT_BIAS = { lat: 26.3683, lon: -80.1289 };

export function isFloridaState(value) {
  const s = String(value || '').trim().toLowerCase();
  return s === 'fl' || s === 'florida';
}

function isUsa(country, countryCode) {
  const c = String(country || '').trim().toLowerCase();
  const code = String(countryCode || '').trim().toLowerCase();
  return code === 'us' || code === 'usa' || c === 'united states' || c === 'usa' || c === 'us' || (!c && !code);
}

/** Expand FL-style street abbreviations so Photon can match OSM names. */
export function expandStreetAbbreviations(query) {
  let s = String(query || '').trim();
  if (!s) return '';
  s = s
    .replace(/\bNW\b/gi, 'Northwest')
    .replace(/\bNE\b/gi, 'Northeast')
    .replace(/\bSW\b/gi, 'Southwest')
    .replace(/\bSE\b/gi, 'Southeast')
    .replace(/\bN\b/gi, 'North')
    .replace(/\bS\b/gi, 'South')
    .replace(/\bE\b/gi, 'East')
    .replace(/\bW\b/gi, 'West');
  s = s
    .replace(/\bAve\.?\b/gi, 'Avenue')
    .replace(/\bAv\.?\b/gi, 'Avenue')
    .replace(/\bBlvd\.?\b/gi, 'Boulevard')
    .replace(/\bSt\.?\b/gi, 'Street')
    .replace(/\bRd\.?\b/gi, 'Road')
    .replace(/\bDr\.?\b/gi, 'Drive')
    .replace(/\bLn\.?\b/gi, 'Lane')
    .replace(/\bCt\.?\b/gi, 'Court')
    .replace(/\bCir\.?\b/gi, 'Circle')
    .replace(/\bPl\.?\b/gi, 'Place')
    .replace(/\bTer\.?\b/gi, 'Terrace')
    .replace(/\bHwy\.?\b/gi, 'Highway')
    .replace(/\bPkwy\.?\b/gi, 'Parkway');
  return s.replace(/\s+/g, ' ').trim();
}

export function extractHouseNumber(query) {
  const m = String(query || '').trim().match(/^(\d+[A-Za-z]?)\b/);
  return m ? m[1] : '';
}

function streetLine(housenumber, street, name) {
  const num = String(housenumber || '').trim();
  const st = String(street || '').trim();
  if (num && st) return `${num} ${st}`;
  if (st) return st;
  return String(name || '').trim();
}

export function normalizeSuggestion(raw) {
  const address = String(raw.address || '').trim();
  const city = String(raw.city || '').trim();
  const zip = String(raw.zip || '').replace(/\D/g, '').slice(0, 5);
  const state = 'FL';
  if (!address) return null;
  const label = [address, city, state, zip].filter(Boolean).join(', ');
  return { address, city, state, zip, label };
}

/** If OSM only has the street, keep the house number the user typed. */
export function applyTypedHouseNumber(suggestion, typedQuery) {
  if (!suggestion) return null;
  const num = extractHouseNumber(typedQuery);
  if (!num) return suggestion;
  if (/^\d/.test(suggestion.address)) return suggestion;
  return normalizeSuggestion({
    address: `${num} ${suggestion.address}`,
    city: suggestion.city,
    zip: suggestion.zip
  });
}

function scoreStreetMatch(item, typedQuery) {
  const hay = String(item.address || '').toLowerCase();
  const tokens = expandStreetAbbreviations(typedQuery)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
  let score = 0;
  for (const t of tokens) {
    if (/^\d+$/.test(t)) continue; // house number already applied
    if (hay.includes(t)) score += t.length >= 3 ? 2 : 1;
  }
  return score;
}

function mapPhotonFeatures(features, typedQuery, preferredZip) {
  const suggestions = [];
  const wantZip = String(preferredZip || '').replace(/\D/g, '').slice(0, 5);

  for (const f of features) {
    const p = (f && f.properties) || {};
    if (!isUsa(p.country, p.countrycode)) continue;
    if (!isFloridaState(p.state)) continue;
    if (!p.street && !p.housenumber) continue;

    let item = normalizeSuggestion({
      address: streetLine(p.housenumber, p.street, p.name),
      city: p.city || p.town || p.village || p.municipality || '',
      zip: p.postcode || wantZip || ''
    });
    item = applyTypedHouseNumber(item, typedQuery);
    if (!item) continue;
    if (wantZip && item.zip && item.zip !== wantZip) continue;
    if (wantZip && !item.zip) {
      item = normalizeSuggestion({ address: item.address, city: item.city, zip: wantZip });
    }
    if (suggestions.some((s) => s.label === item.label)) continue;
    suggestions.push(item);
  }

  suggestions.sort((a, b) => scoreStreetMatch(b, typedQuery) - scoreStreetMatch(a, typedQuery));
  const best = suggestions.length ? scoreStreetMatch(suggestions[0], typedQuery) : 0;
  const ranked = best > 0
    ? suggestions.filter((s) => scoreStreetMatch(s, typedQuery) > 0)
    : suggestions;
  return ranked.slice(0, 6);
}

async function photonSearch(query, bias, fetchImpl) {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', query);
  url.searchParams.set('lang', 'en');
  url.searchParams.set('limit', '12');
  const lat = bias && bias.lat != null ? bias.lat : DEFAULT_BIAS.lat;
  const lon = bias && bias.lon != null ? bias.lon : DEFAULT_BIAS.lon;
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));

  const res = await fetchImpl(url.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'OasisCoastalCleaningAdmin/1.0 (property quotes)'
    }
  });
  if (!res.ok) {
    return { error: `Address search returned ${res.status}`, status: 502, features: [] };
  }
  const data = await res.json().catch(() => ({}));
  return { features: Array.isArray(data.features) ? data.features : [] };
}

/**
 * Resolve a 5-digit ZIP to a Florida city + map bias.
 */
export async function resolveFloridaZip(zip, fetchImpl = globalThis.fetch) {
  const z = String(zip || '').replace(/\D/g, '').slice(0, 5);
  if (z.length !== 5) return null;

  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', `${z} Florida`);
  url.searchParams.set('lang', 'en');
  url.searchParams.set('limit', '8');

  const res = await fetchImpl(url.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'OasisCoastalCleaningAdmin/1.0 (property quotes)'
    }
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  const features = Array.isArray(data.features) ? data.features : [];

  for (const f of features) {
    const p = (f && f.properties) || {};
    if (!isUsa(p.country, p.countrycode)) continue;
    if (!isFloridaState(p.state)) continue;
    const coords = f.geometry && Array.isArray(f.geometry.coordinates) ? f.geometry.coordinates : null;
    if (!coords || coords.length < 2) continue;
    const city = p.city || p.town || p.village || (p.osm_value === 'postcode' ? p.name : '') || p.name || '';
    // Prefer postcode features or cities that mention this zip.
    const post = String(p.postcode || '').replace(/\D/g, '').slice(0, 5);
    const isPost = p.osm_key === 'place' && (p.osm_value === 'postcode' || post === z || String(p.name || '') === z);
    if (!isPost && post && post !== z) continue;
    return {
      zip: z,
      city: city === z ? '' : city,
      lat: coords[1],
      lon: coords[0]
    };
  }
  return null;
}

async function suggestPhoton(query, zip, fetchImpl) {
  const wantZip = String(zip || '').replace(/\D/g, '').slice(0, 5);
  let bias = DEFAULT_BIAS;
  let zipPlace = null;
  if (wantZip.length === 5) {
    zipPlace = await resolveFloridaZip(wantZip, fetchImpl);
    if (zipPlace) bias = { lat: zipPlace.lat, lon: zipPlace.lon };
  }

  const expanded = expandStreetAbbreviations(query);
  const tries = [];
  const pushTry = (q) => {
    const t = String(q || '').trim();
    if (t && !tries.includes(t)) tries.push(t);
  };
  pushTry(query);
  pushTry(expanded);
  if (zipPlace && zipPlace.city) {
    pushTry(`${expanded} ${zipPlace.city}`);
    pushTry(`${expanded} ${zipPlace.city} FL`);
  }
  if (wantZip.length === 5) pushTry(`${expanded} ${wantZip}`);
  if (!/\b(fl|florida)\b/i.test(expanded)) pushTry(`${expanded} FL`);

  let suggestions = [];
  for (const q of tries) {
    const { features, error, status } = await photonSearch(q, bias, fetchImpl);
    if (error) return { error, status, suggestions: [], place: zipPlace };
    suggestions = mapPhotonFeatures(features, query, wantZip);
    if (suggestions.length) break;
  }

  // If ZIP known but city blank on suggestions, fill from ZIP place.
  if (zipPlace && zipPlace.city) {
    suggestions = suggestions.map((s) => {
      if (s.city) return s;
      return normalizeSuggestion({ address: s.address, city: zipPlace.city, zip: s.zip || wantZip });
    });
  }

  return { suggestions, provider: 'photon', place: zipPlace };
}

async function suggestMapbox(query, token, zip, fetchImpl) {
  const wantZip = String(zip || '').replace(/\D/g, '').slice(0, 5);
  const expanded = expandStreetAbbreviations(query);
  const path = encodeURIComponent(wantZip ? `${expanded} ${wantZip}` : expanded);
  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${path}.json`);
  url.searchParams.set('access_token', token);
  url.searchParams.set('country', 'US');
  url.searchParams.set('types', 'address');
  url.searchParams.set('language', 'en');
  url.searchParams.set('limit', '6');
  url.searchParams.set(
    'bbox',
    `${FL_BBOX.minLon},${FL_BBOX.minLat},${FL_BBOX.maxLon},${FL_BBOX.maxLat}`
  );
  url.searchParams.set('autocomplete', 'true');
  if (wantZip.length === 5) {
    const place = await resolveFloridaZip(wantZip, fetchImpl);
    if (place) {
      url.searchParams.set('proximity', `${place.lon},${place.lat}`);
    }
  }

  const res = await fetchImpl(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    return { error: `Mapbox returned ${res.status}`, status: 502, suggestions: [] };
  }
  const data = await res.json().catch(() => ({}));
  const features = Array.isArray(data.features) ? data.features : [];
  const suggestions = [];

  for (const f of features) {
    const ctx = Array.isArray(f.context) ? f.context : [];
    const region = ctx.find((c) => String(c.id || '').startsWith('region.'));
    const place = ctx.find((c) => String(c.id || '').startsWith('place.'));
    const postcode = ctx.find((c) => String(c.id || '').startsWith('postcode.'));
    const shortCode = String((region && region.short_code) || '').toUpperCase();
    const regionName = (region && region.text) || '';
    if (shortCode && shortCode !== 'US-FL' && shortCode !== 'FL') continue;
    if (!shortCode && regionName && !isFloridaState(regionName)) continue;

    const zipCode = String((postcode && postcode.text) || '').replace(/\D/g, '').slice(0, 5);
    if (wantZip && zipCode && zipCode !== wantZip) continue;

    let item = normalizeSuggestion({
      address: String(f.address ? `${f.address} ${f.text || ''}` : (f.text || '')).trim(),
      city: (place && place.text) || '',
      zip: zipCode || wantZip || ''
    });
    item = applyTypedHouseNumber(item, query);
    if (!item) continue;
    if (suggestions.some((s) => s.label === item.label)) continue;
    suggestions.push(item);
  }
  return { suggestions, provider: 'mapbox' };
}

/**
 * @param {string} query
 * @param {{ MAPBOX_ACCESS_TOKEN?: string }} env
 * @param {typeof fetch} [fetchImpl]
 * @param {{ zip?: string }} [opts]
 */
export async function suggestFloridaAddresses(query, env = {}, fetchImpl = globalThis.fetch, opts = {}) {
  const q = String(query || '').trim();
  const zip = String(opts.zip || '').replace(/\D/g, '').slice(0, 5);
  if (q.length < 3) return { suggestions: [], provider: null };
  if (q.length > 120) return { error: 'Search is too long.', status: 400, suggestions: [] };

  const token = String(env.MAPBOX_ACCESS_TOKEN || '').trim();
  if (token) {
    try {
      const mapped = await suggestMapbox(q, token, zip, fetchImpl);
      if (mapped.suggestions.length || mapped.error) return mapped;
    } catch {
      /* fall through to Photon */
    }
  }

  try {
    return await suggestPhoton(q, zip, fetchImpl);
  } catch (err) {
    return {
      error: 'Address search unreachable.',
      detail: String(err && err.message || err),
      status: 502,
      suggestions: []
    };
  }
}
