(function () {
    'use strict';

    // список автоплагинов (НЕ УДАЛЯЮ закомментированные — оставляю как есть)
    const PLUGINS = [
        // "http://skaz.tv/onlines.js",
        // "http://skaz.tv/vcdn.js",
        // "https://netfix.cc/netfix.js",
        "https://tsynik.github.io/lampa/e.js",
        //"https://and7ey.github.io/lampa/stats.js",
        "https://and7ey.github.io/lampa/head_filter.js",
        //"https://andreyurl54.github.io/diesel5/tricks.js",

        // "https://bylampa.github.io/redirect.js",
        "https://bylampa.github.io/trailer_off.js",
        "https://bylampa.github.io/color_vote.js",
        "https://bylampa.github.io/seas_and_eps.js",
        "https://bylampa.github.io/old_card_status.js",
        "https://bylampa.github.io/backmenu.js",
        "https://bylampa.github.io/cub_off.js",
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


    // ===== popup ===============================================================

    const POPUP_MS = 20_000;
    const MAX_LINES = 120;

    let popupEl = null;
    let popupTimer = null;
    const popupQueue = [];

    // Цвета статусов
    const TAG_STYLE = {
        'ERR': { color: '#ff4d4f' }, // red
        'WRN': { color: '#ffa940' }, // orange
        'OK ': { color: '#52c41a' }, // green
        'INF': { color: '#40a9ff' }, // blue
        'DBG': { color: '#8c8c8c' }  // gray
    };

    // IMPORTANT: фикс "прыгающего" шрифта/лейаута:
    // - одинаковый font-weight для всех строк (не bold на отдельных)
    // - стабильный скроллбар (scrollbar-gutter)
    // - моноширинный стек ближе к Linux-терминалу
    const POPUP_FONT = '12px/1.35 "DejaVu Sans Mono","Liberation Mono","Ubuntu Mono","Noto Sans Mono",Consolas,Menlo,Monaco,monospace';

    function ensurePopup() {
        if (popupEl) return popupEl;

        // если body ещё нет — не создаём, просто подождём (лог в очередь уже попадёт)
        if (!document.body) return null;

        const el = document.createElement('div');
        el.id = '__autoplugin_popup';
        el.style.cssText = [
            'position:fixed',
            'top:12px',
            'left:12px',
            'right:12px',
            'bottom:12px',
            'z-index:2147483647',
            'background:rgba(0,0,0,0.82)',
 'color:#fff',
 'border-radius:12px',
 'padding:10px 12px',
 'box-sizing:border-box',
 'font:' + POPUP_FONT,
 'font-weight:500',                 // одинаковый везде (не прыгает)
'font-variant-ligatures:none',
'letter-spacing:0',
'-webkit-font-smoothing:antialiased',
'text-rendering:optimizeSpeed',
'pointer-events:none',
'white-space:pre-wrap',
'word-break:break-word',
'overflow:auto',
'scrollbar-gutter:stable both-edges', // чтобы не дёргалось при появлении скролла
'box-shadow:0 10px 30px rgba(0,0,0,0.35)'
        ].join(';');

        const title = document.createElement('div');
        title.id = '__autoplugin_popup_title';
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

    function parseTag(line) {
        try {
            const m = String(line).match(/^\[[^\]]+\]\s(.{3})\s/); // "ERR"/"WRN"/"OK "/"INF"/"DBG"
            return m ? m[1] : '';
        } catch (_) {
            return '';
        }
    }

    function renderPopup() {
        const el = ensurePopup();
        if (!el) return;

        const body = el.querySelector('#__autoplugin_popup_body');
        if (!body) return;

        const frag = document.createDocumentFragment();

        for (const line of popupQueue) {
            const tag = parseTag(line);

            const row = document.createElement('div');
            row.textContent = line;

            // общий стабильный стиль строки
            row.style.cssText = [
                'font:' + POPUP_FONT,
                'font-weight:500',
                'margin:0',
                'padding:0'
            ].join(';');

            // цвет по тегу (без смены жирности -> меньше "прыжков")
            if (tag && TAG_STYLE[tag]) {
                row.style.color = TAG_STYLE[tag].color;
            }

            frag.appendChild(row);
        }

        // replaceChildren стабильнее, чем innerHTML=''
        body.replaceChildren(frag);
    }

    function pushPopupLine(line) {
        popupQueue.push(line);
        while (popupQueue.length > MAX_LINES) popupQueue.shift();

        renderPopup();

        const el = ensurePopup();
        if (!el) return;

        // ВАЖНО: попап будет снова всплывать при ЛЮБОЙ новой строке (ошибка/варн/инфо),
        // даже если он уже был скрыт таймером.
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
    function showInfo(source, message, extra)  { showLine('INF', source, message, extra); }
    function showDbg(source, message, extra)   { showLine('DBG', source, message, extra); }

    // ===== BLOCK NETWORK (YANDEX + GOOGLE/YOUTUBE + STATS) =====================

    // 1) Yandex
    const BLOCK_YANDEX_RE =
    /(^|\.)((yandex\.(ru|com|net|by|kz|ua|uz|tm|tj))|(ya\.ru)|(yastatic\.net)|(yandex\.(net|com)\.tr))$/i;

    // 2) Google / YouTube
    // FIX: JS НЕ поддерживает флаг /x, поэтому regexp должен быть в одну строку без "красивых" переносов.
    const BLOCK_GOOGLE_YT_RE =
    /(^|\.)(google\.com|google\.[a-z.]+|gstatic\.com|googlesyndication\.com|googleadservices\.com|doubleclick\.net|googletagmanager\.com|google-analytics\.com|analytics\.google\.com|api\.google\.com|accounts\.google\.com|recaptcha\.net|youtube\.com|ytimg\.com|googlevideo\.com|youtu\.be|youtube-nocookie\.com)$/i;

    // 3) “Statistics / telemetry” (часто встречаемые трекеры)
    // FIX: тоже без /x
    const BLOCK_STATS_RE =
    /(^|\.)(scorecardresearch\.com|quantserve\.com|cdn\.quantserve\.com|hotjar\.com|static\.hotjar\.com|mixpanel\.com|api\.mixpanel\.com|sentry\.io|o\d+\.ingest\.sentry\.io|datadoghq\.com|segment\.com|api\.segment\.io|amplitude\.com|api\.amplitude\.com|branch\.io|app-measurement\.com)$/i;

    // 4) special-path block: bwa.to/cors/check (как попросил)
    // (host = bwa.to, path начинается с /cors/check)
    function isBwaCorsCheck(url) {
        try {
            return (url.hostname.toLowerCase() === 'bwa.to' && String(url.pathname || '').toLowerCase().startsWith('/cors/check'));
        } catch (_) {
            return false;
        }
    }

    function classifyBlocked(url) {
        try {
            if (!url) return null;

            // PATH-based блок (приоритетнее доменных правил)
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

            // блок только сетевые протоколы
            if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

            return classifyBlocked(url);
        } catch (_) {
            return null;
        }
    }

    function logBlocked(u, where, why) {
        const label = (why || 'Blocked');

        // цветной лог в консоль
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
                this.__ap_block_reason = isBlockedUrl(url); // null или "Yandex"/...
                return origOpen.apply(this, arguments);
            };

            XHR.prototype.send = function () {
                if (this.__ap_block_reason) {
                    const u = this.__ap_url;
                    const why = this.__ap_block_reason;
                    logBlocked(u, 'XHR', why);

                    const xhr = this;
                    setTimeout(() => {
                        try { xhr.onerror && xhr.onerror(new Error('Blocked by policy: ' + why)); } catch (_) {}
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
                const why = isBlockedUrl(url);
                if (why) {
                    logBlocked(url, 'sendBeacon', why);
                    return false;
                }
                return origBeacon(url, data);
            };
        }

        // WebSocket (редко, но пусть будет)
        if (window.WebSocket) {
            const OrigWS = window.WebSocket;
            window.WebSocket = function (url, protocols) {
                const why = isBlockedUrl(url);
                if (why) {
                    logBlocked(url, 'WebSocket', why);
                    throw new Error('Blocked by policy: ' + why);
                }
                return protocols !== undefined ? new OrigWS(url, protocols) : new OrigWS(url);
            };
            window.WebSocket.prototype = OrigWS.prototype;
        }

        showOk('policy', 'Network block installed', 'Yandex + Google/YouTube + Statistics + BWA:CORS(/cors/check)');
    }

    // ===== script loader (HARDENED) ============================================

    const LOAD_TIMEOUT_MS = 15_000;

    // map current "executing plugin" (best-effort)
    let currentPlugin = null;

    function load(url) {
        return new Promise((resolve) => {
            let done = false;

            const finish = (ok, why) => {
                if (done) return;
                done = true;
                currentPlugin = null;
                resolve({ ok, why: why || (ok ? 'ok' : 'fail'), url });
            };

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

                const t = setTimeout(() => {
                    try { s.onload = null; s.onerror = null; } catch (_) {}
                    showError(url, 'LOAD TIMEOUT', `${LOAD_TIMEOUT_MS}ms`);
                    finish(false, 'timeout');
                }, LOAD_TIMEOUT_MS);

                s.onload = () => {
                    clearTimeout(t);
                    finish(true, 'onload');
                };

                s.onerror = () => {
                    clearTimeout(t);
                    showError(url, 'LOAD FAIL', 'script.onerror');
                    finish(false, 'onerror');
                };

                document.head.appendChild(s);
            } catch (e) {
                showError(url, 'LOAD EXCEPTION', fmtErr(e));
                finish(false, 'exception');
            }
        });
    }

    async function waitLampa() {
        for (let i = 0; i < 120; i++) {
            if (window.Lampa && window.Lampa.Listener) return true;
            await new Promise(r => setTimeout(r, 500));
        }
        showWarn('Lampa', 'wait timeout', 'Lampa not detected');
        return false;
    }

    // ===== global error hooks ==================================================
    // Это остаётся висеть ПОСТОЯННО, так что если позже снова возникнут ошибки/анхендлед —
    // pop-up снова всплывёт (pushPopupLine всегда делает display=block).
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
        // ставим политику блокировок СРАЗУ (чтобы плагины тоже были под ней)
        patchBlockNetwork();

        // пробуем создать попап пораньше (если body уже есть)
        try { const el = ensurePopup(); if (el) el.style.display = 'none'; } catch (_) {}

        await waitLampa();

        // ещё раз гарантируем, что попап реально создан
        try { const el = ensurePopup(); if (el) el.style.display = 'none'; } catch (_) {}

        // загрузка плагинов: не прерывается даже при ошибках
        for (const url of PLUGINS) {
            try {
                const r = await load(url); // {ok, why, url}
                console.log('[AutoPlugin]', r.ok ? 'OK' : 'FAIL', r.why, r.url);
                if (!r.ok) showError(r.url, 'LOAD FAIL', r.why);
                else showOk(r.url, 'loaded', r.why);
            } catch (e) {
                console.log('[AutoPlugin] FAIL exception', url, e);
                showError(url, 'LOAD LOOP EXCEPTION', fmtErr(e));
            }
        }

        showOk('AutoPlugin', 'done', `total=${PLUGINS.length}`);
    }

    start();
})();
