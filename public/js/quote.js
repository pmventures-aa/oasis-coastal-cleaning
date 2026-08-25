/* ==========================================================================
   Oasis Coastal Cleaning — multistep quote request
   --------------------------------------------------------------------------
   Six short steps rather than one long form: people answer more when each
   screen asks little. Nothing is sent until the last one.

   No price is ever shown to the visitor. The estimator still runs, but its
   number rides along with the submission so Kristina has something to quote
   against. Set OASIS.showCustomerEstimate to true to surface it instead.
   ========================================================================== */
(function () {
  'use strict';

  var D = window.OASIS;
  var U = window.OASIS_UTIL;
  var root = document.getElementById('quote-wizard');
  if (!D || !U || !root) { return; }

  var esc = U.esc;
  var services = U.activeServices();
  var freqs = U.activeFrequencies();

  var state = { step: 0, leadId: null };

  /* ------------------------------------------------------------ the steps */
  var STEPS = [
    { id: 'need',    title: 'What can we help with?',      render: stepNeed,    validate: vNeed },
    { id: 'space',   title: 'Tell us about the place',     render: stepSpace,   validate: vSpace },
    { id: 'rhythm',  title: 'How often would you like us?', render: stepRhythm, validate: vRhythm },
    { id: 'addons',  title: 'Anything else while we are there?', render: stepAddOns, validate: null },
    { id: 'where',   title: 'Whereabouts are you?',        render: stepWhere,   validate: vWhere },
    { id: 'contact', title: 'Last bit — how do we reach you?', render: stepContact, validate: vContact }
  ];

  /* --------------------------------------------------------------- fields */
  function currentService() {
    var v = root.querySelector('input[name="service"]:checked');
    var id = v ? v.value : (state.service || services[0].id);
    return U.serviceById(id) || services[0];
  }

  function tiles(name, items, checked) {
    return '<div class="tiles">' + items.map(function (it) {
      return '<label class="tile">' +
               '<input type="radio" name="' + name + '" value="' + esc(it.id) + '"' +
                 (it.id === checked ? ' checked' : '') + '>' +
               '<span>' + esc(it.label) +
                 (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') +
               '</span></label>';
    }).join('') + '</div>';
  }

  function stepNeed() {
    var chosen = state.service || services[0].id;
    return '' +
      '<p class="step-lead">Pick whichever is closest. You can add more in a moment.</p>' +
      tiles('service', services.map(function (s) {
        return { id: s.id, label: s.name, sub: s.short };
      }), chosen) +
      '<div class="field mt-lg">' +
        '<label for="property">And what kind of place is it?</label>' +
        '<select id="property" name="property">' +
          D.propertyTypes.map(function (p) {
            return '<option value="' + esc(p) + '"' + (state.property === p ? ' selected' : '') + '>' +
                   esc(p) + '</option>';
          }).join('') +
        '</select>' +
      '</div>';
  }

  function stepSpace() {
    var s = currentService();
    return '' +
      '<div class="field">' +
        '<label for="size">Roughly how big? <span class="req">*</span></label>' +
        '<select id="size" name="size" required>' +
          s.sizes.map(function (z) {
            return '<option value="' + esc(z.id) + '"' + (state.size === z.id ? ' selected' : '') + '>' +
                   esc(z.label) + '</option>';
          }).join('') +
        '</select>' +
        '<p class="hint">A rough guess is honestly fine — nothing is booked on it.</p>' +
      '</div>' +
      '<div class="grid grid--2">' +
        '<div class="field">' +
          '<label for="bedrooms">Bedrooms</label>' +
          '<select id="bedrooms" name="bedrooms">' + numOptions(state.bedrooms, 6, 'Studio') + '</select>' +
        '</div>' +
        '<div class="field">' +
          '<label for="bathrooms">Bathrooms</label>' +
          '<select id="bathrooms" name="bathrooms">' + numOptions(state.bathrooms, 6, '1') + '</select>' +
        '</div>' +
      '</div>';
  }

  function numOptions(selected, max, first) {
    var out = ['<option value="">Not sure</option>'];
    if (first === 'Studio') { out.push(opt('Studio', selected)); }
    for (var i = 1; i <= max; i++) { out.push(opt(String(i), selected)); }
    out.push(opt(max + '+', selected));
    return out.join('');
  }
  function opt(v, selected) {
    return '<option value="' + esc(v) + '"' + (selected === v ? ' selected' : '') + '>' + esc(v) + '</option>';
  }

  function stepRhythm() {
    var s = currentService();
    if (!s.recurring) {
      return '<p class="step-lead">' + esc(s.name) + ' is quoted job by job, so there is nothing ' +
             'to pick here. Straight on.</p>' + firstVisitRow(s);
    }
    return '<p class="step-lead">A standing visit costs less each time. Pause for the season or ' +
           'stop with a week of notice — there is no contract.</p>' +
      tiles('frequency', freqs.map(function (f) {
        return { id: f.id, label: f.label, sub: f.note };
      }), state.frequency || 'biweekly') +
      firstVisitRow(s);
  }

  function firstVisitRow(s) {
    if (!s.recurring) { return ''; }
    var on = state.firstVisit !== false;
    return '<label class="checkrow mt-lg">' +
             '<input type="checkbox" name="firstVisit" id="firstVisit"' + (on ? ' checked' : '') + '>' +
             '<span>This would be our first visit. <span class="muted">The first one runs longer ' +
             'because it catches everything up, so it costs a bit more than the ones after.</span></span>' +
           '</label>';
  }

  function stepAddOns() {
    var s = currentService();
    var mine = D.addOns.filter(function (x) { return x.services.indexOf(s.id) !== -1; });
    var conds = D.conditions.filter(function (x) { return x.services.indexOf(s.id) !== -1; });
    if (!mine.length && !conds.length) {
      return '<p class="step-lead">Nothing to add for this one. Straight on.</p>';
    }

    var groups = [];
    mine.forEach(function (x) {
      var g = null;
      groups.forEach(function (row) { if (row.name === x.group) { g = row; } });
      if (!g) { g = { name: x.group, items: [] }; groups.push(g); }
      g.items.push(x);
    });

    return '<p class="step-lead">Tick anything you would like included — or none at all. ' +
             esc(D.bundleNote) + '</p>' +
      groups.map(function (g) {
        return '<div class="addon-group">' +
                 '<p class="addon-group__name">' + esc(g.name) + '</p>' +
                 '<div class="addon-grid">' +
                   g.items.map(function (x) {
                     var on = (state.addOns || []).indexOf(x.id) !== -1;
                     return '<label class="checkrow addon">' +
                              '<input type="checkbox" name="addons" value="' + esc(x.id) + '"' +
                                (on ? ' checked' : '') + '>' +
                              '<span class="addon__body">' +
                                '<span class="addon__label">' + esc(x.label) + '</span>' +
                                (x.note ? '<small>' + esc(x.note) + '</small>' : '') +
                              '</span></label>';
                   }).join('') +
                 '</div></div>';
      }).join('') +
      (conds.length
        ? '<div class="addon-group"><p class="addon-group__name">About the home</p>' +
          conds.map(function (x) {
            var on = (state.conditions || []).indexOf(x.id) !== -1;
            return '<label class="checkrow">' +
                     '<input type="checkbox" name="conditions" value="' + esc(x.id) + '"' +
                       (on ? ' checked' : '') + '>' +
                     '<span>' + esc(x.label) +
                       (x.note ? '<small class="muted" style="display:block">' + esc(x.note) + '</small>' : '') +
                     '</span></label>';
          }).join('') + '</div>'
        : '');
  }

  function stepWhere() {
    var days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return '' +
      '<div class="field">' +
        '<label for="city">Which city are you in? <span class="req">*</span></label>' +
        '<select id="city" name="city" required>' +
          '<option value="">Choose your city</option>' +
          D.areas.map(function (a) {
            return '<optgroup label="' + esc(a.name) + '">' +
              a.cities.map(function (c) {
                return '<option value="' + esc(c) + '"' + (state.city === c ? ' selected' : '') + '>' +
                       esc(c) + '</option>';
              }).join('') + '</optgroup>';
          }).join('') +
          '<option value="Somewhere else"' + (state.city === 'Somewhere else' ? ' selected' : '') +
            '>Somewhere else nearby</option>' +
        '</select>' +
      '</div>' +
      '<div class="grid grid--2">' +
        '<div class="field">' +
          '<label for="zip">ZIP code</label>' +
          '<input type="text" id="zip" name="zip" inputmode="numeric" autocomplete="postal-code" ' +
            'maxlength="10" value="' + esc(state.zip || '') + '">' +
        '</div>' +
        '<div class="field">' +
          '<label for="startWhen">When would you like to start?</label>' +
          '<select id="startWhen" name="startWhen">' +
            ['As soon as you can', 'Within two weeks', 'Within a month', 'Just planning ahead']
              .map(function (v) { return opt(v, state.startWhen); }).join('') +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div class="field">' +
        '<label for="address">Street address <span class="muted">— optional, but it helps us quote faster</span></label>' +
        '<input type="text" id="address" name="address" autocomplete="street-address" ' +
          'value="' + esc(state.address || '') + '">' +
      '</div>' +
      '<fieldset class="fieldset">' +
        '<legend>Any days that suit you better?</legend>' +
        '<div class="daypick">' +
          days.map(function (d) {
            var on = (state.preferredDays || []).indexOf(d) !== -1;
            return '<label class="daypick__day">' +
                     '<input type="checkbox" name="preferredDays" value="' + d + '"' + (on ? ' checked' : '') + '>' +
                     '<span>' + d + '</span></label>';
          }).join('') +
        '</div>' +
      '</fieldset>';
  }

  function stepContact() {
    return '' +
      '<div class="grid grid--2">' +
        '<div class="field">' +
          '<label for="name">Your name <span class="req">*</span></label>' +
          '<input type="text" id="name" name="name" autocomplete="name" required ' +
            'value="' + esc(state.name || '') + '">' +
        '</div>' +
        '<div class="field">' +
          '<label for="phone">Phone <span class="req">*</span></label>' +
          '<input type="tel" id="phone" name="phone" autocomplete="tel" inputmode="tel" required ' +
            'value="' + esc(state.phone || '') + '">' +
        '</div>' +
      '</div>' +
      '<div class="field">' +
        '<label for="email">Email <span class="req">*</span></label>' +
        '<input type="email" id="email" name="email" autocomplete="email" required ' +
          'value="' + esc(state.email || '') + '">' +
      '</div>' +
      '<div class="grid grid--2">' +
        '<div class="field">' +
          '<label for="contactPref">Best way to reach you?</label>' +
          '<select id="contactPref" name="contactPref">' +
            ['Text', 'Call', 'Email'].map(function (v) { return opt(v, state.contactPref); }).join('') +
          '</select>' +
        '</div>' +
        '<div class="field">' +
          '<label for="bestTime">And the best time of day?</label>' +
          '<select id="bestTime" name="bestTime">' +
            ['Morning', 'Afternoon', 'Evening', 'Any time'].map(function (v) { return opt(v, state.bestTime); }).join('') +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div class="field">' +
        '<label for="access">How would we get in on the day?</label>' +
        '<input type="text" id="access" name="access" placeholder="I will be home · lockbox · gate code · doorman" ' +
          'value="' + esc(state.access || '') + '">' +
      '</div>' +
      '<div class="field">' +
        '<label for="notes">Anything else we should know?</label>' +
        '<textarea id="notes" name="notes" placeholder="Pets and their names, the rooms that stress you out ' +
          'most, stairs, dates you are away — whatever comes to mind.">' + esc(state.notes || '') + '</textarea>' +
      '</div>' +
      '<div id="turnstile-holder"></div>' +
      '<div class="visually-hidden" aria-hidden="true">' +
        '<label for="company">Company</label>' +
        '<input type="text" id="company" name="company" tabindex="-1" autocomplete="off">' +
      '</div>';
  }

  /* ----------------------------------------------------------- validation */
  function fail(sel, msg) {
    var el = root.querySelector(sel);
    if (el) { el.setAttribute('aria-invalid', 'true'); el.focus(); }
    say(msg);
    return false;
  }
  function vNeed() {
    return root.querySelector('input[name="service"]:checked')
      ? true : fail('input[name="service"]', 'Pick one to get started.');
  }
  function vSpace() {
    return root.querySelector('#size').value ? true : fail('#size', 'Pick whichever size is closest.');
  }
  function vRhythm() {
    var s = currentService();
    if (!s.recurring) { return true; }
    return root.querySelector('input[name="frequency"]:checked')
      ? true : fail('input[name="frequency"]', 'Let us know how often suits you.');
  }
  function vWhere() {
    return root.querySelector('#city').value ? true : fail('#city', 'Which city are you in?');
  }
  function vContact() {
    var name = root.querySelector('#name'), phone = root.querySelector('#phone'), email = root.querySelector('#email');
    if (!name.value.trim()) { return fail('#name', 'What should we call you?'); }
    if (!phone.value.trim()) { return fail('#phone', 'A number we can reach you on.'); }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) {
      return fail('#email', 'That email looks a little off — mind checking it?');
    }
    return true;
  }

  /* ------------------------------------------------------------ collecting */
  function collect() {
    var scope = root;
    var pick = function (sel) { var el = scope.querySelector(sel); return el ? el.value : undefined; };
    var many = function (name) {
      var out = [], boxes = scope.querySelectorAll('input[name="' + name + '"]:checked');
      for (var i = 0; i < boxes.length; i++) { out.push(boxes[i].value); }
      return out;
    };
    var radio = function (name) {
      var el = scope.querySelector('input[name="' + name + '"]:checked');
      return el ? el.value : undefined;
    };
    var set = function (k, v) { if (v !== undefined) { state[k] = v; } };

    set('service', radio('service'));
    set('property', pick('#property'));
    set('size', pick('#size'));
    set('bedrooms', pick('#bedrooms'));
    set('bathrooms', pick('#bathrooms'));
    set('frequency', radio('frequency'));
    if (scope.querySelector('#firstVisit')) { state.firstVisit = scope.querySelector('#firstVisit').checked; }
    if (scope.querySelector('input[name="addons"]')) { state.addOns = many('addons'); }
    if (scope.querySelector('input[name="conditions"]')) { state.conditions = many('conditions'); }
    set('city', pick('#city'));
    set('zip', pick('#zip'));
    set('address', pick('#address'));
    set('startWhen', pick('#startWhen'));
    if (scope.querySelector('input[name="preferredDays"]')) { state.preferredDays = many('preferredDays'); }
    set('name', pick('#name'));
    set('phone', pick('#phone'));
    set('email', pick('#email'));
    set('contactPref', pick('#contactPref'));
    set('bestTime', pick('#bestTime'));
    set('access', pick('#access'));
    set('notes', pick('#notes'));
    set('company', pick('#company'));
  }

  function labelsFor(list, ids) {
    return (ids || []).map(function (id) {
      var out = '';
      list.forEach(function (x) { if (x.id === id) { out = x.label; } });
      return out;
    }).filter(Boolean);
  }

  /* ------------------------------------------------------------- rendering */
  function say(msg) {
    var box = root.querySelector('#wiz-status');
    if (!box) { return; }
    box.hidden = false;
    box.className = 'form-status form-status--err';
    box.innerHTML = msg;
  }
  function hush() {
    var box = root.querySelector('#wiz-status');
    if (box) { box.hidden = true; }
  }

  function render() {
    var step = STEPS[state.step];
    var n = state.step + 1, total = STEPS.length;
    var s = U.serviceById(state.service) || services[0];

    root.innerHTML =
      '<div class="wiz">' +
        '<div class="wiz__bar" role="progressbar" aria-valuemin="1" aria-valuemax="' + total +
          '" aria-valuenow="' + n + '" aria-label="Step ' + n + ' of ' + total + '">' +
          STEPS.map(function (st, i) {
            return '<span class="wiz__seg' + (i < n ? ' is-done' : '') + '"></span>';
          }).join('') +
        '</div>' +
        '<p class="wiz__count">Step ' + n + ' of ' + total +
          (state.step > 0 ? ' · <span class="muted">' + esc(s.name) + '</span>' : '') +
        '</p>' +
        '<h2 class="wiz__title">' + esc(step.title) + '</h2>' +
        '<div class="wiz__body">' + step.render() + '</div>' +
        '<div id="wiz-status" class="form-status form-status--err" role="alert" hidden></div>' +
        '<div class="wiz__nav">' +
          (state.step > 0
            ? '<button type="button" class="btn btn--ghost" data-act="back">Back</button>'
            : '<span></span>') +
          '<button type="button" class="btn btn--primary" data-act="next">' +
            (state.step === total - 1 ? 'Send it over' : 'Next') +
          '</button>' +
        '</div>' +
      '</div>';

    if (state.step === total - 1) { mountTurnstile(); }
    var firstField = root.querySelector('input:not([type=hidden]):not([tabindex="-1"]), select, textarea');
    if (firstField && state.step > 0) { firstField.focus({ preventScroll: true }); }
  }

  function mountTurnstile() {
    if (!D.turnstileSiteKey) { return; }
    var holder = root.querySelector('#turnstile-holder');
    if (!holder) { return; }
    holder.innerHTML = '<div class="cf-turnstile" data-sitekey="' + esc(D.turnstileSiteKey) +
                       '" data-theme="light" data-action="quote"></div>';
    if (window.turnstile) { window.turnstile.render(holder.firstChild); return; }
    if (document.getElementById('cf-turnstile-script')) { return; }
    var sc = document.createElement('script');
    sc.id = 'cf-turnstile-script';
    sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    sc.async = true; sc.defer = true;
    document.head.appendChild(sc);
  }

  /* ---------------------------------------------------------------- submit */
  function payload() {
    var s = U.serviceById(state.service) || services[0];
    var sizeLabel = '';
    s.sizes.forEach(function (z) { if (z.id === state.size) { sizeLabel = z.label; } });
    var freqLabel = 'One time';
    D.frequencies.forEach(function (f) { if (f.id === state.frequency) { freqLabel = f.label; } });
    return {
      name: state.name, phone: state.phone, email: state.email,
      bestTime: state.bestTime, contactPref: state.contactPref,
      service: s.id, serviceLabel: s.name,
      property: state.property, sizeLabel: sizeLabel,
      bedrooms: state.bedrooms, bathrooms: state.bathrooms,
      frequencyLabel: s.recurring ? freqLabel : 'One time',
      firstVisit: state.firstVisit !== false,
      addOnLabels: labelsFor(D.addOns, state.addOns),
      conditionLabels: labelsFor(D.conditions, state.conditions),
      notes: state.notes,
      city: state.city, zip: state.zip, address: state.address,
      startWhen: state.startWhen, preferredDays: state.preferredDays || [],
      access: state.access,
      company: state.company,
      pageUrl: window.location.href
    };
  }

  function mailtoFallback(b) {
    var lines = [
      'Name: ' + b.name, 'Phone: ' + b.phone, 'Email: ' + b.email, '',
      'Service: ' + b.serviceLabel, 'Property: ' + b.property, 'Size: ' + b.sizeLabel,
      'Frequency: ' + b.frequencyLabel, 'Add-ons: ' + (b.addOnLabels.join(', ') || 'none'),
      'City: ' + b.city, 'ZIP: ' + b.zip, 'Start: ' + b.startWhen, '',
      'Notes:', b.notes || '(none)'
    ];
    return 'mailto:' + D.business.email +
           '?subject=' + encodeURIComponent('Quote request — ' + b.serviceLabel) +
           '&body=' + encodeURIComponent(lines.join('\n'));
  }

  function submit(btn) {
    var body = payload();
    if (body.company) { return; }

    if (D.turnstileSiteKey) {
      var token = root.querySelector('[name="cf-turnstile-response"]');
      if (!token || !token.value) {
        say('Please complete the “I am human” check, then send again.');
        return;
      }
      body.turnstileToken = token.value;
    }

    var label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Sending…';

    fetch('/api/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (!res.ok) { throw new Error(j.error || 'The server did not accept it.'); }
        state.leadId = j.id || null;
        done(body);
      });
    }).catch(function (err) {
      btn.disabled = false; btn.textContent = label;
      say('Sorry — that did not send. ' + esc(err.message) +
          ' You can <a href="' + mailtoFallback(body) + '">email it instead</a>, or call ' +
          '<a href="' + U.telHref(D.business.phone) + '">' + esc(D.business.phone) + '</a>.');
    });
  }

  /* ------------------------------------------------------- the last screen
     Someone who just filled in six steps is the warmest they will ever be.
     Calling now is the fastest path to a booked job, so it is the first
     thing on the screen rather than a line of small print at the bottom. */
  function done(body) {
    var first = (body.name || '').split(' ')[0].replace(/[^A-Za-z'-]/g, '');
    root.innerHTML =
      '<div class="wiz wiz--done">' +
        '<span class="wiz__tick" aria-hidden="true">' + U.icon('check') + '</span>' +
        '<h2 class="wiz__title">' + (first ? 'Thanks, ' + esc(first) + '.' : 'Got it.') + '</h2>' +
        '<p class="step-lead">Kristina has your details and will come back with a real ' +
          'number — usually the same day, always within one business day.</p>' +

        '<div class="callnow">' +
          '<p class="callnow__k">In a hurry? She picks up.</p>' +
          '<a class="btn btn--primary callnow__btn" href="' + U.telHref(D.business.phone) + '" ' +
            'data-cta="done-call">' + U.icon('phone') + 'Call now &middot; ' + esc(D.business.phone) + '</a>' +
          (D.business.textingEnabled
            ? '<a class="btn btn--ghost callnow__alt" href="' + U.smsHref(D.business.phone) + '">' +
              'Send a text instead</a>'
            : '') +
        '</div>' +

        '<div class="followup">' +
          '<p class="eyebrow">Or have her come to you</p>' +
          '<div class="followup__row">' +
            '<button type="button" class="btn btn--ghost" data-follow="call">Ask her to call me</button>' +
            '<button type="button" class="btn btn--ghost" data-follow="visit">Book a walkthrough</button>' +
          '</div>' +
          '<p class="hint">A walkthrough takes about fifteen minutes and turns the estimate into ' +
            'a fixed price. No charge either way.</p>' +
          '<p class="followup__done" hidden></p>' +
        '</div>' +
      '</div>';

    // The page heading still reads like an invitation to fill in the form that
    // has just been filled in. Retitle it so the whole screen says the same thing.
    var head = document.querySelector('.pagehead');
    if (head) {
      var eyebrow = head.querySelector('.eyebrow');
      var h1 = head.querySelector('h1');
      var lead = head.querySelector('p:not(.eyebrow)');
      if (eyebrow) { eyebrow.textContent = 'Sent'; }
      if (h1) { h1.textContent = 'That is everything she needs'; }
      if (lead) {
        lead.textContent = 'Nothing else to do — a real number is on its way. ' +
          'If you would rather talk it through now, her line is below.';
      }
    }
    document.title = 'Request sent \u00b7 Oasis Coastal Cleaning';

    // The privacy note under the form was addressed to someone still typing.
    var note = document.querySelector('#quote-wizard');
    note = note && note.parentNode ? note.parentNode.querySelector('.hint.muted') : null;
    if (note) { note.hidden = true; }

    window.scrollTo(0, 0);
  }

  function requestFollowUp(kind, btn) {
    var row = root.querySelector('.followup__row');
    var out = root.querySelector('.followup__done');
    if (!state.leadId) {
      // Nothing was stored, so there is no lead to attach this to — send them
      // straight to the phone rather than pretending it was noted.
      window.location.href = kind === 'call'
        ? U.telHref(D.business.phone) : U.smsHref(D.business.phone);
      return;
    }
    btn.disabled = true;
    fetch('/api/followup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: state.leadId, kind: kind })
    }).then(function () {
      if (row) { row.hidden = true; }
      if (out) {
        out.hidden = false;
        out.textContent = kind === 'call'
          ? 'Noted — she will call you at the number you gave.'
          : 'Noted — she will be in touch to arrange a walkthrough.';
      }
    }).catch(function () {
      btn.disabled = false;
      if (out) {
        out.hidden = false;
        out.textContent = 'That did not go through, but your request did. Call ' +
                          D.business.phone + ' and she will sort it out.';
      }
    });
  }

  /* ----------------------------------------------------------------- wiring */
  root.addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) { return; }

    if (btn.dataset.follow) { requestFollowUp(btn.dataset.follow, btn); return; }

    var act = btn.dataset.act;
    if (act === 'back') {
      collect(); hush();
      state.step = Math.max(0, state.step - 1);
      render(); window.scrollTo(0, 0);
      return;
    }
    if (act === 'next') {
      hush();
      var step = STEPS[state.step];
      if (step.validate && !step.validate()) { return; }
      collect();
      if (state.step === STEPS.length - 1) { submit(btn); return; }
      state.step += 1;
      render(); window.scrollTo(0, 0);
    }
  });

  // Changing the service mid-flow invalidates the size chosen for the old one.
  root.addEventListener('change', function (e) {
    if (e.target.name === 'service') {
      state.service = e.target.value;
      state.size = null;
    }
    if (e.target.getAttribute && e.target.getAttribute('aria-invalid')) {
      e.target.removeAttribute('aria-invalid');
      hush();
    }
  });

  var params = new URLSearchParams(window.location.search);
  var pre = params.get('service');
  if (services.some(function (s) { return s.id === pre; })) { state.service = pre; }

  render();
})();
