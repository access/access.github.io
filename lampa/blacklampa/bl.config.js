(function () {
  'use strict';

  // Centralized configuration for the whole BlackLampa subsystem.
  // All tunables (timeouts, flags, keys, limits) must live here and be read via BL.Config.

  var BL = window.BL = window.BL || {};
  BL.Config = BL.Config || {};

  function ensureObj(root, key) {
    try {
      var v = root[key];
      if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    } catch (_) { }
    root[key] = {};
    return root[key];
  }

  function setDefault(obj, key, value) {
    try {
      if (obj[key] === undefined || obj[key] === null) obj[key] = value;
    } catch (_) { }
  }

  var cfg = BL.Config;

  var ui = ensureObj(cfg, 'ui');
  var log = ensureObj(cfg, 'log');
  var auth = ensureObj(cfg, 'auth');
  var preload = ensureObj(cfg, 'preload');
  var autoplugin = ensureObj(cfg, 'autoplugin');
  var storage = ensureObj(cfg, 'storage');

  // UI (popup logger)
  setDefault(ui, 'popupMs', 5000);
  setDefault(ui, 'popupZIndex', 2147483647);
  setDefault(ui, 'popupInsetPx', 5);
  setDefault(ui, 'popupBorderRadiusPx', 12);
  setDefault(ui, 'popupProgressHeightPx', 2);
  setDefault(ui, 'popupScrollTolPx', 40);

  // Logging
  setDefault(log, 'defaultMode', 1);
  setDefault(log, 'titlePrefix', 'BlackLampa log');
  setDefault(log, 'modeLsKey', 'aplog');
  setDefault(log, 'modeQueryParams', ['aplog', 'apmode']);
  setDefault(log, 'maxLines', 120);
  setDefault(log, 'showThrottleMs', 400);
  // When true, each log line is appended to DOM immediately (no queue/flush).
  setDefault(log, 'immediate', true);

  // Auth
  // NOTE: key name is legacy; kept for compatibility (do not change without migration).
  setDefault(auth, 'key', 'msx_fake_auth_ok_v2');
  setDefault(auth, 'authJson', '/lampa/blacklampa/bl.auth.json');

  // Preload
  setDefault(preload, 'jsonFile', 'bl.preload.json');
  // NOTE: keys are legacy; kept for compatibility.
  setDefault(preload, 'appliedFlagKey', 'msx_preload_applied_v1');
  setDefault(preload, 'fallbackJsonKey', 'msx_preload_json_v1');

  // AutoPlugin
  setDefault(autoplugin, 'jsonFile', 'bl.autoplugin.json');
  setDefault(autoplugin, 'doneFallbackMs', 30000);
  var apFlags = ensureObj(autoplugin, 'flags');
  setDefault(apFlags, 'done', 'ap_installer_done_v1');
  setDefault(apFlags, 'sig', 'ap_installer_sig_v1');
  setDefault(apFlags, 'ts', 'ap_installer_ts_v1');

  // Storage guards
  setDefault(storage, 'pluginsBlacklistKey', 'plugins_blacklist');
  setDefault(storage, 'pluginsBlacklistEmpty', '[]');
  setDefault(storage, 'pluginsBlacklistWatchdogMs', 2000);
})();

