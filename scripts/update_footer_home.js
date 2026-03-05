#!/usr/bin/env node
/**
 * Remove "Home" link from footer across all standalone pages
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const files = [
  'index.html', 'listings.html', 'cities.html', 'profile.html',
  'deals.html', 'search.html', 'best-places.html',
  'add-listing.html', 'login.html', 'admin.html',
  'city-bangkok.html', 'city-pattaya.html', 'city-chiangmai.html',
  'city-phuket.html', 'city-huahin.html', 'city-bali.html', 'city-hcmc.html',
];

let updated = 0;
files.forEach(f => {
  const fp = path.join(ROOT, f);
  if (!fs.existsSync(fp)) return;
  let html = fs.readFileSync(fp, 'utf-8');
  const orig = html;

  // Remove Home from footer links (various patterns)
  html = html.replace(/\s*<a href="index\.html">Home<\/a>\n?/g, '\n');

  if (html !== orig) {
    fs.writeFileSync(fp, html);
    updated++;
    console.log(`  Updated: ${f}`);
  }
});

console.log(`\nDone. Updated ${updated} files.`);
