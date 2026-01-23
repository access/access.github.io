(function () {
  'use strict';

  // =========================
  // CONFIG
  // =========================
  const AUTH_KEY = 'msx_fake_auth_ok_v2';

  const PIPELINE = [
    { name: 'preload', src: 'mod.preload.js' },
    { name: 'autoplugin', src: 'mod.autoplugin.js' }
  ];

  const AUTH_JSON = 'mod.auth.json';

  // =========================
  // STORAGE (Lampa)
  // =========================
  function getAuthed() {
    try { return !!(window.Lampa && Lampa.Storage && Lampa.Storage.get(AUTH_KEY)); }
    catch (_) { return false; }
  }

  function setAuthed(v) {
    try { window.Lampa && Lampa.Storage && Lampa.Storage.set(AUTH_KEY, v ? 1 : 0); }
    catch (_) {}
  }

  // =========================
  // URL helpers
  // =========================
  function baseDir() {
    try {
      var s = document.currentScript && document.currentScript.src ? String(document.currentScript.src) : '';
      return s ? s.slice(0, s.lastIndexOf('/') + 1) : '';
    } catch (_) { return ''; }
  }
  var BASE = baseDir();

  function abs(u) {
    try { return String(new URL(String(u), BASE || location.href).href); }
    catch (_) { return String(u); }
  }

  // =========================
  // Pipeline loader
  // =========================
  function loadScriptSeq(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.async = false;
      s.onload = function () { resolve(true); };
      s.onerror = function () { reject(new Error('load fail: ' + url)); };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  function runPipeline() {
    var i = 0;
    function next() {
      if (i >= PIPELINE.length) return;
      var step = PIPELINE[i++];
      var url = abs(step.src);

      loadScriptSeq(url).then(function () {
        if (window.MSX_MOD && typeof window.MSX_MOD.step === 'function') {
          window.MSX_MOD.step(step.name, { base: BASE, src: url }, function () {
            setTimeout(next, 0);
          });
        } else setTimeout(next, 0);
      }).catch(function () {
        setTimeout(next, 0);
      });
    }
    next();
  }

  // =========================
  // AUTH LIST (JSON)
  // =========================
  var AUTH_LIST = [];

  function normalizeAuthJson(j) {
    if (!j) return [];
    if (Array.isArray(j)) {
      var out = [];
      for (var i = 0; i < j.length; i++) {
        if (j[i] && Array.isArray(j[i].auth)) out = out.concat(j[i].auth);
      }
      return out;
    }
    if (Array.isArray(j.auth)) return j.auth;
    return [];
  }

  function loadAuthList() {
    return fetch(abs(AUTH_JSON), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { AUTH_LIST = normalizeAuthJson(j); })
      .catch(function () { AUTH_LIST = []; });
  }

  function findAuthEntry(key, hash) {
    for (var i = 0; i < AUTH_LIST.length; i++) {
      var a = AUTH_LIST[i];
      if (a && String(a.key) === String(key) && String(a.hash) === String(hash)) {
        return a;
      }
    }
    return null;
  }

  // =========================
  // SHA-256 base64 (WebCrypto ONLY)
  // =========================
  function sha256Base64(str) {
    var enc = new TextEncoder().encode(str);
    return crypto.subtle.digest('SHA-256', enc).then(function (buf) {
      var bytes = new Uint8Array(buf);
      var bin = '';
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    });
  }

  // =========================
  // INTERNAL
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
  var ui = {
    wrap: null, inp: null,
    bEnter: null, bUnlock: null,
    err: null, sel: 0,
    hashBox: null, hashText: null, hashCopy: null
  };

  function blurInputHard() {
    if (!ui.inp) return;
    ui.inp.blur();
    ui.inp.setAttribute('readonly', 'readonly');
    setTimeout(function () {
      ui.inp && ui.inp.removeAttribute('readonly');
    }, 0);
  }

  function setSel(n) {
    ui.sel = n === 1 ? 1 : 0;
    var a = ui.bEnter, b = ui.bUnlock;
    if (!a || !b) return;
    a.style.outline = b.style.outline = 'none';
    a.style.background = b.style.background = 'transparent';
    var on = ui.sel === 0 ? a : b;
    on.style.outline = '2px solid rgba(255,255,255,.65)';
    on.style.background = 'rgba(255,255,255,.08)';
    if (ui.sel === 1) blurInputHard();
  }

  function showHashPair(key, hash) {
    var pair = '{"key":"' + key + '","hash":"' + hash + '"}';
    ui.hashText.textContent = pair;
    ui.hashBox.style.display = 'block';
    ui.hashCopy.onclick = function () {
      navigator.clipboard && navigator.clipboard.writeText(pair);
    };
  }

  function ensureOverlay() {
    if (document.getElementById('msx_fake_lock')) return;

    var wrap = document.createElement('div');
    wrap.id = 'msx_fake_lock';
    wrap.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center';

    wrap.innerHTML = `
      <div style="width:520px;padding:18px;border-radius:16px;border:1px solid rgba(255,255,255,.15);color:#fff">
        <div style="font-size:22px;margin-bottom:10px">Locked</div>
        <input id="pw" type="password" placeholder="password"
          style="width:100%;padding:12px;background:#111;border:1px solid #333;border-radius:12px;color:#fff">
        <div style="margin-top:12px;display:flex;gap:10px">
          <div id="enter">Enter</div>
          <div id="unlock">Unlock</div>
        </div>
        <div id="err" style="display:none;color:#ff6b6b;margin-top:10px">Wrong password</div>
        <div id="hash" style="display:none;margin-top:10px;font-size:12px;opacity:.65;word-break:break-all">
          <span id="hash_txt"></span>
          <span id="hash_cp" style="cursor:pointer;margin-left:6px">📋</span>
        </div>
      </div>`;

    document.body.appendChild(wrap);

    ui.wrap = wrap;
    ui.inp = wrap.querySelector('#pw');
    ui.bEnter = wrap.querySelector('#enter');
    ui.bUnlock = wrap.querySelector('#unlock');
    ui.err = wrap.querySelector('#err');
    ui.hashBox = wrap.querySelector('#hash');
    ui.hashText = wrap.querySelector('#hash_txt');
    ui.hashCopy = wrap.querySelector('#hash_cp');

    setSel(0);
    blurInputHard();

    ui.bEnter.onclick = focusInput;
    ui.bUnlock.onclick = submit;
    ui.inp.onkeydown = e => e.key === 'Enter' && submit();
  }

  function focusInput() {
    ui.err.style.display = 'none';
    setSel(0);
    ui.inp.focus();
  }

  function submit() {
    var v = String(ui.inp.value || '').trim();
    if (!v) return;

    blurInputHard();

    sha256Base64(v).then(function (hash) {
      // FIX: пара выводится ВСЕГДА
      showHashPair(AUTH_KEY, hash);

      if (findAuthEntry(AUTH_KEY, hash)) {
        setAuthed(true);
        detachKeyGuard();
        ui.wrap.remove();
        startMainOnce();
      } else {
        ui.err.style.display = 'block';
        ui.inp.value = '';
        setSel(0);
      }
    });
  }

  // =========================
  // KEY GUARD
  // =========================
  function keyGuardHandler(e) {
    if (!document.getElementById('msx_fake_lock')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
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
      if (!getAuthed() && !document.getElementById('msx_fake_lock')) {
        ensureOverlay();
      }
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

  loadAuthList().then(BOOT);
})();
