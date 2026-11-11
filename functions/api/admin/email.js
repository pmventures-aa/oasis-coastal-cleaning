/**
 * GET  /api/admin/email?entity_kind=&entity_id=   — what has been sent about it
 * GET  /api/admin/email?customer_id=              — everything sent to a client
 * POST /api/admin/email                           — preview, or send and log
 *
 * One route for every customer letter, so there is one audit trail and one
 * renderer. The preview and the send call exactly the same builder: what she
 * reads before tapping Send is the letter that goes.
 *
 * Nothing here runs on a timer or a status change. A letter leaves only when
 * this route is called with send: true, and that only happens when she taps
 * the button.
 */
import { json, clean, newId, sendEmail, isEmail } from '../../_lib/util.js';
import { isSignedIn } from '../../_lib/auth.js';
import { ensureScheduleTables } from '../../_lib/schema.js';
import { loadSettings } from '../../_lib/settings.js';
import { buildManualEmail } from '../../_lib/email.js';

const SETUP = 'Apply migration 0012 in D1 → oasis → Console.';

/* Which letters exist, what each one is called on the button, and where its
   facts come from. The screen reads this rather than hard-coding a list. */
export const KINDS = {
  request_received:     { label: 'Send request received', entity: 'lead' },
  booking_confirmation: { label: 'Send booking confirmation', entity: 'appointment' },
  visit_reminder:       { label: 'Send reminder', entity: 'appointment' },
  on_my_way:            { label: 'Send on my way', entity: 'appointment' },
  visit_summary:        { label: 'Send summary & review', entity: 'appointment' }
};

const guard = async (request, env) => {
  if (!await isSignedIn(request, env)) return json({ error: 'Please sign in.' }, 401);
  if (!env.DB) return json({ error: 'No database connected.' }, 503);
  return null;
};

async function hasTable(db) {
  try { await db.prepare('SELECT 1 FROM email_log LIMIT 1').first(); return true; }
  catch { return ensureScheduleTables(db); }
}

/* The facts a letter needs, whichever screen it was sent from. */
async function loadContext(db, entityKind, entityId) {
  if (entityKind === 'lead') {
    const r = await db.prepare('SELECT * FROM leads WHERE id = ?').bind(entityId).first();
    if (!r) return null;
    return { to: r.email, customer_id: r.customer_id || null, row: r,
      ctx: { customer_name: r.name, service_label: r.service_label || r.service,
        address: r.address, city: r.city } };
  }
  if (entityKind === 'appointment') {
    const r = await db.prepare('SELECT * FROM appointments WHERE id = ?').bind(entityId).first();
    if (!r) return null;
    /* An appointment carries a copy of who and where, but not an email --
       that lives on the customer or the lead it came from. */
    let to = null, customerId = r.customer_id || null;
    if (customerId) {
      const c = await db.prepare('SELECT * FROM customers WHERE id = ?').bind(customerId).first();
      if (c) to = c.email;
    }
    if (!to && r.lead_id) {
      const l = await db.prepare('SELECT email, customer_id FROM leads WHERE id = ?').bind(r.lead_id).first();
      if (l) { to = l.email; customerId = customerId || l.customer_id || null; }
    }
    return { to, customer_id: customerId, row: r,
      ctx: { customer_name: r.customer_name, service_label: r.service_label,
        address: r.address, city: r.city, start_at: r.start_at, end_at: r.end_at } };
  }
  return null;
}

/* ------------------------------------------------------------------ read */
export async function onRequestGet({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  if (!await hasTable(env.DB)) {
    return json({ error: 'The email log is not set up yet.', setup: SETUP, needsSetup: true }, 503);
  }
  const url = new URL(request.url);
  const entityKind = clean(url.searchParams.get('entity_kind'), 30);
  const entityId = clean(url.searchParams.get('entity_id'), 60);
  const customerId = clean(url.searchParams.get('customer_id'), 60);

  try {
    const r = customerId
      ? await env.DB.prepare(
          'SELECT * FROM email_log WHERE customer_id = ? ORDER BY created_at DESC LIMIT 100'
        ).bind(customerId).all()
      : await env.DB.prepare(
          'SELECT * FROM email_log WHERE entity_kind = ? AND entity_id = ? ORDER BY created_at DESC LIMIT 50'
        ).bind(entityKind, entityId).all();
    return json({ ok: true, kinds: KINDS, sent: r.results || [] });
  } catch (err) {
    return json({ error: 'Could not read the email log.',
      detail: String(err && err.message || err) }, 503);
  }
}

/* --------------------------------------------------- preview, or send it */
export async function onRequestPost({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;
  if (!await hasTable(env.DB)) {
    return json({ error: 'The email log is not set up yet.', setup: SETUP, needsSetup: true }, 503);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }

  const kind = clean(body.kind, 40);
  if (!KINDS[kind]) return json({ error: 'There is no letter of that kind.' }, 400);

  const entityKind = clean(body.entity_kind, 30) || KINDS[kind].entity;
  const entityId = clean(body.entity_id, 60);
  if (!entityId) return json({ error: 'Which one?' }, 400);

  const found = await loadContext(env.DB, entityKind, entityId);
  if (!found) return json({ error: 'That is not here any more.' }, 404);

  const settings = await loadSettings(env.DB);
  const to = clean(body.to, 160) || found.to;

  const mail = buildManualEmail(env, kind, {
    ...found.ctx, settings,
    message: typeof body.message === 'string' ? body.message : undefined,
    subject: typeof body.subject === 'string' ? body.subject : undefined
  });
  if (!mail) return json({ error: 'That letter could not be written.' }, 400);

  /* The default: show her the letter and send nothing. A send has to be
     asked for explicitly, so a mis-tap cannot post anything to a customer. */
  if (body.send !== true) {
    return json({ ok: true, preview: true, to: to || '',
      subject: mail.subject, message: mail.message, html: mail.html,
      missing_email: !isEmail(to || '') });
  }

  if (!isEmail(to || '')) {
    return json({ error: to
      ? 'That email address does not look right.'
      : 'There is no email address on file for them. Add one, or copy the text and text it instead.' }, 400);
  }

  const now = new Date().toISOString();
  const id = 'eml-' + newId();
  /* sendEmail returns null when it went and a message when it did not. */
  let problem = null;
  try {
    problem = await sendEmail(env, { to, subject: mail.subject, html: mail.html, text: mail.text });
  } catch (err) {
    problem = String(err && err.message || err);
  }

  /* Logged either way, and never rewritten: a failure is a fact she needs
     as much as a success. */
  try {
    await env.DB.prepare(
      `INSERT INTO email_log (id, created_at, kind, entity_kind, entity_id,
         customer_id, to_email, subject, status, error, edited)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(id, now, kind, entityKind, entityId, found.customer_id || null,
      to, mail.subject, problem ? 'failed' : 'sent', problem || null,
      mail.edited ? 1 : 0).run();
  } catch (err) {
    console.error('Could not write the email log:', err);
  }

  if (problem) {
    return json({ error: 'It did not go out: ' + problem, logged: true, status: 'failed' }, 502);
  }
  return json({ ok: true, status: 'sent', sent_at: now, to, subject: mail.subject });
}
