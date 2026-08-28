/**
 * A PDF writer, written here rather than installed.
 *
 * Cloudflare Workers have no headless browser, and this project has no build
 * step, so there is nowhere to put a PDF library. PDF is a text format with a
 * binary wrapper, and a quote needs a small part of it: text in two weights,
 * rules, filled boxes, one image, and pages that flow when the line items run
 * long. That part is written below.
 *
 * What it deliberately does NOT do: custom fonts, transparency, vector paths
 * beyond rectangles. Great Vibes and Cinzel would each need a full embedded
 * font programme; the brand carries through the logo and the colour instead.
 *
 * Everything is measured with the real Adobe metrics for Helvetica, which is
 * what lets text wrap at the right place and money line up on its right edge.
 */

const W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,222,222,333,333,350,556,1000,556,556,556,556,556,556,556,556,278,556,556,556,556,556,556,556,556,737,556,556,556,556,737,556,400,556,556,556,556,556,556,350,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,584,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556,556];
const W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,278,278,500,500,350,556,1000,611,611,611,611,611,611,611,611,278,611,611,611,611,611,611,611,611,737,611,611,611,611,737,611,400,611,611,611,611,611,611,350,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,584,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611,611];

const PT = 1;
const PAGE = { w: 612, h: 792 };            // US Letter, in points
const MARGIN = { top: 56, right: 56, bottom: 64, left: 56 };
const CONTENT_W = PAGE.w - MARGIN.left - MARGIN.right;

/* Brand colours, as PDF wants them: three numbers from 0 to 1. */
const RGB = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
};
export const COLORS = {
  teal: RGB('#02595F'), navy: RGB('#094045'), gold: RGB('#C89C53'),
  muted: RGB('#5A7174'), line: RGB('#DCE3E3'), sand: RGB('#F5D9B9'),
  cream: RGB('#FBF9F3'), white: [1, 1, 1], black: [0, 0, 0]
};

/* ------------------------------------------------------------ text encoding
   PDF strings here are WinAnsi. The characters this site actually uses beyond
   ASCII — the em dash, the curly quotes, the middot — have WinAnsi codes, so
   they are mapped rather than stripped. Anything else becomes a question mark,
   which is honest about what happened. */
const WINANSI = {
  0x2013: 150, 0x2014: 151, 0x2018: 145, 0x2019: 146, 0x201C: 147, 0x201D: 148,
  0x2022: 149, 0x00B7: 183, 0x00A0: 32, 0x2026: 133, 0x00E9: 233, 0x00A9: 169,
  0x00AE: 174, 0x00B0: 176, 0x00BD: 189, 0x00BC: 188
};
function toWinAnsi(text) {
  const out = [];
  for (const ch of String(text == null ? '' : text)) {
    const c = ch.codePointAt(0);
    if (c >= 32 && c <= 126) out.push(c);
    else if (WINANSI[c] !== undefined) out.push(WINANSI[c]);
    else if (c >= 160 && c <= 255) out.push(c);
    else out.push(63);                       // '?'
  }
  return out;
}

/** Escapes the three characters that end a PDF string early. */
function pdfString(text) {
  return toWinAnsi(text)
    .map((c) => (c === 40 || c === 41 || c === 92 ? '\\' + String.fromCharCode(c)
      : c < 32 || c > 126 ? '\\' + c.toString(8).padStart(3, '0')
      : String.fromCharCode(c)))
    .join('');
}

/** Width of a string at a size, in points. The whole layout depends on this. */
export function textWidth(text, size, bold = false) {
  const widths = bold ? W_BOLD : W_REG;
  let total = 0;
  for (const code of toWinAnsi(text)) {
    total += (code >= 32 && code <= 255 ? widths[code - 32] : 556) || 556;
  }
  return total * size / 1000;
}

/** Breaks text into lines that fit, splitting over-long words rather than
    letting them run off the page. */
export function wrapText(text, size, maxWidth, bold = false) {
  const paragraphs = String(text == null ? '' : text).split(/\n/);
  const lines = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let line = '';
    for (const word of words) {
      const candidate = line ? line + ' ' + word : word;
      if (textWidth(candidate, size, bold) <= maxWidth) { line = candidate; continue; }
      if (line) { lines.push(line); line = ''; }
      if (textWidth(word, size, bold) <= maxWidth) { line = word; continue; }
      let chunk = '';
      for (const ch of word) {
        if (textWidth(chunk + ch, size, bold) > maxWidth && chunk) { lines.push(chunk); chunk = ''; }
        chunk += ch;
      }
      line = chunk;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/* ========================================================== the document
   Pages are built as content streams, then assembled with a cross-reference
   table at the end. Byte offsets in that table must be exact or the file will
   not open, so the whole thing is assembled as bytes, not as a string. */

export class Pdf {
  constructor(meta = {}) {
    this.meta = meta;
    this.pages = [];
    this.images = [];              // { name, data, width, height }
    this.newPage();
  }

  newPage() {
    this.ops = [];
    this.page = { ops: this.ops };
    this.pages.push(this.page);
    this.y = PAGE.h - MARGIN.top;
    return this.page;
  }

  /** Vertical space left before the bottom margin. */
  get remaining() { return this.y - MARGIN.bottom; }

  /** Starts a new page when `need` points will not fit. Returns true if it did. */
  ensure(need) {
    if (this.remaining >= need) return false;
    this.newPage();
    return true;
  }

  setFill(color) {
    this.ops.push(`${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} rg`);
  }
  setStroke(color) {
    this.ops.push(`${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} RG`);
  }

  /** One line of text at an absolute position. */
  text(str, x, y, { size = 10, bold = false, color = COLORS.navy, align = 'left', width = 0 } = {}) {
    const w = textWidth(str, size, bold);
    let tx = x;
    if (align === 'right') tx = x + width - w;
    else if (align === 'center') tx = x + (width - w) / 2;
    this.setFill(color);
    this.ops.push('BT', `/${bold ? 'FB' : 'FR'} ${size} Tf`,
      `1 0 0 1 ${tx.toFixed(2)} ${y.toFixed(2)} Tm`, `(${pdfString(str)}) Tj`, 'ET');
    return w;
  }

  /** Wrapped text flowing down the page, breaking across pages as needed. */
  paragraph(str, { size = 10, bold = false, color = COLORS.navy, leading = 1.45,
                   x = MARGIN.left, width = CONTENT_W, gap = 0 } = {}) {
    const step = size * leading;
    for (const line of wrapText(str, size, width, bold)) {
      this.ensure(step);
      this.y -= step;
      if (line) this.text(line, x, this.y, { size, bold, color });
    }
    this.y -= gap;
  }

  rect(x, y, w, h, color) {
    this.setFill(color);
    this.ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }

  line(x1, y1, x2, y2, color = COLORS.line, thickness = 0.75) {
    this.setStroke(color);
    this.ops.push(`${thickness} w`, `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  /** Places a baseline JPEG. PDF takes the bytes as they are — DCTDecode is
      the JPEG decoder — which is why the logo is a JPEG and not the PNG. */
  image(bytes, x, y, w, h, dims) {
    const name = 'Im' + (this.images.length + 1);
    this.images.push({ name, data: bytes, width: dims.width, height: dims.height });
    this.ops.push('q', `${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm`,
      `/${name} Do`, 'Q');
    return name;
  }

  /** The finished file. */
  build() {
    const enc = new TextEncoder();
    const chunks = [];
    let length = 0;
    const push = (data) => {
      const bytes = typeof data === 'string' ? enc.encode(data) : data;
      chunks.push(bytes);
      length += bytes.length;
      return length;
    };

    const objects = [];                       // 1-based; objects[i] = offset
    const reserve = () => objects.push(0) ;   // returns new length
    const begin = (num) => { objects[num - 1] = length; push(`${num} 0 obj\n`); };
    const end = () => push('endobj\n');

    // Object numbering, fixed up front so references can be written eagerly.
    const nCatalog = 1, nPages = 2, nFontR = 3, nFontB = 4;
    let next = 5;
    const pageNums = this.pages.map(() => ({ page: next++, content: next++ }));
    const imageNums = this.images.map(() => next++);
    for (let i = 0; i < next - 1; i++) reserve();

    push('%PDF-1.4\n');
    push(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));   // binary marker

    begin(nCatalog);
    push(`<< /Type /Catalog /Pages ${nPages} 0 R >>\n`);
    end();

    begin(nPages);
    push(`<< /Type /Pages /Count ${this.pages.length} /Kids [` +
      pageNums.map((p) => `${p.page} 0 R`).join(' ') + '] >>\n');
    end();

    begin(nFontR);
    push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\n');
    end();
    begin(nFontB);
    push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\n');
    end();

    this.images.forEach((img, i) => {
      begin(imageNums[i]);
      push(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.data.length} >>\nstream\n`);
      push(img.data);
      push('\nendstream\n');
      end();
    });

    const xobjects = this.images.length
      ? '/XObject << ' + this.images.map((im, i) => `/${im.name} ${imageNums[i]} 0 R`).join(' ') + ' >> '
      : '';

    this.pages.forEach((page, i) => {
      const body = page.ops.join('\n') + '\n';
      const bytes = enc.encode(body);

      begin(pageNums[i].page);
      push(`<< /Type /Page /Parent ${nPages} 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] ` +
        `/Resources << /Font << /FR ${nFontR} 0 R /FB ${nFontB} 0 R >> ${xobjects}>> ` +
        `/Contents ${pageNums[i].content} 0 R >>\n`);
      end();

      begin(pageNums[i].content);
      push(`<< /Length ${bytes.length} >>\nstream\n`);
      push(bytes);
      push('endstream\n');
      end();
    });

    const infoNum = next++;
    objects.push(0);
    begin(infoNum);
    push(`<< /Title (${pdfString(this.meta.title || 'Quote')}) ` +
      `/Author (${pdfString(this.meta.author || 'Oasis Coastal Cleaning')}) ` +
      `/Creator (${pdfString('Oasis Coastal Cleaning')}) ` +
      `/Producer (${pdfString('Oasis Coastal Cleaning')}) >>\n`);
    end();

    const xrefAt = length;
    const count = objects.length + 1;
    push(`xref\n0 ${count}\n0000000000 65535 f \n`);
    for (const offset of objects) {
      push(String(offset).padStart(10, '0') + ' 00000 n \n');
    }
    push(`trailer\n<< /Size ${count} /Root ${nCatalog} 0 R /Info ${infoNum} 0 R >>\n` +
      `startxref\n${xrefAt}\n%%EOF\n`);

    const out = new Uint8Array(length);
    let at = 0;
    for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
    return out;
  }
}

export { PAGE, MARGIN, CONTENT_W };
