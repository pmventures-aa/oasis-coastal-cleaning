/**
 * The quote as a document — the thing a customer prints, forwards to their
 * accountant, or keeps. Built with functions/_lib/pdf.js.
 *
 * Laid out the way the on-screen quote reads, so someone who saw one
 * recognises the other: who it is for, what it covers, what it comes to, and
 * how long it stands.
 */
import { Pdf, COLORS, PAGE, MARGIN, CONTENT_W, textWidth, wrapText } from './pdf.js';
import { formatMoney } from './quotes.js';
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

function header(doc, { logo, business, status }) {
  let top = PAGE.h - MARGIN.top;

  if (logo && logo.bytes) {
    const size = 62;
    doc.image(logo.bytes, MARGIN.left, top - size, size, size, logo.dims);
  }

  const rightEdge = MARGIN.left + CONTENT_W;
  doc.text(business.name, rightEdge - 220, top - 12,
    { size: 13, bold: true, color: COLORS.navy, align: 'right', width: 220 });
  doc.text(business.tagline, rightEdge - 220, top - 26,
    { size: 8, color: COLORS.gold, align: 'right', width: 220 });
  doc.text(formatPhone(business.phone) + '   ' + business.email, rightEdge - 260, top - 42,
    { size: 8.5, color: COLORS.muted, align: 'right', width: 260 });

  doc.y = top - 78;
  doc.line(MARGIN.left, doc.y, rightEdge, doc.y, COLORS.gold, 1);
  doc.y -= 26;

  if (status && status !== 'sent') {
    doc.text(status.toUpperCase(), MARGIN.left, doc.y,
      { size: 8, bold: true, color: status === 'accepted' ? COLORS.teal : COLORS.muted });
    doc.y -= 14;
  }
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
    const needed = nameLines.length * 14 + noteLines.length * 12 + 14;

    if (doc.ensure(needed)) { doc.y -= 6; headings(); }

    const rowTop = doc.y;
    nameLines.forEach((ln, i) => {
      doc.text(ln, COL.item, doc.y, { size: 10.5, bold: true, color: COLORS.navy });
      if (i < nameLines.length - 1) doc.y -= 13;
    });
    // Quantity and money sit against the first line of the name.
    doc.text(String(item.qty || 1), COL.qty, rowTop, { size: 10, color: COLORS.muted, align: 'right', width: W.qty });
    doc.text(formatMoney(item.total), COL.amount, rowTop, { size: 10.5, bold: true, color: COLORS.navy, align: 'right', width: W.amount });

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
  doc.y -= 30;
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
  doc.y = top - height - 18;
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

  header(doc, { logo, business, status: quote.status });

  doc.text('Quote for ' + (quote.customer_name || lead.name || 'you'), MARGIN.left, doc.y,
    { size: 20, bold: true, color: COLORS.navy });
  doc.y -= 20;

  const where = [lead.service_label || quote.service_label, lead.city || quote.city]
    .filter(Boolean).join('  ·  ');
  if (where) {
    doc.text(where, MARGIN.left, doc.y, { size: 10, color: COLORS.muted });
    doc.y -= 16;
  }
  if (lead.address) {
    doc.text(lead.address, MARGIN.left, doc.y, { size: 9.5, color: COLORS.muted });
    doc.y -= 16;
  }
  doc.y -= 10;

  lineItems(doc, quote.line_items || []);
  totals(doc, quote);

  if (quote.expires_at) {
    doc.text('Valid through ' + formatDate(quote.expires_at), MARGIN.left, doc.y,
      { size: 9.5, color: COLORS.muted });
    doc.y -= 24;
  }

  noteBox(doc, 'A note from ' + (settings.quote_from_name || 'Kristina').split(' ')[0], quote.notes);
  if (quote.terms) {
    doc.paragraph(quote.terms, { size: 9, color: COLORS.muted, gap: 14 });
  }

  if (proposalUrl && quote.status === 'sent') {
    doc.ensure(40);
    doc.paragraph('Accept this quote online: ' + proposalUrl,
      { size: 9, color: COLORS.teal, gap: 8 });
  }

  // Sign-off and contact, on whatever page the document ended on.
  doc.ensure(50);
  doc.y -= 6;
  doc.line(MARGIN.left, doc.y, MARGIN.left + CONTENT_W, doc.y, COLORS.line);
  doc.y -= 18;
  doc.text(settings.quote_signoff || 'Thank you — Kristina', MARGIN.left, doc.y,
    { size: 10, bold: true, color: COLORS.navy });
  doc.y -= 14;
  doc.text(formatPhone(business.phone) + '   ' + business.email, MARGIN.left, doc.y,
    { size: 9, color: COLORS.muted });

  return doc.build();
}
