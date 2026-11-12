/* Oasis Coastal Cleaning — a regular's own page.

   One link, theirs, that does not expire: what is coming up, what they
   owe, and the times Kristina has put up for them. Nothing is computed
   and no price is invented — the money is the money already on their
   invoices. */
(function () {
  var root = document.getElementById('client-root');
  if (!root) return;
  var FMT = window.OasisFormat || {};
  var token = new URLSearchParams(location.search).get('t') || '';

  var esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  };
  var money = function (cents) {
    var n = Number(cents);
    if (!Number.isFinite(n)) return '$0.00';
    var v = (n / 100).toFixed(2);
    var dot = v.indexOf('.');
    return '$' + v.slice(0, dot).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + v.slice(dot);
  };
  var when = function (iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { timeZone: 'America/New_York',
      weekday: 'long', month: 'long', day: 'numeric' }) + ', ' +
      d.toLocaleTimeString('en-US', { timeZone: 'America/New_York',
        hour: 'numeric', minute: '2-digit' });
  };

  var api = function (opts) {
    return fetch('/api/client/' + encodeURIComponent(token), opts)
      .then(function (r) {
        return r.json().catch(function () {
          return { error: 'Something went wrong (' + r.status + ').' };
        }).then(function (j) { return { ok: r.ok, body: j }; });
      })
      .catch(function () {
        return { ok: false, body: { error: 'No connection — try again in a moment.' } };
      });
  };

  function render(d) {
    var first = String(d.customer.name || '').split(' ')[0] || 'there';
    var visits = d.visits || [];
    var slots = d.slots || [];
    var invoices = (d.invoices || []).filter(function (i) { return i.state !== 'void'; });

    root.innerHTML =
      '<div class="card">' +
        '<h1 style="font-size:var(--step-1);margin:0 0 .25rem">Hello, ' + esc(first) + '</h1>' +
        '<p class="muted" style="margin:0 0 1.25rem">Your cleans with Oasis Coastal Cleaning.</p>' +

        '<h2 class="slots__k">Coming up</h2>' +
        (visits.length
          ? '<ul class="cl__list">' + visits.map(function (v) {
              return '<li class="cl__i"><span class="cl__when">' +
                esc(v.all_day ? v.start_date : when(v.start_at)) + '</span>' +
                (v.service_label ? '<span class="cl__what">' + esc(v.service_label) + '</span>' : '') +
              '</li>'; }).join('') + '</ul>'
          : '<p class="muted">Nothing booked at the moment.</p>') +

        (d.outstanding
          ? '<h2 class="slots__k" style="margin-top:1.5rem">What you owe</h2>' +
            '<p class="cl__owed">' + money(d.outstanding) + '</p>' +
            '<ul class="cl__list">' + invoices.filter(function (i) { return i.balance > 0; })
              .map(function (i) {
                return '<li class="cl__i"><span>' +
                  esc(FMT.formatDate ? FMT.formatDate(i.created_at) : i.created_at) + '</span>' +
                  '<span>' + money(i.balance) + ' of ' + money(i.total) + '</span></li>';
              }).join('') + '</ul>' +
            '<p class="muted" style="font-size:.85rem">Kristina takes Zelle, cash, cheque ' +
              'or a card in person. Message her to settle up.</p>'
          : invoices.length
            ? '<h2 class="slots__k" style="margin-top:1.5rem">What you owe</h2>' +
              '<p class="muted">Nothing outstanding — you are all settled.</p>'
            : '') +

        (slots.length
          ? '<h2 class="slots__k" style="margin-top:1.5rem">Book your next clean</h2>' +
            '<p class="slots__lead">These are the times Kristina has free.</p>' +
            '<ul class="slots__list">' + slots.map(function (sl) {
              return '<li class="slots__i"><label>' +
                '<input type="radio" name="slot" value="' + esc(sl.id) + '">' +
                '<span class="slots__when">' + esc(when(sl.start_at)) + '</span>' +
              '</label></li>'; }).join('') + '</ul>' +
            '<div class="proposal__actions" style="margin-top:1rem">' +
              '<button type="button" class="btn btn--primary" id="book">Book this time</button>' +
            '</div>'
          : '<h2 class="slots__k" style="margin-top:1.5rem">Book your next clean</h2>' +
            '<p class="muted">No times are up just now. Message Kristina and she will ' +
            'put one in for you.</p>') +

        '<div id="client-status" class="form-status" role="alert" hidden></div>' +
      '</div>';

    var btn = document.getElementById('book');
    if (btn) {
      btn.addEventListener('click', function () {
        var on = document.querySelector('input[name="slot"]:checked');
        var status = document.getElementById('client-status');
        if (!on) {
          status.hidden = false;
          status.className = 'form-status form-status--err';
          status.textContent = 'Pick a time first.';
          return;
        }
        btn.disabled = true;
        api({ method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'book', slot_id: on.value }) })
          .then(function (r) {
            if (r.ok) { load(); return; }
            btn.disabled = false;
            status.hidden = false;
            status.className = 'form-status form-status--err';
            status.textContent = (r.body && r.body.error) || 'That did not work.';
          });
      });
    }
  }

  function load() {
    api().then(function (r) {
      if (!r.ok) {
        root.innerHTML = '<div class="card">' +
          '<h1 style="font-size:var(--step-1);margin:0 0 .5rem">This link is not working</h1>' +
          '<p class="muted" style="margin:0">It may have been replaced. ' +
          'Message Kristina and she will send you a new one.</p></div>';
        return;
      }
      render(r.body);
    });
  }

  load();
})();
