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

/**
 * Municipality for Oasis-area ZIPs where USPS lists a different “postal city”
 * (33063 is Margate, not Pompano Beach).
 */
const FL_ZIP_HINTS = {
  33063: { city: 'Margate', lat: 26.25023, lon: -80.20569 },
  33066: { city: 'Coconut Creek', lat: 26.2767, lon: -80.1848 },
  33065: { city: 'Coral Springs', lat: 26.2712, lon: -80.2706 },
  33071: { city: 'Coral Springs', lat: 26.243, lon: -80.269 },
  33067: { city: 'Coral Springs', lat: 26.315, lon: -80.269 },
  33073: { city: 'Coconut Creek', lat: 26.301, lon: -80.177 },
  33068: { city: 'North Lauderdale', lat: 26.217, lon: -80.226 },
  33060: { city: 'Pompano Beach', lat: 26.233, lon: -80.125 },
  33062: { city: 'Pompano Beach', lat: 26.234, lon: -80.09 },
  33064: { city: 'Pompano Beach', lat: 26.267, lon: -80.116 },
  33069: { city: 'Pompano Beach', lat: 26.218, lon: -80.162 },
  33076: { city: 'Parkland', lat: 26.322, lon: -80.237 },
  33431: { city: 'Boca Raton', lat: 26.358, lon: -80.083 },
  33432: { city: 'Boca Raton', lat: 26.35, lon: -80.083 },
  33433: { city: 'Boca Raton', lat: 26.348, lon: -80.16 },
  33434: { city: 'Boca Raton', lat: 26.38, lon: -80.16 },
  33441: { city: 'Deerfield Beach', lat: 26.315, lon: -80.1 },
  33442: { city: 'Deerfield Beach', lat: 26.307, lon: -80.143 },
  33486: { city: 'Boca Raton', lat: 26.37, lon: -80.11 },
  33487: { city: 'Boca Raton', lat: 26.4, lon: -80.1 },
  33496: { city: 'Boca Raton', lat: 26.4, lon: -80.16 },
  33498: { city: 'Boca Raton', lat: 26.39, lon: -80.2 }
};

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

/** OSM often puts the road on `name` with no `street` (Margate NW 70th Ave). */
function photonStreet(p) {
  if (p.street) return String(p.street).trim();
  if (p.osm_key === 'highway' && p.name) return String(p.name).trim();
  if (p.osm_value === 'house' || p.osm_value === 'house_number') {
    return String(p.street || p.name || '').trim();
  }
  return '';
}

function mapPhotonFeatures(features, typedQuery, preferredZip) {
  const suggestions = [];
  const wantZip = String(preferredZip || '').replace(/\D/g, '').slice(0, 5);

  for (const f of features) {
    const p = (f && f.properties) || {};
    if (!isUsa(p.country, p.countrycode)) continue;
    if (!isFloridaState(p.state)) continue;
    if (p.osm_value === 'bus_stop' || p.osm_key === 'amenity') continue;
    const street = photonStreet(p);
    if (!street && !p.housenumber) continue;

    let item = normalizeSuggestion({
      address: streetLine(p.housenumber, street, p.name),
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

/** Nominatim address.city / town / village */
function nominatimCity(addr) {
  return String(
    addr.city || addr.town || addr.village || addr.municipality || addr.suburb || ''
  ).trim();
}

function mapNominatimResults(results, typedQuery, preferredZip) {
  const suggestions = [];
  const wantZip = String(preferredZip || '').replace(/\D/g, '').slice(0, 5);

  for (const r of results || []) {
    const addr = r.address || {};
    if (!isUsa(addr.country, addr.country_code)) continue;
    if (!isFloridaState(addr.state)) continue;
    const road = String(addr.road || addr.pedestrian || '').trim();
    const house = String(addr.house_number || '').trim();
    if (!road && !house) continue;
    if (wantZip && addr.postcode) {
      const got = String(addr.postcode).replace(/\D/g, '').slice(0, 5);
      if (got && got !== wantZip) continue;
    }

    let item = normalizeSuggestion({
      address: streetLine(house, road, r.name),
      city: nominatimCity(addr),
      zip: String(addr.postcode || wantZip || '').replace(/\D/g, '').slice(0, 5)
    });
    item = applyTypedHouseNumber(item, typedQuery);
    if (!item) continue;
    if (wantZip && !item.zip) {
      item = normalizeSuggestion({ address: item.address, city: item.city, zip: wantZip });
    }
    if (suggestions.some((s) => s.label === item.label)) continue;
    suggestions.push(item);
  }
  return suggestions.slice(0, 6);
}

async function nominatimSearch(params, fetchImpl) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, String(value));
  });
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '6');
  url.searchParams.set('countrycodes', 'us');

  const res = await fetchImpl(url.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'OasisCoastalCleaningAdmin/1.0 (property quotes)'
    }
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

/**
 * House-level US search. Finds 123 NW 70th Ave in Margate; Photon often only
 * has the street centerline under `name`.
 */
async function suggestNominatim(query, zip, city, fetchImpl) {
  const wantZip = String(zip || '').replace(/\D/g, '').slice(0, 5);
  const expanded = expandStreetAbbreviations(query);
  const tries = [
    { street: query, postalcode: wantZip, state: 'Florida', country: 'US', city },
    { street: expanded, postalcode: wantZip, state: 'Florida', country: 'US', city },
    { q: `${expanded} ${wantZip} Florida` }
  ];
  const seen = new Set();

  for (const params of tries) {
    const key = JSON.stringify(params);
    if (seen.has(key)) continue;
    seen.add(key);
    const results = await nominatimSearch(params, fetchImpl);
    const suggestions = mapNominatimResults(results, query, wantZip);
    if (suggestions.length) return { suggestions, provider: 'nominatim' };
  }
  return { suggestions: [], provider: 'nominatim' };
}

export async function resolveFloridaZip(zip, fetchImpl = globalThis.fetch) {
  const z = String(zip || '').replace(/\D/g, '').slice(0, 5);
  if (z.length !== 5) return null;

  const hint = FL_ZIP_HINTS[z];
  if (hint) return { zip: z, city: hint.city, lat: hint.lat, lon: hint.lon };

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

function fillCityFromZip(suggestions, zipPlace, wantZip) {
  if (!zipPlace || !zipPlace.city) return suggestions;
  return suggestions.map((s) => {
    if (s.city) return s;
    return normalizeSuggestion({ address: s.address, city: zipPlace.city, zip: s.zip || wantZip });
  });
}

/**
 * @param {string} query
 * @param {{ MAPBOX_ACCESS_TOKEN?: string }} env
 * @param {typeof fetch} [fetchImpl]
 * @param {{ zip?: string, city?: string }} [opts]
 */
export async function suggestFloridaAddresses(query, env = {}, fetchImpl = globalThis.fetch, opts = {}) {
  const q = String(query || '').trim();
  const zip = String(opts.zip || '').replace(/\D/g, '').slice(0, 5);
  const cityHint = String(opts.city || '').trim();
  if (q.length < 3) return { suggestions: [], provider: null };
  if (q.length > 120) return { error: 'Search is too long.', status: 400, suggestions: [] };

  let zipPlace = null;
  if (zip.length === 5) {
    zipPlace = await resolveFloridaZip(zip, fetchImpl);
  }
  const city = cityHint || (zipPlace && zipPlace.city) || '';

  const finish = (result) => {
    const suggestions = fillCityFromZip(result.suggestions || [], zipPlace, zip);
    return { ...result, suggestions, place: result.place || zipPlace || null };
  };

  // House + ZIP: Nominatim interpolates the number and returns the city
  // (Margate), which Photon/USPS often miss.
  if (zip.length === 5 && extractHouseNumber(q)) {
    try {
      const nom = await suggestNominatim(q, zip, city, fetchImpl);
      if (nom.suggestions.length) return finish(nom);
    } catch {
      /* Photon next */
    }
  }

  const token = String(env.MAPBOX_ACCESS_TOKEN || '').trim();
  if (token) {
    try {
      const mapped = await suggestMapbox(q, token, zip, fetchImpl);
      if (mapped.suggestions.length || mapped.error) return finish(mapped);
    } catch {
      /* fall through to Photon */
    }
  }

  try {
    const photon = await suggestPhoton(q, zip, fetchImpl);
    if (photon.suggestions.length || photon.error) return finish(photon);
  } catch (err) {
    return {
      error: 'Address search unreachable.',
      detail: String(err && err.message || err),
      status: 502,
      suggestions: [],
      place: zipPlace
    };
  }

  if (zipPlace) {
    const typed = normalizeSuggestion({
      address: q,
      city: zipPlace.city,
      zip
    });
    if (typed) return { suggestions: [typed], provider: 'typed', place: zipPlace };
  }

  return { suggestions: [], provider: null, place: zipPlace };
}
