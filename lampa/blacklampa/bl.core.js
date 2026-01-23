(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.Core = BL.Core || {};

  function safe(fn, fallback) {
    try { return fn(); } catch (_) { return fallback; }
  }

  function toInt(x, d) {
    var n = parseInt(x, 10);
    return isNaN(n) ? d : n;
  }

  function fmtErr(e) {
    try {
      if (!e) return 'unknown error';
      if (typeof e === 'string') return e;
      if (e && e.message) return e.message;
      return String(e);
    } catch (_) {
      return 'unknown error';
    }
  }

  function getQueryParam(name) {
    try {
      var s = String(location.search || '');
      if (!s) return null;
      if (s.charAt(0) === '?') s = s.slice(1);
      var parts = s.split('&');
      for (var i = 0; i < parts.length; i++) {
        var kv = parts[i].split('=');
        if (decodeURIComponent(kv[0] || '') === name) return decodeURIComponent(kv[1] || '');
      }
    } catch (_) { }
    return null;
  }

  function absUrl(u, base) {
    try { return String(new URL(String(u), base || location.href).href); }
    catch (_) { return String(u); }
  }

  function loadScript(url, opts) {
    return new Promise(function (resolve, reject) {
      try {
        opts = opts || {};
        var s = document.createElement('script');
        s.src = url;
        s.async = opts.async ? true : false;
        s.onload = function () { resolve(true); };
        s.onerror = function () { reject(new Error('load fail: ' + url)); };
        (document.head || document.documentElement).appendChild(s);
      } catch (e) {
        reject(e);
      }
    });
  }

  function loadScriptSeq(urls, opts) {
    return new Promise(function (resolve, reject) {
      opts = opts || {};
      if (!urls || !urls.length) return resolve(true);

      var i = 0;
      function next() {
        if (i >= urls.length) return resolve(true);
        var u = String(urls[i++]);
        loadScript(u, { async: false }).then(function () {
          setTimeout(next, 0);
        }).catch(function (e) {
          if (opts.continueOnError) {
            try { if (opts.onError) opts.onError(u, e); } catch (_) { }
            setTimeout(next, 0);
            return;
          }
          reject(e);
        });
      }
      next();
    });
  }

  function loadJson(url, opts) {
    opts = opts || {};
    var cache = opts.cache || 'no-store';

    return new Promise(function (resolve, reject) {
      try {
        if (window.fetch) {
          fetch(url, { cache: cache }).then(function (r) {
            if (!r) throw new Error('no response');
            return r.json();
          }).then(resolve).catch(reject);
          return;
        }

        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        try { xhr.setRequestHeader('Cache-Control', cache); } catch (_) { }
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) return;
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText || '{}')); } catch (e) { reject(e); }
          } else {
            reject(new Error('xhr status ' + String(xhr.status)));
          }
        };
        xhr.onerror = function () { reject(new Error('xhr error')); };
        xhr.send(null);
      } catch (e2) {
        reject(e2);
      }
    });
  }

  BL.Core.safe = safe;
  BL.Core.toInt = toInt;
  BL.Core.fmtErr = fmtErr;
  BL.Core.getQueryParam = getQueryParam;
  BL.Core.absUrl = absUrl;
  BL.Core.loadScript = loadScript;
  BL.Core.loadScriptSeq = loadScriptSeq;
  BL.Core.loadJson = loadJson;
})();
