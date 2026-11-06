/**
 * GET /api/calendar/<token>  — her diary as a calendar her phone can follow.
 *
 * What this is: a subscription. Apple Calendar and Google Calendar fetch
 * this URL on their own schedule and show what it says. Apple is usually
 * quick; Google is often hours behind, and neither lets us control it.
 *
 * What this is NOT: synchronisation. Nothing her phone does comes back
 * here. Moving a cleaning in Apple Calendar changes nothing in the portal
 * and the next fetch puts it back. Blocking time has to be done in the
 * portal, which is why the portal says so next to the link.
 *
 * The token stands in for a login, because a calendar subscription cannot
 * carry a cookie. It is unguessable, it reveals customer names and
 * addresses to anyone who has it, and the portal can replace it.
 */
import { clean, safeEqual } from '../../_lib/util.js';
import { readSecret } from '../../_lib/settings.js';
import { expandBlock, spanOf, localDateOf, addDays, todayLocal } from '../../_lib/schedule.js';

const CRLF = '\r\n';

/* Commas, semicolons and newlines are structural in iCalendar. */
const esc = (v) => String(v == null ? '' : v)
  .replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,')
  .replace(/\r?\n/g, '\\n');

/* No line over 75 octets, continued with a leading space. */
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let cur = '';
  for (const ch of line) {
    const next = cur + ch;
    if (new TextEncoder().encode(next).length > 73) { out.push(cur); cur = ch; }
    else cur = next;
  }
  if (cur) out.push(cur);
  return out.join(CRLF + ' ');
}

const stampUtc = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const stampDate = (d) => String(d).replace(/-/g, '');

export async function onRequestGet({ request, params, env }) {
  const given = clean(params.token, 80);
  if (!given || !env.DB) return new Response('Not found', { status: 404 });

  const expected = await readSecret(env.DB, 'calendar_token');
  if (!expected || !safeEqual(given, expected)) {
    return new Response('Not found', { status: 404 });
  }

  /* A window, not everything: a phone does not need last year. */
  const from = addDays(todayLocal(), -30);
  const to = addDays(todayLocal(), 180);

  let appts = { results: [] };
  let blockRows = { results: [] };
  try {
    appts = await env.DB.prepare(
      `SELECT * FROM appointments
        WHERE archived_at IS NULL AND status != 'cancelled'
          AND ( (all_day = 0 AND start_at >= ? AND start_at <= ?)
             OR (all_day = 1 AND start_date >= ? AND start_date <= ?) )`
    ).bind(from + 'T00:00:00.000Z', to + 'T23:59:59.999Z', from, to).all();
    blockRows = await env.DB.prepare(
      'SELECT * FROM availability_blocks WHERE archived_at IS NULL'
    ).all();
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//Oasis Coastal Cleaning//Schedule//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Oasis Coastal Cleaning',
    'X-WR-TIMEZONE:America/New_York',
    /* A hint, not a promise: the client refreshes when it feels like it. */
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'
  ];

  const now = stampUtc(new Date().toISOString());

  const event = (uid, row, summary, description) => {
    const out = ['BEGIN:VEVENT', `UID:${uid}@oasiscoastalcleaning.com`, `DTSTAMP:${now}`];
    if (row.all_day) {
      out.push(`DTSTART;VALUE=DATE:${stampDate(row.start_date)}`);
      /* DTEND is exclusive for an all-day event. */
      out.push(`DTEND;VALUE=DATE:${stampDate(addDays(row.end_date || row.start_date, 1))}`);
    } else {
      out.push(`DTSTART:${stampUtc(row.start_at)}`);
      out.push(`DTEND:${stampUtc(row.end_at)}`);
    }
    out.push(`SUMMARY:${esc(summary)}`);
    if (description) out.push(`DESCRIPTION:${esc(description)}`);
    const where = [row.address, row.city, row.zip].filter(Boolean).join(', ');
    if (where) out.push(`LOCATION:${esc(where)}`);
    if (row.status === 'tentative') out.push('STATUS:TENTATIVE');
    out.push('END:VEVENT');
    return out;
  };

  for (const a of appts.results || []) {
    const title = a.customer_name || a.title || 'Cleaning';
    const detail = [a.service_label, a.phone ? 'Phone: ' + a.phone : '', a.notes]
      .filter(Boolean).join('\n');
    lines.push(...event('apt-' + a.id, a,
      a.status === 'tentative' ? title + ' (tentative)' : title, detail));
  }

  for (const b of blockRows.results || []) {
    for (const occ of expandBlock(b, from, to)) {
      if (!spanOf(occ)) continue;
      const when = occ.all_day ? occ.start_date : localDateOf(new Date(occ.start_at));
      if (when < from || when > to) continue;
      lines.push(...event('blk-' + occ.id, occ, occ.note || 'Unavailable', occ.address || ''));
    }
  }

  lines.push('END:VCALENDAR');

  return new Response(lines.map(fold).join(CRLF) + CRLF, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Disposition': 'inline; filename="oasis-schedule.ics"'
    }
  });
}
