(function () {
	  'use strict';

	  var BL = window.BL = window.BL || {};
	  BL.Net = BL.Net || {};
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

	  // ============================================================================
	  // Unified blocking model:
	  //   block => fake "OK" response + mandatory WRN log
	  // ============================================================================
	  function normalizeUrlString(u) { try { return String(u || ''); } catch (_) { return ''; } }

	  function guessFakePayload(context) {
	    context = context || {};
	    var urlStr = normalizeUrlString(context.url);
	    var reason = String(context.reason || '');

	    var contentType = 'text/plain; charset=utf-8';
	    var bodyText = '';

	    try {
	      var url = new URL(urlStr, location.href);
	      var path = String(url.pathname || '').toLowerCase();

	      var isJson = (path.lastIndexOf('.json') === (path.length - 5));
	      var isJs = (path.lastIndexOf('.js') === (path.length - 3)) || (path.lastIndexOf('.mjs') === (path.length - 4));
	      var isCss = (path.lastIndexOf('.css') === (path.length - 4));
	      var isHtml = (path.lastIndexOf('.html') === (path.length - 5)) || (path.lastIndexOf('.htm') === (path.length - 4));

	      var ext = '';
	      try {
	        var dot = path.lastIndexOf('.');
	        if (dot >= 0) ext = path.slice(dot + 1);
	      } catch (_) { ext = ''; }

	      var isPng = ext === 'png';
	      var isJpg = ext === 'jpg' || ext === 'jpeg';
	      var isGif = ext === 'gif';
	      var isWebp = ext === 'webp';
	      var isSvg = ext === 'svg';
	      var isIco = ext === 'ico';

	      if (isJson || /blacklist/i.test(path) || String(reason).indexOf('CUB:blacklist') === 0) {
	        contentType = 'application/json; charset=utf-8';
	        bodyText = (/blacklist/i.test(path) || String(reason).indexOf('CUB:blacklist') === 0) ? '[]' : '{}';
	      } else if (isJs) {
	        contentType = 'application/javascript; charset=utf-8';
	        bodyText = '';
	      } else if (isCss) {
	        contentType = 'text/css; charset=utf-8';
	        bodyText = '';
	      } else if (isHtml) {
	        contentType = 'text/html; charset=utf-8';
	        bodyText = '';
	      } else if (isSvg) {
	        contentType = 'image/svg+xml; charset=utf-8';
	        bodyText = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
	      } else if (isPng) {
	        contentType = 'image/png';
	        bodyText = '';
	      } else if (isJpg) {
	        contentType = 'image/jpeg';
	        bodyText = '';
	      } else if (isGif) {
	        contentType = 'image/gif';
	        bodyText = '';
	      } else if (isWebp) {
	        contentType = 'image/webp';
	        bodyText = '';
	      } else if (isIco) {
	        contentType = 'image/x-icon';
	        bodyText = '';
	      } else {
	        contentType = 'text/plain; charset=utf-8';
	        bodyText = '';
	      }
	    } catch (_) { }

	    return { contentType: contentType, bodyText: bodyText, url: urlStr };
	  }

	  function makeEventSafe(type) {
	    try { return new Event(type); } catch (_) { }
	    try {
	      var e = document.createEvent('Event');
	      e.initEvent(type, false, false);
	      return e;
	    } catch (_) { }
	    return null;
	  }

	  BL.Net.logBlocked = BL.Net.logBlocked || function (context) {
	    try {
	      context = context || {};
	      var u = normalizeUrlString(context.url);
	      var t = String(context.type || '');
	      var r = String(context.reason || '');
	      var line = '[BlackLampa][NET][BLOCK][' + t + '] ' + r + ' ' + u;

	      // Prefer popup logger (and its console mirror) when available.
	      try {
	        if (BL.Log && typeof BL.Log.raw === 'function') {
	          BL.Log.raw('WRN', line);
	          return;
	        }
	      } catch (_) { }

	      try { if (BL.Console && BL.Console.warn) return BL.Console.warn(line); } catch (_) { }
	      try { if (BL.Console && BL.Console.log) return BL.Console.log(line); } catch (_) { }
	    } catch (_) { }
	  };

	  function makeFetchResponse(payload) {
	    var bodyText = String(payload.bodyText || '');
	    var contentType = String(payload.contentType || 'text/plain; charset=utf-8');
	    var url = normalizeUrlString(payload.url);

	    try {
	      if (typeof Response === 'function') {
	        return new Response(bodyText, { status: 200, headers: { 'Content-Type': contentType } });
	      }
	    } catch (_) { }

	    return {
	      ok: true,
	      status: 200,
	      statusText: 'OK',
	      url: url,
	      headers: {
	        get: function (k) {
	          try {
	            if (!k) return null;
	            return (/content-type/i.test(String(k))) ? contentType : null;
	          } catch (_) { return null; }
	        }
	      },
	      text: function () { return Promise.resolve(bodyText); },
	      json: function () {
	        try { return Promise.resolve(JSON.parse(bodyText || '{}')); }
	        catch (_) { return Promise.resolve(null); }
	      },
	      clone: function () { return makeFetchResponse(payload); }
	    };
	  }

	  function applyFakeOkToXhr(xhr, payload) {
	    try {
	      var bodyText = String(payload.bodyText || '');
	      var contentType = String(payload.contentType || '');
	      var url = normalizeUrlString(payload.url);

	      try { Object.defineProperty(xhr, 'readyState', { value: 4, configurable: true }); } catch (_) { }
	      try { Object.defineProperty(xhr, 'status', { value: 200, configurable: true }); } catch (_) { }
	      try { Object.defineProperty(xhr, 'statusText', { value: 'OK', configurable: true }); } catch (_) { }
	      try { Object.defineProperty(xhr, 'responseURL', { value: url, configurable: true }); } catch (_) { }

	      var respVal = bodyText;
	      try {
	        if (xhr && xhr.responseType === 'json') respVal = JSON.parse(bodyText || 'null');
	      } catch (_) { respVal = null; }

	      try { Object.defineProperty(xhr, 'responseText', { value: bodyText, configurable: true }); } catch (_) { }
	      try { Object.defineProperty(xhr, 'response', { value: respVal, configurable: true }); } catch (_) { }

	      // Best-effort header getter.
	      try {
	        if (typeof xhr.getResponseHeader !== 'function') {
	          xhr.getResponseHeader = function (k) {
	            try {
	              if (!k) return null;
	              return (/content-type/i.test(String(k))) ? contentType : null;
	            } catch (_) { return null; }
	          };
	        }
	      } catch (_) { }

	      try { if (xhr.onreadystatechange) xhr.onreadystatechange(); } catch (_) { }
	      try { if (xhr.onload) xhr.onload(); } catch (_) { }

	      try {
	        if (xhr.dispatchEvent) {
	          var e1 = makeEventSafe('readystatechange');
	          if (e1) xhr.dispatchEvent(e1);
	          var e2 = makeEventSafe('load');
	          if (e2) xhr.dispatchEvent(e2);
	        }
	      } catch (_) { }
	    } catch (_) { }
	  }

	  function makeFakeWebSocket(url, why) {
	    var ws = null;
	    try { ws = Object.create(window.WebSocket && window.WebSocket.prototype ? window.WebSocket.prototype : {}); }
	    catch (_) { ws = {}; }

	    try { ws.url = normalizeUrlString(url); } catch (_) { }
	    try { ws.readyState = 3; } catch (_) { } // CLOSED
	    try { ws.bufferedAmount = 0; } catch (_) { }
	    try { ws.extensions = ''; } catch (_) { }
	    try { ws.protocol = ''; } catch (_) { }
	    try { ws.binaryType = 'blob'; } catch (_) { }

	    ws.send = function () { };
	    ws.close = function () { };
	    ws.addEventListener = function () { };
	    ws.removeEventListener = function () { };
	    ws.dispatchEvent = function () { return false; };

	    ws.onopen = null;
	    ws.onmessage = null;
	    ws.onerror = null;
	    ws.onclose = null;

	    setTimeout(function () {
	      try {
	        if (typeof ws.onclose === 'function') {
	          ws.onclose({ type: 'close', code: 1000, reason: String(why || 'Blocked'), wasClean: true });
	        }
	      } catch (_) { }
	    }, 0);

	    return ws;
	  }

	  BL.Net.makeFakeOkResponse = BL.Net.makeFakeOkResponse || function (context) {
	    context = context || {};
	    var type = String(context.type || '');
	    var payload = guessFakePayload(context);

	    if (type === 'fetch') return makeFetchResponse(payload);
	    if (type === 'xhr') {
	      return {
	        ok: true,
	        status: 200,
	        statusText: 'OK',
	        url: payload.url,
	        contentType: payload.contentType,
	        bodyText: payload.bodyText,
	        applyToXhr: function (xhr) { applyFakeOkToXhr(xhr, payload); }
	      };
	    }
	    if (type === 'beacon') return true;
	    if (type === 'ws') return makeFakeWebSocket(payload.url, context.reason);

	    return { ok: true, status: 200, statusText: 'OK' };
	  };

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
	          return Promise.resolve(BL.Net.makeFakeOkResponse({ url: u, type: 'fetch', reason: 'CUB:blacklist' }));
	        }

	        var why = isBlockedUrl(u);
	        if (why) {
	          BL.Net.logBlocked({ url: u, type: 'fetch', reason: why });
	          return Promise.resolve(BL.Net.makeFakeOkResponse({ url: u, type: 'fetch', reason: why }));
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
	              logCall(log, 'showOk', 'CUB', 'blacklist overridden', 'XHR | ' + String(u0));
	              var fake = BL.Net.makeFakeOkResponse({ url: u0, type: 'xhr', reason: 'CUB:blacklist' });
	              if (fake && fake.applyToXhr) fake.applyToXhr(xhr0);
	            } catch (_) { }
	          }, 0);
	          return;
	        }

	        if (this.__ap_block_reason) {
	          var u = this.__ap_url;
	          var why = this.__ap_block_reason;
	          BL.Net.logBlocked({ url: u, type: 'xhr', reason: why });

	          var xhr = this;
	          setTimeout(function () {
	            try {
	              var fake = BL.Net.makeFakeOkResponse({ url: u, type: 'xhr', reason: why });
	              if (fake && fake.applyToXhr) fake.applyToXhr(xhr);
	            } catch (_) { }
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
	          BL.Net.logBlocked({ url: url, type: 'beacon', reason: why });
	          return !!BL.Net.makeFakeOkResponse({ url: url, type: 'beacon', reason: why });
	        }
	        return origBeacon(url, data);
	      };
	    }

	    if (window.WebSocket) {
	      var OrigWS = window.WebSocket;
	      window.WebSocket = function (url, protocols) {
	        var why = isBlockedUrl(url);
	        if (why) {
	          BL.Net.logBlocked({ url: url, type: 'ws', reason: why });
	          return BL.Net.makeFakeOkResponse({ url: url, type: 'ws', reason: why });
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
