#!/usr/bin/env node
const cheerio = require('cheerio');
const fs = require('fs');
const html = fs.readFileSync('.cache/https___swanpass_com_listing_baccara.html', 'utf-8');
const $ = cheerio.load(html);

// Find all image URLs
const images = new Set();
$('img').each(function() {
  const src = $(this).attr('src');
  if (src && (src.includes('vultrobjects') || src.includes('wp-content/uploads'))) {
    images.add(src);
  }
});
console.log('Images found:', images.size);
images.forEach(u => console.log(' ', u));

// Find photo galleries / data attributes
console.log('\nLooking for gallery data:');
$('[data-src], [data-image], [data-photo]').each(function() {
  const src = $(this).attr('data-src') || $(this).attr('data-image') || $(this).attr('data-photo');
  if (src) console.log('  data-src:', src);
});

// Find review content
console.log('\nLooking for reviews:');
$('.review-body, .review-text, .review-content, .comment-text, [class*=review]').each(function(i) {
  if (i < 5) {
    const text = $(this).text().trim().substring(0, 200);
    if (text.length > 10) console.log('  Review:', text);
  }
});

// Check for JSON-LD or structured data
$('script[type="application/ld+json"]').each(function() {
  try {
    const data = JSON.parse($(this).html());
    if (data.review || data.aggregateRating) {
      console.log('\nStructured data:', JSON.stringify(data).substring(0, 500));
    }
  } catch(e) {}
});

// Look for reviews API endpoint in script tags
$('script').each(function() {
  const text = $(this).html() || '';
  if (text.includes('review') && !text.includes('google-analytics')) {
    const matches = text.match(/\/api\/[^\s"']*/g) || text.match(/\.json[^\s"']*/g);
    if (matches) console.log('\nAPI URLs:', matches);
  }
});
