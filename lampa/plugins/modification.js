(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.ctx = BL.ctx || {};

  function baseDir() {
    try {
      var s = document.currentScript && document.currentScript.src ? String(document.currentScript.src) : '';
      if (!s) return '';
      return s.slice(0, s.lastIndexOf('/') + 1);
    } catch (_) { return ''; }
  }

  BL.ctx.base = baseDir();

  function abs(u) {
    try { return String(new URL(String(u), BL.ctx.base || location.href).href); }
    catch (_) { return String(u); }
  }

  function loadSeq(srcs) {
    return new Promise(function (resolve) {
      var i = 0;

      function next() {
        if (i >= srcs.length) return resolve(true);

        var url = abs(srcs[i++]);

        try {
          var s = document.createElement('script');
          s.src = url;
          s.async = false;
          s.onload = function () { setTimeout(next, 0); };
          s.onerror = function () {
            try { console.log('[BL] script load fail', url); } catch (_) { }
            setTimeout(next, 0);
          };
          (document.head || document.documentElement).appendChild(s);
        } catch (e) {
          try { console.log('[BL] script load exception', url, e && e.message ? e.message : e); } catch (_) { }
          setTimeout(next, 0);
        }
      }

      next();
    });
  }

  function runAfterAuth() {
    return loadSeq([
      'bl.core.js',
      'bl.ui.log.js',
      'bl.storage.guards.js',
      'bl.policy.network.js',
      'bl.preload.js',
      'bl.autoplugin.js'
    ]).then(function () {
      var p = Promise.resolve(true);

      if (BL.Preload && BL.Preload.apply) {
        p = p.then(function () { return BL.Preload.apply({ base: BL.ctx.base }); });
      }

      if (BL.Autoplugin && BL.Autoplugin.start) {
        p = p.then(function () { return BL.Autoplugin.start({ base: BL.ctx.base }); });
      }

      return p;
    });
  }

  function boot() {
    if (!BL.Auth || !BL.Auth.start) {
      try { console.log('[BL] missing BL.Auth'); } catch (_) { }
      return;
    }

    BL.Auth.start().then(function () {
      return runAfterAuth();
    }).catch(function (e) {
      try { console.log('[BL] boot error', e && e.message ? e.message : e); } catch (_) { }
    });
  }

  // 1) auth module first (быстро показать lock UI)
  loadSeq(['bl.auth.js']).then(boot);
})();
