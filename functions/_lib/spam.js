/**
 * Keeping rubbish out of the quote form without a third-party key.
 *
 * Turnstile is good and stays supported, but it needs a secret Kristina has to
 * go and create, so until she does the form has nothing at all in front of it.
 * These three checks need nothing: a field a person never sees and a bot fills
 * in, the time between the page loading and the form being sent, and how many
 * requests one address has made in the last hour.
 *
 * All three fail open. A spam check that rejects a real customer because the
 * database hiccuped is worse than the spam.
 */

/** The name of the field that should always be empty. */
export const HONEYPOT = 'company';

/** Under this many seconds from page load to submit is not a person. */
const MIN_SECONDS = 4;

/** More than this from one address in an hour is not a person either. */
const MAX_PER_HOUR = 6;

export async function checkSubmission(env, request, body) {
  const reasons = [];

  // 1. The field nobody can see.
  if (String(body[HONEYPOT] || '').trim()) reasons.push('honeypot');

  // 2. Filled in impossibly fast.
  const started = Number(body.formStartedAt);
  if (Number.isFinite(started) && started > 0) {
    const seconds = (Date.now() - started) / 1000;
    if (seconds < MIN_SECONDS) reasons.push('too fast (' + seconds.toFixed(1) + 's)');
    if (seconds > 60 * 60 * 12) reasons.push('stale form');
  }

  // 3. Too many from one address.
  const ip = request.headers.get('cf-connecting-ip') || '';
  if (ip && env.DB) {
    try {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const row = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM submissions WHERE ip = ? AND created_at > ?'
      ).bind(ip, since).first();
      if (row && Number(row.n) >= MAX_PER_HOUR) reasons.push('rate limit');
    } catch { /* no table yet — let them through */ }
  }

  return { ok: reasons.length === 0, reasons, ip };
}

/** Records an accepted submission so the rate limit can see it. */
export async function noteSubmission(env, ip, kind = 'quote') {
  if (!env.DB || !ip) return;
  try {
    await env.DB.prepare(
      'INSERT INTO submissions (id, ip, created_at, kind) VALUES (?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), ip, new Date().toISOString(), kind).run();
    // Keep the table small; it only exists to answer "how many in the last hour".
    await env.DB.prepare(
      "DELETE FROM submissions WHERE created_at < ?"
    ).bind(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).run();
  } catch { /* no table yet */ }
}
