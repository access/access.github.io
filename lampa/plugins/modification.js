(function () {
    'use strict';

    // =========================================================================
    // LOG MODES
    //   0 = OFF  : no popup, no console spam, no window event hooks
    //   1 = BOOT : log only during plugin loading; after "AutoPlugin done" -> removeEventListener(...)
    //   2 = FULL : keep logging forever (current behavior)
    //
    // Control via URL:
    //   ?aplog=0|1|2        (one-shot for this run)
    //   ?aplog_set=0|1|2    (persist to localStorage)
    //
    // Examples:
    //   https://access.github.io/lampa/?aplog=0
    //   https://access.github.io/lampa/?aplog=1
    //   https://access.github.io/lampa/?aplog=2
    //   https://access.github.io/lampa/?aplog_set=1
    // =========================================================================

    function safe(fn) { try { return fn(); } catch (_) { return null; } }

    function getQuery(name) {
        try {
            var s = String(location.search || '');
            if (!s) return null;
            s = s.charAt(0) === '?' ? s.substring(1) : s;
            var parts = s.split('&');
            for (var i = 0; i < parts.length; i++) {
                var kv = parts[i].split('=');
                if (kv[0] === name) return kv.length > 1 ? decodeURIComponent(kv[1] || '') : '';
            }
            return null;
        } catch (_) {
            return null;
        }
    }

    function parseMode(v) {
        var n = parseInt(String(v), 10);
        if (n === 0 || n === 1 || n === 2) return n;
        return null;
    }

    var MODE = (function () {
        // persist setter
        var setv = parseMode(getQuery('aplog_set'));
        if (setv !== null) {
            safe(function () { localStorage.setItem('aplog', String(setv)); });
        }

        // one-shot mode
        var q = parseMode(getQuery('aplog'));
        if (q !== null) return q;

        // persisted mode
        var st = safe(function () { return localStorage.getItem('aplog'); });
        var ps = parseMode(st);
        if (ps !== null) return ps;

        // default
        return 1; // BOOT default is best for TV performance
    })();

    var LOG_OFF = (MODE === 0);
    var LOG_BOOT_ONLY = (MODE === 1);

    // =========================================================================
    // PLUGINS LIST (НЕ УДАЛЯЮ закомментированные)
    // =========================================================================
    var PLUGINS = [
        // "http://skaz.tv/onlines.js",
        // "http://skaz.tv/vcdn.js",
        // "https://netfix.cc/netfix.js",
        "https://tsynik.github.io/lampa/e.js",
        "https://and7ey.github.io/lampa/stats.js",
        "https://and7ey.github.io/lampa/head_filter.js",
        "https://and7ey.github.io/lampa/noshots.js",
        //"https://andreyurl54.github.io/diesel5/tricks.js",

        "https://bylampa.github.io/redirect.js",
        "https://bylampa.github.io/trailer_off.js",
        "https://bylampa.github.io/color_vote.js",
        "https://bylampa.github.io/seas_and_eps.js",
        "https://bylampa.github.io/old_card_status.js",
        "https://bylampa.github.io/backmenu.js",
        "https://bylampa.github.io/cub_off.js",
        "https://bylampa.github.io/source.js",
        "https://bylampa.github.io/addon.js",

        "https://bdvburik.github.io/title.js",
        "https://bywolf88.github.io/lampa-plugins/interface_mod.js",

        // "https://bwa.to/rc",
        "https://bwa.to/cloud.js",

        "https://nb557.github.io/plugins/online_mod.js",

        "https://skaztv.online/store.js",
        "https://skaztv.online/js/tricks.js",

        // "https://amiv1.github.io/lampa/rating.js",
        "scripts/rating.js",

        "https://amikdn.github.io/buttons.js"
    ];

    // =========================================================================
    // POPUP (PERF: incremental append + throttled flush)
    // =========================================================================

    var POPUP_MS = 20000;
    var MAX_LINES = 120;

    var popupEl = null;
    var popupTimer = null;

    var popupQueue = []; // { line, tag, key, ts, count }
    var popupBodyEl = null;
    var renderedCount = 0;

    var TAG_STYLE = {
        'ERR': { color: '#ff4d4f' },
        'WRN': { color: '#ffa940' },
        'OK ': { color: '#52c41a' },
        'INF': { color: '#40a9ff' },
        'DBG': { color: '#8c8c8c' }
    };

    // проще и максимально совместимо для ТВ
    var POPUP_FONT = '12px/1.35 Courier, "Courier New", monospace';

    function ensurePopup() {
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
        title.textContent = 'AutoPlugin log (mode=' + String(MODE) + ')';

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

    function fmtErr(e) {
        try {
            if (!e) return 'unknown error';
            if (typeof e === 'string') return e;
            if (e && e.message) return e.message;
            return String(e);
        } catch (_) {
            return 'unknown error';
        }
    }

    function clearNode(node) {
        try { while (node && node.firstChild) node.removeChild(node.firstChild); } catch (_) {}
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
        for (var i = 0; i < popupQueue.length; i++) {
            frag.appendChild(makeRow(popupQueue[i]));
        }
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
            for (var i = renderedCount; i < popupQueue.length; i++) {
                frag.appendChild(makeRow(popupQueue[i]));
            }
            popupBodyEl.appendChild(frag);
            renderedCount = popupQueue.length;
        }

        safe(function () {
            var lastDom = popupBodyEl.lastChild;
            var lastQ = popupQueue[popupQueue.length - 1];
            if (lastDom && lastQ && lastDom.textContent !== lastQ.line) {
                lastDom.textContent = lastQ.line;
            }
        });
    }

    function showPopupNow() {
        var el = ensurePopup();
        if (!el) return;
        el.style.display = 'block';

        if (popupTimer) clearTimeout(popupTimer);
        popupTimer = setTimeout(function () {
            if (popupEl) popupEl.style.display = 'none';
        }, POPUP_MS);
    }

    function pushPopupLine(line, tag, key) {
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

        var now2 = Date.now();

        if (key && key === lastKey && (now2 - lastTs) <= COALESCE_WINDOW_MS && lastIdx >= 0 && lastIdx < popupQueue.length) {
            var e = popupQueue[lastIdx];
            e.count = (e.count || 1) + 1;
            e.line = decorateLine(line, e.count);
            popupQueue[lastIdx] = e;
            schedulePopupFlush();
            showPopupNow();
            return;
        }

        popupQueue.push({ line: line, tag: tag || '', key: key || '', ts: now2, count: 1 });

        while (popupQueue.length > MAX_LINES) {
            popupQueue.shift();
            renderedCount = 0;
            lastIdx = -1;
            lastKey = '';
        }

        lastKey = key || '';
        lastIdx = popupQueue.length - 1;
        lastTs = now2;

        schedulePopupFlush();
        showPopupNow();
    }

    // =========================================================================
    // NETWORK BLOCK
    // =========================================================================

    var BLOCK_YANDEX_RE =
    /(^|\.)((yandex\.(ru|com|net|by|kz|ua|uz|tm|tj))|(ya\.ru)|(yastatic\.net)|(yandex\.(net|com)\.tr))$/i;

    var BLOCK_GOOGLE_YT_RE =
    /(^|\.)((google\.com)|(google\.[a-z.]+)|(gstatic\.com)|(googlesyndication\.com)|(googleadservices\.com)|(doubleclick\.net)|(googletagmanager\.com)|(google-analytics\.com)|(analytics\.google\.com)|(api\.google\.com)|(accounts\.google\.com)|(recaptcha\.net)|(youtube\.com)|(ytimg\.com)|(googlevideo\.com)|(youtu\.be)|(youtube-nocookie\.com))$/i;

    var BLOCK_STATS_RE =
    /(^|\.)((scorecardresearch\.com)|(quantserve\.com)|(cdn\.quantserve\.com)|(hotjar\.com)|(static\.hotjar\.com)|(mixpanel\.com)|(api\.mixpanel\.com)|(sentry\.io)|(o\d+\.ingest\.sentry\.io)|(datadoghq\.com)|(segment\.com)|(api\.segment\.io)|(amplitude\.com)|(api\.amplitude\.com)|(branch\.io)|(app-measurement\.com))$/i;

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

    function logBlocked(u, where, why) {
        if (LOG_OFF) return;
        var label = (why || 'Blocked');

        safe(function () {
            var badge =
            label === 'Yandex' ? 'background:#ff2d55' :
            label === 'Google/YouTube' ? 'background:#ff9500' :
            label === 'Statistics' ? 'background:#8e8e93' :
            label === 'BWA:CORS' ? 'background:#00c2ff' :
            'background:#ff2d55';

            var txt =
            label === 'Yandex' ? '#ff2d55' :
            label === 'Google/YouTube' ? '#ff9500' :
            label === 'Statistics' ? '#8e8e93' :
            label === 'BWA:CORS' ? '#00c2ff' :
            '#ff2d55';

        console.log(
            '%c[BLOCKED:' + label + ']%c ' + where + ' -> ' + u,
            badge + ';color:#fff;padding:2px 6px;border-radius:6px;font-weight:700',
            'color:' + txt
        );
        });

        showWarn(where, 'BLOCKED (' + label + ')', u);
    }

    function patchBlockNetwork() {
        if (window.fetch) {
            var origFetch = window.fetch.bind(window);
            window.fetch = function (input, init) {
                var u = (typeof input === 'string') ? input : (input && input.url) ? input.url : '';
                var why = isBlockedUrl(u);
                if (why) {
                    logBlocked(u, 'fetch', why);
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
                this.__ap_block_reason = isBlockedUrl(url);
                return origOpen.apply(this, arguments);
            };

            XHR.prototype.send = function () {
                if (this.__ap_block_reason) {
                    var u = this.__ap_url;
                    var why = this.__ap_block_reason;
                    logBlocked(u, 'XHR', why);

                    var xhr = this;
                    setTimeout(function () {
                        safe(function () { if (xhr.onerror) xhr.onerror(new Error('Blocked by policy: ' + why)); });
                        safe(function () { if (xhr.onreadystatechange) xhr.onreadystatechange(); });
                        safe(function () { if (xhr.dispatchEvent) xhr.dispatchEvent(new Event('error')); });
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
                    logBlocked(url, 'sendBeacon', why);
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
                    logBlocked(url, 'WebSocket', why);
                    throw new Error('Blocked by policy: ' + why);
                }
                return (protocols !== undefined) ? new OrigWS(url, protocols) : new OrigWS(url);
            };
            window.WebSocket.prototype = OrigWS.prototype;
        }

        if (!LOG_OFF) showOk('policy', 'Network block installed', 'Yandex + Google/YouTube + Statistics + BWA:CORS(/cors/check)');
    }

    // =========================================================================
    // SCRIPT LOADER
    // =========================================================================

    var LOAD_TIMEOUT_MS = 15000;
    var currentPlugin = null;

    function load(url) {
        return new Promise(function (resolve) {
            var done = false;

            function finish(ok, why) {
                if (done) return;
                done = true;
                currentPlugin = null;
                resolve({ ok: ok, why: why || (ok ? 'ok' : 'fail'), url: url });
            }

            try {
                currentPlugin = url;

                var blockReason = isBlockedUrl(url);
                if (blockReason) {
                    logBlocked(url, 'script', blockReason);
                    finish(false, 'blocked:' + blockReason);
                    return;
                }

                var s = document.createElement('script');
                s.src = url;
                s.async = true;

                var t = setTimeout(function () {
                    safe(function () { s.onload = null; s.onerror = null; });
                    if (!LOG_OFF) showError(url, 'LOAD TIMEOUT', String(LOAD_TIMEOUT_MS) + 'ms');
                    finish(false, 'timeout');
                }, LOAD_TIMEOUT_MS);

                s.onload = function () {
                    clearTimeout(t);
                    finish(true, 'onload');
                };

                s.onerror = function () {
                    clearTimeout(t);
                    if (!LOG_OFF) showError(url, 'LOAD FAIL', 'script.onerror');
                    finish(false, 'onerror');
                };

                document.head.appendChild(s);
            } catch (e) {
                if (!LOG_OFF) showError(url, 'LOAD EXCEPTION', fmtErr(e));
                finish(false, 'exception');
            }
        });
    }

    async function waitLampa() {
        for (var i = 0; i < 120; i++) {
            if (window.Lampa && window.Lampa.Listener) return true;
            await new Promise(function (r) { setTimeout(r, 500); });
        }
        if (!LOG_OFF) showWarn('Lampa', 'wait timeout', 'Lampa not detected');
        return false;
    }

    // =========================================================================
    // MODE-AWARE LOGGING + WINDOW EVENT HOOKS (removable)
    // =========================================================================

    var monitoringEnabled = !LOG_OFF;

    function shouldLogNow() {
        if (LOG_OFF) return false;
        if (LOG_BOOT_ONLY) return monitoringEnabled;
        return true;
    }

    function showLineMode(tag, source, message, extra) {
        if (!shouldLogNow()) return;
        var ts = new Date().toLocaleTimeString();
        var line = '[' + ts + '] ' + tag + ' ' + source + ': ' + message + (extra ? (' | ' + extra) : '');
        var key = makeKey(tag, source, message, extra);
        pushPopupLine(line, tag, key);
    }

    // declare as vars so we can reassign below
    var showError = function (s, m, e) { showLineMode('ERR', s, m, e); };
    var showWarn  = function (s, m, e) { showLineMode('WRN', s, m, e); };
    var showOk    = function (s, m, e) { showLineMode('OK ', s, m, e); };
    var showInfo  = function (s, m, e) { showLineMode('INF', s, m, e); };
    var showDbg   = function (s, m, e) { showLineMode('DBG', s, m, e); };

    function onWindowError(ev) {
        if (!shouldLogNow()) return;
        try {
            var msg = (ev && ev.message) ? ev.message : 'error';
            var file = (ev && ev.filename) ? ev.filename : '(no file)';
            var line = (ev && typeof ev.lineno === 'number') ? ev.lineno : '?';
            var col  = (ev && typeof ev.colno === 'number') ? ev.colno : '?';
            var stack = (ev && ev.error && ev.error.stack) ? String(ev.error.stack).split('\n')[0] : '';

            var src =
            (file && PLUGINS.some(function (p) { return file.indexOf(p) !== -1; })) ? file :
            (file && PLUGINS.some(function (p) { return p.indexOf(file) !== -1; })) ? file :
            (currentPlugin || file);

            showError(src, msg, String(file) + ':' + String(line) + ':' + String(col) + (stack ? (' | ' + stack) : ''));
        } catch (_) {}
    }

    function onUnhandledRejection(ev) {
        if (!shouldLogNow()) return;
        try {
            var reason = (ev && ev.reason) ? ev.reason : 'unhandled rejection';
            var msg = fmtErr(reason);
            var stack = (reason && reason.stack) ? String(reason.stack).split('\n')[0] : '';
            showError(currentPlugin || 'Promise', msg, stack);
        } catch (_) {}
    }

    function disableMonitoring() {
        monitoringEnabled = false;
        safe(function () { window.removeEventListener('error', onWindowError, true); });
        safe(function () { window.removeEventListener('unhandledrejection', onUnhandledRejection); });
        safe(function () { if (popupEl) popupEl.style.display = 'none'; });
    }

    if (!LOG_OFF) {
        safe(function () { window.addEventListener('error', onWindowError, true); });
        safe(function () { window.addEventListener('unhandledrejection', onUnhandledRejection); });
    }

    // TV: body late -> create popup later (only if logging enabled)
    if (!LOG_OFF) {
        safe(function () {
            if (!document || !document.documentElement) return;
            var mo = new MutationObserver(function () {
                if (document.body && !popupEl) {
                    ensurePopup();
                    safe(function () { if (popupEl) popupEl.style.display = 'none'; });
                }
            });
            mo.observe(document.documentElement, { childList: true, subtree: true });
        });
    }

    // =========================================================================
    // START
    // =========================================================================

    async function start() {
        // always enable network policy
        patchBlockNetwork();

        if (!LOG_OFF) {
            safe(function () { var el = ensurePopup(); if (el) el.style.display = 'none'; });
        }

        await waitLampa();

        if (!LOG_OFF) {
            safe(function () { var el2 = ensurePopup(); if (el2) el2.style.display = 'none'; });
        }

        for (var i = 0; i < PLUGINS.length; i++) {
            var url = PLUGINS[i];
            try {
                var r = await load(url);
                safe(function () { if (!LOG_OFF) console.log('[[AutoPlugin]]', r.ok ? 'OK' : 'FAIL', r.why, r.url); });
                if (!r.ok) { if (!LOG_OFF) showError(r.url, 'LOAD FAIL', r.why); }
                else { if (!LOG_OFF) showOk(r.url, 'loaded', r.why); }
            } catch (e) {
                safe(function () { if (!LOG_OFF) console.log('[[AutoPlugin]] FAIL exception', url, e); });
                if (!LOG_OFF) showError(url, 'LOAD LOOP EXCEPTION', fmtErr(e));
            }
        }

        if (!LOG_OFF) showOk('AutoPlugin', 'done', 'total=' + String(PLUGINS.length));

        // BOOT mode: after done -> detach window listeners and stop all logging
        if (LOG_BOOT_ONLY) {
            disableMonitoring();
        }
    }

    start();
})();
