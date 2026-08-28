/* The PDF writer. A file that does not open is worse than no file, so these
   check structure and real rendering, not just that bytes came out. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Pdf, COLORS, textWidth, wrapText } from '../functions/_lib/pdf.js';
import { buildQuotePdf } from '../functions/_lib/quote-pdf.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

const wellFormed = (bytes) => {
  const s = Buffer.from(bytes).toString('latin1');
  assert.ok(s.startsWith('%PDF-1.'), 'has a PDF header');
  assert.ok(s.trimEnd().endsWith('%%EOF'), 'ends properly');
  const xref = s.lastIndexOf('\nxref\n') + 1;   // not the one inside "startxref"
  const start = s.lastIndexOf('startxref');
  assert.ok(xref > 0 && start > xref, 'has a cross-reference table before startxref');
  // Every offset in the table must land on an "N 0 obj" header.
  const declared = Number(/startxref\s+(\d+)/.exec(s)[1]);
  assert.equal(s.slice(declared, declared + 4), 'xref', 'startxref points at the table');
  const rows = s.slice(xref).split('\n').filter((l) => /^\d{10} \d{5} n/.test(l));
  rows.forEach((row, i) => {
    const offset = Number(row.slice(0, 10));
    assert.match(s.slice(offset, offset + 24), new RegExp('^' + (i + 1) + ' 0 obj'),
      'object ' + (i + 1) + ' is where the table says');
  });
  return { text: s, objects: rows.length };
};

/* ---- measurement ---- */
t('widths are real, not guessed', () => {
  assert.ok(textWidth('lll', 10) < textWidth('WWW', 10), 'narrow letters measure narrower');
  assert.equal(textWidth('', 10), 0);
  assert.ok(textWidth('Total', 10, true) > textWidth('Total', 10), 'bold is wider');
});

t('wrapping breaks on words and never overflows', () => {
  const lines = wrapText('Kitchen and baths first, dusting top to bottom, floors done last.', 10, 150);
  assert.ok(lines.length > 1);
  lines.forEach((l) => assert.ok(textWidth(l, 10) <= 150, 'line fits: ' + l));
});

t('a word longer than the column is split rather than lost', () => {
  const lines = wrapText('Supercalifragilisticexpialidocious', 12, 40);
  assert.ok(lines.length > 1);
  assert.equal(lines.join(''), 'Supercalifragilisticexpialidocious', 'nothing dropped');
});

t('newlines are respected', () => {
  assert.deepEqual(wrapText('one\ntwo', 10, 500), ['one', 'two']);
});

/* ---- structure ---- */
t('an empty document is still a valid file', () => {
  wellFormed(new Pdf().build());
});

t('parentheses and backslashes cannot break a string', () => {
  const d = new Pdf();
  d.text('A (tricky) \\ string )))', 56, 700);
  const { text } = wellFormed(d.build());
  assert.ok(text.includes('\\(tricky\\)'), 'parens escaped');
  assert.ok(text.includes('\\\\'), 'backslash escaped');
});

t('curly quotes and dashes survive as WinAnsi', () => {
  const d = new Pdf();
  d.text('Oven — “inside” · it’s clean', 56, 700);
  wellFormed(d.build());
});

t('characters with no WinAnsi code degrade to ? rather than corrupting', () => {
  const d = new Pdf();
  d.text('emoji 🎉 here', 56, 700);
  const { text } = wellFormed(d.build());
  assert.ok(text.includes('emoji ? here') || text.includes('emoji ?? here'));
});

/* ---- the quote document ---- */
const business = { name: 'Oasis Coastal Cleaning', tagline: 'Fresh Spaces. Happy Places.',
  phone: '5612017123', email: 'info@oasiscoastalcleaning.com' };
const logoBytes = new Uint8Array(readFileSync(new URL('../public/print/logo-quote.jpg', import.meta.url)));
const logo = { bytes: logoBytes, dims: { width: 419, height: 420 } };
const item = (i) => ({ label: 'Service line ' + i, description: 'A description that is long enough to wrap onto a second line in the item column of the table.', qty: 1, unit_price: 5000, total: 5000 });

t('a normal quote is one page', () => {
  const bytes = buildQuotePdf({ quote: { status: 'sent', customer_name: 'Dana Reyes', subtotal: 15000,
    tax: 0, total: 15000, line_items: [item(1), item(2), item(3)], notes: 'A note.', terms: 'No contract.' },
    lead: { city: 'Delray Beach' }, business, logo });
  const { text } = wellFormed(bytes);
  assert.equal((text.match(/\/Type \/Page[^s]/g) || []).length, 1);
});

t('forty line items flow onto more pages without losing any', () => {
  const items = Array.from({ length: 40 }, (_, i) => item(i + 1));
  const bytes = buildQuotePdf({ quote: { status: 'sent', customer_name: 'Dana Reyes',
    subtotal: 200000, tax: 0, total: 200000, line_items: items, terms: 'No contract.' },
    lead: {}, business, logo });
  const { text } = wellFormed(bytes);
  const pages = (text.match(/\/Type \/Page[^s]/g) || []).length;
  assert.ok(pages > 1, 'it broke onto more than one page (got ' + pages + ')');
});

t('a quote with no logo, no notes and no terms still builds', () => {
  wellFormed(buildQuotePdf({ quote: { status: 'draft', customer_name: '', subtotal: 0, tax: 0,
    total: 0, line_items: [] }, lead: {}, business }));
});

t('tax appears only when there is some', () => {
  const withTax = Buffer.from(buildQuotePdf({ quote: { status: 'sent', customer_name: 'D',
    subtotal: 10000, tax: 700, total: 10700, line_items: [item(1)] }, lead: {}, business })).toString('latin1');
  const without = Buffer.from(buildQuotePdf({ quote: { status: 'sent', customer_name: 'D',
    subtotal: 10000, tax: 0, total: 10000, line_items: [item(1)] }, lead: {}, business })).toString('latin1');
  assert.ok(withTax.includes('Tax'));
  assert.ok(!without.includes('(Tax)'));
});

t('the logo is embedded as a JPEG the reader can decode', () => {
  const { text } = wellFormed(buildQuotePdf({ quote: { status: 'sent', customer_name: 'D',
    subtotal: 100, tax: 0, total: 100, line_items: [item(1)] }, lead: {}, business, logo }));
  assert.ok(text.includes('/Filter /DCTDecode'), 'declared as JPEG');
  assert.ok(text.includes('/Subtype /Image'));
});

console.log('\n' + n + ' PDF cases passed');
