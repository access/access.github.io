(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.PolicyNetwork = BL.PolicyNetwork || {};

  function logCall(log, method, source, message, extra) {
    try {
      if (!log) return;
      var fn = log[method];
      if (typeof fn === 'function') fn.call(log, source, message, extra);
    } catch (_) { }
  }

  // ============================================================================
  // NETWORK POLICY (как в старом autoplugin)
  //
  // Цель:
  // - блокировать трекеры/статистику и нежелательные домены (Yandex / Google / Stats)
  // - блокировать BWA CORS check (/cors/check) чтобы не засорять сеть
  // - подменять CUB blacklist на [] (чтобы внешние blacklist не отключали плагины)
  //
  // Важно: install() должен быть идемпотентным — он вызывается и в PHASE 0 (до auth),
  // и позже из AutoPlugin (на всякий случай).
  // ============================================================================
  var BLOCK_YANDEX_RE =
    /(^|\.)((yandex\.(ru|com|net|by|kz|ua|uz|tm|tj))|(ya\.ru)|(yastatic\.net)|(yandex\.(net|com)\.tr))$/i;

  var BLOCK_GOOGLE_YT_RE =
    /(^|\.)((google\.com)|(google\.[a-z.]+)|(gstatic\.com)|(googlesyndication\.com)|(googleadservices\.com)|(doubleclick\.net)|(googletagmanager\.com)|(google-analytics\.com)|(analytics\.google\.com)|(api\.google\.com)|(accounts\.google\.com)|(recaptcha\.net)|(youtube\.com)|(ytimg\.com)|(googlevideo\.com)|(youtu\.be)|(youtube-nocookie\.com))$/i;

  var BLOCK_STATS_RE =
    /(^|\.)((scorecardresearch\.com)|(quantserve\.com)|(cdn\.quantserve\.com)|(hotjar\.com)|(static\.hotjar\.com)|(mixpanel\.com)|(api\.mixpanel\.com)|(sentry\.io)|(o\\d+\\.ingest\\.sentry\\.io)|(datadoghq\\.com)|(segment\\.com)|(api\\.segment\\.io)|(amplitude\\.com)|(api\\.amplitude\\.com)|(branch\\.io)|(app-measurement\\.com))$/i;

  function isBwaCorsCheck(url) {
    try {
      var host = String(url.hostname || '').toLowerCase();
      var path = String(url.pathname || '').toLowerCase();
      var isBwa = (host === 'bwa.to') || (host.length > 7 && host.slice(host.length - 7) === '.bwa.to');
      if (!isBwa) return false;
      return path.indexOf('/cors/check') === 0;
    } catch (_) {
      return false;
    }
  }

  function classifyBlocked(url) {
    try {
      if (!url) return null;
      if (isBwaCorsCheck(url)) return 'BWA:CORS';

      var h = String(url.hostname || '').toLowerCase();
      if (!h) return null;

      if (BLOCK_YANDEX_RE.test(h)) return 'Yandex';
      if (BLOCK_GOOGLE_YT_RE.test(h)) return 'Google/YouTube';
      if (BLOCK_STATS_RE.test(h)) return 'Statistics';

      return null;
    } catch (_) {
      return null;
    }
  }

  function isBlockedUrl(u) {
    try {
      if (!u) return null;
      var url = new URL(String(u), location.href);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return classifyBlocked(url);
    } catch (_) {
      return null;
    }
  }

  function logBlocked(u, where, why, log) {
    var label = (why || 'Blocked');
    var extra = String(where) + ' | ' + String(u);
    if (log) logCall(log, 'showWarn', 'Net', 'BLOCKED (' + label + ')', extra);
    else {
      try { console.warn('[BlackLampa] WRN Net: BLOCKED (' + label + ') | ' + extra); } catch (_) { }
    }
  }

  // [ADDED] CUB blacklist override (return empty array)
  function isCubBlacklistUrl(u) {
    try {
      if (!u) return false;
      var url = new URL(String(u), location.href);
      var host = String(url.hostname || '').toLowerCase();
      var path = String(url.pathname || '').toLowerCase();
      return (host === 'cub.rip') && (path === '/api/plugins/blacklist');
    } catch (_) {
      return false;
    }
  }

  function makeJsonEmptyResponseFetch() {
    try {
      if (typeof Response === 'function') {
        return new Response('[]', {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      }
    } catch (_) { }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: function () { return 'application/json; charset=utf-8'; } },
      text: function () { return Promise.resolve('[]'); },
      json: function () { return Promise.resolve([]); },
      clone: function () { return this; }
    };
  }

  function install(log) {
    // idempotency guard (do not wrap fetch/xhr/ws twice)
    if (BL.PolicyNetwork.__installed) {
      logCall(log, 'showDbg', 'Policy', 'already installed', '');
      return;
    }
    BL.PolicyNetwork.__installed = true;

    if (window.fetch) {
      var origFetch = window.fetch.bind(window);
      window.fetch = function (input, init) {
        var u = (typeof input === 'string') ? input : (input && input.url) ? input.url : '';

        if (isCubBlacklistUrl(u)) {
          logCall(log, 'showOk', 'CUB', 'blacklist overridden', 'fetch | ' + String(u));
          return Promise.resolve(makeJsonEmptyResponseFetch());
        }

        var why = isBlockedUrl(u);
        if (why) {
          logBlocked(u, 'fetch', why, log);
          return Promise.reject(new TypeError('Blocked by policy: ' + why));
        }
        return origFetch(input, init);
      };
    }

    if (window.XMLHttpRequest) {
      var XHR = window.XMLHttpRequest;
      var origOpen = XHR.prototype.open;
      var origSend = XHR.prototype.send;

      XHR.prototype.open = function (method, url) {
        this.__ap_url = url;
        this.__ap_mock_cub_blacklist = isCubBlacklistUrl(url);
        this.__ap_block_reason = isBlockedUrl(url);
        return origOpen.apply(this, arguments);
      };

      XHR.prototype.send = function () {
        if (this.__ap_mock_cub_blacklist) {
          var xhr0 = this;
          var u0 = this.__ap_url;

          setTimeout(function () {
            try {
              try { Object.defineProperty(xhr0, 'readyState', { value: 4, configurable: true }); } catch (_) { }
              try { Object.defineProperty(xhr0, 'status', { value: 200, configurable: true }); } catch (_) { }
              try { Object.defineProperty(xhr0, 'statusText', { value: 'OK', configurable: true }); } catch (_) { }
              try { Object.defineProperty(xhr0, 'responseType', { value: '', configurable: true }); } catch (_) { }

              try { Object.defineProperty(xhr0, 'responseText', { value: '[]', configurable: true }); } catch (_) { }
              try { Object.defineProperty(xhr0, 'response', { value: '[]', configurable: true }); } catch (_) { }
              try { Object.defineProperty(xhr0, 'responseURL', { value: String(u0 || ''), configurable: true }); } catch (_) { }

              logCall(log, 'showOk', 'CUB', 'blacklist overridden', 'XHR | ' + String(u0));

              try { if (xhr0.onreadystatechange) xhr0.onreadystatechange(); } catch (_) { }
              try { if (xhr0.onload) xhr0.onload(); } catch (_) { }
              try { if (xhr0.dispatchEvent) xhr0.dispatchEvent(new Event('readystatechange')); } catch (_) { }
              try { if (xhr0.dispatchEvent) xhr0.dispatchEvent(new Event('load')); } catch (_) { }
            } catch (_) { }
          }, 0);
          return;
        }

        if (this.__ap_block_reason) {
          var u = this.__ap_url;
          var why = this.__ap_block_reason;
          logBlocked(u, 'XHR', why, log);

          var xhr = this;
          setTimeout(function () {
            try { if (xhr.onerror) xhr.onerror(new Error('Blocked by policy: ' + why)); } catch (_) { }
            try { if (xhr.onreadystatechange) xhr.onreadystatechange(); } catch (_) { }
            try { if (xhr.dispatchEvent) xhr.dispatchEvent(new Event('error')); } catch (_) { }
          }, 0);
          return;
        }
        return origSend.apply(this, arguments);
      };
    }

    if (navigator.sendBeacon) {
      var origBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function (url, data) {
        var why = isBlockedUrl(url);
        if (why) {
          logBlocked(url, 'sendBeacon', why, log);
          return false;
        }
        return origBeacon(url, data);
      };
    }

    if (window.WebSocket) {
      var OrigWS = window.WebSocket;
      window.WebSocket = function (url, protocols) {
        var why = isBlockedUrl(url);
        if (why) {
          logBlocked(url, 'WebSocket', why, log);
          throw new Error('Blocked by policy: ' + why);
        }
        return (protocols !== undefined) ? new OrigWS(url, protocols) : new OrigWS(url);
      };
      window.WebSocket.prototype = OrigWS.prototype;
    }

    logCall(log, 'showOk', 'Policy', 'installed', 'Yandex + Google/YouTube + Statistics + BWA:CORS(/cors/check) + CUB:blacklist([])');
  }

  BL.PolicyNetwork.install = install;
  BL.PolicyNetwork.isBlockedUrl = isBlockedUrl;
})();
