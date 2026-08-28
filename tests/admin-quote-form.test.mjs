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

let calls = 0;
const result = await lib.suggestFloridaAddresses(
  '2156 NW 62nd Ave',
  {},
  mockFetch((url) => {
    calls += 1;
    assert.match(url, /photon\.komoot\.io/);
    if (url.includes('33063+Florida') || url.includes('33063%20Florida')) {
      return { status: 200, body: zipResolveBody };
    }
    // Expanded street query should appear
    if (url.includes('Northwest') || url.includes('2156')) {
      return { status: 200, body: streetBody };
    }
    return { status: 200, body: { features: [] } };
  }),
  { zip: '33063' }
);

assert.ok(calls >= 2);
assert.equal(result.provider, 'photon');
assert.ok(result.suggestions.length >= 1);
assert.equal(result.suggestions[0].address, '2156 Northwest 62nd Avenue');
assert.equal(result.suggestions[0].city, 'Margate');
assert.equal(result.suggestions[0].zip, '33063');
assert.ok(!result.suggestions.some((s) => /New York|Broadway/i.test(s.label)));

const place = await lib.resolveFloridaZip(
  '33063',
  mockFetch(() => ({ status: 200, body: zipResolveBody }))
);
assert.equal(place.city, 'Margate');
assert.equal(place.zip, '33063');
assert.ok(place.lat > 26 && place.lat < 27);

const admin = readFileSync(join(here, '../public/js/admin.js'), 'utf8');
assert.match(admin, /data-zip-lookup/);
assert.match(admin, /ZIP first/);
assert.match(admin, /zip=/);
assert.match(admin, /runZipLookup/);
// ZIP field appears before street address in New Quote composer
const quoteZipAt = admin.indexOf('quote-zip');
const quoteAddrAt = admin.indexOf('quote-address');
assert.ok(quoteZipAt > 0 && quoteAddrAt > quoteZipAt);

const api = readFileSync(join(here, '../functions/api/admin/address-suggest.js'), 'utf8');
assert.match(api, /resolveFloridaZip/);
assert.match(api, /zip/);

console.log('admin-quote-form.test.mjs: ok');
