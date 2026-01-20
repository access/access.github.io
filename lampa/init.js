(function () {
  'use strict';

  var BASE = 'https://access.github.io/lampa/';
  var MANIFEST = 'manifest.json';

  // cache-bust на каждый запуск (ES5)
  var VERSION = String(new Date().getTime());

  var SCRIPT_TIMEOUT = 20000;
  var LOG = true;

  function log() {
    if (!LOG) return;
    try { console.log.apply(console, ['[LAMPA-LOADER]'].concat([].slice.call(arguments))); } catch (e) {}
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

  function loadScript(url, cb) {
    var s = document.createElement('script');
    var done = false;

    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      try { s.parentNode && s.parentNode.removeChild(s); } catch (e) {}
      cb(new Error('Timeout: ' + url));
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
      cb(new Error('Failed: ' + url));
    };

    document.head.appendChild(s);
  }

  function fetchJson(url, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', withVersion(url), true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status < 200 || xhr.status >= 300) {
        cb(new Error('HTTP ' + xhr.status + ' for ' + url));
        return;
      }
      try {
        cb(null, JSON.parse(xhr.responseText));
      } catch (e) {
        cb(new Error('JSON parse failed for ' + url));
      }
    };
    xhr.send(null);
  }

  function loadSeries(list, i, cb) {
    if (i >= list.length) return cb(null);
    var u = absUrl(list[i]);
    log('Load:', u);
    loadScript(u, function (err) {
      if (err) return cb(err);
      loadSeries(list, i + 1, cb);
    });
  }

  function start() {
    var manifestUrl = absUrl(MANIFEST);
    log('Manifest:', manifestUrl);

    fetchJson(manifestUrl, function (err, m) {
      if (err) {
        log('FATAL manifest:', err && err.message ? err.message : err);
        return;
      }

      var scripts = (m && m.scripts && m.scripts.length) ? m.scripts.slice() : [];
      if (!scripts.length) {
        log('FATAL: manifest scripts[] empty');
        return;
      }

      // disabled[] (ES5)
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

      if (!filtered.length) {
        log('FATAL: all scripts disabled/empty');
        return;
      }

      loadSeries(filtered, 0, function (e2) {
        if (e2) {
          log('FATAL load:', e2 && e2.message ? e2.message : e2);
          return;
        }
        log('Done');
      });
    });
  }

  if (document.readyState === 'loading') {
    if (document.addEventListener) document.addEventListener('DOMContentLoaded', start, false);
    else window.attachEvent && window.attachEvent('onload', start);
  } else {
    start();
  }
})();
