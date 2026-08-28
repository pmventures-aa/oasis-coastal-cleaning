-- Turns the leads that already exist into customers and properties.
--
-- People are matched on email first, then phone, because an email is typed
-- once and a phone number is typed several ways. Every lead becomes exactly
-- one property, even when two leads name the same address: merging addresses
-- is a judgement call and Kristina can do it from the portal, whereas a wrong
-- merge here would be silent.

INSERT INTO customers (id, created_at, name, phone, email, contact_pref, best_time)
SELECT
  'c-' || MIN(l.id),
  MIN(l.created_at),
  MIN(l.name),
  MIN(l.phone),
  LOWER(TRIM(MIN(l.email))),
  MIN(l.contact_pref),
  MIN(l.best_time)
FROM leads l
WHERE l.customer_id IS NULL
GROUP BY COALESCE(NULLIF(LOWER(TRIM(l.email)), ''), 'phone:' || REPLACE(REPLACE(REPLACE(REPLACE(l.phone, '(', ''), ')', ''), '-', ''), ' ', ''));

UPDATE leads SET customer_id = (
  SELECT c.id FROM customers c
  WHERE (NULLIF(LOWER(TRIM(leads.email)), '') IS NOT NULL AND c.email = LOWER(TRIM(leads.email)))
     OR (NULLIF(LOWER(TRIM(leads.email)), '') IS NULL
         AND REPLACE(REPLACE(REPLACE(REPLACE(c.phone, '(', ''), ')', ''), '-', ''), ' ', '')
           = REPLACE(REPLACE(REPLACE(REPLACE(leads.phone, '(', ''), ')', ''), '-', ''), ' ', ''))
  LIMIT 1
) WHERE customer_id IS NULL;

INSERT INTO properties (id, customer_id, created_at, address, city, zip, property_type, bedrooms, bathrooms, size_label, access, notes)
SELECT 'p-' || l.id, l.customer_id, l.created_at, l.address, l.city, l.zip,
       l.property_type, l.bedrooms, l.bathrooms, l.size_label, l.access, NULL
FROM leads l
WHERE l.property_id IS NULL AND l.customer_id IS NOT NULL;

UPDATE leads SET property_id = 'p-' || id WHERE property_id IS NULL AND customer_id IS NOT NULL;
