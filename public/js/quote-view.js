/* ==========================================================================
   Customer-facing quote. Token comes from /q/{token} (rewritten to this page).
   ========================================================================== */
(function () {
  'use strict';

  var root = document.getElementById('quote-view');
  if (!root) { return; }

  var U = window.OASIS_UTIL;
  var D = window.OASIS;
  var esc = U ? U.esc : function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  function tokenFromLocation() {
    var path = window.location.pathname.replace(/\/+$/, '');
    var parts = path.split('/');
    var last = parts[parts.length - 1] || '';
    if (last && last !== 'q' && last !== 'q.html') { return decodeURIComponent(last); }
    var params = new URLSearchParams(window.location.search);
    return params.get('t') || params.get('token') || '';
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

  function formatDay(iso) {
    if (!iso) { return ''; }
    var d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
    if (isNaN(d)) { return String(iso); }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function firstName(name) {
    return String(name || '').trim().split(/\s+/)[0] || '';
  }

  function showError(msg) {
    var title = document.getElementById('qv-title');
    var lead = document.getElementById('qv-lead');
    if (title) { title.textContent = 'This quote is not available'; }
    if (lead) { lead.textContent = 'The link may have been copied short, or the quote was removed.'; }
    root.innerHTML =
      '<p>' + esc(msg) + '</p>' +
      '<p class="mt-lg"><a class="btn btn--primary" href="/quote">Request a new quote</a> ' +
      (D ? '<a class="btn btn--ghost" href="' + (U ? U.telHref(D.business.phone) : 'tel:+15612017123') +
        '">Call instead</a>' : '') + '</p>';
  }

  function linesHtml(items) {
    if (!items || !items.length) { return ''; }
    return '<table class="qview-table">' +
      '<thead><tr><th>Item</th><th>Amount</th></tr></thead>' +
      '<tbody>' +
      items.map(function (i) {
        var qty = Number(i.qty) === 1 ? '' : ' <span class="muted">× ' + esc(String(i.qty)) + '</span>';
        return '<tr><td>' + esc(i.description) + qty + '</td><td>' + esc(money(i.amount)) + '</td></tr>';
      }).join('') +
      '</tbody></table>';
  }

  function renderQuote(q, opts) {
    opts = opts || {};
    var accepted = q.status === 'accepted' || opts.justAccepted;
    var who = firstName(q.customer_name);
    var title = document.getElementById('qv-title');
    var lead = document.getElementById('qv-lead');
    if (title) { title.textContent = accepted ? 'Quote accepted' : 'Your quote'; }
    if (lead) {
      lead.textContent = accepted
        ? 'Kristina will confirm the first date by text or email.'
        : (who ? 'Prepared for ' + who + '.' : 'Review the work and the number, then accept when you are ready.');
    }

    var meta = [];
    if (q.service_label) { meta.push('<div><span class="qview-k">Service</span><span>' + esc(q.service_label) + '</span></div>'); }
    if (q.frequency) { meta.push('<div><span class="qview-k">Rhythm</span><span>' + esc(q.frequency) + '</span></div>'); }
    if (q.valid_until) {
      meta.push('<div><span class="qview-k">Good until</span><span>' +
        esc(formatDay(q.valid_until)) + (q.expired && !accepted ? ' — past this date' : '') + '</span></div>');
    }

    var intro = q.intro
      ? '<p class="qview-intro">' + esc(q.intro).replace(/\n/g, '<br>') + '</p>'
      : '';

    var notes = q.notes
      ? '<div class="qview-notes"><p class="eyebrow" style="margin:0 0 .5rem">About this quote</p><p>' +
        esc(q.notes).replace(/\n/g, '<br>') + '</p></div>'
      : '';

    var total = '<p class="qview-total"><span>Total</span><strong>' +
      esc(q.total_label || money(q.total)) + '</strong></p>';

    var action;
    if (accepted) {
      var when = q.accepted_at ? formatDay(q.accepted_at) : '';
      action =
        '<div class="qview-accepted" role="status">' +
          '<p><strong>Accepted' + (q.accepted_name ? ' by ' + esc(q.accepted_name) : '') +
          (when ? ' on ' + esc(when) : '') + '.</strong></p>' +
          '<p>Nothing is charged yet. Kristina will be in touch to lock in the first visit.</p>' +
          (D ? '<p class="mt-lg"><a class="btn btn--primary" href="' + U.telHref(D.business.phone) + '">Call ' +
            esc(D.business.phone) + '</a></p>' : '') +
        '</div>';
    } else {
      action =
        '<form id="accept-form" class="qview-accept">' +
          '<p class="eyebrow" style="margin:0 0 .6rem">Accept this quote</p>' +
          '<p class="muted" style="margin:0 0 1rem">Accepting confirms the price and asks Kristina to book you in. ' +
            'You are not charged from this page.</p>' +
          '<div class="field">' +
            '<label for="accept-name">Your name <span class="req">*</span></label>' +
            '<input type="text" id="accept-name" name="name" autocomplete="name" required value="' +
              esc(q.customer_name || '') + '">' +
          '</div>' +
          '<p id="accept-err" class="form-status form-status--err" hidden></p>' +
          '<p style="margin:1.1rem 0 0">' +
            '<button type="submit" class="btn btn--primary" id="accept-btn">Accept this quote</button>' +
          '</p>' +
        '</form>';
    }

    root.innerHTML = intro +
      (meta.length ? '<div class="qview-meta">' + meta.join('') + '</div>' : '') +
      linesHtml(q.line_items) +
      total +
      notes +
      action;
  }

  var token = tokenFromLocation();
  if (!token) {
    showError('This page needs a quote link. Ask Kristina to send it again, or request a new quote.');
    return;
  }

  fetch('/api/q/' + encodeURIComponent(token), { headers: { 'Accept': 'application/json' } })
    .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
    .then(function (res) {
      if (!res.ok || !res.body.quote) {
        showError(res.body && res.body.error ? res.body.error : 'That quote could not be found.');
        return;
      }
      renderQuote(res.body.quote);
    })
    .catch(function () {
      showError('The quote could not be loaded just now. Refresh, or call and we will send it another way.');
    });

  root.addEventListener('submit', function (e) {
    var form = e.target.closest('#accept-form');
    if (!form) { return; }
    e.preventDefault();
    var nameEl = document.getElementById('accept-name');
    var err = document.getElementById('accept-err');
    var btn = document.getElementById('accept-btn');
    var name = nameEl ? nameEl.value.trim() : '';
    if (!name) {
      if (err) { err.hidden = false; err.textContent = 'Please type your name to accept.'; }
      if (nameEl) { nameEl.setAttribute('aria-invalid', 'true'); nameEl.focus(); }
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Accepting…'; }
    if (err) { err.hidden = true; }

    fetch('/api/q/' + encodeURIComponent(token), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok || !res.body.quote) {
          if (err) {
            err.hidden = false;
            err.textContent = (res.body && res.body.error) || 'That did not go through. Try once more.';
          }
          if (btn) { btn.disabled = false; btn.textContent = 'Accept this quote'; }
          return;
        }
        renderQuote(res.body.quote, { justAccepted: true });
        window.scrollTo(0, 0);
      })
      .catch(function () {
        if (err) {
          err.hidden = false;
          err.textContent = 'The network hiccuped. Try once more, or call and we will mark it accepted.';
        }
        if (btn) { btn.disabled = false; btn.textContent = 'Accept this quote'; }
      });
  });
})();
