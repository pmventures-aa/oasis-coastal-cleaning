/**
 * Catalog of optional add-ons offered on the customer proposal page.
 * Kept in sync with public/js/data.js (OASIS.addOns) — labels/ids must match
 * so we can detect which ones are already on a quote.
 */

export const ADDON_CATALOG = [
  { id: 'refrigerator', label: 'Refrigerator', note: 'Inside — shelves out, wiped down and replaced', group: 'Kitchen' },
  { id: 'oven', label: 'Oven', note: 'Inside, racks and door glass', group: 'Kitchen' },
  { id: 'microwave', label: 'Microwave', note: 'Inside and out, turntable washed', group: 'Kitchen' },
  { id: 'dishes', label: 'Dishes', note: 'Washed or loaded and run', group: 'Kitchen' },
  { id: 'cabinets', label: 'Cabinet cleaning', note: 'Fronts and inside, shelves wiped', group: 'Kitchen' },
  { id: 'beds', label: 'Bed making', note: 'Made, or stripped and remade with fresh linens', group: 'Around the house' },
  { id: 'laundry', label: 'Laundry', note: 'Washed, dried and folded while we are there', group: 'Around the house' },
  { id: 'trash', label: 'Trash removal', note: 'Hauled away, beyond the usual bins to the curb', group: 'Around the house' },
  { id: 'blinds', label: 'Dusting blinds', note: 'Slat by slat, not a pass with a duster', group: 'Around the house' },
  { id: 'walls', label: 'Wall washing', note: 'Marks, scuffs and fingerprints off painted walls', group: 'Around the house' },
  { id: 'windows-in', label: 'Interior window', note: 'Glass, sills and tracks from inside', group: 'Windows' },
  { id: 'windows-out', label: 'Exterior window', note: 'Ground-floor glass from outside', group: 'Windows' },
  { id: 'closets', label: 'Closet organization', note: 'Emptied, sorted with you and put back to a system', group: 'Organizing' },
  { id: 'cabinet-org', label: 'Cabinet organization', note: 'Pantry or kitchen cabinets grouped and labelled', group: 'Organizing' }
];

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** True when a quote line already covers this catalog add-on. */
export function addonAlreadyQuoted(addon, lineItems) {
  const items = Array.isArray(lineItems) ? lineItems : [];
  const label = normalize(addon.label);
  const id = normalize(addon.id);
  if (!label && !id) return false;

  return items.some((it) => {
    const t = normalize(it && it.label);
    if (!t) return false;
    return t === label || t === id || t.includes(label) || label.includes(t) || t.includes(id);
  });
}

/** Add-ons the customer can still opt into on the proposal page. */
export function availableAddons(lineItems) {
  return ADDON_CATALOG.filter((a) => !addonAlreadyQuoted(a, lineItems));
}

/** Resolve selected ids to catalog rows (unknown ids dropped). */
export function resolveSelectedAddons(ids) {
  const wanted = new Set(
    (Array.isArray(ids) ? ids : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
      .slice(0, 40)
  );
  if (!wanted.size) return [];
  return ADDON_CATALOG.filter((a) => wanted.has(a.id));
}
