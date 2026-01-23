(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.Log = BL.Log || {};

  var DEFAULT_LOG_MODE = 1;
  var LOG_MODE = 0;

  var TITLE_PREFIX = 'AutoPlugin log';
  var CONSOLE_PREFIX = '[[AutoPlugin]]';

  var POPUP_MS = 20000;
  var MAX_LINES = 120;

  var popupEl = null;
  var popupTimer = null;

  var popupQueue = [];
  var popupBodyEl = null;
  var renderedCount = 0;

  var TAG_STYLE = {
    'ERR': { color: '#ff4d4f' },
    'WRN': { color: '#ffa940' },
    'OK ': { color: '#52c41a' },
    'INF': { color: '#40a9ff' },
    'DBG': { color: '#8c8c8c' }
  };

  var POPUP_FONT = '12px/1.35 Courier, "Courier New", monospace';

  function safe(fn) { try { return fn(); } catch (_) { return null; } }

  function clampMode(m) {
    if (m !== 0 && m !== 1 && m !== 2) return DEFAULT_LOG_MODE;
    return m;
  }

  function getLogMode() {
    var q = BL.Core && BL.Core.getQueryParam ? BL.Core.getQueryParam('aplog') : null;
    if (q == null && BL.Core && BL.Core.getQueryParam) q = BL.Core.getQueryParam('apmode');
    if (q != null) return clampMode((BL.Core && BL.Core.toInt) ? BL.Core.toInt(q, DEFAULT_LOG_MODE) : DEFAULT_LOG_MODE);

    try {
      var ls = null;
      try { ls = localStorage.getItem('aplog'); } catch (_) { }
      if (ls != null && ls !== '') return clampMode((BL.Core && BL.Core.toInt) ? BL.Core.toInt(ls, DEFAULT_LOG_MODE) : DEFAULT_LOG_MODE);
    } catch (_) { }

    return clampMode(DEFAULT_LOG_MODE);
  }

  function ensurePopup() {
    if (LOG_MODE === 0) return null;
    if (popupEl) return popupEl;
    if (!document || !document.body) return null;

    var el = document.createElement('div');
    el.id = '__autoplugin_popup';
    el.style.cssText = [
      'all:initial',
      'unicode-bidi:plaintext',
      'position:fixed',
      'isolation:isolate',
      'top:12px',
      'left:12px',
      'right:12px',
      'bottom:12px',
      'z-index:2147483647',
      'background:rgba(0,0,0,0.44)',
      'color:#fff',
      'border-radius:12px',
      'padding:10px 12px',
      'box-sizing:border-box',
      'font:' + POPUP_FONT,
      'font-weight:500',
      'font-variant-ligatures:none',
      'letter-spacing:0',
      '-webkit-font-smoothing:antialiased',
      'text-rendering:optimizeSpeed',
      'pointer-events:none',
      'white-space:pre-wrap',
      'word-break:break-word',
      'overflow:auto',
      'box-shadow:0 10px 30px rgba(0,0,0,0.25)'
    ].join(';');

    var title = document.createElement('div');
    title.id = '__autoplugin_popup_title';
    title.style.cssText = [
      'font:' + POPUP_FONT,
      'font-weight:700',
      'margin-bottom:6px',
      'opacity:.95'
    ].join(';');
    title.textContent = String(TITLE_PREFIX) + ' (mode=' + String(LOG_MODE) + ')';

    var body = document.createElement('div');
    body.id = '__autoplugin_popup_body';

    el.appendChild(title);
    el.appendChild(body);
    document.body.appendChild(el);

    popupEl = el;
    popupBodyEl = body;
    renderedCount = 0;

    safe(function () { schedulePopupFlush(); });
    return el;
  }

  function clearNode(node) {
    try { while (node && node.firstChild) node.removeChild(node.firstChild); } catch (_) { }
  }

  var COALESCE_WINDOW_MS = 1500;
  var lastKey = '';
  var lastIdx = -1;
  var lastTs = 0;

  var RATE_MAX_PER_SEC = 25;
  var rateBucketTs = 0;
  var rateBucketCount = 0;

  function makeKey(tag, source, message, extra) {
    return String(tag) + '|' + String(source) + '|' + String(message) + '|' + String(extra || '');
  }

  function rateAllow() {
    var now = Date.now();
    if (!rateBucketTs || (now - rateBucketTs) >= 1000) {
      rateBucketTs = now;
      rateBucketCount = 0;
    }
    rateBucketCount++;
    return rateBucketCount <= RATE_MAX_PER_SEC;
  }

  function decorateLine(line, count) {
    if (!count || count <= 1) return line;
    return line + '  ×' + String(count);
  }

  var flushScheduled = false;
  function schedulePopupFlush() {
    if (LOG_MODE === 0) return;
    if (flushScheduled) return;
    flushScheduled = true;

    var runner = function () {
      flushScheduled = false;
      flushPopupToDom();
    };

    if (window.requestAnimationFrame) window.requestAnimationFrame(runner);
    else setTimeout(runner, 0);
  }

  function makeRow(entry) {
    var row = document.createElement('div');
    row.textContent = entry.line;
    row.style.cssText = [
      'font:' + POPUP_FONT,
      'font-weight:500',
      'margin:0',
      'padding:0'
    ].join(';');

    var tag = entry.tag;
    if (tag && TAG_STYLE[tag]) row.style.color = TAG_STYLE[tag].color;

    return row;
  }

  function fullRebuild() {
    var el = ensurePopup();
    if (!el || !popupBodyEl) return;

    clearNode(popupBodyEl);
    var frag = document.createDocumentFragment();
    for (var i = 0; i < popupQueue.length; i++) frag.appendChild(makeRow(popupQueue[i]));
    popupBodyEl.appendChild(frag);
    renderedCount = popupQueue.length;
  }

  function flushPopupToDom() {
    var el = ensurePopup();
    if (!el || !popupBodyEl) return;

    if (renderedCount > popupQueue.length) renderedCount = 0;

    if (renderedCount === 0 && popupQueue.length > 0 && popupBodyEl.childNodes.length === 0) {
      fullRebuild();
      return;
    }

    if (renderedCount < popupQueue.length) {
      var frag = document.createDocumentFragment();
      for (var i = renderedCount; i < popupQueue.length; i++) frag.appendChild(makeRow(popupQueue[i]));
      popupBodyEl.appendChild(frag);
      renderedCount = popupQueue.length;
    }

    safe(function () {
      var lastDom = popupBodyEl.lastChild;
      var lastQ = popupQueue[popupQueue.length - 1];
      if (lastDom && lastQ && lastDom.textContent !== lastQ.line) lastDom.textContent = lastQ.line;
    });
  }

  function showPopupNow() {
    if (LOG_MODE === 0) return;
    var el = ensurePopup();
    if (!el) return;

    el.style.display = 'block';
    if (popupTimer) clearTimeout(popupTimer);
    popupTimer = setTimeout(function () {
      if (popupEl) popupEl.style.display = 'none';
    }, POPUP_MS);
  }

  function pushPopupLine(line, tag, key) {
    if (LOG_MODE === 0) return;

    if (!rateAllow()) {
      var now = Date.now();
      if ((now - rateBucketTs) < 1000 && rateBucketCount === (RATE_MAX_PER_SEC + 1)) {
        var ts = new Date().toLocaleTimeString();
        var l = '[' + ts + '] WRN AutoPlugin: log rate limited | max=' + String(RATE_MAX_PER_SEC) + '/s';
        popupQueue.push({ line: l, tag: 'WRN', key: 'rate', ts: now, count: 1 });
        while (popupQueue.length > MAX_LINES) { popupQueue.shift(); renderedCount = 0; }
        schedulePopupFlush();
        showPopupNow();
      }
      return;
    }

    var t = Date.now();

    if (key && key === lastKey && (t - lastTs) <= COALESCE_WINDOW_MS && lastIdx >= 0 && lastIdx < popupQueue.length) {
      var e = popupQueue[lastIdx];
      e.count = (e.count || 1) + 1;
      e.line = decorateLine(line, e.count);
      popupQueue[lastIdx] = e;
      schedulePopupFlush();
      showPopupNow();
      return;
    }

    popupQueue.push({ line: line, tag: tag || '', key: key || '', ts: t, count: 1 });

    while (popupQueue.length > MAX_LINES) {
      popupQueue.shift();
      renderedCount = 0;
      lastIdx = -1;
      lastKey = '';
    }

    lastKey = key || '';
    lastIdx = popupQueue.length - 1;
    lastTs = t;

    schedulePopupFlush();
    showPopupNow();
  }

  function consoleMirror(tag, source, message, extra) {
    try {
      if (LOG_MODE === 0) return;

      var pfx = String(CONSOLE_PREFIX) + ' ' + String(tag) + ' ' + String(source) + ': ' + String(message);
      var ex = extra ? String(extra) : '';

      var fn = null;
      if (tag === 'ERR') fn = (console && console.error) ? console.error : null;
      else if (tag === 'WRN') fn = (console && console.warn) ? console.warn : null;
      else if (tag === 'INF') fn = (console && console.info) ? console.info : null;
      else if (tag === 'DBG') fn = (console && console.debug) ? console.debug : null;
      else fn = (console && console.log) ? console.log : null;

      if (!fn) return;

      if (ex) fn.call(console, pfx, ex);
      else fn.call(console, pfx);
    } catch (_) { }
  }

  function showLine(tag, source, message, extra) {
    if (LOG_MODE === 0) return;
    var ts = new Date().toLocaleTimeString();
    var line = '[' + ts + '] ' + tag + ' ' + source + ': ' + message + (extra ? (' | ' + extra) : '');
    var key = makeKey(tag, source, message, extra);

    consoleMirror(tag, source, message, extra);
    pushPopupLine(line, tag, key);
  }

  function installBodyObserverOnce() {
    safe(function () {
      if (LOG_MODE === 0) return;
      if (!document || !document.documentElement) return;

      if (BL.Log && BL.Log.__bodyObserverInstalled) return;
      BL.Log.__bodyObserverInstalled = true;

      var mo = new MutationObserver(function () {
        if (document.body && !popupEl) {
          ensurePopup();
          safe(function () { if (popupEl) popupEl.style.display = 'none'; });
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  BL.Log.init = function (opts) {
    opts = opts || {};

    if (typeof opts.defaultMode === 'number') DEFAULT_LOG_MODE = opts.defaultMode;
    if (typeof opts.titlePrefix === 'string') TITLE_PREFIX = opts.titlePrefix;
    if (typeof opts.consolePrefix === 'string') CONSOLE_PREFIX = opts.consolePrefix;
    if (typeof opts.popupMs === 'number') POPUP_MS = opts.popupMs;
    if (typeof opts.maxLines === 'number') MAX_LINES = opts.maxLines;

    LOG_MODE = getLogMode();
    installBodyObserverOnce();
    return LOG_MODE;
  };

  BL.Log.mode = function () { return LOG_MODE; };

  BL.Log.ensurePopup = ensurePopup;
  BL.Log.hide = function () { safe(function () { if (popupEl) popupEl.style.display = 'none'; }); };

  BL.Log.showError = function (source, message, extra) { showLine('ERR', source, message, extra); };
  BL.Log.showWarn = function (source, message, extra) { showLine('WRN', source, message, extra); };
  BL.Log.showOk = function (source, message, extra) { showLine('OK ', source, message, extra); };
  BL.Log.showInfo = function (source, message, extra) { showLine('INF', source, message, extra); };
  BL.Log.showDbg = function (source, message, extra) { showLine('DBG', source, message, extra); };
})();
