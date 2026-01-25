(function () {
	'use strict';

	var BL = window.BL = window.BL || {};
	BL.Log = BL.Log || {};

	var DEFAULT_LOG_MODE = 0;
	var LOG_MODE = 0;

	// Prefix is intentionally fixed for the whole project.
	// Logs must always start with "[BlackLampa] ..." (console and popup).
	var PREFIX = '[BlackLampa]';

	var TITLE_PREFIX = '';

	// Runtime config (filled from BL.Config in init()).
	var POPUP_MS = 0;
	var MAX_LINES = 0;
	var SCROLL_TOL_PX = 0;
	var SHOW_THROTTLE_MS = 0;

	var POPUP_Z_INDEX = 0;
	var POPUP_INSET_PX = 0;
	var POPUP_BORDER_RADIUS_PX = 0;
	var POPUP_PROGRESS_HEIGHT_PX = 0;

	var popupEl = null;
	var popupTimer = null;
	var lastShowTs = 0;

	var popupBodyEl = null;
	var popupScrollEl = null;
	var popupHeaderEl = null;
	var popupHeaderHeight = 0;
	var popupResizeTimer = null;
	var popupProgressTopEl = null;
	var popupProgressBottomEl = null;
	var popupProgressFillEl = null;
	var popupProgressFillBottomEl = null;
	var popupProgressSeq = 0;
	var popupCloseEl = null;

	// Viewer-mode (manual open from settings): temporary, must NOT affect normal log behavior.
	var viewerMode = false;
	var viewerPrevPopupOpacity = '';
	var viewerPrevPopupPointerEvents = '';
	var viewerPrevPopupUserSelect = '';
	var viewerPrevPopupTouchAction = '';
	var viewerPrevScrollPointerEvents = '';
	var viewerPrevScrollUserSelect = '';
	var viewerPrevScrollTouchAction = '';
	var viewerPrevProgressTopDisplay = '';
	var viewerPrevProgressBottomDisplay = '';
	var viewerScrollLocked = false;
	var viewerKeyHandlerInstalled = false;
	var viewerScrollHandlerInstalled = false;

	var TAG_STYLE = {
		'ERR': { color: '#ff4d4f' },
		'WRN': { color: '#ffa940' },
		'OK': { color: '#52c41a' },
		'INF': { color: '#40a9ff' },
		'DBG': { color: '#8c8c8c' }
	};

	var POPUP_FONT = '12px/1.35 Courier, "Courier New", monospace';

	function safe(fn) { try { return fn(); } catch (_) { return null; } }

	function formatLine(tag, module, message, extra) {
		return String(PREFIX) + ' ' + String(tag) + ' ' + String(module) + ': ' + String(message) + (extra ? (' | ' + String(extra)) : '');
	}

	function clampMode(m) {
		if (m !== 0 && m !== 1 && m !== 2) return DEFAULT_LOG_MODE;
		return m;
	}

	function getLogMode() {
		var cfg = null;
		try { cfg = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { cfg = BL.Config; }
		cfg = cfg || {};
		var logCfg = cfg.log || {};

		var q = null;
		try {
			var qp = logCfg.modeQueryParams;
			if (BL.Core && BL.Core.getQueryParam && qp && qp.length) {
				for (var i = 0; i < qp.length; i++) {
					q = BL.Core.getQueryParam(String(qp[i]));
					if (q != null) break;
				}
			}
		} catch (_) { q = null; }

		if (q != null) return clampMode((BL.Core && BL.Core.toInt) ? BL.Core.toInt(q, DEFAULT_LOG_MODE) : DEFAULT_LOG_MODE);

		try {
			var lsKey = '';
			try { if (typeof logCfg.modeLsKey === 'string') lsKey = String(logCfg.modeLsKey || ''); } catch (_) { lsKey = ''; }
			if (lsKey) {
				var ls = null;
				try { ls = localStorage.getItem(lsKey); } catch (_) { }
				if (ls != null && ls !== '') return clampMode((BL.Core && BL.Core.toInt) ? BL.Core.toInt(ls, DEFAULT_LOG_MODE) : DEFAULT_LOG_MODE);
			}
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

			// +progressbar height (top bar).
			popupScrollEl.style.top = String(h + POPUP_PROGRESS_HEIGHT_PX) + 'px';
		} catch (_) { }
	}

	function ensurePopup(force) {
		if (LOG_MODE === 0 && !force && !viewerMode) return null;
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
			'top:' + String(POPUP_INSET_PX) + 'px',
			'left:' + String(POPUP_INSET_PX) + 'px',
			'right:' + String(POPUP_INSET_PX) + 'px',
			'bottom:' + String(POPUP_INSET_PX) + 'px',
			'z-index:' + String(POPUP_Z_INDEX),
			'background:rgba(0,0,0,0.44)',
			'color:#fff',
			'border-radius:' + String(POPUP_BORDER_RADIUS_PX) + 'px',
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
			'height:' + String(POPUP_PROGRESS_HEIGHT_PX) + 'px',
			'background:rgba(255,255,255,0.15)',
			'border-radius:' + String(POPUP_BORDER_RADIUS_PX) + 'px ' + String(POPUP_BORDER_RADIUS_PX) + 'px 0 0',
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
			'height:' + String(POPUP_PROGRESS_HEIGHT_PX) + 'px',
			'background:rgba(255,255,255,0.15)',
			'border-radius:0 0 ' + String(POPUP_BORDER_RADIUS_PX) + 'px ' + String(POPUP_BORDER_RADIUS_PX) + 'px',
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

		// Viewer-mode only close button (hidden by default; enabled in openViewer()).
		var closeBtn = document.createElement('div');
		closeBtn.id = '__autoplugin_popup_close';
		closeBtn.textContent = '× Закрыть';
		closeBtn.style.cssText = [
			'position:absolute',
			'top:8px',
			'right:10px',
			'z-index:4',
			'padding:4px 8px',
			'background:rgba(255,255,255,0.88)',
			'border:1px solid rgba(255,255,255,0.18)',
			'border-radius:8px',
			'pointer-events:auto',
			'cursor:pointer',
			'font:' + POPUP_FONT,
			'font-weight:700',
			'opacity:.9',
			'display:none',
			'user-select:none',
			'-webkit-user-select:none'
		].join(';');
		closeBtn.addEventListener('click', function () {
			try { if (BL.Log && typeof BL.Log.closeViewer === 'function') BL.Log.closeViewer(); } catch (_) { }
		}, true);
		el.appendChild(closeBtn);
		document.body.appendChild(el);

		popupEl = el;
		popupBodyEl = body;
		popupScrollEl = bodyWrap;
		popupHeaderEl = headerWrap;
		popupHeaderHeight = headerWrap.offsetHeight || popupHeaderHeight;
		popupProgressTopEl = progress;
		popupProgressBottomEl = progressBottom;
		popupProgressFillEl = progressFill;
		popupProgressFillBottomEl = progressBottomFill;
		popupCloseEl = closeBtn;

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

		return el;
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

	function makeRow(line, tag) {
		var row = document.createElement('div');
		row.textContent = String(line);
		row.style.cssText = [
			'font:' + POPUP_FONT,
			'font-weight:500',
			'margin:0',
			'padding:0'
		].join(';');

		if (tag && TAG_STYLE[tag]) row.style.color = TAG_STYLE[tag].color;

		return row;
	}

	function appendPopupLine(line, tag) {
		if (LOG_MODE === 0) return;
		var el = ensurePopup();
		var scrollEl = popupScrollEl;
		if (!el || !popupBodyEl || !scrollEl) return;

		// Autoscroll only if user is already at bottom.
		var shouldScroll = isAtBottom(scrollEl);
		if (viewerMode && viewerScrollLocked) shouldScroll = false;

		popupBodyEl.appendChild(makeRow(line, tag));

		// Keep DOM bounded to avoid UI degradation on long sessions.
		var max = MAX_LINES;
		if (max && max > 0) {
			while (popupBodyEl.childNodes.length > max) {
				try { popupBodyEl.removeChild(popupBodyEl.firstChild); } catch (_) { break; }
			}
		}

		if (shouldScroll) scrollToBottom(scrollEl);
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
		if (viewerMode) return;
		popupEl.style.display = 'none';
	}

	function armPopupLifetime(reason) {
		if (LOG_MODE === 0) return;
		var el = ensurePopup();
		var scrollEl = popupScrollEl;
		if (!el || !scrollEl) return;

		if (viewerMode) {
			// Viewer-mode: keep popup visible, no timers/progressbars.
			el.style.display = 'block';
			updatePopupLayout();
			if (popupTimer) { clearTimeout(popupTimer); popupTimer = null; }
			return;
		}

		var now = Date.now();
		var wasVisible = (el.style.display !== 'none');

		// Extend lifetime only when we really re-arm (throttled on bursts).
		if (wasVisible && lastShowTs && (now - lastShowTs) < SHOW_THROTTLE_MS) return;
		lastShowTs = now;

		el.style.display = 'block';
		updatePopupLayout();
		// Popup lifecycle only: timer + progressbars.
		// (Scroll is handled synchronously per appended line.)

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
			if (!BL.Console || !BL.Console.debug) return;
			BL.Console.debug(String(PREFIX) + ' DBG LogUI: arm ' + String(reason || 'log') + ' | ms=' + String(POPUP_MS));
		});
	}

	function showPopupNow() {
		if (LOG_MODE === 0) return;
		armPopupLifetime('log');
	}

	function pushPopupLine(line, tag) {
		if (LOG_MODE === 0) return;
		armPopupLifetime('log');
		appendPopupLine(line, tag);
	}

	function consoleMirror(tag, line, force) {
		try {
			if (!force && LOG_MODE === 0) return;
			if (!BL.Console) return;

			var out = String(line);
			if (tag === 'ERR' && BL.Console.error) return BL.Console.error(out);
			if (tag === 'WRN' && BL.Console.warn) return BL.Console.warn(out);
			if (tag === 'INF' && BL.Console.info) return BL.Console.info(out);
			if (tag === 'DBG' && BL.Console.debug) return BL.Console.debug(out);
			if (tag === 'OK' && BL.Console.info) return BL.Console.info(out);
			if (BL.Console.log) return BL.Console.log(out);
		} catch (_) { }
	}

	function showLine(tag, source, message, extra) {
		if (LOG_MODE === 0) return;
		// LOG_MODE meaning:
		// - 0: off (except forced `raw()` console warnings)
		// - 1: normal (no debug spam)
		// - 2: debug (includes DBG)
		if (tag === 'DBG' && LOG_MODE !== 2) return;
		var line = formatLine(tag, source, message, extra);

		consoleMirror(tag, line);
		pushPopupLine(line, tag);
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

	BL.Log.init = function () {
		// Single source of truth: BL.Config.get()
		var cfg = null;
		try { cfg = (BL.Config && typeof BL.Config.get === 'function') ? BL.Config.get() : BL.Config; } catch (_) { cfg = BL.Config; }
		cfg = cfg || {};

		var uiCfg = cfg.ui || {};
		var logCfg = cfg.log || {};

		// Read runtime values from BL.Config only (no inline defaults here).
		try { if (typeof logCfg.defaultMode === 'number') DEFAULT_LOG_MODE = logCfg.defaultMode; } catch (_) { }
		try { if (typeof logCfg.titlePrefix === 'string') TITLE_PREFIX = logCfg.titlePrefix; } catch (_) { }

		// popupMs lives in log (preferred). ui.popupMs kept as legacy alias.
		try { if (typeof logCfg.popupMs === 'number') POPUP_MS = logCfg.popupMs; } catch (_) { }
		try { if ((!POPUP_MS || POPUP_MS < 0) && typeof uiCfg.popupMs === 'number') POPUP_MS = uiCfg.popupMs; } catch (_) { }

		try { if (typeof logCfg.maxLines === 'number') MAX_LINES = logCfg.maxLines; } catch (_) { }
		try { if (typeof uiCfg.popupScrollTolPx === 'number') SCROLL_TOL_PX = uiCfg.popupScrollTolPx; } catch (_) { }
		try { if (typeof logCfg.showThrottleMs === 'number') SHOW_THROTTLE_MS = logCfg.showThrottleMs; } catch (_) { }

		try { if (typeof uiCfg.popupZIndex === 'number') POPUP_Z_INDEX = uiCfg.popupZIndex; } catch (_) { }
		try { if (typeof uiCfg.popupInsetPx === 'number') POPUP_INSET_PX = uiCfg.popupInsetPx; } catch (_) { }
		try { if (typeof uiCfg.popupBorderRadiusPx === 'number') POPUP_BORDER_RADIUS_PX = uiCfg.popupBorderRadiusPx; } catch (_) { }
		try { if (typeof uiCfg.popupProgressHeightPx === 'number') POPUP_PROGRESS_HEIGHT_PX = uiCfg.popupProgressHeightPx; } catch (_) { }

		LOG_MODE = getLogMode();

		// If popup already exists, refresh dynamic bits (mode/title).
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
	BL.Log.hide = function () { safe(function () { if (popupEl && !viewerMode) popupEl.style.display = 'none'; }); };

	function stopProgressBars() {
		popupProgressSeq++;
		safe(function () {
			if (popupProgressFillEl) {
				popupProgressFillEl.style.transition = 'none';
				popupProgressFillEl.style.transform = 'scaleX(1)';
			}
			if (popupProgressFillBottomEl) {
				popupProgressFillBottomEl.style.transition = 'none';
				popupProgressFillBottomEl.style.transform = 'scaleX(1)';
			}
		});
	}

	function isBackKeyCode(k) {
		return k === 27 || k === 8 || k === 461 || k === 10009;
	}

	function isViewerAtBottom(el) {
		try { return (el.scrollTop + el.clientHeight) >= (el.scrollHeight - 2); }
		catch (_) { return true; }
	}

	function viewerKeyHandler(e) {
		if (!viewerMode) return;
		var k = e.keyCode || 0;
		var el = popupScrollEl;
		if (!el) return;

		// Back/Return closes viewer.
		if (isBackKeyCode(k)) {
			e.preventDefault();
			e.stopImmediatePropagation();
			safe(function () { if (BL.Log && typeof BL.Log.closeViewer === 'function') BL.Log.closeViewer(); });
			return;
		}

		// Remote scroll (UP/DOWN). Also support media-style 19/20.
		if (k === 38 || k === 19 || k === 40 || k === 20) {
			e.preventDefault();
			e.stopImmediatePropagation();
			var step = 120;
			if (k === 38 || k === 19) {
				el.scrollTop = Math.max(0, el.scrollTop - step);
				viewerScrollLocked = true;
			} else {
				el.scrollTop = Math.min(el.scrollHeight, el.scrollTop + step);
				viewerScrollLocked = !isViewerAtBottom(el);
			}
		}
	}

	function viewerScrollHandler() {
		if (!viewerMode || !popupScrollEl) return;
		viewerScrollLocked = !isViewerAtBottom(popupScrollEl);
	}

	function setViewerMode(on) {
		try {
			if (on === viewerMode) return;
			viewerMode = Boolean(on);

			var el = ensurePopup(true);
			if (!el || !popupScrollEl) return;

			// Restore
			if (!viewerMode) {
				if (viewerKeyHandlerInstalled) {
					viewerKeyHandlerInstalled = false;
					try { window.removeEventListener('keydown', viewerKeyHandler, true); } catch (_) { }
				}
				if (viewerScrollHandlerInstalled) {
					viewerScrollHandlerInstalled = false;
					try { popupScrollEl.removeEventListener('scroll', viewerScrollHandler, true); } catch (_) { }
				}

				try { el.style.opacity = viewerPrevPopupOpacity; } catch (_) { }
				try { el.style.pointerEvents = viewerPrevPopupPointerEvents; } catch (_) { }
				try { el.style.userSelect = viewerPrevPopupUserSelect; } catch (_) { }
				try { el.style.touchAction = viewerPrevPopupTouchAction; } catch (_) { }
				try { popupScrollEl.style.pointerEvents = viewerPrevScrollPointerEvents; } catch (_) { }
				try { popupScrollEl.style.userSelect = viewerPrevScrollUserSelect; } catch (_) { }
				try { popupScrollEl.style.touchAction = viewerPrevScrollTouchAction; } catch (_) { }
				try { if (popupProgressTopEl) popupProgressTopEl.style.display = viewerPrevProgressTopDisplay; } catch (_) { }
				try { if (popupProgressBottomEl) popupProgressBottomEl.style.display = viewerPrevProgressBottomDisplay; } catch (_) { }
				try { if (popupCloseEl) popupCloseEl.style.display = 'none'; } catch (_) { }

				viewerScrollLocked = false;
				safe(function () { if (popupEl) popupEl.style.display = 'none'; });
				return;
			}

			// Enable viewer mode
			viewerPrevPopupOpacity = String(el.style.opacity || '');
			viewerPrevPopupPointerEvents = String(el.style.pointerEvents || '');
			viewerPrevPopupUserSelect = String(el.style.userSelect || '');
			viewerPrevPopupTouchAction = String(el.style.touchAction || '');
			viewerPrevScrollPointerEvents = String(popupScrollEl.style.pointerEvents || '');
			viewerPrevScrollUserSelect = String(popupScrollEl.style.userSelect || '');
			viewerPrevScrollTouchAction = String(popupScrollEl.style.touchAction || '');
			viewerPrevProgressTopDisplay = popupProgressTopEl ? String(popupProgressTopEl.style.display || '') : '';
			viewerPrevProgressBottomDisplay = popupProgressBottomEl ? String(popupProgressBottomEl.style.display || '') : '';

			// Disable auto-close timer and progressbars
			if (popupTimer) { clearTimeout(popupTimer); popupTimer = null; }
			stopProgressBars();
			try { if (popupProgressTopEl) popupProgressTopEl.style.display = 'none'; } catch (_) { }
			try { if (popupProgressBottomEl) popupProgressBottomEl.style.display = 'none'; } catch (_) { }

			// Visual tweaks (requested)
			try { el.style.opacity = '0.77'; } catch (_) { }

			// Allow viewer interactions (scroll / close)
			try { el.style.pointerEvents = 'auto'; } catch (_) { }
			try { el.style.touchAction = 'auto'; } catch (_) { }
			try { popupScrollEl.style.pointerEvents = 'auto'; } catch (_) { }
			try { popupScrollEl.style.touchAction = 'auto'; } catch (_) { }
			try { if (popupCloseEl) popupCloseEl.style.display = 'block'; } catch (_) { }

			// Show popup and bind handlers
			el.style.display = 'block';
			updatePopupLayout();
			viewerScrollLocked = !isViewerAtBottom(popupScrollEl);

			if (!viewerKeyHandlerInstalled) {
				viewerKeyHandlerInstalled = true;
				try { window.addEventListener('keydown', viewerKeyHandler, true); } catch (_) { }
			}
			if (!viewerScrollHandlerInstalled) {
				viewerScrollHandlerInstalled = true;
				try { popupScrollEl.addEventListener('scroll', viewerScrollHandler, true); } catch (_) { }
			}
		} catch (_) { }
	}

	BL.Log.setViewerMode = setViewerMode;
	BL.Log.openViewer = function () { setViewerMode(true); };
	BL.Log.closeViewer = function () { setViewerMode(false); };

	BL.Log.showError = function (source, message, extra) { showLine('ERR', source, message, extra); };
	BL.Log.showWarn = function (source, message, extra) { showLine('WRN', source, message, extra); };
	BL.Log.showOk = function (source, message, extra) { showLine('OK', source, message, extra); };
	BL.Log.showInfo = function (source, message, extra) { showLine('INF', source, message, extra); };
	BL.Log.showDbg = function (source, message, extra) { showLine('DBG', source, message, extra); };

	// Raw log line output:
	// Used by low-level hooks (e.g. network policy) that must preserve an exact pre-formatted line.
	// Popup output respects LOG_MODE, but console output can be forced (mandatory warnings).
	BL.Log.raw = function (tag, line) {
		try { consoleMirror(tag, line, true); } catch (_) { }
		try { pushPopupLine(line, tag); } catch (_) { }
	};
})();
