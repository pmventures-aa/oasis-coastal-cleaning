/**
 * GET   /api/admin/settings — current values, the field descriptions, and
 *                             what the site can and cannot currently do
 * PATCH /api/admin/settings — save any subset
 */
import { json } from '../../_lib/util.js';
import { isSignedIn } from '../../_lib/auth.js';
import { loadSettings, saveSettings, FIELDS, DEFAULTS } from '../../_lib/settings.js';
import { hasCustomerTables } from '../../_lib/customers.js';

export async function onRequestGet({ request, env }) {
  if (!await isSignedIn(request, env)) return json({ error: 'Please sign in.' }, 401);

  const settings = await loadSettings(env.DB);

  // What is actually wired up, so the page can say so rather than her guessing.
  let quotesReady = false, settingsStored = false;
  try { await env.DB.prepare('SELECT 1 FROM quotes LIMIT 1').first(); quotesReady = true; } catch { /* no */ }
  try { await env.DB.prepare('SELECT 1 FROM settings LIMIT 1').first(); settingsStored = true; } catch { /* no */ }

  return json({
    ok: true,
    settings,
    fields: FIELDS,
    defaults: DEFAULTS,
    health: {
      database: Boolean(env.DB),
      settingsStored,
      quotes: quotesReady,
      customers: await hasCustomerTables(env.DB),
      email: Boolean(env.RESEND_API_KEY || env.BREVO_API_KEY || env.NOTIFY_WEBHOOK_URL),
      emailTracking: Boolean(env.RESEND_WEBHOOK_SECRET),
      propertyLookup: Boolean(env.RENTCAST_API_KEY),
      spamCheck: true,
      extraSpamCheck: Boolean(env.TURNSTILE_SECRET_KEY)
    }
  });
}

export async function onRequestPatch({ request, env }) {
  if (!await isSignedIn(request, env)) return json({ error: 'Please sign in.' }, 401);
  if (!env.DB) return json({ error: 'No database connected.' }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }

  const days = body.quote_expiry_days;
  if (days !== undefined && !(Number(days) >= 1 && Number(days) <= 365)) {
    return json({ error: 'Quotes should expire somewhere between 1 and 365 days.' }, 400);
  }
  if (body.notify_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(body.notify_email).trim())) {
    return json({ error: 'That does not look like an email address.' }, 400);
  }

  try {
    const result = await saveSettings(env.DB, body);
    if (!result.ok) return json({ error: result.error }, 400);
    return json({ ok: true, settings: await loadSettings(env.DB) });
  } catch (err) {
    return json({ error: 'Could not save.', detail: String(err && err.message || err) }, 503);
  }
}
