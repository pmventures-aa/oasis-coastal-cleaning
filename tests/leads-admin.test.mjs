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

console.log('leads-admin.test.mjs: ok');
