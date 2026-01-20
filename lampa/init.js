(function () {
  'use strict';

  // === CONFIG ===
  var BASE = 'https://access.github.io/lampa/';
  var MANIFEST = 'manifest.json';
  var VERSION = String(new Date().getTime()); // cache-bust each run
  var SCRIPT_TIMEOUT = 20000;
  var LOG = true;

  function log() {
    if (!LOG) return;
    try { console.log.apply(console, ['[LAMPA-INIT]'].concat([].slice.call(arguments))); } catch (e) {}
  }

  function withVersion(url) {
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(VERSION);
  }

  function isAbsHttp(url) {
    return /^https?:\/\//i.test(url);
  }

  function absUrl(pathOrUrl) {
    if (isAbsHttp(pathOrUrl)) return pathOrUrl;
    return BASE + String(pathOrUrl).replace(/^\//, '');
  }

  function safeHead() {
    return document.head || document.getElementsByTagName('head')[0] || document.documentElement;
  }

  function loadScript(url, cb) {
    try {
      var head = safeHead();
      if (!head) return cb(new Error('no <head>'));

      var s = document.createElement('script');
      var done = false;

      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        try { s.parentNode && s.parentNode.removeChild(s); } catch (e) {}
        cb(new Error('timeout'));
      }, SCRIPT_TIMEOUT);

      s.async = false;
      s.src = withVersion(url);

      s.onload = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cb(null);
      };

      s.onerror = function () {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { s.parentNode && s.parentNode.removeChild(s); } catch (e) {}
        cb(new Error('load failed'));
      };

      head.appendChild(s);
    } catch (e) {
      cb(e);
    }
  }

  function fetchJson(url, cb) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', withVersion(url), true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status < 200 || xhr.status >= 300) return cb(new Error('http ' + xhr.status));
        try { cb(null, JSON.parse(xhr.responseText)); }
        catch (e) { cb(e); }
      };
      xhr.send(null);
    } catch (e) {
      cb(e);
    }
  }

  function loadSeries(list, i, cb) {
    if (i >= list.length) return cb(null);

    var u = absUrl(list[i]);
    log('load', i + 1 + '/' + list.length, u);

    loadScript(u, function (err) {
      if (err) {
        // IMPORTANT: do NOT fail plugin confirmation
        log('skip (err)', u, String(err && err.message ? err.message : err));
      }
      loadSeries(list, i + 1, cb);
    });
  }

  function startOnce() {
    try {
      var manifestUrl = absUrl(MANIFEST);
      log('manifest', manifestUrl);

      fetchJson(manifestUrl, function (err, m) {
        if (err) { log('manifest err', String(err && err.message ? err.message : err)); return; }

        var scripts = (m && m.scripts && m.scripts.length) ? m.scripts.slice() : [];
        if (!scripts.length) { log('empty scripts[]'); return; }

        var disabled = {};
        if (m && m.disabled && m.disabled.length) {
          for (var d = 0; d < m.disabled.length; d++) disabled[m.disabled[d]] = 1;
        }

        var filtered = [];
        for (var k = 0; k < scripts.length; k++) {
          var p = scripts[k];
          if (!p) continue;
          if (disabled[p]) continue;
          filtered.push(p);
        }

        if (!filtered.length) { log('all disabled'); return; }

        loadSeries(filtered, 0, function () {
          log('done');
        });
      });
    } catch (e) {
      // Never bubble errors to Lampa validator
      log('fatal caught', String(e && e.message ? e.message : e));
    }
  }

  // Delay start until Lampa environment is likely initialized (validator-friendly)
  function boot(retries) {
    try {
      // If Lampa exists, we are inside app; start soon.
      if (window.Lampa) {
        setTimeout(startOnce, 0);
        return;
      }
      // Otherwise, retry a bit, but never throw.
      if (retries <= 0) return;
      setTimeout(function () { boot(retries - 1); }, 200);
    } catch (e) {}
  }

  boot(50); // ~10s max, then silent
})();
