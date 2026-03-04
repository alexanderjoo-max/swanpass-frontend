/**
 * include.js — Load shared HTML partials (header, footer) into pages
 * Usage: Add data-include="partials/header.html" to any element
 */
(function () {
  document.querySelectorAll('[data-include]').forEach(function (el) {
    var file = el.getAttribute('data-include');
    if (!file) return;
    fetch(file)
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load ' + file);
        return res.text();
      })
      .then(function (html) {
        el.innerHTML = html;
        // Re-run any inline scripts in the partial
        el.querySelectorAll('script').forEach(function (oldScript) {
          var newScript = document.createElement('script');
          if (oldScript.src) {
            newScript.src = oldScript.src;
          } else {
            newScript.textContent = oldScript.textContent;
          }
          oldScript.parentNode.replaceChild(newScript, oldScript);
        });
      })
      .catch(function (err) {
        console.warn('Include error:', err.message);
      });
  });
})();
