/**
 * GET /api/admin/status — what the portal can currently do.
 * The sign-in page reads this so it can explain itself rather than just
 * failing when the project has not been configured yet.
 */
import { json } from '../../_lib/util.js';
import { currentUser, authConfigured, can } from '../../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const me = await currentUser(request, env);
  return json({
    authConfigured: authConfigured(env),
    databaseConfigured: Boolean(env.DB),
    emailConfigured: Boolean(env.RESEND_API_KEY || env.BREVO_API_KEY || env.NOTIFY_WEBHOOK_URL),
    propertyLookupConfigured: Boolean(env.RENTCAST_API_KEY),
    signedIn: !!me,
    /* So the screen can mirror the server. The server still decides: every
       one of these is enforced again on the route itself. */
    me: me ? { name: me.name, role: me.role } : null,
    can: me ? {
      money: can(me, 'money'), everyoneSchedule: can(me, 'everyoneSchedule'),
      clientList: can(me, 'clientList'), sendMail: can(me, 'sendMail'),
      manageUsers: can(me, 'manageUsers'), settings: can(me, 'settings')
    } : null
  });
}
