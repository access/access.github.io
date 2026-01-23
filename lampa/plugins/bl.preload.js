(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.Preload = BL.Preload || {};

  var FLAG = 'msx_preload_applied_v1';
  var FALLBACK_KEY = 'msx_preload_json_v1';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (_) { } }

  function normalizeRoot(obj) {
    try {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
      if (obj.storage && typeof obj.storage === 'object' && !Array.isArray(obj.storage)) return obj.storage;
      return obj;
    } catch (_) {
      return null;
    }
  }

  function applyJson(obj) {
    try {
      var map = normalizeRoot(obj);
      if (!map) {
        try { console.log('[BL][preload] root is not object map'); } catch (_) { }
        return;
      }

      var keys = Object.keys(map);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = map[k];

        if (typeof v === 'string') {
          // важно: НЕ JSON.stringify, иначе получишь "\"false\"" вместо "false"
          lsSet(k, v);
        }
        else if (v && typeof v === 'object') {
          // массивы/объекты
          lsSet(k, JSON.stringify(v));
        }
        else {
          // number/boolean/null/undefined
          lsSet(k, String(v));
        }
      }

      lsSet(FLAG, '1');
      try { console.log('[BL][preload] applied keys=' + keys.length); } catch (_) { }
    } catch (e) {
      try { console.log('[BL][preload] apply error', e && e.message ? e.message : e); } catch (_) { }
    }
  }

  function resolveJsonUrl(base) {
    try {
      return String(new URL('bl.preload.json', base || location.href).href);
    } catch (_) {
      return 'bl.preload.json';
    }
  }

  BL.Preload.apply = function (opts) {
    opts = opts || {};

    return new Promise(function (resolve) {
      try {
        // already applied
        if (lsGet(FLAG) === '1') {
          try { console.log('[BL][preload] skip (flag)'); } catch (_) { }
          return resolve(true);
        }

        // where json lives
        var base = '';
        try { base = opts && opts.base ? String(opts.base) : (BL.ctx && BL.ctx.base ? String(BL.ctx.base) : ''); } catch (_) { base = ''; }
        var jsonUrl = resolveJsonUrl(base);

        // legacy fallback slot (kept for compatibility)
        try { if (opts && opts.fallbackKey) FALLBACK_KEY = String(opts.fallbackKey); } catch (_) { }
        try { void FALLBACK_KEY; } catch (_) { }

        if (window.fetch) {
          fetch(jsonUrl, { cache: 'no-cache' }).then(function (r) {
            return r.json();
          }).then(function (obj) {
            applyJson(obj);
            resolve(true);
          }).catch(function (e) {
            try { console.log('[BL][preload] fetch error', e && e.message ? e.message : e); } catch (_) { }
            resolve(false);
          });
          return;
        }

        // XHR fallback
        var xhr = new XMLHttpRequest();
        xhr.open('GET', jsonUrl, true);
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) return;
          if (xhr.status >= 200 && xhr.status < 300) {
            try { applyJson(JSON.parse(xhr.responseText || '{}')); } catch (_) { }
          } else {
            try { console.log('[BL][preload] xhr status', xhr.status); } catch (_) { }
          }
          resolve(true);
        };
        xhr.send(null);
      } catch (e2) {
        try { console.log('[BL][preload] load error', e2 && e2.message ? e2.message : e2); } catch (_) { }
        resolve(false);
      }
    });
  };
})();

