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

  /* The extras are the one place on this page where somebody might spend more
     than they planned to, so they are worth making pleasant rather than
     apologetic. Each is a card you tap, the whole thing is a target, and the
     count updates as they go so the choice feels like it landed. */
  function addonsHtml(addons) {
    if (!addons || !addons.length) { return ''; }
    var g = groupAddons(addons);
    var blocks = g.order.map(function (name) {
      return '<div class="xtras__group">' +
        '<p class="xtras__group-name">' + esc(name) + '</p>' +
        '<div class="xtras__grid">' +
          g.groups[name].map(function (a) {
            return '<label class="xtra">' +
              '<input type="checkbox" name="addon" value="' + esc(a.id) + '">' +
              '<span class="xtra__box" aria-hidden="true"></span>' +
              '<span class="xtra__text">' +
                '<strong>' + esc(a.label) + '</strong>' +
                (a.note ? '<span class="xtra__note">' + esc(a.note) + '</span>' : '') +
              '</span></label>';
          }).join('') +
        '</div>' +
      '</div>';
    }).join('');

    return '<section class="xtras" id="proposal-addons">' +
      '<div class="xtras__head">' +
        '<h2 class="xtras__title">While she is there</h2>' +
        '<p class="xtras__lead">Tick anything you would like added to your first visit. ' +
          'Kristina will confirm the price for these before she starts — nothing is charged today.</p>' +
      '</div>' +
      blocks +
      '<p class="xtras__count" id="xtras-count" hidden></p>' +
    '</section>';
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

    // A quote is rarely all one thing — the clean is fortnightly, the oven is
    // once — so each line says which it is.
    var CADENCE = { weekly: 'Weekly', biweekly: 'Every two weeks',
                    monthly: 'Monthly', quarterly: 'Quarterly' };
    var rows = items.map(function (it) {
      var cad = CADENCE[it.cadence];
      return '<tr>' +
        '<td><strong>' + esc(it.label) + '</strong>' +
          (cad ? '<br><span class="proposal__cadence">' + esc(cad) + '</span>' : '') +
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
      /* Saying yes is one big button with the reasons not to worry sitting
         right beside it, because that is where the hesitation is. Declining
         stays entirely available and stops shouting. */
      actions =
        addonsHtml(addons) +
        declinePanelHtml() +
        '<section class="yes">' +
          '<ul class="yes__points">' +
            '<li>No contract — pause or stop with a week&rsquo;s notice</li>' +
            '<li>Nothing to pay today, and nothing until the work is done</li>' +
            '<li>The same person each visit, licensed and insured</li>' +
          '</ul>' +
          '<div class="proposal__actions" id="proposal-actions">' +
            '<button type="button" class="btn btn--primary yes__go" id="accept">' +
              'Yes — let&rsquo;s book it</button>' +
          '</div>' +
          '<p class="yes__fine">Kristina will text you to agree a first date. ' +
            'Nothing is charged when you accept.</p>' +
          '<p class="yes__no"><button type="button" class="linkish" id="decline">' +
            'Not right now</button></p>' +
        '</section>';
    } else if (status === 'accepted') {
      actions = '<div class="proposal__done proposal__done--ok">' +
        '<p class="proposal__done-k">You are booked in</p>' +
        '<p>Thank you, ' + esc(first) + '. Kristina has this and will text you shortly to agree a first date. ' +
        'Anything you need before then, her number is below.</p></div>';
    } else if (status === 'declined') {
      actions = '<div class="proposal__done">You declined this quote. Reply to Kristina if you would like a revised one.</div>';
    } else if (status === 'expired') {
      actions = '<div class="proposal__done">This quote has expired. Contact Kristina for an updated quote.</div>';
    }
    actions += download;

    var first = (q.customer_name || '').split(' ')[0] || 'there';
    var recurring = items.filter(function (it) { return CADENCE[it.cadence]; });
    var rhythm = recurring.length ? CADENCE[recurring[0].cadence].toLowerCase() : '';

    root.innerHTML =
      '<article class="card proposal">' +
        /* A band of colour across the top, the greeting in it, and the number
           they came for immediately underneath. Nobody opens a quote to read
           a table header first. */
        '<div class="proposal__banner">' +
          '<img src="/logo/logo-260.webp" width="120" height="120" alt="Oasis Coastal Cleaning" class="proposal__logo">' +
          '<p class="proposal__hello">Hi ' + esc(first) + ' — here is your quote</p>' +
          '<p class="proposal__for">' +
            esc(q.service_label || 'Cleaning') + (q.city ? ' in ' + esc(q.city) : '') +
          '</p>' +
        '</div>' +
        '<div class="proposal__hero">' +
          '<p class="proposal__hero-k">' + (rhythm ? 'Your ' + esc(rhythm) + ' visit' : 'Your visit') + '</p>' +
          '<p class="proposal__hero-n">' + esc(money(q.total)) + '</p>' +
          (rhythm
            ? '<p class="proposal__hero-s">Every visit, ' + esc(rhythm) + '. Pause or stop whenever you like.</p>'
            : '<p class="proposal__hero-s">One visit, everything below included.</p>') +
        '</div>' +
        '<h2 class="proposal__h2">What that covers</h2>' +
        '<div class="proposal__table-wrap">' +
          '<table class="proposal__table">' +
            '<thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table>' +
        '</div>' +
        '<div class="proposal__totals">' +
          (Number(q.tax) > 0
            ? '<div><span>Subtotal</span><strong>' + esc(money(q.subtotal)) + '</strong></div>' +
              '<div><span>Tax</span><strong>' + esc(money(q.tax)) + '</strong></div>'
            : '') +
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

    /* Ticking an extra should feel like it did something, and the button
       should say what it is about to do. */
    var countEl = document.getElementById('xtras-count');
    var refreshXtras = function () {
      var n = selectedAddons().length;
      if (countEl) {
        countEl.hidden = n === 0;
        countEl.textContent = n === 1
          ? 'One extra added — Kristina will confirm the price for it.'
          : n + ' extras added — Kristina will confirm the price for those.';
      }
      if (acceptBtn) {
        acceptBtn.innerHTML = n
          ? 'Yes — book it with ' + (n === 1 ? 'my extra' : 'my ' + n + ' extras')
          : 'Yes — let\u2019s book it';
      }
    };
    Array.prototype.forEach.call(root.querySelectorAll('input[name="addon"]'), function (box) {
      box.addEventListener('change', function () {
        var card = box.closest('.xtra');
        if (card) card.classList.toggle('is-on', box.checked);
        refreshXtras();
      });
    });

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
