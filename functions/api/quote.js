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
import { json, clean, cleanList, escapeHtml, isEmail, newId, verifyTurnstile, sendEmail }
  from '../_lib/util.js';

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

  // Honeypot — a real person never sees this field.
  if (clean(body.company)) return json({ ok: true, id: null });

  const ok = await verifyTurnstile(
    clean(body.turnstileToken, 2048),
    env.TURNSTILE_SECRET_KEY,
    request.headers.get('CF-Connecting-IP')
  );
  if (!ok) return json({ error: 'The “I am human” check did not pass. Try it once more.' }, 400);

  const lead = {
    id: newId(),
    created_at: new Date().toISOString(),

    name:         clean(body.name, 120),
    phone:        clean(body.phone, 40),
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
  const addOns = JSON.parse(lead.add_ons);
  const conds = JSON.parse(lead.conditions);
  const days = JSON.parse(lead.preferred_days);

  const rows = [
    ['Name', lead.name],
    ['Phone', lead.phone],
    ['Email', lead.email],
    ['Best time to reach', lead.best_time || '—'],
    ['Prefers', lead.contact_pref || '—'],
    ['Service', lead.service_label || lead.service],
    ['Property', lead.property_type || '—'],
    ['Size', lead.size_label || '—'],
    ['Bedrooms / baths', [lead.bedrooms, lead.bathrooms].filter(Boolean).join(' / ') || '—'],
    ['Frequency', lead.frequency || '—'],
    ['First visit', lead.first_visit ? 'Yes — deeper first clean' : 'No'],
    ['Add-ons', addOns.join(', ') || 'None'],
    ['About the home', conds.join(', ') || '—'],
    ['City', lead.city || '—'],
    ['ZIP', lead.zip || '—'],
    ['Address', lead.address || '—'],
    ['Wants to start', lead.start_when || '—'],
    ['Preferred days', days.join(', ') || '—'],
    ['Access', lead.access || '—'],
    ['Notes', lead.notes || '—']
  ];

  // Kristina works the leads in the portal, so the email carries a way back to it.
  const adminUrl = (env.SITE_URL || 'https://www.oasiscoastalcleaning.com').replace(/\/$/, '') + '/admin/';

  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n') +
               `\n\nOpen it in your portal: ${adminUrl}`;
  const html =
    `<h2 style="font-family:Georgia,serif;color:#094045;margin:0 0 4px">New quote request</h2>` +
    `<p style="font-family:Arial,sans-serif;font-size:13px;color:#6b7f81;margin:0 0 16px">` +
    `${escapeHtml(lead.name)} · ${escapeHtml(lead.city || 'South Florida')}</p>` +
    `<table style="font-family:Arial,sans-serif;font-size:14px;color:#094045;border-collapse:collapse">` +
    rows.map(([k, v]) =>
      `<tr><td style="padding:6px 14px 6px 0;color:#6b7f81;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td>` +
      `<td style="padding:6px 0"><strong>${escapeHtml(v)}</strong></td></tr>`
    ).join('') +
    `</table>` +
    `<p style="font-family:Arial,sans-serif;font-size:14px;margin:18px 0 0">` +
    `<a href="${escapeHtml(adminUrl)}" style="color:#02595F">Open this lead in your portal</a></p>` +
    `<p style="font-family:Arial,sans-serif;font-size:12px;color:#6b7f81;margin-top:10px">` +
    `Reply to this email to answer ${escapeHtml(lead.name)} directly.</p>`;

  const mailProblem = await sendEmail(env, {
    subject: `Quote request — ${lead.service_label || lead.service}${lead.city ? ' in ' + lead.city : ''}`,
    text, html, replyTo: lead.email
  });

  if (!stored && mailProblem) {
    console.log('Lead could not be stored or emailed:', mailProblem, '\n' + text);
    return json({
      error: 'This site is not finished taking messages yet. Please call or text instead.'
    }, 503);
  }

  return json({ ok: true, id: lead.id, stored, emailed: !mailProblem });
}

export const onRequestGet = () =>
  new Response('Send this form with POST.', {
    status: 405, headers: { Allow: 'POST', 'Content-Type': 'text/plain' }
  });
