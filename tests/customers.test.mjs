/* The manager with six Airbnbs — the case the flat lead row could not hold. */
import assert from 'node:assert/strict';
import { linkLead, findOrCreateCustomer, findOrCreateProperty, hasCustomerTables } from '../functions/_lib/customers.js';

/* A small in-memory stand-in for D1, backed by real arrays. */
function makeDb({ withTables = true } = {}) {
  const customers = [], properties = [], leads = [];
  const like = (sql) => sql.replace(/\s+/g, ' ').trim();
  return {
    customers, properties, leads,
    prepare(sql) {
      const q = like(sql);
      // D1 statements are usable with or without .bind() — the stub must be too.
      const ops = (...a) => ({
        first: async () => {
          if (!withTables) throw new Error('no such table: customers');
          if (/SELECT 1 FROM customers/.test(q)) return { 1: 1 };
          if (/FROM customers WHERE LOWER\(TRIM\(email\)\) = \?/.test(q)) {
            return customers.find((c) => String(c.email || '').trim().toLowerCase() === a[0]) || null;
          }
          return null;
        },
        all: async () => {
          if (!withTables) throw new Error('no such table');
          if (/FROM customers WHERE phone IS NOT NULL/.test(q)) return { results: customers.filter((c) => c.phone) };
          if (/FROM properties WHERE customer_id = \?/.test(q)) return { results: properties.filter((p) => p.customer_id === a[0]) };
          return { results: [] };
        },
        run: async () => {
          if (!withTables) throw new Error('no such table');
          if (/INSERT INTO customers/.test(q)) {
            customers.push({ id: a[0], created_at: a[1], name: a[2], phone: a[3], email: a[4] }); return;
          }
          if (/INSERT INTO properties/.test(q)) {
            properties.push({ id: a[0], customer_id: a[1], created_at: a[2], address: a[3], city: a[4], zip: a[5] }); return;
          }
          if (/UPDATE leads SET customer_id/.test(q)) {
            leads.push({ id: a[2], customer_id: a[0], property_id: a[1] }); return;
          }
        }
      });
      return Object.assign(ops(), { bind: ops });
    }
  };
}

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('  ok  ' + name); };

await t('three Airbnbs become one customer with three properties', async () => {
  const db = makeDb();
  const jobs = [
    { id:'L1', name:'Coastal Stays LLC', phone:'(561) 555-0100', email:'manager@coastalstays.com', address:'12 Ocean Dr', city:'Delray Beach' },
    { id:'L2', name:'Coastal Stays',     phone:'561-555-0100',   email:'MANAGER@CoastalStays.com', address:'40 Palm Ct', city:'Delray Beach' },
    { id:'L3', name:'Coastal Stays LLC', phone:'5615550100',     email:' manager@coastalstays.com ', address:'8 Beach Way', city:'Boca Raton' }
  ];
  for (const j of jobs) await linkLead(db, j);
  assert.equal(db.customers.length, 1, 'one customer despite three phone spellings');
  assert.equal(db.properties.length, 3, 'three distinct addresses');
  assert.equal(new Set(db.leads.map((l) => l.customer_id)).size, 1, 'all three leads point at them');
});

await t('the same address twice does not become two properties', async () => {
  const db = makeDb();
  await linkLead(db, { id:'L1', name:'Dana', phone:'5615550200', email:'dana@example.com', address:'5 Elm St.', city:'Margate' });
  await linkLead(db, { id:'L2', name:'Dana', phone:'5615550200', email:'dana@example.com', address:'5 elm st',  city:'Margate' });
  assert.equal(db.customers.length, 1);
  assert.equal(db.properties.length, 1, 'punctuation and case are not a new address');
});

await t('two people sharing a phone stay separate when emails differ', async () => {
  const db = makeDb();
  await linkLead(db, { id:'L1', name:'Dana Reyes', phone:'(561) 555-0200', email:'dana@example.com', address:'5 Elm St', city:'Margate' });
  await linkLead(db, { id:'L2', name:'Sam Reyes',  phone:'(561) 555-0200', email:'sam@example.com',  address:'5 Elm St', city:'Margate' });
  assert.equal(db.customers.length, 2, 'email decides identity when there is one');
});

await t('no email at all falls back to the phone', async () => {
  const db = makeDb();
  await linkLead(db, { id:'L1', name:'Walk-in', phone:'(561) 555-0300', email:'', address:'9 Main St', city:'Boca Raton' });
  await linkLead(db, { id:'L2', name:'Walk-in', phone:'561 555 0300',   email:'', address:'11 Main St', city:'Boca Raton' });
  assert.equal(db.customers.length, 1, 'same number, however it is punctuated');
  assert.equal(db.properties.length, 2);
});

await t('the phone is stored in one shape', async () => {
  const db = makeDb();
  await linkLead(db, { id:'L1', name:'Dana', phone:'5615550200', email:'dana@example.com', address:'5 Elm St', city:'Margate' });
  assert.equal(db.customers[0].phone, '(561) 555-0200');
});

await t('a database without the tables carries on regardless', async () => {
  const db = makeDb({ withTables: false });
  assert.equal(await hasCustomerTables(db), false);
  const out = await linkLead(db, { id:'L1', name:'Dana', phone:'5615550200', email:'d@e.co', address:'5 Elm St' });
  assert.deepEqual(out, { customerId: null, propertyId: null }, 'no throw, no link, no lost lead');
});

await t('a job taken on the phone gets a customer and an address too', async () => {
  const db = makeDb();
  /* The shape /api/admin/leads writes: a name, a formatted phone, usually no
     email, and the address she wrote down while they were talking. */
  await linkLead(db, { id:'L1', name:'Cody', phone:'(561) 201-7123', email:'',
    address:'12 Ocean Ave', city:'Lake Worth', zip:'33460' });
  assert.equal(db.customers.length, 1, 'a phoned-in job is somebody');
  assert.equal(db.properties.length, 1, 'and that somebody has the address she wrote down');
  assert.equal(db.properties[0].address, '12 Ocean Ave');
  assert.equal(db.leads[0].customer_id, db.customers[0].id);
});

await t('the same caller ringing back twice is still one client', async () => {
  const db = makeDb();
  await linkLead(db, { id:'L1', name:'Cody', phone:'(561) 201-7123', email:'', address:'12 Ocean Ave', city:'Lake Worth' });
  await linkLead(db, { id:'L2', name:'Cody J', phone:'561-201-7123', email:'', address:'12 Ocean Ave.', city:'Lake Worth' });
  assert.equal(db.customers.length, 1);
  assert.equal(db.properties.length, 1, 'and one address, not two');
});

await t('every route that writes a lead also links it', async () => {
  /* The portal wrote leads from three places and only one of them created a
     customer, so anything taken on the phone or started from New Quote never
     reached the Clients screen. */
  const fs = await import('node:fs/promises');
  for (const f of ['functions/api/quote.js', 'functions/api/admin/leads.js', 'functions/api/admin/quotes.js']) {
    const src = await fs.readFile(new URL('../' + f, import.meta.url), 'utf8');
    if (!/INSERT INTO leads/i.test(src)) continue;
    assert.match(src, /linkLead\s*\(/, f + ' inserts a lead without linking it to a customer');
  }
});

console.log('\n' + n + ' customer-model cases passed');
