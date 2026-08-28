/**
 * ZIP-first Florida address suggestions + admin form shape checks.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const lib = await import(pathToFileURL(join(here, '../functions/_lib/address-suggest.js')).href);

assert.equal(lib.expandStreetAbbreviations('2156 NW 62nd Ave'), '2156 Northwest 62nd Avenue');
assert.equal(lib.extractHouseNumber('2156 NW 62nd Ave'), '2156');

const withNum = lib.applyTypedHouseNumber(
  lib.normalizeSuggestion({ address: 'Northwest 62nd Avenue', city: 'Margate', zip: '33063' }),
  '2156 NW 62nd Ave'
);
assert.equal(withNum.address, '2156 Northwest 62nd Avenue');
assert.equal(withNum.city, 'Margate');
assert.equal(withNum.zip, '33063');

function mockFetch(handler) {
  return async function fetchImpl(url) {
    const got = handler(String(url));
    return {
      ok: got.status >= 200 && got.status < 300,
      status: got.status,
      json: async () => got.body
    };
  };
}

const zipResolveBody = {
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-80.206436, 26.2445263] },
      properties: {
        name: '33063',
        city: 'Margate',
        state: 'Florida',
        countrycode: 'US',
        osm_key: 'place',
        osm_value: 'postcode'
      }
    }
  ]
};

const streetBody = {
  features: [
    {
      properties: {
        street: 'Northwest 62nd Avenue',
        city: 'Margate',
        state: 'Florida',
        postcode: '33063',
        countrycode: 'us'
      }
    },
    {
      properties: {
        housenumber: '9',
        street: 'Broadway',
        city: 'New York',
        state: 'New York',
        postcode: '10004',
        countrycode: 'us'
      }
    }
  ]
};

const photonNameOnlyBody = {
  features: [
    {
      properties: {
        name: 'Northwest 62nd Avenue',
        city: 'Margate',
        state: 'Florida',
        postcode: '33063',
        countrycode: 'us',
        osm_key: 'highway',
        osm_value: 'residential'
      }
    },
    {
      properties: {
        name: 'Atlantic Boulevard/Northwest 62nd Avenue',
        street: 'West Atlantic Boulevard',
        city: 'Margate',
        state: 'Florida',
        postcode: '33063',
        countrycode: 'us',
        osm_key: 'highway',
        osm_value: 'bus_stop'
      }
    }
  ]
};

const nominatimMargate = [
  {
    name: '',
    address: {
      house_number: '2156',
      road: 'Northwest 62nd Avenue',
      town: 'Margate',
      state: 'Florida',
      postcode: '33063',
      country: 'United States',
      country_code: 'us'
    }
  }
];

function routeSuggest(url, { nominatim = nominatimMargate, photon = streetBody } = {}) {
  if (url.includes('nominatim.openstreetmap.org')) {
    return { status: 200, body: nominatim };
  }
  if (url.includes('33063+Florida') || url.includes('33063%20Florida')) {
    return { status: 200, body: zipResolveBody };
  }
  if (url.includes('photon.komoot.io')) {
    return { status: 200, body: photon };
  }
  return { status: 200, body: { features: [] } };
}

const nomResult = await lib.suggestFloridaAddresses(
  '2156 NW 62nd Ave',
  {},
  mockFetch((url) => routeSuggest(url)),
  { zip: '33063' }
);
assert.equal(nomResult.provider, 'nominatim');
assert.ok(nomResult.suggestions.length >= 1);
assert.equal(nomResult.suggestions[0].address, '2156 Northwest 62nd Avenue');
assert.equal(nomResult.suggestions[0].city, 'Margate');
assert.equal(nomResult.suggestions[0].zip, '33063');
assert.ok(!nomResult.suggestions.some((s) => /New York|Broadway|Pompano/i.test(s.label)));

const photonName = await lib.suggestFloridaAddresses(
  '2156 NW 62nd Ave',
  {},
  mockFetch((url) => routeSuggest(url, { nominatim: [], photon: photonNameOnlyBody })),
  { zip: '33063' }
);
assert.equal(photonName.provider, 'photon');
assert.equal(photonName.suggestions[0].address, '2156 Northwest 62nd Avenue');
assert.equal(photonName.suggestions[0].city, 'Margate');
assert.ok(!photonName.suggestions.some((s) => /Atlantic Boulevard/i.test(s.label)));

const typedFallback = await lib.suggestFloridaAddresses(
  '2156 NW 62nd Ave',
  {},
  mockFetch((url) => routeSuggest(url, { nominatim: [], photon: { features: [] } })),
  { zip: '33063' }
);
assert.equal(typedFallback.provider, 'typed');
assert.equal(typedFallback.suggestions[0].address, '2156 NW 62nd Ave');
assert.equal(typedFallback.suggestions[0].city, 'Margate');
assert.equal(typedFallback.suggestions[0].zip, '33063');

const place = await lib.resolveFloridaZip('33063', mockFetch(() => {
  throw new Error('33063 should use the local Margate hint, not Photon');
}));
assert.equal(place.city, 'Margate');
assert.equal(place.zip, '33063');
assert.ok(place.lat > 26 && place.lat < 27);

const boca = await lib.resolveFloridaZip('33432', mockFetch(() => {
  throw new Error('33432 should use the local Boca Raton hint');
}));
assert.equal(boca.city, 'Boca Raton');
assert.equal(boca.zip, '33432');

const admin = readFileSync(join(here, '../public/js/admin.js'), 'utf8');
assert.match(admin, /data-zip-lookup/);
assert.match(admin, /ZIP first/);
assert.match(admin, /zip=/);
assert.match(admin, /runZipLookup/);
assert.match(admin, /setStreetEnabled/);
assert.match(admin, /Enter ZIP first/);
assert.match(admin, /disabled/);
assert.match(admin, /applyCity/);
assert.match(admin, /zipLookupSeq/);
assert.match(admin, /focusStreet: false/);
assert.match(admin, /applyCity\(addressSuggestScope\(zipInput\), ''\)/);
// ZIP field appears before street address in New Quote composer
const quoteZipAt = admin.indexOf('quote-zip');
const quoteAddrAt = admin.indexOf('quote-address');
assert.ok(quoteZipAt > 0 && quoteAddrAt > quoteZipAt);

const api = readFileSync(join(here, '../functions/api/admin/address-suggest.js'), 'utf8');
assert.match(api, /resolveFloridaZip/);
assert.match(api, /zip/);
assert.match(api, /city/);

console.log('admin-quote-form.test.mjs: ok');
