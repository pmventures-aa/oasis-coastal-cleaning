/* ==========================================================================
   Oasis Coastal Cleaning — shared site script
   Renders the header, footer, sticky bar and every data-driven list from
   js/data.js. Pages mark where things go with data-render="name".
   No build step, no dependencies.
   ========================================================================== */
(function () {
  'use strict';

  var D = window.OASIS;
  if (!D) { return; }

  /* ------------------------------------------------------------- helpers */
  var esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  var telHref = function (n) { return 'tel:+1' + String(n).replace(/\D/g, ''); };
  var smsHref = function (n) { return 'sms:+1' + String(n).replace(/\D/g, ''); };

  var money = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };

  var activeServices = function () {
    return D.services.filter(function (s) { return s.active; });
  };
  var serviceById = function (id) {
    for (var i = 0; i < D.services.length; i++) { if (D.services[i].id === id) { return D.services[i]; } }
    return null;
  };
  var activeFrequencies = function () {
    return D.frequencies.filter(function (f) { return f.active; });
  };
  var allCities = function () {
    return D.areas.reduce(function (acc, a) { return acc.concat(a.cities); }, []);
  };

  /* Cloudflare Pages serves foo.html at /foo, so both forms must compare
     equal or the current page is never marked in the navigation. */
  var normalise = function (p) {
    if (!p || p === '/' || /\/index(\.html)?$/.test(p)) { return '/'; }
    return p.replace(/\.html$/, '').replace(/\/$/, '');
  };

  var currentPath = function () { return normalise(window.location.pathname); };

  var isCurrent = function (href) { return currentPath() === normalise(href); };

  /* --------------------------------------------------------------- icons */
  var ICONS = {
    home:    '<path d="M3 11.2 12 4l9 7.2"/><path d="M5.6 9.6V20h12.8V9.6"/><path d="M10 20v-5.2h4V20"/>',
    office:  '<rect x="3.5" y="4" width="10" height="16" rx="1"/><path d="M13.5 9H20a.5.5 0 0 1 .5.5V20"/><path d="M6.5 8h4M6.5 12h4M6.5 16h4M16 13h2M16 17h2"/>',
    organizing: '<rect x="3.5" y="4" width="17" height="6" rx="1"/><rect x="3.5" y="14" width="17" height="6" rx="1"/><path d="M9 7h6M9 17h6"/>',
    laundry: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="14" r="4"/><path d="M8 6.5h.01M11 6.5h.01"/>',
    phone:   '<path d="M6.2 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6.3 6.3l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.2 5.7 2 2 0 0 1 6.2 3.5Z"/>',
    text:    '<path d="M20.5 12.4c0 4-3.8 7.2-8.5 7.2a10 10 0 0 1-2.6-.34L4 21l1.5-3.7A6.9 6.9 0 0 1 3.5 12.4c0-4 3.8-7.2 8.5-7.2s8.5 3.2 8.5 7.2Z"/>',
    mail:    '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.6 6.5 8.4 6 8.4-6"/>',
    calendar:'<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3.5v3M16 3.5v3"/>',
    shield:  '<path d="M12 3.2 5 6v5.4c0 4.2 2.9 7.6 7 9.4 4.1-1.8 7-5.2 7-9.4V6Z"/><path d="m9 12 2.2 2.2L15.4 10"/>',
    star:    '<path d="m12 4 2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4-3.9 5.6-.8Z"/>',
    pin:     '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
    clock:   '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.2V12l3.2 2"/>',
    check:   '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    menu:    '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close:   '<path d="M6 6l12 12M18 6 6 18"/>'
  };

  var icon = function (name, cls) {
    var body = ICONS[name] || ICONS.check;
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
           'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  };

  /* -------------------------------------------------------------- chrome */
  function renderHeader(el) {
    var links = D.nav.map(function (n) {
      return '<a href="' + esc(n.href) + '"' + (isCurrent(n.href) ? ' aria-current="page"' : '') + '>' +
             esc(n.label) + '</a>';
    }).join('');

    el.innerHTML =
      '<a class="skip-link" href="#main">Skip to content</a>' +
      '<header class="topbar">' +
        '<div class="topbar__inner">' +
          '<a class="topbar__brand" href="/" aria-label="' + esc(D.business.name) + ' — home">' +
            '<img src="/logo/logo-260.webp" width="260" height="260" alt="' + esc(D.business.name) + '">' +
          '</a>' +
          '<nav class="nav" aria-label="Main">' + links + '</nav>' +
          '<a class="btn btn--primary topbar__cta" href="/quote.html">Get a Quote</a>' +
          '<button class="navtoggle" type="button" aria-expanded="false" aria-controls="drawer" ' +
            'aria-label="Open menu">' + icon('menu') + '</button>' +
        '</div>' +
        '<div class="drawer" id="drawer">' + links +
          '<a class="btn btn--primary" href="/quote.html">Get a Quote</a>' +
        '</div>' +
      '</header>';

    var toggle = el.querySelector('.navtoggle');
    var drawer = el.querySelector('#drawer');
    toggle.addEventListener('click', function () {
      var open = drawer.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      toggle.innerHTML = icon(open ? 'close' : 'menu');
    });
  }

  function renderFooter(el) {
    var b = D.business;

    // One band, not five columns. A footer on a lead site exists to catch
    // someone who scrolled past the buttons — it needs a way to call and a
    // way back into the pages, and very little else.
    var links = D.nav.filter(function (n) { return n.href !== '/'; })
      .map(function (n) {
        return '<a href="' + esc(n.href) + '">' + esc(n.label) + '</a>';
      }).join('');

    var hours = b.hours.map(function (h) {
      return esc(h.days) + ' ' + esc(h.time);
    }).join(' &nbsp;·&nbsp; ');

    var social = Object.keys(b.social || {}).filter(function (k) { return b.social[k]; })
      .map(function (k) {
        return '<a href="' + esc(b.social[k]) + '" rel="noopener">' +
               k.charAt(0).toUpperCase() + k.slice(1) + '</a>';
      }).join('');

    el.innerHTML =
      '<footer class="footer">' +
        '<div class="wrap footer__top">' +
          '<a class="footer__brand" href="/">' +
            '<img src="/logo/logo-260.webp" width="260" height="260" alt="' + esc(b.name) + '" loading="lazy">' +
            '<span class="footer__tag">' + esc(b.tagline) + '</span>' +
          '</a>' +
          '<nav class="footer__links" aria-label="Footer">' + links + social + '</nav>' +
          '<div class="footer__reach">' +
            '<a class="btn btn--primary" href="/quote.html">Get a quote</a>' +
            '<a class="footer__phone" href="' + telHref(b.phone) + '">' + esc(b.phone) + '</a>' +
            '<a href="mailto:' + esc(b.email) + '">' + esc(b.email) + '</a>' +
          '</div>' +
        '</div>' +
        '<div class="wrap footer__legal">' +
          '<span>' + hours + '</span>' +
          '<span>&copy; ' + new Date().getFullYear() + ' ' + esc(b.legalName) +
            (b.licenseNote ? ' &middot; ' + esc(b.licenseNote) : '') +
            ' &middot; ' + esc(D.footerNote) + '</span>' +
        '</div>' +
      '</footer>';
  }

  function renderStickyBar(el) {
    var b = D.business;
    var items = [
      '<a href="' + telHref(b.phone) + '" data-cta="sticky-call">' + icon('phone') + 'Call</a>'
    ];
    if (b.textingEnabled) {
      items.push('<a href="' + smsHref(b.phone) + '" data-cta="sticky-text">' + icon('text') + 'Text</a>');
    }
    items.push('<a class="is-primary" href="/quote.html" data-cta="sticky-quote">' + icon('calendar') + 'Quote</a>');

    el.innerHTML = '<nav class="stickybar' + (items.length === 2 ? ' stickybar--two' : '') +
                   '" aria-label="Contact">' + items.join('') + '</nav>';
  }

  /* ------------------------------------------------------------ sections */
  function renderServiceCards(el) {
    var limit = parseInt(el.getAttribute('data-limit'), 10);
    var list = activeServices();
    if (limit > 0) { list = list.slice(0, limit); }
    el.className = 'grid grid--' + (list.length === 4 ? '4' : (list.length === 2 ? '2' : '3'));
    el.innerHTML = list.map(function (s) {
      return '<a class="card card--link service-card" href="/services.html#' + esc(s.id) + '">' +
               '<span class="icon-badge">' + icon(s.icon) + '</span>' +
               '<h3>' + esc(s.name) + '</h3>' +
               '<p>' + esc(s.short) + '</p>' +
               '<span class="price">Get a quote &rarr;</span>' +
             '</a>';
    }).join('');
  }

  function renderServiceDetails(el) {
    el.innerHTML = activeServices().map(function (s, i) {
      return '<article class="card" id="' + esc(s.id) + '" style="margin-bottom:clamp(1.25rem,3vw,2rem)">' +
               '<div class="grid grid--2" style="align-items:start">' +
                 '<div>' +
                   '<span class="icon-badge">' + icon(s.icon) + '</span>' +
                   '<h2 style="font-size:var(--step-1);margin:0 0 .75rem">' + esc(s.name) + '</h2>' +
                   '<p class="muted">' + esc(s.blurb) + '</p>' +
                   '<a class="btn btn--primary" href="/quote.html?service=' + esc(s.id) + '">' +
                     esc(i % 2 === 0 ? 'Get a quote for this' : 'Ask about this') + '</a>' +
                 '</div>' +
                 '<details class="incl">' +
                   '<summary>What is included</summary>' +
                   '<ul class="checklist">' +
                     s.includes.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') +
                   '</ul>' +
                 '</details>' +
               '</div>' +
             '</article>';
    }).join('');
  }

  function renderServiceNav(el) {
    el.innerHTML = activeServices().map(function (s) {
      return '<a class="btn btn--ghost" href="#' + esc(s.id) + '" style="padding:.55em 1.2em">' +
             esc(s.name) + '</a>';
    }).join(' ');
  }

  function renderPromises(el) {
    el.className = 'grid grid--3';
    el.innerHTML = D.promises.map(function (p) {
      return '<div class="promise">' +
               '<span class="icon-badge" style="background:rgba(200,156,83,.18);color:var(--oasis-gold)">' +
                 icon('shield') + '</span>' +
               '<h3>' + esc(p.title) + '</h3><p>' + esc(p.body) + '</p>' +
             '</div>';
    }).join('');
  }

  function renderSteps(el) {
    el.className = 'grid grid--4';
    el.innerHTML = D.steps.map(function (s, i) {
      return '<div class="step">' +
               '<span class="step__n">0' + (i + 1) + '</span>' +
               '<h3>' + esc(s.title) + '</h3><p>' + esc(s.body) + '</p>' +
             '</div>';
    }).join('');
  }

  function renderPricingTable(el) {
    var rows = activeServices().map(function (s) {
      return '<tr>' +
               '<td>' + esc(s.name) + '</td>' +
               '<td class="muted">' + esc(s.short) + '</td>' +
               '<td class="muted">' + esc(s.recurring ? 'Weekly, biweekly, monthly or one time' : 'By the job') + '</td>' +
             '</tr>';
    }).join('');
    el.innerHTML =
      '<div class="table-scroll"><table class="pricetable">' +
        '<thead><tr><th>Service</th><th>What it covers</th><th>How it is scheduled</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>';
  }

  function renderFrequencies(el) {
    var list = activeFrequencies();
    el.className = 'grid grid--' + (list.length === 4 ? '4' : '3');
    el.innerHTML = list.map(function (f) {
      return '<div class="card freq-card">' +
               '<h3>' + esc(f.label) + '</h3>' +
               '<p>' + esc(f.note) + '</p>' +
             '</div>';
    }).join('');
  }

  function renderExtras(el) {
    var groups = [];
    D.addOns.forEach(function (x) {
      var g = null;
      groups.forEach(function (row) { if (row.name === x.group) { g = row; } });
      if (!g) { g = { name: x.group, items: [] }; groups.push(g); }
      g.items.push(x);
    });
    el.innerHTML = groups.map(function (g) {
      return '<div class="addon-group">' +
               '<p class="addon-group__name">' + esc(g.name) + '</p>' +
               '<ul class="pricelist">' +
                 g.items.map(function (x) {
                   // The note runs on from the label rather than sitting under it.
                   // Fourteen of these stacked two-high was the tallest block on
                   // the page, and the notes are short enough to read in line.
                   return '<li><span>' + esc(x.label) +
                          (x.note ? ' <small>&middot; ' + esc(x.note) + '</small>' : '') +
                          '</span></li>';
                 }).join('') +
               '</ul>' +
             '</div>';
    }).join('') +
    '<p class="note" style="margin-top:1.5rem">' + esc(D.bundleNote) + '</p>';
  }

  function renderAreas(el) {
    el.className = 'stack';
    el.innerHTML = D.areas.map(function (a) {
      return '<section class="card area-card" id="' + esc(a.id) + '">' +
               '<span class="county">' + esc(a.county) + '</span>' +
               '<h3>' + esc(a.name) + '</h3>' +
               '<p>' + esc(a.note) + '</p>' +
               '<ul class="arealist">' +
                 a.cities.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') +
               '</ul>' +
             '</section>';
    }).join('');
  }

  function renderAreaSummary(el) {
    el.className = 'grid grid--4';
    el.innerHTML = D.areas.map(function (a) {
      return '<a class="card card--link area-card" href="/service-areas.html#' + esc(a.id) + '">' +
               '<span class="icon-badge" style="background:rgba(2,89,95,.1)">' + icon('pin') + '</span>' +
               '<h3>' + esc(a.name) + '</h3>' +
               '<p>' + esc(a.cities.slice(0, 4).join(', ')) +
                 (a.cities.length > 4 ? ' and ' + (a.cities.length - 4) + ' more' : '') + '</p>' +
             '</a>';
    }).join('');
  }

  function renderFaqs(el) {
    var limit = parseInt(el.getAttribute('data-limit'), 10);
    var list = limit > 0 ? D.faqs.slice(0, limit) : D.faqs;
    el.className = 'faq';
    el.innerHTML = list.map(function (f) {
      return '<details><summary>' + esc(f.q) + '</summary><p>' + esc(f.a) + '</p></details>';
    }).join('');
  }

  function renderTestimonials(el) {
    if (!D.testimonials.length) {
      // Nothing real to show yet — the whole section removes itself.
      var section = el.closest('section');
      if (section) { section.remove(); } else { el.remove(); }
      return;
    }
    el.className = 'grid grid--3';
    el.innerHTML = D.testimonials.map(function (t) {
      return '<figure class="card quote-card" style="margin:0">' +
               '<blockquote>' + esc(t.quote) + '</blockquote>' +
               '<figcaption><cite>' + esc(t.name) +
                 '<span>' + esc([t.city, t.service].filter(Boolean).join(' &middot; ')) + '</span>' +
               '</cite></figcaption>' +
             '</figure>';
    }).join('');
  }

  function renderContactTiles(el) {
    var b = D.business;
    var tiles = [
      { href: telHref(b.phone), ic: 'phone', h: 'Call', p: 'Fastest answer during business hours.', s: b.phone }
    ];
    if (b.textingEnabled) {
      tiles.push({ href: smsHref(b.phone), ic: 'text', h: 'Text', p: 'Send photos of the space — it speeds up the quote.', s: b.phone });
    }
    tiles.push({ href: 'mailto:' + b.email, ic: 'mail', h: 'Email', p: 'Best for schedules, invoices and paperwork.', s: b.email });
    tiles.push({ href: '/quote.html', ic: 'calendar', h: 'Quote form', p: 'Two minutes, and you see a range before you send it.', s: 'Start now' });

    el.className = 'grid grid--4';
    el.innerHTML = tiles.map(function (t) {
      return '<a class="card card--link contact-tile" href="' + esc(t.href) + '">' +
               '<span class="icon-badge">' + icon(t.ic) + '</span>' +
               '<h3>' + esc(t.h) + '</h3><p>' + esc(t.p) + '</p>' +
               '<strong>' + esc(t.s) + '</strong>' +
             '</a>';
    }).join('');
  }

  function renderHours(el) {
    el.innerHTML = '<ul class="checklist">' + D.business.hours.map(function (h) {
      return '<li><strong>' + esc(h.days) + '</strong> — ' + esc(h.time) + '</li>';
    }).join('') + '</ul>';
  }

  function renderAbout(el) {
    var a = D.about;
    var body = a.story.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
    if (a.ownerNote) { body += '<p>' + esc(a.ownerNote) + '</p>'; }
    var photo = a.photo
      ? '<div class="about-photo"><img src="' + esc(a.photo) + '" alt="' + esc(a.photoAlt) + '"></div>'
      : '<div class="about-photo" style="display:grid;place-items:center;padding:2.5rem">' +
          '<img src="/logo/logo-480.webp" width="480" height="481" alt="' + esc(D.business.name) + '" style="max-width:260px">' +
        '</div>';
    el.innerHTML =
      '<div class="about-layout">' + photo +
        '<div class="about-body">' +
          '<h2>' + esc(a.heading) + '</h2>' +
          '<p class="lead">' + esc(a.lead) + '</p>' + body +
          '<p><a class="btn btn--primary" href="/quote.html">See what it would cost</a></p>' +
        '</div>' +
      '</div>';
  }

  function renderPhone(el) {
    var b = D.business;
    var kind = el.getAttribute('data-kind') || 'call';
    var href = kind === 'text' ? smsHref(b.phone) : telHref(b.phone);
    el.innerHTML = '<a href="' + href + '">' + esc(b.phone) + '</a>';
  }

  function renderTagline(el) { el.textContent = D.business.tagline; }

  /* -------------------------------------------- structured data for Google */
  function injectSchema() {
    var b = D.business;
    var graph = [{
      '@type': ['LocalBusiness', 'HomeAndConstructionBusiness'],
      '@id': b.domain + '/#business',
      name: b.name,
      description: 'Cleaning, organizing and laundry for homes and offices across Palm Beach and Broward County, Florida.',
      url: b.domain + '/',
      telephone: '+1' + String(b.phone).replace(/\D/g, ''),
      email: b.email,
      image: b.domain + '/social/og-1200x630.png',
      logo: b.domain + '/logo/logo-square-transparent.png',
      slogan: b.tagline,
      priceRange: '$$',
      founder: { '@type': 'Person', name: b.owner },
      address: { '@type': 'PostalAddress', addressLocality: b.baseCity, addressRegion: b.baseState, addressCountry: 'US' },
      openingHours: b.hoursSchema,
      areaServed: allCities().map(function (c) {
        return { '@type': 'City', name: c, containedInPlace: { '@type': 'State', name: 'Florida' } };
      }),
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: 'Cleaning services',
        itemListElement: activeServices().map(function (s) {
          return {
            '@type': 'Offer',
            itemOffered: { '@type': 'Service', name: s.name, description: s.short }
          };
        })
      }
    }];

    if (document.body.getAttribute('data-page') === 'faq') {
      graph.push({
        '@type': 'FAQPage',
        '@id': b.domain + '/faq.html#faq',
        mainEntity: D.faqs.map(function (f) {
          return { '@type': 'Question', name: f.q,
                   acceptedAnswer: { '@type': 'Answer', text: f.a } };
        })
      });
    }

    var tag = document.createElement('script');
    tag.type = 'application/ld+json';
    tag.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
    document.head.appendChild(tag);
  }

  /* ---------------------------------------------------------------- boot */
  var RENDERERS = {
    header: renderHeader,
    footer: renderFooter,
    stickybar: renderStickyBar,
    serviceCards: renderServiceCards,
    serviceDetails: renderServiceDetails,
    serviceNav: renderServiceNav,
    promises: renderPromises,
    steps: renderSteps,
    pricingTable: renderPricingTable,
    frequencies: renderFrequencies,
    extras: renderExtras,
    areas: renderAreas,
    areaSummary: renderAreaSummary,
    faqs: renderFaqs,
    testimonials: renderTestimonials,
    contactTiles: renderContactTiles,
    hours: renderHours,
    about: renderAbout,
    phone: renderPhone,
    tagline: renderTagline
  };

  /* Collapsible detail is for narrow screens. Once both columns fit there is
     room to show everything, so the panels open and stop being buttons. Driven
     from JS rather than CSS because a closed <details> cannot be reopened by a
     stylesheet, and with JS off every panel simply stays open. */
  function syncDisclosures() {
    var panels = document.querySelectorAll('.incl');
    if (!panels.length) { return; }
    var wide = window.matchMedia('(min-width: 760px)');
    var apply = function () {
      for (var i = 0; i < panels.length; i++) {
        if (wide.matches) { panels[i].open = true; }
        else if (!panels[i].dataset.touched) { panels[i].open = false; }
      }
    };
    for (var j = 0; j < panels.length; j++) {
      panels[j].addEventListener('toggle', function () {
        if (!wide.matches) { this.dataset.touched = '1'; }
      });
    }
    apply();
    if (wide.addEventListener) { wide.addEventListener('change', apply); }
    else { wide.addListener(apply); }
  }

  function boot() {
    var nodes = document.querySelectorAll('[data-render]');
    for (var i = 0; i < nodes.length; i++) {
      var fn = RENDERERS[nodes[i].getAttribute('data-render')];
      if (fn) { fn(nodes[i]); }
    }
    var marks = document.querySelectorAll('[data-icon]');
    for (var j = 0; j < marks.length; j++) {
      marks[j].insertAdjacentHTML('afterbegin', icon(marks[j].getAttribute('data-icon')));
    }

    // The sticky elements below the header need to know how tall it is.
    var bar = document.querySelector('.topbar');
    if (bar) {
      var setBarHeight = function () {
        document.documentElement.style.setProperty('--topbar-h', bar.offsetHeight + 'px');
      };
      setBarHeight();
      window.addEventListener('resize', setBarHeight);
    }

    syncDisclosures();

    injectSchema();

    if (/555-01\d\d/.test(D.business.phone)) {
      console.warn('[Oasis] The phone number in js/data.js is still the placeholder. ' +
                   'Set business.phone before this site goes live.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* shared with quote.js */
  window.OASIS_UTIL = {
    esc: esc, money: money, icon: icon, telHref: telHref, smsHref: smsHref,
    activeServices: activeServices, serviceById: serviceById,
    activeFrequencies: activeFrequencies, allCities: allCities
  };
})();
