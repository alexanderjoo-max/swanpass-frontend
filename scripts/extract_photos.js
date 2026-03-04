#!/usr/bin/env node
/**
 * extract_photos.js — Extract categorized photos from cached swanpass.com HTML
 *
 * Reads the ListingImages React component props from cached listing pages,
 * extracts talent_images, property_images, and featured_image, then updates
 * data/listings.json with a normalized photos[] array.
 *
 * Categories: "featured" | "talent" | "shop"
 *
 * Usage: node scripts/extract_photos.js
 */

const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', '.cache');
const DATA_FILE = path.join(__dirname, '..', 'data', 'listings.json');

function extractReactProps(html) {
  const match = html.match(/data-react-class="ListingImages"[^>]*data-react-props="([^"]+)"/);
  if (!match) return null;
  try {
    // Unescape HTML entities
    const propsStr = match[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    return JSON.parse(propsStr);
  } catch (e) {
    return null;
  }
}

function isValidUrl(url) {
  if (!url) return false;
  // Filter out broken wp-content URLs
  if (url.includes('swanpass.com/wp-content/')) return false;
  return url.startsWith('http');
}

function buildPhoto(imgObj, category, sortOrder) {
  const url = imgObj.image_url || (imgObj.image && imgObj.image.url) || null;
  if (!isValidUrl(url)) return null;
  return {
    id: imgObj.id || null,
    url: url,
    width: imgObj.width || null,
    height: imgObj.height || null,
    category: category,
    caption: imgObj.caption || null,
    sort_order: sortOrder
  };
}

function slugFromCacheFilename(filename) {
  // https___swanpass_com_listing_cube_massage_bangkok.html → cube-massage-bangkok
  const match = filename.match(/https___swanpass_com_listing_(.+)\.html$/);
  if (!match) return null;
  return match[1].replace(/_/g, '-');
}

function main() {
  console.log('=== SwanPass Photo Extractor ===\n');

  if (!fs.existsSync(DATA_FILE)) {
    console.error('Error: data/listings.json not found.');
    process.exit(1);
  }

  // Load listings
  const listings = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  const listingsBySlug = {};
  listings.forEach(l => { listingsBySlug[l.slug] = l; });

  // Read all cache files
  const cacheFiles = fs.readdirSync(CACHE_DIR)
    .filter(f => f.startsWith('https___swanpass_com_listing_') && f.endsWith('.html'))
    .filter(f => f !== 'https___swanpass_com_listing.html'); // Skip the index page

  console.log(`Cache files: ${cacheFiles.length}`);
  console.log(`Listings in JSON: ${listings.length}\n`);

  let matched = 0;
  let noMatch = 0;
  let noProps = 0;
  let totalTalent = 0;
  let totalShop = 0;
  let totalFeatured = 0;

  cacheFiles.forEach(file => {
    const slug = slugFromCacheFilename(file);
    if (!slug) return;

    const listing = listingsBySlug[slug];
    if (!listing) {
      noMatch++;
      return;
    }

    const html = fs.readFileSync(path.join(CACHE_DIR, file), 'utf-8');
    const props = extractReactProps(html);
    if (!props || !props.listing) {
      noProps++;
      return;
    }

    const data = props.listing;
    const photos = [];
    let order = 0;

    // Featured image first
    if (data.featured_image) {
      const photo = buildPhoto(data.featured_image, 'featured', order++);
      if (photo) {
        photos.push(photo);
        totalFeatured++;
      }
    }

    // Talent images
    (data.talent_images || []).forEach(img => {
      const photo = buildPhoto(img, 'talent', order++);
      if (photo) {
        photos.push(photo);
        totalTalent++;
      }
    });

    // Property/shop images
    (data.property_images || []).forEach(img => {
      const photo = buildPhoto(img, 'shop', order++);
      if (photo) {
        photos.push(photo);
        totalShop++;
      }
    });

    if (photos.length > 0) {
      listing.photos = photos;
      matched++;
    }
  });

  // For listings without cached photo data, fall back to image_urls as "shop"
  let fallback = 0;
  listings.forEach(l => {
    if (!l.photos) {
      const urls = (l.image_urls || []).filter(isValidUrl);
      if (urls.length > 0) {
        l.photos = urls.map((url, i) => ({
          id: null,
          url: url,
          width: null,
          height: null,
          category: 'shop',
          caption: null,
          sort_order: i
        }));
        fallback++;
      } else {
        l.photos = [];
      }
    }
  });

  // Write updated listings
  fs.writeFileSync(DATA_FILE, JSON.stringify(listings, null, 2));

  console.log('=== Results ===');
  console.log(`Matched with categorized photos: ${matched}`);
  console.log(`Fell back to image_urls: ${fallback}`);
  console.log(`No cache match (non-Thailand?): ${noMatch}`);
  console.log(`No React props found: ${noProps}`);
  console.log(`\nPhotos extracted:`);
  console.log(`  Featured: ${totalFeatured}`);
  console.log(`  Talent:   ${totalTalent}`);
  console.log(`  Shop:     ${totalShop}`);
  console.log(`  Total:    ${totalFeatured + totalTalent + totalShop}`);
  console.log(`\nUpdated: ${DATA_FILE}`);
}

main();
