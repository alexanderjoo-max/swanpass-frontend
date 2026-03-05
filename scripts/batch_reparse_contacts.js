#!/usr/bin/env node
/**
 * batch_reparse_contacts.js
 * Re-parse all cached HTML to extract contacts missed by the original crawler.
 * Specifically targets <li><i class="fa fa-telegram"> and fa-weixin sidebar entries.
 * Only fills NULL fields — never overwrites existing data.
 */
const fs = require('fs');
const path = require('path');
const { load } = require('cheerio');

const CACHE_DIR = path.join(__dirname, '..', '.cache');
const DATA_FILE = path.join(__dirname, '..', 'data', 'listings.json');

const listings = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));

// Build slug → listing index map
const slugMap = {};
listings.forEach((l, i) => { slugMap[l.slug] = i; });

// Map cache filename back to slug
function cacheFileToSlug(filename) {
  // e.g. https___swanpass_com_listing_drake_luxury_lounge_bangkok.html
  const m = filename.match(/https___swanpass_com_listing_(.+)\.html$/);
  if (!m) return null;
  return m[1].replace(/_/g, '-');
}

function extractSidebarContacts($) {
  const found = {};

  $('.utf_listing_detail_sidebar li').each((_, el) => {
    const html = $(el).html() || '';
    const text = $(el).text().trim();

    // Telegram
    if (html.includes('fa-telegram') && text && !found.telegram) {
      const clean = text.replace(/\s+/g, ' ').trim();
      if (clean.startsWith('http')) {
        found.telegram = clean;
      } else if (clean.startsWith('@') || /^[a-zA-Z0-9_+]+$/.test(clean)) {
        found.telegram = 'https://t.me/' + clean.replace(/^@/, '');
      } else if (clean.includes('t.me/')) {
        const m = clean.match(/t\.me\/\S+/);
        if (m) found.telegram = 'https://' + m[0];
      }
    }

    // WeChat
    if (html.includes('fa-weixin') && text && !found.wechat) {
      found.wechat = text.replace(/\s+/g, ' ').trim();
    }

    // LINE (text-based, as fallback if no anchor)
    if ((html.includes('fa-line') || html.includes('fa-brands fa-line')) && text && !found.line) {
      const clean = text.replace(/\s+/g, ' ').trim();
      if (clean.startsWith('http')) found.line = clean;
    }
  });

  // Also check anchor tags for telegram (some pages use <a href="t.me/...">)
  if (!found.telegram) {
    $('a[href*="t.me/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      // Skip share buttons
      if (!href.includes('swanpass.com') && !found.telegram) {
        found.telegram = href.startsWith('http') ? href : 'https://' + href;
      }
    });
  }

  return found;
}

let processed = 0, updated = 0;
const fieldCounts = {};

const cacheFiles = fs.readdirSync(CACHE_DIR)
  .filter(f => f.match(/^https___swanpass_com_listing_[a-z0-9].*\.html$/));

console.log(`Processing ${cacheFiles.length} cached listing pages...`);

for (const filename of cacheFiles) {
  const slug = cacheFileToSlug(filename);
  if (!slug) continue;

  const idx = slugMap[slug];
  if (idx === undefined) continue;

  processed++;
  const html = fs.readFileSync(path.join(CACHE_DIR, filename), 'utf-8');
  const $ = load(html);
  const found = extractSidebarContacts($);

  const listing = listings[idx];
  if (!listing.contacts) listing.contacts = {};

  let changed = false;
  for (const [key, val] of Object.entries(found)) {
    if (val && !listing.contacts[key]) {
      listing.contacts[key] = val;
      fieldCounts[key] = (fieldCounts[key] || 0) + 1;
      changed = true;
    }
  }
  if (changed) updated++;
}

fs.writeFileSync(DATA_FILE, JSON.stringify(listings, null, 2));

console.log(`\n=== Results ===`);
console.log(`Processed: ${processed} listings`);
console.log(`Updated:   ${updated} listings`);
console.log(`New fields by type:`);
for (const [k, v] of Object.entries(fieldCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}
