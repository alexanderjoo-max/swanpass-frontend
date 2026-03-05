const fs = require('fs');
const listings = JSON.parse(fs.readFileSync(__dirname + '/../data/listings.json', 'utf-8'));
const drake = listings.find(l => l.slug === 'drake-luxury-lounge-bangkok');

// Deduplicate photos by id
const seen = new Set();
const deduped = [];
drake.photos.forEach(p => {
  if (!seen.has(p.id)) {
    seen.add(p.id);
    deduped.push(p);
  }
});

// If multiple featured, keep first only
const featuredPhotos = deduped.filter(p => p.category === 'featured');
let photos = deduped;
if (featuredPhotos.length > 1) {
  const keepId = featuredPhotos[0].id;
  photos = deduped.filter(p => p.category !== 'featured' || p.id === keepId);
}

// Sort: featured first, then talent, then shop
const catOrder = { featured: 0, talent: 1, shop: 2 };
photos.sort((a, b) => {
  if (catOrder[a.category] !== catOrder[b.category]) return catOrder[a.category] - catOrder[b.category];
  return (a.sort_order || 0) - (b.sort_order || 0);
});

drake.photos = photos;
drake.image_urls = [...new Set(drake.image_urls)];

console.log('Photos:', drake.photos.length,
  '(featured:', drake.photos.filter(p => p.category === 'featured').length,
  ', talent:', drake.photos.filter(p => p.category === 'talent').length,
  ', shop:', drake.photos.filter(p => p.category === 'shop').length + ')');
console.log('Image URLs:', drake.image_urls.length);
console.log('Telegram:', drake.contacts.telegram);

fs.writeFileSync(__dirname + '/../data/listings.json', JSON.stringify(listings, null, 2));
console.log('Saved.');
