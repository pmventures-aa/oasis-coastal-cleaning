/**
 * POST /api/quote — a quote request from the multistep form.
 *
 * Three things happen, and each is independent so a missing piece never
 * costs a lead:
 *   1. the submission is stored in D1, if the DB binding exists
 *   2. Kristina is emailed, if RESEND_API_KEY is set
 *   3. the id comes back, so the confirmation step can attach a follow-up
 *
 * If both storage and email are unconfigured the request is refused with a
 * clear reason, because silently accepting a lead nobody will ever read is
 * worse than telling the visitor to call.
 */
import { formatPhone } from '../_lib/format.js';
import { linkLead } from '../_lib/customers.js';
import { loadSettings, alertTarget } from '../_lib/settings.js';
import { checkSubmission, noteSubmission } from '../_lib/spam.js';
import { json, clean, cleanList, isEmail, newId, verifyTurnstile, sendEmail }
  from '../_lib/util.js';
import { buildQuoteEmail } from '../_lib/email.js';

const MAX_BODY = 32 * 1024;

export async function onRequestPost({ request, env }) {
  let body;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: 'That request was too large.' }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'That request could not be read.' }, 400);
  }

  /* Three checks that need no third-party key: a field a person never sees,
     the time between the page loading and the form being sent, and how many
     requests this address has made in the last hour. A bot is answered with a
     cheerful ok so it learns nothing about what it tripped. */
  const spam = await checkSubmission(env, request, body);
  if (!spam.ok) {
    console.log('Blocked a submission:', spam.reasons.join(', '));
    return json({ ok: true, id: null });
  }

  // Turnstile as well, when Kristina has set it up. Both can be on at once.
  const ok = await verifyTurnstile(
    clean(body.turnstileToken, 2048),
    env.TURNSTILE_SECRET_KEY,
    request.headers.get('CF-Connecting-IP')
  );
  if (!ok) {
    return json({
      error: 'The “I am human” check did not go through. Reload and try once more — ' +
             'or call or text (561) 201-7123 and Kristina will take the details herself.'
    }, 400);
  }

  const lead = {
    id: newId(),
    created_at: new Date().toISOString(),

    name:         clean(body.name, 120),
    phone:        formatPhone(clean(body.phone, 40)),
    email:        clean(body.email, 160),
    best_time:    clean(body.bestTime, 80),
    contact_pref: clean(body.contactPref, 40),

    service:       clean(body.service, 60),
    service_label: clean(body.serviceLabel, 80),
    property_type: clean(body.property, 80),
    size_label:    clean(body.sizeLabel, 140),
    bedrooms:      clean(body.bedrooms, 20),
    bathrooms:     clean(body.bathrooms, 20),
    frequency:     clean(body.frequencyLabel, 60),
    first_visit:   body.firstVisit === true ? 1 : 0,
    add_ons:       JSON.stringify(cleanList(body.addOnLabels)),
    conditions:    JSON.stringify(cleanList(body.conditionLabels)),
    notes:         clean(body.notes, 2000),

    city:           clean(body.city, 80),
    zip:            clean(body.zip, 12),
    address:        clean(body.address, 200),
    start_when:     clean(body.startWhen, 80),
    preferred_days: JSON.stringify(cleanList(body.preferredDays, 7, 12)),
    access:         clean(body.access, 200),

    estimate_low:  Number.isFinite(+body.estimateLow) ? Math.round(+body.estimateLow) : null,
    estimate_high: Number.isFinite(+body.estimateHigh) ? Math.round(+body.estimateHigh) : null,

    status:      'new',
    followup:    'none',
    admin_notes: '',

    source_page: clean(body.pageUrl, 300),
    user_agent:  clean(request.headers.get('User-Agent') || '', 300)
  };

  if (!lead.name || !lead.phone || !lead.email || !lead.service) {
    return json({ error: 'Please fill in your name, phone, email and what you need.' }, 400);
  }
  if (!isEmail(lead.email)) {
    return json({ error: 'That email address does not look right.' }, 400);
  }

  /* ---- 1. store ---- */
  let stored = false;
  if (env.DB) {
    const cols = Object.keys(lead);
    try {
      await env.DB.prepare(
        `INSERT INTO leads (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
      ).bind(...cols.map((c) => lead[c])).run();
      stored = true;
    } catch (err) {
      console.log('Could not store lead:', err && err.message);
    }
  }

  /* ---- 2. notify ---- */
  // One branded, email-client-safe template builds both the HTML and the
  // plain-text parts. Reply-to is the visitor so Kristina can answer directly.
  const { subject, text, html } = buildQuoteEmail(env, lead);
  const alertTo = alertTarget(await loadSettings(env.DB), env, 'request');
  const mailProblem = alertTo
    ? await sendEmail(env, { to: alertTo, subject, text, html, replyTo: lead.email })
    : null;

  if (!stored && mailProblem) {
    console.log('Lead could not be stored or emailed:', mailProblem, '\n' + text);
    return json({
      error: 'This site is not finished taking messages yet. Please call or text instead.'
    }, 503);
  }

  // A new request belongs to somebody, and somewhere. Doing this at the door
  // means the manager with six Airbnbs is one customer from the first one,
  // rather than six rows that have to be untangled later.
  if (stored) {
    await noteSubmission(env, spam.ip, 'quote');
    try { await linkLead(env.DB, lead); }
    catch (err) { console.error('Could not link lead to a customer:', err && err.message || err); }
  }

  return json({ ok: true, id: lead.id, stored, emailed: !mailProblem });
}

export const onRequestGet = () =>
  new Response('Send this form with POST.', {
    status: 405, headers: { Allow: 'POST', 'Content-Type': 'text/plain' }
  });
