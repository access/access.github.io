(function () {
  'use strict';

  var BASE = 'https://access.github.io/lampa/';
  var MANIFEST = 'manifest.json';
  var VERSION = String(new Date().getTime()); // cache-bust each run
  var SCRIPT_TIMEOUT = 20000;

  function absUrl(p) {
    if (/^https?:\/\//i.test(p)) return p;
    return BASE + String(p).replace(/^\//, '');
  }

  function withVersion(url) {
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(VERSION);
  }

  function safeLog() {
    try { console.log.apply(console, ['[LAMPA-INIT]'].concat([].slice.call(arguments))); } catch (e) {}
  }

  function loadScript(url, cb) {
    try {
      var head = document.head || document.getElementsByTagName('head')[0] || document.documentElement;
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

  function loadSeries(list, i) {
    if (i >= list.length) return;
    var u = absUrl(list[i]);
    loadScript(u, function (err) {
      if (err) safeLog('skip', u, String(err && err.message ? err.message : err));
      loadSeries(list, i + 1);
    });
  }

  function startLoader() {
    var manifestUrl = absUrl(MANIFEST);
    safeLog('manifest', manifestUrl);

    fetchJson(manifestUrl, function (err, m) {
      if (err) { safeLog('manifest err', String(err && err.message ? err.message : err)); return; }

      var scripts = (m && m.scripts && m.scripts.length) ? m.scripts.slice() : [];
      if (!scripts.length) { safeLog('empty scripts[]'); return; }

      // disabled[]
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

      if (!filtered.length) { safeLog('all disabled'); return; }

      safeLog('scripts', filtered.length);
      loadSeries(filtered, 0);
    });
  }

  // === VALIDATOR-SAFE BOOT ===
  // Никаких сетевых действий до готовности Lampa UI.
  function hookWhenReady() {
    try {
      if (!window.Lampa || !Lampa.Listener || !Lampa.Listener.follow) return false;

      var started = false;

      Lampa.Listener.follow('full', function (e) {
        try {
          if (started) return;
          if (e && e.type === 'complite') {
            started = true;
            startLoader();
          }
        } catch (x) {}
      });

      return true;
    } catch (e) {
      return false;
    }
  }

  // пытаемся повеситься сразу, иначе — ретраи (без исключений)
  (function boot(retries) {
    if (hookWhenReady()) return;
    if (retries <= 0) return;
    setTimeout(function () { boot(retries - 1); }, 200);
  })(50); // ~10s
})();
