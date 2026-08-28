/* ==========================================================================
   Oasis Coastal Cleaning — customer quote acceptance page
   --------------------------------------------------------------------------
   Public page opened from the branded quote email. Token in ?t=…
   ========================================================================== */
(function () {
  'use strict';

  var root = document.getElementById('proposal-root');
  if (!root) { return; }

  var params = new URLSearchParams(window.location.search);
  var token = params.get('t');
  if (!token) {
    root.innerHTML = '<div class="card"><h1 style="font-size:var(--step-1);margin:0 0 .5rem">Link not found</h1>' +
      '<p class="muted" style="margin:0">This quote link is missing or incomplete. ' +
      'Reply to Kristina\'s email and she will send a fresh one.</p></div>';
    return;
  }

  var esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  var money = function (cents) {
    var n = Number(cents);
    if (!Number.isFinite(n)) { return '$0.00'; }
    return '$' + (n / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  // Florida time — see js/format.js.
  var formatDate = function (iso) { return window.OasisFormat.formatDate(iso); };

  var api = function (path, opts) {
    return fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts))
      .then(function (r) {
        return r.json().catch(function () { return {}; })
          .then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
      });
  };

  function groupAddons(list) {
    var groups = {};
    var order = [];
    (list || []).forEach(function (a) {
      var g = a.group || 'Add-ons';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(a);
    });
    return { groups: groups, order: order };
  }

  function addonsHtml(addons) {
    if (!addons || !addons.length) { return ''; }
    var g = groupAddons(addons);
    var blocks = g.order.map(function (name) {
      return '<div class="proposal__addon-group">' +
        '<p class="proposal__addon-group-label">' + esc(name) + '</p>' +
        g.groups[name].map(function (a) {
          return '<label class="proposal__addon">' +
            '<input type="checkbox" name="addon" value="' + esc(a.id) + '">' +
            '<span class="proposal__addon-text">' +
              '<strong>' + esc(a.label) + '</strong>' +
              (a.note ? '<span class="muted">' + esc(a.note) + '</span>' : '') +
            '</span></label>';
        }).join('') +
      '</div>';
    }).join('');

    return '<div class="proposal__addons" id="proposal-addons">' +
      '<p class="eyebrow">Optional add-ons</p>' +
      '<p class="proposal__addons-lead muted">Not already on this quote. Check any you would like — Kristina will confirm pricing.</p>' +
      blocks +
    '</div>';
  }

  function declinePanelHtml() {
    return '<div class="proposal__decline" id="decline-panel" hidden>' +
      '<label class="proposal__decline-label" for="decline-reason">Optional — tell Kristina why (helps her revise the quote)</label>' +
      '<textarea id="decline-reason" class="proposal__decline-input" rows="3" maxlength="1000" ' +
        'placeholder="Timing, budget, looking elsewhere…"></textarea>' +
      '<div class="proposal__decline-acts">' +
        '<button type="button" class="btn btn--ghost" id="decline-cancel">Cancel</button>' +
        '<button type="button" class="btn btn--primary" id="decline-confirm">Send decline</button>' +
      '</div></div>';
  }

  function selectedAddons() {
    return Array.prototype.map.call(
      root.querySelectorAll('input[name="addon"]:checked'),
      function (el) { return el.value; }
    );
  }

  function renderQuote(data) {
    var q = data.quote;
    var items = q.line_items || [];
    var status = q.status;
    var addons = data.available_addons || [];

    var rows = items.map(function (it) {
      return '<tr>' +
        '<td><strong>' + esc(it.label) + '</strong>' +
          (it.description ? '<br><span class="muted">' + esc(it.description) + '</span>' : '') +
        '</td>' +
        '<td class="proposal__qty">' + esc(String(it.qty || 1)) + '</td>' +
        '<td class="proposal__amt">' + esc(money(it.total)) + '</td>' +
      '</tr>';
    }).join('');

    // A copy to keep, whatever state the quote is in. Someone forwarding this
    // to whoever signs things off needs a document, not a link.
    var token = new URLSearchParams(location.search).get('t') || '';
    var download = status === 'draft' ? '' :
      '<p class="proposal__download">' +
        '<a class="btn btn--ghost btn--tiny" href="/api/proposal/' + encodeURIComponent(token) + '/pdf">' +
        'Download a PDF copy</a></p>';

    var actions = '';
    if (status === 'sent') {
      actions =
        addonsHtml(addons) +
        declinePanelHtml() +
        '<div class="proposal__actions" id="proposal-actions">' +
          '<button type="button" class="btn btn--primary" id="accept">Accept This Quote</button>' +
          '<button type="button" class="btn btn--ghost" id="decline">Decline</button>' +
        '</div>' +
        '<p class="proposal__fine muted">Accepting confirms you would like to book at the quoted price. ' +
          'Kristina will reach out to schedule your first visit.</p>';
    } else if (status === 'accepted') {
      actions = '<div class="proposal__done proposal__done--ok">' +
        '<strong>Accepted</strong> — thank you. Kristina will be in touch shortly to confirm your visit.</div>';
    } else if (status === 'declined') {
      actions = '<div class="proposal__done">You declined this quote. Reply to Kristina if you would like a revised one.</div>';
    } else if (status === 'expired') {
      actions = '<div class="proposal__done">This quote has expired. Contact Kristina for an updated quote.</div>';
    }
    actions += download;

    root.innerHTML =
      '<article class="card proposal">' +
        '<div class="proposal__head">' +
          '<img src="/logo/logo-260.webp" width="130" alt="Oasis Coastal Cleaning" class="proposal__logo">' +
          '<p class="eyebrow">Your quote</p>' +
          '<h1 style="font-size:var(--step-2);margin:0 0 .35rem">Hi ' + esc((q.customer_name || '').split(' ')[0] || 'there') + '</h1>' +
          '<p class="muted" style="margin:0">' +
            esc(q.service_label || 'Cleaning') +
            (q.city ? ' · ' + esc(q.city) : '') +
          '</p>' +
        '</div>' +
        '<div class="proposal__table-wrap">' +
          '<table class="proposal__table">' +
            '<thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>' +
        '<div class="proposal__totals">' +
          '<div><span>Subtotal</span><strong>' + esc(money(q.subtotal)) + '</strong></div>' +
          '<div class="proposal__total"><span>Total</span><strong>' + esc(money(q.total)) + '</strong></div>' +
        '</div>' +
        (q.expires_at && status === 'sent'
          ? '<p class="proposal__valid muted">Valid through ' + esc(formatDate(q.expires_at)) + '</p>'
          : '') +
        (q.notes
          ? '<div class="proposal__note"><p class="eyebrow">A note from Kristina</p><p>' +
            esc(q.notes).replace(/\n/g, '<br>') + '</p></div>'
          : '') +
        (q.terms ? '<p class="proposal__terms muted">' + esc(q.terms) + '</p>' : '') +
        '<div id="proposal-status" class="form-status" role="alert" hidden></div>' +
        actions +
      '</article>';

    var acceptBtn = document.getElementById('accept');
    var declineBtn = document.getElementById('decline');
    var declinePanel = document.getElementById('decline-panel');
    var declineCancel = document.getElementById('decline-cancel');
    var declineConfirm = document.getElementById('decline-confirm');
    var actionsEl = document.getElementById('proposal-actions');

    if (acceptBtn) {
      acceptBtn.addEventListener('click', function () {
        respond('accept', acceptBtn, { add_ons: selectedAddons() });
      });
    }
    if (declineBtn && declinePanel) {
      declineBtn.addEventListener('click', function () {
        declinePanel.hidden = false;
        if (actionsEl) { actionsEl.hidden = true; }
        var ta = document.getElementById('decline-reason');
        if (ta) { ta.focus(); }
      });
    }
    if (declineCancel && declinePanel) {
      declineCancel.addEventListener('click', function () {
        declinePanel.hidden = true;
        if (actionsEl) { actionsEl.hidden = false; }
      });
    }
    if (declineConfirm) {
      declineConfirm.addEventListener('click', function () {
        var reasonEl = document.getElementById('decline-reason');
        respond('decline', declineConfirm, {
          reason: reasonEl ? reasonEl.value.trim() : ''
        });
      });
    }
  }

  function respond(action, btn, extra) {
    var statusEl = document.getElementById('proposal-status');
    btn.disabled = true;
    statusEl.hidden = true;

    var payload = Object.assign({ action: action }, extra || {});

    api('/api/proposal/' + encodeURIComponent(token), {
      method: 'POST',
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (r.ok) {
        load();
        return;
      }
      statusEl.hidden = false;
      statusEl.className = 'form-status form-status--err';
      statusEl.textContent = r.body.error || 'Something went wrong. Please call Kristina.';
      btn.disabled = false;
    });
  }

  function load() {
    api('/api/proposal/' + encodeURIComponent(token)).then(function (r) {
      if (!r.ok) {
        root.innerHTML = '<div class="card"><h1 style="font-size:var(--step-1);margin:0 0 .5rem">Quote unavailable</h1>' +
          '<p class="muted" style="margin:0">' + esc(r.body.error || 'This link may have expired.') + '</p></div>';
        return;
      }
      renderQuote(r.body);
    });
  }

  load();
})();
