/**
 * POST /api/followup — the confirmation step, where they ask for a call or a
 * visit. Flags the lead that was just created and tells Kristina.
 */
import { json, clean, sendEmail } from '../_lib/util.js';
import { buildFollowupEmail } from '../_lib/email.js';

const KINDS = { call: 'a phone call', visit: 'an in-person walkthrough', text: 'a text message' };

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }

  const id = clean(body.id, 60);
  const kind = clean(body.kind, 20);
  if (!id || !KINDS[kind]) return json({ error: 'Unknown request.' }, 400);

  let name = '';
  if (env.DB) {
    try {
      const row = await env.DB.prepare('SELECT name FROM leads WHERE id = ?').bind(id).first();
      if (!row) return json({ error: 'That request was not found.' }, 404);
      name = row.name;
      await env.DB.prepare('UPDATE leads SET followup = ? WHERE id = ?').bind(kind, id).run();
    } catch (err) {
      console.log('Could not flag follow-up:', err && err.message);
    }
  }

  const { subject, text, html } = buildFollowupEmail(env, { name, kindLabel: KINDS[kind], id });
  await sendEmail(env, { subject, text, html });

  return json({ ok: true });
}
