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

  /* A line priced at nothing is one she is throwing in. "$0.00" reads as an
     unfinished quote; "Included" reads as a gift. Totals keep the number. */
  var lineAmount = function (cents) { return Number(cents) === 0 ? 'Included' : money(cents); };

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
  /* What they asked for in the wizard, said back to them as already covered.
     Without this the same items reappear under "While she is there" and read
     as a second charge for something they thought they had already asked for. */
  function includedHtml(items) {
    if (!items || !items.length) return '';
    return '<section class="asked">' +
      '<p class="asked__k">You asked for these, and they are in the price above</p>' +
      '<ul class="asked__list">' +
        items.map(function (a) {
          return '<li class="asked__item"><span class="asked__tick" aria-hidden="true"></span>' +
            esc(a.label) + '</li>';
        }).join('') +
      '</ul>' +
      '<p class="asked__note">Nothing further to pay for these \u2014 they are part of the total.</p>' +
    '</section>';
  }

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
        '<h2 class="xtras__title">Anything else while she is there?</h2>' +
        '<p class="xtras__lead">These are <em>extra</em> to what you have already asked for. ' +
          'Tick anything you would also like and Kristina will confirm the price before she starts \u2014 ' +
          'nothing is added to the total above and nothing is charged today.</p>' +
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

  function selectedLaterOn() {
    return Array.prototype.map.call(
      root.querySelectorAll('input[name="later"]:checked'),
      function (el) { return parseInt(el.value, 10); }
    ).filter(function (n) { return !isNaN(n); });
  }

  function selectedAddons() {
    return Array.prototype.map.call(
      root.querySelectorAll('input[name="addon"]:checked'),
      function (el) { return el.value; }
    );
  }

  /* Presented as a separate decision, after the one they came for. Priced,
     so it is a real offer rather than a sales line, and tickable, so saying
     yes costs one tap. Left unticked it simply does not apply. */
  function laterOnHtml(lines, live) {
    if (!lines.length) return '';
    var CAD = { weekly: 'a week', biweekly: 'two weeks', monthly: 'a month', quarterly: 'a quarter' };
    return '<section class="later">' +
      '<div class="later__head">' +
        '<h2 class="later__title">Afterwards, if you would like</h2>' +
        '<p class="later__lead">Entirely optional, and nothing to decide today \u2014 ' +
          'it is not part of the amount above.</p>' +
      '</div>' +
      lines.map(function (it, i) {
        var every = CAD[it.cadence];
        var price = lineAmount(it.unit_price != null ? it.unit_price : it.total);
        var inner =
          '<span class="later__box" aria-hidden="true"></span>' +
          '<span class="later__text">' +
            '<span class="later__name">' + esc(it.label) + '</span>' +
            (it.description ? '<span class="later__note">' + esc(it.description) + '</span>' : '') +
          '</span>' +
          '<span class="later__price">' + esc(price) +
            (every ? '<small>every ' + esc(every) + '</small>' : '<small>per visit</small>') +
          '</span>';
        return live
          ? '<label class="later__row">' +
              '<input type="checkbox" name="later" value="' + esc(String(i)) + '">' + inner +
            '</label>'
          : '<div class="later__row is-static">' + inner + '</div>';
      }).join('') +
    '</section>';
  }

  function renderQuote(data) {
    var q = data.quote;
    var items = q.line_items || [];
    var status = q.status;
    var addons = data.available_addons || [];
    var included = data.included_addons || [];

    // A quote is rarely all one thing — the clean is fortnightly, the oven is
    // once — so each line says which it is.
    var CADENCE = { weekly: 'Weekly', biweekly: 'Every two weeks',
                    monthly: 'Monthly', quarterly: 'Quarterly' };
    /* An optional line is quoted but not charged — the recurring clean she
       offers for after the deep clean. It must not sit in the table of what
       they are accepting, or the amounts stop adding up to the total. */
    var priced = items.filter(function (it) { return !it.optional; });
    var laterOn = items.filter(function (it) { return it.optional; });

    var rows = priced.map(function (it) {
      var cad = CADENCE[it.cadence];
      return '<tr>' +
        '<td><strong>' + esc(it.label) + '</strong>' +
          (cad ? '<br><span class="proposal__cadence">' + esc(cad) + '</span>' : '') +
          (it.description ? '<br><span class="muted">' + esc(it.description) + '</span>' : '') +
        '</td>' +
        '<td class="proposal__qty">' + esc(String(it.qty || 1)) + '</td>' +
        '<td class="proposal__amt' + (Number(it.total) === 0 ? ' is-included' : '') + '">' +
          esc(lineAmount(it.total)) + '</td>' +
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
        includedHtml(included) +
        laterOnHtml(laterOn, true) +
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
        'Anything you need before then, her number is below.</p></div>' +
        includedHtml(included) +
        laterOnHtml(laterOn, false);
    } else if (status === 'declined') {
      actions = '<div class="proposal__done">You declined this quote. Reply to Kristina if you would like a revised one.</div>';
    } else if (status === 'expired') {
      actions = '<div class="proposal__done">This quote has expired. Contact Kristina for an updated quote.</div>';
    }
    actions += download;

    var first = (q.customer_name || '').split(' ')[0] || 'there';
    // Only the lines they are actually accepting set the rhythm. Reading the
    // optional recurring offer here relabelled a one-off deep clean as a
    // repeating visit while still showing the one-off price.
    var recurring = priced.filter(function (it) { return CADENCE[it.cadence]; });
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
          /* The validity date belongs to the total, not floating between the
             total and the note where it read as a caption for whatever came
             next. */
          (q.expires_at && status === 'sent'
            ? '<p class="proposal__valid">This quote holds until ' + esc(formatDate(q.expires_at)) + '</p>'
            : '') +
        '</div>' +
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

    /* Ticking the optional offer should feel like a choice being made, the
       same way an extra does. It deliberately does not touch the total — the
       price beside it is what it costs, later. */
    Array.prototype.forEach.call(root.querySelectorAll('input[name="later"]'), function (box) {
      box.addEventListener('change', function () {
        var card = box.closest('.later__row');
        if (card) card.classList.toggle('is-on', box.checked);
      });
    });

    if (acceptBtn) {
      acceptBtn.addEventListener('click', function () {
        respond('accept', acceptBtn, { add_ons: selectedAddons(), later_on: selectedLaterOn() });
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
