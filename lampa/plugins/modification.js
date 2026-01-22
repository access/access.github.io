(function () {
    'use strict';
    // ============================================================================
    // ACCESS INIT
    // ============================================================================

    // ====== FAKE PASSWORD LOCK (simple overlay) ======
    (function () {
        'use strict';

        const AUTH_KEY = 'msx_fake_auth_ok_v1';
        const PASS = 'blacklampa'; // <-- твой пароль

        function getAuthed() {
            try { return !!Lampa.Storage.get(AUTH_KEY); } catch (e) { return false; }
        }
        function setAuthed(v) {
            try { Lampa.Storage.set(AUTH_KEY, v ? 1 : 0); } catch (e) {}
        }

        function mountLockOverlay() {
            // уже стоит
            if (document.getElementById('msx_fake_lock')) return;

            const wrap = document.createElement('div');
            wrap.id = 'msx_fake_lock';
            wrap.style.cssText = [
                'position:fixed',
     'inset:0',
     'z-index:2147483647',
     'background:rgba(0,0,0,.92)',
     'display:flex',
     'align-items:center',
     'justify-content:center',
     'padding:24px',
     'box-sizing:border-box'
            ].join(';');

            const box = document.createElement('div');
            box.style.cssText = [
                'width:min(520px, 100%)',
     'border:1px solid rgba(255,255,255,.15)',
     'border-radius:16px',
     'padding:18px',
     'box-sizing:border-box',
     'color:#fff',
     'font:16px/1.35 sans-serif'
            ].join(';');

            box.innerHTML = `
            <div style="font-size:22px;margin-bottom:10px">Locked</div>
            <div style="opacity:.8;margin-bottom:14px">Enter password</div>

            <input id="msx_pw_inp" type="password" placeholder="password" style="
            width:100%;
            padding:12px 14px;
            background:#111;
            border:1px solid rgba(255,255,255,.18);
            border-radius:12px;
            color:#fff;
            outline:none;
            box-sizing:border-box;
            "/>

            <div id="msx_pw_btn" tabindex="0" style="
            margin-top:12px;
            display:flex;
            align-items:center;
            justify-content:center;
            padding:12px 14px;
            border:1px solid rgba(255,255,255,.22);
            border-radius:12px;
            user-select:none;
            cursor:pointer;
            ">Unlock</div>

            <div id="msx_pw_err" style="margin-top:10px;opacity:.85;display:none;color:#ff6b6b">
            Wrong password
            </div>
            `;

            wrap.appendChild(box);
            document.body.appendChild(wrap);

            const inp = box.querySelector('#msx_pw_inp');
            const btn = box.querySelector('#msx_pw_btn');
            const err = box.querySelector('#msx_pw_err');

            const submit = () => {
                const v = (inp.value || '').trim();
                if (v === PASS) {
                    setAuthed(true);
                    wrap.remove();
                } else {
                    err.style.display = 'block';
                    inp.value = '';
                    inp.focus();
                }
            };

            // максимально “пробивные” события
            btn.addEventListener('click', submit, true);
            btn.addEventListener('pointerup', submit, true);
            btn.addEventListener('touchend', (e) => { e.preventDefault(); submit(); }, true);

            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') submit();
            }, true);

                // На ТВ/пульте: Enter/OK часто приходит как Enter
                document.addEventListener('keydown', (e) => {
                    if (!document.getElementById('msx_fake_lock')) return;
                    if (e.key === 'Enter') submit();
                }, true);

                    setTimeout(() => inp.focus(), 50);
        }

        function startLock() {
            // уже авторизован — не мешаем
            if (getAuthed()) return;

            // если body ещё нет — подождём
            if (!document.body) return setTimeout(startLock, 50);

            mountLockOverlay();
        }

        // Запуск: сразу + несколько ретраев (чтобы не зависеть от событий Lampa)
        startLock();
        setTimeout(startLock, 200);
        setTimeout(startLock, 800);

        // “logout” для себя: Ctrl+Alt+L
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.altKey && (e.key || '').toLowerCase() === 'l') {
                setAuthed(false);
                location.reload();
            }
        }, true);

    })();


    // ============================================================================


    // ============================================================================
    // LOG MODES (0/1/2)
    // 0 = OFF (никаких window events, никакого popup)
    // 1 = BOOT (лог + window events ТОЛЬКО до "AutoPlugin done", потом отписка)
    // 2 = FULL (как сейчас: лог + window events всегда)
    //
    // Переопределение без правки файла:
    //   ?aplog=0|1|2   (или ?apmode=0|1|2)
    // Также читает localStorage.aplog если есть.
    // ============================================================================

    var DEFAULT_LOG_MODE = 1;

    function toInt(x, d) {
        var n = parseInt(x, 10);
        return isNaN(n) ? d : n;
    }

    function getQueryParam(name) {
        try {
            var s = String(location.search || '');
            if (!s) return null;
            if (s.charAt(0) === '?') s = s.slice(1);
            var parts = s.split('&');
            for (var i = 0; i < parts.length; i++) {
                var kv = parts[i].split('=');
                if (decodeURIComponent(kv[0] || '') === name) return decodeURIComponent(kv[1] || '');
            }
        } catch (_) {}
        return null;
    }

    function getLogMode() {
        var q = getQueryParam('aplog');
        if (q == null) q = getQueryParam('apmode');
        if (q != null) return clampMode(toInt(q, DEFAULT_LOG_MODE));

        try {
            var ls = null;
            try { ls = localStorage.getItem('aplog'); } catch (_) {}
            if (ls != null && ls !== '') return clampMode(toInt(ls, DEFAULT_LOG_MODE));
        } catch (_) {}

        return clampMode(DEFAULT_LOG_MODE);
    }

    function clampMode(m) {
        if (m !== 0 && m !== 1 && m !== 2) return DEFAULT_LOG_MODE;
        return m;
    }

    var LOG_MODE = getLogMode();

    // ============================================================================
    // список автоплагинов (НЕ УДАЛЯЮ закомментированные — оставляю как есть)
    // ============================================================================
    var PLUGINS = [
        // "https://bdvburik.github.io/title.js",
        "https://bywolf88.github.io/lampa-plugins/interface_mod.js",
        "scripts/rating.js",
        // "http://skaz.tv/onlines.js",
        // "http://skaz.tv/vcdn.js",
        // "https://netfix.cc/netfix.js",
        // "https://and7ey.github.io/lampa/stats.js",
        "https://and7ey.github.io/lampa/head_filter.js",
        "https://and7ey.github.io/lampa/noshots.js",
        //"https://andreyurl54.github.io/diesel5/tricks.js",

        // "https://bylampa.github.io/redirect.js",
        // "https://bylampa.github.io/trailer_off.js",
        // "https://bylampa.github.io/color_vote.js",
        "https://bylampa.github.io/seas_and_eps.js",
        // "https://bylampa.github.io/old_card_status.js",
        // "https://bylampa.github.io/backmenu.js",
        "https://bylampa.github.io/cub_off.js",
        // "https://bylampa.github.io/addon.js",


        //sources...
        "https://tsynik.github.io/lampa/e.js",
        "https://bylampa.github.io/source.js",

        //players
        "https://nb557.github.io/plugins/online_mod.js",
        "https://lampa.stream/modss",
        // "https://bwa.to/rc",
        "https://bwa.to/cloud.js",


        "https://skaztv.online/store.js",
        "https://skaztv.online/js/tricks.js",

        "https://amikdn.github.io/buttons.js",
        "https://aviamovie.github.io/surs.js"
        // "https://amiv1.github.io/lampa/rating.js",

    ];

    // ============================================================================
    // popup (только если LOG_MODE != 0)
    // ============================================================================
    var POPUP_MS = 20000;
    var MAX_LINES = 120;

    var popupEl = null;
    var popupTimer = null;

    // инкрементальный лог (не фулл перерендер)
    var popupQueue = []; // {line, tag, key, ts, count}
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
        title.textContent = 'AutoPlugin log (mode=' + String(LOG_MODE) + ')';

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

    // PERF coalesce + throttled flush
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

    function showLine(tag, source, message, extra) {
        if (LOG_MODE === 0) return;
        var ts = new Date().toLocaleTimeString();
        var line = '[' + ts + '] ' + tag + ' ' + source + ': ' + message + (extra ? (' | ' + extra) : '');
        var key = makeKey(tag, source, message, extra);
        pushPopupLine(line, tag, key);
    }

    function showError(source, message, extra) { showLine('ERR', source, message, extra); }
    function showWarn(source, message, extra)  { showLine('WRN', source, message, extra); }
    function showOk(source, message, extra)    { showLine('OK ', source, message, extra); }
    function showInfo(source, message, extra)  { showLine('INF', source, message, extra); }
    function showDbg(source, message, extra)   { showLine('DBG', source, message, extra); }

    // ============================================================================
    // NETWORK BLOCK (оставляю как было)
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

    function logBlocked(u, where, why) {
        var label = (why || 'Blocked');
        try { console.log('[[AutoPlugin]] BLOCKED', label, where, u); } catch (_) {}
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
                        try { if (xhr.onerror) xhr.onerror(new Error('Blocked by policy: ' + why)); } catch (_) {}
                        try { if (xhr.onreadystatechange) xhr.onreadystatechange(); } catch (_) {}
                        try { if (xhr.dispatchEvent) xhr.dispatchEvent(new Event('error')); } catch (_) {}
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

        showOk('policy', 'Network block installed', 'Yandex + Google/YouTube + Statistics + BWA:CORS(/cors/check)');
    }

    // ============================================================================
    // IMPORTANT PART: "вшивание" в систему Lampa (plugins storage), а не просто load()
    // Используем ровно тот же механизм, что в твоём addon.js:
    //   Lampa.Storage.get('plugins') -> push({author,url,name,status:1}) -> set обратно
    //   и только для НОВЫХ делаем инъекцию script чтобы работало сразу
    // ============================================================================
    var AUTO_ENABLE_DISABLED = true;  // если плагин найден, но status=0 -> включить (status=1)
var INJECT_NEWLY_INSTALLED = true; // для новых: сразу <script src=...> (как itemON)

function absUrl(u) {
    try { return String(new URL(String(u), location.href).href); } catch (_) { return String(u); }
}

function guessName(url) {
    try {
        var u = new URL(String(url), location.href);
        var p = String(u.pathname || '');
        var last = p.split('/'); last = last[last.length - 1] || '';
        if (!last) last = u.hostname;
        return last;
    } catch (_) {
        var s = String(url);
        var a = s.split('/'); return a[a.length - 1] || s;
    }
}

function guessAuthor(url) {
    try {
        var u = new URL(String(url), location.href);
        return '@' + String(u.hostname || 'plugin');
    } catch (_) {
        return '@plugin';
    }
}

function findPluginIndex(arr, urlAbs) {
    for (var i = 0; i < arr.length; i++) {
        try {
            if (String(arr[i].url || '') === urlAbs) return i;
        } catch (_) {}
    }
    return -1;
}

function injectScript(urlAbs) {
    return new Promise(function (resolve) {
        try {
            var s = document.createElement('script');
            s.src = urlAbs;
            s.async = true;
            s.onload = function () { resolve({ ok: true, why: 'onload', url: urlAbs }); };
            s.onerror = function () { resolve({ ok: false, why: 'onerror', url: urlAbs }); };
            document.head.appendChild(s);
        } catch (e) {
            resolve({ ok: false, why: 'exception:' + fmtErr(e), url: urlAbs });
        }
    });
}

function ensureInstalledOne(url) {
    return new Promise(function (resolve) {
        var urlAbs = absUrl(url);

        // network policy block (не даём поставить то, что мы сами блокируем)
        var br = isBlockedUrl(urlAbs);
        if (br) {
            logBlocked(urlAbs, 'install', br);
            resolve({ ok: false, action: 'blocked', url: urlAbs, why: br });
            return;
        }

        if (!window.Lampa || !Lampa.Storage) {
            resolve({ ok: false, action: 'no-lampa', url: urlAbs, why: 'Lampa.Storage missing' });
            return;
        }

        var plugins = Lampa.Storage.get('plugins');
        if (!plugins || typeof plugins.length !== 'number') plugins = [];

        var idx = findPluginIndex(plugins, urlAbs);
        if (idx >= 0) {
            // already exists
            if (AUTO_ENABLE_DISABLED && plugins[idx] && plugins[idx].status === 0) {
                plugins[idx].status = 1;
                Lampa.Storage.set('plugins', plugins);
                try { if (Lampa.Settings && Lampa.Settings.update) Lampa.Settings.update(); } catch (_) {}
                showOk('install', 'enabled', urlAbs);
                resolve({ ok: true, action: 'enabled', url: urlAbs, why: 'was disabled' });
                return;
            }

            showDbg('install', 'skip (already)', urlAbs);
            resolve({ ok: true, action: 'skip', url: urlAbs, why: 'already installed' });
            return;
        }

        // install into Lampa system
        var entry = {
            author: guessAuthor(urlAbs),
                       url: urlAbs,
                       name: guessName(urlAbs),
                       status: 1
        };

        plugins.push(entry);
        Lampa.Storage.set('plugins', plugins);

        try { if (Lampa.Settings && Lampa.Settings.update) Lampa.Settings.update(); } catch (_) {}

        showOk('install', 'installed', urlAbs);

        if (!INJECT_NEWLY_INSTALLED) {
            resolve({ ok: true, action: 'installed', url: urlAbs, why: 'no-inject' });
            return;
        }

        // immediate injection (как itemON)
        injectScript(urlAbs).then(function (r) {
            if (r.ok) showOk('inject', 'ok', urlAbs);
            else showError('inject', 'fail', urlAbs + ' | ' + r.why);
            resolve({ ok: r.ok, action: 'installed+inject', url: urlAbs, why: r.why });
        });
    });
}

function ensureInstalledAll(list) {
    // sequential, без async/await (TV-friendly)
    return new Promise(function (resolve) {
        var i = 0;
        function step() {
            if (i >= list.length) { resolve(true); return; }
            var url = list[i++];
            ensureInstalledOne(url).then(function () {
                // не стопаемся на ошибках
                setTimeout(step, 0);
            });
        }
        step();
    });
}

// ============================================================================
// wait for Lampa
// ============================================================================
function waitLampa(cb) {
    var tries = 0;
    var max = 240; // 240 * 250ms = 60s
    var t = setInterval(function () {
        tries++;
        if (window.Lampa && Lampa.Listener && Lampa.Storage) {
            clearInterval(t);
            cb(true);
            return;
        }
        if (tries >= max) {
            clearInterval(t);
            cb(false);
        }
    }, 250);
}

// ============================================================================
// global error hooks (attach/detach by mode)
// ============================================================================
var currentPlugin = null;

function onWinError(ev) {
    if (LOG_MODE === 0) return;
    try {
        var msg = ev && ev.message ? ev.message : 'error';
        var file = ev && ev.filename ? ev.filename : '(no file)';
        var line = (ev && typeof ev.lineno === 'number') ? ev.lineno : '?';
        var col  = (ev && typeof ev.colno === 'number') ? ev.colno : '?';
        var stack = (ev && ev.error && ev.error.stack) ? String(ev.error.stack).split('\n')[0] : '';
        var src = currentPlugin || file;
        showError(src, msg, String(file) + ':' + String(line) + ':' + String(col) + (stack ? (' | ' + stack) : ''));
    } catch (_) {}
}

function onUnhandledRejection(ev) {
    if (LOG_MODE === 0) return;
    try {
        var reason = ev && ev.reason ? ev.reason : 'unhandled rejection';
        var msg = fmtErr(reason);
        var stack = (reason && reason.stack) ? String(reason.stack).split('\n')[0] : '';
        showError(currentPlugin || 'Promise', msg, stack);
    } catch (_) {}
}

function attachGlobalHooks() {
    if (LOG_MODE === 0) return;
    window.addEventListener('error', onWinError, true);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
}

function detachGlobalHooks() {
    // отписка после done (mode=1)
    try { window.removeEventListener('error', onWinError, true); } catch (_) {}
    try { window.removeEventListener('unhandledrejection', onUnhandledRejection); } catch (_) {}
}

function finalizeLoggingAfterDone() {
    if (LOG_MODE === 1) {
        detachGlobalHooks();

        // popup можно оставить как "фризнутый" и скрыть
        safe(function () { if (popupEl) popupEl.style.display = 'none'; });
    }
}

// ============================================================================
// popup early-create (body-late safe)
// ============================================================================
safe(function () {
    if (LOG_MODE === 0) return;
    if (!document || !document.documentElement) return;

    var mo = new MutationObserver(function () {
        if (document.body && !popupEl) {
            ensurePopup();
            safe(function () { if (popupEl) popupEl.style.display = 'none'; });
        }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
});

// ============================================================================
// MAIN
// ============================================================================
function start() {
    patchBlockNetwork();

    if (LOG_MODE !== 0) {
        attachGlobalHooks();
        safe(function () { var el = ensurePopup(); if (el) el.style.display = 'none'; });
        showInfo('AutoPlugin', 'start', 'mode=' + String(LOG_MODE));
    }

    waitLampa(function (ok) {
        if (!ok) {
            showWarn('Lampa', 'wait timeout', 'Lampa not detected');
            finalizeLoggingAfterDone();
            return;
        }

        safe(function () { var el = ensurePopup(); if (el) el.style.display = 'none'; });

        // именно "вшиваем" в Lampa и инжектим только новые
        ensureInstalledAll(PLUGINS).then(function () {
            showOk('AutoPlugin', 'done', 'total=' + String(PLUGINS.length));

            // КЛЮЧЕВОЕ: mode=1 -> отписка от window событий после done
            finalizeLoggingAfterDone();
        });
    });
}

start();

})();


