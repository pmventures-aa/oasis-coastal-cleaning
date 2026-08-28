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
    propertyLookupConfigured: null, emailConfigured: true
  };

  var OASIS = window.OASIS || {};

  function oasisCities() {
    var cities = [''];
    (OASIS.areas || []).forEach(function (g) {
      (g.cities || []).forEach(function (c) { if (cities.indexOf(c) === -1) cities.push(c); });
    });
    if (cities.indexOf('Somewhere else') === -1) cities.push('Somewhere else');
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
  function catalogPrice() {
    return '';
  }

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
    return '$' + x.toFixed(x % 1 ? 2 : 0);
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
  var money = function (cents) {
    var n = Number(cents);
    return Number.isFinite(n) ? '$' + (n / 100).toFixed(2) : '$0.00';
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
      '<div class="field" style="margin-top:1.2rem"><label for="pw">Password</label>' +
      '<input type="password" id="pw" autocomplete="current-password"></div>' +
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

  function quotePill(status) {
    var mapped = status === 'sent' ? 'quoted' : status === 'accepted' ? 'booked'
      : (status === 'declined' || status === 'expired') ? 'closed' : 'new';
    return pill(mapped, QUOTE_STATUS_LABELS[status] || status);
  }

  function field(l, col, value, opts) {
    opts = opts || {};
    if (opts.options) {
      return '<label class="pf"><span class="pf__k">' + esc(l) + '</span><select class="pf__v" data-col="' + col + '">' +
        opts.options.map(function (o) {
          return '<option value="' + esc(o) + '"' + (o === value ? ' selected' : '') + '>' + esc(o || '—') + '</option>';
        }).join('') + '</select></label>';
    }
    if (opts.multiline) {
      return '<label class="pf pf--wide"><span class="pf__k">' + esc(l) + '</span>' +
        '<textarea class="pf__v" data-col="' + col + '" rows="3" placeholder="' + esc(opts.placeholder || '') + '">' +
        esc(value || '') + '</textarea></label>';
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

  function detail(l) {
    var addOns = list(l.add_ons), conds = list(l.conditions), days = list(l.preferred_days);
    var tel = digits(l.phone);
    var hasPhone = tel.length >= 10;
    // Profile first — confirm contact & property, then build a branded quote.
    var tab = state.leadTab[l.id] || 'intake';

    var followFlag = l.followup && l.followup !== 'none'
      ? '<span class="pill pill--flag">' + (l.followup === 'visit' ? 'Wants a visit' : 'Wants a call') + '</span>' : '';
    var quoteBadge = '';
    if (l.latest_quote_status && l.latest_quote_status !== 'draft') {
      var ql = QUOTE_STATUS_LABELS[l.latest_quote_status] || l.latest_quote_status;
      quoteBadge = '<span class="pill pill--quoted">' + esc(ql) + '</span>';
    }

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
        field('Phone', 'phone', l.phone) +
        field('Email', 'email', l.email) +
        field('Prefers', 'contact_pref', l.contact_pref, { options: ['', 'Text', 'Call', 'Email'] }) +
        field('Best time', 'best_time', l.best_time, { options: ['', 'Morning', 'Afternoon', 'Evening', 'Any time'] }), true) +
      acc('Property',
        '<div class="profile__lookup">' +
          '<button type="button" class="btn btn--primary btn--tiny" data-property-lookup>Fill beds / baths / sq ft</button>' +
          '<span class="profile__lookup-msg muted" data-lookup-msg hidden></span>' +
        '</div>' + lookupHint +
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

    return '<div class="profile">' +
      '<div class="profile__headline">' + followFlag + quoteBadge + '</div>' +
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
  function quoteSeedFromLead(l) {
    if (!l) return { label: 'Cleaning service', notes: '' };
    var label = l.service_label || 'Cleaning visit';
    if (l.size_label) label += ' — ' + l.size_label;
    var noteBits = [];
    var place = [l.address, l.city, l.zip].filter(Boolean).join(', ');
    if (place) noteBits.push(place);
    var beds = [];
    if (l.bedrooms) beds.push(l.bedrooms + ' bed');
    if (l.bathrooms) beds.push(l.bathrooms + ' bath');
    if (beds.length) noteBits.push(beds.join(' / '));
    if (l.property_type) noteBits.push(l.property_type);
    var conds = list(l.conditions);
    if (conds.length) noteBits.push('Home: ' + conds.join(', '));
    return { label: label, notes: noteBits.join('\n') };
  }

  function catalogQuoteLinesFromLead(l) {
    if (!l) return [];
    var seed = quoteSeedFromLead(l);
    var lines = [{ label: seed.label, qty: 1, unit_dollars: '' }];
    list(l.add_ons).forEach(function (name) {
      var item = findCatalogByLabel(name);
      if (item) {
        lines.push({
          catalog_id: item.id,
          label: item.label,
          qty: 1,
          unit_dollars: String(catalogPrice(item))
        });
      } else {
        lines.push({ label: name, qty: 1, unit_dollars: '' });
      }
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

    return '<div class="qline' + (recurring ? ' is-recurring' : '') + '"' +
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
      '<div class="qline__meta">' +
        '<label class="qline__f qline__f--cadence"><span>How often</span>' +
          '<select class="quote-cadence">' +
            CADENCES.map(function (c) {
              return '<option value="' + c.id + '"' + (cadence === c.id ? ' selected' : '') + '>' +
                esc(c.label) + '</option>';
            }).join('') +
          '</select></label>' +
        '<button type="button" class="qline__remove" data-remove-line ' +
          'aria-label="Remove this line">Remove</button>' +
      '</div></div>';
  }

  function catalogSections() {
    var sections = [];
    if ((CATALOG.bases || []).length) {
      sections.push({ id: 'base', label: 'Base', items: CATALOG.bases });
    }
    var groups = {};
    var order = [];
    (CATALOG.addOns || []).forEach(function (a) {
      var g = a.group || 'Add-ons';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(a);
    });
    order.forEach(function (name) {
      var short = name === 'Around the house' ? 'House'
        : name === 'Organizing' ? 'Organize' : name;
      sections.push({
        id: 'g-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        label: short,
        items: groups[name]
      });
    });
    return sections;
  }

  function catalogRowHtml(item) {
    var price = catalogPrice(item);
    return '<div class="quote-catalog__row" data-catalog-row data-catalog-id="' + esc(item.id) + '" data-catalog-label="' + esc(item.label) + '">' +
      '<span class="quote-catalog__name">' + esc(item.label) + '</span>' +
      '<label class="quote-catalog__price">' +
        '<span class="sr-only">Price for ' + esc(item.label) + '</span>' +
        '<span class="quote-catalog__dollar" aria-hidden="true">$</span>' +
        '<input type="text" inputmode="decimal" class="quote-catalog__price-input" ' +
          'placeholder="0.00" value="' + esc(String(price)) + '" data-catalog-price-input>' +
      '</label>' +
      '<button type="button" class="btn btn--primary btn--tiny" data-add-catalog>Add</button>' +
    '</div>';
  }

  function quoteCatalogHtml() {
    var sections = catalogSections();
    if (!sections.length) return '';
    var tabs = sections.map(function (s, i) {
      return '<button type="button" class="quote-catalog__tab' + (i === 0 ? ' is-on' : '') +
        '" data-catalog-tab="' + esc(s.id) + '" role="tab">' + esc(s.label) + '</button>';
    }).join('');
    var panels = sections.map(function (s, i) {
      return '<div class="quote-catalog__panel' + (i === 0 ? ' is-on' : '') +
        '" data-catalog-panel="' + esc(s.id) + '" role="tabpanel">' +
        s.items.map(catalogRowHtml).join('') +
      '</div>';
    }).join('');

    return '<details class="quote-catalog" open>' +
      '<summary class="quote-catalog__sum">' +
        '<span class="quote-catalog__sum-title">Add priced items</span>' +
        '<span class="quote-catalog__sum-meta muted">Set $ for this quote, then Add</span>' +
      '</summary>' +
      '<div class="quote-catalog__body">' +
        '<div class="quote-catalog__tabs" role="tablist">' + tabs + '</div>' +
        panels +
      '</div></details>';
  }

  function quoteEditorHtml(l, quote, opts) {
    quote = quote || {};
    opts = opts || {};
    var standalone = opts.standalone;
    var seed = standalone ? { label: 'Cleaning service', notes: '' } : quoteSeedFromLead(l);
    var defaultLabel = seed.label;
    var lines = (quote.line_items && quote.line_items.length)
      ? quote.line_items
      : (standalone ? [{ label: defaultLabel, qty: 1, unit_dollars: '' }] : catalogQuoteLinesFromLead(l));
    if (!lines.length) lines = [{ label: defaultLabel, qty: 1, unit_dollars: '' }];
    var notesVal = quote.notes != null && quote.notes !== '' ? quote.notes : seed.notes;
    var nameParts = splitName(quote.customer_name || '');
    var customerFields = standalone
      ? '<div class="profile__grid compose__customer">' +
          '<label class="pf"><span class="pf__k">First name</span>' +
            '<input class="pf__v quote-first-name" type="text" autocomplete="given-name" placeholder="First" value="' +
            esc(nameParts.first) + '"></label>' +
          '<label class="pf"><span class="pf__k">Last name</span>' +
            '<input class="pf__v quote-last-name" type="text" autocomplete="family-name" placeholder="Last" value="' +
            esc(nameParts.last) + '"></label>' +
          '<label class="pf"><span class="pf__k">Email</span><input class="pf__v quote-email" type="email" placeholder="name@email.com" value="' +
            esc(quote.customer_email || '') + '"></label>' +
          '<label class="pf"><span class="pf__k">Phone</span><input class="pf__v quote-phone" type="tel" placeholder="Optional" value=""></label>' +
          '<label class="pf"><span class="pf__k">ZIP</span>' +
            '<input class="pf__v quote-zip" type="text" data-zip-lookup inputmode="numeric" autocomplete="postal-code" placeholder="5-digit ZIP" maxlength="10"></label>' +
          '<label class="pf pf--wide addr-suggest"><span class="pf__k">Street address</span>' +
            '<div class="addr-suggest__wrap">' +
              '<input class="pf__v quote-address" type="text" data-address-suggest autocomplete="off" disabled ' +
                'placeholder="Enter ZIP first">' +
              '<ul class="addr-suggest__list" hidden role="listbox"></ul>' +
            '</div>' +
            '<span class="addr-suggest__hint">ZIP first, then street — suggestions stay in that ZIP</span></label>' +
          '<label class="pf"><span class="pf__k">City</span><select class="pf__v quote-city">' +
            oasisCities().map(function (c) {
              return '<option value="' + esc(c) + '">' + esc(c || '—') + '</option>';
            }).join('') + '</select></label>' +
          '<label class="pf"><span class="pf__k">Service</span><input class="pf__v quote-service" type="text" placeholder="What the job is" value=""></label>' +
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
        ' data-quote-id="' + esc(quote.id || '') + '" data-lead-id="' + esc(l ? l.id : '') + '">' +
      customerFields +
      '<div class="quote-lines">' + lines.map(quoteLineHtml).join('') + '</div>' +
      /* Adding a line is the main way a quote gets built — the saved list is
         the shortcut, not the other way round — so it is a full-width button
         under the lines rather than a tiny link beside them. */
      '<div class="quote-lines-actions">' +
        '<button type="button" class="btn btn--primary btn--block" data-add-line>' +
          '+ Add a line</button>' +
      '</div>' +
      '<div class="quote-total" data-quote-total>' + money(calcLineTotal(lines)) + '</div>' +
      '<details class="quote-catalog-wrap"><summary>Or pick from your saved services</summary>' +
        quoteCatalogHtml() + '</details>' +
      '<label class="pf pf--wide"><span class="pf__k">Note</span><textarea class="pf__v quote-notes" rows="2">' +
        esc(notesVal || '') + '</textarea></label>' +
      (alreadyOut
        ? '<p class="quote-revise-note muted">' +
            'This one is already with ' + esc((quote.customer_name || l && l.name || 'the customer').split(' ')[0]) +
            '. Updating it sends the new version to the same link.</p>'
        : '') +
      '<div class="quote-actions quote-actions--sticky">' +
        '<button type="button" class="btn btn--ghost" data-save-quote>' +
          (alreadyOut ? 'Save without sending' : 'Save Draft') + '</button>' +
        '<button type="button" class="btn btn--primary" data-send-quote>' +
          (alreadyOut ? 'Update &amp; resend' : 'Send to Customer') + '</button></div>' +
      '<div class="quote-msg form-status" role="alert" hidden></div></div>' +
      (standalone ? '' : '</div></details>');
  }

  function addCatalogItem(editor, btn) {
    var row = btn.closest('[data-catalog-row]');
    if (!row) return;
    var id = row.getAttribute('data-catalog-id') || '';
    var label = row.getAttribute('data-catalog-label') || '';
    var priceInput = row.querySelector('[data-catalog-price-input]');
    var priceRaw = priceInput ? String(priceInput.value || '').replace(/[^0-9.]/g, '') : '';
    var priceNum = Number(priceRaw);
    if (!label) return;
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      if (priceInput) priceInput.focus();
      return;
    }
    var price = String(Math.round(priceNum * 100) / 100);

    var lines = editor.querySelector('.quote-lines');
    var existing = null;
    Array.prototype.forEach.call(lines.querySelectorAll('.qline'), function (line) {
      var rowId = line.getAttribute('data-catalog-id');
      var rowLabel = (line.querySelector('.quote-label') || {}).value || '';
      if (!existing && ((id && rowId === id) || rowLabel === label)) existing = line;
    });

    if (existing) {
      var qtyEl = existing.querySelector('.quote-qty');
      var priceEl = existing.querySelector('.quote-price');
      qtyEl.value = String(Math.min(999, (parseInt(qtyEl.value, 10) || 1) + 1));
      if (priceEl) priceEl.value = price;
    } else {
      var rows = lines.querySelectorAll('.qline');
      if (rows.length === 1) {
        var only = rows[0];
        var onlyPrice = (only.querySelector('.quote-price') || {}).value;
        var onlyLabel = ((only.querySelector('.quote-label') || {}).value || '').trim();
        if (!onlyPrice && onlyLabel && !only.getAttribute('data-catalog-id')) {
          only.remove();
        }
      }
      lines.insertAdjacentHTML('beforeend', quoteLineHtml({
        catalog_id: id,
        label: label,
        qty: 1,
        unit_dollars: price
      }));
    }
    updateQuoteTotal(editor);
    row.classList.add('is-added');
    setTimeout(function () { row.classList.remove('is-added'); }, 700);
  }

  function switchCatalogTab(tabBtn) {
    var catalog = tabBtn.closest('.quote-catalog');
    if (!catalog) return;
    var id = tabBtn.getAttribute('data-catalog-tab');
    Array.prototype.forEach.call(catalog.querySelectorAll('[data-catalog-tab]'), function (t) {
      t.classList.toggle('is-on', t === tabBtn);
    });
    Array.prototype.forEach.call(catalog.querySelectorAll('[data-catalog-panel]'), function (p) {
      p.classList.toggle('is-on', p.getAttribute('data-catalog-panel') === id);
    });
  }

  function newQuotePanelHtml() {
    return '<section class="compose" aria-labelledby="compose-title">' +
      '<div class="compose__head">' +
        '<div class="compose__titles">' +
          '<h2 id="compose-title" class="compose__title">New Quote</h2>' +
          '<p class="compose__sub muted">Price and send now — also saves a customer card.</p>' +
        '</div>' +
        '<button type="button" class="btn btn--ghost btn--tiny" data-close-compose>Cancel</button>' +
      '</div>' +
      quoteEditorHtml(null, {}, { standalone: true }) +
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
      '<div class="profile__grid compose__customer">' +
        '<label class="pf"><span class="pf__k">First name *</span><input class="pf__v" type="text" data-lead-field="first_name" autocomplete="given-name"></label>' +
        '<label class="pf"><span class="pf__k">Last name</span><input class="pf__v" type="text" data-lead-field="last_name" autocomplete="family-name"></label>' +
        '<label class="pf"><span class="pf__k">Phone *</span><input class="pf__v" type="tel" data-lead-field="phone" autocomplete="tel"></label>' +
        '<label class="pf"><span class="pf__k">Email</span><input class="pf__v" type="email" data-lead-field="email" autocomplete="email"></label>' +
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
        '<label class="pf pf--wide"><span class="pf__k">Notes</span><textarea class="pf__v" data-lead-field="notes" rows="2" placeholder="What they asked for on the call"></textarea></label>' +
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
      notes: get('notes')
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

  function calcLineTotal(lines) {
    return (lines || []).reduce(function (sum, line) {
      var qty = Math.max(1, parseInt(line.qty, 10) || 1);
      var unit = line.unit_price != null ? line.unit_price : parseDollars(line.unit_dollars);
      return sum + qty * unit;
    }, 0);
  }

  function parseEventDetail(raw) {
    try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }

  function trackingSummary(q) {
    var bits = [];
    if (q.email_status && q.email_status !== 'pending') bits.push(EMAIL_STATUS_LABELS[q.email_status] || q.email_status);
    if (q.first_viewed_at) bits.push('Viewed' + (q.view_count > 1 ? ' (' + q.view_count + '×)' : ''));
    if (q.accepted_at) bits.push('Accepted');
    else if (q.declined_at) bits.push('Declined');
    else if (q.status === 'sent' && !q.first_viewed_at) bits.push('Awaiting response');
    return bits.join(' · ');
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
    var summary = trackingSummary(q);
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
      '<div class="acc__in quote-card-mini">' + quotePill(q.status) +
        (q.status !== 'draft' && q.token
          ? '<span class="quote-link">' +
              '<a href="/proposal?t=' + esc(q.token) + '" target="_blank" rel="noopener">Customer link</a>' +
              '<button type="button" class="btn btn--ghost btn--tiny" data-copy-link data-link="' + esc(proposalUrl) + '">Copy link</button>' +
            '</span>'
          : '') +
        (to ? '<p class="quote-card-mini__track muted">To ' + esc(to) + '</p>' : '') +
        (summary ? '<p class="quote-card-mini__track muted">' + esc(summary) + '</p>' : '') +
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
    var input = f.type === 'textarea'
      ? '<textarea id="' + id + '" class="pf__v" rows="2" data-setting="' + esc(f.key) + '">' + esc(value || '') + '</textarea>'
      : '<input id="' + id + '" class="pf__v" type="' + (f.type === 'number' ? 'number' : f.type === 'email' ? 'email' : 'text') + '"' +
        (f.type === 'number' ? ' min="1" max="365"' : '') +
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

    var groups = SETTING_GROUPS.map(function (g) {
      return '<section class="card set-group">' +
        '<h3 class="set-group__title">' + esc(g.title) + '</h3>' +
        g.keys.map(function (k) {
          return fields[k] ? settingField(fields[k], state.settings[k]) : '';
        }).join('') + '</section>';
    }).join('');

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
        turnstileWarning +
      '</section>' +
      '<div class="settings__save">' +
        '<button type="button" class="btn btn--primary" data-save-settings>Save settings</button>' +
        '<span class="settings__msg form-status" role="status" hidden></span>' +
      '</div></div>';
  }

  function loadSettings() {
    api('/api/admin/settings').then(function (r) {
      if (!r.ok) {
        state.settings = {}; state.settingsFields = []; state.health = {};
        render();
        return;
      }
      state.settings = r.body.settings;
      state.settingsFields = r.body.fields;
      state.health = r.body.health || {};
      state.schema = r.body.schema || {};
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
  function clientCard(c) {
    var props = c.properties || [];
    var name = c.company ? c.company : c.name;
    var second = c.company && c.name && c.company !== c.name ? c.name : '';

    return '<article class="ccard" data-customer-id="' + esc(c.id) + '">' +
      '<div class="ccard__head">' +
        '<div><h3 class="ccard__name">' + esc(name) + '</h3>' +
          (second ? '<p class="muted ccard__second">' + esc(second) + '</p>' : '') + '</div>' +
        '<span class="ccard__count">' + props.length +
          (props.length === 1 ? ' address' : ' addresses') + '</span>' +
      '</div>' +
      '<p class="ccard__reach">' +
        (c.phone ? '<a href="' + esc(FMT.telHref(c.phone)) + '">' + esc(FMT.formatPhone(c.phone)) + '</a>' : '') +
        (c.phone && c.email ? '<span class="muted"> · </span>' : '') +
        (c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '') +
      '</p>' +
      (props.length
        ? '<ul class="ccard__props">' + props.map(function (p) {
            var line = [p.label, p.address, p.city].filter(Boolean).join(' · ');
            var size = [p.bedrooms && p.bedrooms + ' bed', p.bathrooms && p.bathrooms + ' bath', p.size_label]
              .filter(Boolean).join(' · ');
            return '<li><strong>' + esc(line || 'Address not filled in yet') + '</strong>' +
              (size ? '<span class="muted"> — ' + esc(size) + '</span>' : '') + '</li>';
          }).join('') + '</ul>'
        : '<p class="muted ccard__props-empty">No addresses recorded yet.</p>') +
      '<div class="ccard__acts">' +
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
    var many = list.filter(function (c) { return (c.properties || []).length > 1; }).length;
    return (many ? '<p class="pipeline__sum">' + many + ' of these have more than one address.</p>' : '') +
      '<div class="ccards">' + list.map(clientCard).join('') + '</div>';
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
    if (q.view_count > 0 && view === 'pending') {
      flags += '<span class="pill pill--quoted">Opened ' + q.view_count + '&times;</span>';
    }

    var acts = '';
    if (view === 'pending') {
      acts = btn('resend', q, 'Send again', 'primary') + copyLinkBtn(q);
    } else if (view === 'accepted') {
      acts = (q.completed_at
        ? btn('uncomplete', q, 'Not finished after all', 'ghost')
        : btn('complete', q, 'Mark the job done', 'primary')) +
        btn('paid', q, 'Mark paid', q.completed_at ? 'primary' : 'ghost');
    } else if (view === 'paid') {
      acts = btn('unpaid', q, 'Not paid after all', 'ghost');
    } else if (view === 'quotes') {
      acts = btn('open-lead', q, 'Open and finish it', 'primary');
    }
    acts += '<a class="btn btn--ghost btn--tiny" href="/api/admin/quotes/pdf?id=' + esc(q.id) +
      '" target="_blank" rel="noopener">PDF</a>';

    return '<article class="pcard">' +
      '<div class="pcard__head">' +
        '<div><h3 class="pcard__who">' + esc(who) + '</h3>' +
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
    var head = '';
    if (view === 'accepted') {
      var owed = state.pipelineCounts.outstanding_cents || 0;
      head = '<p class="pipeline__sum">' + esc(money(owed)) + ' still to collect across ' +
        list.length + ' job' + (list.length === 1 ? '' : 's') + '.</p>';
    }
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

  function quotePayload(editor) {
    var payload = {
      id: editor.dataset.quoteId || undefined,
      lead_id: editor.dataset.leadId || undefined,
      line_items: Array.prototype.map.call(editor.querySelectorAll('.qline'), function (row) {
        return {
          label: row.querySelector('.quote-label').value,
          qty: row.querySelector('.quote-qty').value,
          unit_dollars: row.querySelector('.quote-price').value,
          cadence: (row.querySelector('.quote-cadence') || {}).value || 'onetime'
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
      delete payload.lead_id;
      delete payload.id;
    }
    return payload;
  }

  function afterQuoteSaved(editor, r) {
    if (!editor.dataset.standalone) return false;
    var leadId = r.body.lead_id || (r.body.quote && r.body.quote.lead_id);
    state.composing = false;
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
        // Saving a quote that was already out pulls it back to a draft, so her
        // customer's link stops working until she sends again. Say so plainly.
        var wasOut = editor.dataset.alreadyOut === '1';
        if (payload.lead_id) delete state.editingQuote[payload.lead_id];
        showQuoteMsg(editor, wasOut
          ? 'Saved. The customer link is paused until you send the update.'
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
    if (e.target.matches('[data-view]')) {
      state.view = e.target.dataset.view;
      state.filter = ''; state.followup = false; state.open = null;
      state.composing = false; state.composingLead = false;
      if (state.view === 'settings') { render(); loadSettings(); return; }
      if (state.view === 'clients') { loadClients(); return; }
      if (STAGE_FOR_VIEW[state.view]) { loadPipeline(state.view); return; }
      load(); return;
    }
    if (e.target.matches('[data-new-lead]')) {
      state.composingLead = true; state.composing = false; state.open = null;
      render(); return;
    }
    if (e.target.matches('[data-close-compose-lead]')) {
      state.composingLead = false;
      render(); return;
    }
    if (e.target.matches('[data-save-lead]')) {
      saveNewLead();
      return;
    }
    if (e.target.matches('[data-followup-filter]')) {
      state.followup = !state.followup;
      state.open = null;
      load();
      return;
    }
    if (e.target.matches('[data-copy-link]')) {
      var link = e.target.getAttribute('data-link') || '';
      if (!link) return;
      copyText(link).then(function () {
        var orig = e.target.textContent;
        e.target.textContent = 'Copied!';
        setTimeout(function () { e.target.textContent = orig; }, 1600);
      });
      return;
    }
    if (e.target.matches('[data-new-quote]')) {
      state.composing = true; state.composingLead = false; state.open = null;
      render(); return;
    }
    if (e.target.matches('[data-close-compose]')) {
      state.composing = false;
      render(); return;
    }
    if (e.target.matches('[data-start-quote]')) {
      var startCard = e.target.closest('.lead');
      if (startCard) openQuoteTab(startCard.dataset.id);
      return;
    }
    if (e.target.matches('[data-property-lookup]')) {
      lookupProperty(e.target);
      return;
    }
    if (e.target.matches('[data-ptab-jump]')) {
      var jumpCard = e.target.closest('.lead');
      if (jumpCard) {
        state.leadTab[jumpCard.dataset.id] = e.target.getAttribute('data-ptab-jump') || 'intake';
        render();
      }
      return;
    }
    if (e.target.matches('[data-ptab]')) {
      var card = e.target.closest('.lead');
      state.leadTab[card.dataset.id] = e.target.dataset.ptab;
      render();
      if (e.target.dataset.ptab === 'quotes') loadQuotes(card.dataset.id);
      return;
    }
    if (e.target.matches('[data-toggle]')) {
      var c = e.target.closest('.lead');
      state.open = state.open === c.dataset.id ? null : c.dataset.id;
      render();
      if (state.open && (state.leadTab[state.open] || 'intake') === 'quotes') loadQuotes(state.open);
      return;
    }
    if (e.target.matches('[data-lead-action]')) {
      leadAction(e.target.closest('.lead'), e.target.dataset.leadAction);
      return;
    }
    if (e.target.matches('[data-quote-action]')) {
      quoteAction(e.target, e.target.dataset.quoteAction);
      return;
    }
    if (e.target.matches('[data-add-line]')) {
      var ed = e.target.closest('.quote-editor');
      ed.querySelector('.quote-lines').insertAdjacentHTML('beforeend', quoteLineHtml({}));
      updateQuoteTotal(ed); return;
    }
    var catalogTab = e.target.closest('[data-catalog-tab]');
    if (catalogTab) {
      switchCatalogTab(catalogTab);
      return;
    }
    var catalogBtn = e.target.closest('[data-add-catalog]');
    if (catalogBtn) {
      addCatalogItem(catalogBtn.closest('.quote-editor'), catalogBtn);
      return;
    }
    if (e.target.matches('[data-remove-line]')) {
      var row = e.target.closest('.qline');
      var editor = e.target.closest('.quote-editor');
      if (editor.querySelectorAll('.qline').length > 1) { row.remove(); updateQuoteTotal(editor); }
      return;
    }
    if (e.target.matches('[data-run-setup]')) { runSetup(e.target); return; }
    if (e.target.matches('[data-save-settings]')) { saveSettingsFromForm(); return; }
    if (e.target.matches('[data-save-quote]')) saveQuote(e.target.closest('.quote-editor'));
    if (e.target.matches('[data-send-quote]')) {
      var ed = e.target.closest('.quote-editor');
      // Say which of the two things is about to happen. Resending a revision
      // is a different promise from sending a quote for the first time.
      var revising = ed && ed.dataset.alreadyOut === '1';
      var ask = revising
        ? 'Send the updated quote? The customer gets the new amount at the same link.'
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

  root.addEventListener('input', function (e) {
    if (e.target.id === 'search') { state.q = e.target.value; applySearchFilter(); }
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

  root.addEventListener('keydown', function (e) {
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
