/**
 * The quote as a document — the thing a customer prints, forwards to their
 * accountant, or keeps. Built with functions/_lib/pdf.js.
 *
 * Laid out the way the on-screen quote reads, so someone who saw one
 * recognises the other: who it is for, what it covers, what it comes to, and
 * how long it stands.
 */
import { Pdf, COLORS, PAGE, MARGIN, CONTENT_W, textWidth, wrapText } from './pdf.js';
import { formatMoney, cadenceById, isRecurring } from './quotes.js';
import { formatDate, formatPhone } from './format.js';

const COL = {
  item: MARGIN.left,
  qty: MARGIN.left + CONTENT_W - 150,
  amount: MARGIN.left + CONTENT_W - 90
};
const W = { item: CONTENT_W - 160, qty: 40, amount: 90 };

/** Small caps label, the same device the site uses. */
function label(doc, text, y, color = COLORS.teal) {
  doc.text(String(text).toUpperCase(), MARGIN.left, y, { size: 7.5, bold: true, color });
}

/* A band of brand colour across the top of the page, the way the on-screen
   quote opens. A quote that arrives looking like a receipt gets read like one. */
function header(doc, { logo, business, status, greeting, forWhat }) {
  const BAND = 92;
  const top = PAGE.h;

  doc.rect(0, top - BAND, PAGE.w, BAND, COLORS.teal);

  if (logo && logo.bytes) {
    const size = 50;
    doc.image(logo.bytes, MARGIN.left, top - 24 - size, size, size, logo.dims);
  }

  const textLeft = MARGIN.left + (logo && logo.bytes ? 66 : 0);
  const w = PAGE.w - textLeft - MARGIN.right;

  doc.text(business.name, textLeft, top - 42, { size: 14, bold: true, color: COLORS.cream });
  doc.text(business.tagline, textLeft, top - 56, { size: 8.5, color: COLORS.sand });
  doc.text(formatPhone(business.phone) + '    ' + business.email, textLeft, top - 72,
    { size: 8.5, color: COLORS.sand });

  doc.y = top - BAND - 24;

  if (greeting) {
    doc.text(greeting, MARGIN.left, doc.y, { size: 19, bold: true, color: COLORS.navy });
    doc.y -= 18;
  }
  if (forWhat) {
    doc.text(forWhat, MARGIN.left, doc.y, { size: 10, color: COLORS.muted });
    doc.y -= 18;
  }

  if (status && status !== 'sent') {
    doc.text(status.toUpperCase(), MARGIN.left, doc.y,
      { size: 8, bold: true, color: status === 'accepted' ? COLORS.teal : COLORS.muted });
    doc.y -= 16;
  }
}

/* The number they opened the document for, in a band of its own. */
function heroTotal(doc, { total, rhythm }) {
  const H = 68;
  doc.ensure(H + 16);
  const top = doc.y;
  doc.rect(MARGIN.left, top - H, CONTENT_W, H, COLORS.sand);

  doc.text(rhythm ? 'YOUR ' + rhythm.toUpperCase() + ' VISIT' : 'YOUR VISIT',
    MARGIN.left, top - 22, { size: 8, bold: true, color: COLORS.teal, align: 'center', width: CONTENT_W });
  doc.text(formatMoney(total), MARGIN.left, top - 48,
    { size: 25, bold: true, color: COLORS.navy, align: 'center', width: CONTENT_W });
  doc.text(rhythm ? 'Every visit. Pause or stop whenever you like.' : 'One visit, everything below included.',
    MARGIN.left, top - 60, { size: 9, color: COLORS.navy, align: 'center', width: CONTENT_W });

  doc.y = top - H - 20;
}

function lineItems(doc, items) {
  // Column headings, repeated whenever the table breaks onto a new page.
  const headings = () => {
    label(doc, 'Item', doc.y);
    doc.text('QTY', COL.qty, doc.y, { size: 7.5, bold: true, color: COLORS.teal, align: 'right', width: W.qty });
    doc.text('AMOUNT', COL.amount, doc.y, { size: 7.5, bold: true, color: COLORS.teal, align: 'right', width: W.amount });
    doc.y -= 8;
    doc.line(MARGIN.left, doc.y, MARGIN.left + CONTENT_W, doc.y, COLORS.line);
    doc.y -= 16;
  };

  headings();

  for (const item of items) {
    const nameLines = wrapText(item.label || '', 10.5, W.item, true);
    const noteLines = item.description ? wrapText(item.description, 9, W.item) : [];
    const cadence = isRecurring(item.cadence) ? cadenceById(item.cadence).label : '';
    const needed = nameLines.length * 14 + noteLines.length * 12 + (cadence ? 12 : 0) + 14;

    if (doc.ensure(needed)) { doc.y -= 6; headings(); }

    const rowTop = doc.y;
    nameLines.forEach((ln, i) => {
      doc.text(ln, COL.item, doc.y, { size: 10.5, bold: true, color: COLORS.navy });
      if (i < nameLines.length - 1) doc.y -= 13;
    });
    // Quantity and money sit against the first line of the name.
    doc.text(String(item.qty || 1), COL.qty, rowTop, { size: 10, color: COLORS.muted, align: 'right', width: W.qty });
    doc.text(formatMoney(item.total), COL.amount, rowTop, { size: 10.5, bold: true, color: COLORS.navy, align: 'right', width: W.amount });

    if (cadence) {
      doc.y -= 12;
      doc.text(cadence, COL.item, doc.y, { size: 8.5, bold: true, color: COLORS.teal });
    }
    for (const ln of noteLines) {
      doc.y -= 12;
      doc.text(ln, COL.item, doc.y, { size: 9, color: COLORS.muted });
    }

    doc.y -= 12;
    doc.line(MARGIN.left, doc.y, MARGIN.left + CONTENT_W, doc.y, COLORS.line, 0.5);
    doc.y -= 16;
  }
}

function totals(doc, quote) {
  doc.ensure(90);
  const right = MARGIN.left + CONTENT_W;

  const row = (name, value, { bold = false, size = 10 } = {}) => {
    doc.text(name, COL.qty - 120, doc.y, { size, bold, color: bold ? COLORS.navy : COLORS.muted, align: 'right', width: 160 });
    doc.text(formatMoney(value), COL.amount, doc.y, { size, bold, color: COLORS.navy, align: 'right', width: W.amount });
    doc.y -= size * 1.7;
  };

  row('Subtotal', quote.subtotal);
  if (Number(quote.tax) > 0) row('Tax', quote.tax);

  doc.y -= 2;
  doc.line(COL.qty - 120, doc.y + 8, right, doc.y + 8, COLORS.teal, 1.5);
  doc.y -= 8;

  doc.text('Total', COL.qty - 120, doc.y, { size: 13, bold: true, color: COLORS.navy, align: 'right', width: 160 });
  doc.text(formatMoney(quote.total), COL.amount, doc.y, { size: 14, bold: true, color: COLORS.teal, align: 'right', width: W.amount });
  doc.y -= 22;
}

function noteBox(doc, title, body) {
  if (!body) return;
  const inner = CONTENT_W - 28;
  const lines = wrapText(body, 9.5, inner);
  const height = lines.length * 13 + 30;
  doc.ensure(height + 10);

  const top = doc.y;
  doc.rect(MARGIN.left, top - height, CONTENT_W, height, COLORS.cream);
  doc.y = top - 18;
  doc.text(String(title).toUpperCase(), MARGIN.left + 14, doc.y, { size: 7.5, bold: true, color: COLORS.teal });
  doc.y -= 14;
  for (const ln of lines) {
    doc.text(ln, MARGIN.left + 14, doc.y, { size: 9.5, color: COLORS.navy });
    doc.y -= 13;
  }
  doc.y = top - height - 13;
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
  const items = quote.line_items || [];
  const repeating = items.find((it) => isRecurring(it.cadence));
  const rhythm = repeating ? cadenceById(repeating.cadence).short : '';

  const where = [lead.service_label || quote.service_label, lead.city || quote.city]
    .filter(Boolean).join(' in ');

  header(doc, {
    logo, business, status: quote.status,
    greeting: first ? 'Hi ' + first + ' — here is your quote' : 'Here is your quote',
    forWhat: [where, lead.address].filter(Boolean).join('  ·  ')
  });

  heroTotal(doc, { total: quote.total, rhythm });

  label(doc, 'What that covers', doc.y);
  doc.y -= 18;

  lineItems(doc, items);
  totals(doc, quote);

  if (quote.expires_at) {
    doc.text('Valid through ' + formatDate(quote.expires_at), MARGIN.left, doc.y,
      { size: 9.5, color: COLORS.muted });
    doc.y -= 24;
  }

  noteBox(doc, 'A note from ' + (settings.quote_from_name || 'Kristina').split(' ')[0], quote.notes);
  if (quote.terms) {
    doc.paragraph(quote.terms, { size: 9, color: COLORS.muted, gap: 9 });
  }

  /* One closing block rather than two. The panel and the sign-off were saying
     the same thing — here is how to say yes, here is how to reach me — and
     between them they pushed a four-line quote onto a second page. */
  const sending = quote.status === 'sent';
  const H = sending && proposalUrl ? 92 : 62;
  doc.ensure(H + 10);
  const top = doc.y;
  doc.rect(MARGIN.left, top - H, CONTENT_W, H, COLORS.cream);

  const x = MARGIN.left + 16;
  doc.y = top - 19;
  if (sending) {
    doc.text('READY WHEN YOU ARE', x, doc.y, { size: 8, bold: true, color: COLORS.teal });
    doc.y -= 15;
    doc.text('No contract, nothing to pay today, and the same person every visit.',
      x, doc.y, { size: 9.5, color: COLORS.navy });
    doc.y -= 14;
    if (proposalUrl) {
      doc.text('Say yes, or add an extra, here:', x, doc.y, { size: 9.5, color: COLORS.navy });
      doc.y -= 13;
      doc.text(proposalUrl, x, doc.y, { size: 8.5, bold: true, color: COLORS.teal });
      doc.y -= 16;
    }
  }
  doc.text(settings.quote_signoff || 'Thank you — Kristina', x, doc.y,
    { size: 10, bold: true, color: COLORS.navy });
  doc.y -= 13;
  doc.text(formatPhone(business.phone) + '    ' + business.email, x, doc.y,
    { size: 8.5, color: COLORS.muted });

  doc.y = top - H - 10;

  return doc.build();
}
