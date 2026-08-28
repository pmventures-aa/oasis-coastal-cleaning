/**
 * Customers and their properties.
 *
 * A customer is a person or a company. A property is somewhere Kristina
 * cleans. One customer has many properties — the manager with six Airbnbs is
 * the case the old flat lead row could not express.
 *
 * Everything here degrades quietly. If migration 0007 has not been applied the
 * tables are missing, every function returns nothing, and the site carries on
 * exactly as it did before. A lead is never lost to a schema that is behind.
 */
import { newId } from './util.js';
import { formatPhone } from './format.js';

const digits = (v) => String(v || '').replace(/\D/g, '');
const emailKey = (v) => String(v || '').trim().toLowerCase();

/** True when the customer tables exist. Cheap, and cached per request. */
export async function hasCustomerTables(db) {
  if (!db) return false;
  try {
    await db.prepare('SELECT 1 FROM customers LIMIT 1').first();
    return true;
  } catch {
    return false;
  }
}

/**
 * The customer this person is, creating them if they are new.
 * Email decides identity when there is one — it is typed once and typed the
 * same way. A phone number is typed five ways, so it only decides when there
 * is no email to go on.
 */
export async function findOrCreateCustomer(db, { name, phone, email, contactPref, bestTime }) {
  if (!db) return null;
  const mail = emailKey(email);
  const tel = digits(phone);

  let row = null;
  try {
    if (mail) {
      row = await db.prepare('SELECT * FROM customers WHERE LOWER(TRIM(email)) = ? LIMIT 1')
        .bind(mail).first();
    }
    if (!row && !mail && tel) {
      const candidates = await db.prepare('SELECT * FROM customers WHERE phone IS NOT NULL').all();
      row = (candidates.results || []).find((c) => digits(c.phone) === tel) || null;
    }
  } catch {
    return null;                        // tables not there yet
  }
  if (row) return row;

  const id = 'c-' + newId();
  const now = new Date().toISOString();
  try {
    await db.prepare(
      `INSERT INTO customers (id, created_at, name, phone, email, contact_pref, best_time)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, now, String(name || '').trim() || 'Unnamed', formatPhone(phone) || null,
           mail || null, contactPref || null, bestTime || null).run();
    return { id, created_at: now, name, phone, email: mail };
  } catch {
    return null;
  }
}

/**
 * The property at this address for this customer, creating it if it is new.
 * Addresses are compared with punctuation and case removed, so "12 Ocean Dr."
 * and "12 ocean dr" are one place rather than two.
 */
export async function findOrCreateProperty(db, customerId, place) {
  if (!db || !customerId) return null;
  const key = (v) => String(v || '').toLowerCase().replace(/[.'’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const wanted = key(place.address);

  try {
    const existing = await db.prepare('SELECT * FROM properties WHERE customer_id = ?')
      .bind(customerId).all();
    const match = (existing.results || []).find((p) =>
      wanted ? key(p.address) === wanted : key(p.city) === key(place.city) && !p.address);
    if (match) return match;

    const id = 'p-' + newId();
    const now = new Date().toISOString();
    await db.prepare(
      `INSERT INTO properties
         (id, customer_id, created_at, address, city, zip, property_type, bedrooms, bathrooms, size_label, access)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, customerId, now, place.address || null, place.city || null, place.zip || null,
           place.propertyType || null, place.bedrooms || null, place.bathrooms || null,
           place.sizeLabel || null, place.access || null).run();
    return { id, customer_id: customerId, created_at: now, ...place };
  } catch {
    return null;
  }
}

/** Link a lead to its customer and property, quietly doing nothing if it cannot. */
export async function linkLead(db, lead) {
  if (!await hasCustomerTables(db)) return { customerId: null, propertyId: null };

  const customer = await findOrCreateCustomer(db, {
    name: lead.name, phone: lead.phone, email: lead.email,
    contactPref: lead.contact_pref, bestTime: lead.best_time
  });
  if (!customer) return { customerId: null, propertyId: null };

  const property = await findOrCreateProperty(db, customer.id, {
    address: lead.address, city: lead.city, zip: lead.zip,
    propertyType: lead.property_type, bedrooms: lead.bedrooms,
    bathrooms: lead.bathrooms, sizeLabel: lead.size_label, access: lead.access
  });

  try {
    await db.prepare('UPDATE leads SET customer_id = ?, property_id = ? WHERE id = ?')
      .bind(customer.id, property ? property.id : null, lead.id).run();
  } catch { /* columns not there yet */ }

  return { customerId: customer.id, propertyId: property ? property.id : null };
}
