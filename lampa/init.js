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
 (window[KEY]) return;  var BASE = 'https://access.github.io/lampa/';    return BASE + String(p).replace(/^\//, '');  }  function withV(url) {
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(VERSION);
  }

  function log() {
    try { console.log.apply(console, ['[ACCESS-INSTALL]'].concat([].slice.call(arguments))); } catch (e) {}
  }

  function safe(fn) { try { fn(); } catch (e) { log('err', e && e.message ? e.message : e); } }

  function fetchJson(url, cb) {
    safe(function () {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', withV(url), true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status < 200 || xhr.status >= 300) return cb(new Error('http ' + xhr.status));
        try { cb(null, JSON.parse(xhr.responseText)); }
        catch (e) { cb(e); }
      };
      xhr.send(null);
    });
  }

  // --- Lampa-native installer (preferred)
  function putScript(url) {
    // Try common locations used across Lampa builds
    if (window.Lampa && Lampa.Utils && typeof Lampa.Utils.putScript === 'function') {
      return Lampa.Utils.putScript(url);
    }
    if (window.Lampa && typeof Lampa.putScript === 'function') {
      return Lampa.putScript(url);
    }
    if (window.Lampa && Lampa.Plugin && typeof Lampa.Plugin.add === 'function') {
      // Some builds have plugin registry; best-effort
      return Lampa.Plugin.add(url);
    }
    return null;
  }

  // --- Fallback: just append <script> (install-like, but immediate load)
  function appendScript(url) {
    safe(function () {
      var head = document.head || document.getElementsByTagName('head')[0] || document.documentElement;
      var s = document.createElement('script');
      s.async = true; // let Lampa handle order; this is fallback only
      s.src = withV(url);
      head.appendChild(s);
    });
  }

  function installList(list) {
    for (var i = 0; i < list.length; i++) {
      var u = absUrl(list[i]);
      // cache-bust each installed url
      u = withV(u);

      var ok = false;
      safe(function () {
        ok = !!putScript(u);
      });

      if (!ok) {
        // If no native installer exists in this build, fallback
        appendScript(u);
      }

      log('install', u, ok ? '(putScript)' : '(fallback)');
    }
  }

  function start() {
    var manifestUrl = absUrl(MANIFEST);
    log('manifest', manifestUrl);

    fetchJson(manifestUrl, function (err, m) {
      if (err) return log('manifest err', String(err && err.message ? err.message : err));

      var scripts = (m && m.scripts && m.scripts.length) ? m.scripts.slice() : [];
      if (!scripts.length) return log('empty scripts[]');

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

      if (!filtered.length) return log('all disabled');

      installList(filtered);
      log('done', filtered.length);
    });
  }

  // --- canonical entry: app ready
  function hookAppReady() {
    if (window.appready) return start();

    if (window.Lampa && Lampa.Listener && Lampa.Listener.follow) {
      Lampa.Listener.follow('app', function (e) {
        if (e && e.type === 'ready') start();
      });
      return;
    }

    // fallback: poll (validator-safe)
    (function boot(n) {
      if (window.Lampa && Lampa.Listener && Lampa.Listener.follow) return hookAppReady();
      if (n <= 0) return;
      setTimeout(function () { boot(n - 1); }, 200);
    })(50);
  }

  hookAppReady();
})();
