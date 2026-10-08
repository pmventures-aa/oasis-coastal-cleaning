/* The service-area ZIP map is duplicated for the browser and the server, so
   the two copies must agree. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SERVICE_AREA_ZIPS, plausibleCity } from '../functions/_lib/zips.js';

const w = {};
new Function('window', readFileSync(new URL('../public/js/data.js', import.meta.url), 'utf8'))(w);
const browser = w.OASIS.zipCity;

assert.deepEqual(SERVICE_AREA_ZIPS, browser, 'server and browser ZIP maps must be identical');

const cities = new Set();
w.OASIS.areas.forEach((a) => a.cities.forEach((c) => cities.add(c)));
for (const [zip, city] of Object.entries(SERVICE_AREA_ZIPS)) {
  assert.match(zip, /^\d{5}$/, zip + ' is not a five-digit ZIP');
  const n = Number(zip);
  assert.ok(n >= 32000 && n <= 34999, zip + ' is outside Florida');
  assert.ok(cities.has(city), city + ' (' + zip + ') is not one of the service areas');
}

console.log(Object.keys(SERVICE_AREA_ZIPS).length +
  ' ZIPs agree across both copies, are Florida, and name a city she serves');

/* ---------------------------------------------------------- city sanity
   The geocoder answers a bare postal area with the postcode as its name, and
   that was being stored and read back as the town — so a customer typing
   33406 was told "That is 33406". */
assert.equal(plausibleCity('Delray Beach', '33444'), true, 'a town name is accepted');
assert.equal(plausibleCity('Lake Worth Beach', '33460'), true);

assert.equal(plausibleCity('33406', '33406'), false, 'the ZIP wearing a hat is rejected');
assert.equal(plausibleCity('33406', '33999'), false, 'any bare number, not just this ZIP');

for (const v of ['', '  ', null, undefined, 'A']) {
  assert.equal(plausibleCity(v, '33444'), false, JSON.stringify(v) + ' is not a town');
}

/* Palm Beach County was missing entirely: the map covered Broward only, so
   Delray, Boynton, Lake Worth and West Palm all cost a geocoder round trip. */
for (const [zip, city] of [['33444', 'Delray Beach'], ['33460', 'Lake Worth Beach'],
                           ['33426', 'Boynton Beach'], ['33401', 'West Palm Beach'],
                           ['33458', 'Jupiter'], ['33414', 'Wellington']]) {
  assert.equal(SERVICE_AREA_ZIPS[zip], city, zip + ' should resolve locally');
}
assert.ok(Object.keys(SERVICE_AREA_ZIPS).length >= 46,
  'both counties are covered, not just Broward');

console.log('city sanity and Palm Beach County coverage both hold');
