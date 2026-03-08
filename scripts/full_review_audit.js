#!/usr/bin/env node
/**
 * full_review_audit.js — Complete review audit and reconciliation
 *
 * 1. Fetches page-1 of reviews for EVERY listing (even those with review_count=0)
 *    to get the true total from the API meta.
 * 2. For any listing where the API reports more reviews than we have stored,
 *    fetches all pages.
 * 3. Updates reviews.json with the complete data.
 * 4. Updates review_count AND rating in listings.json to match the API.
 * 5. Generates a full audit report.
 *
 * Usage:
 *   node scripts/full_review_audit.js
 *   node scripts/full_review_audit.js --limit 10   # Test with 10 listings
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ── Paths
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const LISTINGS_FILE = path.join(DATA_DIR, 'listings.json');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');
const AUDIT_FILE = path.join(ROOT, 'review_audit_report.txt');

// ── Config
const BASE_URL = 'https://swanpass.com';
const CONCURRENCY = 2;
const DELAY_MS = 600;       // be polite
const TIMEOUT = 20000;
const RETRIES = 4;
const REVIEWS_PER_PAGE = 4;

// ── CLI args
const args = process.argv.slice(2);
const LIMIT = args.includes('--limit')
  ? parseInt(args[args.indexOf('--limit') + 1], 10)
  : Infinity;

// ── Helpers
function fetchJSON(url, attempt = 1) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: TIMEOUT }, (res) => {
      if (res.statusCode === 404) {
        res.resume();
        return resolve({ resources: [], meta: { total: 0, pages: 0, current_page: 1 } });
      }
      if (res.statusCode !== 200) {
        res.resume();
        const err = new Error(`HTTP ${res.statusCode} for ${url}`);
        if (attempt < RETRIES) {
          return setTimeout(() => resolve(fetchJSON(url, attempt + 1)), DELAY_MS * attempt * 2);
        }
        return reject(err);
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) {
          if (attempt < RETRIES) {
            return setTimeout(() => resolve(fetchJSON(url, attempt + 1)), DELAY_MS * attempt * 2);
          }
          reject(new Error(`JSON parse error for ${url}: ${e.message}`));
        }
      });
    });
    req.on('error', (err) => {
      if (attempt < RETRIES) {
        return setTimeout(() => resolve(fetchJSON(url, attempt + 1)), DELAY_MS * attempt * 2);
      }
      reject(err);
    });
    req.on('timeout', () => {
      req.destroy();
      if (attempt < RETRIES) {
        return setTimeout(() => resolve(fetchJSON(url, attempt + 1)), DELAY_MS * attempt * 2);
      }
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function pickFields(review) {
  return {
    id: review.id,
    title: review.title,
    message: review.message,
    rating: review.rating,
    images: review.images || [],
    helpful: review.helpful || 0,
    unhelpful: review.unhelpful || 0,
    created_at: review.created_at,
    display_name: review.display_name
  };
}

async function fetchPage1(slug) {
  const url = `${BASE_URL}/listing/${slug}/reviews.json?page=1`;
  return fetchJSON(url);
}

async function fetchAllPages(slug, totalPages) {
  const allReviews = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p > 1) await sleep(DELAY_MS);
    const url = `${BASE_URL}/listing/${slug}/reviews.json?page=${p}`;
    const data = await fetchJSON(url);
    const resources = (data.resources || []).map(pickFields);
    allReviews.push(...resources);
  }
  return allReviews;
}

// Deduplicate by review id
function dedupeReviews(reviews) {
  const seen = new Map();
  for (const r of reviews) {
    if (r.id && !seen.has(r.id)) {
      seen.set(r.id, r);
    } else if (!r.id) {
      // Use hash of content as fallback key
      const key = `${r.title}|${r.message}|${r.rating}|${r.created_at}`;
      if (!seen.has(key)) seen.set(key, r);
    }
  }
  return Array.from(seen.values());
}

// Concurrency limiter
async function runWithConcurrency(items, concurrency, delayMs, taskFn) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      if (idx > 0) await sleep(delayMs);
      results[idx] = await taskFn(items[idx], idx);
    }
  }
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

// ── Main
async function main() {
  console.log('=== FULL REVIEW AUDIT & RECONCILIATION ===\n');

  const listings = JSON.parse(fs.readFileSync(LISTINGS_FILE, 'utf8'));
  let existingReviews = {};
  if (fs.existsSync(REVIEWS_FILE)) {
    existingReviews = JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf8'));
  }

  console.log(`Loaded ${listings.length} listings`);
  console.log(`Existing reviews.json has ${Object.keys(existingReviews).length} slugs, ${Object.values(existingReviews).reduce((s,a)=>s+a.length,0)} total reviews\n`);

  const toProcess = listings.slice(0, LIMIT);
  console.log(`Processing ${toProcess.length} listings...\n`);

  // Phase 1: Fetch page 1 for every listing to get meta.total
  console.log('--- Phase 1: Checking all listings against API ---');
  let completed = 0;
  const phase1Results = await runWithConcurrency(toProcess, CONCURRENCY, DELAY_MS, async (listing, idx) => {
    const slug = listing.slug;
    const storedCount = (existingReviews[slug] || []).length;
    const listingReviewCount = listing.review_count || 0;

    try {
      const page1 = await fetchPage1(slug);
      const meta = page1.meta || {};
      const apiTotal = meta.total || 0;
      const apiPages = meta.pages || 0;
      const apiRating = meta.average_rating || null;
      completed++;
      process.stdout.write(`\r  [${completed}/${toProcess.length}] ${slug.padEnd(50)} API=${apiTotal} Stored=${storedCount}`);
      return { slug, listing, storedCount, listingReviewCount, apiTotal, apiPages, apiRating, error: null };
    } catch (err) {
      completed++;
      process.stdout.write(`\r  [${completed}/${toProcess.length}] ${slug.padEnd(50)} ERROR`);
      return { slug, listing, storedCount, listingReviewCount, apiTotal: null, apiPages: 0, apiRating: null, error: err.message };
    }
  });

  console.log('\n\n--- Phase 1 Complete ---\n');

  // Identify which listings need full re-fetch
  const needsFetch = phase1Results.filter(r => {
    if (r.error) return false;
    return r.apiTotal > r.storedCount; // API has more than we stored
  });

  const apiNotAvailable = phase1Results.filter(r => r.error);
  const alreadyComplete = phase1Results.filter(r => !r.error && r.apiTotal <= r.storedCount);

  console.log(`Already complete: ${alreadyComplete.length}`);
  console.log(`Need full fetch: ${needsFetch.length}`);
  console.log(`API errors: ${apiNotAvailable.length}`);

  if (needsFetch.length > 0) {
    console.log('\nListings needing full re-fetch:');
    for (const r of needsFetch) {
      console.log(`  ${r.slug}: API=${r.apiTotal} Stored=${r.storedCount} (missing ${r.apiTotal - r.storedCount})`);
    }
  }

  // Phase 2: Fetch all pages for listings that need it
  if (needsFetch.length > 0) {
    console.log('\n--- Phase 2: Fetching complete reviews for mismatched listings ---');
    completed = 0;
    for (const r of needsFetch) {
      completed++;
      console.log(`\n  [${completed}/${needsFetch.length}] Fetching ${r.slug} (${r.apiPages} pages)...`);
      try {
        const allReviews = await fetchAllPages(r.slug, r.apiPages);
        const deduped = dedupeReviews(allReviews);
        existingReviews[r.slug] = deduped;
        console.log(`    Fetched ${allReviews.length} -> deduped to ${deduped.length} reviews`);
        r.fetchedCount = deduped.length;
      } catch (err) {
        console.log(`    ERROR: ${err.message}`);
        r.fetchError = err.message;
        r.fetchedCount = r.storedCount; // keep existing
      }
    }
    console.log('\n--- Phase 2 Complete ---\n');
  }

  // Phase 3: Also check listings where we have stored reviews > apiTotal (shouldn't happen but check)
  const overStored = phase1Results.filter(r => !r.error && r.apiTotal !== null && r.storedCount > r.apiTotal && r.apiTotal > 0);
  if (overStored.length > 0) {
    console.log('*** Listings where stored > API total (possible stale reviews): ***');
    for (const r of overStored) {
      console.log(`  ${r.slug}: Stored=${r.storedCount} API=${r.apiTotal}`);
    }
  }

  // Phase 4: Update listings.json review_count and rating
  console.log('\n--- Phase 4: Updating listings.json ---');
  let countUpdates = 0;
  let ratingUpdates = 0;
  for (const r of phase1Results) {
    if (r.error) continue;
    const l = r.listing;
    const actualStored = (existingReviews[r.slug] || []).length;

    // Update review_count to match what we actually have stored
    if (l.review_count !== actualStored) {
      l.review_count = actualStored;
      countUpdates++;
    }

    // Update rating from API if available
    if (r.apiRating !== null && r.apiRating !== undefined) {
      const apiRating = parseFloat(r.apiRating);
      if (!isNaN(apiRating) && apiRating !== l.rating) {
        l.rating = apiRating;
        ratingUpdates++;
      }
    }
  }

  console.log(`Updated review_count for ${countUpdates} listings`);
  console.log(`Updated rating for ${ratingUpdates} listings`);

  // Save updated files
  fs.writeFileSync(REVIEWS_FILE, JSON.stringify(existingReviews, null, 2), 'utf8');
  console.log(`Saved reviews.json (${Object.values(existingReviews).reduce((s,a)=>s+a.length,0)} total reviews)`);

  fs.writeFileSync(LISTINGS_FILE, JSON.stringify(listings, null, 2), 'utf8');
  console.log(`Saved listings.json`);

  // Phase 5: Generate final audit report
  console.log('\n--- Phase 5: Generating audit report ---\n');

  const reportLines = [];
  reportLines.push('=== SWANPASS REVIEW AUDIT REPORT ===');
  reportLines.push(`Date: ${new Date().toISOString()}`);
  reportLines.push(`Total listings: ${listings.length}`);
  reportLines.push('');

  reportLines.push('LISTING'.padEnd(55) + 'SOURCE_URL'.padEnd(60) + 'API_CT'.padStart(8) + 'BEFORE'.padStart(8) + 'AFTER'.padStart(8) + '  STATUS');
  reportLines.push('-'.repeat(147));

  let passCount = 0;
  let failCount = 0;
  const failures = [];

  for (const r of phase1Results) {
    const afterCount = (existingReviews[r.slug] || []).length;
    const sourceUrl = `https://swanpass.com/listing/${r.slug}`;
    let status;

    if (r.error) {
      status = `FAIL (API error: ${r.error})`;
      failCount++;
      failures.push({ slug: r.slug, reason: `API error: ${r.error}` });
    } else if (afterCount >= r.apiTotal) {
      status = 'PASS';
      passCount++;
    } else {
      status = `FAIL (missing ${r.apiTotal - afterCount} reviews)`;
      failCount++;
      failures.push({ slug: r.slug, reason: `Missing ${r.apiTotal - afterCount} reviews (API=${r.apiTotal}, stored=${afterCount})` });
    }

    reportLines.push(
      r.slug.padEnd(55) +
      sourceUrl.padEnd(60) +
      String(r.apiTotal !== null ? r.apiTotal : '?').padStart(8) +
      String(r.storedCount).padStart(8) +
      String(afterCount).padStart(8) +
      '  ' + status
    );
  }

  reportLines.push('-'.repeat(147));
  reportLines.push('');
  reportLines.push('=== SUMMARY ===');
  reportLines.push(`Total listings audited: ${phase1Results.length}`);
  reportLines.push(`PASS: ${passCount}`);
  reportLines.push(`FAIL: ${failCount}`);
  reportLines.push(`Total reviews stored: ${Object.values(existingReviews).reduce((s,a)=>s+a.length,0)}`);
  reportLines.push('');

  if (failures.length > 0) {
    reportLines.push('=== FAILED LISTINGS ===');
    for (const f of failures) {
      reportLines.push(`  ${f.slug}: ${f.reason}`);
    }
  } else {
    reportLines.push('All listings PASSED audit.');
  }

  const report = reportLines.join('\n');
  fs.writeFileSync(AUDIT_FILE, report, 'utf8');
  console.log(report);
  console.log(`\nReport saved to ${AUDIT_FILE}`);
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
