/**
 * Settings Kristina controls from the portal.
 *
 * Every setting has a default here, so the site works before she has ever
 * opened the settings page and keeps working if the table is missing. Reading
 * settings never fails — a bad database returns the defaults rather than an
 * error, because a quote going out with the standard terms is better than a
 * quote not going out.
 */

export const DEFAULTS = {
  // How Kristina appears on a quote
  quote_from_name:      'Kristina Roberts',
  quote_signoff:        'Thank you — Kristina',

  // Quote behaviour
  quote_expiry_days:    '14',
  quote_terms:          'No contract. Pause or stop with a week of notice.',
  quote_note:           '',

  // Where the alerts go, and which ones
  notify_email:         '',            // blank means use QUOTE_TO_EMAIL
  notify_on_request:    'yes',
  notify_on_view:       'no',          // off by default: a view is not news
  notify_on_accept:     'yes',
  notify_on_decline:    'yes',
  notify_on_followup:   'yes'
};

/** What each setting is, in Kristina's words, for the settings screen. */
export const FIELDS = [
  { key: 'quote_from_name', label: 'Your name on quotes', type: 'text',
    hint: 'Shown as the sender on the quote a customer opens.' },
  { key: 'quote_signoff', label: 'Sign-off', type: 'text',
    hint: 'The last line of a quote email.' },
  { key: 'quote_expiry_days', label: 'Quotes expire after', type: 'number', suffix: 'days',
    hint: 'A quote stops being acceptable this many days after you send it.' },
  { key: 'quote_terms', label: 'Standard terms', type: 'textarea',
    hint: 'Appears under every quote. You can change it per quote as well.' },
  { key: 'quote_note', label: 'Standard note', type: 'textarea',
    hint: 'Pre-filled in the note box on a new quote. Leave empty for none.' },
  { key: 'notify_email', label: 'Send my alerts to', type: 'email',
    hint: 'Leave empty to use the address the site was set up with.' },
  { key: 'notify_on_request', label: 'A new quote request comes in', type: 'toggle' },
  { key: 'notify_on_accept', label: 'A customer accepts a quote', type: 'toggle' },
  { key: 'notify_on_decline', label: 'A customer declines a quote', type: 'toggle' },
  { key: 'notify_on_followup', label: 'Someone asks for a call or a visit', type: 'toggle' },
  { key: 'notify_on_view', label: 'A customer opens a quote', type: 'toggle',
    hint: 'Off by default — this one can be noisy.' }
];

/** All settings, defaults filled in. Never throws. */
export async function loadSettings(db) {
  const out = { ...DEFAULTS };
  if (!db) return out;
  try {
    const rows = await db.prepare('SELECT key, value FROM settings').all();
    (rows.results || []).forEach((r) => {
      if (r.key in DEFAULTS && r.value != null) out[r.key] = String(r.value);
    });
  } catch { /* table not there yet — the defaults stand */ }
  return out;
}

export const isOn = (value) => String(value).toLowerCase() === 'yes';

/** Where an alert of this kind should go, or null when she has turned it off. */
export function alertTarget(settings, env, kind) {
  const key = 'notify_on_' + kind;
  if (key in settings && !isOn(settings[key])) return null;
  return settings.notify_email || env.QUOTE_TO_EMAIL || 'info@oasiscoastalcleaning.com';
}

export async function saveSettings(db, patch) {
  if (!db) return { ok: false, error: 'No database.' };
  const now = new Date().toISOString();
  const entries = Object.entries(patch).filter(([k]) => k in DEFAULTS);
  if (!entries.length) return { ok: false, error: 'Nothing to change.' };
  for (const [key, value] of entries) {
    await db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).bind(key, value == null ? '' : String(value).slice(0, 4000), now).run();
  }
  return { ok: true, saved: entries.length };
}
