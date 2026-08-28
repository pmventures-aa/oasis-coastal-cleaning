/* The service-area ZIP map is duplicated for the browser and the server, so
   the two copies must agree. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SERVICE_AREA_ZIPS } from '../functions/_lib/zips.js';

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
