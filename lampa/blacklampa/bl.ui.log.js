(function () {
  'use strict';

  var BL = window.BL = window.BL || {};
  BL.Log = BL.Log || {};

  var DEFAULT_LOG_MODE = 1;
  var LOG_MODE = 0;

  // Prefix is intentionally fixed for the whole project.
  // Logs must always start with "[BlackLampa] ..." (console and popup).
  var PREFIX = '[BlackLampa]';

  var TITLE_PREFIX = 'BlackLampa log';

	  var POPUP_MS = 20000;
	  var MAX_LINES = 120;

	  var popupEl = null;
	  var popupTimer = null;
	  var lastShowTs = 0;
	  var SHOW_THROTTLE_MS = 400;

	  var popupQueue = [];
	  var popupBodyEl = null;
	  var popupScrollEl = null;
	  var popupHeaderEl = null;
	  var popupHeaderHeight = 0;
	  var popupResizeTimer = null;
	  var popupProgressFillEl = null;
	  var popupProgressFillBottomEl = null;
	  var popupProgressSeq = 0;
	  var renderedCount = 0;

  var TAG_STYLE = {
    'ERR': { color: '#ff4d4f' },
    'WRN': { color: '#ffa940' },
    'OK': { color: '#52c41a' },
    'INF': { color: '#40a9ff' },
    'DBG': { color: '#8c8c8c' }
  };

  var POPUP_FONT = '12px/1.35 Courier, "Courier New", monospace';
  var SCROLL_TOL_PX = 40;
  var scrollToBottomPending = false;

  function safe(fn) { try { return fn(); } catch (_) { return null; } }

  function formatLine(tag, module, message, extra) {
    return String(PREFIX) + ' ' + String(tag) + ' ' + String(module) + ': ' + String(message) + (extra ? (' | ' + String(extra)) : '');
  }

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

	  function updatePopupLayout() {
	    try {
	      if (!popupEl || !popupHeaderEl || !popupScrollEl) return;

	      // When popup is hidden, offsetHeight may be 0; keep last known height.
	      var h = popupHeaderEl.offsetHeight || 0;
	      if (h > 0) popupHeaderHeight = h;
	      else h = popupHeaderHeight || 0;

	      // +2px for progressbar height.
	      popupScrollEl.style.top = String(h + 2) + 'px';
	    } catch (_) { }
	  }

	  function ensurePopup() {
	    if (LOG_MODE === 0) return null;
	    if (popupEl) return popupEl;
	    if (!document || !document.body) return null;

    var el = document.createElement('div');
    // Compatibility note:
    // Keep legacy DOM ids so any external scripts/tools can still find the popup.
    el.id = '__autoplugin_popup';
    el.style.cssText = [
      'all:initial',
      'unicode-bidi:plaintext',
      'position:fixed',
      'isolation:isolate',
      'top:5px',
      'left:5px',
      'right:5px',
      'bottom:5px',
      'z-index:2147483647',
      'background:rgba(0,0,0,0.44)',
      'color:#fff',
      'border-radius:12px',
      'box-sizing:border-box',
      'padding:0',
      'font:' + POPUP_FONT,
      'font-weight:500',
      'font-variant-ligatures:none',
      'letter-spacing:0',
      '-webkit-font-smoothing:antialiased',
	      'text-rendering:optimizeSpeed',
	      // Safety: popup must never capture input, focus or scrolling (TV/PC/mobile).
	      'pointer-events:none',
	      'user-select:none',
	      '-webkit-user-select:none',
	      'touch-action:none',
	      'white-space:pre-wrap',
	      'word-break:break-word',
	      // IMPORTANT:
	      // The popup frame must never scroll, otherwise the progressbar/header "moves away".
	      // Scroll is isolated to the body wrapper.
	      'overflow:hidden',
	      'display:block',
	      'box-shadow:0 10px 30px rgba(0,0,0,0.25)'
	    ].join(';');

    // Progress bar:
    // Shows remaining time before popup auto-hide. It is visual-only and must not affect layout or focus.
    var progress = document.createElement('div');
    progress.id = '__autoplugin_popup_progress';
    progress.style.cssText = [
      'position:absolute',
      'top:0',
      'left:0',
      'right:0',
      'z-index:3',
      'height:2px',
      'background:rgba(255,255,255,0.15)',
      'border-radius:12px 12px 0 0',
      'overflow:hidden',
      'pointer-events:none'
    ].join(';');

	    var progressFill = document.createElement('div');
	    progressFill.id = '__autoplugin_popup_progress_fill';
	    progressFill.style.cssText = [
	      'height:100%',
	      'width:100%',
	      'background:#40a9ff',
	      'transform-origin:left center',
	      'transform:scaleX(1)',
	      'will-change:transform',
	      'pointer-events:none'
	    ].join(';');
	    progress.appendChild(progressFill);

	    // Bottom progress bar (mirrors the top one).
	    var progressBottom = document.createElement('div');
	    progressBottom.id = '__autoplugin_popup_progress_bottom';
	    progressBottom.style.cssText = [
	      'position:absolute',
	      'left:0',
	      'right:0',
	      'bottom:0',
	      'z-index:3',
	      'height:2px',
	      'background:rgba(255,255,255,0.15)',
	      'border-radius:0 0 12px 12px',
	      'overflow:hidden',
	      'pointer-events:none'
	    ].join(';');

	    var progressBottomFill = document.createElement('div');
	    progressBottomFill.id = '__autoplugin_popup_progress_bottom_fill';
	    progressBottomFill.style.cssText = [
	      'height:100%',
	      'width:100%',
	      'background:#40a9ff',
	      'transform-origin:left center',
	      'transform:scaleX(1)',
	      'will-change:transform',
	      'pointer-events:none'
	    ].join(';');
	    progressBottom.appendChild(progressBottomFill);

		    var headerWrap = document.createElement('div');
		    headerWrap.style.cssText = [
		      'position:relative',
		      'z-index:1',
	      'box-sizing:border-box',
	      'padding:10px 12px 6px 12px',
	      'pointer-events:none',
	      'user-select:none',
	      '-webkit-user-select:none'
	    ].join(';');

    var title = document.createElement('div');
    title.id = '__autoplugin_popup_title';
    title.style.cssText = [
      'font:' + POPUP_FONT,
      'font-weight:700',
      'margin:0',
      'opacity:.95'
    ].join(';');
    title.textContent = String(TITLE_PREFIX) + ' (mode=' + String(LOG_MODE) + ')';

	    var bodyWrap = document.createElement('div');
	    bodyWrap.style.cssText = [
	      'position:absolute',
	      'z-index:1',
	      'box-sizing:border-box',
	      'left:12px',
	      'right:12px',
	      'bottom:12px',
	      'top:0',
	      'overflow:auto',
	      '-webkit-overflow-scrolling:touch',
	      // Visual-only popup: never accept manual scroll/touch/mouse events.
	      'pointer-events:none',
	      'user-select:none',
	      '-webkit-user-select:none'
	    ].join(';');

    var body = document.createElement('div');
    body.id = '__autoplugin_popup_body';

	    el.appendChild(progress);
	    headerWrap.appendChild(title);
	    bodyWrap.appendChild(body);
	    el.appendChild(headerWrap);
	    el.appendChild(bodyWrap);
	    el.appendChild(progressBottom);
	    document.body.appendChild(el);

	    popupEl = el;
	    popupBodyEl = body;
		    popupScrollEl = bodyWrap;
		    popupHeaderEl = headerWrap;
		    popupHeaderHeight = headerWrap.offsetHeight || popupHeaderHeight;
		    popupProgressFillEl = progressFill;
		    popupProgressFillBottomEl = progressBottomFill;
		    renderedCount = 0;

	    updatePopupLayout();
	    try {
	      window.addEventListener('resize', function () {
	        try {
	          if (!popupEl) return;
	          if (popupResizeTimer) clearTimeout(popupResizeTimer);
	          popupResizeTimer = setTimeout(updatePopupLayout, 100);
	        } catch (_) { }
	      }, true);
	    } catch (_) { }

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

  function isAtBottom(el) {
    try {
      return (el.scrollTop + el.clientHeight) >= (el.scrollHeight - SCROLL_TOL_PX);
    } catch (_) {
      return true;
    }
  }

  function scrollToBottom(el) {
    try { el.scrollTop = el.scrollHeight; } catch (_) { }
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
    if (!popupEl || !popupBodyEl) return;

    clearNode(popupBodyEl);
    var frag = document.createDocumentFragment();
    for (var i = 0; i < popupQueue.length; i++) frag.appendChild(makeRow(popupQueue[i]));
    popupBodyEl.appendChild(frag);
    renderedCount = popupQueue.length;
  }

	  function flushPopupToDom() {
	    var el = ensurePopup();
	    var scrollEl = popupScrollEl;
	    if (!el || !popupBodyEl || !scrollEl) return;

	    // Sticky-to-bottom:
	    // - if already at bottom => keep auto-scrolling
	    // - if user could scroll up (legacy debug) => do not yank (but popup is non-interactive now)
	    // - if popup was just shown => scroll down once
	    var wasAtBottom = isAtBottom(scrollEl);
	    var shouldScroll = scrollToBottomPending || wasAtBottom;

    if (renderedCount > popupQueue.length) renderedCount = 0;

    if (renderedCount === 0 && popupQueue.length > 0 && popupBodyEl.childNodes.length === 0) {
      fullRebuild();
    } else {
      if (renderedCount < popupQueue.length) {
        var frag = document.createDocumentFragment();
        for (var i = renderedCount; i < popupQueue.length; i++) frag.appendChild(makeRow(popupQueue[i]));
        popupBodyEl.appendChild(frag);
        renderedCount = popupQueue.length;
      }
    }

    safe(function () {
      var lastDom = popupBodyEl.lastChild;
      var lastQ = popupQueue[popupQueue.length - 1];
      if (lastDom && lastQ && lastDom.textContent !== lastQ.line) lastDom.textContent = lastQ.line;
    });

    if (shouldScroll) scrollToBottom(scrollEl);
    scrollToBottomPending = false;
  }

	  function startProgressBars(ms) {
	    if (LOG_MODE === 0) return;
	    if (!popupProgressFillEl && !popupProgressFillBottomEl) return;

	    popupProgressSeq++;
	    var seq = popupProgressSeq;
	    var dur = (typeof ms === 'number') ? ms : POPUP_MS;

	    function resetOne(el) {
	      if (!el) return;
	      el.style.transition = 'none';
	      el.style.transform = 'scaleX(1)';
	      // Force reflow so the reset state is applied before starting the transition.
	      void el.offsetWidth;
	    }

	    safe(function () {
	      resetOne(popupProgressFillEl);
	      resetOne(popupProgressFillBottomEl);
	    });

	    function start() {
	      if (seq !== popupProgressSeq) return;
	      safe(function () {
	        if (popupProgressFillEl) {
	          popupProgressFillEl.style.transition = 'transform ' + String(dur) + 'ms linear';
	          popupProgressFillEl.style.transform = 'scaleX(0)';
	        }
	        if (popupProgressFillBottomEl) {
	          popupProgressFillBottomEl.style.transition = 'transform ' + String(dur) + 'ms linear';
	          popupProgressFillBottomEl.style.transform = 'scaleX(0)';
	        }
	      });
	    }

	    if (!dur || dur <= 0) return start();

	    if (window.requestAnimationFrame) {
	      window.requestAnimationFrame(function () {
	        window.requestAnimationFrame(start);
      });
	    } else setTimeout(start, 0);
	  }

	  function hidePopup() {
	    if (!popupEl) return;
	    popupEl.style.display = 'none';
	  }

	  function armPopupLifetime(reason) {
	    if (LOG_MODE === 0) return;
	    var el = ensurePopup();
	    var scrollEl = popupScrollEl;
	    if (!el || !scrollEl) return;

	    var now = Date.now();
	    var wasVisible = (el.style.display !== 'none');

	    el.style.display = 'block';
	    updatePopupLayout();
	    // Popup is visual-only (no manual scroll), so always keep last lines visible.
	    scrollToBottomPending = true;

	    // Extend lifetime only when we really re-arm (throttled on bursts).
	    if (wasVisible && lastShowTs && (now - lastShowTs) < SHOW_THROTTLE_MS) return;
	    lastShowTs = now;

	    if (popupTimer) clearTimeout(popupTimer);
	    popupTimer = setTimeout(function () {
	      popupTimer = null;
	      hidePopup();
	    }, POPUP_MS);

	    // Single source of truth: progressbars represent the same POPUP_MS as the hide timer.
	    startProgressBars(POPUP_MS);

	    // Optional diagnostics (console only; avoids recursion into popup logger).
	    safe(function () {
	      if (LOG_MODE !== 2) return;
	      if (!console || !console.debug) return;
	      console.debug(String(PREFIX) + ' DBG LogUI: arm ' + String(reason || 'log') + ' | ms=' + String(POPUP_MS));
	    });
	  }

		  function showPopupNow() {
		    if (LOG_MODE === 0) return;
		    armPopupLifetime('log');
		  }

  function pushPopupLine(line, tag, key) {
    if (LOG_MODE === 0) return;

    if (!rateAllow()) {
      var now = Date.now();
      if ((now - rateBucketTs) < 1000 && rateBucketCount === (RATE_MAX_PER_SEC + 1)) {
        var l = formatLine('WRN', 'Log', 'rate limited', 'max=' + String(RATE_MAX_PER_SEC) + '/s');
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

  function consoleMirror(tag, line) {
    try {
      if (LOG_MODE === 0) return;

      var fn = null;
      if (tag === 'ERR') fn = (console && console.error) ? console.error : null;
      else if (tag === 'WRN') fn = (console && console.warn) ? console.warn : null;
      else if (tag === 'INF') fn = (console && console.info) ? console.info : null;
      else if (tag === 'DBG') fn = (console && console.debug) ? console.debug : null;
      else fn = (console && console.log) ? console.log : null;

      if (!fn) return;
      fn.call(console, String(line));
    } catch (_) { }
  }

  function showLine(tag, source, message, extra) {
    if (LOG_MODE === 0) return;
    var line = formatLine(tag, source, message, extra);
    var key = makeKey(tag, source, message, extra);

    consoleMirror(tag, line);
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
    if (typeof opts.popupMs === 'number') POPUP_MS = opts.popupMs;
    if (typeof opts.maxLines === 'number') MAX_LINES = opts.maxLines;

    LOG_MODE = getLogMode();

	    // If popup already exists, refresh a few dynamic bits (mode/title/pointer-events).
	    // This keeps behavior stable across multiple init() calls (PHASE 0 + later modules).
	    safe(function () {
	      if (!popupEl) return;
	      try {
	        var t = document.getElementById('__autoplugin_popup_title');
	        if (t) t.textContent = String(TITLE_PREFIX) + ' (mode=' + String(LOG_MODE) + ')';
	      } catch (_) { }
	    });

    installBodyObserverOnce();
    return LOG_MODE;
  };

  BL.Log.mode = function () { return LOG_MODE; };

  BL.Log.ensurePopup = ensurePopup;
  BL.Log.hide = function () { safe(function () { if (popupEl) popupEl.style.display = 'none'; }); };

  BL.Log.showError = function (source, message, extra) { showLine('ERR', source, message, extra); };
  BL.Log.showWarn = function (source, message, extra) { showLine('WRN', source, message, extra); };
  BL.Log.showOk = function (source, message, extra) { showLine('OK', source, message, extra); };
  BL.Log.showInfo = function (source, message, extra) { showLine('INF', source, message, extra); };
  BL.Log.showDbg = function (source, message, extra) { showLine('DBG', source, message, extra); };
})();
