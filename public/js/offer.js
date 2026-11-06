/* ==========================================================================
   Oasis Coastal Cleaning — "pick a time" page
   --------------------------------------------------------------------------
   Public page opened from a link Kristina texts or emails. Token in ?t=…

   The one rule this page keeps: it never tells somebody a time is theirs
   until the server has written it down and checked again. A slot that went
   while they were deciding says so and offers the rest, instead of silently
   booking them something they did not choose.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.getElementById('offer-root');
  if (!root) { return; }

  var params = new URLSearchParams(window.location.search);
  var token = params.get('t');

  var BIZ = (window.OASIS && window.OASIS.business) || {};
  var digits = function (v) { return String(v == null ? '' : v).replace(/\D/g, ''); };
  var esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  function reachHer(lead) {
    if (!BIZ.phone) return lead ? '<p class="done__lead">' + esc(lead) + '</p>' : '';
    var d = digits(BIZ.phone);
    return (lead ? '<p class="done__lead">' + esc(lead) + '</p>' : '') +
      '<p class="done__acts">' +
        '<a class="btn btn--primary" href="sms:+1' + esc(d) + '">Text ' + esc(BIZ.phone) + '</a>' +
        '<a class="btn btn--ghost" href="tel:+1' + esc(d) + '">Call instead</a>' +
      '</p>';
  }

  function card(title, body) {
    return '<div class="card"><h1 class="offer__h">' + esc(title) + '</h1>' + body + '</div>';
  }

  if (!token) {
    root.innerHTML = card('Link not found',
      '<p class="muted" style="margin:0 0 .75rem">This link is missing or incomplete.</p>' +
      reachHer('Message Kristina and she will send a fresh one.'));
    return;
  }

  /* ------------------------------------------------------------- times */
  var TZ = 'America/New_York';
  function dayLabel(iso) {
    try {
      return new Date(iso).toLocaleDateString('en-US',
        { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' });
    } catch (e) { return ''; }
  }
  function timeLabel(iso) {
    try {
      return new Date(iso).toLocaleTimeString('en-US',
        { timeZone: TZ, hour: 'numeric', minute: '2-digit' })
        .replace(':00', '').toLowerCase().replace(' ', '');
    } catch (e) { return ''; }
  }
  function rangeLabel(s, e) { return timeLabel(s) + ' – ' + timeLabel(e); }

  var state = { offer: null, slots: [], picking: null, error: '' };

  function slotButton(s) {
    if (!s.free) {
      return '<li class="pslot pslot--gone">' +
        '<span class="pslot__day">' + esc(dayLabel(s.start_at)) + '</span>' +
        '<span class="pslot__time">' + esc(rangeLabel(s.start_at, s.end_at)) + '</span>' +
        '<span class="pslot__tag">' +
          (s.gone === 'past' ? 'Already passed' : 'Just taken') + '</span></li>';
    }
    var busy = state.picking === s.id;
    return '<li><button type="button" class="pslot pslot--open' + (busy ? ' is-busy' : '') +
      '" data-slot="' + esc(s.id) + '"' + (state.picking ? ' disabled' : '') + '>' +
      '<span class="pslot__day">' + esc(dayLabel(s.start_at)) + '</span>' +
      '<span class="pslot__time">' + esc(rangeLabel(s.start_at, s.end_at)) + '</span>' +
      '<span class="pslot__tag pslot__tag--go">' +
        (busy ? 'Booking…' : 'Choose this') + '</span></button></li>';
  }

  function booked(chosen, name) {
    return card('You are booked in',
      '<p class="offer__lead">' +
        (chosen ? esc(dayLabel(chosen.start_at)) + ', ' +
          esc(rangeLabel(chosen.start_at, chosen.end_at)) : 'Your time is confirmed') +
      '</p>' +
      '<p class="muted">Kristina has it on her calendar' +
        (name ? ', ' + esc(name) : '') + '. ' +
        'If anything changes, let her know as early as you can.</p>' +
      reachHer(''));
  }

  function render() {
    var o = state.offer || {};
    if (o.status === 'booked' || state.chosen) {
      root.innerHTML = booked(state.chosen, o.customer_name);
      return;
    }

    var free = state.slots.filter(function (s) { return s.free; }).length;
    var head = o.customer_name ? 'Pick a time, ' + o.customer_name : 'Pick a time';

    if (!free) {
      root.innerHTML = card('Those times have gone',
        '<p class="muted" style="margin:0 0 .75rem">Every time on this list has been ' +
        'taken since it was sent. Nothing is booked.</p>' +
        reachHer('Message Kristina and she will send some new ones.'));
      return;
    }

    root.innerHTML = card(head,
      (o.service_label ? '<p class="offer__lead">' + esc(o.service_label) +
        (o.city ? ' · ' + esc(o.city) : '') + '</p>' : '') +
      (o.note ? '<p class="offer__note">' + esc(o.note) + '</p>' : '') +
      '<p class="muted offer__hint">Tap whichever suits you. Nothing is booked until you choose.</p>' +
      (state.error ? '<p class="offer__err" role="alert">' + esc(state.error) + '</p>' : '') +
      '<ul class="pslots">' + state.slots.map(slotButton).join('') + '</ul>' +
      '<p class="muted offer__foot">None of these work? ' +
        (BIZ.phone ? 'Text Kristina on <a href="sms:+1' + esc(digits(BIZ.phone)) + '">' +
          esc(BIZ.phone) + '</a> and she will find another.' : 'Message Kristina for another.') +
      '</p>');
  }

  function dead(reason) {
    var words = {
      expired: ['This link has expired', 'Nothing is booked.'],
      withdrawn: ['These times are no longer offered', 'Nothing is booked.'],
      not_found: ['Link not found', 'This link is missing or incomplete.']
    }[reason] || ['These times are no longer offered', 'Nothing is booked.'];
    root.innerHTML = card(words[0],
      '<p class="muted" style="margin:0 0 .75rem">' + esc(words[1]) + '</p>' +
      reachHer('Message Kristina and she will send some new times.'));
  }

  /* --------------------------------------------------------------- io */
  function get(url, opts) {
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return {}; })
        .then(function (b) { return { ok: r.ok, status: r.status, body: b }; });
    });
  }

  function loadOffer() {
    get('/api/offer/' + encodeURIComponent(token)).then(function (r) {
      if (!r.ok || !r.body.ok) { dead(r.status === 404 ? 'not_found' : ''); return; }
      if (!r.body.live) {
        if (r.body.reason === 'booked') {
          state.offer = r.body.offer; state.chosen = r.body.chosen; render();
        } else { dead(r.body.reason); }
        return;
      }
      state.offer = r.body.offer;
      state.slots = r.body.slots || [];
      render();
    }).catch(function () {
      root.innerHTML = card('We could not load your times',
        '<p class="muted">Check your connection and reload the page.</p>');
    });
  }

  root.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-slot]');
    if (!btn || state.picking) return;
    state.picking = btn.getAttribute('data-slot');
    state.error = '';
    render();

    get('/api/offer/' + encodeURIComponent(token), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot_id: state.picking })
    }).then(function (r) {
      state.picking = null;
      if (r.ok && r.body.ok) {
        state.offer = r.body.offer || state.offer;
        state.chosen = r.body.chosen;
        render();
        return;
      }
      /* The server is the only thing that knows. If it says the slot went,
         show the list it sends back rather than the one we had. */
      if (r.body.slots) state.slots = r.body.slots;
      if (r.status === 410) { dead(r.body.reason); return; }
      state.error = r.body.error || 'That did not go through. Please try again.';
      render();
    }).catch(function () {
      state.picking = null;
      state.error = 'That did not go through. Check your connection and try again.';
      render();
    });
  });

  loadOffer();
})();
