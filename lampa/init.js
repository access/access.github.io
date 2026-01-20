(function () {
  'use strict';

  // ---- identity (avoid double-run)
  var KEY = 'plugin_access_loader_ready';
  if (window[KEY]) return;
  window[KEY] = true;

  // ---- config
  var BASE = 'https://access.github.io/lampa/';
  var MANIFEST = 'manifest.json';
  var SCRIPT_TIMEOUT = 20000;

  // cache-bust per run (works with GH Pages cache)
  var VERSION = String(Date.now());

  // ---- utils
  function absUrl(p) {
    if (/^https?:\/\//i.test(p)) return p;
    return BASE + String(p).replace(/^\//, '');
  }

  function withV(url) {
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(VERSION);
  }

  function log() {
    try { console.log.apply(console, ['[ACCESS-LOADER]'].concat([].slice.call(arguments))); } catch (e) {}
  }

  function safe(fn) { try { fn(); } catch (e) { log('err', e && e.message ? e.message : e); } }

  function loadScript(url, cb) {
    safe(function () {
      var head = document.head || document.getElementsByTagName('head')[0] || document.documentElement;
      var s = document.createElement('script');
      var done = false;

      var t = setTimeout(function () {
        if (done) return;
        done = true;
        try { s.parentNode && s.parentNode.removeChild(s); } catch (e) {}
        cb(new Error('timeout'));
      }, SCRIPT_TIMEOUT);

      s.async = false;
      s.src = withV(url);

      s.onload = function () {
        if (done) return;
        done = true;
        clearTimeout(t);
        cb(null);
      };

      s.onerror = function () {
        if (done) return;
        done = true;
        clearTimeout(t);
        try { s.parentNode && s.parentNode.removeChild(s); } catch (e) {}
        cb(new Error('load failed'));
      };

      head.appendChild(s);
    });
  }

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

  function loadSeries(list, i) {
    if (i >= list.length) return log('done', list.length);
    var u = absUrl(list[i]);

    loadScript(u, function (err) {
      if (err) log('skip', u, String(err && err.message ? err.message : err));
      loadSeries(list, i + 1);
    });
  }

  function startLoader() {
    // optional: allow "run once per app session"
    safe(function () {
      if (window.Lampa && Lampa.Storage) {
        var onceKey = 'access_loader_once';
        if (Lampa.Storage.get(onceKey)) return;
        Lampa.Storage.set(onceKey, true);
      }
    });

    var manifestUrl = absUrl(MANIFEST);
    log('manifest', manifestUrl);

    fetchJson(manifestUrl, function (err, m) {
      if (err) return log('manifest err', String(err && err.message ? err.message : err));

      var scripts = (m && m.scripts && m.scripts.length) ? m.scripts.slice() : [];
      if (!scripts.length) return log('manifest empty scripts[]');

      // disabled[] (string match exactly as in manifest)
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

      log('scripts', filtered.length);
      loadSeries(filtered, 0);
    });
  }

  // ---- Lampa lifecycle entrypoint (canonical)
  function onAppReady() {
    // максимально “по-ламповски”: стартуем после app ready, а не “сразу”
    startLoader();
  }

  function hookAppReady() {
    // appready flag is used by many plugins; if not set, follow app:ready :contentReference[oaicite:2]{index=2}
    if (window.appready) return onAppReady();

    if (window.Lampa && Lampa.Listener && Lampa.Listener.follow) {
      Lampa.Listener.follow('app', function (e) {
        if (e && e.type === 'ready') onAppReady();
      });
      return;
    }

    // fallback: poll until Lampa appears (doesn't break validator)
    (function boot(n) {
      if (window.Lampa && Lampa.Listener && Lampa.Listener.follow) return hookAppReady();
      if (n <= 0) return;
      setTimeout(function () { boot(n - 1); }, 200);
    })(50);
  }

  hookAppReady();
})();
