/* ==========================================================================
   Oasis Coastal Cleaning — leads portal
   One screen: sign in, then every request that has come through, newest
   first, with a status you can move and a place to keep notes.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.getElementById('admin-root');
  var signout = document.getElementById('signout');
  if (!root) { return; }

  var STATUSES = ['new', 'contacted', 'quoted', 'booked', 'closed'];
  var filter = '';
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
    if (mins < 60) { return mins + ' min ago'; }
    if (mins < 60 * 24) { return Math.round(mins / 60) + ' hr ago'; }
    if (mins < 60 * 24 * 7) { return Math.round(mins / 1440) + ' days ago'; }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  var list = function (json) {
    try { var a = JSON.parse(json || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  };

  var api = function (path, opts) {
    return fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts))
      .then(function (r) {
        return r.json().catch(function () { return {}; })
          .then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
      });
  };

  /* ------------------------------------------------------------- screens */
  function showSignIn(msg) {
    signout.hidden = true;
    root.innerHTML =
      '<div class="card signin">' +
        '<h2>Sign in</h2>' +
        '<p>This is where quote requests land.</p>' +
        '<div class="field" style="margin-top:1.2rem">' +
          '<label for="pw">Password</label>' +
          '<input type="password" id="pw" autocomplete="current-password">' +
        '</div>' +
        '<div id="signin-err" class="form-status form-status--err" role="alert"' +
          (msg ? '' : ' hidden') + '>' + esc(msg || '') + '</div>' +
        '<p style="margin-top:1.2rem"><button type="button" id="go" class="btn btn--primary" ' +
          'style="border:0;cursor:pointer;font-family:var(--font-body);width:100%">Sign in</button></p>' +
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
        '<h2>Almost there — two settings to add</h2>' +
        '<p class="muted">The site is live and quote requests are being emailed. This portal ' +
          'needs a little more before it can show them to you.</p>' +
        '<ol>' +
          (status.authConfigured ? '' :
            '<li>In Cloudflare, open this Pages project → <strong>Settings → Variables and secrets</strong> ' +
            'and add <code>ADMIN_PASSWORD</code> (the password you want to use here) and ' +
            '<code>SESSION_SECRET</code> (any long random string).</li>') +
          (status.databaseConfigured ? '' :
            '<li>Create the database and bind it as <code>DB</code>:<br>' +
            '<code>npx wrangler d1 create oasis</code><br>' +
            'then add the binding under <strong>Settings → Bindings</strong>, and apply the table:<br>' +
            '<code>npx wrangler d1 migrations apply oasis --remote</code></li>') +
          (status.emailConfigured ? '' :
            '<li>Add <code>RESEND_API_KEY</code> so new requests reach your inbox.</li>') +
        '</ol>' +
        '<p class="muted" style="font-size:var(--step--1);margin-top:1rem">' +
          'Environment changes only take effect on a new deployment — after saving, ' +
          'go to <strong>Deployments</strong> and retry the latest one.</p>' +
      '</div>';
  }

  function leadRow(l) {
    var addOns = list(l.add_ons), conds = list(l.conditions), days = list(l.preferred_days);
    var rows = [
      ['Phone', l.phone], ['Email', l.email],
      ['Prefers', [l.contact_pref, l.best_time].filter(Boolean).join(', ')],
      ['Service', l.service_label || l.service],
      ['Property', l.property_type], ['Size', l.size_label],
      ['Bed / bath', [l.bedrooms, l.bathrooms].filter(Boolean).join(' / ')],
      ['Frequency', l.frequency],
      ['First visit', l.first_visit ? 'Yes' : 'No'],
      ['Add-ons', addOns.join(', ')],
      ['About the home', conds.join(', ')],
      ['City', l.city], ['ZIP', l.zip], ['Address', l.address],
      ['Wants to start', l.start_when],
      ['Preferred days', days.join(', ')],
      ['Access', l.access],
      ['Suggested quote', l.estimate_low && l.estimate_high
        ? '$' + l.estimate_low + ' – $' + l.estimate_high : ''],
      ['Notes', l.notes]
    ].filter(function (r) { return r[1]; });

    return '<article class="lead" data-id="' + esc(l.id) + '">' +
      leadHead(l) +
      '<div class="lead__body" hidden>' +
        '<div class="lead__grid">' +
          rows.map(function (r) {
            return '<div><span class="k">' + esc(r[0]) + '</span><span class="v">' + esc(r[1]) + '</span></div>';
          }).join('') +
        '</div>' +
        '<div class="lead__actions">' +
          '<a class="btn btn--primary" href="tel:+1' + esc(String(l.phone).replace(/\D/g, '')) + '">Call</a>' +
          '<a class="btn btn--ghost" href="sms:+1' + esc(String(l.phone).replace(/\D/g, '')) + '">Text</a>' +
          '<a class="btn btn--ghost" href="mailto:' + esc(l.email) + '">Email</a>' +
          '<select data-status>' +
            STATUSES.map(function (s) {
              return '<option value="' + s + '"' + (l.status === s ? ' selected' : '') + '>' +
                     s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
            }).join('') +
          '</select>' +
          '<span class="saved" data-saved hidden>Saved</span>' +
        '</div>' +
        '<textarea class="lead__notes" data-notes placeholder="Your notes — what you quoted, when you ' +
          'called, anything to remember.">' + esc(l.admin_notes || '') + '</textarea>' +
      '</div>' +
    '</article>';
  }

  function leadHead(l) {
    var flag = l.followup && l.followup !== 'none'
      ? '<span class="pill pill--flag">' + (l.followup === 'visit' ? 'Wants a visit' : 'Wants a call') + '</span>'
      : '';
    return '<button type="button" class="lead__head" data-toggle>' +
             '<span class="lead__name">' + esc(l.name) + '</span>' +
             '<span class="pill pill--' + esc(l.status) + '">' + esc(l.status) + '</span>' +
             flag +
             '<span class="lead__meta">' + esc(l.service_label || l.service) +
               (l.city ? ' · ' + esc(l.city) : '') + '</span>' +
             '<span class="lead__when">' + esc(when(l.created_at)) + '</span>' +
           '</button>';
  }

  function showLeads(data) {
    signout.hidden = false;
    var counts = data.counts || {};
    var total = Object.keys(counts).reduce(function (n, k) { return n + counts[k]; }, 0);

    root.innerHTML =
      '<div class="filters">' +
        '<button type="button" data-filter=""' + (filter === '' ? ' class="is-on"' : '') + '>' +
          'All<b>' + total + '</b></button>' +
        STATUSES.map(function (s) {
          return '<button type="button" data-filter="' + s + '"' + (filter === s ? ' class="is-on"' : '') + '>' +
                 s + '<b>' + (counts[s] || 0) + '</b></button>';
        }).join('') +
      '</div>' +
      (data.leads.length
        ? '<div class="leads">' + data.leads.map(leadRow).join('') + '</div>'
        : '<p class="empty">Nothing here yet. New quote requests will appear at the top.</p>');
  }

  /* --------------------------------------------------------------- events */
  root.addEventListener('click', function (e) {
    var f = e.target.closest('[data-filter]');
    if (f) { filter = f.dataset.filter; load(); return; }

    var t = e.target.closest('[data-toggle]');
    if (t) {
      var body = t.parentNode.querySelector('.lead__body');
      body.hidden = !body.hidden;
      return;
    }
  });

  root.addEventListener('change', function (e) {
    var card = e.target.closest('.lead');
    if (!card) { return; }
    if (e.target.matches('[data-status]')) {
      patch(card, { status: e.target.value });
    }
  });

  root.addEventListener('blur', function (e) {
    var card = e.target.closest('.lead');
    if (card && e.target.matches('[data-notes]')) {
      patch(card, { adminNotes: e.target.value });
    }
  }, true);

  function patch(card, changes) {
    var saved = card.querySelector('[data-saved]');
    api('/api/admin/leads', {
      method: 'PATCH',
      body: JSON.stringify(Object.assign({ id: card.dataset.id }, changes))
    }).then(function (r) {
      if (!r.ok) { return; }
      if (saved) {
        saved.hidden = false;
        setTimeout(function () { saved.hidden = true; }, 1600);
      }
      if (changes.status) {
        var pill = card.querySelector('.pill');
        pill.className = 'pill pill--' + changes.status;
        pill.textContent = changes.status;
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

      api('/api/admin/leads' + (filter ? '?status=' + filter : ''), { method: 'GET' })
        .then(function (r) {
          if (r.status === 401) { showSignIn(''); return; }
          if (!r.ok) {
            signout.hidden = false;
            root.innerHTML = '<div class="card setup"><h2>The database is not ready</h2>' +
              '<p>' + esc(r.body.error || 'Something went wrong.') + '</p></div>';
            return;
          }
          showLeads(r.body);
        });
    });
  }

  load();
})();
