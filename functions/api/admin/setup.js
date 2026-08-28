/**
 * POST /api/admin/setup — bring the database up to date.
 *
 * Kristina should not have to paste SQL into a console to turn a feature on.
 * This applies everything the site needs, is safe to press twice, and reports
 * what it did in words rather than in table names.
 */
import { json } from '../../_lib/util.js';
import { isSignedIn } from '../../_lib/auth.js';
import { applySchema } from '../../_lib/schema.js';

const FRIENDLY = {
  quotes: 'Branded quotes', quote_events: 'Quote history',
  customers: 'Customers', properties: 'Properties',
  settings: 'Your settings', property_cache: 'Property lookup savings',
  zip_cache: 'ZIP lookups', submissions: 'Spam protection'
};

export async function onRequestPost({ request, env }) {
  if (!await isSignedIn(request, env)) return json({ error: 'Please sign in.' }, 401);
  if (!env.DB) {
    return json({ error: 'No database is connected to this site yet.' }, 503);
  }

  const result = await applySchema(env.DB);
  const madeTables = result.created.filter((n) => !n.includes('.'));
  const madeColumns = result.created.filter((n) => n.includes('.'));

  const parts = [];
  if (madeTables.length) parts.push('Set up ' + madeTables.map((t) => FRIENDLY[t] || t).join(', ') + '.');
  if (madeColumns.length) parts.push('Added ' + madeColumns.length + ' new field' + (madeColumns.length === 1 ? '' : 's') + '.');
  if (result.linked) parts.push('Linked ' + result.linked + ' existing record' + (result.linked === 1 ? '' : 's') + ' to customers and properties.');
  if (!parts.length) parts.push('Everything was already up to date.');

  return json({
    ok: result.ok,
    message: parts.join(' '),
    failed: result.failed
  }, result.ok ? 200 : 500);
}
