/* ==========================================================================
   Oasis Coastal Cleaning — quote form
   Builds every field from js/data.js, keeps a live estimate range in view,
   and posts to /api/quote (Cloudflare Pages Function).
   ========================================================================== */
(function () {
  'use strict';

  var D = window.OASIS;
  var U = window.OASIS_UTIL;
  var form = document.getElementById('quote-form');
  if (!D || !U || !form) { return; }

  var esc = U.esc, money = U.money;
  var fieldsEl = document.getElementById('quote-fields');
  var estimateEl = document.getElementById('estimate');
  var statusEl = document.getElementById('form-status');

  /* ----------------------------------------------------------- the fields */
  var services = U.activeServices();
  var freqs = U.activeFrequencies();

  function radioTiles(name, items, checkedId) {
    return '<div class="tiles">' + items.map(function (it) {
      return '<label class="tile">' +
               '<input type="radio" name="' + name + '" value="' + esc(it.id) + '"' +
                 (it.id === checkedId ? ' checked' : '') + (it.required ? ' required' : '') + '>' +
               '<span>' + esc(it.label) +
                 (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') +
               '</span>' +
             '</label>';
    }).join('') + '</div>';
  }

  var params = new URLSearchParams(window.location.search);
  var preselect = params.get('service');
  if (!services.some(function (s) { return s.id === preselect; })) { preselect = services[0].id; }

  fieldsEl.innerHTML =
    '<fieldset class="fieldset">' +
      '<legend>What do you need? <span class="req">*</span></legend>' +
      radioTiles('service', services.map(function (s) {
        return { id: s.id, label: s.name, sub: s.short, required: true };
      }), preselect) +
    '</fieldset>' +

    '<div class="field">' +
      '<label for="property">Property type</label>' +
      '<select id="property" name="property">' +
        D.propertyTypes.map(function (p) {
          return '<option value="' + esc(p) + '">' + esc(p) + '</option>';
        }).join('') +
      '</select>' +
    '</div>' +

    '<div class="field">' +
      '<label for="size">How big is the space? <span class="req">*</span></label>' +
      '<select id="size" name="size" required></select>' +
      '<p class="hint" id="size-hint">A close guess is fine — the quote is confirmed before anyone is booked.</p>' +
    '</div>' +

    '<fieldset class="fieldset" id="frequency-block">' +
      '<legend>How often? <span class="req">*</span></legend>' +
      radioTiles('frequency', freqs.map(function (f) {
        var save = Math.round((1 - f.factor) * 100);
        return { id: f.id, label: f.label, sub: save > 0 ? 'Save about ' + save + '%' : f.note, required: true };
      }), 'biweekly') +
    '</fieldset>' +

    '<fieldset class="fieldset" id="extras-block">' +
      '<legend>Anything to add?</legend>' +
      '<div class="stack" id="extras-list"></div>' +
      '<label class="checkrow" id="firstvisit-row">' +
        '<input type="checkbox" name="firstVisit" id="firstVisit" checked>' +
        '<span>This would be our first visit. <span class="muted">The first clean runs longer ' +
          'and costs more than the ones after it — leaving this checked keeps the range honest.</span></span>' +
      '</label>' +
    '</fieldset>' +

    '<div class="field">' +
      '<label for="city">Where is it? <span class="req">*</span></label>' +
      '<select id="city" name="city" required>' +
        '<option value="">Choose your city</option>' +
        D.areas.map(function (a) {
          return '<optgroup label="' + esc(a.name) + '">' +
            a.cities.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('') +
          '</optgroup>';
        }).join('') +
        '<option value="Somewhere else">Somewhere else nearby</option>' +
      '</select>' +
      '<p class="hint">Not on the list? Choose “somewhere else” and tell us where — routes shift as the schedule fills.</p>' +
    '</div>' +

    '<div class="grid grid--2">' +
      '<div class="field">' +
        '<label for="name">Your name <span class="req">*</span></label>' +
        '<input type="text" id="name" name="name" autocomplete="name" required>' +
      '</div>' +
      '<div class="field">' +
        '<label for="phone">Phone <span class="req">*</span></label>' +
        '<input type="tel" id="phone" name="phone" autocomplete="tel" inputmode="tel" required>' +
      '</div>' +
    '</div>' +

    '<div class="field">' +
      '<label for="email">Email <span class="req">*</span></label>' +
      '<input type="email" id="email" name="email" autocomplete="email" required>' +
    '</div>' +

    '<div class="field">' +
      '<label for="notes">Anything we should know?</label>' +
      '<textarea id="notes" name="notes" placeholder="Pets, a preferred day, the three rooms that stress you out, ' +
        'a gate code, dates you are away."></textarea>' +
    '</div>' +

    /* honeypot — a bot fills this in, a person never sees it */
    '<div class="visually-hidden" aria-hidden="true">' +
      '<label for="company">Company</label>' +
      '<input type="text" id="company" name="company" tabindex="-1" autocomplete="off">' +
    '</div>';

  /* ----------------------------------------------------- dependent fields */
  function currentService() {
    var checked = form.querySelector('input[name="service"]:checked');
    return U.serviceById(checked ? checked.value : services[0].id);
  }

  function syncFields() {
    var s = currentService();
    var sizeSel = form.querySelector('#size');
    var keep = sizeSel.value;
    sizeSel.innerHTML = s.estimate.sizes.map(function (z) {
      return '<option value="' + esc(z.id) + '">' + esc(z.label) + '</option>';
    }).join('');
    if (s.estimate.sizes.some(function (z) { return z.id === keep; })) { sizeSel.value = keep; }

    // frequency only where a rhythm is actually offered
    var freqBlock = form.querySelector('#frequency-block');
    freqBlock.hidden = !s.recurring;
    var freqInputs = freqBlock.querySelectorAll('input[name="frequency"]');
    for (var i = 0; i < freqInputs.length; i++) {
      freqInputs[i].required = s.recurring;
      if (!s.recurring) { freqInputs[i].checked = freqInputs[i].value === 'onetime'; }
    }
    if (s.recurring && !form.querySelector('input[name="frequency"]:checked')) {
      var pref = form.querySelector('input[name="frequency"][value="biweekly"]') || freqInputs[0];
      if (pref) { pref.checked = true; }
    }

    // extras that apply to this service
    var applicable = D.extras.filter(function (x) { return x.services.indexOf(s.id) !== -1; });
    form.querySelector('#extras-list').innerHTML = applicable.map(function (x) {
      var price = x.add ? '+' + money(x.add) : '+' + Math.round((x.factor - 1) * 100) + '%';
      return '<label class="checkrow">' +
               '<input type="checkbox" name="extras" value="' + esc(x.id) + '">' +
               '<span>' + esc(x.label) + ' <span class="muted">' + esc(price) + '</span></span>' +
             '</label>';
    }).join('');

    var firstRow = form.querySelector('#firstvisit-row');
    firstRow.hidden = s.estimate.firstVisit === 1;
    form.querySelector('#extras-block').hidden = !applicable.length && firstRow.hidden;
  }

  /* -------------------------------------------------------- the estimator */
  function compute() {
    var s = currentService();
    var sizeId = form.querySelector('#size').value;
    var size = null;
    s.estimate.sizes.forEach(function (z) { if (z.id === sizeId) { size = z; } });
    if (!size) { return null; }

    var lines = [];
    var base = size.price != null ? size.price : size.hours * s.estimate.hourlyRate;
    lines.push({ label: size.label, value: money(base) });

    var total = base;

    // flat-dollar extras first, then percentage extras on the running total
    var chosen = [];
    var boxes = form.querySelectorAll('input[name="extras"]:checked');
    for (var i = 0; i < boxes.length; i++) { chosen.push(boxes[i].value); }

    D.extras.forEach(function (x) {
      if (chosen.indexOf(x.id) === -1 || !x.add) { return; }
      total += x.add;
      lines.push({ label: x.label, value: '+' + money(x.add) });
    });
    D.extras.forEach(function (x) {
      if (chosen.indexOf(x.id) === -1 || !x.factor) { return; }
      total *= x.factor;
      lines.push({ label: x.label, value: '+' + Math.round((x.factor - 1) * 100) + '%' });
    });

    var freqId = 'onetime';
    var freqInput = form.querySelector('input[name="frequency"]:checked');
    if (s.recurring && freqInput) { freqId = freqInput.value; }
    var freq = null;
    D.frequencies.forEach(function (f) { if (f.id === freqId) { freq = f; } });
    if (freq && freq.factor !== 1) {
      total *= freq.factor;
      lines.push({ label: freq.label + ' rate', value: '−' + Math.round((1 - freq.factor) * 100) + '%' });
    }

    var first = form.querySelector('#firstVisit');
    var firstChecked = first && !form.querySelector('#firstvisit-row').hidden && first.checked;
    if (firstChecked && s.estimate.firstVisit !== 1) {
      total *= s.estimate.firstVisit;
      lines.push({ label: 'First visit, deeper clean', value: '+' + Math.round((s.estimate.firstVisit - 1) * 100) + '%' });
    }

    total = Math.max(total, s.estimate.minimum);

    var round5 = function (n) { return Math.round(n / 5) * 5; };
    return {
      service: s,
      low: round5(total * 0.92),
      high: round5(total * 1.12),
      unit: s.estimate.unitLabel || s.startingUnit,
      lines: lines,
      frequency: freq,
      firstVisit: firstChecked
    };
  }

  function caveat(r) {
    return 'This is a range, not a bill. Square footage, condition on the first day, pets and ' +
           'how often we come all move the number, so we confirm it in writing before anyone is ' +
           'booked — and there is nothing to pay until you say yes.' +
           (r.firstVisit ? ' Visits after the first one come in below this range.' : '');
  }

  function paintEstimate() {
    var r = compute();
    if (!r) {
      estimateEl.innerHTML = '<h2>Your estimate</h2>' +
        '<p class="estimate__empty">Pick a service and a size and a range appears here.</p>';
      return;
    }
    var per = r.service.recurring && r.frequency && r.frequency.id !== 'onetime'
      ? r.unit + ', ' + r.frequency.label.toLowerCase()
      : r.unit;

    estimateEl.innerHTML =
      '<h2>Your estimate</h2>' +
      '<p class="estimate__range" aria-live="polite">' + money(r.low) + ' &ndash; ' + money(r.high) +
        '<span class="estimate__unit">' + esc(per) + '</span></p>' +
      '<ul class="estimate__lines">' +
        r.lines.map(function (l) {
          return '<li><span>' + esc(l.label) + '</span><b>' + l.value + '</b></li>';
        }).join('') +
      '</ul>' +
      '<p class="estimate__note">' + caveat(r) + '</p>';

    var mobileNote = document.getElementById('estimate-note');
    if (mobileNote) { mobileNote.textContent = caveat(r); }

    form.querySelector('#estimate-low').value = r.low;
    form.querySelector('#estimate-high').value = r.high;
  }

  form.addEventListener('change', function (e) {
    if (e.target.name === 'service') { syncFields(); }
    paintEstimate();
  });
  form.addEventListener('input', function (e) {
    if (e.target.tagName === 'SELECT') { paintEstimate(); }
  });

  syncFields();
  paintEstimate();

  /* ------------------------------------------------------------- turnstile */
  if (D.turnstileSiteKey) {
    var holder = document.getElementById('turnstile-holder');
    holder.innerHTML = '<div class="cf-turnstile" data-sitekey="' + esc(D.turnstileSiteKey) +
                       '" data-theme="light" data-action="quote"></div>';
    var ts = document.createElement('script');
    ts.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    ts.async = true; ts.defer = true;
    document.head.appendChild(ts);
  }

  /* ---------------------------------------------------------------- submit */
  function say(msg, kind) {
    statusEl.hidden = false;
    statusEl.className = 'form-status form-status--' + (kind || 'err');
    statusEl.innerHTML = msg;
    statusEl.focus();
  }

  function payload() {
    var data = new FormData(form);
    var out = {};
    data.forEach(function (v, k) {
      if (k === 'extras') { (out.extras = out.extras || []).push(v); }
      else { out[k] = v; }
    });
    var s = U.serviceById(out.service);
    var sizeSel = form.querySelector('#size');
    out.serviceName = s ? s.name : out.service;
    out.sizeLabel = sizeSel.options[sizeSel.selectedIndex] ? sizeSel.options[sizeSel.selectedIndex].text : '';
    out.extraLabels = (out.extras || []).map(function (id) {
      var found = '';
      D.extras.forEach(function (x) { if (x.id === id) { found = x.label; } });
      return found;
    });
    var f = null;
    D.frequencies.forEach(function (x) { if (x.id === out.frequency) { f = x; } });
    out.frequencyLabel = f ? f.label : 'One time';
    out.firstVisit = !!form.querySelector('#firstVisit').checked && !form.querySelector('#firstvisit-row').hidden;
    out.pageUrl = window.location.href;
    return out;
  }

  function mailtoFallback(body) {
    var subject = 'Quote request — ' + body.serviceName + ' in ' + (body.city || 'South Florida');
    var lines = [
      'Name: ' + body.name, 'Phone: ' + body.phone, 'Email: ' + body.email, '',
      'Service: ' + body.serviceName, 'Property: ' + body.property, 'Size: ' + body.sizeLabel,
      'Frequency: ' + body.frequencyLabel, 'First visit: ' + (body.firstVisit ? 'yes' : 'no'),
      'Add-ons: ' + (body.extraLabels.join(', ') || 'none'),
      'City: ' + body.city, '',
      'Estimate shown: $' + body['estimate-low'] + ' - $' + body['estimate-high'], '',
      'Notes:', body.notes || '(none)'
    ];
    return 'mailto:' + D.business.email + '?subject=' + encodeURIComponent(subject) +
           '&body=' + encodeURIComponent(lines.join('\n'));
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    statusEl.hidden = true;

    if (!form.reportValidity()) { return; }

    var body = payload();
    if (body.company) { return; }  // honeypot tripped

    if (D.turnstileSiteKey) {
      var token = form.querySelector('[name="cf-turnstile-response"]');
      if (!token || !token.value) {
        say('Please complete the “I am human” check just above the button, then send again.');
        return;
      }
      body.turnstileToken = token.value;
    }

    var btn = form.querySelector('button[type="submit"]');
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sending…';

    fetch('/api/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (res.ok) {
        try { sessionStorage.setItem('oasis-quote', JSON.stringify({
          low: body['estimate-low'], high: body['estimate-high'],
          service: body.serviceName, name: body.name
        })); } catch (err) { /* private browsing — not important */ }
        window.location.href = '/thank-you.html';
        return;
      }
      return res.json().catch(function () { return {}; }).then(function (j) {
        throw new Error(j.error || 'The server did not accept it.');
      });
    }).catch(function (err) {
      btn.disabled = false;
      btn.textContent = label;
      say('Sorry — that did not send. ' + esc(err.message) +
          ' You can <a href="' + mailtoFallback(body) + '">email it instead</a>, or call ' +
          '<a href="' + U.telHref(D.business.phone) + '">' + esc(D.business.phone) + '</a>.');
    });
  });
})();
