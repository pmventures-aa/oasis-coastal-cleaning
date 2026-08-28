/**
 * Florida-only address suggestions + admin quote form shape checks.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const lib = await import(pathToFileURL(join(here, '../functions/_lib/address-suggest.js')).href);

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

const photonBody = {
  features: [
    {
      properties: {
        housenumber: '100',
        street: 'N Ocean Blvd',
        city: 'Boca Raton',
        state: 'Florida',
        postcode: '33432',
        countrycode: 'us'
      }
    },
    {
      properties: {
        housenumber: '1',
        street: 'King St',
        city: 'Toronto',
        state: 'Ontario',
        postcode: 'M5H',
        countrycode: 'ca'
      }
    },
    {
      properties: {
        name: 'Some park',
        city: 'Miami',
        state: 'FL',
        postcode: '33101',
        countrycode: 'us'
      }
    }
  ]
};

let photonCalls = 0;
const result = await lib.suggestFloridaAddresses(
  '100 N Ocean',
  {},
  mockFetch((url) => {
    photonCalls += 1;
    assert.match(url, /photon\.komoot\.io/);
    assert.match(url, /lat=26/);
    assert.match(url, /lon=-80/);
    // First pass empty → retry with FL; second pass returns Florida streets.
    if (photonCalls === 1) return { status: 200, body: { features: [] } };
    assert.match(url, /FL/);
    return { status: 200, body: photonBody };
  })
);
assert.equal(photonCalls, 2);

assert.equal(result.provider, 'photon');
assert.equal(result.suggestions.length, 1);
assert.equal(result.suggestions[0].address, '100 N Ocean Blvd');
assert.equal(result.suggestions[0].city, 'Boca Raton');
assert.equal(result.suggestions[0].zip, '33432');
assert.equal(result.suggestions[0].state, 'FL');
assert.ok(!result.suggestions.some((s) => /Toronto|Ontario|Miami/i.test(s.label)));

const mapbox = await lib.suggestFloridaAddresses(
  '100 N Ocean',
  { MAPBOX_ACCESS_TOKEN: 'pk.test' },
  mockFetch((url) => {
    assert.match(url, /api\.mapbox\.com/);
    assert.match(url, /country=US/);
    assert.match(url, /bbox=/);
    return {
      status: 200,
      body: {
        features: [
          {
            address: '200',
            text: 'E Atlantic Ave',
            context: [
              { id: 'place.1', text: 'Delray Beach' },
              { id: 'region.1', text: 'Florida', short_code: 'US-FL' },
              { id: 'postcode.1', text: '33483' }
            ]
          },
          {
            address: '9',
            text: 'Broadway',
            context: [
              { id: 'place.2', text: 'New York' },
              { id: 'region.2', text: 'New York', short_code: 'US-NY' },
              { id: 'postcode.2', text: '10004' }
            ]
          }
        ]
      }
    };
  })
);
assert.equal(mapbox.provider, 'mapbox');
assert.equal(mapbox.suggestions.length, 1);
assert.equal(mapbox.suggestions[0].city, 'Delray Beach');
assert.equal(mapbox.suggestions[0].zip, '33483');

const admin = readFileSync(join(here, '../public/js/admin.js'), 'utf8');
assert.match(admin, /quote-first-name/);
assert.match(admin, /quote-last-name/);
assert.match(admin, /data-name-part="first"/);
assert.match(admin, /data-address-suggest/);
assert.match(admin, /Florida addresses only/);
assert.match(admin, /Set \$ for this quote, then Add/);
assert.doesNotMatch(admin, /saveAddonPrice/);
assert.doesNotMatch(admin, /Set \$ then Add · remembered/);
assert.match(admin, /Set \$ for this quote, then Add/);
assert.match(admin, /localStorage\.removeItem\('oasis_admin_addon_prices_v1'\)/);

const css = readFileSync(join(here, '../public/css/admin.css'), 'utf8');
assert.match(css, /grid-template-areas:/);
assert.match(css, /\.addr-suggest__list/);

const quotes = readFileSync(join(here, '../functions/api/admin/quotes.js'), 'utf8');
assert.match(quotes, /address, city, zip/);

const leads = readFileSync(join(here, '../functions/api/admin/leads.js'), 'utf8');
assert.match(leads, /first_name/);
assert.match(leads, /address, city, zip/);

console.log('admin-quote-form.test.mjs: ok');
