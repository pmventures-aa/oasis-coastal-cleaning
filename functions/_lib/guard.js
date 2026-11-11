/**
 * The gate every admin route goes through.
 *
 * Hiding a button is tidiness, not security: a cleaner with a login and the
 * address bar can ask for anything the server will answer. So the server
 * decides, here, and the screen only mirrors it.
 *
 * The owner passes every gate, which is the property that matters most --
 * adding staff must not take anything away from Kristina.
 */
import { json } from './util.js';
import { currentUser, can } from './auth.js';

const DENIED = 'That is not something this login can see.';

/**
 * Returns { user } when allowed, or { response } to return as-is.
 * `capability` is a key from the table in auth.js, or null for "any signed-in
 * person", which is the right level for things like an address lookup.
 */
export async function gate(request, env, capability = null) {
  const user = await currentUser(request, env);
  if (!user) return { response: json({ error: 'Please sign in.' }, 401) };
  if (!env.DB) return { response: json({ error: 'No database connected.' }, 503) };
  if (capability && !can(user, capability)) {
    return { response: json({ error: DENIED, role: user.role }, 403) };
  }
  return { user };
}

/** The same, for routes that do not need the database. */
export async function gateNoDb(request, env, capability = null) {
  const user = await currentUser(request, env);
  if (!user) return { response: json({ error: 'Please sign in.' }, 401) };
  if (capability && !can(user, capability)) {
    return { response: json({ error: DENIED, role: user.role }, 403) };
  }
  return { user };
}
