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

    // Displayed exactly as written here. The call and text links are built
    // from it automatically, so punctuation is safe.
    phone: '(561) 201-7123',
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
      { days: 'Monday – Friday', time: '7:00 am – 7:00 pm' },
      { days: 'Saturday',        time: '8:00 am – 5:00 pm' },
      { days: 'Sunday',          time: '9:00 am – 3:00 pm' }
    ],
    // The same hours in the format Google reads. Keep the two in step — they
    // are what shows in search results and on the map listing.
    hoursSchema: ['Mo-Fr 07:00-19:00', 'Sa 08:00-17:00', 'Su 09:00-15:00'],

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

  /* ---------------------------------------------------------------- quotes
     There are no prices on this site, anywhere, by design. Kristina quotes
     every job herself after reading what the customer sent, so a number on
     the page would only ever be a promise made before seeing the house.

     If you ever want to publish "starting at" figures, they would go back on
     the service entries below and into the cards in js/site.js — but nothing
     currently reads a price, so adding one is a deliberate act, not a
     forgotten leftover. */

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

     `sizes` is the "how big is it?" question on the quote form — labels only,
     no rates. `recurring: false` means no weekly/biweekly options are offered
     for that service.
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
      icon: 'home',
      recurring: true,
      sizes: [
        { id: 'h1', label: 'Studio or 1 bed · under 900 sq ft' },
        { id: 'h2', label: '2 bedrooms · 900 – 1,400 sq ft' },
        { id: 'h3', label: '3 bedrooms · 1,400 – 2,200 sq ft' },
        { id: 'h4', label: '4 bedrooms · 2,200 – 3,200 sq ft' },
        { id: 'h5', label: '5 bedrooms or more · 3,200+ sq ft' }
      ]
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
      icon: 'office',
      recurring: true,
      sizes: [
        { id: 'o1', label: 'Small suite · under 1,200 sq ft' },
        { id: 'o2', label: '1,200 – 2,500 sq ft' },
        { id: 'o3', label: '2,500 – 5,000 sq ft' },
        { id: 'o4', label: '5,000 – 8,000 sq ft' },
        { id: 'o5', label: 'Over 8,000 sq ft' }
      ]
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
      icon: 'organizing',
      recurring: false,
      sizes: [
        { id: 'g1', label: 'One space — a pantry, a closet, an entry' },
        { id: 'g2', label: 'Half day — two or three spaces' },
        { id: 'g3', label: 'Full day — a floor, a garage, a whole reset' },
        { id: 'g4', label: 'Multi-day project — a move or a whole home' }
      ]
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
      icon: 'laundry',
      recurring: true,
      sizes: [
        { id: 'l1', label: 'One hamper — up to 18 lbs' },
        { id: 'l2', label: 'Two hampers — up to 36 lbs' },
        { id: 'l3', label: 'Three hampers — up to 54 lbs' },
        { id: 'l4', label: 'Rental or household volume — 55 lbs +' }
      ]
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
      icon: 'home',
      recurring: false,
      sizes: [
        { id: 'm1', label: 'Condo or 1 – 2 bedrooms' },
        { id: 'm2', label: '3 bedrooms' },
        { id: 'm3', label: '4 bedrooms or more' }
      ]
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
      icon: 'office',
      recurring: true,
      sizes: [
        { id: 't1', label: 'Studio or 1 bedroom' },
        { id: 't2', label: '2 bedrooms' },
        { id: 't3', label: '3 bedrooms or more' }
      ]
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
      icon: 'organizing',
      recurring: false,
      sizes: [
        { id: 'p1', label: 'A single room or bath remodel' },
        { id: 'p2', label: 'A floor or a large addition' },
        { id: 'p3', label: 'A whole house' }
      ]
    }
  ],

  /* ------------------------------------------------------------ frequencies
     How often she comes. A standing visit costs less per visit than a one-off
     because the house never gets far from where she left it — by how much is
     part of the quote, not published here. Set `active: false` to stop
     offering one. */
  frequencies: [
    { id: 'weekly',   active: true, label: 'Weekly',           short: 'Weekly',
      note: 'The best rate, and the house never gets far from where we left it.' },
    { id: 'biweekly', active: true, label: 'Every two weeks',  short: 'Biweekly',
      note: 'The rhythm most family homes settle into.' },
    { id: 'monthly',  active: true, label: 'Monthly',          short: 'Monthly',
      note: 'A full reset once a month, with extra time budgeted.' },
    { id: 'onetime',  active: true, label: 'One time',         short: 'One time',
      note: 'A single visit — a move, a party, or a trial run before you commit.' }
  ],

  /* ---------------------------------------------------------------- add-ons
     The checkbox list on the quote form. Customers tick what they want and
     the estimate updates as they go.

       group     the heading it appears under (any new name makes a new group)
       services  which services offer it — drop an id and it disappears there
       note      the small grey line under the label; leave it '' to hide

     No prices here — these are the things a customer can ask for, and what
     each of them costs is decided when Kristina quotes the job. */
  addOns: [
    { id: 'refrigerator', label: 'Refrigerator',        note: 'Inside — shelves out, wiped down and replaced',
      group: 'Kitchen',        services: ['home', 'office', 'movein', 'turnover'] },
    { id: 'oven',         label: 'Oven',                note: 'Inside, racks and door glass',
      group: 'Kitchen',        services: ['home', 'movein'] },
    { id: 'microwave',    label: 'Microwave',           note: 'Inside and out, turntable washed',
      group: 'Kitchen',        services: ['home', 'office', 'movein'] },
    { id: 'dishes',       label: 'Dishes',              note: 'Washed or loaded and run',
      group: 'Kitchen',        services: ['home', 'turnover'] },
    { id: 'cabinets',     label: 'Cabinet cleaning',    note: 'Fronts and inside, shelves wiped',
      group: 'Kitchen',        services: ['home', 'movein'] },

    { id: 'beds',         label: 'Bed making',          note: 'Made, or stripped and remade with fresh linens',
      group: 'Around the house', services: ['home', 'turnover'] },
    { id: 'laundry',      label: 'Laundry',             note: 'Washed, dried and folded while we are there',
      group: 'Around the house', services: ['home', 'turnover'] },
    { id: 'trash',        label: 'Trash removal',       note: 'Hauled away, beyond the usual bins to the curb',
      group: 'Around the house', services: ['home', 'office', 'movein', 'turnover', 'postconstruction'] },
    { id: 'blinds',       label: 'Dusting blinds',      note: 'Slat by slat, not a pass with a duster',
      group: 'Around the house', services: ['home', 'office', 'movein'] },
    { id: 'walls',        label: 'Wall washing',        note: 'Marks, scuffs and fingerprints off painted walls',
      group: 'Around the house', services: ['home', 'office', 'movein', 'postconstruction'] },

    { id: 'windows-in',   label: 'Interior window',     note: 'Glass, sills and tracks from inside',
      group: 'Windows',       services: ['home', 'office', 'movein', 'postconstruction'] },
    { id: 'windows-out',  label: 'Exterior window',     note: 'Ground-floor glass from outside',
      group: 'Windows',       services: ['home', 'office'] },

    { id: 'closets',      label: 'Closet organization', note: 'Emptied, sorted with you and put back to a system',
      group: 'Organizing',    services: ['home', 'organizing'] },
    { id: 'cabinet-org',  label: 'Cabinet organization', note: 'Pantry or kitchen cabinets grouped and labelled',
      group: 'Organizing',    services: ['home', 'organizing'] }
  ],

  /* --------------------------------------------------------------- bundling
     More add-ons in one visit means less setup and travel per item, so
     bundling genuinely costs less. No percentage is published — the saving
     shows up in the quote Kristina sends. */
  bundleNote: 'Ask for two or more and they come down. The saving shows up in your quote.',

  /* ------------------------------------------------------------- conditions
     Not things to buy — things about the home that change how long a visit
     takes, and therefore what it costs. Kept apart from the add-ons because
     they are facts about the house, not items on an order. */
  conditions: [
    { id: 'pets',   label: 'Pets in the home',  note: 'Hair, and a little more time',
      services: ['home', 'organizing', 'movein', 'turnover'] },
    { id: 'stairs', label: 'Two floors or more', note: 'Carrying equipment up and down',
      services: ['home', 'movein', 'postconstruction'] }
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
      a: 'Every job is quoted individually, so there is no price list to point you at. What ' +
         'moves the number is square footage, how often we come, whether there are pets, and ' +
         'the condition on day one. Tell us about the space and a real number comes back ' +
         'within one business day — usually the same day.' },
    { q: 'Why is there no price list?',
      a: 'Because a figure published before anyone has seen your home is either padded to ' +
         'cover the worst case, or it is about to be revised upward once we walk in. Neither ' +
         'is a good start. A quote written for your house is worth more than a number that ' +
         'was written for nobody.' },
    { q: 'Do I have to sign a contract?',
      a: 'No. Recurring visits continue until you tell us otherwise, and you can pause for ' +
         'the summer or stop entirely with a week of notice.' },
    { q: 'Do you bring your own supplies?',
      a: 'Yes — everything, including the vacuum. If you would rather we use your products, ' +
         'leave them out and we will. Plenty of clients do, especially with stone counters ' +
         'or a sensitivity to fragrance.' },
    { q: 'Is the first visit different?',
      a: 'It is longer, and it costs more than the ones after it. The first visit catches up ' +
         'on everything that has built up so the visits that follow can stay on rhythm. Your ' +
         'quote will say what each is, so there is no surprise on the second invoice.' },
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
