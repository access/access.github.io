(function () {
    'use strict';

    // список автоплагинов
    const PLUGINS = [
        "https://tsynik.github.io/lampa/e.js",
        "https://and7ey.github.io/lampa/stats.js",
        "https://and7ey.github.io/lampa/head_filter.js",
        "https://andreyurl54.github.io/diesel5/tricks.js",

        "https://bylampa.github.io/redirect.js",
        "https://bylampa.github.io/trailer_off.js",
        "https://bylampa.github.io/color_vote.js",
        "https://bylampa.github.io/seas_and_eps.js",
        "https://bylampa.github.io/old_card_status.js",
        "https://bylampa.github.io/backmenu.js",
        "https://bylampa.github.io/cub_off.js",
        "https://bylampa.github.io/addon.js",

        "https://bdvburik.github.io/title.js",
        "https://bywolf88.github.io/lampa-plugins/interface_mod.js",

        "https://bwa.to/rc",
        "https://bwa.to/cloud.js",

        "https://nb557.github.io/plugins/online_mod.js",

        "https://skaztv.online/store.js",
        "https://skaztv.online/js/tricks.js",

        //origin rating
        //"https://amiv1.github.io/lampa/rating.js",
        //with API key my rating copy
        "scripts/rating.js",

        "https://amikdn.github.io/buttons.js"
    ];

    // ===== popup ===============================================================

    const POPUP_MS = 20_000;
    const MAX_LINES = 100;

    let popupEl = null;
    let popupTimer = null;
    const popupQueue = [];

    function ensurePopup() {
        if (popupEl) return popupEl;

        const el = document.createElement('div');
        el.id = '__autoplugin_popup';
        el.style.cssText = [
            'position:fixed',
            'top:12px',
            'left:12px',
            'right:12px',
            'bottom:12px',
            'z-index:2147483647',
            'background:rgba(0,0,0,0.80)',
 'color:#fff',
 'border-radius:12px',
 'padding:10px 12px',
 'font:10px/1.35 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace',
 'pointer-events:none',
 'white-space:pre-wrap',
 'word-break:break-word',
 'box-shadow:0 10px 30px rgba(0,0,0,0.35)'
        ].join(';');

        const title = document.createElement('div');
        title.style.cssText = 'font-weight:700;margin-bottom:6px;opacity:.95';
        title.textContent = 'AutoPlugin log';

        const body = document.createElement('div');
        body.id = '__autoplugin_popup_body';

        el.appendChild(title);
        el.appendChild(body);
        document.body.appendChild(el);

        popupEl = el;
        return el;
    }

    function fmtErr(e) {
        try {
            if (!e) return 'unknown error';
            if (typeof e === 'string') return e;
            if (e.message) return e.message;
            return String(e);
        } catch (_) {
            return 'unknown error';
        }
    }

    function pushPopupLine(line) {
        popupQueue.push(line);
        while (popupQueue.length > MAX_LINES) popupQueue.shift();

        const el = ensurePopup();
        const body = el.querySelector('#__autoplugin_popup_body');
        body.textContent = popupQueue.join('\n');

        el.style.display = 'block';
        if (popupTimer) clearTimeout(popupTimer);
        popupTimer = setTimeout(() => {
            if (popupEl) popupEl.style.display = 'none';
        }, POPUP_MS);
    }

    function showLine(tag, source, message, extra) {
        const ts = new Date().toLocaleTimeString();
        const line = `[${ts}] ${tag} ${source}: ${message}${extra ? ` | ${extra}` : ''}`;
        pushPopupLine(line);
    }

    function showError(source, message, extra) { showLine('ERR', source, message, extra); }
    function showWarn(source, message, extra)  { showLine('WRN', source, message, extra); }
    function showOk(source, message, extra)    { showLine('OK ', source, message, extra); }

    // ===== BLOCK YANDEX (log + hard block) =====================================

    // что именно блокируем (добавляй паттерны как хочешь)
    const BLOCK_HOST_RE = /(^|\.)((yandex\.(ru|com|net|by|kz|ua|uz|tm|tj))|(ya\.ru)|(yastatic\.net)|(yandex\.(net|com)\.tr))$/i;

    function isBlockedUrl(u) {
        try {
            if (!u) return false;
            const url = new URL(String(u), location.href);
            // блок только сетевые протоколы
            if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
            return BLOCK_HOST_RE.test(url.hostname);
        } catch (_) {
            return false;
        }
    }

    // красивый лог в консоль (цветом)
    function logBlocked(u, where) {
        try {
            console.log(
                '%c[BLOCKED:Yandex]%c ' + where + ' -> ' + u,
                'background:#ff2d55;color:#fff;padding:2px 6px;border-radius:6px;font-weight:700',
                'color:#ff2d55'
            );
        } catch (_) {}
        showWarn(where, 'BLOCKED (Yandex)', u);
    }

    function patchBlockNetwork() {
        // fetch
        if (window.fetch) {
            const origFetch = window.fetch.bind(window);
            window.fetch = function (input, init) {
                const u = (typeof input === 'string') ? input : (input && input.url) ? input.url : '';
                if (isBlockedUrl(u)) {
                    logBlocked(u, 'fetch');
                    // имитируем "сетевую" ошибку
                    return Promise.reject(new TypeError('Blocked by policy: Yandex'));
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
                this.__ap_blocked = isBlockedUrl(url);
                return origOpen.apply(this, arguments);
            };

            XHR.prototype.send = function () {
                if (this.__ap_blocked) {
                    const u = this.__ap_url;
                    logBlocked(u, 'XHR');
                    // делаем асинхронно, чтобы не ломать ожидания кода
                    const xhr = this;
                    setTimeout(() => {
                        try { xhr.onerror && xhr.onerror(new Error('Blocked by policy: Yandex')); } catch (_) {}
                        try { xhr.onreadystatechange && xhr.onreadystatechange(); } catch (_) {}
                        try { xhr.dispatchEvent && xhr.dispatchEvent(new Event('error')); } catch (_) {}
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
                if (isBlockedUrl(url)) {
                    logBlocked(url, 'sendBeacon');
                    return false;
                }
                return origBeacon(url, data);
            };
        }

        // WebSocket (часто редко, но на всякий)
        if (window.WebSocket) {
            const OrigWS = window.WebSocket;
            window.WebSocket = function (url, protocols) {
                if (isBlockedUrl(url)) {
                    logBlocked(url, 'WebSocket');
                    throw new Error('Blocked by policy: Yandex');
                }
                return protocols !== undefined ? new OrigWS(url, protocols) : new OrigWS(url);
            };
            window.WebSocket.prototype = OrigWS.prototype;
        }

        showOk('policy', 'Network block installed', 'Yandex hosts');
    }

    // ===== script loader =======================================================

    let currentPlugin = null;

    function load(url) {
        return new Promise((resolve) => {
            try {
                currentPlugin = url;

                if (isBlockedUrl(url)) {
                    logBlocked(url, 'script');
                    currentPlugin = null;
                    resolve(false);
                    return;
                }

                const s = document.createElement('script');
                s.src = url;
                s.async = true;

                s.onload = () => {
                    currentPlugin = null;
                    resolve(true);
                };

                s.onerror = () => {
                    showError(url, 'LOAD FAIL', 'script.onerror');
                    currentPlugin = null;
                    resolve(false);
                };

                document.head.appendChild(s);
            } catch (e) {
                showError(url, 'LOAD EXCEPTION', fmtErr(e));
                currentPlugin = null;
                resolve(false);
            }
        });
    }

    async function waitLampa() {
        for (let i = 0; i < 120; i++) {
            if (window.Lampa && window.Lampa.Listener) return;
            await new Promise(r => setTimeout(r, 500));
        }
    }

    // ===== global error hooks ==================================================

    window.addEventListener('error', (ev) => {
        try {
            const msg = ev && ev.message ? ev.message : 'error';
            const file = ev && ev.filename ? ev.filename : '(no file)';
            const line = (ev && typeof ev.lineno === 'number') ? ev.lineno : '?';
            const col  = (ev && typeof ev.colno === 'number') ? ev.colno : '?';
            const stack = ev && ev.error && ev.error.stack ? ev.error.stack.split('\n')[0] : '';

            const src =
            (file && PLUGINS.some(p => file.includes(p))) ? file :
            (file && PLUGINS.some(p => p.includes(file))) ? file :
            (PLUGINS.some(p => file && (() => { try { return file.includes(new URL(p).host); } catch { return false; } })())) ? file :
            (currentPlugin || file);

            showError(src, msg, `${file}:${line}:${col}${stack ? ` | ${stack}` : ''}`);
        } catch (_) {}
    }, true);

    window.addEventListener('unhandledrejection', (ev) => {
        try {
            const reason = ev && ev.reason ? ev.reason : 'unhandled rejection';
            const msg = fmtErr(reason);
            const stack = reason && reason.stack ? reason.stack.split('\n')[0] : '';
            showError(currentPlugin || 'Promise', msg, stack);
        } catch (_) {}
    });

    // ===== main ================================================================

    async function start() {
        // СНАЧАЛА блок сетки (чтобы плагины тоже попадали под него)
        patchBlockNetwork();

        await waitLampa();

        try { ensurePopup().style.display = 'none'; } catch (_) {}

        for (const url of PLUGINS) {
            const ok = await load(url);
            console.log('[AutoPlugin]', ok ? 'OK' : 'FAIL', url);
            if (!ok) showError(url, 'LOAD FAIL', 'returned false');
        }
    }

    start();
})();
