/**
 * What a clean is made of.
 *
 * Templates rather than a free-text list, because the point is that the
 * same things get done every time and the ones that did not are visible.
 * She can still add a line to any individual visit.
 */
export const TEMPLATES = {
  standard: { label: 'Standard clean', items: [
    'Kitchen — surfaces, sink, hob, outside of appliances',
    'Bathrooms — bath, shower, loo, basin, mirrors',
    'Floors — vacuumed and mopped throughout',
    'Dusting — surfaces, sills, skirting',
    'Bins emptied and relined',
    'Beds made'
  ] },
  deep: { label: 'Deep clean', items: [
    'Kitchen — inside the oven, fridge and microwave',
    'Kitchen — cabinet fronts and inside, splashback',
    'Bathrooms — grout, limescale, extractor',
    'Skirting, door frames and switches',
    'Behind and under what moves',
    'Windows inside, sills and tracks',
    'Floors — vacuumed and mopped throughout'
  ] },
  turnover: { label: 'Rental turnover', items: [
    'Strip and remake every bed with fresh linen',
    'Towels out, fresh set laid',
    'Kitchen reset — crockery, cutlery, bin',
    'Bathrooms — consumables restocked',
    'Check for anything left behind',
    'Staged for photos and arrival'
  ] },
  office: { label: 'Office', items: [
    'Desks and surfaces',
    'Kitchen area and appliances',
    'Washrooms — restocked',
    'Floors — vacuumed and mopped',
    'Bins emptied, recycling out'
  ] },
  laundry: { label: 'Laundry', items: [
    'Sorted and washed',
    'Dried',
    'Folded or hung',
    'Put away'
  ] }
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES);

/** Guesses from what the job is called; she can always pick another. */
export function suggestTemplate(serviceLabel) {
  const s = String(serviceLabel || '').toLowerCase();
  if (/deep/.test(s)) return 'deep';
  if (/turn|airbnb|rental|str\b/.test(s)) return 'turnover';
  if (/office|commercial|corporate/.test(s)) return 'office';
  if (/laundry|wash/.test(s)) return 'laundry';
  return 'standard';
}

export function buildChecklist(templateId) {
  const t = TEMPLATES[templateId] || TEMPLATES.standard;
  return t.items.map((label) => ({ label, done: false }));
}

export function parseChecklist(v) {
  let a = v;
  if (typeof v === 'string') { try { a = JSON.parse(v || '[]'); } catch { a = []; } }
  if (!Array.isArray(a)) return [];
  return a
    .map((i) => ({ label: String(i && i.label || '').slice(0, 200), done: !!(i && i.done) }))
    .filter((i) => i.label);
}

export function progressOf(list) {
  const items = parseChecklist(list);
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, all: items.length > 0 && done === items.length };
}
