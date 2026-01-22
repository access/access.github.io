(function () {
    'use strict';

    // список автоплагинов
    const PLUGINS = [
        // "http://skaz.tv/onlines.js",
        // "http://skaz.tv/vcdn.js",
        // "https://netfix.cc/netfix.js",
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

        "https://amiv1.github.io/lampa/rating.js",
        "https://amikdn.github.io/buttons.js"
    ];

    // ===== popup (10s) =========================================================

    const POPUP_MS = 100_000;
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
        title.textContent = 'AutoPlugin errors';

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

        // show 10s from last update
        el.style.display = 'block';
        if (popupTimer) clearTimeout(popupTimer);
        popupTimer = setTimeout(() => {
            if (popupEl) popupEl.style.display = 'none';
        }, POPUP_MS);
    }

    function showError(source, message, extra) {
        const ts = new Date().toLocaleTimeString();
        const line = `[${ts}] ${source}: ${message}${extra ? ` | ${extra}` : ''}`;
        pushPopupLine(line);
    }

    // ===== script loader with attribution =====================================

    // map current "executing plugin"
    let currentPlugin = null;

    function load(url) {
        return new Promise((resolve) => {
            try {
                currentPlugin = url;

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

    // JS runtime errors
    window.addEventListener('error', (ev) => {
        try {
            const msg = ev && ev.message ? ev.message : 'error';
            const file = ev && ev.filename ? ev.filename : '(no file)';
            const line = (ev && typeof ev.lineno === 'number') ? ev.lineno : '?';
            const col  = (ev && typeof ev.colno === 'number') ? ev.colno : '?';
            const stack = ev && ev.error && ev.error.stack ? ev.error.stack.split('\n')[0] : '';

            // try to attribute to plugin:
            // - if filename is a plugin url => use it
            // - else if currentPlugin exists => likely during load/exec
            const src =
            (file && PLUGINS.some(p => file.includes(p))) ? file :
            (file && PLUGINS.some(p => p.includes(file))) ? file :
            (PLUGINS.some(p => file && file.includes(new URL(p).host))) ? file :
            (currentPlugin || file);

            showError(src, msg, `${file}:${line}:${col}${stack ? ` | ${stack}` : ''}`);
        } catch (_) {}
    }, true);

    // unhandled promises
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
        await waitLampa();

        // гарантируем, что popup можно рисовать
        try { ensurePopup().style.display = 'none'; } catch (_) {}

        for (const url of PLUGINS) {
            const ok = await load(url);
            console.log('[AutoPlugin]', ok ? 'OK' : 'FAIL', url);
            if (!ok) showError(url, 'LOAD FAIL', 'returned false');
        }
    }

    start();
})();
