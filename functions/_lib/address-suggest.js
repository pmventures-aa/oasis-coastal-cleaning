/**
 * Florida-biased address suggestions for the admin UI.
 *
 * Default: Photon (OpenStreetMap) with a Florida bounding box — no API key.
 * Optional: MAPBOX_ACCESS_TOKEN for Mapbox Geocoding (still FL-only).
 *
 * International results are filtered out; only US / Florida addresses return.
 */

const FL_BBOX = {
  minLon: -87.63,
  minLat: 24.39,
  maxLon: -79.97,
  maxLat: 31.0
};

function isFloridaState(value) {
  const s = String(value || '').trim().toLowerCase();
  return s === 'fl' || s === 'florida';
}

function isUsa(country, countryCode) {
  const c = String(country || '').trim().toLowerCase();
  const code = String(countryCode || '').trim().toLowerCase();
  return code === 'us' || code === 'usa' || c === 'united states' || c === 'usa' || c === 'us' || (!c && !code);
}

function streetLine(housenumber, street, name) {
  const num = String(housenumber || '').trim();
  const st = String(street || '').trim();
  if (num && st) return `${num} ${st}`;
  if (st) return st;
  return String(name || '').trim();
}

function normalizeSuggestion(raw) {
  const address = String(raw.address || '').trim();
  const city = String(raw.city || '').trim();
  const zip = String(raw.zip || '').replace(/\D/g, '').slice(0, 5);
  const state = 'FL';
  if (!address) return null;
  const label = [address, city, state, zip].filter(Boolean).join(', ');
  return { address, city, state, zip, label };
}

function mapPhotonFeatures(features) {
  const suggestions = [];
  for (const f of features) {
    const p = (f && f.properties) || {};
    if (!isUsa(p.country, p.countrycode)) continue;
    if (!isFloridaState(p.state)) continue;
    // Prefer real street addresses over POIs / place names with no street.
    if (!p.street && !p.housenumber) continue;
    const address = streetLine(p.housenumber, p.street, p.name);
    const city = p.city || p.town || p.village || p.municipality || '';
    const zip = p.postcode || '';
    const item = normalizeSuggestion({ address, city, zip });
    if (!item) continue;
    if (suggestions.some((s) => s.label === item.label)) continue;
    suggestions.push(item);
    if (suggestions.length >= 6) break;
  }
  return suggestions;
}

async function photonSearch(query, fetchImpl) {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', query);
  url.searchParams.set('lang', 'en');
  url.searchParams.set('limit', '10');
  // Bias to Palm Beach / Broward corridor (service area), not whole-state center.
  url.searchParams.set('lat', '26.3683');
  url.searchParams.set('lon', '-80.1289');

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

async function suggestPhoton(query, fetchImpl) {
  // Hard-filter every result to US / Florida. Retry with " FL" if the first pass
  // finds nothing (helps when the typed city is abbreviated).
  let { features, error, status } = await photonSearch(query, fetchImpl);
  if (error) return { error, status, suggestions: [] };

  let suggestions = mapPhotonFeatures(features);
  if (!suggestions.length && !/\b(fl|florida)\b/i.test(query)) {
    const retry = await photonSearch(`${query} FL`, fetchImpl);
    if (retry.error) return { error: retry.error, status: retry.status, suggestions: [] };
    suggestions = mapPhotonFeatures(retry.features);
  }
  return { suggestions, provider: 'photon' };
}

async function suggestMapbox(query, token, fetchImpl) {
  const path = encodeURIComponent(query);
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

    const address = String(f.address ? `${f.address} ${f.text || ''}` : (f.text || '')).trim();
    const item = normalizeSuggestion({
      address,
      city: (place && place.text) || '',
      zip: (postcode && postcode.text) || ''
    });
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
 */
export async function suggestFloridaAddresses(query, env = {}, fetchImpl = globalThis.fetch) {
  const q = String(query || '').trim();
  if (q.length < 3) return { suggestions: [], provider: null };
  if (q.length > 120) return { error: 'Search is too long.', status: 400, suggestions: [] };

  const token = String(env.MAPBOX_ACCESS_TOKEN || '').trim();
  if (token) {
    try {
      const mapped = await suggestMapbox(q, token, fetchImpl);
      if (mapped.suggestions.length || mapped.error) return mapped;
    } catch {
      /* fall through to Photon */
    }
  }

  try {
    return await suggestPhoton(q, fetchImpl);
  } catch (err) {
    return {
      error: 'Address search unreachable.',
      detail: String(err && err.message || err),
      status: 502,
      suggestions: []
    };
  }
}
