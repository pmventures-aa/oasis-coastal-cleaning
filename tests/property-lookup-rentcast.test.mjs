/**
 * RentCast property-lookup module shape checks.
 * Live API calls need RENTCAST_API_KEY in the Cloudflare environment.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../functions/api/admin/property-lookup.js'), 'utf8');

assert.match(src, /api\.rentcast\.io\/v1\/properties/);
assert.match(src, /X-Api-Key/);
assert.match(src, /RENTCAST_API_KEY/);
assert.match(src, /export async function onRequestGet/);
assert.match(src, /export async function onRequestPost/);
assert.match(src, /zipCode/);
assert.match(src, /squareFootage/);
assert.match(src, /bedrooms/);
assert.match(src, /app\.rentcast\.io\/app\/api/);

// Address format helper present (Street, City, State, Zip)
assert.match(src, /buildFullAddress/);
assert.match(src, /lookupRentCast/);

console.log('property-lookup-rentcast.test.mjs: ok');
