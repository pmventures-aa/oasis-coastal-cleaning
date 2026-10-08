/* ==========================================================================
   Oasis Coastal Cleaning — admin dashboard
   Tabs + accordions for dense desktop/mobile layout. Archive & delete.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.getElementById('admin-root');
  var signout = document.getElementById('signout');
  if (!root) { return; }

  var STATUSES = ['new', 'contacted', 'quoted', 'booked', 'closed'];
  var QUOTE_STATUS_LABELS = { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', expired: 'Expired' };
  var EMAIL_STATUS_LABELS = { pending: 'Pending', sending: 'Sending', sent: 'Sent', delivered: 'Delivered', opened: 'Opened', failed: 'Failed', bounced: 'Bounced' };
  var EVENT_LABELS = {
    created: 'Quote Created', sent: 'Email Sent', email_delivered: 'Email Delivered',
    email_opened: 'Email Opened', email_bounced: 'Email Bounced', email_failed: 'Email Failed',
    viewed: 'Quote Viewed', accepted: 'Quote Accepted', declined: 'Quote Declined', expired: 'Quote Expired',
    revised: 'Quote Revised', reopened: 'Reopened by Kristina'
  };

  var VIEWS = [
    { id: 'active',   label: 'Requests' },
    { id: 'quotes',   label: 'Quotes' },
    { id: 'pending',  label: 'Awaiting reply' },
    { id: 'accepted', label: 'Accepted' },
    { id: 'paid',     label: 'Done & paid' },
    { id: 'clients',  label: 'Clients' },
    { id: 'settings', label: 'Settings' }
  ];

  function viewCount(id, counts, activeTotal) {
    if (id === 'active') return activeTotal;
    if (id === 'settings' || id === 'clients') return null;
    var p = state.pipelineCounts || {};
    return { quotes: p.drafts, pending: p.pending, accepted: p.accepted, paid: p.paid }[id] || 0;
  }

  var state = {
    view: 'active', filter: '', followup: false, open: null, leadTab: {},
    leads: [], counts: {}, q: '', quotes: {}, composing: false, composingLead: false,
    focusQuoteEditor: null, editingQuote: {}, settings: null, settingsFields: [], health: {},
    pipeline: null, pipelineCounts: {}, clients: null, schema: null,
    propertyLookupConfigured: null, emailConfigured: true,
    openClient: null, composeFor: null
  };

  var OASIS = window.OASIS || {};

  function oasisCities(keep) {
    var cities = [''];
    (OASIS.areas || []).forEach(function (g) {
      (g.cities || []).forEach(function (c) { if (cities.indexOf(c) === -1) cities.push(c); });
    });
    if (cities.indexOf('Somewhere else') === -1) cities.push('Somewhere else');
    /* A city we already hold — "Lake Worth" where the list says "Lake Worth
       Beach", or a town outside the service area — is not in the list, and a
       select silently drops a value it has no option for. That is how a
       prefilled address lost its city on the way into the form. */
    if (keep && cities.indexOf(keep) === -1) { cities.splice(1, 0, keep); }
    return cities;
  }

  // Keep in sync with functions/_lib/address-suggest.js FL_ZIP_HINTS cities.
  // Applied instantly on ZIP input so City never waits on (or sticks empty from) the API.
  var FL_ZIP_CITY = (window.OASIS && window.OASIS.zipCity) || {};

  function cityForZip(zip) {
    return FL_ZIP_CITY[String(zip || '').replace(/\D/g, '').slice(0, 5)] || '';
  }

  function oasisPropertyTypes() {
    return [''].concat(OASIS.propertyTypes || []);
  }

  function oasisFrequencies() {
    return [''].concat((OASIS.frequencies || [])
      .filter(function (f) { return f.active !== false; })
      .map(function (f) { return f.label; }));
  }

  function findCatalogByLabel(label) {
    var needle = String(label || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!needle) return null;
    var all = (CATALOG.bases || []).concat(CATALOG.addOns || []);
    for (var i = 0; i < all.length; i++) {
      var item = all[i];
      var l = item.label.toLowerCase();
      var short = l.split('(')[0].trim();
      if (l === needle || short === needle || l.indexOf(needle) === 0 || needle.indexOf(short) === 0) {
        return item;
      }
    }
    return null;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  var CATALOG = window.OASIS_ADMIN_CATALOG || { bases: [], addOns: [] };
  // Drop legacy per-browser catalog price cache — each job is custom-quoted.
  try { localStorage.removeItem('oasis_admin_addon_prices_v1'); } catch (e) { /* ignore */ }

  /* Always blank. The catalog carries names, never amounts — see
     js/admin-catalog.js. Kept as a function so every call site stays honest
     about where a price does not come from. */
  function splitName(full) {
    var s = String(full || '').trim().replace(/\s+/g, ' ');
    if (!s) return { first: '', last: '' };
    var i = s.indexOf(' ');
    if (i < 0) return { first: s, last: '' };
    return { first: s.slice(0, i), last: s.slice(i + 1).trim() };
  }

  function joinName(first, last) {
    return [first, last].map(function (x) { return String(x || '').trim(); }).filter(Boolean).join(' ');
  }

  function setSelectValue(select, value) {
    if (!select) return;
    var v = String(value || '');
    var found = false;
    var emptyIdx = -1;
    Array.prototype.forEach.call(select.options, function (opt, i) {
      if (opt.value === '') emptyIdx = i;
      if (opt.value === v) found = true;
      opt.selected = false;
    });
    if (!v) {
      if (emptyIdx >= 0) {
        select.selectedIndex = emptyIdx;
        select.options[emptyIdx].selected = true;
      }
      select.value = '';
      return;
    }
    if (!found) {
      var opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    }
    select.value = v;
    Array.prototype.forEach.call(select.options, function (opt) {
      opt.selected = opt.value === v;
    });
  }

  function moneyDollars(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) return '$0';
    var v = x.toFixed(x % 1 ? 2 : 0);
    var dot = v.indexOf('.');
    var whole = dot === -1 ? v : v.slice(0, dot);
    var rest = dot === -1 ? '' : v.slice(dot);
    return '$' + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + rest;
  }

  var esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  var FMT = window.OasisFormat;

  var when = function (iso) {
    var d = new Date(iso);
    if (isNaN(d)) { return iso || ''; }
    var mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) { return 'just now'; }
    if (mins < 60) { return mins + 'm ago'; }
    if (mins < 1440) { return Math.round(mins / 60) + 'h ago'; }
    if (mins < 10080) { return Math.round(mins / 1440) + 'd ago'; }
    return FMT.formatDateShort(iso);
  };

  // Florida time, and it says so. See js/format.js.
  var fullDate = function (iso) { return FMT.formatStamp(iso) || (iso || ''); };
  var phone = function (v) { return FMT.formatPhone(v); };

  var list = function (json) {
    try { var a = JSON.parse(json || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  };

  var digits = function (v) { return String(v || '').replace(/\D/g, ''); };
  /* Grouped, the way the quote and the PDF already do it. Without this the
     portal showed $1840.00 where the document it produced said $1,840.00. */
  var group = function (str) { return str.replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  var money = function (cents) {
    var n = Number(cents);
    if (!Number.isFinite(n)) return '$0.00';
    var v = (n / 100).toFixed(2);
    var dot = v.indexOf('.');
    return '$' + group(v.slice(0, dot)) + v.slice(dot);
  };
  var parseDollars = function (v) {
    var n = Number(String(v || '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  };

  /* Never rejects. Kristina works from her phone, and a dropped request used to
     leave whichever button she pressed disabled with a message that said it was
     still working — forever, until she reloaded. Nineteen call sites already
     handle a non-ok response, and none of them handled a thrown one, so a
     failure to reach the server is reported as one more non-ok response. */
  var api = function (path, opts) {
    return fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts))
      .then(function (r) {
        return r.json().catch(function () { return {}; })
          .then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
      })
      .catch(function () {
        return { ok: false, status: 0, offline: true,
                 body: { error: 'No connection — check your signal and try again.' } };
      });
  };

  function showSignIn(msg) {
    signout.hidden = true;
    root.innerHTML =
      '<div class="card signin"><h2>Sign in</h2><p>Your requests, quotes and clients.</p>' +
      /* This had no class, and site.css styles input[type=text|email|tel]
         by name — password is not on that list, so the one field on the
         first screen she sees every day was a raw browser default: 21px
         tall against a 44px button. */
      '<div class="field signin__field"><label for="pw">Password</label>' +
      '<input type="password" id="pw" class="set__input signin__input" autocomplete="current-password"></div>' +
      '<div id="signin-err" class="form-status form-status--err" role="alert"' +
      (msg ? '' : ' hidden') + '>' + esc(msg || '') + '</div>' +
      '<p style="margin-top:1.2rem"><button type="button" id="go" class="btn btn--primary btn--block">Sign in</button></p></div>';
    var pw = document.getElementById('pw');
    var go = function () {
      api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: pw.value }) })
        .then(function (r) {
          if (r.ok) { load(); return; }
          var err = document.getElementById('signin-err');
          err.hidden = false;
          err.textContent = r.body.error || 'That did not work.';
        });
    };
    document.getElementById('go').addEventListener('click', go);
    pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') { go(); } });
    pw.focus();
  }

  function showSetup(status) {
    signout.hidden = true;
    root.innerHTML =
      '<div class="card setup"><h2>Two settings and this is yours</h2>' +
      '<p class="muted">The website is live. This page needs the database and admin password.</p><ol>' +
      (status.authConfigured ? '' : '<li>Add <code>ADMIN_PASSWORD</code> and <code>SESSION_SECRET</code> in Cloudflare.</li>') +
      (status.databaseConfigured ? '' : '<li>Bind D1 as <code>DB</code> and run migrations.</li>') +
      '</ol></div>';
  }

  function pill(status, label) {
    label = label || (STATUSES.indexOf(status) !== -1
      ? status.charAt(0).toUpperCase() + status.slice(1)
      : (QUOTE_STATUS_LABELS[status] || status));
    return '<span class="pill pill--' + esc(status) + '">' + esc(label) + '</span>';
  }

  function field(l, col, value, opts) {
    opts = opts || {};
    if (opts.options) {
      /* A select shows nothing for a value it has no option for, and saving
         the form would then write that nothing back over a real answer. If
         what we hold is not on the list, the list grows by one. */
      var options = opts.options.slice();
      if (value != null && value !== '' && options.indexOf(value) === -1) { options.splice(1, 0, value); }
      return '<label class="pf"><span class="pf__k">' + esc(l) + '</span><select class="pf__v" data-col="' + col + '">' +
        options.map(function (o) {
          return '<option value="' + esc(o) + '"' + (o === value ? ' selected' : '') + '>' + esc(o || '—') + '</option>';
        }).join('') + '</select></label>';
    }
    if (opts.multiline) {
      return '<label class="pf pf--wide"><span class="pf__k">' + esc(l) + '</span>' +
        '<textarea class="pf__v" data-col="' + col + '" rows="3" placeholder="' + esc(opts.placeholder || '') + '">' +
        esc(value || '') + '</textarea></label>';
    }
    if (opts && opts.phone) {
      return '<label class="pf"><span class="pf__k">' + esc(l) + '</span>' +
        '<input class="pf__v" type="tel" inputmode="tel" autocomplete="tel" data-phone-field ' +
        'data-col="' + col + '" value="' + esc(value == null ? '' : value) + '"></label>';
    }
    return '<label class="pf"><span class="pf__k">' + esc(l) + '</span>' +
      '<input class="pf__v" type="text" data-col="' + col + '" value="' + esc(value || '') + '" placeholder="' +
      esc(opts.placeholder || '') + '"></label>';
  }

  function readOnly(l, v) {
    if (!v) { return ''; }
    return '<div class="pf pf--ro"><span class="pf__k">' + esc(l) + '</span><span class="pf__v">' + esc(v) + '</span></div>';
  }

  function acc(title, body, open) {
    return '<details class="acc"' + (open ? ' open' : '') + '>' +
      '<summary class="acc__sum"><span class="acc__icon" aria-hidden="true"></span>' + esc(title) + '</summary>' +
      '<div class="acc__in">' + body + '</div></details>';
  }

  function leadActions(l) {
    if (state.view === 'archived') {
      return '<div class="profile__foot">' +
        '<button type="button" class="btn btn--ghost" data-lead-action="restore">Restore to Active</button>' +
        '<button type="button" class="btn btn--danger" data-lead-action="delete">Delete Permanently</button></div>';
    }
    return '<div class="profile__foot">' +
      '<button type="button" class="btn btn--ghost" data-lead-action="archive">Archive</button>' +
      '<button type="button" class="btn btn--danger" data-lead-action="delete">Delete Permanently</button></div>';
  }

  /* What the customer asked for, where she can see it without opening
     anything. This lived inside a collapsed "Request & Notes" accordion —
     the add-ons they ticked and the message they wrote are the whole basis
     for the quote, and she was a click and a scroll away from both. */
  /* Where the request came from. It has been stored on every lead since the
     form went up and shown nowhere, so there was no way to tell a request
     that came off the home page from one off the vacation-rentals landing —
     or from the phone. */
  /* Mirrors cameFromLabel() in functions/_lib/email.js — keep the two in
     step. The form lives at /quote, so the path alone would read "the quote
     form" every time; quote.js appends ?from=<path> with the page they came
     off, and the two landing pages carry ?service=. */
  var SOURCE_PAGES = {
    '/': 'the home page', '/quote': 'the quote form', '/services': 'the services page',
    '/pricing': 'the pricing page', '/contact': 'the contact page', '/about': 'the about page',
    '/faq': 'the FAQ', '/service-areas': 'the service areas page',
    '/corporate-cleaning': 'the offices page', '/airbnb-cleaning': 'the vacation rentals page',
    '/thank-you': 'the thank-you page', '/404': 'a missing page'
  };

  function pageName(path) {
    var clean = String(path || '').replace(/\.html$/, '').replace(/\/+$/, '') || '/';
  var at = clean === '/index' ? '/' : clean;
    return SOURCE_PAGES[at] || at;
  }

  function cameFrom(l) {
    var src = String(l.source_page || '').trim();
    if (!src) return '';
    if (src === 'admin-phone') return 'Taken on the phone';
    if (src === 'admin-new-quote') return 'Started from a new quote';

    var path = src, params = null;
    try {
      var u = new URL(src, window.location.origin);
      path = u.pathname;
      params = u.searchParams;
    } catch (e) { /* already a bare path */ }

    var from = params && params.get('from');
    if (from) return 'Came from ' + pageName(from);

    var service = params && params.get('service');
    if (service === 'turnover') return 'Came from ' + SOURCE_PAGES['/airbnb-cleaning'];
    if (service === 'office') return 'Came from ' + SOURCE_PAGES['/corporate-cleaning'];

    return 'Came from ' + pageName(path);
  }

  function requestSummary(l, addOns, conds, days) {
    var bits = [];
    if (l.service_label || l.service) bits.push(esc(l.service_label || l.service));
    if (l.frequency) bits.push(esc(l.frequency));
    if (l.start_when) bits.push('starts ' + esc(l.start_when));
    if (days.length) bits.push(esc(days.join(', ')));
    if (l.first_visit) bits.push('first visit — deeper clean');

    var note = String(l.notes || '').trim();
    if (!bits.length && !addOns.length && !conds.length && !note && !cameFrom(l)) return '';

    var from = cameFrom(l);
    return '<section class="ask">' +
      '<p class="ask__k">What they asked for' +
        (from ? '<span class="ask__from">' + esc(from) + '</span>' : '') + '</p>' +
      (bits.length ? '<p class="ask__line">' + bits.join(' &middot; ') + '</p>' : '') +
      (addOns.length
        ? '<div class="ask__chips">' + addOns.map(function (a) {
            return '<span class="chip chip--ask">' + esc(a) + '</span>'; }).join('') + '</div>'
        : '') +
      (conds.length
        ? '<div class="ask__chips">' + conds.map(function (c) {
            return '<span class="chip chip--warn">' + esc(c) + '</span>'; }).join('') + '</div>'
        : '') +
      (note ? '<blockquote class="ask__note">' + esc(note) + '</blockquote>' : '') +
    '</section>';
  }

  function detail(l) {
    var addOns = list(l.add_ons), conds = list(l.conditions), days = list(l.preferred_days);
    var tel = digits(l.phone);
    var hasPhone = tel.length >= 10;
    // Profile first — confirm contact & property, then build a branded quote.
    var tab = state.leadTab[l.id] || 'intake';

    var lookupHint = state.propertyLookupConfigured === false
      ? '<p class="profile__lookup-setup muted">Property lookup needs a free RentCast key: ' +
        '<a href="https://app.rentcast.io/app/api" target="_blank" rel="noopener">get API key</a> → ' +
        'add Cloudflare secret <code>RENTCAST_API_KEY</code> → redeploy.</p>'
      : '';

    var nameParts = splitName(l.name);
    var intake =
      acc('Contact',
        '<label class="pf"><span class="pf__k">First name</span>' +
          '<input class="pf__v" type="text" data-name-part="first" autocomplete="given-name" value="' + esc(nameParts.first) + '"></label>' +
        '<label class="pf"><span class="pf__k">Last name</span>' +
          '<input class="pf__v" type="text" data-name-part="last" autocomplete="family-name" value="' + esc(nameParts.last) + '"></label>' +
        /* Every read-only view formats this; the one place she actually types
           it showed 5612017123. */
        field('Phone', 'phone', FMT.formatPhone(l.phone) || l.phone, { phone: true }) +
        field('Email', 'email', l.email) +
        field('Prefers', 'contact_pref', l.contact_pref, { options: ['', 'Text', 'Call', 'Email'] }) +
        field('Best time', 'best_time', l.best_time, { options: ['', 'Morning', 'Afternoon', 'Evening', 'Any time'] }), true) +
      acc('Property',
        '<label class="pf"><span class="pf__k">ZIP</span>' +
          '<input class="pf__v" type="text" data-col="zip" data-zip-lookup inputmode="numeric" autocomplete="postal-code" ' +
            'placeholder="5-digit ZIP" maxlength="10" value="' + esc(l.zip || '') + '"></label>' +
        '<label class="pf pf--wide addr-suggest"><span class="pf__k">Street address</span>' +
          '<div class="addr-suggest__wrap">' +
            '<input class="pf__v" type="text" data-col="address" data-address-suggest autocomplete="off" ' +
            (String(l.zip || '').replace(/\D/g, '').length === 5 ? '' : ' disabled') +
              ' placeholder="' + (String(l.zip || '').replace(/\D/g, '').length === 5 ? 'Street address' : 'Enter ZIP first') + '" value="' + esc(l.address || '') + '">' +
            '<ul class="addr-suggest__list" hidden role="listbox"></ul>' +
          '</div>' +
          '<span class="addr-suggest__hint">ZIP first, then street — suggestions stay in that ZIP</span></label>' +
        /* The lookup reads the address, so it belongs under the address
           rather than above it, where it invited a click there was nothing
           to answer yet. */
        '<div class="profile__lookup">' +
          '<button type="button" class="btn btn--primary btn--tiny" data-property-lookup>Fill beds / baths / sq ft from this address</button>' +
          '<span class="profile__lookup-msg muted" data-lookup-msg hidden></span>' +
        '</div>' + lookupHint +
        field('City', 'city', l.city, { options: oasisCities() }) +
        field('Type', 'property_type', l.property_type, { options: oasisPropertyTypes() }) +
        field('Size', 'size_label', l.size_label) +
        field('Bedrooms', 'bedrooms', l.bedrooms) + field('Bathrooms', 'bathrooms', l.bathrooms) +
        field('Getting in', 'access', l.access, { placeholder: 'Lockbox, gate code' }), true) +
      acc('Request & Notes',
        '<div class="profile__grid">' + readOnly('Service', l.service_label || l.service) +
        field('Frequency', 'frequency', l.frequency, { options: oasisFrequencies() }) +
        readOnly('First visit', l.first_visit ? 'Yes — deeper clean' : 'No') +
        readOnly('Start', l.start_when) + readOnly('Days', days.join(', ')) +
        field('Follow-up', 'followup', l.followup || 'none', { options: ['none', 'call', 'visit'] }) + '</div>' +
        (addOns.length ? '<div class="chips"><span class="chips__k">Add-ons</span>' +
          addOns.map(function (a) { return '<span class="chip">' + esc(a) + '</span>'; }).join('') + '</div>' : '') +
        (conds.length ? '<div class="chips"><span class="chips__k">About home</span>' +
          conds.map(function (c) { return '<span class="chip chip--warn">' + esc(c) + '</span>'; }).join('') + '</div>' : '') +
        field('Their notes', 'notes', l.notes, { multiline: true })) +
      acc('Quick notes (internal)',
        '<div class="profile__grid">' +
        field('Amount quoted', 'quoted_amount', l.quoted_amount, { placeholder: 'e.g. $185 per visit' }) +
        field('Next visit', 'next_visit', l.next_visit, { placeholder: 'e.g. Tue 9 Sep, 9am' }) + '</div>' +
        (l.quoted_at ? '<p class="profile__stamp">Quoted ' + esc(fullDate(l.quoted_at)) + '</p>' : '') +
        field('Your notes', 'admin_notes', l.admin_notes, { multiline: true, placeholder: 'What you quoted and why.' }));

    var propBits = [];
    if (l.address) propBits.push(l.address);
    if (l.city) propBits.push(l.city);
    if (l.bedrooms) propBits.push(l.bedrooms + ' bed');
    if (l.bathrooms) propBits.push(l.bathrooms + ' bath');
    if (l.size_label) propBits.push(l.size_label);

    /* The row this opens out of already carries the status, the follow-up
       flag and the quote badge, one line above. Printing them again was two
       "Sent" pills stacked on top of each other. */
    return '<div class="profile">' +
      '<div class="profile__bar">' +
        (hasPhone
          ? '<a class="btn btn--ghost" href="tel:+1' + tel + '">Call</a>' +
            '<a class="btn btn--ghost" href="sms:+1' + tel + '">Text</a>'
          : '') +
        '<a class="btn btn--ghost" href="mailto:' + esc(l.email) + '">Email</a>' +
        '<span class="profile__spacer"></span>' +
        '<label class="pf pf--inline"><span class="pf__k">Status</span><select class="pf__v" data-col="status">' +
          STATUSES.map(function (s) {
            return '<option value="' + s + '"' + (l.status === s ? ' selected' : '') + '>' +
              s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
          }).join('') + '</select></label>' +
        '<span class="saved" data-saved hidden>Saved</span></div>' +
      '<p class="profile__lookup-msg muted" data-lookup-msg hidden style="margin:0 0 .65rem"></p>' +

      requestSummary(l, addOns, conds, days) +

      '<div class="ptabs" role="tablist">' +
        '<button type="button" class="ptabs__btn' + (tab === 'intake' ? ' is-on' : '') + '" data-ptab="intake" role="tab">Profile</button>' +
        '<button type="button" class="ptabs__btn' + (tab === 'quotes' ? ' is-on' : '') + '" data-ptab="quotes" role="tab">Branded Quotes</button>' +
      '</div>' +

      '<div class="ptab' + (tab === 'intake' ? ' is-on' : '') + '" data-pane="intake">' + intake +
        '<div class="profile__next">' +
          '<button type="button" class="btn btn--primary" data-start-quote>Build branded quote →</button>' +
        '</div></div>' +

      '<div class="ptab' + (tab === 'quotes' ? ' is-on' : '') + '" data-pane="quotes" data-quote-panel="' + esc(l.id) + '">' +
        '<div class="quote-property-bar">' +
          '<div class="quote-property-bar__text">' +
            '<strong>Property</strong> ' +
            '<span class="muted">' + esc(propBits.join(' · ') || 'Fill in address on Profile, then use Fill beds / baths / sq ft') + '</span>' +
          '</div>' +
          '<button type="button" class="btn btn--ghost btn--tiny" data-ptab-jump="intake">Edit on Profile</button>' +
        '</div>' +
        '<p class="muted" style="font-size:var(--step--1);margin:0 0 .75rem">Add what the job includes, set how often each part happens, then send it.</p>' +
        '<div class="quote-panel__body"><p class="muted" style="font-size:var(--step--1)">Loading quotes…</p></div></div>' +

      leadActions(l) +
      '<p class="profile__stamp">Came in ' + esc(fullDate(l.created_at)) +
        (l.updated_at ? ' · edited ' + esc(when(l.updated_at)) : '') + '</p></div>';
  }

  function row(l) {
    var flag = l.followup && l.followup !== 'none'
      ? '<span class="pill pill--flag">' + (l.followup === 'visit' ? 'Wants a visit' : 'Wants a call') + '</span>' : '';
    var qBadge = '';
    if (l.latest_quote_status && l.latest_quote_status !== 'draft') {
      qBadge = '<span class="pill pill--quoted">' + esc(QUOTE_STATUS_LABELS[l.latest_quote_status] || l.latest_quote_status) + '</span>';
    }
    var open = state.open === l.id;
    return '<article class="lead' + (open ? ' is-open' : '') + '" data-id="' + esc(l.id) + '">' +
      '<button type="button" class="lead__head" data-toggle aria-expanded="' + open + '">' +
        '<span class="lead__chev" aria-hidden="true"></span>' +
        '<span class="lead__name">' + esc(l.name) + '</span>' + pill(l.status) + flag + qBadge +
        '<span class="lead__meta">' + esc(l.service_label || l.service) + (l.city ? ' · ' + esc(l.city) : '') + '</span>' +
        (l.quoted_amount ? '<span class="lead__quote">' + esc(l.quoted_amount) + '</span>' : '') +
        '<span class="lead__when">' + esc(when(l.created_at)) + '</span></button>' +
      (open ? '<div class="lead__body">' + detail(l) + '</div>' : '') + '</article>';
  }

  function render() {
    signout.hidden = false;
    var counts = state.counts;
    var activeTotal = STATUSES.reduce(function (n, s) { return n + (counts[s] || 0); }, 0);

    root.innerHTML =
      (!state.emailConfigured
        ? '<div class="admin-banner" role="status">Email is not configured yet — save drafts and use <strong>Copy link</strong> to text quotes. Add <code>RESEND_API_KEY</code> in Cloudflare to send from here.</div>'
        : '') +
      '<div class="toolbar">' +
        /* Arranged the way the work moves rather than by what the database
           calls things: requests come in, quotes get written, they go out and
           wait, someone says yes, the job happens, the money arrives. Each is
           a question she asks at a different moment. */
        '<div class="vtabs vtabs--pipeline">' +
          VIEWS.map(function (v) {
            var n = viewCount(v.id, counts, activeTotal);
            return '<button type="button" data-view="' + v.id + '"' +
              (state.view === v.id ? ' class="is-on"' : '') + '>' + esc(v.label) +
              (n === null ? '' : '<b>' + n + '</b>') + '</button>';
          }).join('') +
        '</div>' +
        (state.view === 'active'
          ? '<label class="toolbar__select"><span class="sr-only">Status</span><select id="status-filter">' +
            '<option value="">All statuses</option>' +
            STATUSES.map(function (s) {
              return '<option value="' + s + '"' + (state.filter === s ? ' selected' : '') + '>' +
                s.charAt(0).toUpperCase() + s.slice(1) + ' (' + (counts[s] || 0) + ')</option>';
            }).join('') + '</select></label>' +
            '<button type="button" class="toolbar__filter' + (state.followup ? ' is-on' : '') +
              '" data-followup-filter>Follow-ups</button>' +
            '<div class="toolbar__actions">' +
              '<button type="button" class="btn btn--ghost btn--new-lead" data-new-lead>+ New request</button>' +
              '<button type="button" class="btn btn--primary btn--new-quote" data-new-quote>+ New quote</button>' +
            '</div>'
          : '') +
        (state.view !== 'active' ? ''
          : '<input type="search" id="search" class="toolbar__search" placeholder="Search name, city, ZIP, phone…" value="' + esc(state.q) + '" autocomplete="off">') +
      '</div>' +
      (state.view === 'active' && (counts.archived || 0)
        ? '<p class="toolbar__aside"><button type="button" class="linkish" data-view="archived">' +
          'View ' + (counts.archived || 0) + ' archived</button></p>'
        : '') +
      (state.view === 'archived'
        ? '<p class="toolbar__aside"><button type="button" class="linkish" data-view="active">' +
          '&larr; Back to requests</button></p>'
        : '') +
      (state.composingLead ? newLeadPanelHtml() : '') +
      (state.composing ? newQuotePanelHtml() : '') +
      (state.view === 'settings' ? settingsHtml()
        : state.view === 'clients' ? clientsHtml()
        : STAGE_FOR_VIEW[state.view] ? pipelineHtml(state.view)
        : state.leads.length
          ? '<div class="leads">' + state.leads.map(row).join('') + '</div>' +
            '<p id="search-empty" class="empty" hidden>Nothing matches.</p>'
          : '<p class="empty">' + (state.view === 'archived' ? 'Nothing archived.' : 'No requests yet. They will appear here the moment someone sends one.') + '</p>');

    applySearchFilter();
    if (state.composingLead) {
      var ln = root.querySelector('[data-lead-field="name"]');
      if (ln) ln.focus();
    }
    if (state.composing) {
      var cn = root.querySelector('.quote-first-name');
      if (cn) cn.focus();
    }
    if (state.open && (state.leadTab[state.open] || 'intake') === 'quotes') { loadQuotes(state.open); }
    growAllDesc();
  }

  function leadMatches(l, q) {
    if (!q) return true;
    var needle = q.toLowerCase().trim();
    if (!needle) return true;
    var hay = [l.name, l.phone, l.email, l.city, l.address, l.zip, l.service_label, l.size_label, l.notes, l.admin_notes, l.quoted_amount]
      .join(' ').toLowerCase();
    if (hay.indexOf(needle) !== -1) return true;
    var qDigits = needle.replace(/\D/g, '');
    if (qDigits.length >= 3) {
      var phone = String(l.phone || '').replace(/\D/g, '');
      var zip = String(l.zip || '').replace(/\D/g, '');
      if ((phone && phone.indexOf(qDigits) !== -1) || (zip && zip.indexOf(qDigits) !== -1)) return true;
    }
    return false;
  }

  function applySearchFilter() {
    var q = state.q || '';
    var leads = root.querySelectorAll('.lead');
    var shown = 0;
    Array.prototype.forEach.call(leads, function (el) {
      var lead = state.leads.find(function (l) { return l.id === el.dataset.id; });
      var match = leadMatches(lead || {}, q);
      el.hidden = !match;
      if (match) shown += 1;
    });
    var empty = document.getElementById('search-empty');
    if (empty) empty.hidden = !q.trim() || shown > 0 || !leads.length;
  }

  /* ---- quote builder ---- */
  /** The "Standard note" from Settings, which had no effect anywhere. */
  function standardNote() {
    if (state.settings && state.settings.quote_note != null) return state.settings.quote_note;
    return state.standardNote || '';
  }

  function quoteSeedFromLead(l) {
    if (!l) return { label: 'Cleaning service', notes: '' };
    var label = l.service_label || 'Cleaning visit';
    if (l.size_label) label += ' — ' + l.size_label;
    /* The note box is the customer's "A note from Kristina". It used to be
       pre-filled with their own address, bed and bath counts and property
       type — internal job data, handed back to them as a personal message.
       Any of that she wants on the quote belongs in a line description; the
       property itself is already on the lead and in the panel above this
       editor. The standard note she set in Settings goes here instead —
       until now nothing ever read it. */
    return { label: label, notes: standardNote() };
  }

  /* The job, then each add-on they ticked. The add-ons come in at zero, so
     a quote written the way she usually writes one — one price for the
     clean, the extras thrown in — reads "Included" against each of them on
     the quote, the PDF and the email. She types over any that are not free.
     They used to arrive with an empty amount, which is neither a price nor
     a promise. */
  function catalogQuoteLinesFromLead(l) {
    if (!l) return [];
    var seed = quoteSeedFromLead(l);
    var lines = [{ label: seed.label, qty: 1, unit_dollars: '' }];
    list(l.add_ons).forEach(function (name) {
      var item = findCatalogByLabel(name);
      lines.push({
        catalog_id: item ? item.id : '',
        label: item ? item.label : name,
        qty: 1,
        unit_dollars: '0'
      });
    });
    return lines;
  }

  var CADENCES = [
    { id: 'onetime', label: 'One time' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'biweekly', label: 'Every 2 weeks' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'quarterly', label: 'Quarterly' }
  ];

  /* One line of a quote is a small record, not four boxes crammed on a row.
     Each field is labelled, the price sits where the eye expects it, and every
     line says whether it repeats — the clean can be fortnightly while the oven
     is a one-off, and that is normal rather than an edge case. */
  function quoteLineHtml(line) {
    line = line || {};
    var price = line.unit_dollars != null
      ? line.unit_dollars
      : (line.unit_price ? (line.unit_price / 100).toFixed(2) : '');
    var cadence = line.cadence || 'onetime';
    var recurring = cadence !== 'onetime';

    /* One card, three rows, no boxes inside boxes: what it is and what it
       costs, what the customer reads, then a quiet strip of the three small
       decisions. The old card split the lower half into two bordered columns
       with a sand button wedged between them, which read as four controls of
       equal weight when only one of them is typed into. */
    return '<div class="qline' + (recurring ? ' is-recurring' : '') +
        (line.optional ? ' is-optional' : '') + '"' +
        (line.catalog_id ? ' data-catalog-id="' + esc(line.catalog_id) + '"' : '') + '>' +
      '<div class="qline__main">' +
        '<label class="qline__f qline__f--label"><span>What it is</span>' +
          '<input type="text" class="quote-label" placeholder="e.g. Home cleaning" value="' +
          esc(line.label || '') + '"></label>' +
        '<label class="qline__f qline__f--qty"><span>Qty</span>' +
          '<input type="number" class="quote-qty" min="1" value="' + esc(line.qty || 1) + '"></label>' +
        '<label class="qline__f qline__f--price"><span>Amount</span>' +
          '<span class="qline__money">' +
            '<i aria-hidden="true">$</i>' +
            '<input type="text" class="quote-price" inputmode="decimal" placeholder="0.00" value="' +
            esc(price) + '">' +
          '</span></label>' +
      '</div>' +
      '<label class="qline__f qline__desc"><span>What it includes <i>(the customer reads this)</i></span>' +
        '<textarea class="quote-description" rows="2" ' +
          'placeholder="Anything worth spelling out — what is covered, what is not.">' +
          esc(line.description || '') + '</textarea></label>' +
      '<div class="qline__strip">' +
        '<label class="qline__pick"><span>How often</span>' +
          '<select class="quote-cadence">' +
            CADENCES.map(function (c) {
              return '<option value="' + c.id + '"' + (cadence === c.id ? ' selected' : '') + '>' +
                esc(c.label) + '</option>';
            }).join('') +
          '</select></label>' +
        '<label class="qline__tick">' +
          '<input type="checkbox" class="quote-optional"' + (line.optional ? ' checked' : '') + '>' +
          '<span>Optional — leave it off the total</span>' +
        '</label>' +
        '<button type="button" class="qline__remove" data-remove-line ' +
          'aria-label="Remove this line">Remove</button>' +
      '</div></div>';
  }

  /* The description is what the customer reads, so she should be able to see
     all of it. The add-on sentence runs to six lines on a phone, and the box
     was showing three and scrolling the rest out of sight. Capped so one long
     line cannot push everything else off the screen. */
  function growDesc(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight + 2, 200) + 'px';
  }

  function growAllDesc() {
    Array.prototype.forEach.call(root.querySelectorAll('.quote-description'), growDesc);
  }

  /* Everything she can put on a quote, flat, with the group kept for the
     hint beside the name. */
  function catalogItems() {
    var out = (CATALOG.bases || []).map(function (b) {
      return { id: b.id, label: b.label, group: 'Service' };
    });
    (CATALOG.addOns || []).forEach(function (a) {
      out.push({ id: a.id, label: a.label, group: a.group || 'Add-on' });
    });
    return out;
  }

  /* The saved list was five tabs of rows, each with its own price box and
     its own Add button — forty controls to find one service. It is a box
     she types into: the list narrows as she goes, Enter takes the top match,
     and anything she types that is not on the list is added as it stands.
     Price, quantity, cadence and wording are all set on the line itself,
     which is where every other line is edited. */
  function quoteCatalogHtml() {
    if (!catalogItems().length) return '';
    return '<div class="svcpick" data-svcpick>' +
      '<label class="svcpick__lab" for="svcpick-input">Add a saved service</label>' +
      '<div class="svcpick__box">' +
        '<input type="text" id="svcpick-input" class="svcpick__input" autocomplete="off" ' +
          'role="combobox" aria-expanded="false" aria-controls="svcpick-list" ' +
          'placeholder="Start typing — deep clean, oven, windows…" data-svcpick-input>' +
        '<button type="button" class="btn btn--ghost btn--tiny svcpick__add" data-svcpick-add>Add</button>' +
      '</div>' +
      '<ul class="svcpick__list" id="svcpick-list" role="listbox" hidden data-svcpick-list></ul>' +
      '<p class="svcpick__hint muted">Set the price, how often and the wording on the line itself. ' +
        'Anything not on the list can just be typed.</p>' +
    '</div>';
  }

  function svcMatches(q) {
    var needle = String(q || '').toLowerCase().trim();
    var all = catalogItems();
    if (!needle) return all.slice(0, 8);
    var starts = [], has = [];
    all.forEach(function (it) {
      var l = it.label.toLowerCase();
      if (l.indexOf(needle) === 0) starts.push(it);
      else if (l.indexOf(needle) !== -1) has.push(it);
    });
    return starts.concat(has).slice(0, 8);
  }

  function svcRender(pick) {
    var input = pick.querySelector('[data-svcpick-input]');
    var listEl = pick.querySelector('[data-svcpick-list]');
    var typed = String(input.value || '').trim();
    var items = svcMatches(typed);

    if (!items.length) {
      listEl.innerHTML = typed
        ? '<li class="svcpick__none">Nothing saved by that name — press Add to use ' +
            '“' + esc(typed) + '” as typed.</li>'
        : '';
      listEl.hidden = !typed;
      input.setAttribute('aria-expanded', String(!listEl.hidden));
      return;
    }
    listEl.innerHTML = items.map(function (it, i) {
      return '<li><button type="button" role="option" aria-selected="' + (i === 0) + '" ' +
        'class="svcpick__opt' + (i === 0 ? ' is-on' : '') + '" ' +
        'data-svcpick-opt data-label="' + esc(it.label) + '" data-id="' + esc(it.id) + '">' +
        '<span class="svcpick__name">' + esc(it.label) + '</span>' +
        '<span class="svcpick__group">' + esc(it.group) + '</span>' +
        '</button></li>';
    }).join('');
    listEl.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function svcClose(pick) {
    var listEl = pick.querySelector('[data-svcpick-list]');
    var input = pick.querySelector('[data-svcpick-input]');
    if (listEl) listEl.hidden = true;
    if (input) input.setAttribute('aria-expanded', 'false');
  }

  function svcMove(pick, step) {
    var opts = [].slice.call(pick.querySelectorAll('.svcpick__opt'));
    if (!opts.length) return;
    var i = opts.findIndex(function (o) { return o.classList.contains('is-on'); });
    var next = Math.max(0, Math.min(opts.length - 1, (i < 0 ? 0 : i) + step));
    opts.forEach(function (o, k) {
      o.classList.toggle('is-on', k === next);
      o.setAttribute('aria-selected', String(k === next));
    });
    if (opts[next].scrollIntoView) opts[next].scrollIntoView({ block: 'nearest' });
  }

  /* Adds whatever is chosen — a saved service, or the words she typed. The
     line lands empty of price on purpose: every job is priced for the job. */
  function svcAdd(pick, label, id) {
    var editor = pick.closest('.quote-editor');
    if (!editor) return;
    var name = String(label || '').trim();
    if (!name) return;
    var lines = editor.querySelector('.quote-lines');

    /* A single untouched starter line is replaced rather than left above
       the thing she actually picked. */
    var rows = lines.querySelectorAll('.qline');
    if (rows.length === 1) {
      var only = rows[0];
      var onlyPrice = (only.querySelector('.quote-price') || {}).value;
      var onlyDesc = (only.querySelector('.quote-description') || {}).value;
      if (!onlyPrice && !String(onlyDesc || '').trim() && !only.getAttribute('data-catalog-id')) {
        only.remove();
      }
    }

    lines.insertAdjacentHTML('beforeend',
      quoteLineHtml({ catalog_id: id || '', label: name, qty: 1, unit_dollars: '' }));
    updateQuoteTotal(editor);
    growAllDesc();

    var input = pick.querySelector('[data-svcpick-input]');
    input.value = '';
    svcClose(pick);
    input.focus();

    var added = editor.querySelectorAll('.qline');
    var el = added[added.length - 1];
    var priceEl = el && el.querySelector('.quote-price');
    if (priceEl) priceEl.focus();            // the one thing still to decide
  }

  function svcCommit(pick) {
    var on = pick.querySelector('.svcpick__opt.is-on');
    if (on) { svcAdd(pick, on.getAttribute('data-label'), on.getAttribute('data-id')); return; }
    var input = pick.querySelector('[data-svcpick-input]');
    svcAdd(pick, input.value, '');
  }

  function quoteEditorHtml(l, quote, opts) {
    quote = quote || {};
    opts = opts || {};
    var standalone = opts.standalone;
    /* Prefill for a quote started from a client card: she already has the
       person on screen, so retyping their name and address is work for
       nothing. Empty for the plain New Quote button. */
    var pre = opts.prefill || {};
    var seed = standalone
      ? { label: 'Cleaning service', notes: standardNote() }
      : quoteSeedFromLead(l);
    var defaultLabel = seed.label;
    var lines = (quote.line_items && quote.line_items.length)
      ? quote.line_items
      : (standalone ? [{ label: defaultLabel, qty: 1, unit_dollars: '' }] : catalogQuoteLinesFromLead(l));
    if (!lines.length) lines = [{ label: defaultLabel, qty: 1, unit_dollars: '' }];
    var notesVal = quote.notes != null && quote.notes !== '' ? quote.notes : seed.notes;
    /* What they ticked on the website. Kristina decides whether each one is
       thrown in or charged; the button puts them on the quote at $0.00 and
       she changes any of them that are not free. */
    var asked = list(l && l.add_ons);
    var nameParts = splitName(quote.customer_name || '');
    var customerFields = standalone
      ? '<p class="cgroup__k">Who it is for</p>' +
        '<div class="profile__grid compose__customer">' +
          '<label class="pf"><span class="pf__k">First name</span>' +
            '<input class="pf__v quote-first-name" type="text" autocomplete="given-name" placeholder="First" value="' +
            esc(nameParts.first) + '"></label>' +
          '<label class="pf"><span class="pf__k">Last name</span>' +
            '<input class="pf__v quote-last-name" type="text" autocomplete="family-name" placeholder="Last" value="' +
            esc(nameParts.last) + '"></label>' +
          '<label class="pf"><span class="pf__k">Email</span><input class="pf__v quote-email" type="email" placeholder="name@email.com" value="' +
            esc(quote.customer_email || '') + '"></label>' +
          '<label class="pf"><span class="pf__k">Phone</span><input class="pf__v quote-phone" type="tel" placeholder="Optional" value="' +
            esc(pre.phone || '') + '"></label>' +
        '</div>' +
        '<p class="cgroup__k">Where the job is</p>' +
        '<div class="profile__grid compose__customer">' +
          '<label class="pf"><span class="pf__k">ZIP</span>' +
            '<input class="pf__v quote-zip" type="text" data-zip-lookup inputmode="numeric" autocomplete="postal-code" placeholder="5-digit ZIP" maxlength="10" value="' +
              esc(pre.zip || '') + '"></label>' +
          '<label class="pf pf--wide addr-suggest"><span class="pf__k">Street address</span>' +
            '<div class="addr-suggest__wrap">' +
              '<input class="pf__v quote-address" type="text" data-address-suggest autocomplete="off"' +
                (pre.zip ? '' : ' disabled') + ' placeholder="' + (pre.zip ? 'Street address' : 'Enter ZIP first') +
                '" value="' + esc(pre.address || '') + '">' +
              '<ul class="addr-suggest__list" hidden role="listbox"></ul>' +
            '</div>' +
            '<span class="addr-suggest__hint">ZIP first, then street — suggestions stay in that ZIP</span></label>' +
          '<label class="pf"><span class="pf__k">City</span><select class="pf__v quote-city">' +
            oasisCities(pre.city).map(function (c) {
              return '<option value="' + esc(c) + '"' +
                (pre.city && c === pre.city ? ' selected' : '') + '>' + esc(c || '—') + '</option>';
            }).join('') + '</select></label>' +
          '<label class="pf"><span class="pf__k">Service</span><input class="pf__v quote-service" type="text" placeholder="What the job is" value=""></label>' +
        '</div>' +
        /* The same property block the lead profile has. A quote written from
           scratch is for a real house too, and typing beds and baths by hand
           when the address is already there is work for nothing. */
        '<div class="compose__property">' +
          '<p class="cgroup__k cgroup__k--split">About the place' +
            '<button type="button" class="btn btn--ghost btn--tiny" data-compose-lookup>' +
              'Fill from the address</button></p>' +
          '<p class="profile__lookup-msg" data-compose-lookup-msg hidden></p>' +
          '<div class="profile__grid">' +
            '<label class="pf"><span class="pf__k">Bedrooms</span>' +
              '<input class="pf__v quote-bedrooms" type="text" inputmode="numeric" placeholder="—" value="' + esc(pre.bedrooms || '') + '"></label>' +
            '<label class="pf"><span class="pf__k">Bathrooms</span>' +
              '<input class="pf__v quote-bathrooms" type="text" inputmode="decimal" placeholder="—" value="' + esc(pre.bathrooms || '') + '"></label>' +
            '<label class="pf"><span class="pf__k">Size</span>' +
              '<input class="pf__v quote-size" type="text" placeholder="e.g. 1,850 sq ft" value="' + esc(pre.size_label || '') + '"></label>' +
            '<label class="pf"><span class="pf__k">Property</span>' +
              '<input class="pf__v quote-property-type" type="text" placeholder="House, condo, office" value="' + esc(pre.property_type || '') + '"></label>' +
          '</div>' +
        '</div>'
      : '<label class="pf"><span class="pf__k">Send to</span><input class="pf__v quote-email" type="email" value="' +
          esc(quote.customer_email || l.email) + '"></label>';
    // A quote she has already sent is revised and re-sent in one press: the
    // editor saves the new lines and mails them without a second trip.
    var alreadyOut = !standalone && !!quote.id && quote.status && quote.status !== 'draft';
    var summary = standalone ? 'Build a brand-new quote'
      : alreadyOut ? 'Revise the quote you sent'
      : (quote.id ? 'Edit Draft' : 'Start Quote');
    return (standalone ? '' : '<details class="acc" open id="quote-composer"><summary class="acc__sum"><span class="acc__icon"></span>' + summary + '</summary><div class="acc__in">') +
      '<div class="quote-editor"' + (standalone ? ' data-standalone="1"' : '') +
        (alreadyOut ? ' data-already-out="1"' : '') +
        ' data-quote-id="' + esc(quote.id || '') + '" data-lead-id="' + esc(l ? l.id : '') + '"' +
        (asked.length ? ' data-asked="' + esc(JSON.stringify(asked)) + '"' : '') + '>' +
      customerFields +
      '<p class="cgroup__k">What the job includes</p>' +
      '<div class="quote-lines">' + lines.map(quoteLineHtml).join('') + '</div>' +
      /* Adding a line is the main way a quote gets built — the saved list is
         the shortcut, not the other way round — so it is a full-width button
         under the lines rather than a tiny link beside them. */
      /* This was a full-width teal slab — the loudest thing on the screen,
         louder than Send. It is something she presses several times while
         building, not the thing she is building towards. */
      '<div class="quote-lines-actions">' +
        '<button type="button" class="btn btn--add" data-add-line>' +
          '+ Add a line</button>' +
        /* The add-ons this customer ticked on the website, each as its own
           line at $0.00 so the quote reads "Included" against them. The old
           button pasted a sentence listing the whole catalogue into the
           description instead, which named things they never asked for. */
        (asked.length
          ? '<button type="button" class="btn btn--add btn--add-asked" data-add-asked>' +
              '+ Add their add-on' + (asked.length === 1 ? '' : 's') +
              ' (' + asked.length + ')</button>'
          : '') +
      '</div>' +
      /* Both ways of adding a line belong together, above the running total
         rather than under it. */
      quoteCatalogHtml() +
      '<div class="quote-total" data-quote-total>' + money(calcLineTotal(lines)) + '</div>' +
      '<p class="cgroup__k">A note to them <span class="cgroup__hint">— appears on the quote as a note from you</span></p>' +
      '<label class="pf pf--wide pf--note"><span class="sr-only">Note</span><textarea class="pf__v quote-notes" rows="3">' +
        esc(notesVal || '') + '</textarea></label>' +
      (alreadyOut
        ? '<p class="quote-revise-note muted">' +
            'This one is already with ' + esc((quote.customer_name || l && l.name || 'the customer').split(' ')[0]) +
            '. Saving updates it at the same link straight away \u2014 the link never stops working. ' +
            'Resend only when you want them emailed about the change.</p>'
        : '') +
      '<div class="quote-actions quote-actions--sticky">' +
        '<button type="button" class="btn btn--ghost" data-save-quote>' +
          (alreadyOut ? 'Save without sending' : 'Save Draft') + '</button>' +
        '<button type="button" class="btn btn--primary" data-send-quote>' +
          (alreadyOut ? 'Update &amp; resend' : 'Send to Customer') + '</button></div>' +
      '<div class="quote-msg form-status" role="alert" hidden></div></div>' +
      (standalone ? '' : '</div></details>');
  }

  function newQuotePanelHtml() {
    var c = state.composeFor;
    /* Started from a client card: their name, their number and the address
       we already hold are in the form before she types anything. The first
       address is used, and she can change it — a client with six rentals
       picks the right one in the field. */
    var place = c ? clientPlaces(c)[0] || {} : {};
    var pre = c ? {
      phone: FMT.formatPhone(c.phone) || c.phone || '', address: place.address || '', city: place.city || '',
      zip: place.zip || '', bedrooms: place.bedrooms || '', bathrooms: place.bathrooms || '',
      size_label: place.size_label || '', property_type: place.property_type || ''
    } : {};
    var quote = c ? { customer_name: c.name || c.company || '', customer_email: c.email || '' } : {};

    return '<section class="compose" aria-labelledby="compose-title">' +
      '<div class="compose__head">' +
        '<div class="compose__titles">' +
          '<h2 id="compose-title" class="compose__title">' +
            (c ? 'New quote for ' + esc(c.company || c.name) : 'New Quote') + '</h2>' +
          '<p class="compose__sub muted">' +
            (c ? 'Their details are filled in. Change anything that is not right for this job.'
               : 'Price and send now — also saves a customer card.') + '</p>' +
        '</div>' +
        '<button type="button" class="btn btn--ghost btn--tiny" data-close-compose>Cancel</button>' +
      '</div>' +
      quoteEditorHtml(null, quote, { standalone: true, prefill: pre }) +
    '</section>';
  }

  function newLeadPanelHtml() {
    return '<section class="compose compose--lead" aria-labelledby="compose-lead-title">' +
      '<div class="compose__head">' +
        '<div class="compose__titles">' +
          '<h2 id="compose-lead-title" class="compose__title">New Lead</h2>' +
          '<p class="compose__sub muted">Log a call or walk-in. Quote them later from their profile.</p>' +
        '</div>' +
        '<button type="button" class="btn btn--ghost btn--tiny" data-close-compose-lead>Cancel</button>' +
      '</div>' +
      '<p class="cgroup__k">Who is calling</p>' +
      '<div class="profile__grid compose__customer">' +
        '<label class="pf"><span class="pf__k">First name *</span><input class="pf__v" type="text" data-lead-field="first_name" autocomplete="given-name"></label>' +
        '<label class="pf"><span class="pf__k">Last name</span><input class="pf__v" type="text" data-lead-field="last_name" autocomplete="family-name"></label>' +
        '<label class="pf"><span class="pf__k">Phone *</span><input class="pf__v" type="tel" data-lead-field="phone" autocomplete="tel"></label>' +
        '<label class="pf"><span class="pf__k">Email</span><input class="pf__v" type="email" data-lead-field="email" autocomplete="email"></label>' +
      '</div>' +
      '<p class="cgroup__k">Where the job is</p>' +
      '<div class="profile__grid compose__customer">' +
        '<label class="pf"><span class="pf__k">ZIP</span>' +
          '<input class="pf__v" type="text" data-lead-field="zip" data-zip-lookup inputmode="numeric" autocomplete="postal-code" placeholder="5-digit ZIP" maxlength="10"></label>' +
        '<label class="pf pf--wide addr-suggest"><span class="pf__k">Street address</span>' +
          '<div class="addr-suggest__wrap">' +
            '<input class="pf__v" type="text" data-lead-field="address" data-address-suggest autocomplete="off" disabled ' +
              'placeholder="Enter ZIP first">' +
            '<ul class="addr-suggest__list" hidden role="listbox"></ul>' +
          '</div>' +
          '<span class="addr-suggest__hint">ZIP first, then street — suggestions stay in that ZIP</span></label>' +
        '<label class="pf"><span class="pf__k">City</span><select class="pf__v" data-lead-field="city">' +
          oasisCities().map(function (c) {
            return '<option value="' + esc(c) + '">' + esc(c || '—') + '</option>';
          }).join('') + '</select></label>' +
        '<label class="pf pf--wide"><span class="pf__k">Service</span><input class="pf__v" type="text" data-lead-field="service" placeholder="What the job is"></label>' +
      '</div>' +

      /* The website asks eighteen things; this asked eight, so a job phoned
         in arrived thinner than the same job typed in and she had to ring
         back for the rest. These are the ones worth having while they are
         still on the line — all optional, none of them in the way. */
      '<details class="acc acc--extras"><summary class="acc__sum">' +
        '<span class="acc__icon" aria-hidden="true"></span>While you have them on the phone' +
      '</summary><div class="acc__in">' +
        '<label class="pf"><span class="pf__k">Bedrooms</span>' +
          '<input class="pf__v" type="text" inputmode="numeric" data-lead-field="bedrooms" placeholder="—"></label>' +
        '<label class="pf"><span class="pf__k">Bathrooms</span>' +
          '<input class="pf__v" type="text" inputmode="decimal" data-lead-field="bathrooms" placeholder="—"></label>' +
        '<label class="pf"><span class="pf__k">Size</span>' +
          '<input class="pf__v" type="text" data-lead-field="size_label" placeholder="e.g. 1,850 sq ft"></label>' +
        '<label class="pf"><span class="pf__k">Property</span>' +
          '<input class="pf__v" type="text" data-lead-field="property_type" placeholder="House, condo, office"></label>' +
        '<label class="pf"><span class="pf__k">How often</span><select class="pf__v" data-lead-field="frequency">' +
          [''].concat(oasisFrequencies()).map(function (f) {
            return '<option value="' + esc(f) + '">' + esc(f || '—') + '</option>';
          }).join('') + '</select></label>' +
        '<label class="pf"><span class="pf__k">Start when</span>' +
          '<input class="pf__v" type="text" data-lead-field="start_when" placeholder="e.g. next week"></label>' +
        '<label class="pf"><span class="pf__k">Best time</span><select class="pf__v" data-lead-field="best_time">' +
          ['', 'Morning', 'Afternoon', 'Evening', 'Any time'].map(function (o) {
            return '<option value="' + esc(o) + '">' + esc(o || '—') + '</option>';
          }).join('') + '</select></label>' +
        '<label class="pf"><span class="pf__k">Prefers</span><select class="pf__v" data-lead-field="contact_pref">' +
          ['', 'Text', 'Call', 'Email'].map(function (o) {
            return '<option value="' + esc(o) + '">' + esc(o || '—') + '</option>';
          }).join('') + '</select></label>' +
        '<label class="pf pf--wide"><span class="pf__k">Getting in</span>' +
          '<input class="pf__v" type="text" data-lead-field="access" placeholder="Lockbox, gate code"></label>' +
      '</div></details>' +

      '<p class="cgroup__k">What they said</p>' +
      '<div class="profile__grid compose__customer">' +
        '<label class="pf pf--wide pf--note"><span class="pf__k">Notes</span><textarea class="pf__v" data-lead-field="notes" rows="3" placeholder="What they asked for on the call"></textarea></label>' +
      '</div>' +
      '<div class="quote-actions">' +
        '<button type="button" class="btn btn--primary" data-save-lead>Save lead</button>' +
      '</div>' +
      '<div class="compose-lead__msg form-status" role="alert" hidden></div>' +
    '</section>';
  }

  function saveNewLead() {
    var panel = root.querySelector('.compose--lead');
    if (!panel) return;
    function get(field) {
      var el = panel.querySelector('[data-lead-field="' + field + '"]');
      return el ? String(el.value || '').trim() : '';
    }
    var payload = {
      name: joinName(get('first_name'), get('last_name')),
      phone: get('phone'),
      email: get('email'),
      address: get('address'),
      city: get('city'),
      zip: get('zip'),
      service_label: get('service') || 'Phone inquiry',
      notes: get('notes'),
      // The optional block. Empty strings are harmless; the endpoint cleans
      // them and stores nothing where she had nothing to tell it.
      bedrooms: get('bedrooms'),
      bathrooms: get('bathrooms'),
      size_label: get('size_label'),
      property_type: get('property_type'),
      frequency: get('frequency'),
      start_when: get('start_when'),
      best_time: get('best_time'),
      contact_pref: get('contact_pref'),
      access: get('access')
    };
    api('/api/admin/leads', { method: 'POST', body: JSON.stringify(payload) })
      .then(function (r) {
        var msg = panel.querySelector('.compose-lead__msg');
        if (!r.ok) {
          if (msg) {
            msg.hidden = false;
            msg.className = 'compose-lead__msg form-status form-status--err';
            msg.textContent = r.body.error || 'Could not save.';
          }
          return;
        }
        state.composingLead = false;
        state.open = r.body.lead.id;
        state.leadTab[r.body.lead.id] = 'intake';
        load();
      });
  }

  function calcLineTotal(lines, includeOptional) {
    return (lines || []).reduce(function (sum, line) {
      if (line.optional && !includeOptional) return sum;
      var qty = Math.max(1, parseInt(line.qty, 10) || 1);
      var unit = line.unit_price != null ? line.unit_price : parseDollars(line.unit_dollars);
      return sum + qty * unit;
    }, 0);
  }

  function parseEventDetail(raw) {
    try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }

  /* What happened to the quote after she pressed send, as chips rather than
     a line of grey text that looked the same as the address above it. The
     one she can act on — sent, never opened — is marked as such. */
  function trackingChips(q) {
    var chips = [];
    var add = function (label, tone) {
      chips.push('<span class="qtrack__chip' + (tone ? ' qtrack__chip--' + tone : '') + '">' +
        esc(label) + '</span>');
    };
    if (q.email_status && q.email_status !== 'pending') {
      var failed = q.email_status === 'failed' || q.email_status === 'bounced';
      add(EMAIL_STATUS_LABELS[q.email_status] || q.email_status, failed ? 'bad' : 'ok');
    }
    if (q.first_viewed_at) {
      add('Opened' + (q.view_count > 1 ? ' ' + q.view_count + '\u00d7' : '') +
        ' \u00b7 last ' + when(q.last_viewed_at || q.first_viewed_at), 'ok');
    }
    if (q.accepted_at) add('Accepted ' + when(q.accepted_at), 'yes');
    else if (q.declined_at) add('Declined ' + when(q.declined_at), 'bad');
    else if (q.status === 'sent' && !q.first_viewed_at) add('Not opened yet', 'wait');
    return chips.length ? '<p class="qtrack">' + chips.join('') + '</p>' : '';
  }

  /* A user-agent string is 200 characters nobody wants to read. She wants to
     know it was a phone, not which build of WebKit. */
  function deviceOf(ua) {
    var u = String(ua || '');
    if (/iPhone|iPod/i.test(u)) return 'iPhone';
    if (/iPad/i.test(u)) return 'iPad';
    if (/Android/i.test(u)) return /Mobile/i.test(u) ? 'Android phone' : 'Android tablet';
    if (/Macintosh|Mac OS X/i.test(u)) return 'Mac';
    if (/Windows/i.test(u)) return 'Windows PC';
    if (/Linux/i.test(u)) return 'Linux';
    return 'unknown device';
  }

  function quoteTimeline(q) {
    var events = (q.events || []).slice().sort(function (a, b) {
      return String(a.created_at).localeCompare(String(b.created_at));
    });
    if (!events.length) return '';
    return '<details class="acc acc--nested"><summary class="acc__sum acc__sum--sm"><span class="acc__icon"></span>Activity Timeline</summary><div class="acc__in">' +
      '<div class="quote-timeline">' + events.map(function (ev, i) {
        var detail = parseEventDetail(ev.detail);
        var meta = fullDate(ev.created_at);
        if (ev.kind === 'sent' && detail && detail.to) {
          meta += ' · ' + detail.to + (detail.resend ? ' (resend)' : '');
        }
        if (ev.kind === 'declined' && detail && detail.reason) meta += ' · “' + detail.reason + '”';
        if (ev.kind === 'accepted' && detail && detail.add_ons && detail.add_ons.length) {
          meta += ' · Add-ons: ' + detail.add_ons.map(function (a) { return a.label || a.id; }).join(', ');
        }
        if (ev.kind === 'reopened' && detail && detail.reason) meta += ' · “' + detail.reason + '”';
        // Captured data with nowhere to read it is not captured, it is hoarded.
        if ((ev.kind === 'accepted' || ev.kind === 'declined') && detail) {
          var place = [detail.city, detail.region, detail.country].filter(Boolean).join(', ');
          if (place) meta += ' · from ' + place;
          if (detail.ip) meta += ' · ' + detail.ip;
          if (detail.userAgent) meta += ' · ' + deviceOf(detail.userAgent);
        }
        var kindLabel = (ev.kind === 'sent' && detail && detail.resend)
          ? 'Email Resent'
          : (EVENT_LABELS[ev.kind] || ev.kind);
        return '<div class="quote-timeline__item' + (i === events.length - 1 ? ' is-last' : '') + '">' +
          '<span class="quote-timeline__dot"></span><div class="quote-timeline__body"><strong>' +
          esc(kindLabel) + '</strong><span class="muted">' + esc(meta) + '</span></div></div>';
      }).join('') + '</div></div></details>';
  }

  function quoteCard(q) {
    var summary = trackingChips(q);
    var isArchived = !!q.archived_at;
    var canResend = !isArchived && (q.status === 'sent' || q.status === 'declined');
    var to = q.customer_email || '';
    var proposalUrl = (typeof location !== 'undefined' ? location.origin : '') + '/proposal?t=' + q.token;
    var acts = '';
    if (canResend) {
      acts += '<button type="button" class="btn btn--primary btn--tiny" data-quote-action="resend" data-quote-id="' +
        esc(q.id) + '" data-quote-email="' + esc(to) + '">Resend</button>';
    }
    // An accepted quote is not edited in place — it is reopened first, which
    // is a deliberate act with a reason and a date against it.
    if (q.status !== 'draft') {
      acts += '<a class="btn btn--ghost btn--tiny" href="/api/admin/quotes/pdf?id=' + esc(q.id) +
        '" target="_blank" rel="noopener">PDF</a>';
    }
    if (!isArchived && q.status === 'accepted') {
      acts += '<button type="button" class="btn btn--ghost btn--tiny" data-quote-action="reopen" data-quote-id="' +
        esc(q.id) + '">Reopen</button>';
    } else if (!isArchived && q.status !== 'draft') {
      acts += '<button type="button" class="btn btn--ghost btn--tiny" data-quote-action="edit" data-quote-id="' +
        esc(q.id) + '">Edit</button>';
    }
    if (isArchived) {
      acts +=
        '<button type="button" class="btn btn--ghost btn--tiny" data-quote-action="restore" data-quote-id="' + esc(q.id) + '">Restore</button>' +
        '<button type="button" class="btn btn--danger btn--tiny" data-quote-action="delete" data-quote-id="' + esc(q.id) + '">Delete</button>';
    } else {
      acts +=
        '<button type="button" class="btn btn--ghost btn--tiny" data-quote-action="archive" data-quote-id="' + esc(q.id) + '">Archive</button>' +
        '<button type="button" class="btn btn--danger btn--tiny" data-quote-action="delete" data-quote-id="' + esc(q.id) + '">Delete</button>';
    }
    return '<details class="acc acc--quote" data-quote-id="' + esc(q.id) + '"' + (q.status === 'sent' && !isArchived ? ' open' : '') + '>' +
      '<summary class="acc__sum acc__sum--quote">' +
        '<span class="acc__icon" aria-hidden="true"></span>' + esc(money(q.total)) + ' · ' + esc(QUOTE_STATUS_LABELS[q.status] || q.status) +
        (isArchived ? ' · Archived' : '') +
        '<span class="muted" style="margin-left:.5rem;font-weight:400">' + esc(when(q.created_at)) + '</span></summary>' +
      /* The summary line this opens from already reads "$250.00 · Sent", and
         the lead header above carries the same pill — three times on one
         screen, the middle one stretched across the card by the grid. */
      '<div class="acc__in quote-card-mini">' +
        (q.status !== 'draft' && q.token
          ? '<span class="quote-link">' +
              '<a href="/proposal?t=' + esc(q.token) + '" target="_blank" rel="noopener">Customer link</a>' +
              '<button type="button" class="btn btn--ghost btn--tiny" data-copy-link data-link="' + esc(proposalUrl) + '">Copy link</button>' +
            '</span>'
          : '') +
        (to ? '<p class="quote-card-mini__track muted">To ' + esc(to) + '</p>' : '') +
        summary +
        quoteTimeline(q) +
        '<div class="quote-card-mini__acts">' + acts + '</div></div></details>';
  }

  /* ------------------------------------------------------------- settings
     Grouped the way she would ask the questions — how quotes look, how they
     behave, what she wants to hear about — rather than the way they are
     stored. Every field says what it is for underneath, so nothing needs
     explaining twice. */
  var SETTING_GROUPS = [
    { title: 'Your quotes', keys: ['quote_from_name', 'quote_signoff'] },
    { title: 'How quotes behave', keys: ['quote_expiry_days', 'quote_terms', 'quote_note'] },
    { title: 'What you hear about', keys: ['notify_email', 'notify_on_request', 'notify_on_accept',
                                           'notify_on_decline', 'notify_on_followup', 'notify_on_view'] }
  ];

  function settingField(f, value) {
    var id = 'set-' + f.key;
    var hint = f.hint ? '<span class="set__hint">' + esc(f.hint) + '</span>' : '';
    if (f.type === 'toggle') {
      var on = String(value).toLowerCase() === 'yes';
      return '<div class="set set--toggle">' +
        '<label class="set__switch" for="' + id + '">' +
          '<input type="checkbox" id="' + id + '" data-setting="' + esc(f.key) + '"' + (on ? ' checked' : '') + '>' +
          '<span class="set__track" aria-hidden="true"></span>' +
          '<span class="set__label">' + esc(f.label) + '</span>' +
        '</label>' + hint + '</div>';
    }
    /* Its own class rather than .pf__v. That one is deliberately borderless
       because the lead profile is edited in place; here they are ordinary form
       fields. Borrowing it meant the number box and the two textareas came out
       with no border or background at all, purely because site.css happens to
       name input[type=text] and the others by attribute and so outranks a
       class — while `textarea` alone does not. */
    var input = f.type === 'textarea'
      ? '<textarea id="' + id + '" class="set__input" rows="3" data-setting="' + esc(f.key) + '">' + esc(value || '') + '</textarea>'
      : '<input id="' + id + '" class="set__input" type="' + (f.type === 'number' ? 'number' : f.type === 'email' ? 'email' : 'text') + '"' +
        (f.type === 'number' ? ' min="1" max="365" inputmode="numeric"' : '') +
        ' data-setting="' + esc(f.key) + '" value="' + esc(value || '') + '">';
    return '<div class="set">' +
      '<label class="set__label" for="' + id + '">' + esc(f.label) +
        (f.suffix ? ' <span class="muted">(' + esc(f.suffix) + ')</span>' : '') + '</label>' +
      input + hint + '</div>';
  }

  var HEALTH_LABELS = {
    database: ['Database', 'Leads, quotes and settings are saved.'],
    settingsStored: ['Settings storage', 'This page can remember your choices.'],
    quotes: ['Branded quotes', 'You can build and send quotes.'],
    customers: ['Customers & properties', 'One customer can have several addresses.'],
    email: ['Sending email', 'Quotes and alerts can leave the site.'],
    emailTracking: ['Delivery tracking', 'You can see when a quote was delivered and opened.'],
    propertyLookup: ['Property lookup', 'Fill beds, baths and square feet from an address.'],
    spamCheck: ['Spam check', 'Hidden field, timing and rate limits on the public form.'],
    extraSpamCheck: ['Turnstile', 'Cloudflare\u2019s human check, on top of the built-in one.']
  };

  function settingsHtml() {
    if (!state.settings) return '<p class="empty">Loading your settings…</p>';
    var fields = {};
    (state.settingsFields || []).forEach(function (f) { fields[f.key] = f; });

    /* With no settings table behind it the server sends no fields, and each
       group used to render as a titled box with nothing inside it — three
       dead ends and no hint that Check and update is what fixes them. */
    var anyFields = (state.settingsFields || []).length > 0;
    /* A field the server sends that no group lists would never be drawn, and
       nothing would say so. Anything unaccounted for gets its own group. */
    var placed = {};
    SETTING_GROUPS.forEach(function (g) { g.keys.forEach(function (k) { placed[k] = true; }); });
    var strays = (state.settingsFields || []).filter(function (f) { return !placed[f.key]; });
    var allGroups = strays.length
      ? SETTING_GROUPS.concat([{ title: 'Everything else', keys: strays.map(function (f) { return f.key; }) }])
      : SETTING_GROUPS;

    var groups = anyFields
      ? allGroups.map(function (g) {
          var body = g.keys.map(function (k) {
            return fields[k] ? settingField(fields[k], state.settings[k]) : '';
          }).join('');
          if (!body) return '';
          return '<section class="card set-group">' +
            '<h3 class="set-group__title">' + esc(g.title) + '</h3>' + body + '</section>';
        }).join('')
      : '<section class="card set-group"><h3 class="set-group__title">Your settings</h3>' +
        '<p class="muted set-group__none">There is nowhere to save them yet. Press ' +
        '<strong>Check and update</strong> below and they will appear here — the site works ' +
        'without them in the meantime.</p></section>';

    /* Turnstile needs a secret in Cloudflare AND a site key in the site. With
       only the secret, the form rejects every real customer — so the two halves
       are reported separately and a half-finished setup is called out. */
    var siteKey = !!(window.OASIS && window.OASIS.turnstileSiteKey);
    var secret = !!state.health.extraSpamCheck;
    var turnstileWarning = (secret && !siteKey)
      ? '<p class="health-warn"><strong>Turnstile is half set up.</strong> The secret is in Cloudflare ' +
        'but the site key is missing from the site, so the quote form is turning real customers away. ' +
        'Add the site key, or remove <code>TURNSTILE_SECRET_KEY</code> in Cloudflare to switch it off.</p>'
      : (siteKey && !secret)
        ? '<p class="health-warn"><strong>Turnstile is half set up.</strong> The site key is in the site ' +
          'but the secret is missing from Cloudflare, so the check is shown but never verified.</p>'
        : '';

    /* Resend switches an endpoint off after it keeps rejecting events, and a
       wrong signing secret rejects every one of them. Say which of the three
       states it is in, because the fix differs, and say that the endpoint has
       to be switched back on afterwards — fixing the secret alone leaves it
       disabled and nothing starts flowing again. */
    var ws = state.webhookSecret || {};
    var webhookWarning = '';
    if (ws.problem === 'api-key') {
      webhookWarning = '<p class="health-warn"><strong>Delivery tracking has the wrong key.</strong> ' +
        '<code>RESEND_WEBHOOK_SECRET</code> in Cloudflare is an API key (it starts with <code>re_</code>). ' +
        'It needs the signing secret from the webhook\u2019s own page in Resend, which starts with ' +
        '<code>whsec_</code>. Then switch the endpoint back on in Resend.</p>';
    } else if (ws.problem === 'not-base64' || ws.problem === 'too-short') {
      webhookWarning = '<p class="health-warn"><strong>Delivery tracking has an unreadable secret.</strong> ' +
        '<code>RESEND_WEBHOOK_SECRET</code> in Cloudflare is set but is not a signing secret \u2014 it may ' +
        'have been cut short when it was pasted. Copy it again from the webhook\u2019s page in Resend, ' +
        'then switch the endpoint back on there.</p>';
    } else if (ws.usable && state.webhookLast && state.webhookLast.ok === false) {
      /* The shape is right but Resend's own deliveries are being turned away,
         which only ever means the secret is not the one Resend signs with. */
      webhookWarning = '<p class="health-warn"><strong>Delivery tracking is being refused.</strong> ' +
        'Resend\u2019s last update' + (state.webhookLast.at ? ' (' + esc(FMT.formatStamp(state.webhookLast.at)) + ')' : '') +
        ' was rejected, so <code>RESEND_WEBHOOK_SECRET</code> in Cloudflare is not the one Resend is signing ' +
        'with. Copy the signing secret again from the webhook\u2019s page in Resend, then switch the endpoint ' +
        'back on there \u2014 Resend turns it off after repeated failures.</p>';
    } else if (ws.problem === 'missing') {
      webhookWarning = '<p class="health-warn"><strong>Delivery tracking is off.</strong> Quotes still send ' +
        'and arrive normally \u2014 this only tells you whether one was delivered and opened. To switch it ' +
        'on, add <code>RESEND_WEBHOOK_SECRET</code> in Cloudflare from the webhook\u2019s page in Resend.</p>';
    }

    var health = Object.keys(HEALTH_LABELS).map(function (k) {
      var on = k === 'extraSpamCheck' ? (secret && siteKey) : !!state.health[k];
      var l = HEALTH_LABELS[k];
      return '<li class="health' + (on ? ' is-on' : '') + '">' +
        '<span class="health__dot" aria-hidden="true"></span>' +
        '<span class="health__body"><strong>' + esc(l[0]) + '</strong>' +
        '<span class="muted">' + esc(on ? l[1] : 'Not set up yet.') + '</span></span>' +
        '<span class="health__state">' + (on ? 'On' : 'Off') + '</span></li>';
    }).join('');

    /* Anything the site can switch on for itself gets a button rather than an
       instruction to go and paste SQL somewhere. The button is always here:
       it is safe to press twice, and a release that adds a field needs it
       again even when every feature already reads as on. */
    var schema = state.schema || {};
    var behind = (schema.missingTables || []).length + (schema.missingColumns || []).length;
    var setupPanel = '<div class="setup-cta' + (behind ? ' is-needed' : '') + '">' +
      '<p>' + (behind
        ? '<strong>The database is ' + behind + ' item' + (behind === 1 ? '' : 's') +
          ' behind the site.</strong> Some screens will not work until this is run.'
        : '<strong>Everything is up to date.</strong> Run this again any time — ' +
          'after an update, or if a screen says something is missing.') + '</p>' +
      '<button type="button" class="btn btn--' + (behind ? 'primary' : 'ghost') + '" data-run-setup>' +
        (behind ? 'Bring it up to date' : 'Check and update') + '</button>' +
      '<span class="setup-cta__msg form-status" role="status" hidden></span>' +
    '</div>';

    return '<div class="settings">' + groups +
      '<section class="card set-group">' +
        '<h3 class="set-group__title">What this site can do</h3>' +
        '<p class="muted set-group__lead">Nothing here is broken — the site works without all of it.</p>' +
        setupPanel +
        '<ul class="health-list">' + health + '</ul>' +
        turnstileWarning + webhookWarning +
      '</section>' +
      /* Nothing to save when there are no fields, and a Save button that can
         only fail is worse than no button. */
      (anyFields
        ? '<div class="settings__save">' +
            '<button type="button" class="btn btn--primary" data-save-settings>Save settings</button>' +
            '<span class="settings__msg form-status" role="status" hidden></span>' +
          '</div>'
        : '') +
      '</div>';
  }

  function loadSettings() {
    api('/api/admin/settings').then(function (r) {
      if (!r.ok) {
        state.settings = {}; state.settingsFields = []; state.health = {}; state.webhookSecret = {}; state.webhookLast = null;
        render();
        return;
      }
      state.settings = r.body.settings;
      state.standardNote = r.body.settings.quote_note || '';
      state.settingsFields = r.body.fields;
      state.health = r.body.health || {};
      state.schema = r.body.schema || {};
      state.webhookSecret = r.body.webhookSecret || {};
      state.webhookLast = r.body.webhookLast || null;
      render();
    });
  }

  function runSetup(btn) {
    var msg = root.querySelector('.setup-cta__msg');
    btn.disabled = true;
    var label = btn.textContent;
    btn.textContent = 'Setting up…';
    var show = function (text, ok) {
      if (!msg) return;
      msg.hidden = false;
      msg.textContent = text;
      msg.className = 'setup-cta__msg form-status ' + (ok ? 'form-status--ok' : 'form-status--err');
    };
    api('/api/admin/setup', { method: 'POST' }).then(function (r) {
      btn.disabled = false;
      btn.textContent = label;
      if (!r.ok) { show(r.body.error || 'That did not work.', false); return; }
      show(r.body.message || 'Done.', true);
      loadSettings();                       // the list re-reads itself
    });
  }

  function saveSettingsFromForm() {
    var patch = {};
    root.querySelectorAll('[data-setting]').forEach(function (el) {
      patch[el.getAttribute('data-setting')] =
        el.type === 'checkbox' ? (el.checked ? 'yes' : 'no') : el.value;
    });
    var msg = root.querySelector('.settings__msg');
    api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(patch) })
      .then(function (r) {
        if (msg) {
          msg.hidden = false;
          msg.textContent = r.ok ? 'Saved.' : (r.body.error || 'Could not save.');
          msg.className = 'settings__msg form-status ' + (r.ok ? 'form-status--ok' : 'form-status--err');
        }
        if (r.ok && r.body.settings) state.settings = r.body.settings;
      });
  }

  /* ---------------------------------------------------------------- clients
     A person or a company, and every address of theirs. This is the screen
     that answers "who is this and what else do we clean for them", which the
     flat list of requests never could. */
  /* What she has actually done for them. The endpoint has counted this all
     along; nothing showed it, so the screen was a list of names and nothing
     else. */
  function statsRow(c) {
    var bits = [];
    var q = Number(c.quote_count || 0), a = Number(c.accepted_count || 0);
    var paid = Number(c.paid_total || 0);
    if (q) bits.push(q + (q === 1 ? ' quote' : ' quotes'));
    if (a) bits.push(a + ' accepted');
    if (paid > 0) bits.push(money(paid) + ' paid');
    if (!bits.length) {
      var leads = Number(c.lead_count || 0);
      bits.push(leads ? leads + (leads === 1 ? ' request' : ' requests') + ', nothing quoted yet'
                      : 'Nothing yet');
    }
    return '<p class="ccard__stats">' + bits.map(function (t) {
      return '<span>' + esc(t) + '</span>';
    }).join('') + '</p>';
  }

  /* Every address we know for this client. Property rows are the real
     record, but a request carries an address too — and until the portal
     started linking phoned-in jobs, those never became property rows. A
     client whose request plainly had an address was reading "No addresses
     recorded yet", so any address only a request knows about is shown as
     well, marked for what it is. */
  function clientPlaces(c) {
    var out = (c.properties || []).map(function (p) {
      return {
        id: p.id, label: p.label, address: p.address, city: p.city, zip: p.zip,
        bedrooms: p.bedrooms, bathrooms: p.bathrooms, size_label: p.size_label,
        property_type: p.property_type, saved: true
      };
    });
    var key = function (v) {
      return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    };
    var seen = {};
    out.forEach(function (p) { if (key(p.address)) seen[key(p.address)] = true; });
    (c.requests || []).forEach(function (l) {
      var k = key(l.address);
      if (!l.address || seen[k]) return;
      seen[k] = true;
      out.push({ address: l.address, city: l.city, zip: l.zip, saved: false });
    });
    return out;
  }

  function placeLine(p) {
    return [p.label, p.address, [p.city, p.zip].filter(Boolean).join(' ')]
      .filter(Boolean).join(' · ');
  }

  function placeSize(p) {
    return [p.bedrooms && p.bedrooms + ' bed', p.bathrooms && p.bathrooms + ' bath',
            p.size_label, p.property_type].filter(Boolean).join(' · ');
  }

  function clientPlacesHtml(places) {
    if (!places.length) {
      return '<p class="muted ccard__props-empty">No address yet. Add one, or it arrives with their next request.</p>';
    }
    return '<ul class="ccard__props">' + places.map(function (p) {
      var size = placeSize(p);
      return '<li><strong>' + esc(placeLine(p) || 'Address not filled in yet') + '</strong>' +
        (size ? '<span class="muted"> — ' + esc(size) + '</span>' : '') +
        (p.saved ? '' : '<span class="ccard__unsaved">from a request</span>') +
      '</li>';
    }).join('') + '</ul>';
  }

  /* What has actually happened for this person, newest first. This is the
     thing the screen was missing: a tile with two counts on it and no way
     to see what they were for. */
  function clientWorkHtml(c) {
    var reqs = c.requests || [];
    if (!reqs.length) {
      return '<p class="muted cprofile__none">Nothing requested yet.</p>';
    }
    return '<ul class="cwork">' + reqs.slice(0, 12).map(function (l) {
      var qc = Number(l.quote_count || 0);
      var bits = [];
      if (l.frequency) bits.push(l.frequency);
      if (qc) bits.push(qc === 1 ? '1 quote' : qc + ' quotes');
      if (l.accepted_total) bits.push(money(l.accepted_total) + ' accepted');
      return '<li class="cwork__row">' +
        '<button type="button" class="cwork__open" data-open-request="' + esc(l.id) + '">' +
          esc(l.service_label || l.service || 'Request') + '</button>' +
        pill(l.status || 'new') +
        '<span class="cwork__when muted">' + esc(when(l.created_at)) + '</span>' +
        (bits.length ? '<span class="cwork__meta muted">' + esc(bits.join(' · ')) + '</span>' : '') +
      '</li>';
    }).join('') + '</ul>' +
    (reqs.length > 12 ? '<p class="muted cprofile__none">and ' + (reqs.length - 12) + ' older</p>' : '');
  }

  function clientCard(c) {
    var places = clientPlaces(c);
    var name = c.company ? c.company : c.name;
    var second = c.company && c.name && c.company !== c.name ? c.name : '';
    var open = state.openClient === c.id;

    return '<article class="ccard' + (open ? ' is-open' : '') + '" data-customer-id="' + esc(c.id) + '">' +
      /* The name stays a heading so the list is still navigable by heading,
         and the button inside it is what opens the profile. */
      '<h3 class="ccard__h">' +
        '<button type="button" class="ccard__head" data-open-client="' + esc(c.id) + '" ' +
          'aria-expanded="' + (open ? 'true' : 'false') + '">' +
          '<span class="ccard__icon" aria-hidden="true"></span>' +
          '<span class="ccard__headin">' +
            '<span class="ccard__name">' + esc(name) + '</span>' +
            (second ? '<span class="muted ccard__second">' + esc(second) + '</span>' : '') +
          '</span>' +
          '<span class="ccard__count">' + (places.length || 'No') +
            (places.length === 1 ? ' address' : ' addresses') +
            '</span>' +
        '</button>' +
      '</h3>' +

      '<p class="ccard__reach">' +
        (c.phone ? '<a href="' + esc(FMT.telHref(c.phone)) + '">' + esc(FMT.formatPhone(c.phone)) + '</a>' : '') +
        (c.phone && c.email ? '<span class="muted"> · </span>' : '') +
        (c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '') +
        (c.best_time ? '<span class="muted"> · best ' + esc(c.best_time) + '</span>' : '') +
      '</p>' +

      clientPlacesHtml(open ? places : places.slice(0, 2)) +
      (!open && places.length > 2
        ? '<p class="muted ccard__props-empty">and ' + (places.length - 2) + ' more</p>' : '') +
      statsRow(c) +

      (open
        ? '<div class="cprofile">' +
            '<p class="cgroup__k">Their work</p>' +
            clientWorkHtml(c) +
            (c.notes ? '<p class="cgroup__k">Notes</p><p class="cprofile__notes">' + esc(c.notes) + '</p>' : '') +
            '<p class="cgroup__k">Since</p>' +
            '<p class="muted cprofile__none">First seen ' + esc(fullDate(c.created_at)) + '.' +
              (c.last_paid_at ? ' Last payment ' + esc(when(c.last_paid_at)) + '.' : '') + '</p>' +
          '</div>'
        : '') +

      '<div class="ccard__acts">' +
        '<button type="button" class="btn btn--primary btn--tiny" data-quote-client="' + esc(c.id) + '">' +
          'Start a quote</button>' +
        '<button type="button" class="btn btn--ghost btn--tiny" data-client-work="' + esc(c.name || '') + '">' +
          'See their requests</button>' +
        '<button type="button" class="btn btn--ghost btn--tiny" data-add-property="' + esc(c.id) + '">' +
          '+ Add an address</button>' +
      '</div>' +
    '</article>';
  }

  function clientsHtml() {
    if (!state.clients) return '<p class="empty">Loading…</p>';
    if (state.clients.error) {
      return '<div class="empty-state"><h3>Clients are not switched on yet</h3>' +
        '<p class="muted">' + esc(state.clients.error) + ' Open Settings and press Set them up.</p></div>';
    }
    var list = state.clients.customers || [];
    if (!list.length) {
      return '<div class="empty-state"><h3>No clients yet</h3>' +
        '<p class="muted">Everyone who sends a request appears here, with every address you clean for them.</p></div>';
    }
    var q = String(state.clientQ || '').toLowerCase().trim();
    var shown = !q ? list : list.filter(function (c) {
      var hay = [c.name, c.company, c.email, c.phone,
        (c.properties || []).map(function (p) {
          return [p.label, p.address, p.city, p.zip].filter(Boolean).join(' '); }).join(' ')
      ].join(' ').toLowerCase();
      if (hay.indexOf(q) !== -1) return true;
      var d = q.replace(/\D/g, '');
      return d.length >= 3 && String(c.phone || '').replace(/\D/g, '').indexOf(d) !== -1;
    });

    var many = list.filter(function (c) { return (c.properties || []).length > 1; }).length;
    return '<div class="csearch">' +
        '<input type="search" id="client-search" class="toolbar__search" ' +
          'placeholder="Search clients by name, address, ZIP or phone…" ' +
          'value="' + esc(state.clientQ || '') + '" autocomplete="off">' +
      '</div>' +
      '<p class="pipeline__sum">' +
        (q ? shown.length + ' of ' + list.length + ' ' + (list.length === 1 ? 'client' : 'clients')
           : list.length + ' ' + (list.length === 1 ? 'client' : 'clients') +
             (many ? ' · ' + many + ' with more than one address' : '')) +
      '</p>' +
      (shown.length
        ? '<div class="ccards">' + shown.map(clientCard).join('') + '</div>'
        : '<p class="empty">Nobody matches that.</p>');
  }

  function addProperty(btn) {
    var id = btn.getAttribute('data-add-property');
    var card = btn.closest('.ccard');
    var label = window.prompt('What should this address be called? (e.g. Home, Main office)');
    if (label === null) return;
    var address = window.prompt('Street address');
    if (address === null) return;
    var city = window.prompt('City');
    if (city === null) return;

    btn.disabled = true;
    var was = btn.textContent;
    btn.textContent = 'Adding…';
    api('/api/admin/customers', {
      method: 'POST',
      body: JSON.stringify({ action: 'add-property', customer_id: id,
        label: label, address: address, city: city })
    }).then(function (r) {
      btn.disabled = false;
      btn.textContent = was;
      if (!r.ok) { window.alert(r.body.error || 'Could not add that address.'); return; }
      loadClients();
    });
  }

  function loadClients() {
    state.clients = null;
    render();
    api('/api/admin/customers').then(function (r) {
      state.clients = r.ok ? r.body : { error: r.body.error || 'Could not load clients.' };
      render();
    });
  }

  /* ------------------------------------------------------ pipeline screens
     One card per quote, showing the thing she needs at that point: who it is
     for, what it is worth, and the single next action. */
  var STAGE_FOR_VIEW = { quotes: 'drafts', pending: 'pending', accepted: 'accepted', paid: 'paid' };

  var STAGE_EMPTY = {
    drafts: ['No quotes in progress', 'Start one from a request, or with + New quote.'],
    pending: ['Nothing waiting on a customer', 'Quotes you send will sit here until they answer.'],
    accepted: ['Nothing accepted yet', 'When someone says yes, the job appears here to be done and paid.'],
    paid: ['Nothing finished yet', 'Jobs you mark paid are kept here.']
  };

  function pipelineCard(q, view) {
    var who = q.customer_name || q.lead_name || 'Someone';
    var where = [q.lead_service, q.lead_city].filter(Boolean).join(' · ');
    var when = q.paid_at ? 'Paid ' + when_(q.paid_at)
      : q.completed_at ? 'Finished ' + when_(q.completed_at)
      : q.accepted_at ? 'Accepted ' + when_(q.accepted_at)
      : q.sent_at ? 'Sent ' + when_(q.sent_at)
      : 'Started ' + when_(q.created_at);

    var flags = '';
    if (q.status === 'expired') flags += '<span class="pill pill--flag">Expired</span>';
    if (view === 'accepted' && !q.completed_at) flags += '<span class="pill pill--flag">To do</span>';
    if (view === 'accepted' && q.completed_at) flags += '<span class="pill pill--quoted">Finished — awaiting payment</span>';
    if (view === 'pending') {
      /* "Opened 4 times" is interesting; "never opened" is the one she can do
         something about, and it looked identical to everything else. */
      flags += Number(q.view_count) > 0
        ? '<span class="pill pill--quoted">Opened ' + q.view_count + '&times;</span>'
        : '<span class="pill pill--flag">Not opened yet</span>';
    }

    var acts = '';
    if (view === 'pending') {
      acts = btn('resend', q, 'Send again', 'primary') + copyLinkBtn(q);
    } else if (view === 'accepted') {
      /* The next thing to do comes first. An undo used to lead the row, at
         the same width as the action she actually came here for. */
      acts = q.completed_at
        ? btn('paid', q, 'Mark paid', 'primary') + btn('uncomplete', q, 'Not finished after all', 'ghost')
        : btn('complete', q, 'Mark the job done', 'primary') + btn('paid', q, 'Mark paid', 'ghost');
    } else if (view === 'paid') {
      acts = btn('unpaid', q, 'Not paid after all', 'ghost');
    } else if (view === 'quotes') {
      acts = btn('open-lead', q, 'Open and finish it', 'primary');
    }
    acts += '<a class="btn btn--ghost btn--tiny" href="/api/admin/quotes/pdf?id=' + esc(q.id) +
      '" target="_blank" rel="noopener">PDF</a>';

    /* Every stage but "Quotes" was a dead end: a name, an amount and two
       state buttons, with no way back to the quote itself to re-read what
       was in it. The name opens it, the way it does everywhere else. */
    var name = q.lead_id
      ? '<button type="button" class="pcard__open" data-quote-action="open-lead" ' +
          'data-quote-id="' + esc(q.id) + '" data-lead-id="' + esc(q.lead_id) + '">' +
          esc(who) + '</button>'
      : esc(who);

    return '<article class="pcard">' +
      '<div class="pcard__head">' +
        '<div><h3 class="pcard__who">' + name + '</h3>' +
          (where ? '<p class="pcard__where muted">' + esc(where) + '</p>' : '') + '</div>' +
        '<span class="pcard__amt">' + esc(money(q.total)) + '</span>' +
      '</div>' +
      (flags ? '<div class="pcard__flags">' + flags + '</div>' : '') +
      '<p class="pcard__when muted">' + esc(when) + '</p>' +
      '<div class="pcard__acts">' + acts + '</div>' +
    '</article>';
  }

  function btn(action, q, label, kind) {
    return '<button type="button" class="btn btn--' + kind + ' btn--tiny" ' +
      'data-quote-action="' + action + '" data-quote-id="' + esc(q.id) + '"' +
      (q.customer_email ? ' data-quote-email="' + esc(q.customer_email) + '"' : '') +
      (q.lead_id ? ' data-lead-id="' + esc(q.lead_id) + '"' : '') +
      '>' + esc(label) + '</button>';
  }

  function copyLinkBtn(q) {
    if (!q.token) return '';
    var url = (typeof location !== 'undefined' ? location.origin : '') + '/proposal?t=' + q.token;
    return '<button type="button" class="btn btn--ghost btn--tiny" data-copy-link ' +
      'data-link="' + esc(url) + '">Copy link</button>';
  }

  var when_ = function (iso) { return when(iso); };

  function pipelineHtml(view) {
    if (!state.pipeline) return '<p class="empty">Loading…</p>';
    if (state.pipeline.error) {
      return '<p class="empty">' + esc(state.pipeline.error) +
        (state.pipeline.needsSetup ? ' Open Settings and press Set them up.' : '') + '</p>';
    }
    var list = state.pipeline.quotes || [];
    var openLeads = state.pipeline.openLeads || [];
    var stage = STAGE_FOR_VIEW[view];
    if (!list.length && !openLeads.length) {
      var e = STAGE_EMPTY[stage] || ['Nothing here', ''];
      return '<div class="empty-state"><h3>' + esc(e[0]) + '</h3><p class="muted">' + esc(e[1]) + '</p></div>';
    }
    /* Every stage is money sitting somewhere; only one of them said so. The
       number she wants is different per stage — what is owed, what is out
       waiting on an answer, what is still to write up. */
    var sum = list.reduce(function (t, q) { return t + (Number(q.total) || 0); }, 0);
    var n = list.length;
    var job = n === 1 ? 'job' : 'jobs';
    var quote = n === 1 ? 'quote' : 'quotes';
    var head = '';
    if (view === 'accepted') {
      var owed = state.pipelineCounts.outstanding_cents || sum;
      head = esc(money(owed)) + ' still to collect across ' + n + ' ' + job;
    } else if (view === 'pending' && n) {
      var unopened = list.filter(function (q) { return !Number(q.view_count); }).length;
      head = esc(money(sum)) + ' out with ' + n + ' ' + (n === 1 ? 'customer' : 'customers') +
        (unopened ? ' · ' + unopened + ' not opened yet' : '');
    } else if (view === 'quotes' && n) {
      head = n + ' ' + quote + ' in progress, worth ' + esc(money(sum));
    } else if (view === 'paid' && n) {
      head = esc(money(sum)) + ' collected across ' + n + ' ' + job;
    }
    head = head ? '<p class="pipeline__sum">' + head + '</p>' : '';
    var cards = list.map(function (q) { return pipelineCard(q, view); }).join('') +
      openLeads.map(leadNeedingQuoteCard).join('');
    return head + '<div class="pcards">' + cards + '</div>';
  }

  /* A request she has marked quoted but never wrote a quote for. It is on this
     screen because that is where she would look for it, and it says plainly
     what is missing. */
  function leadNeedingQuoteCard(l) {
    var where = [l.service_label, l.city].filter(Boolean).join(' · ');
    return '<article class="pcard pcard--todo">' +
      '<div class="pcard__head">' +
        '<div><h3 class="pcard__who">' + esc(l.name || 'Someone') + '</h3>' +
          (where ? '<p class="pcard__where muted">' + esc(where) + '</p>' : '') + '</div>' +
        '<span class="pcard__amt pcard__amt--none">' +
          esc(l.quoted_amount ? l.quoted_amount : 'No quote yet') + '</span>' +
      '</div>' +
      '<div class="pcard__flags"><span class="pill pill--flag">Marked quoted</span></div>' +
      '<p class="pcard__when muted">You marked this quoted ' + esc(when(l.updated_at || l.created_at)) +
        ', but there is no quote here to send or track.</p>' +
      '<div class="pcard__acts">' +
        '<button type="button" class="btn btn--primary btn--tiny" data-quote-action="open-lead" ' +
          'data-quote-id="lead-' + esc(l.id) + '" data-lead-id="' + esc(l.id) + '">Build the quote</button>' +
        (l.phone ? '<a class="btn btn--ghost btn--tiny" href="' + esc(FMT.telHref(l.phone)) + '">Call</a>' : '') +
      '</div>' +
    '</article>';
  }

  /* The tab counts come from the same query as the lists, so they are fetched
     once on load — otherwise every tab reads zero until she visits it, which
     is worse than no number at all. */
  function loadPipelineCounts() {
    api('/api/admin/pipeline?stage=pending&limit=1').then(function (r) {
      if (!r.ok) return;
      state.pipelineCounts = r.body.counts || {};
      render();
    });
  }

  function loadPipeline(view) {
    var stage = STAGE_FOR_VIEW[view];
    state.pipeline = null;
    render();
    api('/api/admin/pipeline?stage=' + stage).then(function (r) {
      state.pipeline = r.ok ? r.body : { error: r.body.error || 'Could not load.', needsSetup: r.body.needsSetup };
      if (r.ok) state.pipelineCounts = r.body.counts || {};
      render();
    });
  }

  function renderQuotePanel(l, quotes) {
    var editingId = state.editingQuote && state.editingQuote[l.id];
    var editing = editingId && (quotes || []).find(function (q) { return q.id === editingId; });
    var list = (quotes || [])
      .filter(function (q) { return q.status !== 'draft' && !(editing && q.id === editing.id); })
      .map(quoteCard).join('');
    var draft = (quotes || []).find(function (q) { return q.status === 'draft' && !q.archived_at; });
    return (list ? '<div class="quote-list">' + list + '</div>' : '') +
      (state.view === 'archived' ? '' : quoteEditorHtml(l, editing || draft));
  }

  function loadQuotes(leadId) {
    var panel = root.querySelector('[data-quote-panel="' + leadId + '"] .quote-panel__body');
    if (!panel) return;
    var lead = state.leads.find(function (l) { return l.id === leadId; });
    if (!lead) return;
    var qs = '?lead_id=' + encodeURIComponent(leadId);
    if (state.view === 'archived') qs += '&include_archived=1';
    api('/api/admin/quotes' + qs).then(function (r) {
      if (!r.ok) {
        panel.innerHTML = '<p class="muted">' + esc(r.body.error || 'Quotes unavailable.') + '</p>';
        return;
      }
      state.quotes[leadId] = r.body.quotes || [];
      panel.innerHTML = renderQuotePanel(lead, state.quotes[leadId]);
      var ed = panel.querySelector('.quote-editor');
      if (ed) updateQuoteTotal(ed);
      if (state.focusQuoteEditor === leadId) {
        state.focusQuoteEditor = null;
        var composer = panel.querySelector('#quote-composer') || ed;
        if (composer && composer.scrollIntoView) composer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        var price = panel.querySelector('.quote-price');
        if (price) price.focus();
      }
    });
  }

  function openQuoteTab(leadId) {
    state.leadTab[leadId] = 'quotes';
    state.focusQuoteEditor = leadId;
    render();
    loadQuotes(leadId);
  }

  function resendQuote(btn) {
    var qid = btn.getAttribute('data-quote-id');
    var email = btn.getAttribute('data-quote-email') || '';
    var card = btn.closest('.lead');
    var leadId = card && card.dataset.id;
    if (!qid) return;
    var prompt = email
      ? 'Resend this quote to ' + email + '?'
      : 'Resend this quote to the customer?';
    if (!window.confirm(prompt)) return;
    btn.disabled = true;
    api('/api/admin/quotes/send', {
      method: 'POST',
      body: JSON.stringify({ id: qid, customer_email: email || undefined })
    }).then(function (r) {
      btn.disabled = false;
      if (!r.ok) {
        window.alert(r.body.error || 'Could not resend.');
        return;
      }
      if (leadId) loadQuotes(leadId);
    });
  }

  function setLookupMsgs(card, text, soft) {
    Array.prototype.forEach.call(card.querySelectorAll('[data-lookup-msg]'), function (msg) {
      msg.hidden = !text;
      msg.textContent = text || '';
      msg.classList.toggle('profile__lookup-msg--soft', !!soft);
    });
  }

  function lookupProperty(btn) {
    var card = btn.closest('.lead');
    if (!card) return;
    var leadId = card.dataset.id;
    var lead = state.leads.find(function (l) { return l.id === leadId; });
    if (!lead) return;

    function val(col) {
      var el = card.querySelector('[data-col="' + col + '"]');
      if (el && el.value.trim()) return el.value.trim();
      return lead[col] || '';
    }

    var address = val('address');
    var city = val('city');
    var zip = val('zip');
    if (!address) {
      setLookupMsgs(card, 'Add a street address on Profile first.');
      state.leadTab[leadId] = 'intake';
      render();
      return;
    }

    var buttons = card.querySelectorAll('[data-property-lookup]');
    Array.prototype.forEach.call(buttons, function (b) { b.disabled = true; });
    setLookupMsgs(card, 'Looking up property records…');

    api('/api/admin/property-lookup', {
      method: 'POST',
      body: JSON.stringify({ address: address, city: city, zip: zip, state: 'FL' })
    }).then(function (r) {
      Array.prototype.forEach.call(buttons, function (b) { b.disabled = false; });
      if (!r.ok) {
        var err = r.body.error || 'Lookup failed.';
        if (r.status === 503) state.propertyLookupConfigured = false;
        if (r.body.setup) err = r.body.error + ' Open rentcast.io to create a free key, then add RENTCAST_API_KEY in Cloudflare and redeploy.';
        else if (r.status === 404 || r.body.not_found) err = r.body.error || 'No record for this address — enter beds/baths manually.';
        setLookupMsgs(card, err, r.status === 404 || r.body.not_found);
        return;
      }
      state.propertyLookupConfigured = true;
      var p = r.body.property || {};
      var patch = { id: leadId };
      ['bedrooms', 'bathrooms', 'size_label', 'property_type'].forEach(function (col) {
        if (!p[col]) return;
        patch[col] = p[col];
        lead[col] = p[col];
        var el = card.querySelector('[data-col="' + col + '"]');
        if (el) el.value = p[col];
      });
      api('/api/admin/leads', { method: 'PATCH', body: JSON.stringify(patch) }).then(function () {
        var ok = (r.body.cached ? 'Filled from a saved lookup (no request used): ' : 'Filled: ') +
          [p.bedrooms && (p.bedrooms + ' bed'), p.bathrooms && (p.bathrooms + ' bath'),
            p.square_footage && (Number(p.square_footage).toLocaleString('en-US') + ' sq ft')]
            .filter(Boolean).join(' · ');
        state.leadTab[leadId] = 'intake';
        render();
        var fresh = root.querySelector('.lead[data-id="' + leadId + '"]');
        if (fresh) setLookupMsgs(fresh, ok || 'Property filled from records.');
      });
    });
  }

  /* The same lookup the lead profile does, reading and writing the composer's
     own fields. It is a different set of inputs, not a different idea, so it
     shares the endpoint and the caching behind it. */
  function lookupForComposer(btn) {
    var editor = btn.closest('.quote-editor');
    if (!editor) return;
    var v = function (sel) { return ((editor.querySelector(sel) || {}).value || '').trim(); };
    var msg = editor.querySelector('[data-compose-lookup-msg]');
    var say = function (text, bad) {
      if (!msg) return;
      msg.hidden = !text;
      msg.textContent = text;
      msg.className = 'profile__lookup-msg' + (bad ? ' is-bad' : '');
    };

    var address = v('.quote-address');
    if (!address) { say('Add the street address first.', true); return; }

    btn.disabled = true;
    say('Looking up property records…');
    api('/api/admin/property-lookup', {
      method: 'POST',
      body: JSON.stringify({ address: address, city: v('.quote-city'), zip: v('.quote-zip'), state: 'FL' })
    }).then(function (r) {
      btn.disabled = false;
      if (!r.ok) {
        say(r.body.error || 'No record for that address — type them in below.', true);
        return;
      }
      var p = r.body.property || {};
      var put = function (sel, value) {
        var el = editor.querySelector(sel);
        if (el && value) el.value = value;
      };
      put('.quote-bedrooms', p.bedrooms);
      put('.quote-bathrooms', p.bathrooms);
      put('.quote-size', p.size_label ||
        (p.square_footage ? Number(p.square_footage).toLocaleString('en-US') + ' sq ft' : ''));
      put('.quote-property-type', p.property_type);
      say((r.body.cached ? 'Filled from a saved lookup (no request used): ' : 'Filled: ') +
        [p.bedrooms && p.bedrooms + ' bed', p.bathrooms && p.bathrooms + ' bath',
         p.square_footage && Number(p.square_footage).toLocaleString('en-US') + ' sq ft']
          .filter(Boolean).join(' · '));
    });
  }

  function quotePayload(editor) {
    var payload = {
      id: editor.dataset.quoteId || undefined,
      lead_id: editor.dataset.leadId || undefined,
      line_items: Array.prototype.map.call(editor.querySelectorAll('.qline'), function (row) {
        return {
          label: row.querySelector('.quote-label').value,
          description: (row.querySelector('.quote-description') || {}).value || '',
          qty: row.querySelector('.quote-qty').value,
          unit_dollars: row.querySelector('.quote-price').value,
          cadence: (row.querySelector('.quote-cadence') || {}).value || 'onetime',
          optional: !!(row.querySelector('.quote-optional') || {}).checked
        };
      }),
      notes: editor.querySelector('.quote-notes').value,
      customer_email: editor.querySelector('.quote-email').value
    };
    if (editor.dataset.standalone) {
      var firstEl = editor.querySelector('.quote-first-name');
      var lastEl = editor.querySelector('.quote-last-name');
      payload.customer_name = joinName(firstEl && firstEl.value, lastEl && lastEl.value);
      payload.phone = (editor.querySelector('.quote-phone') || {}).value || '';
      payload.phone = String(payload.phone).trim();
      payload.service_label = ((editor.querySelector('.quote-service') || {}).value || '').trim();
      payload.address = ((editor.querySelector('.quote-address') || {}).value || '').trim();
      payload.city = ((editor.querySelector('.quote-city') || {}).value || '').trim();
      payload.zip = ((editor.querySelector('.quote-zip') || {}).value || '').trim();
      payload.bedrooms = ((editor.querySelector('.quote-bedrooms') || {}).value || '').trim();
      payload.bathrooms = ((editor.querySelector('.quote-bathrooms') || {}).value || '').trim();
      payload.size_label = ((editor.querySelector('.quote-size') || {}).value || '').trim();
      payload.property_type = ((editor.querySelector('.quote-property-type') || {}).value || '').trim();
      delete payload.lead_id;
      delete payload.id;
    }
    return payload;
  }

  function afterQuoteSaved(editor, r) {
    if (!editor.dataset.standalone) return false;
    var leadId = r.body.lead_id || (r.body.quote && r.body.quote.lead_id);
    state.composing = false;
    state.composeFor = null;
    if (leadId) {
      state.open = leadId;
      state.leadTab[leadId] = 'quotes';
    }
    load();
    return true;
  }

  function updateQuoteTotal(editor) {
    var el = editor.querySelector('[data-quote-total]');
    if (el) el.textContent = money(calcLineTotal(quotePayload(editor).line_items));
  }

  function showQuoteMsg(editor, text, ok) {
    var el = editor.querySelector('.quote-msg');
    if (!el) return;
    el.hidden = !text;
    el.className = 'quote-msg form-status' + (ok ? '' : ' form-status--err');
    el.textContent = text || '';
  }

  function saveQuote(editor) {
    var payload = quotePayload(editor);
    if (editor.dataset.standalone && !payload.customer_name) {
      showQuoteMsg(editor, 'Add customer name.', false); return;
    }
    var isNew = !payload.id;
    api('/api/admin/quotes', { method: isNew ? 'POST' : 'PATCH', body: JSON.stringify(payload) })
      .then(function (r) {
        if (!r.ok) { showQuoteMsg(editor, r.body.error || 'Could not save.', false); return; }
        if (afterQuoteSaved(editor, r)) return;
        // A saved edit to a quote that is already out is live at the same link
        // straight away. She should know the customer can see it now, so that
        // saving half a thought is a deliberate act rather than a surprise.
        var wasOut = editor.dataset.alreadyOut === '1';
        if (payload.lead_id) delete state.editingQuote[payload.lead_id];
        showQuoteMsg(editor, wasOut
          ? 'Saved — the customer sees this version at the same link. Resend if you want them told.'
          : 'Draft saved.', true);
        loadQuotes(payload.lead_id);
      });
  }

  function sendQuote(editor) {
    var payload = quotePayload(editor);
    if (editor.dataset.standalone && !payload.customer_name) {
      showQuoteMsg(editor, 'Add customer name.', false); return;
    }
    if (!payload.customer_email) { showQuoteMsg(editor, 'Add customer email.', false); return; }
    function doSend(id, leadId) {
      api('/api/admin/quotes/send', { method: 'POST', body: JSON.stringify({ id: id, customer_email: payload.customer_email }) })
        .then(function (r) {
          if (!r.ok) { showQuoteMsg(editor, r.body.error || 'Send failed.', false); return; }
          if (editor.dataset.standalone) {
            state.composing = false;
            state.composeFor = null;
            state.open = leadId;
            state.leadTab[leadId] = 'quotes';
            load();
            return;
          }
          if (payload.lead_id) delete state.editingQuote[payload.lead_id];
          showQuoteMsg(editor, 'Sent — track delivery in timeline.', true);
          loadQuotes(payload.lead_id); load();
        });
    }
    if (payload.id) {
      api('/api/admin/quotes', { method: 'PATCH', body: JSON.stringify(payload) })
        .then(function (r) {
          // This used to drop a failed save on the floor: no send, no message,
          // a button that simply did nothing.
          if (!r.ok) { showQuoteMsg(editor, r.body.error || 'Could not save the changes.', false); return; }
          doSend(r.body.quote.id, r.body.quote.lead_id);
        });
      return;
    }
    api('/api/admin/quotes', { method: 'POST', body: JSON.stringify(payload) })
      .then(function (r) {
        if (!r.ok) { showQuoteMsg(editor, r.body.error || 'Could not save.', false); return; }
        doSend(r.body.quote.id, r.body.lead_id || r.body.quote.lead_id);
      });
  }

  function leadAction(card, action) {
    var id = card.dataset.id;
    var msg = action === 'delete' ? 'Delete this lead permanently? This cannot be undone.'
      : action === 'archive' ? 'Archive this request? You can bring it back from the archived list.' : '';
    if (msg && !window.confirm(msg)) return;
    api('/api/admin/leads', { method: 'PATCH', body: JSON.stringify({ id: id, action: action }) })
      .then(function (r) {
        if (!r.ok) {
          window.alert(r.body.error || 'That action failed.');
          return;
        }
        state.open = null;
        load();
      });
  }

  function quoteAction(btn, action) {
    if (action === 'resend') { resendQuote(btn); return; }
    var qid = btn.getAttribute('data-quote-id') ||
      (btn.closest('[data-quote-id]') && btn.closest('[data-quote-id]').getAttribute('data-quote-id'));
    var card = btn.closest('.lead');
    var leadId = card && card.dataset.id;
    if (!qid) return;

    // Opening a sent quote for editing changes nothing until she presses a
    // button, so it never touches the server.
    if (action === 'edit') {
      if (leadId) {
        state.editingQuote[leadId] = qid;
        state.leadTab[leadId] = 'quotes';
        state.focusQuoteEditor = leadId;
        render();
      }
      return;
    }
    if (action === 'open-lead') {
      var lid = btn.getAttribute('data-lead-id');
      if (lid) { state.view = 'active'; state.open = lid; state.leadTab[lid] = 'quotes'; load(); }
      return;
    }
    if (action === 'delete' && !window.confirm('Delete this quote permanently?')) return;
    if (action === 'unpaid' && !window.confirm('Mark this as not paid after all?')) return;

    var extra = {};
    if (action === 'reopen') {
      var why = window.prompt(
        'Reopen this accepted quote?\n\nIt goes back to sent so you can change and resend it. ' +
        'Who accepted it and when is kept.\n\nWhy are you reopening it? (optional)');
      if (why === null) return;                 // cancelled
      if (why.trim()) extra.reason = why.trim();
    }

    api('/api/admin/quotes', { method: 'PATCH',
      body: JSON.stringify(Object.assign({ id: qid, action: action }, extra)) })
      .then(function (r) {
        if (!r.ok) {
          window.alert(r.body.error || 'That action failed.');
          return;
        }
        if (STAGE_FOR_VIEW[state.view]) { loadPipeline(state.view); return; }
        if (leadId) loadQuotes(leadId);
      });
  }

  root.addEventListener('click', function (e) {
    /* A click on a button lands on whatever is under the pointer — the span
       holding the customer's name, the <b> holding a count — not on the
       button itself. Every branch below asked e.target.matches(...), so
       clicking the name of a lead did nothing and only the padding around it
       opened the card. Resolve the control that was actually pressed once,
       and let the branches ask about that. */
    var hit = e.target.closest('button, a, [data-toggle], [role="tab"]') || e.target;

    if (hit.matches('[data-view]')) {
      state.view = hit.dataset.view;
      state.filter = ''; state.followup = false; state.open = null;
      state.composing = false; state.composingLead = false; state.composeFor = null;
      if (state.view === 'settings') { render(); loadSettings(); return; }
      if (state.view === 'clients') { loadClients(); return; }
      if (STAGE_FOR_VIEW[state.view]) { loadPipeline(state.view); return; }
      load(); return;
    }
    if (hit.matches('[data-new-lead]')) {
      state.composingLead = true; state.composing = false; state.open = null;
      render(); return;
    }
    if (hit.matches('[data-close-compose-lead]')) {
      state.composingLead = false;
      render(); return;
    }
    if (hit.matches('[data-save-lead]')) {
      saveNewLead();
      return;
    }
    if (hit.matches('[data-followup-filter]')) {
      state.followup = !state.followup;
      state.open = null;
      load();
      return;
    }
    if (hit.matches('[data-copy-link]')) {
      var link = hit.getAttribute('data-link') || '';
      if (!link) return;
      copyText(link).then(function () {
        var orig = hit.textContent;
        hit.textContent = 'Copied!';
        setTimeout(function () { hit.textContent = orig; }, 1600);
      });
      return;
    }
    if (hit.matches('[data-new-quote]')) {
      state.composing = true; state.composingLead = false; state.open = null;
      state.composeFor = null;
      render(); return;
    }
    if (hit.matches('[data-close-compose]')) {
      state.composing = false;
      state.composeFor = null;
      render(); return;
    }
    if (hit.matches('[data-start-quote]')) {
      var startCard = hit.closest('.lead');
      if (startCard) openQuoteTab(startCard.dataset.id);
      return;
    }
    if (hit.matches('[data-property-lookup]')) {
      lookupProperty(hit);
      return;
    }
    if (hit.matches('[data-compose-lookup]')) {
      lookupForComposer(hit);
      return;
    }
    if (hit.matches('[data-ptab-jump]')) {
      var jumpCard = hit.closest('.lead');
      if (jumpCard) {
        state.leadTab[jumpCard.dataset.id] = hit.getAttribute('data-ptab-jump') || 'intake';
        render();
      }
      return;
    }
    if (hit.matches('[data-ptab]')) {
      var card = hit.closest('.lead');
      state.leadTab[card.dataset.id] = hit.dataset.ptab;
      render();
      if (hit.dataset.ptab === 'quotes') loadQuotes(card.dataset.id);
      return;
    }
    if (hit.matches('[data-toggle]')) {
      var c = hit.closest('.lead');
      state.open = state.open === c.dataset.id ? null : c.dataset.id;
      render();
      if (state.open && (state.leadTab[state.open] || 'intake') === 'quotes') loadQuotes(state.open);
      return;
    }
    if (hit.matches('[data-lead-action]')) {
      leadAction(hit.closest('.lead'), hit.dataset.leadAction);
      return;
    }
    if (hit.matches('[data-quote-action]')) {
      quoteAction(hit, hit.dataset.quoteAction);
      return;
    }
    if (hit.matches('[data-add-line]')) {
      var ed = hit.closest('.quote-editor');
      ed.querySelector('.quote-lines').insertAdjacentHTML('beforeend', quoteLineHtml({}));
      updateQuoteTotal(ed); return;
    }
    var svcOpt = hit.closest('[data-svcpick-opt]');
    if (svcOpt) {
      svcAdd(svcOpt.closest('[data-svcpick]'),
        svcOpt.getAttribute('data-label'), svcOpt.getAttribute('data-id'));
      return;
    }
    if (hit.matches('[data-svcpick-add]')) {
      svcCommit(hit.closest('[data-svcpick]'));
      return;
    }
    if (hit.matches('[data-remove-line]')) {
      var row = hit.closest('.qline');
      var editor = hit.closest('.quote-editor');
      if (editor.querySelectorAll('.qline').length > 1) { row.remove(); updateQuoteTotal(editor); }
      return;
    }
    if (hit.matches('[data-open-client]')) {
      var cid = hit.getAttribute('data-open-client');
      state.openClient = state.openClient === cid ? null : cid;
      render();
      return;
    }
    /* "Start a quote" from the person it is for. Before this the only way in
       was the New Quote button on another tab, which starts empty — so she
       retyped a name, a phone and an address the screen was already showing. */
    if (hit.matches('[data-quote-client]')) {
      var qc = (state.clients && state.clients.customers || []).filter(function (c) {
        return c.id === hit.getAttribute('data-quote-client');
      })[0];
      if (!qc) return;
      state.composeFor = qc;
      state.composing = true;
      state.composingLead = false;
      state.open = null;
      state.view = 'active';
      render();
      var panel = document.querySelector('.compose');
      if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    /* A request listed under a client opens where requests live, rather than
       being rebuilt a second time inside the client profile. */
    if (hit.matches('[data-open-request]')) {
      state.clientQ = '';
      state.q = '';
      state.view = 'active';
      state.open = hit.getAttribute('data-open-request');
      load();
      return;
    }
    /* Takes her to the requests list filtered to this person, rather than
       inventing a second place to read the same records. */
    if (hit.matches('[data-client-work]')) {
      state.clientQ = '';
      state.q = hit.getAttribute('data-client-work') || '';
      state.view = 'active';
      state.open = null;
      load();
      return;
    }
    /* The server has implemented add-property all along; nothing ever called
       it, so this button did nothing at all. */
    if (hit.matches('[data-add-property]')) {
      addProperty(hit);
      return;
    }
    if (hit.matches('[data-run-setup]')) { runSetup(hit); return; }
    if (hit.matches('[data-save-settings]')) { saveSettingsFromForm(); return; }
    /* Each add-on they ticked on the website becomes its own line at $0.00,
       which the quote, the PDF and the email all render as "Included". She
       prices any of them that are not actually free. Tapping twice does not
       add them twice. */
    if (hit.matches('[data-add-asked]')) {
      var aEd = hit.closest('.quote-editor');
      var aLines = aEd.querySelector('.quote-lines');
      /* Matched through the catalogue, so "Interior windows" does not land
         beside the "Interior window" already on the quote. */
      var canon = function (v) {
        var item = findCatalogByLabel(v);
        return String(item ? item.label : v).toLowerCase().replace(/\s+/g, ' ').trim();
      };
      var have = {};
      [].slice.call(aEd.querySelectorAll('.quote-label')).forEach(function (inp) {
        have[canon(inp.value)] = true;
      });
      var want = [];
      try { want = JSON.parse(aEd.getAttribute('data-asked') || '[]'); } catch (e) { want = []; }
      var added = 0;
      want.forEach(function (label) {
        var key = canon(label);
        if (!key || have[key]) return;
        have[key] = true;
        var item = findCatalogByLabel(label);
        aLines.insertAdjacentHTML('beforeend', quoteLineHtml({
          catalog_id: item ? item.id : '',
          label: item ? item.label : label,
          qty: 1,
          unit_dollars: '0'
        }));
        added++;
      });
      updateQuoteTotal(aEd);
      growAllDesc();
      if (added) {
        var last = aEd.querySelectorAll('.qline');
        var el = last[last.length - 1];
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      return;
    }
    if (hit.matches('[data-save-quote]')) saveQuote(hit.closest('.quote-editor'));
    if (hit.matches('[data-send-quote]')) {
      var ed = hit.closest('.quote-editor');
      // Say which of the two things is about to happen. Resending a revision
      // is a different promise from sending a quote for the first time.
      var revising = ed && ed.dataset.alreadyOut === '1';
      var ask = revising
        ? 'Email the updated quote? They can already see it at the same link.'
        : 'Send this quote by email?';
      if (window.confirm(ask)) sendQuote(ed);
    }
  });

  root.addEventListener('change', function (e) {
    // The teal edge that says "this one repeats" has to follow the dropdown,
    // not just the state the line was drawn in.
    if (e.target.matches('.quote-cadence')) {
      var qline = e.target.closest('.qline');
      if (qline) qline.classList.toggle('is-recurring', e.target.value !== 'onetime');
    }
    // Ticking "optional" takes the line straight out of the total, so the
    // number she is looking at has to move the moment she ticks it.
    if (e.target.matches('.quote-optional')) {
      var qrow = e.target.closest('.qline');
      if (qrow) qrow.classList.toggle('is-optional', e.target.checked);
      var qed = e.target.closest('.quote-editor');
      if (qed) updateQuoteTotal(qed);
    }
    if (e.target.id === 'status-filter') { state.filter = e.target.value; state.open = null; load(); }
    if (e.target.matches('select[data-col]')) saveField(e.target);
    if (e.target.matches('[data-zip-lookup]')) {
      clearTimeout(zipLookupTimer);
      runZipLookup(e.target);
    }
  });

  var addressSuggestTimer = null;
  var zipLookupTimer = null;
  var addressSuggestSeq = 0;
  var zipLookupSeq = 0;

  function addressSuggestScope(input) {
    return input.closest('.compose__customer, .compose, .quote-editor, .profile, .acc__in, .lead') || root;
  }

  function addressSuggestList(input) {
    var wrap = input.closest('.addr-suggest__wrap') || input.parentElement;
    return wrap ? wrap.querySelector('.addr-suggest__list') : null;
  }

  function hideAddressSuggestions(input) {
    var list = addressSuggestList(input);
    if (list) {
      list.hidden = true;
      list.innerHTML = '';
      list._suggestions = null;
    }
  }

  function fillAddressSuggestion(input, item) {
    var scope = addressSuggestScope(input);
    input.value = item.address || '';
    var cityEl = scope.querySelector('[data-col="city"], .quote-city, [data-lead-field="city"]');
    var zipEl = scope.querySelector('[data-col="zip"], .quote-zip, [data-lead-field="zip"]');
    if (cityEl) {
      if (cityEl.tagName === 'SELECT') setSelectValue(cityEl, item.city || '');
      else cityEl.value = item.city || '';
    }
    if (zipEl) zipEl.value = item.zip || '';
    hideAddressSuggestions(input);
    if (input.hasAttribute('data-col')) saveField(input);
    if (cityEl && cityEl.hasAttribute('data-col')) saveField(cityEl);
    if (zipEl && zipEl.hasAttribute('data-col')) saveField(zipEl);
  }

  function renderAddressSuggestions(input, suggestions) {
    var list = addressSuggestList(input);
    if (!list) return;
    if (!suggestions.length) {
      list.hidden = true;
      list.innerHTML = '';
      return;
    }
    list.innerHTML = suggestions.map(function (s, i) {
      return '<li><button type="button" class="addr-suggest__item' + (i === 0 ? ' is-active' : '') +
        '" data-address-pick="' + i + '">' + esc(s.label) + '</button></li>';
    }).join('');
    list.hidden = false;
    list._suggestions = suggestions;
  }

  function currentZipFor(input) {
    var scope = addressSuggestScope(input);
    var zipEl = scope.querySelector('[data-col="zip"], .quote-zip, [data-lead-field="zip"]');
    return zipEl ? String(zipEl.value || '').replace(/\D/g, '').slice(0, 5) : '';
  }

  function cityField(scope) {
    return scope.querySelector('[data-col="city"], .quote-city, [data-lead-field="city"]');
  }

  function currentCityFor(input) {
    var cityEl = cityField(addressSuggestScope(input));
    return cityEl ? String(cityEl.value || '').trim() : '';
  }

  function applyCity(scope, city) {
    var cityEl = cityField(scope);
    if (!cityEl) return;
    var next = String(city || '');
    if (cityEl.tagName === 'SELECT') setSelectValue(cityEl, next);
    else cityEl.value = next;
    if (cityEl.hasAttribute('data-col')) saveField(cityEl);
  }

  function setStreetEnabled(scope, on) {
    var street = scope && scope.querySelector('[data-address-suggest]');
    if (!street) return;
    street.disabled = !on;
    street.placeholder = on ? 'Street address' : 'Enter ZIP first';
    if (!on) hideAddressSuggestions(street);
  }

  function runAddressSuggest(input) {
    var q = String(input.value || '').trim();
    var zip = currentZipFor(input);
    if (zip.length !== 5) {
      setStreetEnabled(addressSuggestScope(input), false);
      hideAddressSuggestions(input);
      return;
    }
    setStreetEnabled(addressSuggestScope(input), true);
    if (q.length < 3) {
      hideAddressSuggestions(input);
      return;
    }
    var seq = ++addressSuggestSeq;
    var path = '/api/admin/address-suggest?q=' + encodeURIComponent(q) +
      '&zip=' + encodeURIComponent(zip);
    var city = currentCityFor(input);
    if (city) path += '&city=' + encodeURIComponent(city);
    api(path).then(function (r) {
      if (seq !== addressSuggestSeq) return;
      if (!r.ok) {
        hideAddressSuggestions(input);
        return;
      }
      if (r.body.place && r.body.place.city) {
        applyCity(addressSuggestScope(input), r.body.place.city);
      }
      renderAddressSuggestions(input, r.body.suggestions || []);
    });
  }

  function runZipLookup(zipInput) {
    var zip = String(zipInput.value || '').replace(/\D/g, '').slice(0, 5);
    var scope = addressSuggestScope(zipInput);
    var seq = ++zipLookupSeq;

    if (zip.length !== 5) {
      zipInput._zipComplete = false;
      zipInput._zipCityFor = '';
      setStreetEnabled(scope, false);
      applyCity(scope, '');
      return;
    }

    setStreetEnabled(scope, true);
    var known = cityForZip(zip);
    if (known) {
      applyCity(scope, known);
      zipInput._zipComplete = true;
      zipInput._zipCityFor = zip;
    }
    api('/api/admin/address-suggest?zip=' + encodeURIComponent(zip) + '&t=' + Date.now()).then(function (r) {
      if (seq !== zipLookupSeq) return;
      var still = String(zipInput.value || '').replace(/\D/g, '').slice(0, 5);
      if (still !== zip) return;
      if (!r.ok) return;
      var city = r.body.place && r.body.place.city ? String(r.body.place.city) : '';
      // Never blank City from a 5-digit ZIP response — only incomplete ZIP clears it.
      if (!city) return;
      applyCity(scope, city);
      zipInput._zipComplete = true;
      zipInput._zipCityFor = zip;
      var street = scope.querySelector('[data-address-suggest]');
      if (street && String(street.value || '').trim().length >= 3) runAddressSuggest(street);
    });
  }

  function saveNameParts(card) {
    if (!card) return;
    var first = card.querySelector('[data-name-part="first"]');
    var last = card.querySelector('[data-name-part="last"]');
    if (!first && !last) return;
    var name = joinName(first && first.value, last && last.value);
    var payload = { id: card.dataset.id, name: name };
    api('/api/admin/leads', { method: 'PATCH', body: JSON.stringify(payload) }).then(function (r) {
      var saved = card.querySelector('[data-saved]');
      if (!r.ok) {
        if (saved) {
          saved.hidden = false;
          saved.textContent = r.body.error || 'Save failed';
          saved.classList.add('saved--err');
          setTimeout(function () {
            saved.hidden = true;
            saved.textContent = 'Saved';
            saved.classList.remove('saved--err');
          }, 2500);
        }
        return;
      }
      if (saved) { saved.hidden = false; setTimeout(function () { saved.hidden = true; }, 1500); }
      state.leads.forEach(function (l) {
        if (l.id === card.dataset.id) {
          l.name = name;
          var nameEl = card.querySelector('.lead__name');
          if (nameEl) nameEl.textContent = name || '—';
        }
      });
    });
  }

  /* Opening on focus shows what is saved without her having to guess a
     first letter; clicking away closes it. */
  root.addEventListener('focusin', function (e) {
    if (e.target.matches('[data-svcpick-input]')) svcRender(e.target.closest('[data-svcpick]'));
  });
  document.addEventListener('click', function (e) {
    var open = root.querySelector('[data-svcpick] [data-svcpick-list]:not([hidden])');
    if (open && !e.target.closest('[data-svcpick]')) svcClose(open.closest('[data-svcpick]'));
  });

  root.addEventListener('input', function (e) {
    if (e.target.id === 'search') { state.q = e.target.value; applySearchFilter(); }
    if (e.target.id === 'client-search') {
      state.clientQ = e.target.value;
      var cpos = e.target.selectionStart;
      render();
      var again = root.querySelector('#client-search');
      if (again) { again.focus(); try { again.setSelectionRange(cpos, cpos); } catch (err) {} }
    }
    /* Type the digits, get the number. Reformatting on every keystroke would
       fight the caret mid-string, so it only reshapes while she is typing at
       the end — which is how a phone number is actually entered. */
    if (e.target.matches('.quote-description')) { growDesc(e.target); }
    if (e.target.matches('[data-svcpick-input]')) {
      svcRender(e.target.closest('[data-svcpick]'));
    }
    if (e.target.matches('[data-phone-field]')) {
      var el = e.target;
      var atEnd = el.selectionStart === el.value.length;
      var digits = el.value.replace(/\D/g, '');
      if (atEnd && digits.length >= 10) {
        var pretty = FMT.formatPhone(digits);
        if (pretty && pretty !== el.value) {
          el.value = pretty;
          el.setSelectionRange(pretty.length, pretty.length);
        }
      }
    }
    if (e.target.matches('.quote-label, .quote-qty, .quote-price')) updateQuoteTotal(e.target.closest('.quote-editor'));
    if (e.target.matches('[data-address-suggest]')) {
      clearTimeout(addressSuggestTimer);
      var suggestInput = e.target;
      addressSuggestTimer = setTimeout(function () { runAddressSuggest(suggestInput); }, 280);
    }
    if (e.target.matches('[data-zip-lookup]')) {
      clearTimeout(zipLookupTimer);
      var zipInput = e.target;
      var zipDigits = String(zipInput.value || '').replace(/\D/g, '').slice(0, 5);
      var scope = addressSuggestScope(zipInput);
      if (zipDigits.length !== 5) {
        zipLookupSeq += 1; // drop any in-flight city fill for the previous ZIP
        zipInput._zipComplete = false;
        zipInput._zipCityFor = '';
        applyCity(scope, '');
        setStreetEnabled(scope, false);
      } else {
        var knownNow = cityForZip(zipDigits);
        if (knownNow) {
          applyCity(scope, knownNow);
          zipInput._zipComplete = true;
          zipInput._zipCityFor = zipDigits;
        }
        setStreetEnabled(scope, true);
      }
      zipLookupTimer = setTimeout(function () { runZipLookup(zipInput); }, 180);
    }
  });

  /* The saved-service box is a combobox, so it answers to the keyboard:
     arrows move, Enter takes the highlighted match (or the words she typed
     if nothing matches), Escape closes without adding. */
  root.addEventListener('keydown', function (e) {
    if (e.target.matches('[data-svcpick-input]')) {
      var pick = e.target.closest('[data-svcpick]');
      if (e.key === 'ArrowDown') { e.preventDefault(); svcRender(pick); svcMove(pick, 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); svcMove(pick, -1); }
      else if (e.key === 'Enter') { e.preventDefault(); svcCommit(pick); }
      else if (e.key === 'Escape') { svcClose(pick); }
      return;
    }
    if (!e.target.matches('[data-address-suggest]')) return;
    var list = addressSuggestList(e.target);
    if (!list || list.hidden) return;
    var items = list.querySelectorAll('.addr-suggest__item');
    if (!items.length) return;
    var active = list.querySelector('.addr-suggest__item.is-active');
    var idx = Array.prototype.indexOf.call(items, active);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      idx = Math.min(items.length - 1, Math.max(0, idx) + 1);
      Array.prototype.forEach.call(items, function (el, i) { el.classList.toggle('is-active', i === idx); });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      idx = Math.max(0, idx - 1);
      Array.prototype.forEach.call(items, function (el, i) { el.classList.toggle('is-active', i === idx); });
    } else if (e.key === 'Enter' && active) {
      e.preventDefault();
      var pick = Number(active.getAttribute('data-address-pick'));
      var suggestions = list._suggestions || [];
      if (suggestions[pick]) fillAddressSuggestion(e.target, suggestions[pick]);
    } else if (e.key === 'Escape') {
      hideAddressSuggestions(e.target);
    }
  });

  root.addEventListener('mousedown', function (e) {
    var pickBtn = e.target.closest('[data-address-pick]');
    if (!pickBtn) return;
    e.preventDefault();
    var list = pickBtn.closest('.addr-suggest__list');
    var wrap = pickBtn.closest('.addr-suggest__wrap');
    var input = wrap && wrap.querySelector('[data-address-suggest]');
    var suggestions = (list && list._suggestions) || [];
    var pick = Number(pickBtn.getAttribute('data-address-pick'));
    if (input && suggestions[pick]) fillAddressSuggestion(input, suggestions[pick]);
  });

  root.addEventListener('blur', function (e) {
    if (e.target.matches('input[data-col], textarea[data-col]')) saveField(e.target);
    if (e.target.matches('[data-name-part]')) saveNameParts(e.target.closest('.lead'));
    if (e.target.matches('[data-address-suggest]')) {
      var input = e.target;
      setTimeout(function () { hideAddressSuggestions(input); }, 150);
    }
    if (e.target.matches('[data-zip-lookup]')) {
      clearTimeout(zipLookupTimer);
      runZipLookup(e.target);
    }
  }, true);

  function saveField(el) {
    var card = el.closest('.lead');
    if (!card || !el.dataset.col) return;
    var payload = { id: card.dataset.id };
    payload[el.dataset.col] = el.value;
    api('/api/admin/leads', { method: 'PATCH', body: JSON.stringify(payload) }).then(function (r) {
      var saved = card.querySelector('[data-saved]');
      if (!r.ok) {
        if (saved) {
          saved.hidden = false;
          saved.textContent = r.body.error || 'Save failed';
          saved.classList.add('saved--err');
          setTimeout(function () {
            saved.hidden = true;
            saved.textContent = 'Saved';
            saved.classList.remove('saved--err');
          }, 2500);
        }
        return;
      }
      if (saved) { saved.hidden = false; setTimeout(function () { saved.hidden = true; }, 1500); }
      state.leads.forEach(function (l) { if (l.id === card.dataset.id) l[el.dataset.col] = el.value; });
      if (el.dataset.col === 'status') {
        var head = card.querySelector('.lead__head .pill');
        head.className = 'pill pill--' + el.value;
        head.textContent = el.value.charAt(0).toUpperCase() + el.value.slice(1);
      }
      if (el.dataset.col === 'followup') {
        render();
      }
    });
  }

  signout.addEventListener('click', function () {
    api('/api/admin/logout', { method: 'POST' }).then(function () { showSignIn(''); });
  });

  function load() {
    api('/api/admin/status').then(function (s) {
      var status = s.body || {};
      if (!status.authConfigured) { showSetup(status); return; }
      if (!status.signedIn) { showSignIn(''); return; }
      if (!status.databaseConfigured) { showSetup(status); return; }
      state.propertyLookupConfigured = !!status.propertyLookupConfigured;
      state.emailConfigured = status.emailConfigured !== false;
      loadPipelineCounts();
      /* The quote editor seeds its note from Settings, so fetch that one
         value early. Kept apart from state.settings, which the Settings
         screen uses to tell "still loading" from "loaded and empty". */
      if (state.standardNote == null) {
        api('/api/admin/settings').then(function (r) {
          if (r.ok && r.body.settings) { state.standardNote = r.body.settings.quote_note || ''; }
        });
      }

      var qs = '?archived=' + (state.view === 'archived' ? '1' : '0');
      if (state.filter && state.view === 'active') qs += '&status=' + encodeURIComponent(state.filter);
      if (state.followup && state.view === 'active') qs += '&followup=1';

      api('/api/admin/leads' + qs).then(function (r) {
        if (r.status === 401) { showSignIn(''); return; }
        if (!r.ok) {
          root.innerHTML = '<div class="card setup"><h2>Database not ready</h2><p>' +
            esc(r.body.error || '') + '</p><p class="muted">Run: <code>npx wrangler d1 migrations apply oasis --remote</code></p></div>';
          return;
        }
        state.leads = r.body.leads || [];
        state.counts = r.body.counts || {};
        render();
      });
    });
  }

  var lastRefresh = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || signout.hidden) return;
    if (Date.now() - lastRefresh < 12000) return;
    lastRefresh = Date.now();
    var openId = state.open;
    var tab = openId && state.leadTab[openId];
    load();
    if (openId && tab === 'quotes') {
      setTimeout(function () { loadQuotes(openId); }, 300);
    }
  });

  load();
})();
