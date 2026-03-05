#!/usr/bin/env node
/**
 * Add favicon link tags + search clear button to all standalone pages
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const files = [
  'index.html', 'listings.html', 'cities.html', 'profile.html',
  'map.html', 'deals.html', 'search.html', 'best-places.html',
  'add-listing.html', 'login.html', 'admin.html',
  'city-bangkok.html', 'city-pattaya.html', 'city-chiangmai.html',
  'city-phuket.html', 'city-huahin.html', 'city-bali.html', 'city-hcmc.html',
  '_listing-template.html',
];

const FAVICON_TAGS = `<link rel="icon" href="images/favicon.ico" type="image/x-icon">\n<link rel="apple-touch-icon" href="images/apple-touch-icon.png">`;

const CLEAR_BTN = `<button class="search-clear" aria-label="Clear search" onclick="event.stopPropagation();var i=this.previousElementSibling;i.value='';i.focus();this.classList.remove('visible')">✕</button>`;

let updated = 0;
files.forEach(f => {
  const fp = path.join(ROOT, f);
  if (!fs.existsSync(fp)) return;
  let html = fs.readFileSync(fp, 'utf-8');
  const orig = html;

  // 1. Add favicon if not present
  if (!html.includes('favicon.ico')) {
    // Insert before </head>
    html = html.replace('</head>', `${FAVICON_TAGS}\n</head>`);
  }

  // 2. Add search clear button to header search inputs
  // Pattern: the header search input without the clear button
  if (!html.includes('search-clear') && html.includes('header-search')) {
    // Add oninput handler and clear button after the header search input
    html = html.replace(
      /(<input type="text" placeholder="Search shops, cities\.\.\."[^>]*)(>)\s*\n(\s*<\/div>)/g,
      (match, inputStart, inputEnd, closingDiv) => {
        // Add oninput if not present
        let newInput = inputStart;
        if (!newInput.includes('oninput')) {
          newInput = newInput.replace(
            'onkeydown=',
            `oninput="this.nextElementSibling.classList.toggle('visible',this.value.length>0)" onkeydown=`
          );
        }
        return `${newInput}${inputEnd}\n      ${CLEAR_BTN}\n${closingDiv}`;
      }
    );
  }

  if (html !== orig) {
    fs.writeFileSync(fp, html);
    updated++;
    console.log(`  Updated: ${f}`);
  }
});

console.log(`\nDone. Updated ${updated} files.`);
