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
const lib = readFileSync(join(here, '../functions/_lib/rentcast.js'), 'utf8');

assert.match(src, /api\.rentcast\.io|lookupRentCast/);
assert.match(src, /RENTCAST_API_KEY/);
assert.match(src, /export async function onRequestGet/);
assert.match(src, /export async function onRequestPost/);
assert.match(src, /app\.rentcast\.io\/app\/api/);
assert.match(lib, /api\.rentcast\.io\/v1\/properties/);
assert.match(lib, /X-Api-Key/);
assert.match(lib, /zipCode|buildFullAddress/);
assert.match(lib, /omitting all other query parameters|omit every other query parameter/);
assert.match(lib, /Street, City, State, Zip/);

console.log('property-lookup-rentcast.test.mjs: ok');
