(function () {
  'use strict';

  // Pages root: https://access.github.io/lampa/...
  var BASE = 'https://access.github.io/lampa/';
  var MANIFEST = 'manifest.json';

  // cache-bust (поменяй при релизе)
  var VERSION = Date.now().toString();

  var SCRIPT_TIMEOUT = 20000;
  var LOG = true;

  function log() {
    if (!LOG) return;
    try { console.log.apply(console, ['[LAMPA-LOADER]'].concat([].slice.call(arguments))); } catch (_) {}
  }

  function withVersion(url) {
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(VERSION);
  }

  function absUrl(pathOrUrl) {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    return BASE + pathOrUrl.replace(/^\//, '');
  }

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      var done = false;

      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        s.remove();
        reject(new Error('Timeout: ' + url));
      }, SCRIPT_TIMEOUT);

      s.async = false;
      s.src = withVersion(url);

      s.onload = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      };

      s.onerror = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        s.remove();
        reject(new Error('Failed to load: ' + url));
      };

      document.head.appendChild(s);
    });
  }

  function fetchJson(url) {
    return fetch(withVersion(url), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
      return r.json();
    });
  }

  function series(items, fn) {
    return items.reduce(function (p, item) {
      return p.then(function () { return fn(item); });
    }, Promise.resolve());
  }

  function start() {
    var manifestUrl = absUrl(MANIFEST);
    log('Manifest:', manifestUrl);

    return fetchJson(manifestUrl).then(function (m) {
      var scripts = (m && m.scripts) ? m.scripts.slice() : [];
      var disabled = (m && m.disabled) ? new Set(m.disabled) : new Set();

      scripts = scripts.filter(function (p) { return p && !disabled.has(p); });
      if (!scripts.length) throw new Error('Manifest has empty scripts[]');

      return series(scripts, function (p) {
        var url = absUrl(p);
        log('Load:', url);
        return loadScript(url);
      });
    }).then(function () {
      log('Done');
    }).catch(function (e) {
      log('FATAL:', e && e.message ? e.message : e);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
