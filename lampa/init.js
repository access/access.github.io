(function () {
  'use strict';

  var BASE = 'https://access.github.io/lampa/';
  var MANIFEST = 'manifest.json';

  function abs(p) {
    if (/^https?:\/\//i.test(p)) return p;
      return BASE + p.replace(/^\//, '');
  }

  function loadScript(url) {
    var s = document.createElement('script');
    s.src = url;
    s.async = true;
    document.head.appendChild(s);
  }

  function loadManifest() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', abs(MANIFEST), true);
    xhr.onload = function () {
      try {
        var m = JSON.parse(xhr.responseText);
        if (!m.scripts || !m.scripts.length) return;

        m.scripts.forEach(function (p) {
          loadScript(abs(p));
        });
      } catch (e) {}
    };
    xhr.send();
  }

  // 🔑 ЕДИНСТВЕННО ПРАВИЛЬНАЯ ТОЧКА ВХОДА
  Lampa.Listener.follow('full', function (e) {
    if (e.type !== 'complite') return;

    // один раз
    if (window.__access_installed) return;
    window.__access_installed = true;

    loadManifest();
  });

})();
