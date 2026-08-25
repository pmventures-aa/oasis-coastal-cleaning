/**
 * Oasis Coastal Cleaning — the Worker.
 *
 * Cloudflare accounts created recently offer Workers rather than Pages, so this
 * is a Worker with static assets instead of a Pages project. The split:
 *
 *   public/   the site. Served directly by the assets runtime; requests that
 *             match a file never reach this script at all.
 *   src/api/  everything else — the quote form, the follow-up buttons and the
 *             leads portal, routed below.
 *
 * The handlers keep the ({ request, env }) shape they had as Pages Functions,
 * so moving back to Pages would only mean deleting this file.
 */
import { onRequestPost as quotePost, onRequestGet as quoteGet } from './api/quote.js';
import { onRequestPost as followupPost } from './api/followup.js';
import { onRequestPost as loginPost } from './api/admin/login.js';
import { onRequestPost as logoutPost } from './api/admin/logout.js';
import { onRequestGet as statusGet } from './api/admin/status.js';
import { onRequestGet as leadsGet, onRequestPatch as leadsPatch } from './api/admin/leads.js';

const ROUTES = {
  'POST /api/quote':          quotePost,
  'GET /api/quote':           quoteGet,
  'POST /api/followup':       followupPost,
  'POST /api/admin/login':    loginPost,
  'POST /api/admin/logout':   logoutPost,
  'GET /api/admin/status':    statusGet,
  'GET /api/admin/leads':     leadsGet,
  'PATCH /api/admin/leads':   leadsPatch
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    const handler = ROUTES[`${request.method} ${path}`];
    if (handler) {
      try {
        return await handler({ request, env, ctx, url });
      } catch (err) {
        console.log('Unhandled error in', path, '·', err && err.stack);
        return new Response(
          JSON.stringify({ error: 'Something went wrong at our end. Please call or text instead.' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // An unknown /api/ path is a mistake, not a page. Never fall through to the
    // site for these — a 404 page pretending to be an API response is worse.
    if (path === '/api' || path.startsWith('/api/')) {
      return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    }

    return env.ASSETS.fetch(request);
  }
};
