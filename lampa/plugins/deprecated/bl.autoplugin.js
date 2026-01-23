(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.Autoplugin = BL.Autoplugin || {};

  var startPromise = null;

  function safe(fn) { try { return fn(); } catch (_) { return null; } }

  function toInt(x, d) {
    try { return (BL.Core && BL.Core.toInt) ? BL.Core.toInt(x, d) : d; }
    catch (_) { return d; }
  }

  function fmtErr(e) {
    try { return (BL.Core && BL.Core.fmtErr) ? BL.Core.fmtErr(e) : String(e || 'error'); }
    catch (_) { return 'error'; }
  }

  function absUrl(u) {
    try { return String(new URL(String(u), location.href).href); } catch (_) { return String(u); }
  }

  function configUrl(base) {
    try { return String(new URL('bl.autoplugin.json', base || location.href).href); } catch (_) { return 'bl.autoplugin.json'; }
  }

  function normalizeConfig(cfg) {
    try {
      if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return {};
      return cfg;
    } catch (_) {
      return {};
    }
  }

  function pickOption(opts, key, fallback) {
    try {
      if (!opts || typeof opts !== 'object') return fallback;
      if (opts[key] === undefined || opts[key] === null) return fallback;
      return opts[key];
    } catch (_) {
      return fallback;
    }
  }

  BL.Autoplugin.start = function (opts) {
    opts = opts || {};
    if (startPromise) return startPromise;

    var base = '';
    try { base = opts.base ? String(opts.base) : (BL.ctx && BL.ctx.base ? String(BL.ctx.base) : ''); } catch (_) { base = ''; }

    var url = configUrl(base);

    startPromise = new Promise(function (resolve) {
      var doneCalled = false;
      function doneSafe() {
        if (doneCalled) return;
        doneCalled = true;
        try { if (typeof opts.done === 'function') opts.done(); } catch (_) { }
        resolve(true);
      }

      function doneLaterFallback() {
        setTimeout(function () { doneSafe(); }, 90000);
      }

      function startWithConfig(cfg) {
        cfg = normalizeConfig(cfg);

        var cfgOpts = cfg.options || {};

        var DEFAULT_LOG_MODE = toInt(pickOption(cfgOpts, 'defaultLogMode', 1), 1);
        var AUTO_ENABLE_DISABLED = !!pickOption(cfgOpts, 'autoEnableDisabled', true);
        var INJECT_NEWLY_INSTALLED = !!pickOption(cfgOpts, 'injectNewlyInstalled', true);
        var RELOAD_AFTER_FIRST_INSTALL = !!pickOption(cfgOpts, 'reloadAfterFirstInstall', true);
        var RELOAD_DELAY_SEC = toInt(pickOption(cfgOpts, 'reloadDelaySec', 10), 10);

        safe(function () {
          if (BL.Log && BL.Log.init) {
            BL.Log.init({
              defaultMode: DEFAULT_LOG_MODE,
              titlePrefix: 'BlackLampa log',
              popupMs: 20000,
              maxLines: 120
            });
          }
        });

        var LOG_MODE = safe(function () { return BL.Log && BL.Log.mode ? BL.Log.mode() : 0; }) || 0;

        function showError(source, message, extra) { safe(function () { BL.Log && BL.Log.showError && BL.Log.showError(source, message, extra); }); }
        function showWarn(source, message, extra) { safe(function () { BL.Log && BL.Log.showWarn && BL.Log.showWarn(source, message, extra); }); }
        function showOk(source, message, extra) { safe(function () { BL.Log && BL.Log.showOk && BL.Log.showOk(source, message, extra); }); }
        function showInfo(source, message, extra) { safe(function () { BL.Log && BL.Log.showInfo && BL.Log.showInfo(source, message, extra); }); }
        function showDbg(source, message, extra) { safe(function () { BL.Log && BL.Log.showDbg && BL.Log.showDbg(source, message, extra); }); }

        // ============================================================================
        // список автоплагинов (из JSON)
        // ============================================================================
        var PLUGINS = [];
        try {
          var list = cfg.plugins;
          if (Array.isArray(list)) {
            for (var i = 0; i < list.length; i++) {
              var it = list[i];
              if (it && typeof it.url === 'string' && it.url) PLUGINS.push(String(it.url));
            }
          }
        } catch (_) { }

        // ============================================================================
        // ONE-TIME INSTALL FLAGS
        // ============================================================================
        var AP_KEYS = {
          done: 'ap_installer_done_v1',
          sig: 'ap_installer_sig_v1',
          ts: 'ap_installer_ts_v1'
        };

        function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
        function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (_) { } }
        function lsDel(k) { try { localStorage.removeItem(k); } catch (_) { } }

        // ============================================================================
        // signature (как было)
        // ============================================================================
        function djb2(str) {
          var h = 5381;
          for (var i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
          return (h >>> 0).toString(16);
        }

        function calcPluginsSig() {
          var base = 'v1|' + PLUGINS.join('\n');
          return djb2(base);
        }

        function isFirstInstallCompleted() {
          var done = lsGet(AP_KEYS.done) === '1';
          if (!done) return false;

          var sig = lsGet(AP_KEYS.sig);
          if (!sig) return false;

          return sig === calcPluginsSig();
        }

        function markFirstInstallCompleted() {
          lsSet(AP_KEYS.done, '1');
          lsSet(AP_KEYS.sig, calcPluginsSig());
          lsSet(AP_KEYS.ts, String(Date.now()));
        }

        function resetFirstInstallFlags() {
          lsDel(AP_KEYS.done);
          lsDel(AP_KEYS.sig);
          lsDel(AP_KEYS.ts);
        }

        // ============================================================================
        // status string helper + settings refresh
        // ============================================================================
        function getStatusInfoString() {
          try {
            var doneFlag = lsGet(AP_KEYS.done) === '1';
            var sigOk = (lsGet(AP_KEYS.sig) || '') === calcPluginsSig();
            var ts = toInt(lsGet(AP_KEYS.ts), 0);
            return 'done=' + (doneFlag ? '1' : '0') + ', sig=' + (sigOk ? 'ok' : 'no') + (ts ? (', ts=' + new Date(ts).toLocaleString()) : '');
          } catch (_) {
            return 'done=?, sig=?';
          }
        }

        function refreshInstallerSettingsUi() {
          try {
            if (!window.Lampa || !Lampa.SettingsApi) return;
            initInstallerSettings();
            try { if (Lampa.Settings && Lampa.Settings.update) Lampa.Settings.update(); } catch (_) { }
          } catch (_) { }
        }

        // ============================================================================
        // hard reset (localStorage + cookies + startpage) + reload
        // ============================================================================
        function clearAllCookies() {
          try {
            var cookies = String(document.cookie || '').split(';');
            var host = String(location.hostname || '');
            var domainDot = host ? '.' + host : '';
            for (var i = 0; i < cookies.length; i++) {
              var c = cookies[i];
              var eq = c.indexOf('=');
              var name = (eq >= 0 ? c.slice(0, eq) : c).trim();
              if (!name) continue;

              // path=/ (основное)
              document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
              // на всякий: текущий path
              document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=' + String(location.pathname || '/');
              // domain variants (некоторые браузеры/окружения)
              if (host) {
                document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + host;
                document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + domainDot;
              }
            }
          } catch (_) { }
        }

        function resetLampaToDefaultsAndReload() {
          showWarn('reset', 'Lampa factory reset', 'clearing localStorage + cookies + startpage');

          // startpage (на случай если clear() не сработает)
          try { lsDel('start_page'); } catch (_) { }
          try { lsDel('startpage'); } catch (_) { }
          try { lsDel('start_page_source'); } catch (_) { }
          try { lsDel('start_page_title'); } catch (_) { }
          try { lsDel('start_page_component'); } catch (_) { }
          try { lsDel('start_page_params'); } catch (_) { }
          try { lsDel('start_page_url'); } catch (_) { }

          // main wipe
          try { if (window.localStorage && localStorage.clear) localStorage.clear(); } catch (_) { }
          try { if (window.sessionStorage && sessionStorage.clear) sessionStorage.clear(); } catch (_) { }
          clearAllCookies();

          // небольшой таймаут, чтобы успело примениться
          setTimeout(function () {
            try { location.reload(); } catch (_) { }
          }, 250);
        }

        // ============================================================================
        // reload countdown after first install
        // ============================================================================
        function scheduleReloadCountdown(sec, reason) {
          try {
            if (!RELOAD_AFTER_FIRST_INSTALL) return;
            var n = toInt(sec, 10);
            if (n <= 0) { location.reload(); return; }

            showInfo('reload', 'scheduled', String(reason || 'first install') + ' | in ' + String(n) + 's');

            var t = setInterval(function () {
              n--;
              if (n > 0) {
                showDbg('reload', 'countdown', String(n));
                return;
              }
              clearInterval(t);
              showOk('reload', 'now', 'location.reload()');
              try { location.reload(); } catch (_) { }
            }, 1000);
          } catch (_) { }
        }

        // ============================================================================
        // Settings UI
        // ============================================================================
        function initInstallerSettings() {
          try {
            if (!window.Lampa || !Lampa.SettingsApi) return;

            try {
              if (Lampa.SettingsApi.removeComponent) {
                Lampa.SettingsApi.removeComponent('autoplugin_installer');
              }
            } catch (_) { }

            Lampa.SettingsApi.addComponent({
              component: 'autoplugin_installer',
              name: 'AutoPlugin Installer',
              icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 14.5h-2v-2h2v2zm0-4h-2V6h2v6.5z" fill="currentColor"/></svg>'
            });

            var added = false;

            try {
              Lampa.SettingsApi.addParam({
                component: 'autoplugin_installer',
                param: {
                  name: 'ap_reset',
                  type: 'button',
                  text: 'Сбросить флаг первой установки',
                  title: 'Сбросить флаг первой установки'
                },
                field: {
                  name: 'Переинициализация',
                  description: 'Удаляет наши ключи localStorage. После этого при следующем запуске снова пойдёт установка из массива.'
                },
                onChange: function () {
                  resetFirstInstallFlags();
                  try { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('AutoPlugin: флаг сброшен'); } catch (_) { }
                  refreshInstallerSettingsUi();
                }
              });
              added = true;
            } catch (_) { }

            if (!added) {
              Lampa.SettingsApi.addParam({
                component: 'autoplugin_installer',
                param: {
                  name: 'ap_reset_select',
                  type: 'select',
                  values: {
                    '0': '—',
                    '1': 'Сбросить флаг первой установки'
                  },
                  default: '0'
                },
                field: {
                  name: 'Переинициализация',
                  description: 'Выбери “Сбросить…”, чтобы удалить наши ключи localStorage.'
                },
                onChange: function (value) {
                  if (String(value) === '1') {
                    resetFirstInstallFlags();
                    try { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('AutoPlugin: флаг сброшен'); } catch (_) { }
                    refreshInstallerSettingsUi();
                  }
                }
              });
            }

            // новый пункт: полный сброс Lampa + reload
            var addedFactory = false;

            try {
              Lampa.SettingsApi.addParam({
                component: 'autoplugin_installer',
                param: {
                  name: 'ap_factory_reset',
                  type: 'button',
                  text: 'Сбросить Lampa до заводских (localStorage+cookies)',
                  title: 'Сбросить Lampa до заводских (localStorage+cookies)'
                },
                field: {
                  name: 'Сброс Lampa',
                  description: 'Полный сброс: localStorage + cookies + startpage, затем перезагрузка страницы.'
                },
                onChange: function () {
                  try { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('AutoPlugin: сброс Lampa...'); } catch (_) { }
                  resetLampaToDefaultsAndReload();
                }
              });
              addedFactory = true;
            } catch (_) { }

            if (!addedFactory) {
              Lampa.SettingsApi.addParam({
                component: 'autoplugin_installer',
                param: {
                  name: 'ap_factory_reset_select',
                  type: 'select',
                  values: {
                    '0': '—',
                    '1': 'Сбросить Lampa до заводских (localStorage+cookies)'
                  },
                  default: '0'
                },
                field: {
                  name: 'Сброс Lampa',
                  description: 'Выбери “Сбросить…”, чтобы очистить localStorage + cookies + startpage и перезагрузить.'
                },
                onChange: function (value) {
                  if (String(value) === '1') {
                    resetLampaToDefaultsAndReload();
                  }
                }
              });
            }

            // status
            try {
              var info = getStatusInfoString();
              Lampa.SettingsApi.addParam({
                component: 'autoplugin_installer',
                param: {
                  name: 'ap_info',
                  type: 'static',
                  values: info,
                  default: info
                },
                field: {
                  name: 'Статус',
                  description: info
                }
              });
            } catch (_) { }

          } catch (_) { }
        }

        // ============================================================================
        // global error hooks
        // ============================================================================
        var currentPlugin = null;

        function onWinError(ev) {
          if (LOG_MODE === 0) return;
          try {
            var msg = ev && ev.message ? ev.message : 'error';
            var file = ev && ev.filename ? ev.filename : '(no file)';
            var line = (ev && typeof ev.lineno === 'number') ? ev.lineno : '?';
            var col = (ev && typeof ev.colno === 'number') ? ev.colno : '?';
            var stack = (ev && ev.error && ev.error.stack) ? String(ev.error.stack).split('\n')[0] : '';
            var src = currentPlugin || file;
            showError(src, msg, String(file) + ':' + String(line) + ':' + String(col) + (stack ? (' | ' + stack) : ''));
          } catch (_) { }
        }

        function onUnhandledRejection(ev) {
          if (LOG_MODE === 0) return;
          try {
            var reason = ev && ev.reason ? ev.reason : 'unhandled rejection';
            var msg = fmtErr(reason);
            var stack = (reason && reason.stack) ? String(reason.stack).split('\n')[0] : '';
            showError(currentPlugin || 'Promise', msg, stack);
          } catch (_) { }
        }

        function attachGlobalHooks() {
          if (LOG_MODE === 0) return;
          window.addEventListener('error', onWinError, true);
          window.addEventListener('unhandledrejection', onUnhandledRejection);
        }

        function detachGlobalHooks() {
          try { window.removeEventListener('error', onWinError, true); } catch (_) { }
          try { window.removeEventListener('unhandledrejection', onUnhandledRejection); } catch (_) { }
        }

        function finalizeLoggingAfterDone() {
          if (LOG_MODE === 1) {
            detachGlobalHooks();
            safe(function () { if (BL.Log && BL.Log.hide) BL.Log.hide(); });
          }
        }

        // ============================================================================
        // IMPORTANT PART (install / enable / inject)
        // ============================================================================
        function guessName(url) {
          try {
            var u = new URL(String(url), location.href);
            var p = String(u.pathname || '');
            var last = p.split('/'); last = last[last.length - 1] || '';
            if (!last) last = u.hostname;
            return last;
          } catch (_) {
            var s = String(url);
            var a = s.split('/'); return a[a.length - 1] || s;
          }
        }

        function guessAuthor(url) {
          try {
            var u = new URL(String(url), location.href);
            return '@' + String(u.hostname || 'plugin');
          } catch (_) {
            return '@plugin';
          }
        }

        function findPluginIndex(arr, urlAbs) {
          for (var i = 0; i < arr.length; i++) {
            try {
              if (String(arr[i].url || '') === urlAbs) return i;
            } catch (_) { }
          }
          return -1;
        }

        function isBlockedUrl(u) {
          try { return (BL.PolicyNetwork && BL.PolicyNetwork.isBlockedUrl) ? BL.PolicyNetwork.isBlockedUrl(u) : null; }
          catch (_) { return null; }
        }

        function logBlocked(u, where, why) {
          var label = (why || 'Blocked');
          var extra = String(where) + ' | ' + String(u);
          showWarn('Net', 'BLOCKED (' + label + ')', extra);
        }

        function injectScript(urlAbs) {
          return new Promise(function (resolveInject) {
            try {
              var s = document.createElement('script');
              s.src = urlAbs;
              s.async = true;
              s.onload = function () { resolveInject({ ok: true, why: 'onload', url: urlAbs }); };
              s.onerror = function () { resolveInject({ ok: false, why: 'onerror', url: urlAbs }); };
              document.head.appendChild(s);
            } catch (e) {
              resolveInject({ ok: false, why: 'exception:' + fmtErr(e), url: urlAbs });
            }
          });
        }

        function ensureInstalledOne(urlOne) {
          return new Promise(function (resolveOne) {
            var urlAbs = absUrl(urlOne);

            var br = isBlockedUrl(urlAbs);
            if (br) {
              logBlocked(urlAbs, 'install', br);
              resolveOne({ ok: false, action: 'blocked', url: urlAbs, why: br });
              return;
            }

            if (!window.Lampa || !Lampa.Storage) {
              resolveOne({ ok: false, action: 'no-lampa', url: urlAbs, why: 'Lampa.Storage missing' });
              return;
            }

            var plugins = Lampa.Storage.get('plugins');
            if (!plugins || typeof plugins.length !== 'number') plugins = [];

            var idx = findPluginIndex(plugins, urlAbs);
            if (idx >= 0) {
              if (AUTO_ENABLE_DISABLED && plugins[idx] && plugins[idx].status === 0) {
                plugins[idx].status = 1;
                Lampa.Storage.set('plugins', plugins);
                try { if (Lampa.Settings && Lampa.Settings.update) Lampa.Settings.update(); } catch (_) { }
                showOk('install', 'enabled', urlAbs);
                resolveOne({ ok: true, action: 'enabled', url: urlAbs, why: 'was disabled' });
                return;
              }

              showDbg('install', 'skip (already)', urlAbs);
              resolveOne({ ok: true, action: 'skip', url: urlAbs, why: 'already installed' });
              return;
            }

            var entry = {
              author: guessAuthor(urlAbs),
              url: urlAbs,
              name: guessName(urlAbs),
              status: 1
            };

            plugins.push(entry);
            Lampa.Storage.set('plugins', plugins);

            try { if (Lampa.Settings && Lampa.Settings.update) Lampa.Settings.update(); } catch (_) { }

            showOk('install', 'installed', urlAbs);

            if (!INJECT_NEWLY_INSTALLED) {
              resolveOne({ ok: true, action: 'installed', url: urlAbs, why: 'no-inject' });
              return;
            }

            injectScript(urlAbs).then(function (r) {
              if (r.ok) showOk('inject', 'ok', urlAbs);
              else showError('inject', 'fail', urlAbs + ' | ' + r.why);
              resolveOne({ ok: r.ok, action: 'installed+inject', url: urlAbs, why: r.why });
            });
          });
        }

        function ensureInstalledAll(list) {
          return new Promise(function (resolveAll) {
            var i = 0;
            function step() {
              if (i >= list.length) { resolveAll(true); return; }
              var u = list[i++];
              ensureInstalledOne(u).then(function () {
                setTimeout(step, 0);
              });
            }
            step();
          });
        }

        function waitLampa(cb) {
          var tries = 0;
          var max = 240;
          var t = setInterval(function () {
            tries++;
            if (window.Lampa && Lampa.Listener && Lampa.Storage) {
              clearInterval(t);
              cb(true);
              return;
            }
            if (tries >= max) {
              clearInterval(t);
              cb(false);
            }
          }, 250);
        }

        // ============================================================================
        // MAIN (как было)
        // ============================================================================
        function start() {
          // Policy/guards are installed in modification.js PHASE 0 (pre-auth).
          // Calling them here again is intentional: these installs are idempotent and act as a safety net.

          // policy/network
          safe(function () { if (BL.PolicyNetwork && BL.PolicyNetwork.install) BL.PolicyNetwork.install(BL.Log); });

          // storage guards
          safe(function () { if (BL.Storage && BL.Storage.Guards && BL.Storage.Guards.installPluginsBlacklistGuard) BL.Storage.Guards.installPluginsBlacklistGuard(BL.Log); });

          if (LOG_MODE !== 0) {
            attachGlobalHooks();
            safe(function () { if (BL.Log && BL.Log.ensurePopup) { var el = BL.Log.ensurePopup(); if (el) el.style.display = 'none'; } });
            showInfo('AutoPlugin', 'start', 'mode=' + String(LOG_MODE));
          }

          waitLampa(function (ok) {
            if (!ok) {
              showWarn('Lampa', 'wait timeout', 'Lampa not detected');
              finalizeLoggingAfterDone();
              doneSafe();
              return;
            }

            initInstallerSettings();
            safe(function () { if (BL.Log && BL.Log.hide) BL.Log.hide(); });

            if (isFirstInstallCompleted()) {
              showOk('AutoPlugin', 'skip', 'first-install flag present (no plugin checks)');
              refreshInstallerSettingsUi();
              finalizeLoggingAfterDone();
              doneSafe();
              return;
            }

            ensureInstalledAll(PLUGINS).then(function () {
              markFirstInstallCompleted();
              refreshInstallerSettingsUi();

              var info = getStatusInfoString();
              if (info.indexOf('done=1') >= 0) showOk('flags', 'written', info);
              else showWarn('flags', 'unexpected', info);

              showOk('AutoPlugin', 'done', 'total=' + String(PLUGINS.length));
              scheduleReloadCountdown(RELOAD_DELAY_SEC, 'first install completed');

              finalizeLoggingAfterDone();
              doneSafe();
            });
          });
        }

        start();
        doneLaterFallback();
      }

      function startWithoutConfig(err) {
        try {
          var msg = err && err.message ? err.message : String(err);
          if (BL.Log && BL.Log.showWarn) BL.Log.showWarn('AutoPlugin', 'config load error', msg);
          else console.warn('[BlackLampa] WRN AutoPlugin: config load error | ' + msg);
        } catch (_) { }
        startWithConfig({});
      }

      try {
        if (BL.Core && BL.Core.loadJson) {
          BL.Core.loadJson(url, { cache: 'no-store' }).then(function (cfg) {
            startWithConfig(cfg);
          }).catch(startWithoutConfig);
        } else {
          startWithoutConfig(new Error('BL.Core.loadJson missing'));
        }
      } catch (e) {
        startWithoutConfig(e);
      }
    });

    return startPromise;
  };
})();
