#!/usr/bin/env node
/**
 * fetch_reviews.js — Fetch all reviews for every listing from swanpass.com API
 *
 * Reads data/listings.json, fetches paginated reviews for each listing
 * with review_count > 0, and saves to data/reviews.json.
 *
 * Features:
 *   - Paginated fetching (4 reviews per page)
 *   - Rate limiting: max 2 concurrent requests, 500ms delay between requests
 *   - Disk caching in .cache/reviews/ (one file per page)
 *   - Summary with mismatch detection
 *
 * Usage:
 *   node scripts/fetch_reviews.js              # Fetch all reviews (uses cache)
 *   node scripts/fetch_reviews.js --no-cache   # Ignore cached responses
 *   node scripts/fetch_reviews.js --limit 5    # Only process first 5 listings
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ── Paths ──────────────────────────────────────────────────────────────────
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const LISTINGS_FILE = path.join(DATA_DIR, 'listings.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'reviews.json');
const CACHE_DIR = path.join(ROOT, '.cache', 'reviews');

// ── Config ─────────────────────────────────────────────────────────────────
const BASE_URL = 'https://swanpass.com';
const CONCURRENCY = 2;
const DELAY_MS = 500;
const TIMEOUT = 15000;
const RETRIES = 3;
const REVIEWS_PER_PAGE = 4;

// ── CLI args ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const NO_CACHE = args.includes('--no-cache');
const LIMIT = args.includes('--limit')
  ? parseInt(args[args.indexOf('--limit') + 1], 10)
  : Infinity;

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Make an HTTPS GET request and return parsed JSON.
 */
function fetchJSON(url, attempt = 1) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: TIMEOUT }, (res) => {
      if (res.statusCode === 404) {
        // No reviews endpoint for this listing — return empty
        res.resume();
        return resolve({ resources: [], meta: { total: 0, pages: 0, current_page: 1 } });
      }
      if (res.statusCode !== 200) {
        res.resume();
        const err = new Error(`HTTP ${res.statusCode} for ${url}`);
        if (attempt < RETRIES) {
          return setTimeout(() => {
            resolve(fetchJSON(url, attempt + 1));
          }, DELAY_MS * attempt);
        }
        return reject(err);
      }

      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          if (attempt < RETRIES) {
            return setTimeout(() => {
              resolve(fetchJSON(url, attempt + 1));
            }, DELAY_MS * attempt);
          }
          reject(new Error(`JSON parse error for ${url}: ${e.message}`));
        }
      });
    });

    req.on('error', (err) => {
      if (attempt < RETRIES) {
        return setTimeout(() => {
          resolve(fetchJSON(url, attempt + 1));
        }, DELAY_MS * attempt);
      }
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      if (attempt < RETRIES) {
        return setTimeout(() => {
          resolve(fetchJSON(url, attempt + 1));
        }, DELAY_MS * attempt);
      }
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

/**
 * Cache key for a given slug + page number.
 */
function cacheFile(slug, page) {
  return path.join(CACHE_DIR, `${slug}__page_${page}.json`);
}

/**
 * Read a cached response, or return null if not cached / cache disabled.
 */
function readCache(slug, page) {
  if (NO_CACHE) return null;
  const file = cacheFile(slug, page);
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Write a response to the cache.
 */
function writeCache(slug, page, data) {
  const file = cacheFile(slug, page);
  fs.writeFileSync(file, JSON.stringify(data), 'utf8');
}

/**
 * Fetch a single page of reviews for a listing.
 * Uses cache if available.
 */
async function fetchReviewPage(slug, page) {
  const cached = readCache(slug, page);
  if (cached) return cached;

  const url = `${BASE_URL}/listing/${slug}/reviews.json?page=${page}`;
  const data = await fetchJSON(url);
  writeCache(slug, page, data);
  return data;
}

/**
 * Sleep for ms milliseconds.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract the fields we want from each review resource.
 */
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

/**
 * Fetch ALL reviews for a single listing, paginating through all pages.
 * Returns { reviews: [...], meta: {...} }.
 */
async function fetchAllReviewsForListing(slug) {
  // Fetch page 1 to get total page count
  const page1 = await fetchReviewPage(slug, 1);
  const meta = page1.meta || {};
  const totalPages = meta.pages || 0;
  const allReviews = (page1.resources || []).map(pickFields);

  if (totalPages <= 1) {
    return { reviews: allReviews, meta };
  }

  // Fetch remaining pages sequentially with delay
  for (let p = 2; p <= totalPages; p++) {
    await sleep(DELAY_MS);
    const pageData = await fetchReviewPage(slug, p);
    const resources = (pageData.resources || []).map(pickFields);
    allReviews.push(...resources);
  }

  return { reviews: allReviews, meta };
}

// ── Concurrency-limited runner ─────────────────────────────────────────────

/**
 * Process an array of tasks with limited concurrency.
 * taskFn receives (item, index) and should return a promise.
 */
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

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== SwanPass Review Fetcher ===\n');

  // Ensure cache dir exists
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  // Read listings
  if (!fs.existsSync(LISTINGS_FILE)) {
    console.error(`ERROR: ${LISTINGS_FILE} not found`);
    process.exit(1);
  }

  const allListings = JSON.parse(fs.readFileSync(LISTINGS_FILE, 'utf8'));
  console.log(`Loaded ${allListings.length} listings from listings.json`);

  // Filter to only those with review_count > 0
  const withReviews = allListings.filter((l) => (l.review_count || 0) > 0);
  console.log(`${withReviews.length} listings have review_count > 0`);

  // Apply limit
  const toProcess = withReviews.slice(0, LIMIT);
  if (LIMIT < Infinity) {
    console.log(`--limit ${LIMIT}: processing ${toProcess.length} listings`);
  }

  console.log(`Concurrency: ${CONCURRENCY}, Delay: ${DELAY_MS}ms, Cache: ${NO_CACHE ? 'DISABLED' : 'enabled'}\n`);

  // Fetch reviews for each listing
  const reviewsMap = {};
  const summary = [];
  let completed = 0;

  const results = await runWithConcurrency(toProcess, CONCURRENCY, DELAY_MS, async (listing, idx) => {
    const slug = listing.slug;
    const expected = listing.review_count || 0;

    try {
      const { reviews, meta } = await fetchAllReviewsForListing(slug);
      reviewsMap[slug] = reviews;
      completed++;

      const fetched = reviews.length;
      const match = fetched === expected;
      const status = match ? 'OK' : 'MISMATCH';

      // Progress indicator
      process.stdout.write(`\r  [${completed}/${toProcess.length}] ${slug} — ${fetched}/${expected} reviews ${status}   `);

      return { slug, expected, fetched, match, meta };
    } catch (err) {
      completed++;
      process.stdout.write(`\r  [${completed}/${toProcess.length}] ${slug} — ERROR: ${err.message}   `);
      reviewsMap[slug] = [];
      return { slug, expected, fetched: 0, match: false, error: err.message };
    }
  });

  console.log('\n');

  // Save output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(reviewsMap, null, 2), 'utf8');
  const totalReviews = Object.values(reviewsMap).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`Saved ${totalReviews} total reviews across ${Object.keys(reviewsMap).length} listings to ${OUTPUT_FILE}\n`);

  // ── Summary ────────────────────────────────────────────────────────────
  console.log('=== SUMMARY ===');
  console.log(`${'Slug'.padEnd(55)} ${'Expected'.padStart(8)} ${'Fetched'.padStart(8)} Status`);
  console.log('-'.repeat(90));

  let mismatches = 0;
  let zeroFetched = 0;
  let errors = 0;

  for (const r of results) {
    const statusLabel = r.error
      ? 'ERROR'
      : r.match
        ? 'OK'
        : 'MISMATCH';

    if (!r.match) mismatches++;
    if (r.fetched === 0 && r.expected > 0) zeroFetched++;
    if (r.error) errors++;

    // Only print mismatches, errors, and zero-fetched — or all if few listings
    if (!r.match || r.error || toProcess.length <= 30) {
      console.log(
        `${r.slug.padEnd(55)} ${String(r.expected).padStart(8)} ${String(r.fetched).padStart(8)} ${statusLabel}${r.error ? ' — ' + r.error : ''}`
      );
    }
  }

  console.log('-'.repeat(90));
  console.log(`Total listings processed: ${toProcess.length}`);
  console.log(`Total reviews fetched:    ${totalReviews}`);
  console.log(`Matches:                  ${toProcess.length - mismatches}`);
  console.log(`Mismatches:               ${mismatches}`);
  console.log(`Errors:                   ${errors}`);

  if (zeroFetched > 0) {
    console.log(`\n*** WARNING: ${zeroFetched} listing(s) with expected reviews > 0 but 0 fetched ***`);
    for (const r of results) {
      if (r.fetched === 0 && r.expected > 0) {
        console.log(`  - ${r.slug} (expected ${r.expected})`);
      }
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
