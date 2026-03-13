/**
 * gallery.js — Shared gallery logic for listing detail pages
 * Extracted from inline <script> blocks on listing-*.html pages.
 * Auto-rotation is DISABLED. Manual navigation (thumbnails, tap, scroll) works.
 *
 * Usage: include <script src="js/gallery.js"></script> at bottom of listing pages.
 * Requires elements: #galleryStrip, #galleryCount, #galleryThumbs (optional)
 */
(function() {
  var strip = document.getElementById('galleryStrip');
  if (!strip) return; // Not a gallery page

  var countEl = document.getElementById('galleryCount');
  var allPhotos = [].slice.call(strip.querySelectorAll('.gallery-photo'));
  var thumbsEl = document.getElementById('galleryThumbs');
  var thumbs = thumbsEl ? [].slice.call(thumbsEl.querySelectorAll('.gallery-thumb')) : [];
  var currentIdx = 0;

  function updateThumbs(i) {
    thumbs.forEach(function(t, idx) { t.classList.toggle('active', idx === i); });
    if (thumbs[i]) thumbs[i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  function scrollToPhoto(i) {
    if (allPhotos.length === 0) return;
    if (i >= allPhotos.length) i = 0;
    if (i < 0) i = allPhotos.length - 1;
    currentIdx = i;
    allPhotos[i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    if (countEl) countEl.textContent = (i + 1) + ' / ' + allPhotos.length;
    updateThumbs(i);
  }

  // Thumbnail clicks
  if (thumbsEl) {
    thumbsEl.addEventListener('click', function(e) {
      var thumb = e.target.closest ? e.target.closest('.gallery-thumb') : null;
      if (!thumb) return;
      var idx = parseInt(thumb.dataset.idx, 10);
      scrollToPhoto(idx);
    });
  }

  // Track scroll to update counter + thumbnails
  var scrollRaf = 0;
  strip.addEventListener('scroll', function() {
    cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(function() {
      var cx = strip.scrollLeft + strip.offsetWidth / 2;
      var closest = 0, minDist = Infinity;
      allPhotos.forEach(function(p, i) {
        var mid = p.offsetLeft + p.offsetWidth / 2;
        var d = Math.abs(mid - cx);
        if (d < minDist) { minDist = d; closest = i; }
      });
      if (closest !== currentIdx) {
        currentIdx = closest;
        if (countEl) countEl.textContent = (closest + 1) + ' / ' + allPhotos.length;
        updateThumbs(closest);
      }
    });
  });

  // Tap to advance
  strip.addEventListener('click', function() { scrollToPhoto(currentIdx + 1); });

  // Auto-rotation DISABLED — functions kept as no-ops for compatibility
  // Listing pages that still have inline startAutoScroll/resetAutoScroll calls won't break.
  window.startAutoScroll = function() { return; };
  window.resetAutoScroll = function() { return; };

  // Expose scrollToPhoto globally for any inline onclick handlers
  window.scrollToPhoto = scrollToPhoto;
})();
