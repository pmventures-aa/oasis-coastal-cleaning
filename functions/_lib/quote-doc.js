/**
 * One place that knows how to turn a quote row into a PDF, so the admin
 * download, the customer download and the email attachment cannot drift into
 * three slightly different documents.
 */
import { buildQuotePdf } from './quote-pdf.js';
import { loadSettings } from './settings.js';
import { proposalUrl } from './quotes.js';

const BUSINESS = {
  name: 'Oasis Coastal Cleaning',
  tagline: 'Fresh Spaces. Happy Places.',
  phone: '(561) 201-7123',
  email: 'info@oasiscoastalcleaning.com'
};

/* The logo is fetched from the site's own assets and held for the life of the
   isolate, so a burst of quotes costs one request rather than one each. */
let logoCache = null;
async function loadLogo(request) {
  if (logoCache !== undefined && logoCache !== null) return logoCache;
  try {
    const url = new URL('/print/logo-quote.jpg', request.url);
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    logoCache = { bytes, dims: { width: 419, height: 420 } };
    return logoCache;
  } catch {
    return null;                 // a quote without a logo still beats no quote
  }
}

/** A safe, recognisable filename: "Oasis-Quote-Dana-Reyes.pdf". */
export function quoteFilename(quote) {
  const who = String(quote.customer_name || 'quote').trim()
    .replace(/[^A-Za-z0-9 ]+/g, '').replace(/\s+/g, '-').slice(0, 40);
  return `Oasis-Quote-${who || 'quote'}.pdf`;
}

export async function renderQuotePdf(env, request, { quote, lead }) {
  const [settings, logo] = await Promise.all([loadSettings(env.DB), loadLogo(request)]);
  const bytes = buildQuotePdf({
    quote, lead: lead || {}, business: BUSINESS, logo, settings,
    proposalUrl: quote.token ? proposalUrl(env, quote.token) : ''
  });
  return { bytes, filename: quoteFilename(quote) };
}

export { BUSINESS };
