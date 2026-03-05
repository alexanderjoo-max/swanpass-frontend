#!/usr/bin/env node
/**
 * fix_baccara_photos.js
 *
 * Cleans up the Baccara listing in data/listings.json:
 *   - Removes garbage sidebar images scraped from other listings
 *   - Attempts to fetch real photos from the SwanPass API
 *   - Falls back to the 2 known real Baccara images
 *   - Assigns proper incremental IDs (90001, 90002, ...)
 *   - Fixes both the "photos" array and the "image_urls" array
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');

// ── Paths ──────────────────────────────────────────────────────────────
const DATA_DIR      = path.join(__dirname, '..', 'data');
const LISTINGS_FILE = path.join(DATA_DIR, 'listings.json');

// ── Known real Baccara images ──────────────────────────────────────────
const KNOWN_IMAGES = [
  {
    url: 'https://swanpass.com/wp-content/uploads/2023/03/DJCYez0VwAInQKv-640x427.jpg',
    category: 'featured',
    caption: 'Baccara Soi Cowboy — featured image',
    width: 640,
    height: 427,
  },
  {
    url: 'https://swanpass.com/wp-content/uploads/2023/02/305019048_619666009859434_8372238849948305452_n-600x427.jpg',
    category: 'shop',
    caption: null,
    width: 600,
    height: 427,
  },
];

const ID_START = 90001;

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Fetch a URL over HTTP(S) and return the response body as a string.
 * Resolves with { ok, status, body }.
 */
function fetchUrl(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body });
      });
    });
    req.on('error', (err) => {
      resolve({ ok: false, status: 0, body: '', error: err.message });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, body: '', error: 'timeout' });
    });
  });
}

/**
 * Build a clean photos array from a list of image URLs.
 */
function buildPhotosArray(imageList) {
  return imageList.map((img, i) => ({
    id: ID_START + i,
    url: img.url,
    width: img.width || null,
    height: img.height || null,
    category: img.category || (i === 0 ? 'featured' : 'shop'),
    caption: img.caption || null,
    sort_order: i,
  }));
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  // 1. Read listings.json
  console.log('Reading', LISTINGS_FILE);
  const raw = fs.readFileSync(LISTINGS_FILE, 'utf8');
  const listings = JSON.parse(raw);

  // 2. Find Baccara
  const idx = listings.findIndex((l) => l.slug === 'baccara');
  if (idx === -1) {
    console.error('ERROR: No listing with slug "baccara" found.');
    process.exit(1);
  }
  const baccara = listings[idx];
  console.log(`Found "${baccara.name}" at index ${idx}`);

  // Snapshot before
  const oldPhotosCount  = (baccara.photos || []).length;
  const oldImgUrlsCount = (baccara.image_urls || []).length;
  const oldPhotoUrls    = (baccara.photos || []).map((p) => p.url);
  const oldImgUrls      = (baccara.image_urls || []).slice();

  // 3. Try to fetch photos from the API
  let apiImages = null;
  const apiUrl = 'https://swanpass.com/listing/baccara/photos.json';
  console.log(`\nAttempting to fetch photos from API: ${apiUrl}`);

  const resp = await fetchUrl(apiUrl);
  if (resp.ok) {
    try {
      const json = JSON.parse(resp.body);
      // The API might return an array or { photos: [...] }
      const arr = Array.isArray(json) ? json : (json.photos || json.images || []);
      if (arr.length > 0) {
        apiImages = arr.map((item, i) => ({
          url: item.url || item.image_url || item.src || '',
          category: item.category || (i === 0 ? 'featured' : 'shop'),
          caption: item.caption || null,
          width: item.width || null,
          height: item.height || null,
        })).filter((img) => img.url);
        console.log(`  -> Got ${apiImages.length} image(s) from API`);
      }
    } catch (e) {
      console.log(`  -> API returned non-JSON or unparseable response: ${e.message}`);
    }
  } else {
    console.log(`  -> API request failed: status=${resp.status} ${resp.error || ''}`);
  }

  // 4. Determine final image list
  const finalImages = (apiImages && apiImages.length > 0) ? apiImages : KNOWN_IMAGES;
  const source = (apiImages && apiImages.length > 0) ? 'API' : 'known hardcoded images';
  console.log(`\nUsing ${source} (${finalImages.length} images)`);

  // 5. Build clean photos array
  const newPhotos = buildPhotosArray(finalImages);

  // 6. Build clean image_urls (just the URL strings)
  const newImageUrls = finalImages.map((img) => img.url);

  // 7. Update the listing
  baccara.photos     = newPhotos;
  baccara.image_urls = newImageUrls;
  listings[idx]      = baccara;

  // 8. Save
  fs.writeFileSync(LISTINGS_FILE, JSON.stringify(listings, null, 2) + '\n', 'utf8');
  console.log(`\nSaved updated listings.json`);

  // 9. Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY — Baccara photos fix');
  console.log('='.repeat(60));

  console.log(`\nBEFORE:`);
  console.log(`  photos array : ${oldPhotosCount} entries (all id: null — garbage from other listings)`);
  console.log(`  image_urls   : ${oldImgUrlsCount} entries`);
  console.log(`  Garbage URLs removed:`);
  const garbageFromPhotos = oldPhotoUrls.filter((u) => !newImageUrls.includes(u));
  garbageFromPhotos.forEach((u) => console.log(`    - ${u}`));
  const garbageFromImgUrls = oldImgUrls.filter((u) => !newImageUrls.includes(u));
  if (garbageFromImgUrls.length > garbageFromPhotos.length) {
    const extra = garbageFromImgUrls.filter((u) => !garbageFromPhotos.includes(u));
    extra.forEach((u) => console.log(`    - ${u}`));
  }

  console.log(`\nAFTER:`);
  console.log(`  photos array : ${newPhotos.length} entries (source: ${source})`);
  console.log(`  image_urls   : ${newImageUrls.length} entries`);
  console.log(`  Images kept:`);
  newPhotos.forEach((p) => {
    console.log(`    [${p.id}] ${p.category} — ${p.url}`);
  });

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
