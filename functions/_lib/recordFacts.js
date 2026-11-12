/**
 * What we know about somebody, grouped, with the blanks dropped.
 *
 * The client card listed whatever columns the table had, in table order,
 * and a new homeowner with four things on file read as a broken record
 * full of dashes. A page that prints every column is displaying a row,
 * not describing a person.
 *
 * Three rules:
 *   - facts are grouped, because "how to reach them" and "what the house
 *     needs" are different questions;
 *   - a fact with no value is dropped, not printed as a dash;
 *   - an empty group says so in one line, because printing nothing at all
 *     would hide that the record is thin, and thin is a thing to fix.
 */

/* The strings that mean "nobody filled this in", including the dash the
   old card used to print, so it is eaten rather than displayed. */
const BLANK = new Set(['', '-', '—', 'n/a', 'na', 'none', 'null', 'undefined',
  'not provided', 'not set']);

export function isBlank(v) {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.filter((x) => !isBlank(x)).length === 0;
  return BLANK.has(String(v).trim().toLowerCase());
}

export function factValue(v) {
  if (isBlank(v)) return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.filter((x) => !isBlank(x)).join(', ');
  return String(v).trim();
}

/** One group: the facts that have values, and a count of those that do not. */
export function buildGroup(title, facts, hint) {
  const kept = [];
  let missing = 0;
  for (const f of facts || []) {
    const value = factValue(f.value);
    if (value) kept.push({ label: f.label, value, wide: !!f.wide });
    else missing += 1;
  }
  return { title, hint: hint || null, facts: kept, missing };
}

/** "3 more not recorded." — said once, rather than a dash per line. */
export function missingLine(group) {
  if (!group || !group.missing) return '';
  return group.missing + (group.missing === 1
    ? ' more thing not recorded.' : ' more things not recorded.');
}

export function completeness(groups) {
  let have = 0, total = 0;
  for (const g of groups || []) {
    have += g.facts.length;
    total += g.facts.length + g.missing;
  }
  return { have, total, done: total > 0 && have === total };
}

/**
 * A client's facts. Dates are formatted by the caller, because only the
 * browser knows what the reader expects to see.
 */
export function clientFactGroups(customer, property) {
  const c = customer || {};
  const p = property || {};
  return [
    buildGroup('How to reach them', [
      { label: 'Name', value: c.name },
      { label: 'Company', value: c.company },
      { label: 'Phone', value: c.phone },
      { label: 'Email', value: c.email },
      { label: 'Best time', value: c.best_time },
      { label: 'Prefers', value: c.contact_pref }
    ]),
    buildGroup('The place', [
      { label: 'Address', value: [p.address, p.city, p.zip].filter(Boolean).join(', '), wide: true },
      { label: 'Type', value: p.property_type },
      { label: 'Bedrooms', value: p.bedrooms },
      { label: 'Bathrooms', value: p.bathrooms },
      { label: 'Size', value: p.size_label }
    ], 'The address this work is at.'),
    buildGroup('At the door', [
      { label: 'Getting in', value: p.access, wide: true },
      { label: 'Parking', value: p.parking },
      { label: 'Pets', value: p.pets },
      { label: 'Bins', value: p.bins },
      { label: 'Supplies', value: p.supplies },
      { label: 'Do not touch', value: p.do_not_touch, wide: true },
      { label: 'Careful', value: p.warnings, wide: true }
    ], 'What whoever turns up needs to know.'),
    buildGroup('The arrangement', [
      { label: 'Preferred day', value: p.preferred_day },
      { label: 'Notes', value: c.notes, wide: true }
    ])
  ];
}
