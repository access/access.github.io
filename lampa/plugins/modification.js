(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.ctx = BL.ctx || {};

  // ============================================================================
  // BlackLampa entrypoint (bootstrapping only)
  //
  // Two-phase boot is REQUIRED:
  //
  //   PHASE 0 (pre-auth, runs immediately on script load)
  //     - init logging
  //     - install security policy (fetch/xhr/ws/beacon blocking + CUB blacklist override)
  //     - install storage guards (plugins_blacklist wipe + guard + watchdog)
  //     - MUST NOT touch any "user activity":
  //         * no preload apply
  //         * no plugin install/enable/inject
  //         * no Lampa.SettingsApi / no Lampa.Storage('plugins') modifications
  //
  //   PHASE 1 (post-auth, only after BL.Auth.start() resolves)
  //     - apply preload localStorage
  //     - run autoplugin installer/settings
  //
  // Goal: protections must work while auth UI waits for password.
  // ============================================================================

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

  function consoleLine(level, module, message, extra) {
    try {
      var line = '[BlackLampa] ' + String(level) + ' ' + String(module) + ': ' + String(message) + (extra ? (' | ' + String(extra)) : '');
      var fn = null;
      if (level === 'ERR') fn = (console && console.error) ? console.error : null;
      else if (level === 'WRN') fn = (console && console.warn) ? console.warn : null;
      else if (level === 'DBG') fn = (console && console.debug) ? console.debug : null;
      else fn = (console && console.log) ? console.log : null;
      if (fn) fn.call(console, line);
    } catch (_) { }
  }

  function log(level, module, message, extra) {
    try {
      if (!BL.Log) throw 0;
      if (level === 'ERR' && BL.Log.showError) return BL.Log.showError(module, message, extra);
      if (level === 'WRN' && BL.Log.showWarn) return BL.Log.showWarn(module, message, extra);
      if (level === 'OK' && BL.Log.showOk) return BL.Log.showOk(module, message, extra);
      if (level === 'INF' && BL.Log.showInfo) return BL.Log.showInfo(module, message, extra);
      if (level === 'DBG' && BL.Log.showDbg) return BL.Log.showDbg(module, message, extra);
    } catch (_) { }
    consoleLine(level, module, message, extra);
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
            log('WRN', 'Boot', 'script load fail', url);
            setTimeout(next, 0);
          };
          (document.head || document.documentElement).appendChild(s);
        } catch (e) {
          log('WRN', 'Boot', 'script load exception', url + ' | ' + (e && e.message ? e.message : e));
          setTimeout(next, 0);
        }
      }

      next();
    });
  }

  // ============================================================================
  // PHASE 0 (pre-auth): logging + security policy + guards
  // ============================================================================
  function phase0Init() {
    try {
      if (BL.Log && BL.Log.init) {
        BL.Log.init({
          defaultMode: 1,
          titlePrefix: 'BlackLampa log',
          popupMs: 20000,
          maxLines: 120
        });
      }
    } catch (_) { }

    log('INF', 'Boot', 'phase0 init', 'policy + guards are active before auth');

    // Network policy (idempotent; safe to call multiple times)
    try {
      if (BL.PolicyNetwork && BL.PolicyNetwork.install) BL.PolicyNetwork.install(BL.Log);
    } catch (e) {
      log('ERR', 'Policy', 'install failed', e && e.message ? e.message : e);
    }

    // Storage guards (idempotent; safe to call multiple times)
    try {
      if (BL.Storage && BL.Storage.Guards && BL.Storage.Guards.installPluginsBlacklistGuard) {
        BL.Storage.Guards.installPluginsBlacklistGuard(BL.Log);
      }
    } catch (e2) {
      log('ERR', 'Guards', 'install failed', e2 && e2.message ? e2.message : e2);
    }
  }

  // ============================================================================
  // PHASE 1 (post-auth): user actions ONLY after successful auth
  // ============================================================================
  function phase1Run() {
    log('INF', 'Boot', 'phase1 start', 'preload + autoplugin (post-auth only)');

    return loadSeq([
      'bl.preload.js',
      'bl.autoplugin.js'
    ]).then(function () {
      var p = Promise.resolve(true);

      if (BL.Preload && BL.Preload.apply) {
        p = p.then(function () {
          log('INF', 'Preload', 'apply', 'bl.preload.json');
          return BL.Preload.apply({ base: BL.ctx.base });
        });
      }

      if (BL.Autoplugin && BL.Autoplugin.start) {
        p = p.then(function () {
          log('INF', 'AutoPlugin', 'start', 'bl.autoplugin.json');
          return BL.Autoplugin.start({ base: BL.ctx.base });
        });
      }

      return p;
    });
  }

  function startAuth() {
    if (!BL.Auth || !BL.Auth.start) {
      log('ERR', 'Boot', 'missing BL.Auth', '');
      return Promise.reject(new Error('BL.Auth missing'));
    }

    log('INF', 'Auth', 'start', 'waiting for password');
    return BL.Auth.start().then(function () {
      log('OK', 'Auth', 'ok', 'unlocked');
      return true;
    });
  }

  // ============================================================================
  // Boot sequence
  // ============================================================================
  loadSeq([
    'bl.core.js',
    'bl.ui.log.js',
    'bl.storage.guards.js',
    'bl.policy.network.js'
  ]).then(function () {
    phase0Init();

    // Auth UI is loaded AFTER protections are in place.
    return loadSeq(['bl.auth.js']);
  }).then(function () {
    return startAuth();
  }).then(function () {
    return phase1Run();
  }).catch(function (e) {
    log('ERR', 'Boot', 'boot error', e && e.message ? e.message : e);
  });
})();
