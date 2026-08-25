/**
 * GET /api/admin/status — what the portal can currently do.
 * The sign-in page reads this so it can explain itself rather than just
 * failing when the project has not been configured yet.
 */
import { json } from '../../lib/util.js';
import { isSignedIn, authConfigured } from '../../lib/auth.js';

export async function onRequestGet({ request, env }) {
  return json({
    authConfigured: authConfigured(env),
    databaseConfigured: Boolean(env.DB),
    emailConfigured: Boolean(env.RESEND_API_KEY),
    signedIn: await isSignedIn(request, env)
  });
}
