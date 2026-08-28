/**
 * RentCast single-property lookup: address format + query shape.
 * Live calls need RENTCAST_API_KEY; these tests mock fetch.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const libPath = pathToFileURL(join(here, '../functions/_lib/rentcast.js')).href;
const {
  parseLocation,
  buildFullAddress,
  stripUnit,
  normalizeProperty,
  lookupRentCast
} = await import(libPath);

assert.deepEqual(
  parseLocation({ address: '123 NE 2nd Ave', city: 'Delray Beach', zip: '33444' }),
  { address: '123 NE 2nd Ave', city: 'Delray Beach', state: 'FL', zip: '33444' }
);

assert.equal(
  buildFullAddress(parseLocation({ address: '123 NE 2nd Ave', city: 'Delray Beach', zip: '33444' })),
  '123 NE 2nd Ave, Delray Beach, FL, 33444'
);

// Full line pasted into Address, city repeated
assert.deepEqual(
  parseLocation({
    address: '123 NE 2nd Ave, Delray Beach, FL 33444',
    city: 'Delray Beach',
    zip: ''
  }),
  { address: '123 NE 2nd Ave', city: 'Delray Beach', state: 'FL', zip: '33444' }
);

assert.equal(stripUnit('123 Main St Apt 4'), '123 Main St');
assert.equal(stripUnit('123 Main St #2'), '123 Main St');

assert.equal(
  parseLocation({ address: '100 Ocean Blvd', city: 'boca raton', zip: '33432' }).city,
  'Boca Raton'
);

assert.equal(
  parseLocation({ address: '100 Ocean Blvd', city: 'Somewhere else', zip: '33432' }).city,
  ''
);

const mapped = normalizeProperty({
  bedrooms: 3,
  bathrooms: 2.5,
  squareFootage: 1850,
  propertyType: 'Single Family',
  formattedAddress: '123 NE 2nd Ave, Delray Beach, FL 33444'
}, 'fallback');
assert.equal(mapped.bedrooms, '3');
assert.equal(mapped.bathrooms, '2.5');
assert.equal(mapped.square_footage, 1850);
assert.equal(mapped.property_type, 'House');
assert.match(mapped.size_label, /3 bed/);
assert.match(mapped.size_label, /1,850 sq ft/);

function mockFetch(handler) {
  return async function fetchImpl(url, opts) {
    const got = handler(url, opts);
    return {
      ok: got.status >= 200 && got.status < 300,
      status: got.status,
      json: async () => got.body
    };
  };
}

const sampleRow = {
  formattedAddress: '123 NE 2nd Ave, Delray Beach, FL 33444',
  bedrooms: 4,
  bathrooms: 3,
  squareFootage: 2200,
  propertyType: 'Single Family'
};

const seen = [];
const result = await lookupRentCast(
  'test-key',
  { address: '123 NE 2nd Ave', city: 'Delray Beach', zip: '33444' },
  mockFetch((url, opts) => {
    seen.push({ url, key: opts.headers['X-Api-Key'] });
    return { status: 200, body: [sampleRow] };
  })
);
assert.equal(result.property.bedrooms, '4');
assert.equal(seen.length, 1);
assert.equal(seen[0].key, 'test-key');
const u = new URL(seen[0].url);
assert.equal(u.origin + u.pathname, 'https://api.rentcast.io/v1/properties');
assert.equal([...u.searchParams.keys()].join(','), 'address');
assert.equal(u.searchParams.get('address'), '123 NE 2nd Ave, Delray Beach, FL, 33444');
assert.equal(u.searchParams.get('limit'), null);
assert.equal(u.searchParams.get('city'), null);
assert.equal(u.searchParams.get('zipCode'), null);

const empty = await lookupRentCast(
  'test-key',
  { address: '1 Nope St', city: 'Boca Raton', zip: '33432' },
  mockFetch(() => ({ status: 200, body: [] }))
);
assert.equal(empty.status, 404);
assert.match(empty.error, /1 Nope St, Boca Raton, FL, 33432/);

const unitSeen = [];
await lookupRentCast(
  'test-key',
  { address: '123 Main St Apt 4', city: 'Boca Raton', zip: '33432' },
  mockFetch((url) => {
    unitSeen.push(new URL(url).searchParams.get('address'));
    return { status: 200, body: [] };
  })
);
assert.deepEqual(unitSeen, [
  '123 Main St Apt 4, Boca Raton, FL, 33432',
  '123 Main St, Boca Raton, FL, 33432'
]);

const src = readFileSync(join(here, '../functions/api/admin/property-lookup.js'), 'utf8');
assert.match(src, /from '\.\.\/\.\.\/_lib\/rentcast\.js'/);
assert.match(src, /X-Api-Key|lookupRentCast/);

const admin = readFileSync(join(here, '../public/js/admin.js'), 'utf8');
assert.match(admin, /applySearchFilter/);
assert.match(admin, /l\.zip/);
assert.match(admin, /id === 'search'\) \{ state\.q = e\.target\.value; applySearchFilter/);

console.log('rentcast-lookup.test.mjs: ok');
