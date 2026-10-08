/**
 * The quote as a document — the thing a customer prints, forwards to whoever
 * signs things off, or keeps. Built with functions/_lib/pdf.js.
 *
 * Laid out the way the on-screen quote reads, so someone who saw one
 * recognises the other: who it is for, what it covers, what it comes to, how
 * long it stands, and what happens next.
 *
 * The earlier version put everything in one flush-left column, which left a
 * third of the page empty down the right and another third empty at the
 * bottom, and gave the optional offer no container at all. It read like a
 * memo. This one uses the full measure: the reference block fills the right
 * of the title, every section sits in something, and the page ends with the
 * next step rather than trailing off.
 */
import { Pdf, COLORS, PAGE, MARGIN, CONTENT_W, textWidth, wrapText } from './pdf.js';
import { formatMoney, lineAmount, cadenceById, isRecurring } from './quotes.js';
import { formatDate, formatPhone } from './format.js';

const RIGHT = MARGIN.left + CONTENT_W;
const COL = { item: MARGIN.left, qty: RIGHT - 150, amount: RIGHT - 90 };
const W = { item: CONTENT_W - 170, qty: 40, amount: 90 };

/** Small caps label, the same device the site uses. */
function label(doc, text, y, color = COLORS.teal, x = MARGIN.left) {
  doc.text(String(text).toUpperCase(), x, y, { size: 7.5, bold: true, color });
}

/** A filled panel with a brand bar down its left edge. */
function panel(doc, top, height, fill = COLORS.cream, bar = COLORS.teal) {
  doc.rect(MARGIN.left, top - height, CONTENT_W, height, fill);
  if (bar) doc.rect(MARGIN.left, top - height, 3, height, bar);
}

/** A short, sayable reference. Nobody reads a 32-character id down the phone. */
export function quoteRef(quote) {
  const raw = String(quote.id || quote.token || '').replace(/[^a-zA-Z0-9]/g, '');
  return 'OCC-' + (raw.slice(-5) || '00000').toUpperCase();
}

/* ------------------------------------------------------------------ header */

function header(doc, { logo, business }) {
  const BAND = 96;
  const top = PAGE.h;
  doc.rect(0, top - BAND, PAGE.w, BAND, COLORS.teal);

  if (logo && logo.bytes) {
    const size = 52;
    doc.image(logo.bytes, MARGIN.left, top - 26 - size, size, size, logo.dims);
  }
  const x = MARGIN.left + (logo && logo.bytes ? 68 : 0);

  doc.text(business.name, x, top - 44, { size: 15, bold: true, color: COLORS.cream });
  if (business.tagline) {
    doc.text(business.tagline, x, top - 59, { size: 8.5, color: COLORS.sand });
  }
  doc.text(formatPhone(business.phone) + '    ' + business.email, x, top - 75,
    { size: 8.5, color: COLORS.sand });

  doc.y = top - BAND - 24;
}

/* The title on the left, the reference block on the right. The right column
   used to be empty for the whole height of the document. */
function titleRow(doc, { greeting, forWhat, ref, prepared, expires, status }) {
  const top = doc.y;
  const metaW = 150;
  const metaX = RIGHT - metaW;
  const leftW = CONTENT_W - metaW - 24;

  const gLines = wrapText(greeting, 19, leftW, true);
  let y = top;
  for (const ln of gLines) {
    doc.text(ln, MARGIN.left, y, { size: 19, bold: true, color: COLORS.navy });
    y -= 22;
  }
  if (forWhat) {
    for (const ln of wrapText(forWhat, 10, leftW)) {
      doc.text(ln, MARGIN.left, y, { size: 10, color: COLORS.muted });
      y -= 13;
    }
  }

  // Reference block, right-aligned, each row a label over a value.
  let my = top;
  const row = (k, v, strong) => {
    if (!v) return;
    doc.text(String(k).toUpperCase(), metaX, my, { size: 6.5, bold: true, color: COLORS.muted, align: 'right', width: metaW });
    my -= 11;
    doc.text(String(v), metaX, my, {
      size: strong ? 10 : 9, bold: true,
      color: strong ? COLORS.teal : COLORS.navy, align: 'right', width: metaW
    });
    my -= 15;
  };
  row('Quote', ref, true);
  row('Prepared', prepared);
  row('Valid until', expires);
  if (status && status !== 'sent') row('Status', status.toUpperCase());

  doc.y = Math.min(y, my) - 4;
}

/* ------------------------------------------------------------------- hero */

function heroTotal(doc, { total, rhythm, covers }) {
  const H = 66;
  doc.ensure(H + 12);
  const top = doc.y;
  doc.rect(MARGIN.left, top - H, CONTENT_W, H, COLORS.sand);
  doc.rect(MARGIN.left, top - 3, CONTENT_W, 3, COLORS.teal);

  doc.text(rhythm ? 'YOUR ' + rhythm.toUpperCase() + ' VISIT' : 'YOUR VISIT',
    MARGIN.left, top - 23, { size: 8, bold: true, color: COLORS.teal, align: 'center', width: CONTENT_W });
  doc.text(formatMoney(total), MARGIN.left, top - 48,
    { size: 28, bold: true, color: COLORS.navy, align: 'center', width: CONTENT_W });
  doc.text(covers || (rhythm ? 'Every visit. Pause or stop whenever you like.' : 'One visit, everything below included.'),
    MARGIN.left, top - 60, { size: 9, color: COLORS.navy, align: 'center', width: CONTENT_W });

  doc.y = top - H - 16;
}

/* ------------------------------------------------------------------ items */

function lineItems(doc, items) {
  const headings = () => {
    label(doc, 'What this covers', doc.y);
    doc.text('QTY', COL.qty, doc.y, { size: 7, bold: true, color: COLORS.muted, align: 'right', width: W.qty });
    doc.text('AMOUNT', COL.amount, doc.y, { size: 7, bold: true, color: COLORS.muted, align: 'right', width: W.amount });
    doc.y -= 9;
    doc.line(MARGIN.left, doc.y, RIGHT, doc.y, COLORS.teal, 1.2);
    doc.y -= 17;
  };

  headings();

  items.forEach((item, i) => {
    const nameLines = wrapText(item.label || '', 10.5, W.item, true);
    const noteLines = item.description ? wrapText(item.description, 8.8, W.item) : [];
    const cadence = isRecurring(item.cadence) ? cadenceById(item.cadence).label : '';
    const needed = nameLines.length * 14 + noteLines.length * 11.5 + (cadence ? 12 : 0) + 16;

    if (doc.ensure(needed)) { doc.y -= 6; headings(); }

    const rowTop = doc.y;
    nameLines.forEach((ln, j) => {
      doc.text(ln, COL.item, doc.y, { size: 10.5, bold: true, color: COLORS.navy });
      if (j < nameLines.length - 1) doc.y -= 13;
    });
    doc.text(String(item.qty || 1), COL.qty, rowTop, { size: 9.5, color: COLORS.muted, align: 'right', width: W.qty });
    // A line she has priced at nothing is one she is throwing in. Saying
    // "$0.00" makes a gift look like an unfinished quote.
    const zero = Number(item.total) === 0;
    doc.text(lineAmount(item.total), COL.amount, rowTop,
      { size: zero ? 9 : 10.5, bold: true, color: zero ? COLORS.teal : COLORS.navy, align: 'right', width: W.amount });

    if (cadence) {
      doc.y -= 12;
      doc.text(cadence, COL.item, doc.y, { size: 8, bold: true, color: COLORS.teal });
    }
    for (const ln of noteLines) {
      doc.y -= 11.5;
      doc.text(ln, COL.item, doc.y, { size: 8.8, color: COLORS.muted });
    }

    doc.y -= 13;
    if (i < items.length - 1) {
      doc.line(MARGIN.left, doc.y, RIGHT, doc.y, COLORS.line, 0.5);
      doc.y -= 15;
    }
  });
}

function totals(doc, quote) {
  doc.ensure(76);
  doc.y -= 4;
  doc.line(MARGIN.left, doc.y, RIGHT, doc.y, COLORS.line, 0.75);
  doc.y -= 18;

  const kX = RIGHT - 260;
  const row = (name, value, { bold = false, size = 9.5 } = {}) => {
    doc.text(name, kX, doc.y, { size, bold, color: COLORS.muted, align: 'right', width: 160 });
    doc.text(formatMoney(value), COL.amount, doc.y, { size, bold, color: COLORS.navy, align: 'right', width: W.amount });
    doc.y -= size * 1.8;
  };

  row('Subtotal', quote.subtotal);
  if (Number(quote.tax) > 0) row('Tax', quote.tax);

  doc.y -= 2;
  doc.line(kX, doc.y + 9, RIGHT, doc.y + 9, COLORS.teal, 1.5);
  doc.y -= 9;
  doc.text('Total', kX, doc.y, { size: 12.5, bold: true, color: COLORS.navy, align: 'right', width: 160 });
  doc.text(formatMoney(quote.total), COL.amount, doc.y, { size: 14, bold: true, color: COLORS.teal, align: 'right', width: W.amount });
  doc.y -= 16;
}

/* -------------------------------------------------------- optional offer */

function laterOn(doc, items) {
  if (!items.length) return;

  const rows = items.map((it) => ({
    it,
    name: wrapText(it.label || '', 10.5, W.item - 20, true),
    note: it.description ? wrapText(it.description, 8.8, W.item - 20) : []
  }));
  const body = rows.reduce((h, r) => h + r.name.length * 14 + r.note.length * 11.5 + 14, 0);
  const H = body + 44;

  doc.ensure(H + 16);
  const top = doc.y;
  panel(doc, top, H, COLORS.cream, COLORS.gold);

  const x = MARGIN.left + 16;
  doc.text('AFTERWARDS, IF YOU WOULD LIKE', x, top - 19, { size: 7.5, bold: true, color: COLORS.gold });
  doc.text('Optional. Not part of the total above, and nothing to decide today.',
    x, top - 32, { size: 8.5, color: COLORS.muted });

  let y = top - 50;
  for (const r of rows) {
    const every = isRecurring(r.it.cadence) ? cadenceById(r.it.cadence).short : 'per visit';
    r.name.forEach((ln, i) => {
      doc.text(ln, x, y, { size: 10.5, bold: true, color: COLORS.navy });
      if (i < r.name.length - 1) y -= 13;
    });
    doc.text(lineAmount(r.it.unit_price != null ? r.it.unit_price : r.it.total),
      COL.amount, y, { size: 11, bold: true, color: COLORS.gold, align: 'right', width: W.amount });
    doc.text(every, COL.amount, y - 11, { size: 7, bold: true, color: COLORS.muted, align: 'right', width: W.amount });
    y -= 13;
    for (const ln of r.note) { doc.text(ln, x, y, { size: 8.8, color: COLORS.muted }); y -= 11.5; }
    y -= 10;
  }

  doc.y = top - H - 12;
}

/* ------------------------------------------------------------------- note */

function noteBox(doc, title, body) {
  if (!body) return;
  const inner = CONTENT_W - 34;
  const lines = wrapText(body, 9.3, inner);
  const H = lines.length * 12.2 + 30;
  doc.ensure(H + 14);

  const top = doc.y;
  panel(doc, top, H, COLORS.cream, COLORS.teal);
  const x = MARGIN.left + 17;

  doc.text(String(title).toUpperCase(), x, top - 19, { size: 7.5, bold: true, color: COLORS.teal });
  let y = top - 32;
  for (const ln of lines) { doc.text(ln, x, y, { size: 9.3, color: COLORS.navy }); y -= 12.2; }
  doc.y = top - H - 12;
}

/* ------------------------------------------------- what happens next + close
   These were two blocks and between them they filled most of a second page
   with white space, which reads as a document that ran out rather than one
   that finished. One panel: the three steps, the link, the sign-off. */

function closing(doc, { sending, proposalUrl, signoff }) {
  const steps = sending
    ? [['1', 'Say yes', 'open the link below and tap accept'],
       ['2', 'We agree a date', 'Kristina texts you to find a time'],
       ['3', 'We clean', 'payment is due once the work is done']]
    : [['1', 'Have a look', 'anything you would like changed, just say'],
       ['2', 'We agree a date', 'Kristina texts you to find a time'],
       ['3', 'We clean', 'payment is due once the work is done']];

  const linkLines = sending && proposalUrl ? wrapText(proposalUrl, 8.3, CONTENT_W - 34, true) : [];
  const linkH = linkLines.length ? 8 + linkLines.length * 10.5 : 0;
  const full = 28 + steps.length * 14 + linkH + 18;
  const compact = 28 + linkH + 18;

  /* Rather than push a 130pt panel onto a page of its own and leave the reader
     holding a sheet that is seven-eighths white, drop the three steps when the
     room is not there. The link and the sign-off are the part that has to
     survive; the steps are reassurance. */
  const roomy = doc.remaining >= full + 12;
  const showSteps = roomy;
  const H = roomy ? full : compact;
  if (doc.remaining < H + 12) doc.ensure(H + 12);
  const top = doc.y;
  panel(doc, top, H, COLORS.sand, COLORS.teal);
  const x = MARGIN.left + 17;

  doc.text(sending ? 'READY WHEN YOU ARE' : 'WHAT HAPPENS NEXT', x, top - 19,
    { size: 7.5, bold: true, color: COLORS.teal });

  let y = top - 34;
  for (const [n, head, tail] of (showSteps ? steps : [])) {
    doc.rect(x, y - 3, 13, 13, COLORS.teal);
    doc.text(n, x, y, { size: 7.5, bold: true, color: COLORS.cream, align: 'center', width: 13 });
    doc.text(head, x + 19, y, { size: 9, bold: true, color: COLORS.navy });
    doc.text('— ' + tail, x + 19 + textWidth(head, 9, true) + 5, y, { size: 9, color: COLORS.muted });
    y -= 14;
  }

  if (linkLines.length) {
    y -= 4;
    for (const ln of linkLines) {
      doc.text(ln, x, y, { size: 8.3, bold: true, color: COLORS.teal });
      y -= 10.5;
    }
  }

  y -= 4;
  doc.text(signoff || 'Thank you — Kristina', x, y, { size: 10, bold: true, color: COLORS.navy });

  doc.y = top - H - 10;
}

/* Footers are stamped once the page count is known, so a two-page quote can
   say which page you are holding. */
function stampFooters(doc, { ref, business }) {
  const keep = doc.ops;
  const total = doc.pages.length;
  doc.pages.forEach((page, i) => {
    doc.ops = page.ops;
    const y = MARGIN.bottom - 24;
    doc.line(MARGIN.left, y + 16, RIGHT, y + 16, COLORS.line, 0.5);
    doc.text(business.name + '  ·  ' + ref, MARGIN.left, y, { size: 7.5, color: COLORS.muted });
    doc.text('Page ' + (i + 1) + ' of ' + total, MARGIN.left, y,
      { size: 7.5, color: COLORS.muted, align: 'right', width: CONTENT_W });
  });
  doc.ops = keep;
}

/**
 * @param quote     the row, with line_items already parsed
 * @param lead      who and where it is for
 * @param business  name, tagline, phone, email
 * @param logo      { bytes, dims:{width,height} } — optional
 * @param settings  quote_signoff and friends
 */
export function buildQuotePdf({ quote, lead = {}, business, logo, settings = {}, proposalUrl }) {
  const doc = new Pdf({
    title: 'Quote for ' + (quote.customer_name || lead.name || 'you'),
    author: business.name
  });

  const first = String(quote.customer_name || lead.name || '').split(' ')[0];
  const allItems = quote.line_items || [];
  const items = allItems.filter((it) => !it.optional);
  const optionalItems = allItems.filter((it) => it.optional);
  // The hero's rhythm describes what is being charged, so an optional
  // recurring offer must not relabel a one-off clean as a repeating visit.
  const repeating = items.find((it) => isRecurring(it.cadence));
  const rhythm = repeating ? cadenceById(repeating.cadence).short : '';
  const ref = quoteRef(quote);
  const sending = quote.status === 'sent';

  header(doc, { logo, business });

  titleRow(doc, {
    greeting: first ? 'Quote for ' + first : 'Your quote',
    forWhat: [
      [lead.service_label || quote.service_label, lead.city || quote.city].filter(Boolean).join(' in '),
      lead.address
    ].filter(Boolean).join('  ·  '),
    ref,
    prepared: formatDate(quote.sent_at || quote.created_at || new Date().toISOString()),
    expires: quote.expires_at ? formatDate(quote.expires_at) : '',
    status: quote.status
  });

  heroTotal(doc, { total: quote.total, rhythm });

  lineItems(doc, items);
  totals(doc, quote);
  laterOn(doc, optionalItems);

  noteBox(doc, 'A note from ' + (settings.quote_from_name || 'Kristina').split(' ')[0], quote.notes);
  if (quote.terms) doc.paragraph(quote.terms, { size: 8.5, color: COLORS.muted, gap: 9 });

  closing(doc, {
    sending, proposalUrl,
    signoff: settings.quote_signoff || 'Thank you — Kristina'
  });

  stampFooters(doc, { ref, business });
  return doc.build();
}
