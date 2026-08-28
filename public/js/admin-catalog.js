/* ==========================================================================
   Admin-only quote catalog — starting prices for the branded-quote composer.
   Loaded only on /admin (not the public site). Kristina can edit any price
   after tapping an add-on; the last price she used is remembered in this browser.
   ========================================================================== */
window.OASIS_ADMIN_CATALOG = {
  /* Quick base services — floors from docs/rates.md */
  bases: [
    { id: 'base-home', label: 'Home Cleaning', dollars: 120 },
    { id: 'base-office', label: 'Office Cleaning', dollars: 100 },
    { id: 'base-turnover', label: 'Airbnb / short-term turnover', dollars: 150 },
    { id: 'base-organizing', label: 'Organizing (per hour)', dollars: 40 },
    { id: 'base-laundry', label: 'Laundry (per hamper)', dollars: 15 }
  ],

  /* Same add-ons as the public catalog, with working starting prices ($) */
  addOns: [
    { id: 'refrigerator', label: 'Refrigerator (inside)', group: 'Kitchen', dollars: 40 },
    { id: 'oven', label: 'Oven (inside)', group: 'Kitchen', dollars: 45 },
    { id: 'microwave', label: 'Microwave (inside)', group: 'Kitchen', dollars: 20 },
    { id: 'dishes', label: 'Dishes', group: 'Kitchen', dollars: 25 },
    { id: 'cabinets', label: 'Cabinet cleaning', group: 'Kitchen', dollars: 50 },

    { id: 'beds', label: 'Bed making', group: 'Around the house', dollars: 15 },
    { id: 'laundry', label: 'Laundry (per hamper)', group: 'Around the house', dollars: 15 },
    { id: 'trash', label: 'Trash removal', group: 'Around the house', dollars: 20 },
    { id: 'blinds', label: 'Dusting blinds', group: 'Around the house', dollars: 35 },
    { id: 'walls', label: 'Wall washing', group: 'Around the house', dollars: 60 },

    { id: 'windows-in', label: 'Interior window', group: 'Windows', dollars: 12 },
    { id: 'windows-out', label: 'Exterior window', group: 'Windows', dollars: 15 },

    { id: 'closets', label: 'Closet organization', group: 'Organizing', dollars: 75 },
    { id: 'cabinet-org', label: 'Cabinet organization', group: 'Organizing', dollars: 75 }
  ]
};
