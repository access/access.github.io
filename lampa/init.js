(function () {
  'use strict';

  var BASE = 'https://access.github.io/lampa/';
  var MANIFEST = 'manifest.json';

  // жесткий анти-кеш для манифеста/скриптов
  var VERSION = Date.now().toString();

  var LOG = true;
  var WAIT_TIMEOUT = 20000;
  var SCRIPT_TIMEOUT = 30000;
  var POLL_MS = 100;

  function log() {
    if (!LOG) return;
    try { console.log.apply(console, ['[LAMPA-LOADER]'].concat([].slice.call(arguments))); } catch (_) {}
  }

  function withVersion(url) {
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(VERSION);
  }

  function absUrl(pathOrUrl) {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
      return BASE + String(pathOrUrl || '').replace(/^\//, '');
  }

  function normalizeUrl(url) {
    // Если Lampa запущена по https — http скрипты часто будут блокироваться (mixed content).
    if (location && location.protocol === 'https:' && /^http:\/\//i.test(url)) {
      var https = url.replace(/^http:\/\//i, 'https://');
      log('UPGRADE http -> https:', url, '=>', https);
      return https;
    }
    return url;
  }

  function waitReady() {
    var start = Date.now();
    return new Promise(function (resolve, reject) {
      (function tick() {
        var ok = (typeof window.Lampa !== 'undefined') && (typeof window.complite === 'function');
        if (ok) return resolve();
        if (Date.now() - start > WAIT_TIMEOUT) {
          return reject(new Error('Timeout waiting Lampa+complite()'));
        }
        setTimeout(tick, POLL_MS);
      })();
    });
  }

  function fetchJson(url) {
    return fetch(withVersion(url), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
      return r.json();
    });
  }

  function loadScript(url) {
    url = normalizeUrl(url);

    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      var done = false;

      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        try { s.remove(); } catch (_) {}
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
        try { s.remove(); } catch (_) {}
        reject(new Error('Failed to load: ' + url));
      };

      document.head.appendChild(s);
    });
  }

  function series(items, fn) {
    return items.reduce(function (p, item) {
      return p.then(function () { return fn(item); });
    }, Promise.resolve());
  }

  function start() {
    var compliteFn = window.complite; // сохранить оригинал, НЕ перетирать

    var manifestUrl = absUrl(MANIFEST);
    log('Manifest:', manifestUrl);

    return fetchJson(manifestUrl).then(function (m) {
      var scripts = (m && m.scripts) ? m.scripts.slice() : [];
      var disabled = (m && m.disabled) ? new Set(m.disabled) : new Set();

      scripts = scripts.filter(function (p) { return p && !disabled.has(p); });
      if (!scripts.length) throw new Error('Manifest scripts[] empty');

      return series(scripts, function (p) {
        var url = absUrl(p);
        log('Load:', url);
        return loadScript(url);
      });
    }).then(function () {
      log('Done -> complite()');
      try { compliteFn(); } catch (e) { log('complite() error:', e && e.message ? e.message : e); }
    }).catch(function (e) {
      log('FATAL:', e && e.message ? e.message : e);
      // если упали — лучше НЕ звать complite(), иначе будет “200 рабочий” при реально сломанной загрузке
    });
  }

  waitReady().then(start).catch(function (e) {
    log('FATAL:', e && e.message ? e.message : e);
  });
})();
