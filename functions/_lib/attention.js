/**
 * What is wrong with this contact right now.
 *
 * One module, because the record and the day screen must not disagree
 * about whether something is late. If the profile says an invoice is
 * overdue and Today does not, she stops trusting both.
 *
 * Overdue money leads. It is the item with a deadline somebody else is
 * counting, and it is the one that changes what she does next.
 *
 * Lateness is compared by calendar day, not by instant: work due at five
 * this afternoon must not read as overdue at six this evening, and a
 * list that cries wolf gets ignored.
 */
export const ATTENTION_LIMIT = 6;

export const TONES = ['overdue', 'waiting', 'info'];

const dayOf = (v) => String(v || '').slice(0, 10);

/** Is this date before today, by the day rather than the minute? */
export function isPastDay(value, today) {
  const d = dayOf(value);
  if (!d) return false;
  return d < dayOf(today || new Date().toISOString());
}

function moneyWords(cents) {
  const n = Number(cents) || 0;
  const v = (n / 100).toFixed(2);           // always two, or $1,500.50 reads as $1,500.5
  const dot = v.indexOf('.');
  return '$' + v.slice(0, dot).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + v.slice(dot);
}

/**
 * @param {object} data  { invoices, visits, issues }
 * @param {string} today ISO date
 * @returns {Array<{key,tone,title,detail}>}
 */
export function attentionFor(data, today) {
  const out = [];
  const now = today || new Date().toISOString();

  /* Money that is late, loudest first. */
  for (const i of (data && data.invoices) || []) {
    if (i.state === 'void' || i.state === 'paid' || !(i.balance > 0)) continue;
    if (i.due_date && isPastDay(i.due_date, now)) {
      out.push({ key: 'invoice:' + i.id, tone: 'overdue',
        title: moneyWords(i.balance) + ' overdue',
        /* The day, not a sentence: only the browser knows how the reader
           expects a date to read. */
        date: dayOf(i.due_date), detail: '' });
    }
  }

  /* Something the cleaner flagged that she has not yet dealt with. */
  for (const s of (data && data.issues) || []) {
    if (s.resolved_at) continue;
    out.push({
      key: 'issue:' + s.id,
      tone: s.severity === 'urgent' ? 'overdue' : 'waiting',
      title: s.severity === 'urgent' ? 'Urgent: ' + s.category_label : s.category_label,
      detail: s.approved_at ? 'They have been told' : 'Waiting on you'
    });
  }

  /* Money owed but not yet late: worth seeing, not worth alarming about. */
  for (const i of (data && data.invoices) || []) {
    if (i.state === 'void' || i.state === 'paid' || !(i.balance > 0)) continue;
    if (!i.due_date || !isPastDay(i.due_date, now)) {
      out.push({ key: 'owed:' + i.id, tone: 'waiting',
        title: moneyWords(i.balance) + ' outstanding', detail: 'Not yet due' });
    }
  }

  /* A regular with nothing in the diary. Only said for somebody who has
     actually been cleaned for -- on a brand new client it is a fact
     rather than a problem, and a strip that lights up for every new name
     teaches the eye to skip it. */
  const visits = (data && data.visits) || [];
  const done = visits.filter((v) => v.status !== 'cancelled' &&
    dayOf(v.start_at || v.start_date) < dayOf(now)).length;
  const ahead = visits.filter((v) => v.status !== 'cancelled' &&
    dayOf(v.start_at || v.start_date) >= dayOf(now)).length;
  if (done > 0 && ahead === 0) {
    out.push({ key: 'nothing-booked', tone: 'waiting',
      title: 'Nothing booked', detail: 'They have been before' });
  }

  const order = { overdue: 0, waiting: 1, info: 2 };
  out.sort((a, b) => order[a.tone] - order[b.tone]);
  return out.slice(0, ATTENTION_LIMIT);
}

/* ------------------------------------------------------------- standing

   Whether they are live in the book. Deliberately NOT whether their link
   works or whether they may book: a past client is still a client. It
   exists so her list can default to who is current without drowning in
   every one-time name she has ever cleaned for.

   Sixty days, because this work is seasonal and recurring. Somebody who
   has a deep clean each quarter is not lapsed because a month went by. */
export const ACTIVE_GRACE_DAYS = 60;

export function standingFor(data, today) {
  const d = data || {};
  if (d.closed_at) return 'past';         // she said so, which beats any signal

  const now = new Date(dayOf(today || new Date().toISOString()) + 'T00:00:00Z').getTime();
  const visits = d.visits || [];
  const ahead = visits.some((v) => v.status !== 'cancelled' &&
    dayOf(v.start_at || v.start_date) >= dayOf(today || new Date().toISOString()));
  const owing = (d.invoices || []).some((i) => i.state !== 'void' && i.balance > 0);
  const standing = (d.jobs || []).some((j) => j.status === 'open' || j.status === 'paused');
  if (ahead || owing || standing) return 'active';

  const stamps = []
    .concat(visits.map((v) => v.start_at || v.start_date))
    .concat((d.invoices || []).map((i) => i.created_at))
    .filter(Boolean)
    .map((v) => new Date(dayOf(v) + 'T00:00:00Z').getTime())
    .filter((t) => Number.isFinite(t));
  if (!stamps.length) return 'new';

  const last = Math.max(...stamps);
  const days = Math.floor((now - last) / 86400000);
  return days <= ACTIVE_GRACE_DAYS ? 'active' : 'past';
}

export const STANDING_WORDS = {
  new: { label: 'New', hint: 'Nothing has happened yet.' },
  active: { label: 'Active', hint: 'Live in the book.' },
  past: { label: 'Past', hint: 'A finished arrangement. Still a client, just not live.' }
};
