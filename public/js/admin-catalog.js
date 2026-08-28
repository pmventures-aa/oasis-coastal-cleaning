/* ==========================================================================
   Admin-only quote catalog — the list of things that can go on a quote.
   Loaded only on /admin.

   There are no amounts in here, and there are none anywhere else either.
   Kristina prices every job for the job: the catalog saves her typing the
   name of a service, and the price is hers to enter each time. A number
   sitting in the box before she has looked at the house is a number that
   gets sent by accident.
   ========================================================================== */
window.OASIS_ADMIN_CATALOG = {
  /* Base services */
  bases: [
    { id: 'base-home', label: 'Home Cleaning' },
    { id: 'base-office', label: 'Office Cleaning' },
    { id: 'base-turnover', label: 'Airbnb / short-term turnover' },
    { id: 'base-organizing', label: 'Organizing (per hour)' },
    { id: 'base-laundry', label: 'Laundry (per hamper)' }
  ],

  /* The same add-ons the customer sees on the public site */
  addOns: [
    { id: 'refrigerator', label: 'Refrigerator (inside)', group: 'Kitchen' },
    { id: 'oven', label: 'Oven (inside)', group: 'Kitchen' },
    { id: 'microwave', label: 'Microwave (inside)', group: 'Kitchen' },
    { id: 'dishes', label: 'Dishes', group: 'Kitchen' },
    { id: 'cabinets', label: 'Cabinet cleaning', group: 'Kitchen' },

    { id: 'beds', label: 'Bed making', group: 'Around the house' },
    { id: 'laundry', label: 'Laundry (per hamper)', group: 'Around the house' },
    { id: 'trash', label: 'Trash removal', group: 'Around the house' },
    { id: 'blinds', label: 'Dusting blinds', group: 'Around the house' },
    { id: 'walls', label: 'Wall washing', group: 'Around the house' },

    { id: 'windows-in', label: 'Interior window', group: 'Windows' },
    { id: 'windows-out', label: 'Exterior window', group: 'Windows' },

    { id: 'closets', label: 'Closet organization', group: 'Organizing' },
    { id: 'cabinet-org', label: 'Cabinet organization', group: 'Organizing' }
  ]
};
