/**
 * GET  /api/admin/customers        — everyone, with their properties
 * GET  /api/admin/customers?id=…   — one customer in full
 * POST /api/admin/customers        — { action: 'add-property', customer_id, ... }
 *                                    { action: 'move-lead', lead_id, property_id }
 * PATCH /api/admin/customers       — edit a customer or one of their properties
 */
import { json, clean } from '../../_lib/util.js';
import { isSignedIn } from '../../_lib/auth.js';
import { formatPhone } from '../../_lib/format.js';
import { newId } from '../../_lib/util.js';
import { hasCustomerTables } from '../../_lib/customers.js';

const SETUP = 'Apply migration 0007 (and 0008 to backfill) in D1 → oasis → Console.';

const guard = async (request, env) => {
  if (!await isSignedIn(request, env)) return json({ error: 'Please sign in.' }, 401);
  if (!env.DB) return json({ error: 'No database connected.' }, 503);
  if (!await hasCustomerTables(env.DB)) {
    return json({ error: 'Customers are not set up yet.', setup: SETUP }, 503);
  }
  return null;
};

export async function onRequestGet({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;

  const url = new URL(request.url);
  const id = clean(url.searchParams.get('id'), 60);

  try {
    const where = id ? 'WHERE c.id = ?' : 'WHERE c.archived_at IS NULL';
    const stmt = env.DB.prepare(
      `SELECT c.*,
              (SELECT COUNT(*) FROM properties p WHERE p.customer_id = c.id AND p.archived_at IS NULL) AS property_count,
              (SELECT COUNT(*) FROM leads l WHERE l.customer_id = c.id) AS lead_count
       FROM customers c ${where}
       ORDER BY c.created_at DESC LIMIT 500`
    );
    const rows = await (id ? stmt.bind(id) : stmt).all();
    const customers = rows.results || [];
    if (!customers.length) return json({ ok: true, customers: [] });

    // Properties for everyone in one pass rather than a query per customer.
    const ids = customers.map((c) => c.id);
    const marks = ids.map(() => '?').join(',');
    const props = await env.DB.prepare(
      `SELECT * FROM properties WHERE customer_id IN (${marks}) ORDER BY created_at`
    ).bind(...ids).all();

    const byCustomer = {};
    (props.results || []).forEach((p) => {
      (byCustomer[p.customer_id] = byCustomer[p.customer_id] || []).push(p);
    });

    return json({
      ok: true,
      customers: customers.map((c) => ({ ...c, properties: byCustomer[c.id] || [] }))
    });
  } catch (err) {
    return json({ error: 'Could not load customers.', detail: String(err && err.message || err) }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }
  const action = clean(body.action, 30);

  if (action === 'add-property') {
    const customerId = clean(body.customer_id, 60);
    if (!customerId) return json({ error: 'Which customer?' }, 400);
    const id = 'p-' + newId();
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO properties (id, customer_id, created_at, label, address, city, zip, property_type,
                               bedrooms, bathrooms, size_label, access, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, customerId, now, clean(body.label, 80) || null, clean(body.address, 200) || null,
           clean(body.city, 80) || null, clean(body.zip, 12) || null, clean(body.property_type, 80) || null,
           clean(body.bedrooms, 20) || null, clean(body.bathrooms, 20) || null,
           clean(body.size_label, 140) || null, clean(body.access, 200) || null,
           clean(body.notes, 2000) || null).run();
    return json({ ok: true, id });
  }

  if (action === 'move-lead') {
    const leadId = clean(body.lead_id, 60);
    const propertyId = clean(body.property_id, 60);
    if (!leadId || !propertyId) return json({ error: 'Need a lead and a property.' }, 400);
    const prop = await env.DB.prepare('SELECT customer_id FROM properties WHERE id = ?')
      .bind(propertyId).first();
    if (!prop) return json({ error: 'Property not found.' }, 404);
    await env.DB.prepare('UPDATE leads SET customer_id = ?, property_id = ?, updated_at = ? WHERE id = ?')
      .bind(prop.customer_id, propertyId, new Date().toISOString(), leadId).run();
    return json({ ok: true });
  }

  return json({ error: 'Unknown action.' }, 400);
}

const CUSTOMER_FIELDS = { name: 120, company: 160, phone: 40, email: 160,
                          contact_pref: 40, best_time: 80, notes: 4000 };
const PROPERTY_FIELDS = { label: 80, address: 200, city: 80, zip: 12, property_type: 80,
                          bedrooms: 20, bathrooms: 20, size_label: 140, access: 200, notes: 2000 };

export async function onRequestPatch({ request, env }) {
  const blocked = await guard(request, env);
  if (blocked) return blocked;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Unreadable request.' }, 400); }

  const propertyId = clean(body.property_id, 60);
  const customerId = clean(body.customer_id, 60);
  const table = propertyId ? 'properties' : 'customers';
  const id = propertyId || customerId;
  const fields = propertyId ? PROPERTY_FIELDS : CUSTOMER_FIELDS;
  if (!id) return json({ error: 'Which record?' }, 400);

  if (body.action === 'archive' || body.action === 'restore') {
    const at = body.action === 'archive' ? new Date().toISOString() : null;
    await env.DB.prepare(`UPDATE ${table} SET archived_at = ?, updated_at = ? WHERE id = ?`)
      .bind(at, new Date().toISOString(), id).run();
    return json({ ok: true, action: body.action });
  }

  const sets = [], values = [];
  for (const [col, max] of Object.entries(fields)) {
    if (body[col] === undefined) continue;
    sets.push(`${col} = ?`);
    values.push(col === 'phone' ? formatPhone(clean(body[col], max)) : clean(body[col], max));
  }
  if (!sets.length) return json({ error: 'Nothing to change.' }, 400);

  sets.push('updated_at = ?'); values.push(new Date().toISOString());
  values.push(id);
  await env.DB.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
  return json({ ok: true });
}
