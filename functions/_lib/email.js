/**
 * Branded notification emails for Oasis Coastal Cleaning.
 *
 * One shared, email-client-safe template so every message Kristina receives —
 * a new quote request or a follow-up ask — looks like it came from the
 * business, not from a machine. The rules that keep email looking right
 * everywhere (Gmail, Apple Mail, Outlook) are unusual, so they are worth
 * stating:
 *
 *   - Layout is tables, not divs + modern CSS. Outlook ignores most CSS.
 *   - Every style is inline. <style> blocks and external CSS are stripped.
 *   - Colours are hex literals here on purpose: an email cannot read the
 *     site's CSS custom properties. They mirror public/tokens.css.
 *   - Images may be blocked by default, so the design reads with images off
 *     and the logo carries the business name in its alt text.
 *   - Both a rich HTML part and a clean plain-text part are always produced,
 *     which also helps a message land in the inbox instead of spam.
 */
import { escapeHtml } from './util.js';

/* Brand palette — mirrors public/tokens.css (email cannot use CSS variables). */
const C = {
  teal: '#02595F',
  navy: '#094045',
  gold: '#C89C53',
  goldSoft: '#E8D3AE',
  sand: '#F5D9B9',
  cream: '#FBF9F3',
  white: '#FFFFFF',
  ink: '#094045',
  muted: '#5B6F71',
  line: '#E5E0D5'
};

const FONT_BODY = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const FONT_HEAD = "Georgia,'Times New Roman',serif";

const BUSINESS = {
  name: 'Oasis Coastal Cleaning',
  tagline: 'Fresh Spaces. Happy Places.',
  phone: '(561) 201-7123',
  email: 'info@oasiscoastalcleaning.com',
  area: 'Serving Palm Beach & Broward County, Florida'
};

const telHref = (phone) => 'tel:' + String(phone).replace(/[^0-9+]/g, '');

/** Where the site lives, for absolute image and link URLs. */
function siteBase(env) {
  const raw = (env && (env.SITE_URL || env.QUOTE_SITE_URL)) || 'https://www.oasiscoastalcleaning.com';
  return String(raw).replace(/\/+$/, '');
}

/* ------------------------------------------------------------ HTML building */

/** A hidden line of preview text shown by the inbox before the email is opened. */
function preheader(text) {
  return (
    `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;` +
    `font-size:1px;line-height:1px;color:${C.cream};opacity:0">` +
    `${escapeHtml(text)}` +
    '&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;' +
    '&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;' +
    '</div>'
  );
}

/** A small gold uppercase label above a group of rows. */
function eyebrow(text) {
  return (
    `<p style="margin:0 0 8px;font-family:${FONT_BODY};font-size:11px;` +
    `font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${C.gold}">` +
    `${escapeHtml(text)}</p>`
  );
}

/**
 * A titled section: the eyebrow label, then a two-column table of rows.
 * rows is an array of [label, value]; blank/placeholder values are dropped so
 * the email only shows what the visitor actually filled in.
 */
function section(title, rows) {
  const kept = rows.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '' && String(v).trim() !== '—');
  if (!kept.length) return '';
  const body = kept.map(([label, value], i) => {
    const border = i === 0 ? '' : `border-top:1px solid ${C.line};`;
    return (
      `<tr>` +
      `<td style="${border}padding:10px 14px 10px 0;font-family:${FONT_BODY};font-size:13px;` +
      `line-height:1.4;color:${C.muted};white-space:nowrap;vertical-align:top;width:38%">${escapeHtml(label)}</td>` +
      `<td style="${border}padding:10px 0;font-family:${FONT_BODY};font-size:14px;line-height:1.5;` +
      `color:${C.ink};font-weight:600;vertical-align:top">${escapeHtml(value)}</td>` +
      `</tr>`
    );
  }).join('');
  return (
    `<tr><td style="padding:22px 32px 0">` +
    eyebrow(title) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">` +
    body +
    `</table></td></tr>`
  );
}

/** A free-text block (e.g. the visitor's notes) shown in a soft card. */
function noteBlock(title, text) {
  if (!text || !String(text).trim()) return '';
  return (
    `<tr><td style="padding:22px 32px 0">` +
    eyebrow(title) +
    `<div style="background:${C.cream};border:1px solid ${C.line};border-radius:12px;` +
    `padding:14px 16px;font-family:${FONT_BODY};font-size:14px;line-height:1.6;color:${C.ink}">` +
    `${escapeHtml(text).replace(/\n/g, '<br>')}</div></td></tr>`
  );
}

/** A bulletproof, brand-teal call-to-action button. */
function ctaButton(label, url) {
  if (!url) return '';
  return (
    `<tr><td style="padding:28px 32px 4px" align="left">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate">` +
    `<tr><td align="center" bgcolor="${C.teal}" style="border-radius:999px">` +
    `<a href="${escapeHtml(url)}" target="_blank" ` +
    `style="display:inline-block;padding:14px 34px;font-family:${FONT_BODY};font-size:13px;` +
    `font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.cream};` +
    `text-decoration:none;border-radius:999px">${escapeHtml(label)}</a>` +
    `</td></tr></table></td></tr>`
  );
}

/**
 * The shared outer shell: cream page, white card, light logo header, a teal
 * title band, the caller's content rows, an optional CTA, then the footer.
 * contentHtml is one or more <tr>...</tr> rows.
 */
function shell(env, { preheaderText, title, subtitle, contentHtml, cta }) {
  const base = siteBase(env);
  const logo = `${base}/logo/logo-primary-800.png`;
  const year = new Date().getFullYear();

  return (
    `<!doctype html><html lang="en"><head>` +
    `<meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="x-apple-disable-message-reformatting">` +
    `<meta name="color-scheme" content="light">` +
    `<title>${escapeHtml(title)}</title>` +
    `</head>` +
    `<body style="margin:0;padding:0;background:${C.cream};-webkit-text-size-adjust:100%">` +
    preheader(preheaderText || title) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.cream}">` +
    `<tr><td align="center" style="padding:28px 16px">` +

    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:600px;max-width:600px;background:${C.white};border:1px solid ${C.goldSoft};border-radius:16px;overflow:hidden">` +

    /* logo header */
    `<tr><td align="center" style="padding:26px 32px 18px;background:${C.white}">` +
    `<img src="${logo}" width="150" alt="${escapeHtml(BUSINESS.name)}" ` +
    `style="display:block;width:150px;max-width:60%;height:auto;border:0;margin:0 auto"></td></tr>` +

    /* teal title band */
    `<tr><td style="padding:20px 32px;background:${C.teal}">` +
    `<h1 style="margin:0;font-family:${FONT_HEAD};font-weight:400;font-size:22px;line-height:1.25;` +
    `letter-spacing:0.04em;color:${C.white}">${escapeHtml(title)}</h1>` +
    (subtitle
      ? `<p style="margin:6px 0 0;font-family:${FONT_BODY};font-size:13px;color:#CFE9EC">${escapeHtml(subtitle)}</p>`
      : '') +
    `</td></tr>` +

    contentHtml +
    (cta ? ctaButton(cta.label, cta.url) : '') +

    /* spacer */
    `<tr><td style="padding:20px 32px 0"><hr style="border:0;border-top:1px solid ${C.goldSoft};margin:0"></td></tr>` +

    /* footer */
    `<tr><td style="padding:18px 32px 30px" align="left">` +
    `<p style="margin:0;font-family:${FONT_HEAD};font-size:16px;color:${C.teal};letter-spacing:0.02em">` +
    `${escapeHtml(BUSINESS.name)}</p>` +
    `<p style="margin:2px 0 12px;font-family:${FONT_BODY};font-size:12px;font-style:italic;color:${C.gold}">` +
    `${escapeHtml(BUSINESS.tagline)}</p>` +
    `<p style="margin:0;font-family:${FONT_BODY};font-size:13px;line-height:1.7;color:${C.ink}">` +
    `<a href="${telHref(BUSINESS.phone)}" style="color:${C.teal};text-decoration:none;font-weight:600">${escapeHtml(BUSINESS.phone)}</a>` +
    `&nbsp;&nbsp;&middot;&nbsp;&nbsp;` +
    `<a href="mailto:${escapeHtml(BUSINESS.email)}" style="color:${C.teal};text-decoration:none;font-weight:600">${escapeHtml(BUSINESS.email)}</a>` +
    `</p>` +
    `<p style="margin:6px 0 0;font-family:${FONT_BODY};font-size:11px;color:${C.muted}">` +
    `${escapeHtml(BUSINESS.area)} &nbsp;&middot;&nbsp; &copy; ${year} ${escapeHtml(BUSINESS.name)}</p>` +
    `</td></tr>` +

    `</table>` +

    `<p style="margin:16px 0 0;font-family:${FONT_BODY};font-size:11px;color:${C.muted}">` +
    `This is an automated notification from your website.</p>` +

    `</td></tr></table></body></html>`
  );
}

/* ------------------------------------------------------- plain-text building */

function textSection(title, rows) {
  const kept = rows.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '' && String(v).trim() !== '—');
  if (!kept.length) return '';
  const pad = kept.reduce((m, [k]) => Math.max(m, k.length), 0);
  const lines = kept.map(([k, v]) => `  ${k}:`.padEnd(pad + 4) + ` ${v}`);
  return `${title.toUpperCase()}\n${lines.join('\n')}\n`;
}

function textShell(env, { title, subtitle, blocks, cta }) {
  const rule = '='.repeat(52);
  const parts = [
    BUSINESS.name.toUpperCase(),
    BUSINESS.tagline,
    rule,
    '',
    title + (subtitle ? ` — ${subtitle}` : ''),
    ''
  ];
  parts.push(blocks.filter(Boolean).join('\n'));
  if (cta && cta.url) {
    parts.push('');
    parts.push(`${cta.label}:`);
    parts.push(cta.url);
  }
  parts.push('');
  parts.push(rule);
  parts.push(`${BUSINESS.name}  ·  ${BUSINESS.phone}  ·  ${BUSINESS.email}`);
  parts.push(BUSINESS.area);
  return parts.join('\n');
}

/* --------------------------------------------------------- public builders */

const money = (n) => (Number.isFinite(+n) ? '$' + Math.round(+n).toLocaleString('en-US') : '');

/**
 * Build the "new quote request" email from a stored lead record.
 * Returns { subject, html, text } ready for sendEmail().
 */
export function buildQuoteEmail(env, lead) {
  const base = siteBase(env);
  const adminUrl = `${base}/admin/`;

  const addOns = safeList(lead.add_ons);
  const conds = safeList(lead.conditions);
  const days = safeList(lead.preferred_days);

  const estimate =
    (Number.isFinite(+lead.estimate_low) || Number.isFinite(+lead.estimate_high))
      ? [money(lead.estimate_low), money(lead.estimate_high)].filter(Boolean).join(' – ')
      : '';

  const contactRows = [
    ['Name', lead.name],
    ['Phone', lead.phone],
    ['Email', lead.email],
    ['Prefers', lead.contact_pref],
    ['Best time to reach', lead.best_time]
  ];
  const jobRows = [
    ['Service', lead.service_label || lead.service],
    ['Property', lead.property_type],
    ['Size', lead.size_label],
    ['Bedrooms / baths', [lead.bedrooms, lead.bathrooms].filter(Boolean).join(' / ')],
    ['Frequency', lead.frequency],
    ['First visit', lead.first_visit ? 'Yes — deeper first clean' : ''],
    ['Add-ons', addOns.join(', ')],
    ['About the home', conds.join(', ')]
  ];
  const whereRows = [
    ['City', lead.city],
    ['ZIP', lead.zip],
    ['Address', lead.address],
    ['Wants to start', lead.start_when],
    ['Preferred days', days.join(', ')],
    ['Access on the day', lead.access]
  ];
  const internalRows = [
    ['Estimate (internal)', estimate ? estimate + '  ·  not shown to the customer' : '']
  ];

  const subtitle = [lead.name, lead.city || 'South Florida'].filter(Boolean).join(' · ');

  const contentHtml =
    `<tr><td style="padding:20px 32px 0"><p style="margin:0;font-family:${FONT_BODY};font-size:14px;` +
    `line-height:1.6;color:${C.ink}">A new quote request just came in. Everything ${escapeHtml(firstName(lead.name))} ` +
    `sent is below — reply to this email to answer them directly.</p></td></tr>` +
    section('Contact', contactRows) +
    section('The job', jobRows) +
    section('Where & when', whereRows) +
    noteBlock('Notes from the customer', lead.notes) +
    section('For your records', internalRows);

  const html = shell(env, {
    preheaderText: `${firstName(lead.name)} wants ${lead.service_label || 'a clean'}${lead.city ? ' in ' + lead.city : ''}.`,
    title: 'New quote request',
    subtitle,
    contentHtml,
    cta: { label: 'Open this lead in your portal', url: adminUrl }
  });

  const text = textShell(env, {
    title: 'New quote request',
    subtitle,
    blocks: [
      textSection('Contact', contactRows),
      textSection('The job', jobRows),
      textSection('Where & when', whereRows),
      lead.notes ? `NOTES FROM THE CUSTOMER\n  ${String(lead.notes).replace(/\n/g, '\n  ')}\n` : '',
      textSection('For your records', internalRows)
    ],
    cta: { label: 'Open this lead in your portal', url: adminUrl }
  });

  const subject =
    `New quote request — ${lead.service_label || lead.service}${lead.city ? ' in ' + lead.city : ''}`;

  return { subject, html, text };
}

/**
 * Build the "follow-up requested" email (the Call me / Book a walkthrough
 * buttons on the confirmation screen). Returns { subject, html, text }.
 */
export function buildFollowupEmail(env, { name, kindLabel, id }) {
  const base = siteBase(env);
  const adminUrl = `${base}/admin/`;
  const who = name || 'A visitor';

  const contentHtml =
    `<tr><td style="padding:22px 32px 0">` +
    `<div style="background:${C.cream};border:1px solid ${C.goldSoft};border-radius:12px;padding:18px 20px">` +
    `<p style="margin:0;font-family:${FONT_BODY};font-size:16px;line-height:1.55;color:${C.ink}">` +
    `<strong style="color:${C.teal}">${escapeHtml(who)}</strong> asked for <strong>${escapeHtml(kindLabel)}</strong> ` +
    `about the request they just sent.</p></div>` +
    `<p style="margin:16px 0 0;font-family:${FONT_BODY};font-size:12px;color:${C.muted}">Lead reference: ${escapeHtml(id)}</p>` +
    `</td></tr>`;

  const html = shell(env, {
    preheaderText: `${who} asked for ${kindLabel}.`,
    title: 'Follow-up requested',
    subtitle: who,
    contentHtml,
    cta: { label: 'Open this lead in your portal', url: adminUrl }
  });

  const text = textShell(env, {
    title: 'Follow-up requested',
    subtitle: who,
    blocks: [
      `${who} asked for ${kindLabel} about the request they just sent.\n`,
      `Lead reference: ${id}\n`
    ],
    cta: { label: 'Open this lead in your portal', url: adminUrl }
  });

  const subject = `Follow-up requested — ${kindLabel}${name ? ' for ' + name : ''}`;

  return { subject, html, text };
}

/* --------------------------------------------------------------- helpers */

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'someone';
}

/** Parse a JSON array that was stored as a string; tolerate anything odd. */
function safeList(v) {
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string' || !v) return [];
  try {
    const out = JSON.parse(v);
    return Array.isArray(out) ? out : [];
  } catch {
    return [];
  }
}
