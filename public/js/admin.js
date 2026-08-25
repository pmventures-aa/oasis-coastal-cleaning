/* ==========================================================================
   Oasis Coastal Cleaning — the dashboard
   --------------------------------------------------------------------------
   One screen. Sign in, then every request that has come through, newest
   first. Click a row and it opens into a full profile: what they sent, what
   she has learned since, and what she quoted.

   Everything on the detail view is editable except the timestamp — customers
   mistype their email, and she finds out the gate code on the phone.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.getElementById('admin-root');
  var signout = document.getElementById('signout');
  if (!root) { return; }

  var STATUSES = ['new', 'contacted', 'quoted', 'booked', 'closed'];
  var state = { filter: '', open: null, leads: [], counts: {}, q: '' };

  var esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  var when = function (iso) {
    var d = new Date(iso);
    if (isNaN(d)) { return iso || ''; }
    var mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) { return 'just now'; }
    if (mins < 60) { return mins + 'm ago'; }
    if (mins < 1440) { return Math.round(mins / 60) + 'h ago'; }
    if (mins < 10080) { return Math.round(mins / 1440) + 'd ago'; }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  var fullDate = function (iso) {
    var d = new Date(iso);
    return isNaN(d) ? (iso || '') : d.toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  };

  var list = function (json) {
    try { var a = JSON.parse(json || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  };

  var digits = function (v) { return String(v || '').replace(/\D/g, ''); };

  var api = function (path, opts) {
    return fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts))
      .then(function (r) {
        return r.json().catch(function () { return {}; })
          .then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
      });
  };

  /* ------------------------------------------------------------- sign in */
  function showSignIn(msg) {
    signout.hidden = true;
    root.innerHTML =
      '<div class="card signin">' +
        '<h2>Sign in</h2>' +
        '<p>This is where your quote requests land.</p>' +
        '<div class="field" style="margin-top:1.2rem">' +
          '<label for="pw">Password</label>' +
          '<input type="password" id="pw" autocomplete="current-password">' +
        '</div>' +
        '<div id="signin-err" class="form-status form-status--err" role="alert"' +
          (msg ? '' : ' hidden') + '>' + esc(msg || '') + '</div>' +
        '<p style="margin-top:1.2rem"><button type="button" id="go" class="btn btn--primary btn--block">' +
          'Sign in</button></p>' +
      '</div>';

    var pw = document.getElementById('pw');
    var go = function () {
      var err = document.getElementById('signin-err');
      api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: pw.value }) })
        .then(function (r) {
          if (r.ok) { load(); return; }
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
      '<div class="card setup">' +
        '<h2>Two settings and this is yours</h2>' +
        '<p class="muted">The website is live and working. This page needs a little more ' +
          'before it can show you anything.</p>' +
        '<ol>' +
          (status.authConfigured ? '' :
            '<li>In Cloudflare, open this project → <strong>Settings → Variables and secrets</strong> ' +
            'and add <code>ADMIN_PASSWORD</code> (the password you want to use here) and ' +
            '<code>SESSION_SECRET</code> (any long random string).</li>') +
          (status.databaseConfigured ? '' :
            '<li>Create a D1 database named <code>oasis</code>, bind it as <code>DB</code>, ' +
            'and run the table setup from <code>migrations/</code>.</li>') +
          (status.emailConfigured ? '' :
            '<li><em>Optional for now.</em> Add <code>RESEND_API_KEY</code> and new requests ' +
            'also arrive by email. Without it they are still saved here.</li>') +
        '</ol>' +
        '<p class="muted" style="font-size:var(--step--1);margin-top:1rem">' +
          'Settings only take effect on a new deployment — after saving, go to ' +
          '<strong>Deployments</strong> and retry the latest one.</p>' +
      '</div>';
  }

  /* --------------------------------------------------------------- pieces */
  function pill(status) {
    return '<span class="pill pill--' + esc(status) + '">' + esc(status) + '</span>';
  }

  function field(l, col, value, opts) {
    opts = opts || {};
    var id = 'f-' + col;
    if (opts.options) {
      return '<label class="pf"><span class="pf__k">' + esc(l) + '</span>' +
        '<select class="pf__v" data-col="' + col + '" id="' + id + '">' +
          opts.options.map(function (o) {
            return '<option value="' + esc(o) + '"' + (o === value ? ' selected' : '') + '>' +
                   esc(o) + '</option>';
          }).join('') +
        '</select></label>';
    }
    if (opts.multiline) {
      return '<label class="pf pf--wide"><span class="pf__k">' + esc(l) + '</span>' +
        '<textarea class="pf__v" data-col="' + col + '" id="' + id + '" rows="3" ' +
          'placeholder="' + esc(opts.placeholder || '') + '">' + esc(value || '') + '</textarea></label>';
    }
    return '<label class="pf"><span class="pf__k">' + esc(l) + '</span>' +
      '<input class="pf__v" type="text" data-col="' + col + '" id="' + id + '" ' +
        'value="' + esc(value || '') + '" placeholder="' + esc(opts.placeholder || '') + '"></label>';
  }

  function readOnly(l, v) {
    if (!v) { return ''; }
    return '<div class="pf pf--ro"><span class="pf__k">' + esc(l) + '</span>' +
           '<span class="pf__v">' + esc(v) + '</span></div>';
  }

  function detail(l) {
    var addOns = list(l.add_ons), conds = list(l.conditions), days = list(l.preferred_days);
    var tel = digits(l.phone);

    return '<div class="profile">' +

      '<div class="profile__bar">' +
        '<a class="btn btn--primary" href="tel:+1' + tel + '">Call</a>' +
        '<a class="btn btn--ghost" href="sms:+1' + tel + '">Text</a>' +
        '<a class="btn btn--ghost" href="mailto:' + esc(l.email) + '">Email</a>' +
        '<span class="profile__spacer"></span>' +
        '<label class="pf pf--inline"><span class="pf__k">Status</span>' +
          '<select class="pf__v" data-col="status">' +
            STATUSES.map(function (s) {
              return '<option value="' + s + '"' + (l.status === s ? ' selected' : '') + '>' +
                     s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
            }).join('') +
          '</select></label>' +
        '<span class="saved" data-saved hidden>Saved</span>' +
      '</div>' +

      '<section class="profile__block">' +
        '<h4>Contact</h4>' +
        '<div class="profile__grid">' +
          field('Name', 'name', l.name) +
          field('Phone', 'phone', l.phone) +
          field('Email', 'email', l.email) +
          field('Prefers', 'contact_pref', l.contact_pref, { options: ['', 'Text', 'Call', 'Email'] }) +
          field('Best time', 'best_time', l.best_time, { options: ['', 'Morning', 'Afternoon', 'Evening', 'Any time'] }) +
        '</div>' +
      '</section>' +

      '<section class="profile__block">' +
        '<h4>The property</h4>' +
        '<div class="profile__grid">' +
          field('Address', 'address', l.address, { placeholder: 'Street address' }) +
          field('City', 'city', l.city) +
          field('ZIP', 'zip', l.zip) +
          field('Type', 'property_type', l.property_type) +
          field('Size', 'size_label', l.size_label) +
          field('Bedrooms', 'bedrooms', l.bedrooms) +
          field('Bathrooms', 'bathrooms', l.bathrooms) +
          field('Getting in', 'access', l.access, { placeholder: 'Lockbox, gate code, doorman' }) +
        '</div>' +
      '</section>' +

      '<section class="profile__block">' +
        '<h4>What they asked for</h4>' +
        '<div class="profile__grid">' +
          readOnly('Service', l.service_label || l.service) +
          field('Frequency', 'frequency', l.frequency) +
          readOnly('First visit', l.first_visit ? 'Yes — deeper clean' : 'No') +
          readOnly('Wants to start', l.start_when) +
          readOnly('Preferred days', days.join(', ')) +
        '</div>' +
        (addOns.length
          ? '<div class="chips"><span class="chips__k">Add-ons</span>' +
            addOns.map(function (a) { return '<span class="chip">' + esc(a) + '</span>'; }).join('') +
            '</div>' : '') +
        (conds.length
          ? '<div class="chips"><span class="chips__k">About the home</span>' +
            conds.map(function (c) { return '<span class="chip chip--warn">' + esc(c) + '</span>'; }).join('') +
            '</div>' : '') +
        '<div class="profile__grid">' +
          field('What they told us', 'notes', l.notes, { multiline: true }) +
        '</div>' +
      '</section>' +

      '<section class="profile__block profile__block--mine">' +
        '<h4>Your quote</h4>' +
        '<div class="profile__grid">' +
          field('Amount quoted', 'quoted_amount', l.quoted_amount, { placeholder: 'e.g. $185 per visit' }) +
          field('Next visit', 'next_visit', l.next_visit, { placeholder: 'e.g. Tue 9 Sep, 9am' }) +
        '</div>' +
        (l.quoted_at ? '<p class="profile__stamp">Quoted ' + esc(fullDate(l.quoted_at)) + '</p>' : '') +
        '<div class="profile__grid">' +
          field('Your notes', 'admin_notes', l.admin_notes, {
            multiline: true,
            placeholder: 'What you quoted and why, when you called, anything to remember.'
          }) +
        '</div>' +
      '</section>' +

      '<p class="profile__stamp">Came in ' + esc(fullDate(l.created_at)) +
        (l.updated_at ? ' · last edited ' + esc(when(l.updated_at)) : '') + '</p>' +
    '</div>';
  }

  function row(l) {
    var flag = l.followup && l.followup !== 'none'
      ? '<span class="pill pill--flag">' + (l.followup === 'visit' ? 'Wants a visit' : 'Wants a call') + '</span>'
      : '';
    var open = state.open === l.id;
    return '<article class="lead' + (open ? ' is-open' : '') + '" data-id="' + esc(l.id) + '">' +
             '<button type="button" class="lead__head" data-toggle aria-expanded="' + open + '">' +
               '<span class="lead__name">' + esc(l.name) + '</span>' +
               pill(l.status) + flag +
               '<span class="lead__meta">' + esc(l.service_label || l.service) +
                 (l.city ? ' · ' + esc(l.city) : '') + '</span>' +
               (l.quoted_amount ? '<span class="lead__quote">' + esc(l.quoted_amount) + '</span>' : '') +
               '<span class="lead__when">' + esc(when(l.created_at)) + '</span>' +
             '</button>' +
             (open ? '<div class="lead__body">' + detail(l) + '</div>' : '') +
           '</article>';
  }

  function render() {
    signout.hidden = false;
    var counts = state.counts;
    var total = Object.keys(counts).reduce(function (n, k) { return n + counts[k]; }, 0);

    var shown = state.leads.filter(function (l) {
      if (!state.q) { return true; }
      var hay = [l.name, l.phone, l.email, l.city, l.address, l.service_label]
        .join(' ').toLowerCase();
      return hay.indexOf(state.q.toLowerCase()) !== -1;
    });

    root.innerHTML =
      '<div class="toolbar">' +
        '<div class="filters">' +
          '<button type="button" data-filter=""' + (state.filter === '' ? ' class="is-on"' : '') + '>' +
            'All<b>' + total + '</b></button>' +
          STATUSES.map(function (s) {
            return '<button type="button" data-filter="' + s + '"' +
                   (state.filter === s ? ' class="is-on"' : '') + '>' +
                   s + '<b>' + (counts[s] || 0) + '</b></button>';
          }).join('') +
        '</div>' +
        '<input type="search" id="search" class="toolbar__search" placeholder="Search name, phone, city…" ' +
          'value="' + esc(state.q) + '">' +
      '</div>' +
      (shown.length
        ? '<div class="leads">' + shown.map(row).join('') + '</div>'
        : '<p class="empty">' + (state.q ? 'Nothing matches that.' :
            'Nothing here yet. New quote requests appear at the top, newest first.') + '</p>');

    var search = document.getElementById('search');
    if (search && state.q) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
    }
  }

  /* --------------------------------------------------------------- events */
  root.addEventListener('click', function (e) {
    var f = e.target.closest('[data-filter]');
    if (f) { state.filter = f.dataset.filter; state.open = null; load(); return; }

    var t = e.target.closest('[data-toggle]');
    if (t) {
      var card = t.closest('.lead');
      state.open = state.open === card.dataset.id ? null : card.dataset.id;
      render();
    }
  });

  root.addEventListener('input', function (e) {
    if (e.target.id === 'search') { state.q = e.target.value; render(); }
  });

  // Saves happen on change for menus and on blur for typed fields, so nothing
  // needs a save button and nothing is lost by clicking away.
  root.addEventListener('change', function (e) {
    if (e.target.matches('select[data-col]')) { save(e.target); }
  });
  root.addEventListener('blur', function (e) {
    if (e.target.matches('input[data-col], textarea[data-col]')) { save(e.target); }
  }, true);

  function save(el) {
    var card = el.closest('.lead');
    if (!card) { return; }
    var col = el.dataset.col;
    var payload = { id: card.dataset.id };
    payload[col] = el.value;

    api('/api/admin/leads', { method: 'PATCH', body: JSON.stringify(payload) })
      .then(function (r) {
        if (!r.ok) { return; }
        var saved = card.querySelector('[data-saved]');
        if (saved) {
          saved.hidden = false;
          setTimeout(function () { saved.hidden = true; }, 1500);
        }
        // keep our copy current so a re-render does not show stale values
        state.leads.forEach(function (l) { if (l.id === card.dataset.id) { l[col] = el.value; } });
        if (col === 'status') {
          var head = card.querySelector('.lead__head .pill');
          head.className = 'pill pill--' + el.value;
          head.textContent = el.value;
        }
      });
  }

  signout.addEventListener('click', function () {
    api('/api/admin/logout', { method: 'POST' }).then(function () { showSignIn(''); });
  });

  /* ----------------------------------------------------------------- boot */
  function load() {
    api('/api/admin/status', { method: 'GET' }).then(function (s) {
      var status = s.body || {};
      if (!status.authConfigured) { showSetup(status); return; }
      if (!status.signedIn) { showSignIn(''); return; }
      if (!status.databaseConfigured) { showSetup(status); return; }

      api('/api/admin/leads' + (state.filter ? '?status=' + state.filter : ''), { method: 'GET' })
        .then(function (r) {
          if (r.status === 401) { showSignIn(''); return; }
          if (!r.ok) {
            signout.hidden = false;
            root.innerHTML = '<div class="card setup"><h2>The database is not ready</h2>' +
              '<p>' + esc(r.body.error || 'Something went wrong.') + '</p></div>';
            return;
          }
          state.leads = r.body.leads || [];
          state.counts = r.body.counts || {};
          render();
        });
    });
  }

  load();
})();
