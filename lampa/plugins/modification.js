(function () {
    'use strict';

    // =========================
    // CONFIG
    // =========================
    const AUTH_KEY = 'msx_fake_auth_ok_v2';

    // base64(SHA-256("blacklampa"))
    const PASS_HASH_B64 = 'wFQx3u0cQq5P4f0uV8lVYkQ6kHq4zV9mO1VfJ9n8X1s=';

    // =========================
    // STORAGE
    // =========================
    function getAuthed() {
        try { return !!(window.Lampa && Lampa.Storage && Lampa.Storage.get(AUTH_KEY)); }
        catch (e) { return false; }
    }

    function setAuthed(v) {
        try { window.Lampa && Lampa.Storage && Lampa.Storage.set(AUTH_KEY, v ? 1 : 0); }
        catch (e) { }
    }

    // =========================
    // SHA-256 base64 (crypto.subtle if possible, else tiny fallback)
    // =========================
    function btoaBytes(u8) {
        var s = '';
        for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
        return btoa(s);
    }

    function utf8Bytes(str) {
        // TV-friendly utf8 encoder (без TextEncoder)
        var out = [];
        for (var i = 0; i < str.length; i++) {
            var c = str.charCodeAt(i);
            if (c < 0x80) out.push(c);
            else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
            else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
                var c2 = str.charCodeAt(++i);
                var cp = 0x10000 + (((c & 0x3FF) << 10) | (c2 & 0x3FF));
                out.push(
                    0xF0 | (cp >> 18),
                    0x80 | ((cp >> 12) & 0x3F),
                    0x80 | ((cp >> 6) & 0x3F),
                    0x80 | (cp & 0x3F)
                );
            } else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
        }
        return new Uint8Array(out);
    }

    // tiny SHA-256 (fallback)
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    function sha256_u8(bytes) {
        var K = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ];
        var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

        var l = bytes.length;
        var bitLenHi = (l / 0x20000000) | 0;
        var bitLenLo = (l << 3) >>> 0;

        var withOne = l + 1;
        var padLen = (withOne % 64 <= 56) ? (56 - (withOne % 64)) : (56 + 64 - (withOne % 64));
        var total = withOne + padLen + 8;

        var m = new Uint8Array(total);
        m.set(bytes, 0);
        m[l] = 0x80;

        // length in bits (big endian)
        var p = total - 8;
        m[p + 0] = (bitLenHi >>> 24) & 0xff;
        m[p + 1] = (bitLenHi >>> 16) & 0xff;
        m[p + 2] = (bitLenHi >>> 8) & 0xff;
        m[p + 3] = (bitLenHi >>> 0) & 0xff;
        m[p + 4] = (bitLenLo >>> 24) & 0xff;
        m[p + 5] = (bitLenLo >>> 16) & 0xff;
        m[p + 6] = (bitLenLo >>> 8) & 0xff;
        m[p + 7] = (bitLenLo >>> 0) & 0xff;

        var W = new Uint32Array(64);

        for (var i = 0; i < total; i += 64) {
            for (var t = 0; t < 16; t++) {
                var j = i + (t * 4);
                W[t] = ((m[j] << 24) | (m[j + 1] << 16) | (m[j + 2] << 8) | (m[j + 3])) >>> 0;
            }
            for (var t2 = 16; t2 < 64; t2++) {
                var s0 = (rotr(W[t2 - 15], 7) ^ rotr(W[t2 - 15], 18) ^ (W[t2 - 15] >>> 3)) >>> 0;
                var s1 = (rotr(W[t2 - 2], 17) ^ rotr(W[t2 - 2], 19) ^ (W[t2 - 2] >>> 10)) >>> 0;
                W[t2] = (W[t2 - 16] + s0 + W[t2 - 7] + s1) >>> 0;
            }

            var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];

            for (var t3 = 0; t3 < 64; t3++) {
                var S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
                var ch = ((e & f) ^ ((~e) & g)) >>> 0;
                var temp1 = (h + S1 + ch + K[t3] + W[t3]) >>> 0;
                var S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
                var maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
                var temp2 = (S0 + maj) >>> 0;

                h = g; g = f; f = e; e = (d + temp1) >>> 0;
                d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
            }

            H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
            H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
        }

        var out = new Uint8Array(32);
        for (var k = 0; k < 8; k++) {
            out[k * 4 + 0] = (H[k] >>> 24) & 0xff;
            out[k * 4 + 1] = (H[k] >>> 16) & 0xff;
            out[k * 4 + 2] = (H[k] >>> 8) & 0xff;
            out[k * 4 + 3] = (H[k] >>> 0) & 0xff;
        }
        return out;
    }

    function sha256Base64(str, cb) {
        // async callback style (TV-friendly)
        try {
            if (window.crypto && crypto.subtle && window.TextEncoder) {
                var enc = new TextEncoder().encode(str);
                crypto.subtle.digest('SHA-256', enc).then(function (buf) {
                    cb(btoaBytes(new Uint8Array(buf)));
                }).catch(function () {
                    cb(btoaBytes(sha256_u8(utf8Bytes(str))));
                });
            } else {
                cb(btoaBytes(sha256_u8(utf8Bytes(str))));
            }
        } catch (e) {
            cb(btoaBytes(sha256_u8(utf8Bytes(str))));
        }
    }

    // =========================
    // INTERNAL GUARDS
    // =========================
    var mainStarted = false;
    var keyGuardInstalled = false;
    var rescueTimer = null;

    function startMainOnce() {
        if (mainStarted) return;
        mainStarted = true;
        MAIN();
    }

    // =========================
    // LOCK UI (overlay) - TV remote friendly
    // =========================
    var ui = {
        wrap: null,
        inp: null,
        btnInput: null,
        btnUnlock: null,
        err: null,
        sel: 0 // 0=inputBtn, 1=unlockBtn
    };

    function setSel(n) {
        ui.sel = (n === 1) ? 1 : 0;
        var a = ui.btnInput, b = ui.btnUnlock;
        if (!a || !b) return;

        if (ui.sel === 0) {
            a.style.outline = '2px solid rgba(255,255,255,.65)';
            a.style.background = 'rgba(255,255,255,.08)';
            b.style.outline = 'none';
            b.style.background = 'transparent';
        } else {
            b.style.outline = '2px solid rgba(255,255,255,.65)';
            b.style.background = 'rgba(255,255,255,.08)';
            a.style.outline = 'none';
            a.style.background = 'transparent';
        }
    }

    function ensureOverlay() {
        if (document.getElementById('msx_fake_lock')) return;

        var wrap = document.createElement('div');
        wrap.id = 'msx_fake_lock';
        // inset не везде работает на ТВ → top/left/right/bottom
        wrap.style.cssText = [
            'position:fixed',
            'top:0', 'left:0', 'right:0', 'bottom:0',
            'z-index:2147483647',
            'background:rgba(0,0,0,.92)',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'padding:24px',
            'box-sizing:border-box'
        ].join(';');

        var box = document.createElement('div');
        // min() не везде работает на ТВ → max-width + width:100%
        box.style.cssText = [
            'width:100%',
            'max-width:520px',
            'border:1px solid rgba(255,255,255,.15)',
            'border-radius:16px',
            'padding:18px',
            'box-sizing:border-box',
            'color:#fff',
            'font:16px/1.35 sans-serif'
        ].join(';');

        // без template literals (на некоторых ТВ ломается)
        box.innerHTML =
            '<div style="font-size:22px;margin-bottom:10px">Locked</div>' +
            '<div style="opacity:.8;margin-bottom:14px">Enter password</div>' +

            '<input id="msx_pw_inp" type="password" placeholder="password" ' +
            'autocomplete="off" autocapitalize="none" spellcheck="false" style="' +
            'width:100%;padding:12px 14px;background:#111;' +
            'border:1px solid rgba(255,255,255,.18);border-radius:12px;' +
            'color:#fff;outline:none;box-sizing:border-box;' +
            '"/>' +

            '<div style="margin-top:12px;display:flex;gap:10px">' +
            '<div id="msx_pw_btn_input" style="' +
            'flex:1;display:flex;align-items:center;justify-content:center;' +
            'padding:12px 14px;border:1px solid rgba(255,255,255,.22);' +
            'border-radius:12px;user-select:none;' +
            '">Enter</div>' +
            '<div id="msx_pw_btn_unlock" style="' +
            'flex:1;display:flex;align-items:center;justify-content:center;' +
            'padding:12px 14px;border:1px solid rgba(255,255,255,.22);' +
            'border-radius:12px;user-select:none;' +
            '">Unlock</div>' +
            '</div>' +

            '<div id="msx_pw_err" style="margin-top:10px;opacity:.85;display:none;color:#ff6b6b">Wrong password</div>' +

            '<div style="margin-top:10px;opacity:.55;font-size:12px">TV: use arrows (↑↓) and OK</div>';

        wrap.appendChild(box);
        document.body.appendChild(wrap);

        ui.wrap = wrap;
        ui.inp = box.querySelector('#msx_pw_inp');
        ui.btnInput = box.querySelector('#msx_pw_btn_input');
        ui.btnUnlock = box.querySelector('#msx_pw_btn_unlock');
        ui.err = box.querySelector('#msx_pw_err');

        // старт: выделяем кнопку Enter (чтобы попап точно был ВИДЕН, а не сразу системное окно)
        setSel(0);

        // клики (ПК/телефон)
        ui.btnInput.addEventListener('click', function () { focusInput(); }, true);
        ui.btnUnlock.addEventListener('click', function () { submit(); }, true);
    }

    function focusInput() {
        if (!ui.inp) return;
        try { ui.err && (ui.err.style.display = 'none'); } catch (_) { }
        try { ui.inp.focus(); } catch (_) { }
        // не держим фокус постоянно — только по явному действию пользователя
    }

    function submit() {
        if (!ui.inp) return;
        var v = String(ui.inp.value || '').trim();

        sha256Base64(v, function (h) {
            if (h === PASS_HASH_B64) {
                setAuthed(true);
                detachKeyGuard();
                try { ui.wrap && ui.wrap.remove(); } catch (_) { }
                startMainOnce();
            } else {
                try { ui.err && (ui.err.style.display = 'block'); } catch (_) { }
                try { ui.inp.value = ''; } catch (_) { }
                setSel(0);
            }
        });
    }

    // =========================
    // KEY GUARD: перехват пульта, управление попапом
    // =========================
    function keyGuardHandler(e) {
        if (!document.getElementById('msx_fake_lock')) return;

        // режем Lampa всегда, иначе она утащит фокус/события
        e.preventDefault();
        e.stopImmediatePropagation();

        var k = e.keyCode || 0;

        // ↑ / ↓ (пульт)
        if (k === 38) { setSel(0); return; }
        if (k === 40) { setSel(1); return; }

        // OK/Enter
        if (k === 13) {
            if (ui.sel === 0) focusInput();
            else submit();
            return;
        }

        // Back (часто 461 / 10009 / Escape)
        if (k === 27 || k === 461 || k === 10009) {
            // игнорируем, чтобы нельзя было “выйти” из лок-экрана
            return;
        }
    }

    function attachKeyGuard() {
        if (keyGuardInstalled) return;
        keyGuardInstalled = true;
        window.addEventListener('keydown', keyGuardHandler, true);
    }

    function detachKeyGuard() {
        if (!keyGuardInstalled) return;
        keyGuardInstalled = false;
        window.removeEventListener('keydown', keyGuardHandler, true);
    }

    // =========================
    // STABILITY: если DOM пересоздали — возвращаем overlay
    // =========================
    function watchOverlay() {
        if (rescueTimer) return;
        rescueTimer = setInterval(function () {
            if (getAuthed()) return;
            if (!document.body) return;
            if (!document.getElementById('msx_fake_lock')) ensureOverlay();
        }, 400);
    }

    // =========================
    // BOOT
    // =========================
    function BOOT() {
        if (getAuthed()) {
            startMainOnce();
            return;
        }

        if (!document.body) {
            setTimeout(BOOT, 50);
            return;
        }

        attachKeyGuard();
        ensureOverlay();
        watchOverlay();
    }

    // =========================
    // MAIN: ниже оставляешь ТВОЙ код как есть, без правок
    // =========================
    function MAIN() {
        // <<< твой текущий MAIN без изменений >>>
        //=======================================================================-=============================================



        (function () {
            'use strict';

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
                } catch (_) { }
                return null;
            }

            function getLogMode() {
                var q = getQueryParam('aplog');
                if (q == null) q = getQueryParam('apmode');
                if (q != null) return clampMode(toInt(q, DEFAULT_LOG_MODE));

                try {
                    var ls = null;
                    try { ls = localStorage.getItem('aplog'); } catch (_) { }
                    if (ls != null && ls !== '') return clampMode(toInt(ls, DEFAULT_LOG_MODE));
                } catch (_) { }

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
                try { while (node && node.firstChild) node.removeChild(node.firstChild); } catch (_) { }
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
            function showWarn(source, message, extra) { showLine('WRN', source, message, extra); }
            function showOk(source, message, extra) { showLine('OK ', source, message, extra); }
            function showInfo(source, message, extra) { showLine('INF', source, message, extra); }
            function showDbg(source, message, extra) { showLine('DBG', source, message, extra); }

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
                try { console.log('[[AutoPlugin]] BLOCKED', label, where, u); } catch (_) { }
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
                                try { if (xhr.onerror) xhr.onerror(new Error('Blocked by policy: ' + why)); } catch (_) { }
                                try { if (xhr.onreadystatechange) xhr.onreadystatechange(); } catch (_) { }
                                try { if (xhr.dispatchEvent) xhr.dispatchEvent(new Event('error')); } catch (_) { }
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
                    } catch (_) { }
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
                            try { if (Lampa.Settings && Lampa.Settings.update) Lampa.Settings.update(); } catch (_) { }
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

                    try { if (Lampa.Settings && Lampa.Settings.update) Lampa.Settings.update(); } catch (_) { }

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
                    var col = (ev && typeof ev.colno === 'number') ? ev.colno : '?';
                    var stack = (ev && ev.error && ev.error.stack) ? String(ev.error.stack).split('\n')[0] : '';
                    var src = currentPlugin || file;
                    showError(src, msg, String(file) + ':' + String(line) + ':' + String(col) + (stack ? (' | ' + stack) : ''));
                } catch (_) { }
            }

            function onUnhandledRejection(ev) {
                if (LOG_MODE === 0) return;
                try {
                    var reason = ev && ev.reason ? ev.reason : 'unhandled rejection';
                    var msg = fmtErr(reason);
                    var stack = (reason && reason.stack) ? String(reason.stack).split('\n')[0] : '';
                    showError(currentPlugin || 'Promise', msg, stack);
                } catch (_) { }
            }

            function attachGlobalHooks() {
                if (LOG_MODE === 0) return;
                window.addEventListener('error', onWinError, true);
                window.addEventListener('unhandledrejection', onUnhandledRejection);
            }

            function detachGlobalHooks() {
                // отписка после done (mode=1)
                try { window.removeEventListener('error', onWinError, true); } catch (_) { }
                try { window.removeEventListener('unhandledrejection', onUnhandledRejection); } catch (_) { }
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


        //=======================================================================-=============================================
    }

    BOOT();

})();
