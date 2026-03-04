# SwanPass Migration Guide

## Overview

This migration transforms the SwanPass static site from manually created listing pages to an automated, data-driven system.

## Prerequisites

- Node.js 18+ installed
- npm installed

## Setup

```bash
npm install
```

## Test Run (5 listings)

```bash
node scripts/crawl_swanpass.js --limit 5
node scripts/download_images.js --limit 5
node scripts/generate_pages.js --limit 5
node scripts/validate.js
```

## Full Run

```bash
node scripts/crawl_swanpass.js
node scripts/download_images.js
node scripts/generate_pages.js
node scripts/validate.js
```

## Scripts

### `scripts/crawl_swanpass.js`
- Discovers all listing URLs on swanpass.com
- Crawls each listing page and extracts structured data
- Saves to `data/listings.json`
- Caches HTML in `.cache/` directory (delete cache to re-fetch)
- Rate limited: 2 concurrent requests, 10s timeout, 2 retries

### `scripts/download_images.js`
- Downloads all images from `data/listings.json`
- Saves to `images/listings/<slug>/01.jpg`, etc.
- Skips already downloaded images
- Updates `listings.json` with local image paths

### `scripts/generate_pages.js`
- Generates `listing-<slug>.html` for each listing
- Uses shared CSS (`css/site.css`) and header/footer partials
- Includes gallery, services/prices, contacts, hours, map, nearby shops

### `scripts/validate.js`
- Validates data completeness
- Checks that all pages and images exist
- Reports missing data and issues

## Directory Structure

```
data/
  listings.json         — All listing data
images/
  listings/<slug>/      — Downloaded images per listing
scripts/
  crawl_swanpass.js     — Web crawler
  download_images.js    — Image downloader
  generate_pages.js     — Static page generator
  validate.js           — Validation script
partials/
  header.html           — Shared header
  footer.html           — Shared footer
css/
  site.css              — Global stylesheet
js/
  include.js            — HTML partial loader
.cache/
  *.html                — Cached crawl responses
```

## Shared Components

All pages use:
- `<link rel="stylesheet" href="css/site.css">` for global styles
- `<div data-include="partials/header.html"></div>` for header
- `<div data-include="partials/footer.html"></div>` for footer
- `<script src="js/include.js"></script>` to load partials

## Notes

- The `.cache/` directory can be deleted to force re-crawling
- Generated pages use local images from `images/listings/` when available
- `listings.html` dynamically loads data from `data/listings.json`
- All scripts support `--limit N` for testing
