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
  var newquoteBtn = document.getElementById('newquote');
  if (!root) { return; }

  var STATUSES = ['new', 'contacted', 'quoted', 'booked', 'closed'];
  var state = {
    filter: '', open: null, leads: [], counts: {}, q: '',
    quotesByLead: {}, quoteSetup: '', composeNew: false, flash: null
  };

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
    if (newquoteBtn) { newquoteBtn.hidden = true; }
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
    if (newquoteBtn) { newquoteBtn.hidden = true; }
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

  function money(n) {
    var x = Number(n);
    if (!isFinite(x)) { return '$0'; }
    var abs = Math.abs(x);
    var formatted = abs.toLocaleString('en-US', {
      minimumFractionDigits: abs % 1 ? 2 : 0,
      maximumFractionDigits: 2
    });
    return (x < 0 ? '-$' : '$') + formatted;
  }

  function defaultUntil() {
    var d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  }

  function parseList(json) {
    try { var a = JSON.parse(json || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }

  function seedItemsFromLead(l) {
    var items = [];
    var parts = [l.service_label || l.service, l.size_label, l.frequency].filter(Boolean);
    if (parts.length) { items.push({ description: parts.join(' — '), qty: 1, unit_price: '' }); }
    parseList(l.add_ons).forEach(function (a) {
      items.push({ description: a, qty: 1, unit_price: '' });
    });
    if (!items.length) { items.push({ description: '', qty: 1, unit_price: '' }); }
    return items;
  }

  function itemRow(item) {
    item = item || {};
    var amt = (Number(item.qty) || 1) * (Number(item.unit_price) || 0);
    return '<tr data-q-row>' +
      '<td><input type="text" data-qi="description" placeholder="e.g. Weekly office clean" value="' +
        esc(item.description || '') + '"></td>' +
      '<td><input type="number" data-qi="qty" min="0" step="0.01" inputmode="decimal" value="' +
        esc(item.qty == null || item.qty === '' ? '1' : String(item.qty)) + '"></td>' +
      '<td><input type="number" data-qi="unit_price" min="0" step="0.01" inputmode="decimal" placeholder="0" value="' +
        esc(item.unit_price == null || item.unit_price === '' ? '' : String(item.unit_price)) + '"></td>' +
      '<td class="qitems__amt">' + esc(money(amt)) + '</td>' +
      '<td><button type="button" class="qitems__del" data-q-del aria-label="Remove line">&times;</button></td>' +
    '</tr>';
  }

  function composerHtml(opts) {
    opts = opts || {};
    var q = opts.quote || {};
    var items = (q.line_items && q.line_items.length) ? q.line_items : (opts.seed || [{ description: '', qty: 1, unit_price: '' }]);
    var accepted = q.status === 'accepted';
    var totalLabel = q.total_label || money(q.total || 0);
    var statusLine = '';
    if (state.flash && state.flash.leadId === (opts.leadId || q.lead_id)) {
      statusLine = '<p class="qcompose__msg qcompose__msg--' + esc(state.flash.kind || 'ok') + '">' +
        esc(state.flash.text) + '</p>';
      state.flash = null;
    } else if (state.quoteSetup) {
      statusLine = '<p class="qcompose__warn">' + esc(state.quoteSetup) + '</p>';
    } else if (accepted) {
      statusLine = '<p class="qcompose__ok">Accepted' +
        (q.accepted_name ? ' by ' + esc(q.accepted_name) : '') +
        (q.accepted_at ? ' on ' + esc(fullDate(q.accepted_at)) : '') + '.</p>';
    } else if (q.status === 'sent') {
      statusLine = '<p class="qcompose__sent">Sent' + (q.sent_at ? ' ' + esc(fullDate(q.sent_at)) : '') +
        '. They can open the link and click Accept.</p>';
    }

    var link = q.view_path
      ? '<p class="qcompose__link">Customer link: <code>' + esc(q.view_path) + '</code> ' +
        '<button type="button" class="btn btn--ghost" data-q-copy>Copy</button> ' +
        '<a class="btn btn--ghost" href="' + esc(q.view_path) + '" target="_blank" rel="noopener">Preview</a></p>'
      : '';

    var locked = accepted ? ' disabled' : '';

    var contact = opts.standalone
      ? '<div class="profile__grid">' +
          field('Name', 'nq-name', q.customer_name || '', { placeholder: 'Customer name' }) +
          field('Email', 'nq-email', q.customer_email || '', { placeholder: 'they@example.com' }) +
          field('Phone', 'nq-phone', q.customer_phone || '') +
          field('Service', 'nq-service', q.service_label || '', { placeholder: 'e.g. Corporate cleaning' }) +
        '</div>'
      : '';

    return '<div class="qcompose" data-composer data-quote-id="' + esc(q.id || '') + '"' +
        (opts.leadId ? ' data-lead-id="' + esc(opts.leadId) + '"' : '') + '>' +
      statusLine +
      contact +
      '<label class="pf pf--wide"><span class="pf__k">Note to them</span>' +
        '<textarea class="pf__v" data-q="intro" rows="3" placeholder="A short note at the top of the quote."' +
          locked + '>' + esc(q.intro || '') + '</textarea></label>' +
      '<div class="qitems-wrap"><table class="qitems">' +
        '<thead><tr><th>Line item</th><th>Qty</th><th>Price</th><th>Amount</th><th></th></tr></thead>' +
        '<tbody>' + items.map(itemRow).join('') + '</tbody>' +
      '</table>' +
      (accepted ? '' : '<button type="button" class="qitems__add" data-q-add>+ Add a line</button>') +
      '</div>' +
      '<div class="qcompose__total">' +
        '<span>Total</span><strong data-q-total>' + esc(totalLabel) + '</strong>' +
        '<input type="text" data-q="price_note" placeholder="per visit" value="' + esc(q.price_note || '') + '"' +
          locked + ' title="Shown next to the total, e.g. per visit">' +
      '</div>' +
      '<div class="profile__grid">' +
        '<label class="pf pf--wide"><span class="pf__k">Under the total</span>' +
          '<textarea class="pf__v" data-q="notes" rows="2" placeholder="What is included, first-visit note, how to pay."' +
            locked + '>' + esc(q.notes || '') + '</textarea></label>' +
        '<label class="pf"><span class="pf__k">Good until</span>' +
          '<input class="pf__v" type="date" data-q="valid_until" value="' +
            esc(q.valid_until || defaultUntil()) + '"' + locked + '></label>' +
      '</div>' +
      link +
      '<p class="qcompose__msg" data-q-msg hidden></p>' +
      (accepted
        ? '<p class="qcompose__actions"><button type="button" class="btn btn--ghost" data-q-fresh>Write a new quote</button></p>'
        : '<p class="qcompose__actions">' +
            '<button type="button" class="btn btn--ghost" data-q-save>Save draft</button>' +
            '<button type="button" class="btn btn--primary" data-q-send>Email this quote</button>' +
          '</p>') +
    '</div>';
  }

  function readComposer(box) {
    var items = [];
    box.querySelectorAll('[data-q-row]').forEach(function (row) {
      items.push({
        description: (row.querySelector('[data-qi="description"]') || {}).value || '',
        qty: (row.querySelector('[data-qi="qty"]') || {}).value || '1',
        unit_price: (row.querySelector('[data-qi="unit_price"]') || {}).value || '0'
      });
    });
    var val = function (sel) {
      var el = box.querySelector(sel);
      return el ? el.value : '';
    };
    return {
      intro: val('[data-q="intro"]'),
      notes: val('[data-q="notes"]'),
      price_note: val('[data-q="price_note"]'),
      valid_until: val('[data-q="valid_until"]'),
      line_items: items,
      customer_name: val('[data-col="nq-name"]') || val('[data-col="name"]'),
      customer_email: val('[data-col="nq-email"]') || val('[data-col="email"]'),
      customer_phone: val('[data-col="nq-phone"]') || val('[data-col="phone"]'),
      service_label: val('[data-col="nq-service"]')
    };
  }

  function updateComposerTotals(box) {
    if (!box) { return; }
    var sum = 0;
    box.querySelectorAll('[data-q-row]').forEach(function (row) {
      var qty = Number((row.querySelector('[data-qi="qty"]') || {}).value) || 0;
      var price = Number((row.querySelector('[data-qi="unit_price"]') || {}).value) || 0;
      var amt = Math.round(qty * price * 100) / 100;
      sum += amt;
      var cell = row.querySelector('.qitems__amt');
      if (cell) { cell.textContent = money(amt); }
    });
    var note = (box.querySelector('[data-q="price_note"]') || {}).value || '';
    var label = money(sum) + (note.trim() ? ' ' + note.trim() : '');
    var total = box.querySelector('[data-q-total]');
    if (total) { total.textContent = label; }
  }

  function showComposerMsg(box, text, kind) {
    var el = box.querySelector('[data-q-msg]');
    if (!el) { return; }
    el.hidden = !text;
    el.textContent = text || '';
    el.className = 'qcompose__msg' + (kind ? ' qcompose__msg--' + kind : '');
  }

  function payloadFromComposer(box, send) {
    var data = readComposer(box);
    var lead = box.closest('.lead');
    var leadId = box.getAttribute('data-lead-id') || (lead && lead.dataset.id) || '';
    if (lead && !data.customer_name) {
      var nameEl = lead.querySelector('[data-col="name"]');
      var emailEl = lead.querySelector('[data-col="email"]');
      var phoneEl = lead.querySelector('[data-col="phone"]');
      data.customer_name = nameEl ? nameEl.value : '';
      data.customer_email = emailEl ? emailEl.value : '';
      data.customer_phone = phoneEl ? phoneEl.value : '';
    }
    if (lead && !data.service_label) {
      var found = state.leads.filter(function (l) { return l.id === leadId; })[0];
      if (found) {
        data.service_label = found.service_label || found.service || '';
        data.frequency = found.frequency || '';
      }
    }
    data.lead_id = leadId || undefined;
    data.send = !!send;
    var id = box.getAttribute('data-quote-id');
    if (id) { data.id = id; }
    return data;
  }

  function saveComposer(box, send) {
    var data = payloadFromComposer(box, send);
    if (!data.line_items.some(function (i) { return String(i.description).trim(); })) {
      showComposerMsg(box, 'Add at least one line item.', 'err');
      return;
    }
    if (!data.customer_email) {
      showComposerMsg(box, 'An email address is needed to send this.', 'err');
      return;
    }
    showComposerMsg(box, send ? 'Sending…' : 'Saving…', '');
    var method = data.id ? 'PATCH' : 'POST';
    api('/api/admin/quotes', { method: method, body: JSON.stringify(data) })
      .then(function (r) {
        if (!r.ok) {
          showComposerMsg(box, r.body.error || 'That did not save.', 'err');
          if (r.body.setup) { state.quoteSetup = r.body.error; }
          return;
        }
        var q = r.body.quote;
        var kind = 'ok';
        var text = 'Draft saved.';
        if (send && r.body.emailed === false) {
          kind = 'warn';
          text = 'Quote is ready, but email did not send. Copy the link and text it. ' +
            (r.body.mailProblem || '');
        } else if (send) {
          text = 'Sent. They can open the link and click Accept.';
        }
        if (state.composeNew && q && q.lead_id) {
          state.composeNew = false;
          state.open = q.lead_id;
        }
        if (q && q.lead_id) {
          state.quotesByLead[q.lead_id] = [q];
          state.flash = { leadId: q.lead_id, text: text, kind: kind };
          load();
        } else {
          showComposerMsg(box, text, kind);
        }
      });
  }
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
        (state.quotesByLead[l.id] == null
          ? '<p class="muted">Loading quote…</p>'
          : composerHtml({
              leadId: l.id,
              quote: (state.quotesByLead[l.id] || [])[0] || {},
              seed: seedItemsFromLead(l)
            })) +
        '<div class="profile__grid" style="margin-top:1rem">' +
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
    if (newquoteBtn) { newquoteBtn.hidden = false; }
    var counts = state.counts;
    var total = Object.keys(counts).reduce(function (n, k) { return n + counts[k]; }, 0);

    var shown = state.leads.filter(function (l) {
      if (!state.q) { return true; }
      var hay = [l.name, l.phone, l.email, l.city, l.address, l.service_label]
        .join(' ').toLowerCase();
      return hay.indexOf(state.q.toLowerCase()) !== -1;
    });

    var composer = state.composeNew
      ? '<div class="card qnew">' +
          '<div class="qnew__bar"><h2>Write a quote</h2>' +
            '<button type="button" class="btn btn--ghost" data-q-cancel>Cancel</button></div>' +
          composerHtml({ standalone: true, seed: [{ description: '', qty: 1, unit_price: '' }] }) +
        '</div>'
      : '';

    root.innerHTML =
      composer +
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
      var id = card.dataset.id;
      state.open = state.open === id ? null : id;
      if (state.open && state.quotesByLead[state.open] === undefined) {
        state.quotesByLead[state.open] = null;
        fetchQuotes(state.open);
      }
      render();
      return;
    }

    if (e.target.closest('[data-q-add]')) {
      var body = e.target.closest('[data-composer]').querySelector('.qitems tbody');
      body.insertAdjacentHTML('beforeend', itemRow({ description: '', qty: 1, unit_price: '' }));
      return;
    }
    if (e.target.closest('[data-q-del]')) {
      var row = e.target.closest('[data-q-row]');
      var tbody = row && row.parentNode;
      if (row && tbody && tbody.querySelectorAll('[data-q-row]').length > 1) { row.remove(); }
      else if (row) {
        row.querySelectorAll('input').forEach(function (inp) { inp.value = inp.getAttribute('data-qi') === 'qty' ? '1' : ''; });
      }
      updateComposerTotals(e.target.closest('[data-composer]'));
      return;
    }
    if (e.target.closest('[data-q-save]')) { saveComposer(e.target.closest('[data-composer]'), false); return; }
    if (e.target.closest('[data-q-send]')) { saveComposer(e.target.closest('[data-composer]'), true); return; }
    if (e.target.closest('[data-q-cancel]')) { state.composeNew = false; render(); return; }
    if (e.target.closest('[data-q-fresh]')) {
      var box = e.target.closest('[data-composer]');
      var leadId = box && box.getAttribute('data-lead-id');
      if (leadId) { state.quotesByLead[leadId] = []; }
      render();
      return;
    }
    if (e.target.closest('[data-q-copy]')) {
      var boxCopy = e.target.closest('[data-composer]');
      var code = boxCopy && boxCopy.querySelector('.qcompose__link code');
      var path = code ? code.textContent : '';
      if (!path) { return; }
      var url = window.location.origin + path;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          showComposerMsg(boxCopy, 'Link copied.', 'ok');
        });
      } else {
        window.prompt('Copy this link', url);
      }
    }
  });

  root.addEventListener('input', function (e) {
    if (e.target.id === 'search') { state.q = e.target.value; render(); }
    if (e.target.matches('[data-qi], [data-q="price_note"]')) {
      updateComposerTotals(e.target.closest('[data-composer]'));
    }
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
    if (!col || col.indexOf('nq-') === 0) { return; }
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

  if (newquoteBtn) {
    newquoteBtn.addEventListener('click', function () {
      state.composeNew = true;
      state.open = null;
      render();
      var first = root.querySelector('[data-col="nq-name"]');
      if (first) { first.focus(); }
    });
  }

  signout.addEventListener('click', function () {
    api('/api/admin/logout', { method: 'POST' }).then(function () { showSignIn(''); });
  });

  function fetchQuotes(leadId) {
    api('/api/admin/quotes?lead_id=' + encodeURIComponent(leadId), { method: 'GET' })
      .then(function (r) {
        if (r.body && r.body.setup) { state.quoteSetup = r.body.error || 'Quotes table is not set up yet.'; }
        state.quotesByLead[leadId] = (r.body && r.body.quotes) || [];
        if (state.open === leadId) { render(); }
      });
  }

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
