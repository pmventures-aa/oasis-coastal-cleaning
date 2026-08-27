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
    viewed: 'Quote Viewed', accepted: 'Quote Accepted', declined: 'Quote Declined', expired: 'Quote Expired'
  };

  var state = {
    view: 'active', filter: '', open: null, leadTab: {},
    leads: [], counts: {}, q: '', quotes: {}, composing: false
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
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  };

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

  var api = function (path, opts) {
    return fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts))
      .then(function (r) {
        return r.json().catch(function () { return {}; })
          .then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
      });
  };

  function showSignIn(msg) {
    signout.hidden = true;
    root.innerHTML =
      '<div class="card signin"><h2>Sign in</h2><p>This is where your quote requests land.</p>' +
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
    var tab = state.leadTab[l.id] || 'intake';

    var intake =
      acc('Contact', field('Name', 'name', l.name) + field('Phone', 'phone', l.phone) +
        field('Email', 'email', l.email) +
        field('Prefers', 'contact_pref', l.contact_pref, { options: ['', 'Text', 'Call', 'Email'] }) +
        field('Best time', 'best_time', l.best_time, { options: ['', 'Morning', 'Afternoon', 'Evening', 'Any time'] }), true) +
      acc('Property', field('Address', 'address', l.address, { placeholder: 'Street address' }) +
        field('City', 'city', l.city) + field('ZIP', 'zip', l.zip) +
        field('Type', 'property_type', l.property_type) + field('Size', 'size_label', l.size_label) +
        field('Bedrooms', 'bedrooms', l.bedrooms) + field('Bathrooms', 'bathrooms', l.bathrooms) +
        field('Getting in', 'access', l.access, { placeholder: 'Lockbox, gate code' })) +
      acc('Request & Notes',
        '<div class="profile__grid">' + readOnly('Service', l.service_label || l.service) +
        field('Frequency', 'frequency', l.frequency) +
        readOnly('First visit', l.first_visit ? 'Yes — deeper clean' : 'No') +
        readOnly('Start', l.start_when) + readOnly('Days', days.join(', ')) + '</div>' +
        (addOns.length ? '<div class="chips"><span class="chips__k">Add-ons</span>' +
          addOns.map(function (a) { return '<span class="chip">' + esc(a) + '</span>'; }).join('') + '</div>' : '') +
        (conds.length ? '<div class="chips"><span class="chips__k">About home</span>' +
          conds.map(function (c) { return '<span class="chip chip--warn">' + esc(c) + '</span>'; }).join('') + '</div>' : '') +
        field('Their notes', 'notes', l.notes, { multiline: true })) +
      acc('Quick Quote',
        '<div class="profile__grid">' +
        field('Amount quoted', 'quoted_amount', l.quoted_amount, { placeholder: 'e.g. $185 per visit' }) +
        field('Next visit', 'next_visit', l.next_visit, { placeholder: 'e.g. Tue 9 Sep, 9am' }) + '</div>' +
        (l.quoted_at ? '<p class="profile__stamp">Quoted ' + esc(fullDate(l.quoted_at)) + '</p>' : '') +
        field('Your notes', 'admin_notes', l.admin_notes, { multiline: true, placeholder: 'What you quoted and why.' }));

    return '<div class="profile">' +
      '<div class="profile__bar">' +
        '<a class="btn btn--primary" href="tel:+1' + tel + '">Call</a>' +
        '<a class="btn btn--ghost" href="sms:+1' + tel + '">Text</a>' +
        '<a class="btn btn--ghost" href="mailto:' + esc(l.email) + '">Email</a>' +
        '<span class="profile__spacer"></span>' +
        '<label class="pf pf--inline"><span class="pf__k">Status</span><select class="pf__v" data-col="status">' +
          STATUSES.map(function (s) {
            return '<option value="' + s + '"' + (l.status === s ? ' selected' : '') + '>' +
              s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
          }).join('') + '</select></label>' +
        '<span class="saved" data-saved hidden>Saved</span></div>' +

      '<div class="ptabs" role="tablist">' +
        '<button type="button" class="ptabs__btn' + (tab === 'intake' ? ' is-on' : '') + '" data-ptab="intake" role="tab">Intake</button>' +
        '<button type="button" class="ptabs__btn' + (tab === 'quotes' ? ' is-on' : '') + '" data-ptab="quotes" role="tab">Branded Quotes</button>' +
      '</div>' +

      '<div class="ptab' + (tab === 'intake' ? ' is-on' : '') + '" data-pane="intake">' + intake + '</div>' +
      '<div class="ptab' + (tab === 'quotes' ? ' is-on' : '') + '" data-pane="quotes" data-quote-panel="' + esc(l.id) + '">' +
        '<p class="muted" style="font-size:var(--step--1);margin:0 0 .75rem">Build, send, and track branded quotes with delivery and accept/decline.</p>' +
        '<div class="quote-panel__body"><p class="muted" style="font-size:var(--step--1)">Loading quotes…</p></div></div>' +

      leadActions(l) +
      '<p class="profile__stamp">Came in ' + esc(fullDate(l.created_at)) +
        (l.updated_at ? ' · edited ' + esc(when(l.updated_at)) : '') + '</p></div>';
  }

  function row(l) {
    var flag = l.followup && l.followup !== 'none'
      ? '<span class="pill pill--flag">' + (l.followup === 'visit' ? 'Wants a visit' : 'Wants a call') + '</span>' : '';
    var open = state.open === l.id;
    return '<article class="lead' + (open ? ' is-open' : '') + '" data-id="' + esc(l.id) + '">' +
      '<button type="button" class="lead__head" data-toggle aria-expanded="' + open + '">' +
        '<span class="lead__chev" aria-hidden="true"></span>' +
        '<span class="lead__name">' + esc(l.name) + '</span>' + pill(l.status) + flag +
        '<span class="lead__meta">' + esc(l.service_label || l.service) + (l.city ? ' · ' + esc(l.city) : '') + '</span>' +
        (l.quoted_amount ? '<span class="lead__quote">' + esc(l.quoted_amount) + '</span>' : '') +
        '<span class="lead__when">' + esc(when(l.created_at)) + '</span></button>' +
      (open ? '<div class="lead__body">' + detail(l) + '</div>' : '') + '</article>';
  }

  function render() {
    signout.hidden = false;
    var counts = state.counts;
    var activeTotal = STATUSES.reduce(function (n, s) { return n + (counts[s] || 0); }, 0);

    var shown = state.leads.filter(function (l) {
      if (!state.q) { return true; }
      var hay = [l.name, l.phone, l.email, l.city, l.address, l.service_label].join(' ').toLowerCase();
      return hay.indexOf(state.q.toLowerCase()) !== -1;
    });

    root.innerHTML =
      '<div class="toolbar">' +
        '<div class="vtabs">' +
          '<button type="button" data-view="active"' + (state.view === 'active' ? ' class="is-on"' : '') +
            '>Active<b>' + activeTotal + '</b></button>' +
          '<button type="button" data-view="archived"' + (state.view === 'archived' ? ' class="is-on"' : '') +
            '>Archived<b>' + (counts.archived || 0) + '</b></button>' +
        '</div>' +
        (state.view === 'active'
          ? '<label class="toolbar__select"><span class="sr-only">Status</span><select id="status-filter">' +
            '<option value="">All statuses</option>' +
            STATUSES.map(function (s) {
              return '<option value="' + s + '"' + (state.filter === s ? ' selected' : '') + '>' +
                s.charAt(0).toUpperCase() + s.slice(1) + ' (' + (counts[s] || 0) + ')</option>';
            }).join('') + '</select></label>' +
            '<button type="button" class="btn btn--primary btn--new-quote" data-new-quote>+ New Quote</button>'
          : '') +
        '<input type="search" id="search" class="toolbar__search" placeholder="Search…" value="' + esc(state.q) + '">' +
      '</div>' +
      (state.composing ? newQuotePanelHtml() : '') +
      (shown.length ? '<div class="leads">' + shown.map(row).join('') + '</div>'
        : '<p class="empty">' + (state.q ? 'Nothing matches.' : state.view === 'archived'
          ? 'No archived leads.' : 'No quote requests yet.') + '</p>');

    var search = document.getElementById('search');
    if (search && state.q) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
    if (state.composing) {
      var cn = root.querySelector('.quote-customer-name');
      if (cn) cn.focus();
    }
    if (state.open && (state.leadTab[state.open] || 'intake') === 'quotes') { loadQuotes(state.open); }
  }

  /* ---- quote builder (unchanged logic, + archive/delete) ---- */
  function quoteLineHtml(line) {
    line = line || {};
    return '<div class="quote-line">' +
      '<input type="text" class="quote-label" placeholder="Description" value="' + esc(line.label || '') + '">' +
      '<input type="number" class="quote-qty" min="1" value="' + esc(line.qty || 1) + '">' +
      '<input type="text" class="quote-price" inputmode="decimal" placeholder="$0.00" value="' +
        esc(line.unit_dollars != null ? line.unit_dollars : (line.unit_price ? (line.unit_price / 100).toFixed(2) : '')) + '">' +
      '<button type="button" class="quote-line__remove" data-remove-line>&times;</button></div>';
  }

  function quoteEditorHtml(l, quote, opts) {
    quote = quote || {};
    opts = opts || {};
    var standalone = opts.standalone;
    var defaultLabel = standalone ? 'Cleaning service' : (l.service_label || 'Cleaning visit');
    var lines = (quote.line_items && quote.line_items.length)
      ? quote.line_items : [{ label: defaultLabel, qty: 1, unit_dollars: '' }];
    var customerFields = standalone
      ? '<div class="profile__grid compose__customer">' +
          '<label class="pf"><span class="pf__k">Customer</span><input class="pf__v quote-customer-name" type="text" placeholder="Full name" value="' +
            esc(quote.customer_name || '') + '"></label>' +
          '<label class="pf"><span class="pf__k">Email</span><input class="pf__v quote-email" type="email" placeholder="name@email.com" value="' +
            esc(quote.customer_email || '') + '"></label>' +
          '<label class="pf"><span class="pf__k">Phone</span><input class="pf__v quote-phone" type="tel" placeholder="Optional" value=""></label>' +
          '<label class="pf"><span class="pf__k">Service</span><input class="pf__v quote-service" type="text" placeholder="e.g. Airbnb turnover" value=""></label>' +
        '</div>'
      : '<label class="pf"><span class="pf__k">Send to</span><input class="pf__v quote-email" type="email" value="' +
          esc(quote.customer_email || l.email) + '"></label>';
    var summary = standalone ? 'Build a brand-new quote' : 'New / Edit Draft';
    return (standalone ? '' : '<details class="acc" open><summary class="acc__sum"><span class="acc__icon"></span>' + summary + '</summary><div class="acc__in">') +
      '<div class="quote-editor"' + (standalone ? ' data-standalone="1"' : '') +
        ' data-quote-id="' + esc(quote.id || '') + '" data-lead-id="' + esc(l ? l.id : '') + '">' +
      customerFields +
      '<div class="quote-lines">' + lines.map(quoteLineHtml).join('') + '</div>' +
      '<button type="button" class="btn btn--ghost btn--tiny" data-add-line>+ Line Item</button>' +
      '<div class="quote-total" data-quote-total>' + money(calcLineTotal(lines)) + '</div>' +
      '<label class="pf pf--wide"><span class="pf__k">Note</span><textarea class="pf__v quote-notes" rows="2">' +
        esc(quote.notes || '') + '</textarea></label>' +
      '<div class="quote-actions">' +
        '<button type="button" class="btn btn--ghost" data-save-quote>Save Draft</button>' +
        '<button type="button" class="btn btn--primary" data-send-quote>Send to Customer</button></div>' +
      '<div class="quote-msg form-status" role="alert" hidden></div></div>' +
      (standalone ? '' : '</div></details>');
  }

  function newQuotePanelHtml() {
    return '<section class="compose" aria-labelledby="compose-title">' +
      '<div class="compose__head">' +
        '<div class="compose__titles">' +
          '<h2 id="compose-title" class="compose__title">New Quote</h2>' +
          '<p class="compose__sub muted">Start fresh — no intake form needed.</p>' +
        '</div>' +
        '<button type="button" class="btn btn--ghost btn--tiny" data-close-compose>Cancel</button>' +
      '</div>' +
      quoteEditorHtml(null, {}, { standalone: true }) +
    '</section>';
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

  function quoteTimeline(q) {
    var events = (q.events || []).slice().sort(function (a, b) {
      return String(a.created_at).localeCompare(String(b.created_at));
    });
    if (!events.length) return '';
    return '<details class="acc acc--nested"><summary class="acc__sum acc__sum--sm"><span class="acc__icon"></span>Activity Timeline</summary><div class="acc__in">' +
      '<div class="quote-timeline">' + events.map(function (ev, i) {
        var detail = parseEventDetail(ev.detail);
        var meta = fullDate(ev.created_at);
        if (ev.kind === 'sent' && detail && detail.to) meta += ' · ' + detail.to;
        if (ev.kind === 'declined' && detail && detail.reason) meta += ' · “' + detail.reason + '”';
        if (ev.kind === 'accepted' && detail && detail.add_ons && detail.add_ons.length) {
          meta += ' · Add-ons: ' + detail.add_ons.map(function (a) { return a.label || a.id; }).join(', ');
        }
        return '<div class="quote-timeline__item' + (i === events.length - 1 ? ' is-last' : '') + '">' +
          '<span class="quote-timeline__dot"></span><div class="quote-timeline__body"><strong>' +
          esc(EVENT_LABELS[ev.kind] || ev.kind) + '</strong><span class="muted">' + esc(meta) + '</span></div></div>';
      }).join('') + '</div></div></details>';
  }

  function quoteCard(q) {
    var summary = trackingSummary(q);
    var isArchived = !!q.archived_at;
    var acts = isArchived
      ? '<button type="button" class="btn btn--ghost btn--tiny" data-quote-action="restore" data-quote-id="' + esc(q.id) + '">Restore</button>' +
        '<button type="button" class="btn btn--danger btn--tiny" data-quote-action="delete" data-quote-id="' + esc(q.id) + '">Delete</button>'
      : '<button type="button" class="btn btn--ghost btn--tiny" data-quote-action="archive" data-quote-id="' + esc(q.id) + '">Archive</button>' +
        '<button type="button" class="btn btn--danger btn--tiny" data-quote-action="delete" data-quote-id="' + esc(q.id) + '">Delete</button>';
    return '<details class="acc acc--quote" data-quote-id="' + esc(q.id) + '"' + (q.status === 'sent' && !isArchived ? ' open' : '') + '>' +
      '<summary class="acc__sum acc__sum--quote">' +
        '<span class="acc__icon" aria-hidden="true"></span>' + esc(money(q.total)) + ' · ' + esc(QUOTE_STATUS_LABELS[q.status] || q.status) +
        (isArchived ? ' · Archived' : '') +
        '<span class="muted" style="margin-left:.5rem;font-weight:400">' + esc(when(q.created_at)) + '</span></summary>' +
      '<div class="acc__in quote-card-mini">' + quotePill(q.status) +
        (q.status !== 'draft' ? '<span class="quote-link"><a href="/proposal?t=' + esc(q.token) + '" target="_blank" rel="noopener">Customer Link</a></span>' : '') +
        (summary ? '<p class="quote-card-mini__track muted">' + esc(summary) + '</p>' : '') +
        quoteTimeline(q) +
        '<div class="quote-card-mini__acts">' + acts + '</div></div></details>';
  }

  function renderQuotePanel(l, quotes) {
    var list = (quotes || []).filter(function (q) { return q.status !== 'draft'; }).map(quoteCard).join('');
    var draft = (quotes || []).find(function (q) { return q.status === 'draft' && !q.archived_at; });
    return (list ? '<div class="quote-list">' + list + '</div>' : '') +
      (state.view === 'archived' ? '' : quoteEditorHtml(l, draft));
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
    });
  }

  function quotePayload(editor) {
    var payload = {
      id: editor.dataset.quoteId || undefined,
      lead_id: editor.dataset.leadId || undefined,
      line_items: Array.prototype.map.call(editor.querySelectorAll('.quote-line'), function (row) {
        return {
          label: row.querySelector('.quote-label').value,
          qty: row.querySelector('.quote-qty').value,
          unit_dollars: row.querySelector('.quote-price').value
        };
      }),
      notes: editor.querySelector('.quote-notes').value,
      customer_email: editor.querySelector('.quote-email').value
    };
    if (editor.dataset.standalone) {
      payload.customer_name = editor.querySelector('.quote-customer-name').value.trim();
      payload.phone = editor.querySelector('.quote-phone').value.trim();
      payload.service_label = editor.querySelector('.quote-service').value.trim();
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
        showQuoteMsg(editor, 'Draft saved.', true);
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
          showQuoteMsg(editor, 'Sent — track delivery in timeline.', true);
          loadQuotes(payload.lead_id); load();
        });
    }
    if (payload.id) {
      api('/api/admin/quotes', { method: 'PATCH', body: JSON.stringify(payload) })
        .then(function (r) { if (r.ok) doSend(r.body.quote.id, r.body.quote.lead_id); });
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
      : action === 'archive' ? 'Archive this lead? You can restore it from the Archived tab.' : '';
    if (msg && !window.confirm(msg)) return;
    api('/api/admin/leads', { method: 'PATCH', body: JSON.stringify({ id: id, action: action }) })
      .then(function (r) {
        if (!r.ok) return;
        state.open = null;
        load();
      });
  }

  function quoteAction(btn, action) {
    var qid = btn.getAttribute('data-quote-id') ||
      (btn.closest('[data-quote-id]') && btn.closest('[data-quote-id]').getAttribute('data-quote-id'));
    var card = btn.closest('.lead');
    var leadId = card && card.dataset.id;
    if (!qid) return;
    if (action === 'delete' && !window.confirm('Delete this quote permanently?')) return;
    api('/api/admin/quotes', { method: 'PATCH', body: JSON.stringify({ id: qid, action: action }) })
      .then(function (r) { if (r.ok && leadId) loadQuotes(leadId); });
  }

  root.addEventListener('click', function (e) {
    if (e.target.matches('[data-view]')) {
      state.view = e.target.dataset.view;
      state.filter = ''; state.open = null; state.composing = false;
      load(); return;
    }
    if (e.target.matches('[data-new-quote]')) {
      state.composing = true; state.open = null;
      render(); return;
    }
    if (e.target.matches('[data-close-compose]')) {
      state.composing = false;
      render(); return;
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
    if (e.target.matches('[data-remove-line]')) {
      var row = e.target.closest('.quote-line');
      var editor = e.target.closest('.quote-editor');
      if (editor.querySelectorAll('.quote-line').length > 1) { row.remove(); updateQuoteTotal(editor); }
      return;
    }
    if (e.target.matches('[data-save-quote]')) saveQuote(e.target.closest('.quote-editor'));
    if (e.target.matches('[data-send-quote]') && window.confirm('Send this quote by email?')) {
      sendQuote(e.target.closest('.quote-editor'));
    }
  });

  root.addEventListener('change', function (e) {
    if (e.target.id === 'status-filter') { state.filter = e.target.value; state.open = null; load(); }
    if (e.target.matches('select[data-col]')) saveField(e.target);
  });

  root.addEventListener('input', function (e) {
    if (e.target.id === 'search') { state.q = e.target.value; render(); }
    if (e.target.matches('.quote-label, .quote-qty, .quote-price')) updateQuoteTotal(e.target.closest('.quote-editor'));
  });

  root.addEventListener('blur', function (e) {
    if (e.target.matches('input[data-col], textarea[data-col]')) saveField(e.target);
  }, true);

  function saveField(el) {
    var card = el.closest('.lead');
    if (!card) return;
    var payload = { id: card.dataset.id };
    payload[el.dataset.col] = el.value;
    api('/api/admin/leads', { method: 'PATCH', body: JSON.stringify(payload) }).then(function (r) {
      if (!r.ok) return;
      var saved = card.querySelector('[data-saved]');
      if (saved) { saved.hidden = false; setTimeout(function () { saved.hidden = true; }, 1500); }
      state.leads.forEach(function (l) { if (l.id === card.dataset.id) l[el.dataset.col] = el.value; });
      if (el.dataset.col === 'status') {
        var head = card.querySelector('.lead__head .pill');
        head.className = 'pill pill--' + el.value;
        head.textContent = el.value.charAt(0).toUpperCase() + el.value.slice(1);
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

      var qs = '?archived=' + (state.view === 'archived' ? '1' : '0');
      if (state.filter && state.view === 'active') qs += '&status=' + encodeURIComponent(state.filter);

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

  load();
})();
