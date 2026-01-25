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
    var cfg = null;
    try { cfg = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { cfg = BL.Config; }
    cfg = cfg || {};
    var apCfg = cfg.autoplugin || {};
    var file = String(apCfg.jsonFile || '');
    try { return String(new URL(file, base || location.href).href); } catch (_) { return file; }
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
	        var cfg = null;
	        try { cfg = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { cfg = BL.Config; }
	        cfg = cfg || {};
	        var apCfg = cfg.autoplugin || {};
	        var ms = (typeof apCfg.doneFallbackMs === 'number') ? apCfg.doneFallbackMs : 0;
	        if (ms > 0) setTimeout(function () { doneSafe(); }, ms);
	      }

      function startWithConfig(cfg) {
	        cfg = normalizeConfig(cfg);

	        var cfgOpts = cfg.options || {};

	        var cfgAll = null;
	        try { cfgAll = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { cfgAll = BL.Config; }
	        cfgAll = cfgAll || {};
	        var logCfg = cfgAll.log || {};
	        var defaultMode0 = (typeof logCfg.defaultMode === 'number') ? logCfg.defaultMode : 0;
	        var DEFAULT_LOG_MODE = toInt(pickOption(cfgOpts, 'defaultLogMode', defaultMode0), defaultMode0);
	        var AUTO_ENABLE_DISABLED = !!pickOption(cfgOpts, 'autoEnableDisabled', true);
	        var INJECT_NEWLY_INSTALLED = !!pickOption(cfgOpts, 'injectNewlyInstalled', true);
        // Auto-reload disabled intentionally (BlackLampa policy).
        // The page must never be reloaded automatically after installs/resets/reinit.
	        var RELOAD_AFTER_FIRST_INSTALL = false;
	        var RELOAD_DELAY_SEC = 0;

	        safe(function () {
	          try {
	            var c = null;
	            try { c = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { c = BL.Config; }
	            if (c) {
	              c.log = c.log || {};
	              c.log.defaultMode = DEFAULT_LOG_MODE;
	            }
	          } catch (_) { }
	          if (BL.Log && BL.Log.init) BL.Log.init();
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
	              var u0 = getPluginUrl(list[i]);
	              if (u0) PLUGINS.push(String(u0));
	            }
	          }
	        } catch (_) { }

	        // ============================================================================
	        // ONE-TIME INSTALL FLAGS
	        // ============================================================================
	        var cfgAll2 = null;
	        try { cfgAll2 = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { cfgAll2 = BL.Config; }
	        cfgAll2 = cfgAll2 || {};
	        var apCfg2 = cfgAll2.autoplugin || {};
	        var apFlags2 = apCfg2.flags || {};
	        var AP_KEYS = {
	          done: String(apFlags2.done || ''),
	          sig: String(apFlags2.sig || ''),
	          ts: String(apFlags2.ts || '')
	        };

        // Storage helpers (official Lampa API):
        // - For plugin install/remove and related flags we use Lampa.Storage (like lampa/scripts/addon.js).
        // - Avoid direct localStorage mutations for deletion operations.
        function lsGet(k) {
          try { if (window.Lampa && Lampa.Storage && Lampa.Storage.get) return Lampa.Storage.get(k); } catch (_) { }
          return null;
        }
        function lsSet(k, v) {
          try { if (window.Lampa && Lampa.Storage && Lampa.Storage.set) return Lampa.Storage.set(k, v); } catch (_) { }
        }
        function lsDel(k) {
          try {
            if (window.Lampa && Lampa.Storage) {
              // IMPORTANT:
              // Lampa.Storage.remove() is NOT a "remove key" helper (it is used for sync workers).
              // To reliably reset flags (and bypass internal cache), write an empty value.
              if (Lampa.Storage.set) return Lampa.Storage.set(k, '');
            }
          } catch (_) { }
        }

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
          var done = String(lsGet(AP_KEYS.done) || '') === '1';
          if (!done) return false;

          var sig = String(lsGet(AP_KEYS.sig) || '');
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
	            var doneFlag = String(lsGet(AP_KEYS.done) || '') === '1';
	            var sigOk = String(lsGet(AP_KEYS.sig) || '') === calcPluginsSig();
	            var ts = toInt(lsGet(AP_KEYS.ts), 0);
	            return 'done=' + (doneFlag ? '1' : '0') + ', sig=' + (sigOk ? 'ok' : 'no') + (ts ? (', ts=' + new Date(ts).toLocaleString()) : '');
	          } catch (_) {
	            return 'done=?, sig=?';
	          }
	        }

	        function getStatusHelpString() {
	          return [
	            'done: 1 — первичная автоустановка выполнена',
	            'sig: ok — список плагинов совпадает с сохранённой подписью',
	            'ts: время фиксации первой установки'
	          ].join('\n');
	        }

	        function refreshInstallerSettingsUi() {
	          try {
	            if (!window.Lampa) return;
	            // IMPORTANT:
	            // Lampa.Settings.update() recreates the component with `{last_index}` only
	            // and DROPS params like `onBack`, breaking submenu navigation.
	            // Prefer our component-local refresh (if installed).
	            try {
	              if (window.BL && BL.Factory && typeof BL.Factory.autopluginUiRefresh === 'function') {
	                BL.Factory.autopluginUiRefresh();
	                return;
	              }
	            } catch (_) { }
	            try { if (Lampa.Settings && Lampa.Settings.update) Lampa.Settings.update(); } catch (_) { }
	          } catch (_) { }
	        }

        // ============================================================================
        // Plugins removal (official Lampa API)
        //
        // IMPORTANT:
        // - No direct localStorage edits for plugins list.
        // - Use Lampa.Storage (same approach as lampa/scripts/addon.js).
        // - No location.reload for delete actions: user may restart the app manually if needed.
        //   (Factory reset is handled separately and DOES reload.)
        // ============================================================================
        var MANAGED_URLS = {};

        function addManagedUrl(u) {
          try {
            var s = String(u || '');
            if (!s) return;
            MANAGED_URLS[s] = 1;
            MANAGED_URLS[absUrl(s)] = 1;
          } catch (_) { }
        }

        // Build managed urls list from config: active plugins[] only.
        // IMPORTANT: disabled[] are "additional" plugins and must be managed manually via Settings.
	        (function () {
	          try {
	            var p = cfg.plugins;
	            if (Array.isArray(p)) for (var i = 0; i < p.length; i++) addManagedUrl(getPluginUrl(p[i]));
	          } catch (_) { }
	        })();

        function getInstalledPlugins() {
          try {
            if (!window.Lampa || !Lampa.Storage || !Lampa.Storage.get) return [];
            var list = Lampa.Storage.get('plugins');
            if (!list || typeof list.length !== 'number') return [];
            return list;
          } catch (_) {
            return [];
          }
        }

	        function setInstalledPlugins(list) {
	          try {
	            if (!window.Lampa || !Lampa.Storage || !Lampa.Storage.set) return false;
	            Lampa.Storage.set('plugins', list);
	            refreshInstallerSettingsUi();
	            return true;
	          } catch (_) {
	            return false;
	          }
	        }

	        function getPluginUrl(item) {
	          try {
	            if (!item) return '';
	            if (typeof item === 'string') return String(item);
	            if (typeof item.url === 'string') return String(item.url);
	          } catch (_) { }
	          return '';
	        }

	        function findPluginIndexAny(arr, urlAbs) {
	          try {
	            if (!arr || typeof arr.length !== 'number') return -1;
	            var target = String(urlAbs || '');
	            if (!target) return -1;
	
	            for (var i = 0; i < arr.length; i++) {
	              var u = getPluginUrl(arr[i]);
	              if (!u) continue;
	              if (String(u) === target) return i;
	              try { if (absUrl(u) === target) return i; } catch (_) { }
	            }
	          } catch (_) { }
	          return -1;
	        }

        function removeAllPluginsLampa() {
          if (!window.Lampa || !Lampa.Storage || !Lampa.Storage.set) {
            showWarn('Settings', 'remove plugins', 'Lampa.Storage missing');
            return 0;
          }

          var plugins = getInstalledPlugins();
          setInstalledPlugins([]);

          showOk('Settings', 'all Lampa plugins removed', '');
          try { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('[[BlackLampa]] Плагины удалены. Для полного применения может потребоваться перезапуск приложения.'); } catch (_) { }

          return plugins.length;
        }

        function removeManagedPluginsLampa() {
          if (!window.Lampa || !Lampa.Storage || !Lampa.Storage.get || !Lampa.Storage.set) {
            showWarn('AutoPlugin', 'remove plugins', 'Lampa.Storage missing');
            return 0;
          }

          var plugins = getInstalledPlugins();
          var kept = [];
          var removed = 0;

          for (var i = 0; i < plugins.length; i++) {
            var it = plugins[i];
            var u = getPluginUrl(it);
            var ua = '';
            try { ua = absUrl(u); } catch (_) { ua = u; }
            if (u && (MANAGED_URLS[u] || MANAGED_URLS[ua])) removed++;
            else kept.push(it);
          }

          if (removed) setInstalledPlugins(kept);

          // WHY: do NOT reset first-install flags here.
          // Deleting managed plugins must not trigger unexpected re-install on next start.
          // Use "Переинициализация" if you want AutoPlugin to run again.

          showOk('AutoPlugin', 'managed plugins removed', '');
          try { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('[[BlackLampa]] Плагины AutoPlugin удалены. Для полного применения может потребоваться перезапуск приложения.'); } catch (_) { }

          return removed;
        }

        function clearAllCookies() {
          try {
            var cookies = String(document.cookie || '').split(';');
            var host = String(location.hostname || '');
            var domainDot = host ? '.' + host : '';
            var path = String(location.pathname || '/');

            for (var i = 0; i < cookies.length; i++) {
              var c = cookies[i];
              var eq = c.indexOf('=');
              var name = (eq >= 0 ? c.slice(0, eq) : c).trim();
              if (!name) continue;

              // path variants
              document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
              document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=' + path;

              // domain variants (some browsers require explicit domain)
              if (host) {
                document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + host;
                document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + domainDot;
                document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=' + path + '; domain=' + host;
                document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=' + path + '; domain=' + domainDot;
              }
            }
          } catch (_) { }
        }

        function clearCachesBestEffort(done) {
          done = done || function () { };
          var called = false;
          function doneOnce() {
            if (called) return;
            called = true;
            try { done(); } catch (_) { }
          }

          // Safety timeout: never block reload on slow/broken cache backends.
          var t = null;
          try { t = setTimeout(doneOnce, 800); } catch (_) { t = null; }

          try {
            if (!window.caches || !caches.keys || !caches["delete"]) return doneOnce();
            caches.keys().then(function (keys) {
              var ps = [];
              for (var i = 0; i < keys.length; i++) {
                try { ps.push(caches["delete"](keys[i])); } catch (_) { }
              }
              return Promise.all(ps);
            }).then(function () {
              try { if (t) clearTimeout(t); } catch (_) { }
              doneOnce();
            })["catch"](function () {
              try { if (t) clearTimeout(t); } catch (_) { }
              doneOnce();
            });
          } catch (_) {
            try { if (t) clearTimeout(t); } catch (_) { }
            doneOnce();
          }
        }

        // Factory reset helper (domain-level):
        // Clears localStorage/sessionStorage/cookies and optional caches, then reloads the page.
        // NOTE: IndexedDB is intentionally not touched here (too risky/complex for TV engines).
        function factoryResetAndReload(reason) {
          reason = String(reason || 'factory reset');

          showWarn('Settings', 'factory reset', reason);

          // Reset AutoPlugin flags explicitly (even though localStorage.clear() will wipe them).
          // WHY: keeps behavior correct even if clear() is blocked in the environment.
          resetFirstInstallFlags();

          // Best-effort: clear auth flag too (auth module stores it in localStorage via Lampa.Storage).
          try {
            var authKey = (BL.Auth && BL.Auth.getKey) ? BL.Auth.getKey() : '';
            if (authKey && window.Lampa && Lampa.Storage && Lampa.Storage.set) Lampa.Storage.set(authKey, '');
          } catch (_) { }
          try {
            var authKey2 = (BL.Auth && BL.Auth.getKey) ? BL.Auth.getKey() : '';
            if (authKey2) localStorage.removeItem(String(authKey2));
          } catch (_) { }

          // Plugins (best-effort via official API) in case localStorage.clear() throws.
          try { removeAllPluginsLampa(); } catch (_) { }

          // Storage
          try { localStorage.clear(); } catch (_) { }
          try { sessionStorage && sessionStorage.clear && sessionStorage.clear(); } catch (_) { }

          // Cookies
          clearAllCookies();

          // Caches (non-blocking best-effort)
          clearCachesBestEffort(function () {
            setTimeout(function () {
              try { location.reload(); }
              catch (_) {
                try { location.href = location.href; } catch (__e) { }
              }
            }, 50);
          });
        }

        BL.Factory = BL.Factory || {};
        if (!BL.Factory.resetAndReload) BL.Factory.resetAndReload = factoryResetAndReload;

        function resetLampa() {
          // Existing "Сброс Lampa до заводских" must fully reset domain data and re-lock auth.
          factoryResetAndReload('user action');
        }

        // ============================================================================
        // reload countdown after first install (disabled)
        // ============================================================================
        function scheduleReloadCountdown(sec, reason) {
          try {
            if (!RELOAD_AFTER_FIRST_INSTALL) {
              // Auto-reload disabled intentionally (BlackLampa policy).
              showInfo('AutoPlugin', 'reload disabled by policy', String(reason || ''));
              return;
            }
            // Safety: even if RELOAD_AFTER_FIRST_INSTALL is toggled somewhere else,
            // BlackLampa must never auto-reload the page.
            showInfo('AutoPlugin', 'reload disabled by policy', String(reason || ''));
          } catch (_) { }
        }

        // ============================================================================
        // Settings UI
        // ============================================================================
        function initInstallerSettings() {
          try {
            if (!window.Lampa || !Lampa.SettingsApi) return;

            // Component ids are configured via BL.Config (single source of truth).
            var blCfg = null;
            try { blCfg = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { blCfg = BL.Config; }
            blCfg = blCfg || {};
            var apUi = (blCfg.autoplugin && blCfg.autoplugin.settings) ? blCfg.autoplugin.settings : {};
            var MAIN_COMPONENT = String(apUi.componentId || 'bl_autoplugin');
            // Legacy ids from older versions (must be removed to avoid extra top-level settings пункты).
            var LEGACY_EXTRAS_COMPONENT = String(apUi.extrasComponentId || 'bl_autoplugin_extras');
            var LEGACY_EXTRA_PLUGIN_PREFIX = String(apUi.extraPluginComponentPrefix || 'bl_autoplugin_extras_plugin_');

            function removeComponentSafe(id) {
              try {
                if (!id) return;
                if (Lampa.SettingsApi.removeComponent) Lampa.SettingsApi.removeComponent(String(id));
              } catch (_) { }
            }

            try {
              // remove legacy component id if it was used before
              removeComponentSafe('autoplugin_installer');
              // remove previous ids to keep the ordered menu stable
              removeComponentSafe('bl_autoplugin');
              removeComponentSafe('bl_autoplugin_extras');
              removeComponentSafe(MAIN_COMPONENT);
              removeComponentSafe(LEGACY_EXTRAS_COMPONENT);

              // Remove any dynamically created legacy components (e.g. per-plugin detail pages).
              try {
                if (Lampa.SettingsApi.allComponents && LEGACY_EXTRA_PLUGIN_PREFIX) {
                  var all = Lampa.SettingsApi.allComponents();
                  for (var k in all) {
                    if (k && String(k).indexOf(String(LEGACY_EXTRA_PLUGIN_PREFIX)) === 0) removeComponentSafe(k);
                  }
                }
              } catch (_) { }
            } catch (_) { }

            Lampa.SettingsApi.addComponent({
              component: MAIN_COMPONENT,
              name: 'AutoPlugin Installer',
              icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 14.5h-2v-2h2v2zm0-4h-2V6h2v6.5z" fill="currentColor"/></svg>'
            });

            // Confirm dialog helper (TV/PC/mobile safe).
            function confirmAction(title, text, onYes) {
              try {
                if (window.Lampa && Lampa.Modal && typeof Lampa.Modal.open === 'function' && window.$) {
                  Lampa.Modal.open({
                    title: String(title || ''),
                    size: 'medium',
                    align: 'center',
                    mask: true,
                    html: $('<div class="about">' + String(text || '') + '</div>'),
                    buttons: [{
                      name: 'Нет',
                      onSelect: function () {
                        try { if (Lampa.Modal && Lampa.Modal.close) Lampa.Modal.close(); } catch (_) { }
                      }
                    }, {
                      name: 'Да',
                      onSelect: function () {
                        try { if (Lampa.Modal && Lampa.Modal.close) Lampa.Modal.close(); } catch (_) { }
                        try { if (typeof onYes === 'function') onYes(); } catch (_) { }
                      }
                    }]
                  });
                  return;
                }
              } catch (_) { }

              // Fallback: native confirm (should be rare in Lampa).
              try { if (window.confirm(String(text || title || 'Confirm?'))) { if (typeof onYes === 'function') onYes(); } } catch (_) { }
            }

            var busy = false;
	            function runOnce(title, text, fn) {
	              if (busy) {
	                try { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('[[BlackLampa]] Операция уже выполняется...'); } catch (_) { }
	                return;
	              }
	              confirmAction(title, text, function () {
	                if (busy) return;
	                busy = true;
	                try { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('[[BlackLampa]] Выполняется...'); } catch (_) { }
	                setTimeout(function () {
	                  var res = null;
	                  try { res = fn && fn(); } catch (e) { showError('Settings', 'action failed', fmtErr(e)); }

	                  // Support async actions (Promise) without blocking the UI thread.
	                  if (res && typeof res.then === 'function') {
	                    res.then(function () {
	                      busy = false;
	                      refreshInstallerSettingsUi();
	                    }, function (e2) {
	                      showError('Settings', 'action failed', fmtErr(e2));
	                      busy = false;
	                      refreshInstallerSettingsUi();
	                    });
	                    return;
	                  }

	                  busy = false;
	                  refreshInstallerSettingsUi();
	                }, 0);
	              });
		            }

		            // ============================================================================
		            // AutoPlugin Installer menu (ordered, with submenus)
		            // Order (top -> bottom):
		            // 1) Переинициализация (reset first-install flags)
		            // 2) Сброс Lampa до заводских (factory reset)
		            // 3) Удалить все плагины Lampa
		            // 4) Удалить плагины AutoPlugin Installer (active plugins[] only)
		            // 5) Дополнительные плагины (submenu)
		            // X) Статус (last)

			            // Internal navigation: keep ONLY one Settings component (MAIN_COMPONENT).
			            // Submenus are rendered by rebuilding params and reopening MAIN_COMPONENT.
				            var uiBackMainIndex = 0;
				            var uiBackExtrasIndex = 0;
				            var uiRoute = 'main'; // main | extras | detail
				            var uiDetailMeta = null;
				            var uiBackBlocklistIndex = 0;
				            var uiBackUserRuleIndex = 0;
				            var uiUserRuleId = '';

			            function getSettingsFocusIndexSafe() {
			              try {
			                if (!document || !document.querySelector) return 0;
			                var body = document.querySelector('.settings__body');
			                if (!body) return 0;
			                var focus = body.querySelector('.selector.focus');
			                if (!focus) return 0;
			                var nodes = body.querySelectorAll('.selector');
			                for (var i = 0; i < nodes.length; i++) {
			                  if (nodes[i] === focus) return i;
			                }
			              } catch (_) { }
			              return 0;
			            }

		            function resetMainParams() {
		              try { if (Lampa.SettingsApi.removeParams) Lampa.SettingsApi.removeParams(String(MAIN_COMPONENT)); } catch (_) { }
		            }

			            function openMainScreen(focusIndex) {
			              try {
			                uiRoute = 'main';
			                uiDetailMeta = null;
			                resetMainParams();
			                buildMainScreen();

			                if (!window.Lampa || !Lampa.Settings || !Lampa.Settings.create) return;
			                var cp = { __bl_ap_internal: true, __bl_ap_route: 'main' };
			                if (typeof focusIndex === 'number' && focusIndex > 0) cp.last_index = focusIndex;
			                Lampa.Settings.create(String(MAIN_COMPONENT), cp);
			              } catch (_) { }
			            }

			            function openExtrasScreen(backIndexMain, focusIndex) {
			              try {
			                uiRoute = 'extras';
			                uiDetailMeta = null;
			                if (typeof backIndexMain === 'number') uiBackMainIndex = backIndexMain;
			                resetMainParams();
			                buildExtrasScreen();

			                if (!window.Lampa || !Lampa.Settings || !Lampa.Settings.create) return;
			                var cp = {
			                  onBack: function () { openMainScreen(uiBackMainIndex); },
			                  __bl_ap_internal: true,
			                  __bl_ap_route: 'extras'
			                };
			                if (typeof focusIndex === 'number' && focusIndex > 0) cp.last_index = focusIndex;
			                Lampa.Settings.create(String(MAIN_COMPONENT), cp);
			              } catch (_) { }
			            }

			            function openExtraDetailScreen(meta, backIndexExtras, focusIndex) {
			              try {
			                uiRoute = 'detail';
			                uiDetailMeta = meta || null;
			                if (typeof backIndexExtras === 'number') uiBackExtrasIndex = backIndexExtras;
			                var st = meta && meta.urlAbs ? getInstalledState(meta.urlAbs) : { installed: false, status: null };
			                var defaultFocus = st.installed ? 2 : 1;
			                var focus = (typeof focusIndex === 'number') ? focusIndex : defaultFocus;

		                resetMainParams();
		                buildExtraDetailScreen(meta, st);

			                if (!window.Lampa || !Lampa.Settings || !Lampa.Settings.create) return;
			                var cp = {
			                  onBack: function () { openExtrasScreen(uiBackMainIndex, uiBackExtrasIndex); },
			                  __bl_ap_internal: true,
			                  __bl_ap_route: 'detail'
			                };
			                if (typeof focus === 'number' && focus > 0) cp.last_index = focus;
			                Lampa.Settings.create(String(MAIN_COMPONENT), cp);
			              } catch (_) { }
			            }

				            function uiRefresh() {
				              try {
				                // Only refresh when our component is currently open; never open Settings from here.
				                try {
				                  if (window.Lampa && Lampa.Controller && typeof Lampa.Controller.enabled === 'function') {
				                    var en = Lampa.Controller.enabled();
				                    if (en && en.name && String(en.name) !== 'settings_component') return;
				                  }
				                } catch (_) { }

				                var cur = '';
				                try { cur = (BL.Core && BL.Core.getQueryParam) ? String(BL.Core.getQueryParam('settings') || '') : ''; } catch (_) { cur = ''; }
				                if (cur !== String(MAIN_COMPONENT)) return;

				                var focus = getSettingsFocusIndexSafe();
			                if (uiRoute === 'detail' && uiDetailMeta) openExtraDetailScreen(uiDetailMeta, uiBackExtrasIndex, focus);
			                else if (uiRoute === 'extras') openExtrasScreen(uiBackMainIndex, focus);
			                else if (uiRoute === 'blocklist') openBlocklistScreen(uiBackMainIndex, focus);
			                else if (uiRoute === 'blocklist_builtin') openBlocklistBuiltinScreen(uiBackBlocklistIndex, focus);
			                else if (uiRoute === 'blocklist_user') openBlocklistUserRulesScreen(uiBackBlocklistIndex, focus);
			                else if (uiRoute === 'blocklist_user_detail' && uiUserRuleId) openBlocklistUserRuleDetailScreen(uiUserRuleId, uiBackUserRuleIndex, focus);
			                else if (uiRoute === 'blocklist_add') openBlocklistAddScreen(uiBackBlocklistIndex, focus);
			                else openMainScreen(focus);
			              } catch (_) { }
			            }

			            try {
			              BL.Factory = BL.Factory || {};
			              BL.Factory.autopluginUiRefresh = uiRefresh;

			              if (!BL.Factory.__autopluginSettingsHookInstalled && window.Lampa && Lampa.Settings && Lampa.Settings.listener && Lampa.Settings.listener.follow) {
			                BL.Factory.__autopluginSettingsHookInstalled = true;
				                Lampa.Settings.listener.follow('open', function (e) {
				                  try {
				                    if (!e || !e.name) return;
				                    if (e.name === 'main') {
				                      uiRoute = 'main';
				                      uiDetailMeta = null;
				                      uiBackMainIndex = 0;
				                      uiBackExtrasIndex = 0;
				                      uiBackBlocklistIndex = 0;
				                      uiBackUserRuleIndex = 0;
				                      uiUserRuleId = '';
				                      return;
				                    }
				                    if (e.name !== MAIN_COMPONENT) return;
				                    if (e.params && e.params.__bl_ap_internal) return;

				                    // External open (or update() recreate): restore navigation params and start from root.
				                    setTimeout(function () {
				                      try {
				                        uiRoute = 'main';
				                        uiDetailMeta = null;
				                        uiBackMainIndex = 0;
				                        uiBackExtrasIndex = 0;
				                        uiBackBlocklistIndex = 0;
				                        uiBackUserRuleIndex = 0;
				                        uiUserRuleId = '';
				                        openMainScreen(0);
				                      } catch (_) { }
				                    }, 0);
				                  } catch (_) { }
				                });
			              }
			            } catch (_) { }

			            function extraMeta(raw) {
			              try {
			                var url = getPluginUrl(raw);
			                if (!url) return null;
			                var urlAbs = absUrl(url);

		                var title = '';
		                var desc = '';
		                try { if (raw && typeof raw === 'object' && !Array.isArray(raw) && typeof raw.title === 'string') title = String(raw.title || ''); } catch (_) { title = ''; }
			                try { if (raw && typeof raw === 'object' && !Array.isArray(raw) && typeof raw.desc === 'string') desc = String(raw.desc || ''); } catch (_) { desc = ''; }

			                if (!title) title = guessName(urlAbs);
			                // Leave description empty when not provided (URL is shown separately in UI).
			                if (!desc) desc = '';

			                var hash = djb2('extra|' + urlAbs);
			                return { raw: raw, url: url, urlAbs: urlAbs, title: title, desc: desc, hash: hash };
			              } catch (_) {
			                return null;
			              }
			            }

		            function getInstalledState(urlAbs) {
		              var list = getInstalledPlugins();
		              var idx = findPluginIndexAny(list, urlAbs);
		              var st = (idx >= 0 && list[idx] && typeof list[idx].status === 'number') ? list[idx].status : null;
		              return { installed: idx >= 0, status: st };
		            }

		            function removeOnePlugin(urlAbs, title) {
		              if (!window.Lampa || !Lampa.Storage || !Lampa.Storage.get || !Lampa.Storage.set) {
		                showWarn('Settings', 'remove plugin', 'Lampa.Storage missing');
		                return 0;
		              }

		              var list = getInstalledPlugins();
		              var kept = [];
		              var removed = 0;

		              for (var i = 0; i < list.length; i++) {
		                var u = getPluginUrl(list[i]);
		                var ua = '';
		                try { ua = absUrl(u); } catch (_) { ua = String(u || ''); }
		                if (u && (u === urlAbs || ua === urlAbs)) removed++;
		                else kept.push(list[i]);
		              }

		              if (removed) setInstalledPlugins(kept);

		              if (removed) {
		                showOk('Settings', 'plugin removed', title || urlAbs);
		                try { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('[[BlackLampa]] Плагин удалён: ' + String(title || urlAbs)); } catch (_) { }
		              } else {
		                showWarn('Settings', 'remove skip', title || urlAbs);
		                try { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('[[BlackLampa]] Плагин не установлен: ' + String(title || urlAbs)); } catch (_) { }
		              }

		              return removed;
		            }

			            function buildExtrasScreen() {
			              try {
			                var disabled = (cfg && Array.isArray(cfg.disabled)) ? cfg.disabled : [];
		                if (!disabled.length) {
		                  var none = 'Нет дополнительных плагинов.';
		                  Lampa.SettingsApi.addParam({
		                    component: MAIN_COMPONENT,
		                    param: { name: 'ap_extras_none', type: 'static', values: none, default: none },
		                    field: { name: 'Дополнительные плагины', description: none }
		                  });
		                  return;
		                }

		                var idx = 0;
		                for (var di = 0; di < disabled.length; di++) {
		                  (function (raw, rowIndex) {
		                    var meta = extraMeta(raw);
		                    if (!meta) return;

			                    Lampa.SettingsApi.addParam({
			                      component: MAIN_COMPONENT,
			                      param: { name: 'ap_extras_' + String(meta.hash), type: 'static', default: true },
			                      field: { name: meta.title, description: meta.desc },
			                      onRender: function (item) {
			                        try {
			                          if (item && item.on) {
			                            item.on('hover:enter', function () {
			                              openExtraDetailScreen(meta, rowIndex);
			                            });
			                          }

			                          // URL line (soft, second line under the title).
			                          try {
			                            if (!window.$ || !item) return;
			                            var $d = item.find('.settings-param__descr');
			                            if (!$d.length) {
			                              item.append('<div class="settings-param__descr"></div>');
			                              $d = item.find('.settings-param__descr');
			                            }
			                            if ($d.find('.bl-ap-url').length === 0) {
			                              var $u = $('<div class="bl-ap-url"></div>');
			                              $u.text(String(meta.urlAbs || ''));
			                              $u.css({
			                                opacity: '0.9',
			                                'font-size': '0.88em',
			                                'word-break': 'break-all',
			                                'margin-top': meta.desc ? '0.25em' : '0'
			                              });
			                              $d.append($u);
			                            }
			                          } catch (_) { }

			                          // Status indicator (like addon.js): active / disabled / not installed.
			                          if (!window.$ || !item) return;
			                          if (item.find('.settings-param__status').length === 0) item.append('<div class="settings-param__status one"></div>');

			                          var st = getInstalledState(meta.urlAbs);
			                          var $st = item.find('.settings-param__status');
			                          if (st.installed && st.status !== 0) $st.css('background-color', '').removeClass('active error').addClass('active');
			                          else if (st.installed && st.status === 0) $st.removeClass('active error').css('background-color', 'rgb(255, 165, 0)');
			                          else $st.css('background-color', '').removeClass('active error').addClass('error');
			                        } catch (_) { }
			                      }
			                    });
			                  })(disabled[di], idx);
		                  idx++;
		                }
		              } catch (_) { }
		            }

		            function buildExtraDetailScreen(meta, st) {
		              try {
		                if (!meta || !meta.urlAbs) {
		                  var bad = 'Плагин не найден.';
		                  Lampa.SettingsApi.addParam({
		                    component: MAIN_COMPONENT,
		                    param: { name: 'ap_extra_not_found', type: 'static', values: bad, default: bad },
		                    field: { name: 'Дополнительные плагины', description: bad }
		                  });
		                  return;
		                }

		                st = st || getInstalledState(meta.urlAbs);

		                // Info
		                try {
		                  var info = String(meta.desc || '');
		                  if (info) info = info + '\n';
		                  info = info + String(meta.urlAbs);
		                  Lampa.SettingsApi.addParam({
		                    component: MAIN_COMPONENT,
		                    param: { name: 'ap_extra_info', type: 'static', values: info, default: info },
		                    field: { name: meta.title, description: info }
		                  });
		                } catch (_) { }

		                // Action: install
		                if (!st.installed) {
		                  try {
		                    Lampa.SettingsApi.addParam({
		                      component: MAIN_COMPONENT,
		                      param: { name: 'ap_extra_install', type: 'button' },
		                      field: { name: 'Установить', description: 'Добавляет плагин в расширения Lampa.' },
		                      onChange: function () {
		                        // WHY: manual install from disabled[] must NOT reset first-install flags.
		                        runOnce('Установить: ' + meta.title, 'Установить плагин?\n\n' + meta.title + '\n' + meta.urlAbs, function () {
		                          return ensureInstalledOne(meta.urlAbs).then(function (r) {
		                            if (r && r.ok) {
		                              try { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('[[BlackLampa]] Установлено: ' + meta.title); } catch (_) { }
		                            } else {
		                              try { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('[[BlackLampa]] Ошибка установки: ' + meta.title); } catch (_) { }
		                            }
		                            openExtraDetailScreen(meta, uiBackExtrasIndex, 2);
		                          });
		                        });
		                      }
		                    });
		                  } catch (_) { }
		                } else {
		                  try {
		                    var note = (st.status === 0) ? 'Плагин уже установлен, но отключён в расширениях.' : 'Плагин уже установлен.';
		                    Lampa.SettingsApi.addParam({
		                      component: MAIN_COMPONENT,
		                      param: { name: 'ap_extra_install_disabled', type: 'static', values: note, default: note },
		                      field: { name: 'Установить', description: note }
		                    });
		                  } catch (_) { }
		                }

		                // Action: remove
		                if (st.installed) {
		                  try {
		                    Lampa.SettingsApi.addParam({
		                      component: MAIN_COMPONENT,
		                      param: { name: 'ap_extra_remove', type: 'button' },
		                      field: { name: 'Удалить', description: 'Удаляет плагин из расширений Lampa.' },
		                      onChange: function () {
		                        // WHY: manual remove must NOT reset first-install flags.
		                        runOnce('Удалить: ' + meta.title, 'Удалить плагин?\n\n' + meta.title + '\n' + meta.urlAbs + '\n\nАвтоперезагрузка отключена. При необходимости перезапустите приложение вручную.', function () {
		                          removeOnePlugin(meta.urlAbs, meta.title);
		                          openExtraDetailScreen(meta, uiBackExtrasIndex, 1);
		                        });
		                      }
		                    });
		                  } catch (_) { }
		                } else {
		                  try {
		                    var none = 'Плагин не установлен.';
		                    Lampa.SettingsApi.addParam({
		                      component: MAIN_COMPONENT,
		                      param: { name: 'ap_extra_remove_disabled', type: 'static', values: none, default: none },
		                      field: { name: 'Удалить', description: none }
		                    });
		                  } catch (_) { }
		                }
			              } catch (_) { }
			            }

			            // ============================================================================
			            // URL Blocklist (network policy UI)
			            // ============================================================================
			            var BL_RULE_ADD_PATTERN = 'bl_net_rule_add_pattern';
			            var BL_RULE_ADD_TYPE = 'bl_net_rule_add_type';
			            var BL_RULE_ADD_CT = 'bl_net_rule_add_ct';
			            var BL_RULE_ADD_BODY = 'bl_net_rule_add_body';

			            function getBlocklistApi() {
			              try {
			                if (window.BL && BL.PolicyNetwork && BL.PolicyNetwork.blocklist) return BL.PolicyNetwork.blocklist;
			              } catch (_) { }
			              return null;
			            }

			            function ensureStatusDot(item) {
			              try {
			                if (!window.$ || !item) return null;
			                if (item.find('.settings-param__status').length === 0) item.append('<div class="settings-param__status one"></div>');
			                return item.find('.settings-param__status');
			              } catch (_) {
			                return null;
			              }
			            }

			            function setStatusDot($st, enabled) {
			              try {
			                if (!$st || !$st.length) return;
			                if (enabled) $st.css('background-color', '').removeClass('error').addClass('active');
			                else $st.removeClass('active error').css('background-color', 'rgba(255,255,255,0.35)');
			              } catch (_) { }
			            }

			            function buildBlocklistScreen() {
			              try {
			                Lampa.SettingsApi.addParam({
			                  component: MAIN_COMPONENT,
			                  param: { name: 'bl_blocklist_builtin', type: 'static', default: true },
			                  field: { name: 'Встроенные правила', description: 'Категории встроенных блокировок BlackLampa (toggle ON/OFF).' },
			                  onRender: function (item) {
			                    try {
			                      if (!item || !item.on) return;
			                      item.on('hover:enter', function () { openBlocklistBuiltinScreen(0, 0); });
			                    } catch (_) { }
			                  }
			                });
			                Lampa.SettingsApi.addParam({
			                  component: MAIN_COMPONENT,
			                  param: { name: 'bl_blocklist_user', type: 'static', default: true },
			                  field: { name: 'Пользовательские URL', description: 'Список пользовательских URL/Pattern правил (simple/advanced).' },
			                  onRender: function (item) {
			                    try {
			                      if (!item || !item.on) return;
			                      item.on('hover:enter', function () { openBlocklistUserRulesScreen(1, 0); });
			                    } catch (_) { }
			                  }
			                });
			                Lampa.SettingsApi.addParam({
			                  component: MAIN_COMPONENT,
			                  param: { name: 'bl_blocklist_add', type: 'static', default: true },
			                  field: { name: 'Добавить URL', description: 'Добавить пользовательское правило блокировки.' },
			                  onRender: function (item) {
			                    try {
			                      if (!item || !item.on) return;
			                      item.on('hover:enter', function () { openBlocklistAddScreen(2, 0); });
			                    } catch (_) { }
			                  }
			                });
			              } catch (_) { }
			            }

			            function openBlocklistScreen(backIndexMain, focusIndex) {
			              try {
			                uiRoute = 'blocklist';
			                uiDetailMeta = null;
			                uiUserRuleId = '';
			                uiBackUserRuleIndex = 0;
			                if (typeof backIndexMain === 'number') uiBackMainIndex = backIndexMain;

			                resetMainParams();
			                buildBlocklistScreen();

			                if (!window.Lampa || !Lampa.Settings || !Lampa.Settings.create) return;
			                var cp = {
			                  onBack: function () { openMainScreen(uiBackMainIndex); },
			                  __bl_ap_internal: true,
			                  __bl_ap_route: 'blocklist'
			                };
			                if (typeof focusIndex === 'number' && focusIndex > 0) cp.last_index = focusIndex;
			                Lampa.Settings.create(String(MAIN_COMPONENT), cp);
			              } catch (_) { }
			            }

			            function buildBlocklistBuiltinScreen() {
			              try {
			                var api = getBlocklistApi();
			                var list = [];
			                try { list = (api && api.builtin && typeof api.builtin.getAll === 'function') ? api.builtin.getAll() : []; } catch (_) { list = []; }

			                if (!list || !list.length) {
			                  var none = api ? 'Нет встроенных правил.' : 'Network policy не доступна.';
			                  Lampa.SettingsApi.addParam({
			                    component: MAIN_COMPONENT,
			                    param: { name: 'bl_blocklist_builtin_none', type: 'static', values: none, default: none },
			                    field: { name: 'URL Blocklist', description: none }
			                  });
			                  return;
			                }

			                for (var i = 0; i < list.length; i++) {
			                  (function (rule, rowIndex) {
			                    Lampa.SettingsApi.addParam({
			                      component: MAIN_COMPONENT,
			                      param: { name: 'bl_blocklist_builtin_' + String(rule.id || rowIndex), type: 'static', default: true },
			                      field: { name: String(rule.title || 'Rule'), description: String(rule.description || '') },
			                      onRender: function (item) {
			                        try {
			                          if (!window.$ || !item) return;
			                          // Safer text rendering (no html injection from titles/descriptions).
			                          try { item.find('.settings-param__name').text(String(rule.title || '')); } catch (_) { }
			                          try {
			                            var $d = item.find('.settings-param__descr');
			                            if (!$d.length) {
			                              item.append('<div class="settings-param__descr"></div>');
			                              $d = item.find('.settings-param__descr');
			                            }
			                            $d.text(String(rule.description || ''));
			                          } catch (_) { }

			                          var $st = ensureStatusDot(item);
			                          setStatusDot($st, !!rule.enabled);

			                          if (item.on) {
			                            item.on('hover:enter', function () {
			                              try {
			                                var api2 = getBlocklistApi();
			                                if (api2 && api2.builtin && typeof api2.builtin.setEnabled === 'function') {
			                                  api2.builtin.setEnabled(String(rule.id), !rule.enabled);
			                                }
			                              } catch (_) { }
			                              openBlocklistBuiltinScreen(uiBackBlocklistIndex, rowIndex);
			                            });
			                          }
			                        } catch (_) { }
			                      }
			                    });
			                  })(list[i], i);
			                }
			              } catch (_) { }
			            }

			            function openBlocklistBuiltinScreen(backIndexBlocklist, focusIndex) {
			              try {
			                uiRoute = 'blocklist_builtin';
			                uiDetailMeta = null;
			                uiUserRuleId = '';
			                uiBackUserRuleIndex = 0;
			                if (typeof backIndexBlocklist === 'number') uiBackBlocklistIndex = backIndexBlocklist;

			                resetMainParams();
			                buildBlocklistBuiltinScreen();

			                if (!window.Lampa || !Lampa.Settings || !Lampa.Settings.create) return;
			                var cp = {
			                  onBack: function () { openBlocklistScreen(uiBackMainIndex, uiBackBlocklistIndex); },
			                  __bl_ap_internal: true,
			                  __bl_ap_route: 'blocklist_builtin'
			                };
			                if (typeof focusIndex === 'number' && focusIndex > 0) cp.last_index = focusIndex;
			                Lampa.Settings.create(String(MAIN_COMPONENT), cp);
			              } catch (_) { }
			            }

			            function buildBlocklistUserRulesScreen() {
			              try {
			                var api = getBlocklistApi();
			                var list = [];
			                try { list = (api && api.user && typeof api.user.getAll === 'function') ? api.user.getAll() : []; } catch (_) { list = []; }

			                if (!api) {
			                  var na = 'Network policy не доступна.';
			                  Lampa.SettingsApi.addParam({
			                    component: MAIN_COMPONENT,
			                    param: { name: 'bl_blocklist_user_na', type: 'static', values: na, default: na },
			                    field: { name: 'URL Blocklist', description: na }
			                  });
			                  return;
			                }

			                if (!list || !list.length) {
			                  var none = 'Нет пользовательских правил.';
			                  Lampa.SettingsApi.addParam({
			                    component: MAIN_COMPONENT,
			                    param: { name: 'bl_blocklist_user_none', type: 'static', values: none, default: none },
			                    field: { name: 'Пользовательские URL', description: none }
			                  });
			                  return;
			                }

			                for (var i = 0; i < list.length; i++) {
			                  (function (rule, rowIndex) {
			                    Lampa.SettingsApi.addParam({
			                      component: MAIN_COMPONENT,
			                      param: { name: 'bl_blocklist_user_' + String(rule.id || rowIndex), type: 'static', default: true },
			                      field: { name: 'URL rule', description: '' },
			                      onRender: function (item) {
			                        try {
			                          if (!window.$ || !item) return;
			                          try { item.find('.settings-param__name').text(String(rule.pattern || '')); } catch (_) { }
			                          try {
			                            var $d = item.find('.settings-param__descr');
			                            if (!$d.length) {
			                              item.append('<div class="settings-param__descr"></div>');
			                              $d = item.find('.settings-param__descr');
			                            }
			                            $d.text('type: ' + String(rule.type || 'simple'));
			                          } catch (_) { }
			                          var $st = ensureStatusDot(item);
			                          setStatusDot($st, !!rule.enabled);

			                          if (item.on) item.on('hover:enter', function () { openBlocklistUserRuleDetailScreen(String(rule.id), rowIndex, 0); });
			                        } catch (_) { }
			                      }
			                    });
			                  })(list[i], i);
			                }
			              } catch (_) { }
			            }

			            function openBlocklistUserRulesScreen(backIndexBlocklist, focusIndex) {
			              try {
			                uiRoute = 'blocklist_user';
			                uiDetailMeta = null;
			                uiUserRuleId = '';
			                if (typeof backIndexBlocklist === 'number') uiBackBlocklistIndex = backIndexBlocklist;

			                resetMainParams();
			                buildBlocklistUserRulesScreen();

			                if (!window.Lampa || !Lampa.Settings || !Lampa.Settings.create) return;
			                var cp = {
			                  onBack: function () { openBlocklistScreen(uiBackMainIndex, uiBackBlocklistIndex); },
			                  __bl_ap_internal: true,
			                  __bl_ap_route: 'blocklist_user'
			                };
			                if (typeof focusIndex === 'number' && focusIndex > 0) cp.last_index = focusIndex;
			                Lampa.Settings.create(String(MAIN_COMPONENT), cp);
			              } catch (_) { }
			            }

			            function buildBlocklistUserRuleDetailScreen(ruleId) {
			              try {
			                var api = getBlocklistApi();
			                var list = [];
			                try { list = (api && api.user && typeof api.user.getAll === 'function') ? api.user.getAll() : []; } catch (_) { list = []; }
			                var rule = null;
			                for (var i = 0; i < list.length; i++) {
			                  try { if (String(list[i].id) === String(ruleId)) { rule = list[i]; break; } } catch (_) { }
			                }

			                if (!rule) {
			                  var bad = 'Правило не найдено.';
			                  Lampa.SettingsApi.addParam({
			                    component: MAIN_COMPONENT,
			                    param: { name: 'bl_blocklist_user_detail_bad', type: 'static', values: bad, default: bad },
			                    field: { name: 'Пользовательские URL', description: bad }
			                  });
			                  return;
			                }

			                // Info (safe text)
			                try {
			                  Lampa.SettingsApi.addParam({
			                    component: MAIN_COMPONENT,
			                    param: { name: 'bl_blocklist_user_detail_info', type: 'static', default: true },
			                    field: { name: 'Правило', description: '' },
			                    onRender: function (item) {
			                      try {
			                        if (!window.$ || !item) return;
			                        try { item.find('.settings-param__name').text(String(rule.pattern || '')); } catch (_) { }
			                        var descr = 'type: ' + String(rule.type || 'simple');
			                        try {
			                          if (rule.type === 'advanced' && rule.advanced) {
			                            if (rule.advanced.contentType) descr += '\ncontent-type: ' + String(rule.advanced.contentType);
			                            if (rule.advanced.bodyMode) descr += '\nbody: ' + String(rule.advanced.bodyMode);
			                          }
			                        } catch (_) { }
			                        try {
			                          var $d = item.find('.settings-param__descr');
			                          if (!$d.length) {
			                            item.append('<div class="settings-param__descr"></div>');
			                            $d = item.find('.settings-param__descr');
			                          }
			                          $d.text(descr);
			                        } catch (_) { }
			                        var $st = ensureStatusDot(item);
			                        setStatusDot($st, !!rule.enabled);
			                      } catch (_) { }
			                    }
			                  });
			                } catch (_) { }

			                // Toggle enable/disable
			                try {
			                  var toggleName = rule.enabled ? 'Выключить' : 'Включить';
			                  Lampa.SettingsApi.addParam({
			                    component: MAIN_COMPONENT,
			                    param: { name: 'bl_blocklist_user_detail_toggle', type: 'button' },
			                    field: { name: toggleName, description: 'Включает/выключает пользовательское правило.' },
			                    onChange: function () {
			                      try {
			                        var api2 = getBlocklistApi();
			                        if (api2 && api2.user && typeof api2.user.setEnabled === 'function') {
			                          api2.user.setEnabled(String(rule.id), !rule.enabled);
			                        }
			                      } catch (_) { }
			                      openBlocklistUserRuleDetailScreen(String(rule.id), uiBackUserRuleIndex, 0);
			                    }
			                  });
			                } catch (_) { }

			                // Delete
			                try {
			                  Lampa.SettingsApi.addParam({
			                    component: MAIN_COMPONENT,
			                    param: { name: 'bl_blocklist_user_detail_delete', type: 'button' },
			                    field: { name: 'Удалить', description: 'Удаляет пользовательское правило.' },
			                    onChange: function () {
			                      confirmAction('Удалить правило', 'Удалить правило?\n\n' + String(rule.pattern || ''), function () {
			                        try {
			                          var api2 = getBlocklistApi();
			                          if (api2 && api2.user && typeof api2.user.remove === 'function') api2.user.remove(String(rule.id));
			                        } catch (_) { }
			                        openBlocklistUserRulesScreen(uiBackBlocklistIndex, uiBackUserRuleIndex);
			                      });
			                    }
			                  });
			                } catch (_) { }
			              } catch (_) { }
			            }

			            function openBlocklistUserRuleDetailScreen(ruleId, backIndexUserList, focusIndex) {
			              try {
			                uiRoute = 'blocklist_user_detail';
			                uiDetailMeta = null;
			                uiUserRuleId = String(ruleId || '');
			                if (typeof backIndexUserList === 'number') uiBackUserRuleIndex = backIndexUserList;

			                resetMainParams();
			                buildBlocklistUserRuleDetailScreen(uiUserRuleId);

			                if (!window.Lampa || !Lampa.Settings || !Lampa.Settings.create) return;
			                var cp = {
			                  onBack: function () { openBlocklistUserRulesScreen(uiBackBlocklistIndex, uiBackUserRuleIndex); },
			                  __bl_ap_internal: true,
			                  __bl_ap_route: 'blocklist_user_detail'
			                };
			                if (typeof focusIndex === 'number' && focusIndex > 0) cp.last_index = focusIndex;
			                Lampa.Settings.create(String(MAIN_COMPONENT), cp);
			              } catch (_) { }
			            }

			            function buildBlocklistAddScreen() {
			              try {
			                var api = getBlocklistApi();
			                if (!api) {
			                  var na = 'Network policy не доступна.';
			                  Lampa.SettingsApi.addParam({
			                    component: MAIN_COMPONENT,
			                    param: { name: 'bl_blocklist_add_na', type: 'static', values: na, default: na },
			                    field: { name: 'URL Blocklist', description: na }
			                  });
			                  return;
			                }

			                // URL / Pattern
			                try {
			                  Lampa.SettingsApi.addParam({
			                    component: MAIN_COMPONENT,
			                    param: { name: BL_RULE_ADD_PATTERN, type: 'input', values: '', default: '', placeholder: 'https://example.com/*' },
			                    field: { name: 'URL / Pattern', description: 'Подстрока / wildcard (*) / /regex/i.' }
			                  });
			                } catch (_) { }

			                // Type
			                try {
			                  Lampa.SettingsApi.addParam({
			                    component: MAIN_COMPONENT,
			                    param: {
			                      name: BL_RULE_ADD_TYPE,
			                      type: 'select',
			                      values: { simple: 'Простое (simple)', advanced: 'Расширенное (advanced)' },
			                      default: 'simple'
			                    },
			                    field: { name: 'Тип правила', description: '' },
			                    onChange: function () {
			                      // Rebuild to show/hide advanced fields.
			                      openBlocklistAddScreen(uiBackBlocklistIndex, 2);
			                    }
			                  });
			                } catch (_) { }

			                var rt = 'simple';
			                try {
			                  rt = (window.Lampa && Lampa.Storage && Lampa.Storage.get) ? String(Lampa.Storage.get(BL_RULE_ADD_TYPE) || 'simple') : 'simple';
			                } catch (_) { rt = 'simple'; }

			                if (rt === 'advanced') {
			                  // Content-Type
			                  try {
			                    Lampa.SettingsApi.addParam({
			                      component: MAIN_COMPONENT,
			                      param: {
			                        name: BL_RULE_ADD_CT,
			                        type: 'select',
			                        values: {
			                          'application/json': 'application/json',
			                          'application/javascript': 'application/javascript',
			                          'text/css': 'text/css',
			                          'text/html': 'text/html',
			                          'image/svg+xml': 'image/svg+xml',
			                          'image/png': 'image/png',
			                          'image/jpeg': 'image/jpeg',
			                          'image/gif': 'image/gif',
			                          'image/webp': 'image/webp',
			                          'image/x-icon': 'image/x-icon',
			                          'text/plain': 'text/plain'
			                        },
			                        default: 'application/json'
			                      },
			                      field: { name: 'Content-Type', description: '' }
			                    });
			                  } catch (_) { }

			                  // Body mode
			                  try {
			                    Lampa.SettingsApi.addParam({
			                      component: MAIN_COMPONENT,
			                      param: { name: BL_RULE_ADD_BODY, type: 'select', values: { empty: 'empty', minimal: 'minimal' }, default: 'empty' },
			                      field: { name: 'Body mode', description: '' }
			                    });
			                  } catch (_) { }
			                }

			                // Save
			                try {
			                  Lampa.SettingsApi.addParam({
			                    component: MAIN_COMPONENT,
			                    param: { name: 'bl_blocklist_add_save', type: 'button' },
			                    field: { name: 'Сохранить', description: 'Добавляет правило и включает его.' },
			                    onChange: function () {
			                      try {
			                        var pat = '';
			                        try { pat = (window.Lampa && Lampa.Storage && Lampa.Storage.get) ? String(Lampa.Storage.get(BL_RULE_ADD_PATTERN) || '') : ''; } catch (_) { pat = ''; }
			                        pat = String(pat || '').trim();
			                        if (!pat) {
			                          try { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('[[BlackLampa]] Укажите URL / Pattern'); } catch (_) { }
			                          return;
			                        }

			                        var type = 'simple';
			                        try { type = (window.Lampa && Lampa.Storage && Lampa.Storage.get) ? String(Lampa.Storage.get(BL_RULE_ADD_TYPE) || 'simple') : 'simple'; } catch (_) { type = 'simple'; }
			                        if (type !== 'advanced') type = 'simple';

			                        var rule = { pattern: pat, type: type, enabled: true };
			                        if (type === 'advanced') {
			                          var ct = '';
			                          var bm = '';
			                          try { ct = (window.Lampa && Lampa.Storage && Lampa.Storage.get) ? String(Lampa.Storage.get(BL_RULE_ADD_CT) || '') : ''; } catch (_) { ct = ''; }
			                          try { bm = (window.Lampa && Lampa.Storage && Lampa.Storage.get) ? String(Lampa.Storage.get(BL_RULE_ADD_BODY) || '') : ''; } catch (_) { bm = ''; }
			                          rule.advanced = { contentType: ct, bodyMode: bm };
			                        }

			                        var api2 = getBlocklistApi();
			                        if (api2 && api2.user && typeof api2.user.add === 'function') {
			                          api2.user.add(rule);
			                          try { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('[[BlackLampa]] Правило добавлено'); } catch (_) { }
			                          openBlocklistUserRulesScreen(1, 0);
			                        } else {
			                          try { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('[[BlackLampa]] Network policy missing'); } catch (_) { }
			                        }
			                      } catch (_) { }
			                    }
			                  });
			                } catch (_) { }
			              } catch (_) { }
			            }

			            function openBlocklistAddScreen(backIndexBlocklist, focusIndex) {
			              try {
			                uiRoute = 'blocklist_add';
			                uiDetailMeta = null;
			                uiUserRuleId = '';
			                uiBackUserRuleIndex = 0;
			                if (typeof backIndexBlocklist === 'number') uiBackBlocklistIndex = backIndexBlocklist;

			                resetMainParams();
			                buildBlocklistAddScreen();

			                if (!window.Lampa || !Lampa.Settings || !Lampa.Settings.create) return;
			                var cp = {
			                  onBack: function () { openBlocklistScreen(uiBackMainIndex, uiBackBlocklistIndex); },
			                  __bl_ap_internal: true,
			                  __bl_ap_route: 'blocklist_add'
			                };
			                if (typeof focusIndex === 'number' && focusIndex > 0) cp.last_index = focusIndex;
			                Lampa.Settings.create(String(MAIN_COMPONENT), cp);
			              } catch (_) { }
			            }

			            function buildMainScreen() {
			              var idx = 0;

			              // Main menu items (required order)
		              // 1) Переинициализация
		              try {
		                Lampa.SettingsApi.addParam({
		                  component: MAIN_COMPONENT,
		                  param: { name: 'ap_reset', type: 'button' },
		                  field: { name: 'Переинициализация', description: 'Сбрасывает флаги первой установки AutoPlugin. При следующем запуске снова пойдёт установка из массива.' },
		                  onChange: function () {
		                    // WHY: user explicitly requests AutoPlugin to run again on next start.
		                    runOnce('Переинициализация', 'Сбросить флаги первой установки AutoPlugin?\n\nЭто НЕ удаляет плагины.', function () {
		                      resetFirstInstallFlags();
		                      try { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('[[BlackLampa]] AutoPlugin: флаг сброшен'); } catch (_) { }
		                      refreshInstallerSettingsUi();
		                    });
		                  }
		                });
		              } catch (_) { }
		              idx++;

		              // 2) Factory reset
		              try {
		                Lampa.SettingsApi.addParam({
		                  component: MAIN_COMPONENT,
		                  param: { name: 'ap_factory_reset', type: 'button' },
		                  field: { name: 'Сброс Lampa до заводских', description: 'Полный сброс доменных данных (localStorage/sessionStorage/cookies/кеши) + повторная блокировка авторизации. Выполняет перезагрузку.' },
		                  onChange: function () {
		                    // WHY: factory reset must reset first-install flags to avoid "skip" after restart.
		                    runOnce('Сброс Lampa до заводских', 'Сбросить Lampa до заводских?\n\nЭто удалит доменные данные и выполнит перезагрузку.\n\nВНИМАНИЕ: действие необратимо.', function () {
		                      resetLampa();
		                    });
		                  }
		                });
		              } catch (_) { }
		              idx++;

		              // 3) Remove all plugins
		              try {
		                Lampa.SettingsApi.addParam({
		                  component: MAIN_COMPONENT,
		                  param: { name: 'bl_remove_all_plugins', type: 'button' },
		                  field: { name: 'Удалить все плагины Lampa', description: 'Удаляет ВСЕ установленные плагины через Lampa.Storage (как в addon.js). Автоперезагрузка отключена.' },
		                  onChange: function () {
		                    // WHY: do NOT reset first-install flags here (avoid unexpected re-install on next start).
		                    runOnce('Удалить все плагины Lampa', 'Удалить ВСЕ плагины Lampa?\n\nАвтоперезагрузка отключена. При необходимости перезапустите приложение вручную.', function () {
		                      removeAllPluginsLampa();
		                    });
		                  }
		                });
		              } catch (_) { }
		              idx++;

		              // 4) Remove AutoPlugin Installer plugins (active list only)
		              try {
		                Lampa.SettingsApi.addParam({
		                  component: MAIN_COMPONENT,
		                  param: { name: 'bl_remove_autoplugin_plugins', type: 'button' },
		                  field: { name: 'Удалить плагины AutoPlugin Installer', description: 'Удаляет только плагины из bl.autoplugin.json → plugins[]. disabled[] не трогает.' },
		                  onChange: function () {
		                    // WHY: do NOT reset first-install flags here (avoid unwanted re-install).
		                    runOnce('Удалить плагины AutoPlugin Installer', 'Удалить плагины, которыми управляет AutoPlugin Installer?\n\nАвтоперезагрузка отключена. При необходимости перезапустите приложение вручную.', function () {
		                      removeManagedPluginsLampa();
		                    });
		                  }
		                });
		              } catch (_) { }
		              idx++;

			              // 5) Extras submenu
			              var extrasIndex = idx;
			              try {
			                Lampa.SettingsApi.addParam({
		                  component: MAIN_COMPONENT,
		                  param: { name: 'ap_extras', type: 'static', default: true },
		                  field: { name: 'Дополнительные плагины', description: 'Открывает список disabled[] из bl.autoplugin.json.' },
		                  onRender: function (item) {
		                    try {
		                      if (!item || !item.on) return;
		                      item.on('hover:enter', function () {
		                        openExtrasScreen(extrasIndex, 0);
		                      });
		                    } catch (_) { }
		                  }
		                });
			              } catch (_) { }
			              idx++;

			              // 6) Log viewer (popup)
			              try {
			                Lampa.SettingsApi.addParam({
			                  component: MAIN_COMPONENT,
			                  param: { name: 'ap_log_viewer', type: 'static', default: true },
			                  field: { name: 'Лог AutoPlugin Installer', description: 'Открывает popup-лог в режиме просмотра.' },
			                  onRender: function (item) {
			                    try {
			                      if (!item || !item.on) return;
			                      item.on('hover:enter', function () {
			                        try {
			                          if (window.BL && BL.Log && typeof BL.Log.openViewer === 'function') BL.Log.openViewer();
			                          else if (window.BL && BL.Log && typeof BL.Log.ensurePopup === 'function') {
			                            BL.Log.ensurePopup();
			                            if (BL.Log && BL.Log.showInfo) BL.Log.showInfo('AutoPlugin', 'viewer', 'BL.Log.openViewer missing');
			                          }
			                        } catch (_) { }
			                      });
			                    } catch (_) { }
			                  }
			                });
				              } catch (_) { }
				              idx++;

				              // 7) URL Blocklist
				              var blocklistIndex = idx;
				              try {
				                Lampa.SettingsApi.addParam({
				                  component: MAIN_COMPONENT,
				                  param: { name: 'bl_url_blocklist', type: 'static', default: true },
				                  field: { name: 'URL Blocklist', description: 'Управление сетевыми блокировками BlackLampa: встроенные правила + пользовательские URL.' },
				                  onRender: function (item) {
				                    try {
				                      if (!item || !item.on) return;
				                      item.on('hover:enter', function () {
				                        openBlocklistScreen(blocklistIndex, 0);
				                      });
				                    } catch (_) { }
				                  }
				                });
				              } catch (_) { }
				              idx++;

				              // X) Status (last, help + raw inside one item)
				              try {
				                Lampa.SettingsApi.addParam({
				                  component: MAIN_COMPONENT,
				                  param: { name: 'ap_status', type: 'static', values: '', default: '' },
			                  field: { name: 'Статус', description: '' },
			                  onRender: function (item) {
			                    try {
			                      if (!window.$ || !item) return;

			                      var $d = item.find('.settings-param__descr');
			                      if (!$d.length) {
			                        item.append('<div class="settings-param__descr"></div>');
			                        $d = item.find('.settings-param__descr');
			                      }

			                      var doneFlag = String(lsGet(AP_KEYS.done) || '') === '1';
			                      var sigOk = String(lsGet(AP_KEYS.sig) || '') === calcPluginsSig();
			                      var ts = toInt(lsGet(AP_KEYS.ts), 0);

			                      var line1 = 'done=' + (doneFlag ? '1' : '0') + ' — ' + (doneFlag ? 'первичная автоустановка выполнена' : 'первичная автоустановка не выполнена') +
			                        '; sig=' + (sigOk ? 'ok' : 'no') + ' — ' + (sigOk ? 'подпись списка совпадает' : 'подпись списка отличается');
			                      var line2 = ts ? ('ts=' + new Date(ts).toLocaleString() + ' — время фиксации') : '';
			                      var raw = getStatusInfoString();

			                      $d.empty();
			                      $d.append($('<div></div>').text(line1));
			                      if (line2) $d.append($('<div></div>').text(line2));
			                      $d.append($('<div></div>').text(raw));
			                    } catch (_) { }
			                  }
			                });
			              } catch (_) { }
			              idx++;
			            }

		            // Seed main screen params (do NOT open Settings here).
		            resetMainParams();
		            buildMainScreen();

		          } catch (_) { }
		        }

        // ============================================================================
        // global error hooks
        // ============================================================================
        var currentPlugin = null;

	        function onWinError(ev) {
	          if (LOG_MODE === 0) return;
	          try {
	            var src0 = currentPlugin || (ev && ev.filename ? ev.filename : 'window');
	            if (BL.Log && typeof BL.Log.showException === 'function') {
	              BL.Log.showException(src0, ev, { type: 'window.onerror' });
	              return;
	            }

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
	            var src0 = currentPlugin || 'Promise';
	            if (BL.Log && typeof BL.Log.showException === 'function') {
	              BL.Log.showException(src0, ev, { type: 'unhandledrejection' });
	              return;
	            }

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
	                refreshInstallerSettingsUi();
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
	            refreshInstallerSettingsUi();

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
		          else if (BL.cfg && BL.cfg.LOG_MODE !== 0 && BL.Console && BL.Console.warn) BL.Console.warn('[BlackLampa] WRN AutoPlugin: config load error | ' + msg);
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
