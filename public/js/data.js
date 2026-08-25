/* ==========================================================================
   Oasis Coastal Cleaning — site data
   --------------------------------------------------------------------------
   THIS IS THE ONLY FILE YOU NEED TO EDIT for day-to-day changes.

   Everything on the site reads from here: the navigation, the service cards,
   the pricing tables, the quote form dropdowns, the city lists, the FAQ, the
   reviews, the footer, the phone numbers and the search-engine data.

   Adding a service or a city is one line. Nothing else has to change.

   BEFORE THE SITE GOES LIVE, fill in the four items marked  ← SET THIS.
   ========================================================================== */

window.OASIS = {

  /* ---------------------------------------------------------------- business
     Used in the header, footer, sticky phone bar, contact page and the
     LocalBusiness data that Google reads. */
  business: {
    name: 'Oasis Coastal Cleaning',
    legalName: 'Oasis Coastal Cleaning',
    owner: 'Kristina Roberts',
    tagline: 'Fresh Spaces. Happy Places.',
    heroLine: 'From everyday mess to coastal fresh.',

    // ← SET THIS. Placeholder number below is a reserved test number and will
    // not ring. Write it exactly as you want it displayed; the call and text
    // links are built from it automatically.
    phone: '(561) 555-0100',
    // Set to false if you do not want a text-message button anywhere.
    textingEnabled: true,

    email: 'info@oasiscoastalcleaning.com',
    domain: 'https://www.oasiscoastalcleaning.com',

    // She works out of a vehicle, not a storefront, so no street address is
    // published. Google handles this as a "service area business".
    baseCity: 'Boca Raton',
    baseState: 'FL',
    baseZip: '33432',

    hours: [
      { days: 'Monday – Friday', time: '8:00 am – 6:00 pm' },
      { days: 'Saturday',        time: '9:00 am – 3:00 pm' },
      { days: 'Sunday',          time: 'Closed' }
    ],
    // Same hours in the format Google reads. Keep the two in step.
    hoursSchema: ['Mo-Fr 08:00-18:00', 'Sa 09:00-15:00'],

    social: {
      // Delete a line to drop the icon from the footer.
      instagram: '',
      facebook: '',
      google: ''
    },

    // ← SET THIS once the paperwork is in hand. These claims appear on every
    // page. Set a line to an empty string to hide that badge.
    licenseNote: 'Licensed and insured in the State of Florida',
    guarantee: '24-hour satisfaction guarantee — tell us and we come back'
  },

  /* ------------------------------------------------------------------- nav
     Order here is the order in the header and the footer. */
  nav: [
    { label: 'Home',          href: '/' },
    { label: 'Services',      href: '/services.html' },
    { label: 'Pricing',       href: '/pricing.html' },
    { label: 'Service Areas', href: '/service-areas.html' },
    { label: 'About',         href: '/about.html' },
    { label: 'FAQ',           href: '/faq.html' },
    { label: 'Contact',       href: '/contact.html' }
  ],

  /* --------------------------------------------------------------- services
     `active: false` hides a service everywhere — cards, menus, quote form,
     pricing table — without deleting anything. Flip it to true when you are
     ready to sell it. That is the whole change.

     ESTIMATE MODEL (drives the live range on the quote form)
       sizes[].hours  × hourlyRate × frequency factor  = estimate
       sizes[].price  (if present)  wins over hours — use it for flat rates
       minimum        the estimate never drops below this
       unitLabel      what the estimate is priced per — shown under the range
       firstVisit     multiplier for the first, deeper visit
       recurring      false = no weekly/biweekly options offered
  */
  services: [
    {
      id: 'home',
      active: true,
      name: 'Home Cleaning',
      short: 'Houses, condos and seasonal homes kept steady.',
      blurb: 'A standing clean that keeps a house from ever getting away from you. ' +
             'Kitchen and baths first, dusting top to bottom, floors done last so nothing ' +
             'gets walked back over. Trash out, doors locked, and a note if something needs ' +
             'your attention.',
      includes: [
        'Kitchen — counters, exterior of appliances, sink scrubbed and dried',
        'Bathrooms — tub, shower, tile, toilet, mirrors, fixtures polished',
        'Bedrooms and living areas — dusted, surfaces wiped, beds made',
        'Floors vacuumed and mopped, edges and baseboards included',
        'Trash and recycling out, fresh liners in',
        'A quick walkthrough with you, or a text with photos if you are out'
      ],
      startingAt: 145,
      startingUnit: 'per visit',
      icon: 'home',
      recurring: true,
      estimate: {
        unitLabel: 'per visit',
        hourlyRate: 62,
        minimum: 145,
        firstVisit: 1.4,
        sizes: [
          { id: 'h1', label: 'Studio or 1 bed · under 900 sq ft',     hours: 2.5 },
          { id: 'h2', label: '2 bedrooms · 900 – 1,400 sq ft',         hours: 3.25 },
          { id: 'h3', label: '3 bedrooms · 1,400 – 2,200 sq ft',       hours: 4.25 },
          { id: 'h4', label: '4 bedrooms · 2,200 – 3,200 sq ft',       hours: 5.5 },
          { id: 'h5', label: '5 bedrooms or more · 3,200+ sq ft',      hours: 7 }
        ]
      }
    },
    {
      id: 'office',
      active: true,
      name: 'Office Cleaning',
      short: 'Small offices and suites, after hours or before you open.',
      blurb: 'Cleaning that happens on your schedule instead of in the middle of your day. ' +
             'Desks and shared surfaces, glass, break room, restrooms restocked, floors and ' +
             'entry glass. Keys and alarm codes handled the way your building requires.',
      includes: [
        'Desks, tables and shared surfaces wiped and reset',
        'Restrooms cleaned and paper goods restocked',
        'Break room, sink, microwave front and refrigerator exterior',
        'Interior glass, entry doors and reception',
        'Floors vacuumed and mopped, trash and recycling out',
        'Evenings, early mornings or weekends — whatever keeps you open'
      ],
      startingAt: 135,
      startingUnit: 'per visit',
      icon: 'office',
      recurring: true,
      estimate: {
        unitLabel: 'per visit',
        hourlyRate: 58,
        minimum: 135,
        firstVisit: 1.3,
        sizes: [
          { id: 'o1', label: 'Small suite · under 1,200 sq ft',   hours: 2.5 },
          { id: 'o2', label: '1,200 – 2,500 sq ft',               hours: 3.5 },
          { id: 'o3', label: '2,500 – 5,000 sq ft',               hours: 5 },
          { id: 'o4', label: '5,000 – 8,000 sq ft',               hours: 7 },
          { id: 'o5', label: 'Over 8,000 sq ft',                  hours: 9 }
        ]
      }
    },
    {
      id: 'organizing',
      active: true,
      name: 'Organizing',
      short: 'Pantries, closets and the room that became storage.',
      blurb: 'Tell us the three spaces that stress you out and we start there. ' +
             'Everything comes out, gets sorted with you, and goes back in a way you can ' +
             'keep up with. Donations dropped off on the way home, containers only if the ' +
             'space actually needs them.',
      includes: [
        'A walkthrough first — we agree on what stays before anything moves',
        'Sort, group and return, with labels where they help',
        'One donation carload dropped off after the session',
        'Container recommendations, bought only with your approval',
        'A short handoff so the system survives a busy week'
      ],
      startingAt: 78,
      startingUnit: 'per hour',
      icon: 'organizing',
      recurring: false,
      estimate: {
        unitLabel: 'per session',
        hourlyRate: 78,
        minimum: 234,
        firstVisit: 1,
        sizes: [
          { id: 'g1', label: 'One space — a pantry, a closet, an entry',   hours: 3 },
          { id: 'g2', label: 'Half day — two or three spaces',             hours: 4 },
          { id: 'g3', label: 'Full day — a floor, a garage, a whole reset', hours: 7 },
          { id: 'g4', label: 'Multi-day project — a move or a whole home',  hours: 14 }
        ]
      }
    },
    {
      id: 'laundry',
      active: true,
      name: 'Laundry',
      short: 'Picked up Tuesday, folded and back Thursday.',
      blurb: 'Wash, dry, fold and hang, sorted the way you sort it. Free pickup and ' +
             'delivery inside the service area. Add it to a cleaning visit and it happens ' +
             'while we are already there.',
      includes: [
        'Free pickup and delivery within the service area',
        'Sorted by color and fabric, your detergent if you prefer it',
        'Folded or hung, back in the same bags or baskets',
        'Two-day standard turnaround, next day when you need it',
        'Delicates and line-dry items flagged and handled separately'
      ],
      startingAt: 45,
      startingUnit: 'per hamper',
      icon: 'laundry',
      recurring: true,
      estimate: {
        unitLabel: 'per pickup',
        hourlyRate: 0,
        minimum: 45,
        firstVisit: 1,
        sizes: [
          { id: 'l1', label: 'One hamper — up to 18 lbs',            price: 45 },
          { id: 'l2', label: 'Two hampers — up to 36 lbs',           price: 82 },
          { id: 'l3', label: 'Three hampers — up to 54 lbs',         price: 118 },
          { id: 'l4', label: 'Rental or household volume — 55 lbs +', price: 160 }
        ]
      }
    },

    /* ---- Ready when you are. Change active to true and it appears everywhere:
            the services page, the pricing table and the quote form. ---- */
    {
      id: 'movein',
      active: false,
      name: 'Move-In / Move-Out Cleaning',
      short: 'An empty place handed over spotless.',
      blurb: 'Inside cabinets, inside appliances, inside closets — the clean that gets a ' +
             'deposit back or hands a buyer a house that smells new.',
      includes: [
        'Inside all cabinets, drawers and closets',
        'Inside the oven and refrigerator',
        'Baseboards, door frames, switch plates and vents',
        'Windows and tracks on the interior',
        'Final walkthrough with photos'
      ],
      startingAt: 325,
      startingUnit: 'per home',
      icon: 'home',
      recurring: false,
      estimate: {
        unitLabel: 'per home', hourlyRate: 68, minimum: 325, firstVisit: 1,
        sizes: [
          { id: 'm1', label: 'Condo or 1 – 2 bedrooms', hours: 5 },
          { id: 'm2', label: '3 bedrooms',              hours: 7 },
          { id: 'm3', label: '4 bedrooms or more',      hours: 9 }
        ]
      }
    },
    {
      id: 'turnover',
      active: false,
      name: 'Rental Turnovers',
      short: 'Same-day resets between guests.',
      blurb: 'Linens stripped and remade, towels counted, amenities restocked, and a photo ' +
             'set sent before the next check-in so you know it is ready.',
      includes: [
        'Beds stripped, remade with fresh linens',
        'Towels counted, restocked and logged',
        'Kitchen reset, dishwasher run and emptied',
        'Consumables restocked from your supply',
        'Photo report sent before check-in'
      ],
      startingAt: 135,
      startingUnit: 'per turnover',
      icon: 'office',
      recurring: true,
      estimate: {
        unitLabel: 'per turnover', hourlyRate: 65, minimum: 135, firstVisit: 1,
        sizes: [
          { id: 't1', label: 'Studio or 1 bedroom', hours: 2.5 },
          { id: 't2', label: '2 bedrooms',          hours: 3.5 },
          { id: 't3', label: '3 bedrooms or more',  hours: 4.5 }
        ]
      }
    },
    {
      id: 'postconstruction',
      active: false,
      name: 'Post-Construction Cleaning',
      short: 'After the trades leave and before you move back in.',
      blurb: 'Fine dust settles for days. This is the two-pass clean that gets it out of ' +
             'the vents, off the trim and out of the corners for good.',
      includes: [
        'Two passes — the second after the dust resettles',
        'Vents, trim, ledges and light fixtures',
        'Paint, adhesive and sticker removal from glass and fixtures',
        'Floors detailed and sealed surfaces wiped',
        'Debris hauled to your bin'
      ],
      startingAt: 450,
      startingUnit: 'per project',
      icon: 'organizing',
      recurring: false,
      estimate: {
        unitLabel: 'per project', hourlyRate: 75, minimum: 450, firstVisit: 1,
        sizes: [
          { id: 'p1', label: 'A single room or bath remodel', hours: 6 },
          { id: 'p2', label: 'A floor or a large addition',   hours: 10 },
          { id: 'p3', label: 'A whole house',                 hours: 16 }
        ]
      }
    }
  ],

  /* ------------------------------------------------------------ frequencies
     `factor` multiplies the estimate. Lower factor = the discount for
     committing to a rhythm. Set `active: false` to stop offering one. */
  frequencies: [
    { id: 'weekly',   active: true, label: 'Weekly',           short: 'Weekly',
      factor: 0.82, note: 'The best rate, and the house never gets far from where we left it.' },
    { id: 'biweekly', active: true, label: 'Every two weeks',  short: 'Biweekly',
      factor: 0.88, note: 'The rhythm most family homes settle into.' },
    { id: 'monthly',  active: true, label: 'Monthly',          short: 'Monthly',
      factor: 0.95, note: 'A full reset once a month, with extra time budgeted.' },
    { id: 'onetime',  active: true, label: 'One time',         short: 'One time',
      factor: 1.0,  note: 'A single visit — a move, a party, or a trial run before you commit.' }
  ],

  /* ---------------------------------------------------------------- add-ons
     The checkbox list on the quote form. Customers tick what they want and
     the estimate updates as they go.

       price     flat dollars added to the visit
       group     the heading it appears under (any new name makes a new group)
       services  which services offer it — drop an id and it disappears there
       note      the small grey line under the label; leave it '' to hide

     ⚠ EVERY PRICE BELOW IS A PLACEHOLDER at ordinary South Florida rates.
     Go through them once and set your real numbers before the site is live.
     They drive the quoted range, so a wrong one here is a wrong quote. */
  addOns: [
    { id: 'refrigerator', label: 'Refrigerator',        note: 'Inside — shelves out, wiped down and replaced',
      price: 35, group: 'Kitchen',        services: ['home', 'office', 'movein', 'turnover'] },
    { id: 'oven',         label: 'Oven',                note: 'Inside, racks and door glass',
      price: 35, group: 'Kitchen',        services: ['home', 'movein'] },
    { id: 'microwave',    label: 'Microwave',           note: 'Inside and out, turntable washed',
      price: 12, group: 'Kitchen',        services: ['home', 'office', 'movein'] },
    { id: 'dishes',       label: 'Dishes',              note: 'Washed or loaded and run',
      price: 15, group: 'Kitchen',        services: ['home', 'turnover'] },
    { id: 'cabinets',     label: 'Cabinet cleaning',    note: 'Fronts and inside, shelves wiped',
      price: 45, group: 'Kitchen',        services: ['home', 'movein'] },

    { id: 'beds',         label: 'Bed making',          note: 'Made, or stripped and remade with fresh linens',
      price: 15, group: 'Around the house', services: ['home', 'turnover'] },
    { id: 'laundry',      label: 'Laundry',             note: 'Washed, dried and folded while we are there',
      price: 40, group: 'Around the house', services: ['home', 'turnover'] },
    { id: 'trash',        label: 'Trash removal',       note: 'Hauled away, beyond the usual bins to the curb',
      price: 20, group: 'Around the house', services: ['home', 'office', 'movein', 'turnover', 'postconstruction'] },
    { id: 'blinds',       label: 'Dusting blinds',      note: 'Slat by slat, not a pass with a duster',
      price: 30, group: 'Around the house', services: ['home', 'office', 'movein'] },
    { id: 'walls',        label: 'Wall washing',        note: 'Marks, scuffs and fingerprints off painted walls',
      price: 60, group: 'Around the house', services: ['home', 'office', 'movein', 'postconstruction'] },

    { id: 'windows-in',   label: 'Interior window',     note: 'Glass, sills and tracks from inside',
      price: 45, group: 'Windows',       services: ['home', 'office', 'movein', 'postconstruction'] },
    { id: 'windows-out',  label: 'Exterior window',     note: 'Ground-floor glass from outside',
      price: 65, group: 'Windows',       services: ['home', 'office'] },

    { id: 'closets',      label: 'Closet organization', note: 'Emptied, sorted with you and put back to a system',
      price: 70, group: 'Organizing',    services: ['home', 'organizing'] },
    { id: 'cabinet-org',  label: 'Cabinet organization', note: 'Pantry or kitchen cabinets grouped and labelled',
      price: 55, group: 'Organizing',    services: ['home', 'organizing'] }
  ],

  /* --------------------------------------------------------- bundle pricing
     More add-ons in one visit means less setup and travel per item, so the
     saving is real rather than a gimmick. The discount comes off the add-on
     subtotal only — never off the cleaning itself.

     Tiers are checked from the bottom up, so the best one a customer
     qualifies for is the one applied. ⚠ Confirm these percentages. */
  bundleDiscount: {
    tiers: [
      { min: 2, off: 0.10 },
      { min: 4, off: 0.15 },
      { min: 6, off: 0.20 }
    ],
    pitch: 'Pick any two and the extras come down 10%. Four or more takes 15% off, ' +
           'six or more takes 20%. The discount applies to the add-ons, not the clean.'
  },

  /* ------------------------------------------------------------- conditions
     Not things to buy — things about the home that change how long it takes.
     `factor` multiplies the cleaning subtotal. Kept apart from the add-ons so
     nobody is charged a "bundle discount" for owning a dog. */
  conditions: [
    { id: 'pets',   label: 'Pets in the home',  note: 'Hair, and a little more time',
      factor: 1.08, services: ['home', 'organizing', 'movein', 'turnover'] },
    { id: 'stairs', label: 'Two floors or more', note: 'Carrying equipment up and down',
      factor: 1.06, services: ['home', 'movein', 'postconstruction'] }
  ],

  /* ------------------------------------------------------------ property type
     Purely for the quote form and the email you receive. */
  propertyTypes: [
    'House',
    'Condo or apartment',
    'Townhouse',
    'Seasonal or second home',
    'Short-term rental',
    'Office or commercial suite'
  ],

  /* ------------------------------------------------------------------ areas
     Add a city: drop its name into the right group. Remove one: delete it.
     The service-area page, the quote-form dropdown and the search-engine
     data all read this list. */
  areas: [
    {
      id: 'palm-beach',
      name: 'Palm Beach County',
      county: 'Palm Beach County',
      note: 'The coastal spine from Boca Raton up to Westlake.',
      cities: [
        'Boca Raton', 'Delray Beach', 'Boynton Beach', 'Lake Worth Beach', 'Lantana',
        'Wellington', 'Royal Palm Beach', 'Greenacres', 'Palm Springs', 'West Palm Beach',
        'Palm Beach', 'Palm Beach Gardens', 'North Palm Beach', 'Riviera Beach',
        'Singer Island', 'Juno Beach', 'Jupiter', 'Tequesta', 'Westlake'
      ]
    },
    {
      id: 'western',
      name: 'Western Communities',
      county: 'Palm Beach County',
      note: 'Acreage lots and horse property west of the turnpike.',
      cities: ['Loxahatchee', 'Loxahatchee Groves', 'The Acreage', 'Jupiter Farms']
    },
    {
      id: 'coastal',
      name: 'Coastal & Barrier Islands',
      county: 'Palm Beach & Broward Counties',
      note: 'The A1A corridor, from Tequesta south to Hallandale Beach.',
      cities: [
        'Highland Beach', 'Gulf Stream', 'Ocean Ridge', 'Manalapan', 'Hypoluxo',
        'Hillsboro Beach', 'Hillsboro Mile', 'Lighthouse Point', 'Lauderdale-by-the-Sea',
        'Galt Ocean Mile', 'Las Olas Isles', 'Harbor Beach'
      ]
    },
    {
      id: 'broward',
      name: 'Broward County',
      county: 'Broward County',
      note: 'From Deerfield Beach down through Miramar.',
      cities: [
        'Deerfield Beach', 'Pompano Beach', 'Coconut Creek', 'Margate', 'Coral Springs',
        'Parkland', 'Tamarac', 'Sunrise', 'Lauderhill', 'Plantation', 'Fort Lauderdale',
        'Wilton Manors', 'Oakland Park', 'Davie', 'Weston', 'Southwest Ranches',
        'Cooper City', 'Dania Beach', 'Hollywood', 'Hallandale Beach', 'Pembroke Pines',
        'Miramar'
      ]
    }
  ],
  areaFootnote: 'Just outside the list? Ask anyway. Routes shift as the schedule fills, ' +
                'and a neighbor two streets over often makes it work.',

  /* -------------------------------------------------------------- trust bar
     The three short promises under the hero. */
  promises: [
    { title: 'Licensed and insured', body: 'Covered before anyone walks through your door, with proof on request.' },
    { title: 'The same hands',       body: 'You get the same person on the same day, not a rotating crew.' },
    { title: 'Nothing locked in',    body: 'Recurring visits can pause or stop with a week of notice. No contract.' }
  ],

  /* ----------------------------------------------------------- how it works */
  steps: [
    { title: 'Tell us the space',  body: 'Two minutes on the quote form, or a text with a couple of photos. Whatever is faster for you.' },
    { title: 'Get a real number',  body: 'A quote inside one business day, based on your actual square footage, condition and rhythm.' },
    { title: 'Pick your day',      body: 'Choose the day and the frequency. The first visit takes a little longer than the ones after it.' },
    { title: 'Come home to it',    body: 'Floors done last, trash out, doors locked. A text when it is finished.' }
  ],

  /* ------------------------------------------------------------ testimonials
     Real reviews only. Paste one in as she collects them and the section
     appears on the home page by itself. Leave the list empty until then —
     an empty list simply hides the section.

     Shape:
     { quote: 'What they actually wrote.', name: 'First name and last initial',
       city: 'Delray Beach', service: 'Home Cleaning' }
  */
  testimonials: [],

  /* -------------------------------------------------------------------- faq */
  faqs: [
    { q: 'How much does it cost?',
      a: 'Home visits start at $145 and offices at $135, but the honest answer is that ' +
         'the number depends on your square footage, how often we come, whether there are ' +
         'pets, and the condition on day one. The quote form gives you a range in about a ' +
         'minute, and a firm number follows within one business day.' },
    { q: 'Why a range instead of a price?',
      a: 'Because a fixed price sight-unseen is either padded to cover the worst case or ' +
         'about to be revised upward once we walk in. A range is what we can honestly ' +
         'promise before seeing the space, and it almost always lands where the form says.' },
    { q: 'Do I have to sign a contract?',
      a: 'No. Recurring visits continue until you tell us otherwise, and you can pause for ' +
         'the summer or stop entirely with a week of notice.' },
    { q: 'Do you bring your own supplies?',
      a: 'Yes — everything, including the vacuum. If you would rather we use your products, ' +
         'leave them out and we will. Plenty of clients do, especially with stone counters ' +
         'or a sensitivity to fragrance.' },
    { q: 'Is the first visit different?',
      a: 'It is longer and it costs more. The first visit catches up on everything that has ' +
         'built up so the visits after it can stay on rhythm. The quote form has a box for ' +
         'this so the range you see is the range you pay.' },
    { q: 'Do I need to be home?',
      a: 'No. Most clients give us a code, a lockbox or a key. Everything is logged, and you ' +
         'get a text when we arrive and when we leave.' },
    { q: 'What about my pets?',
      a: 'They can stay. Tell us their names and anything we should know — a door that has to ' +
         'stay shut, a cat that bolts. Pet homes take a little more time, which is why there ' +
         'is a box for it on the quote form.' },
    { q: 'Are you insured?',
      a: 'Yes. Liability coverage is in place before the first visit and we will send you the ' +
         'certificate if you would like to see it. Buildings that require one on file can have ' +
         'it sent directly to management.' },
    { q: 'How do I pay?',
      a: 'Card, Zelle or check, whichever is easiest. Recurring clients are invoiced after each ' +
         'visit and can keep a card on file to charge automatically.' },
    { q: 'What if something is not right?',
      a: 'Tell us within 24 hours and we come back and fix it. No argument, no charge. That is ' +
         'the whole guarantee.' },
    { q: 'Do you clean seasonal homes while I am away?',
      a: 'Yes, and it is a good chunk of what we do. Monthly checks through the off season, then ' +
         'a full open-up clean before you land. Send us your dates and we schedule around them.' },
    { q: 'How far do you travel?',
      a: 'Palm Beach and Broward, coast to the western communities. The service area page has ' +
         'the full list, and if you are just outside it, ask anyway.' }
  ],

  /* ------------------------------------------------------------------ about
     Replace the story with Kristina's own words before launch — the rest of
     the page holds up on its own until then. */
  about: {
    heading: 'The person you are letting in',
    lead: 'Oasis Coastal Cleaning is a small, owner-run business. When you book, ' +
          'you are booking a specific person who will be at your door on the day ' +
          'she said, with her own supplies and her own standards.',
    story: [
      'Most cleaning companies sell you a crew. You never know who is coming, and the ' +
      'person who learned where you keep the good glasses is gone by the third visit. ' +
      'This is the opposite of that. The same hands, the same day, every time.',
      'The work is straightforward: kitchen and baths first because they matter most, ' +
      'dusting from the top down, floors last so nothing gets walked back over. Trash out, ' +
      'doors locked, a text to say it is done. If something needs your attention — a slow ' +
      'drain, a stain that is not going to come out — you hear about it that day.',
      'Palm Beach and Broward are full of seasonal homes, rentals and busy households that ' +
      'need someone reliable more than they need someone cheap. That is who this is for.'
    ],
    // ← SET THIS. A paragraph in her own voice: where she is from, why she
    // started, what she is proud of. One honest paragraph beats three careful ones.
    ownerNote: '',
    photo: '',           // e.g. '/social/kristina.jpg' — a real photo converts far better than none
    photoAlt: 'Kristina Roberts, owner of Oasis Coastal Cleaning'
  },

  /* --------------------------------------------------------------- security
     Cloudflare Turnstile keeps fake leads out of your inbox.
     Leave the key empty and the forms still work — they just skip the check.
     Get a key at: Cloudflare dashboard → Turnstile → Add site. */
  turnstileSiteKey: '',

  /* ----------------------------------------------------------------- footer */
  footerNote: 'Serving Palm Beach and Broward County, Florida.'
};
