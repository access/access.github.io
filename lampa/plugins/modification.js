(function () {
  'use strict';

  // =========================
  // CONFIG
  // =========================
  const AUTH_KEY = 'msx_fake_auth_ok_v2';

  // base64(SHA-256("password"))
  const PASS_HASH_B64 = 'OYSLjH1s/Uduag74P/8sT8zqtogR8n8RLrNt/6dEL08=';

  // Пайплайн шагов (легко менять порядок/добавлять)
  // IMPORTANT: файлы лежат рядом с modification.js
  const PIPELINE = [
    { name: 'preload', src: 'mod.preload.js' },
    { name: 'autoplugin', src: 'mod.autoplugin.js' }
  ];

  // =========================
  // STORAGE (Lampa)
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
  // URL helpers
  // =========================
  function baseDir() {
    try {
      var s = document.currentScript && document.currentScript.src ? String(document.currentScript.src) : '';
      if (!s) return '';
      return s.slice(0, s.lastIndexOf('/') + 1);
    } catch (_) { return ''; }
  }
  var BASE = baseDir();
  function abs(u) {
    try { return String(new URL(String(u), BASE || location.href).href); }
    catch (_) { return String(u); }
  }

  function loadScriptSeq(url) {
    return new Promise(function (resolve, reject) {
      try {
        var s = document.createElement('script');
        s.src = url;
        s.async = false; // важно: порядок
        s.onload = function () { resolve(true); };
        s.onerror = function () { reject(new Error('load fail: ' + url)); };
        (document.head || document.documentElement).appendChild(s);
      } catch (e) {
        reject(e);
      }
    });
  }

  function runPipeline() {
    // модуль может экспортить:
    //  - window.MSX_MOD.step(name)  (опционально)
    //  - или просто выполнить свой start сам
    var i = 0;

    function next() {
      if (i >= PIPELINE.length) return;

      var step = PIPELINE[i++];
      var url = abs(step.src);

      loadScriptSeq(url).then(function () {
        try {
          if (window.MSX_MOD && typeof window.MSX_MOD.step === 'function') {
            window.MSX_MOD.step(step.name, { base: BASE, src: url }, function () {
              setTimeout(next, 0);
            });
            return;
          }
        } catch (_) { }
        setTimeout(next, 0);
      }).catch(function (e) {
        try { console.log('[MSX] pipeline error', step.name, e && e.message ? e.message : e); } catch (_) { }
        // не стопаем всё намертво: идём дальше
        setTimeout(next, 0);
      });
    }

    next();
  }

  // =========================
  // SHA-256 base64
  // =========================
  function btoaBytes(u8) {
    var s = '';
    for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
  }

  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
      else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
        var c2 = str.charCodeAt(++i);
        var cp = 0x10000 + (((c & 0x3FF) << 10) | (c2 & 0x3FF));
        out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
      } else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
    }
    return new Uint8Array(out);
  }

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
    runPipeline();
  }

  // =========================
  // UI
  // =========================
  var ui = { wrap: null, inp: null, bEnter: null, bUnlock: null, err: null, sel: 0 };

  function blurInputHard() {
    if (!ui.inp) return;
    try { ui.inp.blur(); } catch (_) { }
    try { ui.inp.setAttribute('readonly', 'readonly'); } catch (_) { }
    setTimeout(function () {
      try { ui.inp && ui.inp.removeAttribute('readonly'); } catch (_) { }
    }, 0);
  }

  function setSel(n) {
    ui.sel = (n === 1) ? 1 : 0;
    if (!ui.bEnter || !ui.bUnlock) return;

    var a = ui.bEnter, b = ui.bUnlock;
    a.style.outline = 'none'; a.style.background = 'transparent';
    b.style.outline = 'none'; b.style.background = 'transparent';

    var on = (ui.sel === 0) ? a : b;
    on.style.outline = '2px solid rgba(255,255,255,.65)';
    on.style.background = 'rgba(255,255,255,.08)';

    if (ui.sel === 1) blurInputHard();
  }

  function ensureOverlay() {
    if (document.getElementById('msx_fake_lock')) return;

    var wrap = document.createElement('div');
    wrap.id = 'msx_fake_lock';
    wrap.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'bottom:0',
      'z-index:2147483647',
      'background:rgba(0,0,0,.92)',
      'display:flex', 'align-items:center', 'justify-content:center',
      'padding:24px', 'box-sizing:border-box'
    ].join(';');

    var box = document.createElement('div');
    box.style.cssText = [
      'width:100%', 'max-width:520px',
      'border:1px solid rgba(255,255,255,.15)',
      'border-radius:16px',
      'padding:18px',
      'box-sizing:border-box',
      'color:#fff',
      'font:16px/1.35 sans-serif'
    ].join(';');

    box.innerHTML =
      '<div style="font-size:22px;margin-bottom:10px">Locked</div>' +
      '<div style="opacity:.8;margin-bottom:14px">Enter password</div>' +
      '<input id="msx_pw_inp" type="password" placeholder="password" autocomplete="off" autocapitalize="none" spellcheck="false" style="' +
      'width:100%;padding:12px 14px;background:#111;' +
      'border:1px solid rgba(255,255,255,.18);border-radius:12px;' +
      'color:#fff;outline:none;box-sizing:border-box;' +
      '"/>' +
      '<div style="margin-top:12px;display:flex;gap:10px">' +
      '<div id="msx_btn_enter" style="' +
      'flex:1;display:flex;align-items:center;justify-content:center;' +
      'padding:12px 14px;border:1px solid rgba(255,255,255,.22);' +
      'border-radius:12px;user-select:none;' +
      '">Enter</div>' +
      '<div id="msx_btn_unlock" style="' +
      'flex:1;display:flex;align-items:center;justify-content:center;' +
      'padding:12px 14px;border:1px solid rgba(255,255,255,.22);' +
      'border-radius:12px;user-select:none;' +
      '">Unlock</div>' +
      '</div>' +
      '<div id="msx_pw_err" style="margin-top:10px;opacity:.85;display:none;color:#ff6b6b">Wrong password</div>' +
      '<div style="margin-top:10px;opacity:.55;font-size:12px">TV: use arrows and OK</div>';

    wrap.appendChild(box);
    document.body.appendChild(wrap);

    ui.wrap = wrap;
    ui.inp = box.querySelector('#msx_pw_inp');
    ui.bEnter = box.querySelector('#msx_btn_enter');
    ui.bUnlock = box.querySelector('#msx_btn_unlock');
    ui.err = box.querySelector('#msx_pw_err');

    blurInputHard();
    setSel(0);

    ui.bEnter.addEventListener('click', function () { focusInput(); }, true);
    ui.bUnlock.addEventListener('click', function () { submit(); }, true);

    ui.inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || (e.keyCode || 0) === 13) submit();
    }, true);
  }

  function focusInput() {
    if (!ui.inp) return;
    try { ui.err && (ui.err.style.display = 'none'); } catch (_) { }
    setSel(0);
    try { ui.inp.focus(); } catch (_) { }
  }

  function submit() {
    if (!ui.inp) return;

    blurInputHard();

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
        blurInputHard();
      }
    });
  }

  // =========================
  // KEY GUARD
  // =========================
  function isNavKeyCode(k) {
    return (
      k === 38 || k === 40 || k === 37 || k === 39 ||
      k === 19 || k === 20 || k === 21 || k === 22 ||
      k === 13 || k === 23 ||
      k === 27 || k === 8 || k === 461 || k === 10009
    );
  }

  function keyGuardHandler(e) {
    if (!document.getElementById('msx_fake_lock')) return;

    var k = e.keyCode || 0;
    var t = e.target;

    var isInput = t && (t.id === 'msx_pw_inp' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

    if (isInput && !isNavKeyCode(k)) {
      e.stopImmediatePropagation();
      return;
    }

    e.preventDefault();
    e.stopImmediatePropagation();

    if (k === 37 || k === 21) { setSel(0); return; }
    if (k === 39 || k === 22) { setSel(1); return; }

    if (k === 38 || k === 19) { setSel(0); return; }
    if (k === 40 || k === 20) { setSel(1); return; }

    if (k === 13 || k === 23) {
      if (ui.sel === 0) focusInput();
      else submit();
      return;
    }

    return;
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
  // STABILITY
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
    if (getAuthed()) { startMainOnce(); return; }
    if (!document.body) { setTimeout(BOOT, 50); return; }

    attachKeyGuard();
    ensureOverlay();
    watchOverlay();
  }

  BOOT();
})();
