(function () {
    'use strict';

    // =========================================================================
    // LOG MODES (3 режима)
    // 0 = OFF            -> вообще без логов/попапа/ивентов/хуков
    // 1 = BOOT-ONLY      -> лог только до "AutoPlugin done", потом отключаем слежение (events/hooks)
    // 2 = FULL           -> лог всегда (как сейчас)
    //
    // Можно переключать так:
    //   1) константой LOG_MODE_DEFAULT
    //   2) через URL:  ?aplog=0|1|2
    //   3) через localStorage: localStorage.setItem('aplog','0|1|2')
    //
    // Приоритет: URL -> localStorage -> default
    // =========================================================================
    const LOG_MODE_DEFAULT = 1;

    function getLogMode() {
        try {
            // URL param: aplog=0|1|2
            try {
                const u = new URL(location.href);
                const qp = u.searchParams && u.searchParams.get ? u.searchParams.get('aplog') : null;
                if (qp === '0' || qp === '1' || qp === '2') return parseInt(qp, 10);
            } catch (_) {}

            // localStorage: aplog=0|1|2
            try {
                const ls = window.localStorage && window.localStorage.getItem ? window.localStorage.getItem('aplog') : null;
                if (ls === '0' || ls === '1' || ls === '2') return parseInt(ls, 10);
            } catch (_) {}

            return LOG_MODE_DEFAULT;
        } catch (_) {
            return LOG_MODE_DEFAULT;
        }
    }

    const LOG_MODE = getLogMode();
    const LOG_OFF = (LOG_MODE === 0);
    const LOG_BOOT_ONLY = (LOG_MODE === 1);
    const LOG_FULL = (LOG_MODE === 2);

    // =========================================================================
    // список автоплагинов (НЕ УДАЛЯЮ закомментированные — оставляю как есть)
    // =========================================================================
    const PLUGINS = [
        // "http://skaz.tv/onlines.js",
        // "http://skaz.tv/vcdn.js",
        // "https://netfix.cc/netfix.js",
        // "https://tsynik.github.io/lampa/e.js",
        // "https://and7ey.github.io/lampa/stats.js",
        "https://and7ey.github.io/lampa/head_filter.js",
        "https://and7ey.github.io/lampa/noshots.js",
        //"https://andreyurl54.github.io/diesel5/tricks.js",

        // "https://bylampa.github.io/redirect.js",
        // "https://bylampa.github.io/trailer_off.js",
        "https://bylampa.github.io/color_vote.js",
        "https://bylampa.github.io/seas_and_eps.js",
        // "https://bylampa.github.io/old_card_status.js",
        // "https://bylampa.github.io/backmenu.js",
        "https://bylampa.github.io/cub_off.js",
        "https://bylampa.github.io/source.js",
        "https://bylampa.github.io/addon.js",

        // "https://bdvburik.github.io/title.js",
        "https://bywolf88.github.io/lampa-plugins/interface_mod.js",

        "https://bwa.to/rc",
        "https://bwa.to/cloud.js",

        "https://nb557.github.io/plugins/online_mod.js",

        // "https://skaztv.online/store.js",
        "https://skaztv.online/js/tricks.js",

        // "https://amiv1.github.io/lampa/rating.js",
        "scripts/rating.js",

        "https://amikdn.github.io/buttons.js"
    ];

    // =========================================================================
    // popup (только если LOG_MODE != 0)
    // =========================================================================
    const POPUP_MS = 20000;
    const MAX_LINES = 120;

    let popupEl = null;
    let popupTimer = null;

    const popupQueue = []; // { line, tag, key, ts, count }
    let popupBodyEl = null;
    let renderedCount = 0;

    const TAG_STYLE = {
        'ERR': { color: '#ff4d4f' },
        'WRN': { color: '#ffa940' },
        'OK ': { color: '#52c41a' },
        'INF': { color: '#40a9ff' },
        'DBG': { color: '#8c8c8c' }
    };

    const POPUP_FONT = '12px/1.35 Courier, "Courier New", monospace';

    function safe(fn) { try { return fn(); } catch (_) { return null; } }

    function ensurePopup() {
        if (LOG_OFF) return null;
        if (popupEl) return popupEl;
        if (!document || !document.body) return null;

        const el = document.createElement('div');
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

        const title = document.createElement('div');
        title.id = '__autoplugin_popup_title';
        title.style.cssText = [
            'font:' + POPUP_FONT,
            'font-weight:700',
            'margin-bottom:6px',
            'opacity:.95'
        ].join(';');
        title.textContent = 'AutoPlugin log (mode=' + String(LOG_MODE) + ')';

        const body = document.createElement('div');
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

    function parseTagFromLine(line) {
        try {
            const m = String(line).match(/^\[[^\]]+\]\s(.{3})\s/);
            return m ? m[1] : '';
        } catch (_) { return ''; }
    }

    function clearNode(node) {
        try { while (node && node.firstChild) node.removeChild(node.firstChild); } catch (_) {}
    }

    // ---- PERF: coalesce + throttled flush ----
    const COALESCE_WINDOW_MS = 1500;
    let lastKey = '';
    let lastIdx = -1;
    let lastTs = 0;

    const RATE_MAX_PER_SEC = 25;
    let rateBucketTs = 0;
    let rateBucketCount = 0;

    function makeKey(tag, source, message, extra) {
        return String(tag) + '|' + String(source) + '|' + String(message) + '|' + String(extra || '');
    }

    function rateAllow() {
        const now = Date.now();
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

    let flushScheduled = false;
    function schedulePopupFlush() {
        if (LOG_OFF) return;
        if (flushScheduled) return;
        flushScheduled = true;

        const runner = function () {
            flushScheduled = false;
            flushPopupToDom();
        };

        if (window.requestAnimationFrame) window.requestAnimationFrame(runner);
        else setTimeout(runner, 0);
    }

    function makeRow(entry) {
        const row = document.createElement('div');
        row.textContent = entry.line;
        row.style.cssText = [
            'font:' + POPUP_FONT,
            'font-weight:500',
            'margin:0',
            'padding:0'
        ].join(';');

        const tag = entry.tag;
        if (tag && TAG_STYLE[tag]) row.style.color = TAG_STYLE[tag].color;

        return row;
    }

    function fullRebuild() {
        if (LOG_OFF) return;
        const el = ensurePopup();
        if (!el || !popupBodyEl) return;

        clearNode(popupBodyEl);

        const frag = document.createDocumentFragment();
        for (let i = 0; i < popupQueue.length; i++) {
            const e = popupQueue[i];
            if (!e.tag) e.tag = parseTagFromLine(e.line);
            frag.appendChild(makeRow(e));
        }
        popupBodyEl.appendChild(frag);
        renderedCount = popupQueue.length;
    }

    function flushPopupToDom() {
        if (LOG_OFF) return;
        const el = ensurePopup();
        if (!el || !popupBodyEl) return;

        if (renderedCount > popupQueue.length) renderedCount = 0;

        if (renderedCount === 0 && popupQueue.length > 0 && popupBodyEl.childNodes.length === 0) {
            fullRebuild();
            return;
        }

        if (renderedCount < popupQueue.length) {
            const frag = document.createDocumentFragment();
            for (let i = renderedCount; i < popupQueue.length; i++) {
                frag.appendChild(makeRow(popupQueue[i]));
            }
            popupBodyEl.appendChild(frag);
            renderedCount = popupQueue.length;
        }

        safe(function () {
            const lastDom = popupBodyEl.lastChild;
            const lastQ = popupQueue[popupQueue.length - 1];
            if (lastDom && lastQ && lastDom.textContent !== lastQ.line) lastDom.textContent = lastQ.line;
        });
    }

    function showPopupNow() {
        if (LOG_OFF) return;
        const el = ensurePopup();
        if (!el) return;

        el.style.display = 'block';
        if (popupTimer) clearTimeout(popupTimer);
        popupTimer = setTimeout(function () {
            if (popupEl) popupEl.style.display = 'none';
        }, POPUP_MS);
    }

    function pushPopupLine(line, tag, key) {
        if (LOG_OFF) return;

        if (!rateAllow()) {
            const now = Date.now();
            if ((now - rateBucketTs) < 1000 && rateBucketCount === (RATE_MAX_PER_SEC + 1)) {
                const ts = new Date().toLocaleTimeString();
                const l = `[${ts}] WRN AutoPlugin: log rate limited | max=${RATE_MAX_PER_SEC}/s`;
                popupQueue.push({ line: l, tag: 'WRN', key: 'rate', ts: now, count: 1 });
                while (popupQueue.length > MAX_LINES) { popupQueue.shift(); renderedCount = 0; }
                schedulePopupFlush();
                showPopupNow();
            }
            return;
        }

        const now = Date.now();

        if (key && key === lastKey && (now - lastTs) <= COALESCE_WINDOW_MS && lastIdx >= 0 && lastIdx < popupQueue.length) {
            const e = popupQueue[lastIdx];
            e.count = (e.count || 1) + 1;
            e.line = decorateLine(line, e.count);
            popupQueue[lastIdx] = e;
            schedulePopupFlush();
            showPopupNow();
            return;
        }

        popupQueue.push({ line: line, tag: tag || '', key: key || '', ts: now, count: 1 });

        while (popupQueue.length > MAX_LINES) {
            popupQueue.shift();
            renderedCount = 0;
            lastIdx = -1;
            lastKey = '';
        }

        lastKey = key || '';
        lastIdx = popupQueue.length - 1;
        lastTs = now;

        schedulePopupFlush();
        showPopupNow();
    }

    function showLine(tag, source, message, extra) {
        if (LOG_OFF) return;

        const ts = new Date().toLocaleTimeString();
        const line = `[${ts}] ${tag} ${source}: ${message}${extra ? ` | ${extra}` : ''}`;
        const key = makeKey(tag, source, message, extra);

        pushPopupLine(line, tag, key);
    }

    function showError(source, message, extra) { showLine('ERR', source, message, extra); }
    function showWarn(source, message, extra)  { showLine('WRN', source, message, extra); }
    function showOk(source, message, extra)    { showLine('OK ', source, message, extra); }
    function showInfo(source, message, extra)  { showLine('INF', source, message, extra); }
    function showDbg(source, message, extra)   { showLine('DBG', source, message, extra); }

    // =========================================================================
    // NETWORK BLOCK (всегда включён; логирование зависит от LOG_MODE)
    // =========================================================================

    const BLOCK_YANDEX_RE =
    /(^|\.)((yandex\.(ru|com|net|by|kz|ua|uz|tm|tj))|(ya\.ru)|(yastatic\.net)|(yandex\.(net|com)\.tr))$/i;

    const BLOCK_GOOGLE_YT_RE =
    /(^|\.)((google\.com)|(google\.[a-z.]+)|(gstatic\.com)|(googlesyndication\.com)|(googleadservices\.com)|(doubleclick\.net)|(googletagmanager\.com)|(google-analytics\.com)|(analytics\.google\.com)|(api\.google\.com)|(accounts\.google\.com)|(recaptcha\.net)|(youtube\.com)|(ytimg\.com)|(googlevideo\.com)|(youtu\.be)|(youtube-nocookie\.com))$/i;

    const BLOCK_STATS_RE =
    /(^|\.)((scorecardresearch\.com)|(quantserve\.com)|(cdn\.quantserve\.com)|(hotjar\.com)|(static\.hotjar\.com)|(mixpanel\.com)|(api\.mixpanel\.com)|(sentry\.io)|(o\d+\.ingest\.sentry\.io)|(datadoghq\.com)|(segment\.com)|(api\.segment\.io)|(amplitude\.com)|(api\.amplitude\.com)|(branch\.io)|(app-measurement\.com))$/i;

    function isBwaCorsCheck(url) {
        try {
            const host = String(url.hostname || '').toLowerCase();
            const path = String(url.pathname || '').toLowerCase();
            const isBwa = (host === 'bwa.to') || (host.length > 7 && host.slice(host.length - 7) === '.bwa.to');
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

            const h = String(url.hostname || '').toLowerCase();
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
            const url = new URL(String(u), location.href);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
            return classifyBlocked(url);
        } catch (_) {
            return null;
        }
    }

    function logBlocked(u, where, why) {
        // логирование блокировок — только если лог включён (1/2)
        if (LOG_OFF) return;

        const label = (why || 'Blocked');

        try {
            const badge =
            label === 'Yandex' ? 'background:#ff2d55' :
            label === 'Google/YouTube' ? 'background:#ff9500' :
            label === 'Statistics' ? 'background:#8e8e93' :
            label === 'BWA:CORS' ? 'background:#00c2ff' :
            'background:#ff2d55';

            const txt =
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
        } catch (_) {}

        showWarn(where, 'BLOCKED (' + label + ')', u);
    }

    function patchBlockNetwork() {
        // fetch
        if (window.fetch) {
            const origFetch = window.fetch.bind(window);
            window.fetch = function (input, init) {
                const u = (typeof input === 'string') ? input : (input && input.url) ? input.url : '';
                const why = isBlockedUrl(u);
                if (why) {
                    logBlocked(u, 'fetch', why);
                    return Promise.reject(new TypeError('Blocked by policy: ' + why));
                }
                return origFetch(input, init);
            };
        }

        // XHR
        if (window.XMLHttpRequest) {
            const XHR = window.XMLHttpRequest;
            const origOpen = XHR.prototype.open;
            const origSend = XHR.prototype.send;

            XHR.prototype.open = function (method, url) {
                this.__ap_url = url;
                this.__ap_block_reason = isBlockedUrl(url);
                return origOpen.apply(this, arguments);
            };

            XHR.prototype.send = function () {
                if (this.__ap_block_reason) {
                    const u = this.__ap_url;
                    const why = this.__ap_block_reason;
                    logBlocked(u, 'XHR', why);

                    const xhr = this;
                    setTimeout(function () {
                        try { if (xhr.onerror) xhr.onerror(new Error('Blocked by policy: ' + why)); } catch (_) {}
                        try { if (xhr.onreadystatechange) xhr.onreadystatechange(); } catch (_) {}
                        try { if (xhr.dispatchEvent) xhr.dispatchEvent(new Event('error')); } catch (_) {}
                    }, 0);
                    return;
                }
                return origSend.apply(this, arguments);
            };
        }

        // sendBeacon
        if (navigator.sendBeacon) {
            const origBeacon = navigator.sendBeacon.bind(navigator);
            navigator.sendBeacon = function (url, data) {
                const why = isBlockedUrl(url);
                if (why) {
                    logBlocked(url, 'sendBeacon', why);
                    return false;
                }
                return origBeacon(url, data);
            };
        }

        // WebSocket
        if (window.WebSocket) {
            const OrigWS = window.WebSocket;
            window.WebSocket = function (url, protocols) {
                const why = isBlockedUrl(url);
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
    // script loader (HARDENED)
    // =========================================================================

    const LOAD_TIMEOUT_MS = 15000;
    let currentPlugin = null;

    function load(url) {
        return new Promise(function (resolve) {
            let done = false;

            function finish(ok, why) {
                if (done) return;
                done = true;
                currentPlugin = null;
                resolve({ ok: ok, why: why || (ok ? 'ok' : 'fail'), url: url });
            }

            try {
                currentPlugin = url;

                const blockReason = isBlockedUrl(url);
                if (blockReason) {
                    logBlocked(url, 'script', blockReason);
                    finish(false, 'blocked:' + blockReason);
                    return;
                }

                const s = document.createElement('script');
                s.src = url;
                s.async = true;

                const t = setTimeout(function () {
                    try { s.onload = null; s.onerror = null; } catch (_) {}
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
        for (let i = 0; i < 120; i++) {
            if (window.Lampa && window.Lampa.Listener) return true;
            await new Promise(function (r) { setTimeout(r, 500); });
        }
        if (!LOG_OFF) showWarn('Lampa', 'wait timeout', 'Lampa not detected');
        return false;
    }

    // =========================================================================
    // GLOBAL EVENT HOOKS (можно отключить после done)
    // =========================================================================

    // будем уметь снять обработчики и "заморозить" лог
    let monitoringEnabled = !LOG_OFF;   // OFF => false
    let monitorBootOnly = LOG_BOOT_ONLY;

    function shouldLogNow() {
        // 0: никогда
        if (LOG_OFF) return false;
        // 1: пока monitoringEnabled=true (мы его выключим на done)
        if (LOG_BOOT_ONLY) return monitoringEnabled;
        // 2: всегда
        return true;
    }

    // обёртки, чтобы все show* сами уважали режим
    function showLineMode(tag, source, message, extra) {
        if (!shouldLogNow()) return;
        const ts = new Date().toLocaleTimeString();
        const line = `[${ts}] ${tag} ${source}: ${message}${extra ? ` | ${extra}` : ''}`;
        const key = makeKey(tag, source, message, extra);
        pushPopupLine(line, tag, key);
    }
    function showErrorM(source, message, extra) { showLineMode('ERR', source, message, extra); }
    function showWarnM(source, message, extra)  { showLineMode('WRN', source, message, extra); }
    function showOkM(source, message, extra)    { showLineMode('OK ', source, message, extra); }
    function showInfoM(source, message, extra)  { showLineMode('INF', source, message, extra); }
    function showDbgM(source, message, extra)   { showLineMode('DBG', source, message, extra); }

    // переопределим внутренние show* на mode-aware, чтобы не ломать остальной код
    showError = showErrorM;
    showWarn  = showWarnM;
    showOk    = showOkM;
    showInfo  = showInfoM;
    showDbg   = showDbgM;

    // handlers refs for removeEventListener
    function onWindowError(ev) {
        if (!shouldLogNow()) return;
        try {
            const msg = ev && ev.message ? ev.message : 'error';
            const file = ev && ev.filename ? ev.filename : '(no file)';
            const line = (ev && typeof ev.lineno === 'number') ? ev.lineno : '?';
            const col  = (ev && typeof ev.colno === 'number') ? ev.colno : '?';
            const stack = (ev && ev.error && ev.error.stack) ? String(ev.error.stack).split('\n')[0] : '';

            const src =
            (file && PLUGINS.some(function (p) { return file.indexOf(p) !== -1; })) ? file :
            (file && PLUGINS.some(function (p) { return p.indexOf(file) !== -1; })) ? file :
            (currentPlugin || file);

            showError(src, msg, String(file) + ':' + String(line) + ':' + String(col) + (stack ? (' | ' + stack) : ''));
        } catch (_) {}
    }

    function onUnhandledRejection(ev) {
        if (!shouldLogNow()) return;
        try {
            const reason = ev && ev.reason ? ev.reason : 'unhandled rejection';
            const msg = fmtErr(reason);
            const stack = (reason && reason.stack) ? String(reason.stack).split('\n')[0] : '';
            showError(currentPlugin || 'Promise', msg, stack);
        } catch (_) {}
    }

    function enableMonitoring() {
        if (LOG_OFF) return;
        if (monitoringEnabled) return;
        monitoringEnabled = true;
        try { window.addEventListener('error', onWindowError, true); } catch (_) {}
        try { window.addEventListener('unhandledrejection', onUnhandledRejection); } catch (_) {}
    }

    function disableMonitoring() {
        monitoringEnabled = false;
        try { window.removeEventListener('error', onWindowError, true); } catch (_) {}
        try { window.removeEventListener('unhandledrejection', onUnhandledRejection); } catch (_) {}
        // попап можно сразу убрать, чтобы вообще не рисовался
        safe(function () { if (popupEl) popupEl.style.display = 'none'; });
    }

    // включаем events сразу только если режим не OFF
    if (!LOG_OFF) {
        try { window.addEventListener('error', onWindowError, true); } catch (_) {}
        try { window.addEventListener('unhandledrejection', onUnhandledRejection); } catch (_) {}
    }

    // =========================================================================
    // main
    // =========================================================================

    // на ТВ: body появляется поздно — создадим попап когда появится (но только если лог включён)
    if (!LOG_OFF) {
        safe(function () {
            if (!document || !document.documentElement) return;
            const mo = new MutationObserver(function () {
                if (document.body && !popupEl) {
                    ensurePopup();
                    safe(function () { if (popupEl) popupEl.style.display = 'none'; });
                }
            });
            mo.observe(document.documentElement, { childList: true, subtree: true });
        });
    }

    async function start() {
        // блокировки сети всегда ставим (даже если LOG_OFF)
        patchBlockNetwork();

        // попап — только если лог включён
        if (!LOG_OFF) {
            safe(function () { const el = ensurePopup(); if (el) el.style.display = 'none'; });
        }

        await waitLampa();

        if (!LOG_OFF) {
            safe(function () { const el = ensurePopup(); if (el) el.style.display = 'none'; });
        }

        for (let i = 0; i < PLUGINS.length; i++) {
            const url = PLUGINS[i];
            try {
                const r = await load(url);
                try { if (!LOG_OFF) console.log('[[AutoPlugin]]', r.ok ? 'OK' : 'FAIL', r.why, r.url); } catch (_) {}
                if (!r.ok) { if (!LOG_OFF) showError(r.url, 'LOAD FAIL', r.why); }
                else { if (!LOG_OFF) showOk(r.url, 'loaded', r.why); }
            } catch (e) {
                try { if (!LOG_OFF) console.log('[[AutoPlugin]] FAIL exception', url, e); } catch (_) {}
                if (!LOG_OFF) showError(url, 'LOAD LOOP EXCEPTION', fmtErr(e));
            }
        }

        if (!LOG_OFF) showOk('AutoPlugin', 'done', 'total=' + String(PLUGINS.length));

        // КЛЮЧЕВОЕ: в режиме BOOT-ONLY — после done выключаем мониторинг/ивенты полностью
        if (LOG_BOOT_ONLY) {
            disableMonitoring();
        }
    }

    start();
})();
