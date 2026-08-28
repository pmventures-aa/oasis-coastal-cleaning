/**
 * Light checks for property-lookup response shaping helpers (inline).
 * Full RentCast calls need RENTCAST_API_KEY + network.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../functions/api/admin/property-lookup.js'), 'utf8');
const lib = readFileSync(join(here, '../functions/_lib/rentcast.js'), 'utf8');
const docs = readFileSync(join(here, '../docs/property-lookup.md'), 'utf8');

assert.match(src, /RENTCAST_API_KEY/);
assert.match(src, /lookupRentCast/);
assert.match(lib, /api\.rentcast\.io\/v1\/properties/);
assert.match(lib, /bedrooms/);
assert.match(lib, /squareFootage/);
assert.match(docs, /Zillow does \*\*not\*\* offer a public API/);

const admin = readFileSync(join(here, '../public/js/admin.js'), 'utf8');
assert.match(admin, /data-quote-action="resend"/);
assert.match(admin, /data-start-quote/);
assert.match(admin, /data-property-lookup/);
assert.match(admin, /openQuoteTab/);

const site = readFileSync(join(here, '../public/js/site.js'), 'utf8');
assert.match(site, /landingCards:\s*renderLandingCards/);
assert.match(site, /function renderLandingCards/);

const data = readFileSync(join(here, '../public/js/data.js'), 'utf8');
assert.match(data, /landings:\s*\[/);
assert.match(data, /\/corporate-cleaning/);
assert.match(data, /\/airbnb-cleaning/);

console.log('property-lookup.test.mjs: ok');
