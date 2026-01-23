(function () {
    'use strict';

    // Экспортируем шаг пайплайна (чтобы modification.js мог вызвать последовательно)
    window.MSX_MOD = window.MSX_MOD || {};
    var prevStep = window.MSX_MOD.step;

    window.MSX_MOD.step = function (name, ctx, done) {
        // если это не наш шаг — пробрасываем дальше
        if (name !== 'preload') {
            if (typeof prevStep === 'function') return prevStep(name, ctx, done);
            return done && done();
        }

        var FLAG = 'msx_preload_applied_v1';
        var FALLBACK_KEY = 'msx_preload_json_v1';

        function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
        function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (_) { } }

        // уже применяли — пропускаем
        if (lsGet(FLAG) === '1') {
            try { console.log('[MSX][preload] skip (flag)'); } catch (_) { }
            return done && done();
        }

        // где лежит json
        var jsonUrl = '';
        try {
            var base = ctx && ctx.base ? String(ctx.base) : '';
            jsonUrl = String(new URL('modification-preload.json', base || location.href).href);
        } catch (_) {
            jsonUrl = 'modification-preload.json';
        }

        function applyJson(obj) {
            try {
                if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
                    // если вдруг корень не map — просто игнор/лог
                    try { console.log('[MSX][preload] root is not object map'); } catch (_) { }
                    return;
                }

                var keys = Object.keys(obj);
                for (var i = 0; i < keys.length; i++) {
                    var k = keys[i];
                    var v = obj[k];

                    if (typeof v === 'string') {
                        // важно: НЕ JSON.stringify, иначе получишь "\"false\"" вместо "false"
                        lsSet(k, v);
                    }
                    else if (v && typeof v === 'object') {
                        // массивы/объекты
                        lsSet(k, JSON.stringify(v));
                    }
                    else {
                        // number/boolean/null/undefined
                        lsSet(k, String(v));
                    }
                }

                lsSet(FLAG, '1');
                try { console.log('[MSX][preload] applied keys=' + keys.length); } catch (_) { }
            } catch (e) {
                try { console.log('[MSX][preload] apply error', e && e.message ? e.message : e); } catch (_) { }
            }
        }

        // грузим json
        try {
            if (window.fetch) {
                fetch(jsonUrl, { cache: 'no-cache' }).then(function (r) {
                    return r.json();
                }).then(function (obj) {
                    applyJson(obj);
                    done && done();
                }).catch(function (e) {
                    try { console.log('[MSX][preload] fetch error', e && e.message ? e.message : e); } catch (_) { }
                    done && done();
                });
            } else {
                // XHR fallback
                var xhr = new XMLHttpRequest();
                xhr.open('GET', jsonUrl, true);
                xhr.onreadystatechange = function () {
                    if (xhr.readyState !== 4) return;
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try { applyJson(JSON.parse(xhr.responseText || '{}')); } catch (_) { }
                    } else {
                        try { console.log('[MSX][preload] xhr status', xhr.status); } catch (_) { }
                    }
                    done && done();
                };
                xhr.send(null);
            }
        } catch (e2) {
            try { console.log('[MSX][preload] load error', e2 && e2.message ? e2.message : e2); } catch (_) { }
            done && done();
        }
    };
})();
