/**
 * Static checks for admin lead logging + dashboard helpers.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const leadsApi = readFileSync(join(here, '../functions/api/admin/leads.js'), 'utf8');
const statusApi = readFileSync(join(here, '../functions/api/admin/status.js'), 'utf8');
const admin = readFileSync(join(here, '../public/js/admin.js'), 'utf8');

assert.match(leadsApi, /onRequestPost/);
assert.match(leadsApi, /admin-phone/);
assert.match(leadsApi, /followup IN \('call', 'visit'\)/);
assert.match(leadsApi, /latest_quote_status/);
assert.match(leadsApi, /A valid phone number is required/);

assert.match(statusApi, /RESEND_API_KEY \|\| env\.BREVO_API_KEY/);

assert.match(admin, /data-new-lead/);
assert.match(admin, /data-save-lead/);
assert.match(admin, /data-followup-filter/);
assert.match(admin, /catalogQuoteLinesFromLead/);
assert.match(admin, /data-copy-link/);
assert.match(admin, /admin-banner/);
assert.match(admin, /visibilitychange/);

/* A lead taken on the phone used to keep eight fields while one from the
   website kept eighteen, so the same job arrived thinner by telephone and
   she had to ring back for the rest. These are the ones worth asking while
   they are still on the line. */
for (const field of ['bedrooms', 'bathrooms', 'size_label', 'property_type',
                     'frequency', 'start_when', 'best_time', 'contact_pref', 'access']) {
  assert.match(leadsApi, new RegExp('body\\.' + field + '\\b'),
    'the phone-lead endpoint should read ' + field);
  assert.match(admin, new RegExp('data-lead-field="' + field + '"'),
    'the New Request form should ask for ' + field);
  assert.match(admin, new RegExp('\\b' + field + ': get\\('),
    'the New Request form should send ' + field);
}

// A phone number typed by hand should be stored the way the website stores one.
assert.match(leadsApi, /formatPhone\(phone\)/,
  'phone leads should be formatted like web leads');

// Where a request came from has been stored on every lead and shown nowhere.
assert.match(admin, /function cameFrom/);
assert.match(admin, /Taken on the phone/);
assert.match(admin, /vacation rentals page/);

// The one field on the first screen she sees should not be a browser default.
assert.match(admin, /class="set__input signin__input"/);

console.log('leads-admin.test.mjs: ok');
