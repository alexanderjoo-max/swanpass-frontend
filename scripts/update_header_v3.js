#!/usr/bin/env node
/**
 * update_header_v3.js
 * Updates all standalone pages with new header structure:
 * 1. Remove Register button
 * 2. Remove flex spacer
 * 3. Wrap logo in .header-logo-wrap for centering on mobile
 * 4. Add .header-nav with inline nav links (for desktop)
 * 5. Update nav script to highlight both .nav-tab and .header-nav links
 *
 * NOTE: index.html is excluded (already updated manually)
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const files = [
  'listings.html', 'cities.html', 'profile.html',
  'map.html', 'deals.html', 'search.html', 'best-places.html',
  'add-listing.html', 'login.html', 'admin.html',
  'city-bangkok.html', 'city-pattaya.html', 'city-chiangmai.html',
  'city-phuket.html', 'city-huahin.html', 'city-bali.html', 'city-hcmc.html',
  '_listing-template.html'
];

const HEADER_NAV = `<div class="header-nav">
      <a href="map.html">\u{1F5FA}\uFE0F Map</a>
      <a href="deals.html">\u{1F3F7}\uFE0F Deals</a>
      <a href="best-places.html">\u{1F3C6} Best Places</a>
      <a href="cities.html">\u{1F4CD} Cities</a>
      <a href="search.html">\u{1F50E} Search</a>
      <a href="add-listing.html">\u2795 List Your Business</a>
    </div>`;

const NEW_SCRIPT = `<script>
(function(){
  var page = location.pathname.split('/').pop() || 'index.html';
  var tabs = document.querySelectorAll('.nav-tab');
  for (var i = 0; i < tabs.length; i++) {
    var href = tabs[i].getAttribute('href');
    if (href === page || (page === '' && href === 'index.html')) tabs[i].classList.add('active');
    if (page.indexOf('city-') === 0 && href === 'cities.html') tabs[i].classList.add('active');
    if (page.indexOf('listing-') === 0 && href === 'search.html') tabs[i].classList.add('active');
  }
  var hLinks = document.querySelectorAll('.header-nav a');
  for (var j = 0; j < hLinks.length; j++) {
    var h = hLinks[j].getAttribute('href');
    if (h === page || (page === '' && h === 'index.html')) hLinks[j].classList.add('active');
    if (page.indexOf('city-') === 0 && h === 'cities.html') hLinks[j].classList.add('active');
    if (page.indexOf('listing-') === 0 && h === 'search.html') hLinks[j].classList.add('active');
  }
  var nav = document.querySelector('.nav-tabs');
  var btn = document.querySelector('.btn-hamburger');
  tabs.forEach(function(t){
    t.addEventListener('click', function(){
      nav.classList.remove('open');
      if(btn) btn.textContent = '\\u2630';
    });
  });
})();
</script>`;

let updated = 0;

files.forEach(f => {
  const fp = path.join(ROOT, f);
  if (!fs.existsSync(fp)) {
    console.log(`  SKIP: ${f} (not found)`);
    return;
  }
  let html = fs.readFileSync(fp, 'utf-8');
  const orig = html;

  // 1. Remove Register button
  html = html.replace(/\s*<button class="btn-register"[^>]*>Register<\/button>/g, '');

  // 2. Remove flex spacer
  html = html.replace(/\s*<div style="flex:1"><\/div>/g, '');

  // 3. Wrap logo in .header-logo-wrap (if not already wrapped)
  if (!html.includes('header-logo-wrap')) {
    html = html.replace(
      /(\s*)(<a href="index\.html"><img src="\.\/swanpass_logo_rev\.png" alt="Swanpass" class="logo-img"><\/a>)/,
      `$1<div class="header-logo-wrap">$2</div>`
    );
  }

  // 4. Add .header-nav before Login button (if not already present)
  if (!html.includes('header-nav')) {
    html = html.replace(
      /(\s*)(<button class="btn-login")/,
      `\n    ${HEADER_NAV}\n$1$2`
    );
  }

  // 5. Replace the old nav script with new one
  html = html.replace(
    /<script>\s*\(function\(\)\{[\s\S]*?var page = location\.pathname[\s\S]*?\}\)\(\);\s*<\/script>/,
    NEW_SCRIPT
  );

  if (html !== orig) {
    fs.writeFileSync(fp, html);
    updated++;
    console.log(`  Updated: ${f}`);
  } else {
    console.log(`  No changes: ${f}`);
  }
});

console.log(`\nDone. Updated ${updated}/${files.length} files.`);
