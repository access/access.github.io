(function () {
  'use strict';

  // === CONFIG ===
  // Твой GitHub Pages base URL (папка, где лежат lampa.js + manifest.json + scripts/)
  var BASE = 'https://access.github.io/'; // <-- поменяй под себя, если надо

  // Файл-манифест со списком скриптов (относительно BASE)
  var MANIFEST = 'manifest.json';

  // Фоллбек-бандл (если манифест не загрузился)
  var FALLBACK_BUNDLE = 'bundle.min.js';

  // Версия для cache-bust (лучше ставь число/дату при деплое)
  var VERSION = '2026-01-20-1';

  // Таймаут на загрузку каждого скрипта (мс)
  var SCRIPT_TIMEOUT = 20000;

  // Печатать лог
  var LOG = true;

  function log() {
    if (!LOG) return;
    try { console.log.apply(console, ['[LAMPA-LOADER]'].concat([].slice.call(arguments))); }
    catch (_) {}
  }

  function withVersion(url) {
    if (url.indexOf('?') >= 0) return url + '&v=' + encodeURIComponent(VERSION);
    return url + '?v=' + encodeURIComponent(VERSION);
  }

  function absUrl(pathOrUrl) {
    // если уже https://...
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    // нормализуем слеши
    if (BASE.endsWith('/') && pathOrUrl.startsWith('/')) return BASE + pathOrUrl.slice(1);
    if (!BASE.endsWith('/') && !pathOrUrl.startsWith('/')) return BASE + '/' + pathOrUrl;
    return BASE + pathOrUrl;
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

      s.async = false; // важно для порядка в старых окружениях
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
    log('Base:', BASE);
    log('Manifest:', manifestUrl);

    return fetchJson(manifestUrl)
      .then(function (m) {
        // ожидаем формат:
        // { "scripts": ["scripts/a.js", "scripts/b.js"], "disabled": ["scripts/x.js"] }
        var scripts = (m && m.scripts) ? m.scripts.slice() : [];
        var disabled = (m && m.disabled) ? new Set(m.disabled) : new Set();

        scripts = scripts.filter(function (p) { return p && !disabled.has(p); });

        if (!scripts.length) {
          throw new Error('Manifest has empty scripts[]');
        }

        log('Scripts:', scripts);

        return series(scripts, function (p) {
          var url = absUrl(p);
          log('Load:', url);
          return loadScript(url);
        });
      })
      .catch(function (e) {
        log('Manifest failed, fallback to bundle:', e && e.message ? e.message : e);
        var fallbackUrl = absUrl(FALLBACK_BUNDLE);
        return loadScript(fallbackUrl);
      })
      .then(function () {
        log('Done');
      })
      .catch(function (e) {
        log('FATAL:', e && e.message ? e.message : e);
        // если хочешь — раскомментируй:
        // alert('[LAMPA-LOADER] FATAL: ' + (e && e.message ? e.message : e));
      });
  }

  // Запуск как можно раньше, но после появления document.head
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
