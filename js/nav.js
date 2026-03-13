/**
 * nav.js — Shared navigation active-state detection + hamburger toggle
 * Extracted from inline <script> blocks duplicated on 1,180+ pages.
 *
 * Usage: include <script src="js/nav.js"></script> after the header/nav HTML.
 * Expects: .nav-tab links, .header-nav a links, .btn-hamburger, .nav-tabs overlay
 */
(function() {
  var page = location.pathname.split('/').pop() || 'index.html';

  // Highlight active nav-tab (mobile drawer)
  var tabs = document.querySelectorAll('.nav-tab');
  for (var i = 0; i < tabs.length; i++) {
    var href = tabs[i].getAttribute('href');
    // Strip relative path prefix (e.g. ../../../)
    var h = href ? href.replace(/^(\.\.\/)+/, '') : '';
    if (h === page || (page === '' && h === 'index.html')) tabs[i].classList.add('active');
    if (page.indexOf('city-') === 0 && h === 'cities.html') tabs[i].classList.add('active');
    if (page.indexOf('listing-') === 0 && h === 'search.html') tabs[i].classList.add('active');
  }

  // Highlight active header-nav link (desktop)
  var hLinks = document.querySelectorAll('.header-nav a');
  for (var j = 0; j < hLinks.length; j++) {
    var hh = hLinks[j].getAttribute('href');
    var h2 = hh ? hh.replace(/^(\.\.\/)+/, '') : '';
    if (h2 === page || (page === '' && h2 === 'index.html')) hLinks[j].classList.add('active');
    if (page.indexOf('city-') === 0 && h2 === 'cities.html') hLinks[j].classList.add('active');
    if (page.indexOf('listing-') === 0 && h2 === 'search.html') hLinks[j].classList.add('active');
  }

  // Close nav overlay when a nav-tab is clicked
  var nav = document.querySelector('.nav-tabs');
  var btn = document.querySelector('.btn-hamburger');
  tabs.forEach(function(t) {
    t.addEventListener('click', function() {
      if (nav) nav.classList.remove('open');
      if (btn) btn.textContent = '\u2630';
    });
  });
})();
