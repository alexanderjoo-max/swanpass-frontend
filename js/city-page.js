/**
 * city-page.js — Reusable city page renderer
 * Reads the URL path to determine country/city, fetches listings.json,
 * and renders: city header, featured, top rated, newest, full grid.
 *
 * Usage: include on any /country/city/index.html page.
 * The page must contain:
 *   <div id="cityHero"></div>
 *   <div id="cityContent"></div>
 * And load this script after those elements.
 */
(function () {
  'use strict';

  /* ─── PATH PARSING ──────────────────────────────────────────────── */
  var segs = location.pathname.replace(/^\/|\/$/g, '').split('/').filter(Boolean);
  // Expected: ['thailand','bangkok'] or ['vietnam','ho-chi-minh-city']
  var countrySlug = segs[0] || '';
  var citySlug = segs[1] || '';

  /* ─── CITY SLUG → DISPLAY NAME MAP ─────────────────────────────── */
  var CITY_NAMES = {
    'bangkok': 'Bangkok',
    'pattaya': 'Pattaya',
    'chiang-mai': 'Chiang Mai',
    'phuket': 'Phuket',
    'hua-hin': 'Hua Hin',
    'khon-kaen': 'Khon Kaen',
    'ko-samui': 'Ko Samui',
    'korat': 'Nakhon Ratchasima',
    'nakhon-ratchasima': 'Nakhon Ratchasima',
    'udon-thani': 'Udon Thani',
    'ubon-ratchathani': 'Ubon Ratchathani',
    'phitsanulok': 'Phitsanulok',
    'krabi': 'Krabi',
    'kanchanaburi': 'Kanchanaburi',
    'ratchaburi': 'Ratchaburi',
    'nakhon-sawan': 'Nakhon Sawan',
    'si-racha': 'Sri Racha',
    'sri-racha': 'Sri Racha',
    'rayong': 'Rayong',
    'pathum-thani': 'Pathum Thani',
    'ho-chi-minh-city': 'Ho Chi Minh City',
    'hanoi': 'Hanoi',
    'danang': 'Danang',
    'bali': 'Bali',
    'jakarta': 'Jakarta',
    'surabaya': 'Surabaya',
    'batam': 'Batam',
    'phnom-penh': 'Phnom Penh',
    'singapore': 'Singapore',
    'kuala-lumpur': 'Kuala Lumpur'
  };

  var COUNTRY_NAMES = {
    'thailand': 'Thailand',
    'vietnam': 'Vietnam',
    'indonesia': 'Indonesia',
    'cambodia': 'Cambodia',
    'singapore': 'Singapore',
    'malaysia': 'Malaysia'
  };

  var cityName = CITY_NAMES[citySlug] || citySlug.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  var countryName = COUNTRY_NAMES[countrySlug] || countrySlug.replace(/\b\w/g, function (c) { return c.toUpperCase(); });

  /* ─── VERIFIED / DEALS DATA ─────────────────────────────────────── */
  var VER_SET = new Set([
    'chairman-nuru-massage-bangkok', 'g2g-massage-bangkok', 'jspot-bangkok',
    'amor888', 'the333-bangkok', '666-class', 'suwon-man-s-spa-bangkok',
    'drake-luxury-lounge-bangkok', 'exotic-massage-bangkok-bangkok', 'body-bliss'
  ]);

  var DEALS_MAP = {
    'chairman-nuru-massage-bangkok': 'FREE JACUZZI',
    'g2g-massage-bangkok': 'FREE JACUZZI',
    'jspot-bangkok': 'FREE JACUZZI',
    'amor888': 'FREE JACUZZI',
    'the333-bangkok': 'FREE JACUZZI',
    '666-class': 'FREE JACUZZI',
    'suwon-man-s-spa-bangkok': 'SAVE ฿500',
    'exotic-massage-bangkok-bangkok': 'SAVE ฿200',
    'body-bliss': 'SAVE ฿200'
  };

  /* ─── HELPERS ───────────────────────────────────────────────────── */
  function slugifyCity(c) {
    if (!c) return 'other';
    return c.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  function starsHTML(r) {
    var f = Math.round(r || 0);
    return '★'.repeat(f) + '☆'.repeat(Math.max(0, 5 - f));
  }

  function imgErr() {
    return 'onerror="this.style.background=\'linear-gradient(135deg,#2a1a1a,#1a0a0a)\';this.removeAttribute(\'src\')"';
  }

  function vCheck(id) {
    if (!VER_SET.has(id)) return '';
    return '<span class="v-check"><svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></span>';
  }

  function cardBadges(shop) {
    var h = '';
    if (VER_SET.has(shop.id)) h += '<span class="badge" style="font-size:7px;font-weight:900;padding:2px 7px;border-radius:14px;text-transform:uppercase;letter-spacing:.5px;background:rgba(59,130,246,.92);color:#fff;">✓ Verified</span>';
    if (shop.featured) h += '<span class="badge" style="font-size:7px;font-weight:900;padding:2px 7px;border-radius:14px;text-transform:uppercase;letter-spacing:.5px;background:linear-gradient(135deg,#d4a847,#f5d784,#d4a847);color:#1a1000;">★ Featured</span>';
    return h ? '<div style="position:absolute;top:6px;left:6px;display:flex;flex-direction:column;gap:3px;">' + h + '</div>' : '';
  }

  function bestImage(l, garbageSet) {
    var validPhotos = (l.photos || []).filter(function (p) { return p.id !== null && p.url; });
    if (validPhotos.length > 0) {
      var order = { featured: 0, shop: 1, talent: 2 };
      validPhotos.sort(function (a, b) {
        return ((order[a.category] != null ? order[a.category] : 1) - (order[b.category] != null ? order[b.category] : 1)) || ((a.sort_order || 0) - (b.sort_order || 0));
      });
      return validPhotos[0].url;
    }
    var fallback = (l.image_urls || []).filter(function (u) { return u && !garbageSet.has(u); });
    return fallback[0] || '';
  }

  /* ─── CARD RENDERERS ────────────────────────────────────────────── */

  /** Small grid card (used in top rated, newest, full grid) */
  function gridCard(s) {
    return '<a href="' + s.page + '" class="shop-card" style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;overflow:hidden;cursor:pointer;position:relative;text-decoration:none;color:inherit;display:block;transition:transform .2s,border-color .2s;">' +
      '<img style="width:100%;aspect-ratio:4/3;object-fit:cover;display:block;background:linear-gradient(135deg,#2a1a1a,#1a0f0f);" src="' + s.img + '" alt="' + s.name + '" ' + imgErr() + '>' +
      cardBadges(s) +
      '<div style="padding:8px 10px 10px;">' +
        '<div style="font-size:10px;color:var(--white40,rgba(255,255,255,.4));margin-bottom:2px;">' + s.categories.join(' · ') + '</div>' +
        '<div style="font-size:12px;font-weight:700;line-height:1.2;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + s.name + vCheck(s.id) + '</div>' +
        '<div style="font-size:10px;color:var(--white40,rgba(255,255,255,.4));margin-bottom:6px;">\uD83D\uDCCD ' + (s.area || s.city) + '</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;">' +
          '<div style="display:flex;align-items:center;gap:4px;"><span style="color:var(--gold,#d4a847);font-size:11px;">' + starsHTML(s.rating) + '</span> <span style="font-size:11px;font-weight:600;">' + (s.rating ? s.rating.toFixed(1) : 'N/A') + '</span></div>' +
          '<span style="font-size:10px;color:var(--white40,rgba(255,255,255,.4));">' + s.reviews + ' reviews</span>' +
        '</div>' +
        (s.deal ? '<div style="margin-top:4px;font-size:10px;color:var(--green,#22c55e);font-weight:600;">\uD83C\uDFF7\uFE0F ' + s.deal + '</div>' : '') +
      '</div></a>';
  }

  /** Wide featured card (used in featured section) */
  function featuredCard(s) {
    return '<a href="' + s.page + '" style="display:flex;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;overflow:hidden;text-decoration:none;color:inherit;transition:border-color .2s;position:relative;" onmouseover="this.style.borderColor=\'rgba(232,20,42,.4)\'" onmouseout="this.style.borderColor=\'var(--border)\'">' +
      '<img src="' + s.img + '" alt="' + s.name + '" style="width:110px;height:110px;flex-shrink:0;object-fit:cover;background:linear-gradient(135deg,#2a1a1a,#1a0f0f);" ' + imgErr() + '>' +
      '<div style="flex:1;padding:10px 12px;min-width:0;">' +
        '<div style="font-size:13px;font-weight:700;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + s.name + vCheck(s.id) + '</div>' +
        '<div style="font-size:11px;color:var(--white40,rgba(255,255,255,.4));margin-bottom:6px;">' + s.categories.join(' · ') + ' · \uD83D\uDCCD ' + (s.area || s.city) + '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span style="color:var(--gold,#d4a847);font-size:12px;">' + starsHTML(s.rating) + '</span>' +
          '<span style="font-size:12px;font-weight:600;">' + (s.rating ? s.rating.toFixed(1) : 'N/A') + '</span>' +
          '<span style="font-size:10px;color:var(--white40,rgba(255,255,255,.4));">' + s.reviews + ' reviews</span>' +
        '</div>' +
        (s.deal ? '<div style="margin-top:4px;font-size:10px;color:var(--green,#22c55e);font-weight:600;">\uD83C\uDFF7\uFE0F ' + s.deal + '</div>' : '') +
      '</div></a>';
  }

  /* ─── SECTION BUILDER ───────────────────────────────────────────── */
  function buildSection(title, id, contentHTML, extraStyle) {
    if (!contentHTML) return '';
    return '<div style="margin-bottom:24px;' + (extraStyle || '') + '">' +
      '<h2 style="font-family:\'Bebas Neue\',sans-serif;font-size:24px;font-weight:700;letter-spacing:1px;margin-bottom:12px;display:flex;align-items:center;gap:8px;">' +
        '<span style="width:3px;height:14px;background:var(--red,#e8142a);border-radius:2px;flex-shrink:0;"></span>' + title +
      '</h2>' +
      '<div id="' + id + '">' + contentHTML + '</div>' +
    '</div>';
  }

  /* ─── MAIN: FETCH & RENDER ──────────────────────────────────────── */
  var heroEl = document.getElementById('cityHero');
  var contentEl = document.getElementById('cityContent');

  // Show loading state
  if (heroEl) {
    heroEl.innerHTML =
      '<div style="background:linear-gradient(135deg,#1a0a0a 0%,#2a1a1a 50%,#0a0a0a 100%);padding:48px 16px;text-align:center;">' +
        '<h1 style="font-family:\'Bebas Neue\',sans-serif;font-size:36px;color:var(--white,#fff);margin:0;letter-spacing:2px;">' + cityName.toUpperCase() + '</h1>' +
        '<p style="font-family:\'DM Sans\',sans-serif;font-size:14px;color:var(--white40,rgba(255,255,255,.4));margin-top:8px;">' + countryName + ' · Loading…</p>' +
      '</div>';
  }

  fetch('/data/listings.json')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      // Build garbage image set
      var urlCounts = {};
      data.forEach(function (l) {
        var seen = {};
        (l.image_urls || []).forEach(function (u) {
          if (u && !seen[u]) { seen[u] = 1; urlCounts[u] = (urlCounts[u] || 0) + 1; }
        });
      });
      var garbageSet = new Set(Object.keys(urlCounts).filter(function (u) { return urlCounts[u] >= 20; }));

      // Map raw data → shop objects
      var allShops = data.map(function (l) {
        return {
          id: l.slug,
          name: l.name || l.slug,
          categories: l.categories || [],
          city: l.city || '',
          country: l.country || '',
          area: (l.address || '').split(',')[0] || '',
          address: l.address || '',
          rating: l.rating || 0,
          reviews: l.review_count || 0,
          featured: l.featured || false,
          sponsor: l.sponsor || false,
          img: bestImage(l, garbageSet),
          page: '/' + (l.country || 'Thailand').toLowerCase() + '/' + slugifyCity(l.city || 'other') + '/' + l.slug + '/',
          deal: DEALS_MAP[l.slug] || null,
          slug: l.slug,
          created: l.created_at || l.updated_at || ''
        };
      });

      // Filter for this city — match by slug or by city name
      var cityShops = allShops.filter(function (s) {
        return slugifyCity(s.city) === citySlug ||
               (citySlug === 'korat' && slugifyCity(s.city) === 'nakhon-ratchasima');
      });

      // Update hero
      if (heroEl) {
        heroEl.innerHTML =
          '<div style="background:linear-gradient(135deg,#1a0a0a 0%,#2a1a1a 50%,#0a0a0a 100%);padding:48px 16px;text-align:center;">' +
            '<p style="font-family:\'DM Sans\',sans-serif;font-size:12px;color:var(--white40,rgba(255,255,255,.4));margin-bottom:6px;text-transform:uppercase;letter-spacing:2px;">' +
              '<a href="/" style="color:inherit;text-decoration:none;">Home</a> › ' +
              '<a href="/' + countrySlug + '/" style="color:inherit;text-decoration:none;">' + countryName + '</a>' +
            '</p>' +
            '<h1 style="font-family:\'Bebas Neue\',sans-serif;font-size:42px;color:var(--white,#fff);margin:0;letter-spacing:3px;">' + cityName.toUpperCase() + '</h1>' +
            '<p style="font-family:\'DM Sans\',sans-serif;font-size:14px;color:var(--white40,rgba(255,255,255,.4));margin-top:8px;">' + countryName + ' · ' + cityShops.length + ' listing' + (cityShops.length !== 1 ? 's' : '') + '</p>' +
          '</div>';
      }

      // Update page title
      document.title = cityName + ', ' + countryName + ' — Swanpass';

      // Build sections
      var html = '';

      // 1) FEATURED LISTINGS (verified + featured)
      var featured = cityShops.filter(function (s) { return VER_SET.has(s.id) || s.featured || s.sponsor; });
      if (featured.length > 0) {
        // Sort: verified first, then featured
        featured.sort(function (a, b) { return (VER_SET.has(b.id) ? 1 : 0) - (VER_SET.has(a.id) ? 1 : 0); });
        var featHTML = '<div style="display:grid;grid-template-columns:1fr;gap:10px;" class="cp-featured-grid">' +
          featured.map(featuredCard).join('') + '</div>';
        html += buildSection('Featured', 'cpFeatured', featHTML);
      }

      // 2) TOP RATED (rating > 0, sorted by rating desc, max 8)
      var topRated = cityShops.filter(function (s) { return s.rating > 0; })
        .sort(function (a, b) { return b.rating - a.rating || b.reviews - a.reviews; })
        .slice(0, 8);
      if (topRated.length > 0) {
        var trHTML = '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;" class="cp-grid">' +
          topRated.map(gridCard).join('') + '</div>';
        html += buildSection('Top Rated', 'cpTopRated', trHTML);
      }

      // 3) NEWEST LISTINGS (last 6 by created date or end of array)
      var newest = cityShops.slice().reverse().slice(0, 6);
      if (newest.length > 0) {
        var nHTML = '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;" class="cp-grid">' +
          newest.map(gridCard).join('') + '</div>';
        html += buildSection('Recently Added', 'cpNewest', nHTML);
      }

      // 4) FULL LISTINGS GRID (all, with category filter)
      var categories = {};
      cityShops.forEach(function (s) {
        (s.categories || []).forEach(function (c) { categories[c] = (categories[c] || 0) + 1; });
      });
      var catKeys = Object.keys(categories).sort(function (a, b) { return categories[b] - categories[a]; });

      var filterHTML = '<div style="display:flex;gap:6px;overflow-x:auto;padding:0 0 12px;scrollbar-width:none;flex-wrap:nowrap;" id="cpCatFilter">' +
        '<button data-cat="all" style="background:var(--red,#e8142a);border:1px solid var(--red,#e8142a);border-radius:16px;padding:5px 12px;font-size:11px;font-weight:500;color:var(--white,#fff);white-space:nowrap;cursor:pointer;flex-shrink:0;font-family:\'DM Sans\',sans-serif;" class="cp-fbtn active">All (' + cityShops.length + ')</button>';
      catKeys.forEach(function (c) {
        filterHTML += '<button data-cat="' + c + '" style="background:var(--white10,rgba(255,255,255,.08));border:1px solid var(--border,rgba(255,255,255,.08));border-radius:16px;padding:5px 12px;font-size:11px;font-weight:500;color:var(--white70,rgba(255,255,255,.7));white-space:nowrap;cursor:pointer;flex-shrink:0;font-family:\'DM Sans\',sans-serif;" class="cp-fbtn">' + c + ' (' + categories[c] + ')</button>';
      });
      filterHTML += '</div>';

      // Sort all listings: verified first, then by rating
      var sortedAll = cityShops.slice().sort(function (a, b) {
        return (VER_SET.has(b.id) ? 1 : 0) - (VER_SET.has(a.id) ? 1 : 0) || b.rating - a.rating;
      });

      var allGridHTML = filterHTML +
        '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;" id="cpAllGrid" class="cp-grid">' +
        sortedAll.map(gridCard).join('') + '</div>';

      html += buildSection('All ' + cityName + ' Listings', 'cpAll', allGridHTML);

      // Render
      if (contentEl) contentEl.innerHTML = html;

      // Category filter interactivity
      var filterWrap = document.getElementById('cpCatFilter');
      if (filterWrap) {
        filterWrap.addEventListener('click', function (e) {
          var btn = e.target.closest('.cp-fbtn');
          if (!btn) return;
          // Update active state
          filterWrap.querySelectorAll('.cp-fbtn').forEach(function (b) {
            b.classList.remove('active');
            b.style.background = 'var(--white10,rgba(255,255,255,.08))';
            b.style.borderColor = 'var(--border,rgba(255,255,255,.08))';
            b.style.color = 'var(--white70,rgba(255,255,255,.7))';
          });
          btn.classList.add('active');
          btn.style.background = 'var(--red,#e8142a)';
          btn.style.borderColor = 'var(--red,#e8142a)';
          btn.style.color = 'var(--white,#fff)';

          var cat = btn.getAttribute('data-cat');
          var filtered = cat === 'all' ? sortedAll : sortedAll.filter(function (s) {
            return s.categories.some(function (c) { return c === cat; });
          });
          document.getElementById('cpAllGrid').innerHTML = filtered.map(gridCard).join('');
        });
      }

      // Log for verification
      console.log('[city-page] ' + cityName + ': ' + cityShops.length + ' listings loaded (total dataset: ' + data.length + ')');
    })
    .catch(function (err) {
      console.error('[city-page] Failed to load listings:', err);
      if (contentEl) contentEl.innerHTML = '<p style="text-align:center;padding:40px;color:var(--white40,rgba(255,255,255,.4));">Failed to load listings. Please try again.</p>';
    });
})();
