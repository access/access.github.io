(function () {
    'use strict';

    // список плагинов, которые надо подключить при старте
    const PLUGINS = [
        // удалённые
        "https://bwa.to/rc",
        "https://nb557.github.io/plugins/online_mod.js",
        "https://bwa.to/cloud.js",
        "https://skaztv.online/store.js",
        "https://bylampa.github.io/addon.js"
        "https://amiv1.github.io/lampa/rating.js",
        "https://amikdn.github.io/buttons.js",
        // или из твоего же GitHub Pages (лучше так)
        // './plugins/my-plugin.js',
    ];

    function load(url) {
        return new Promise((resolve) => {
            try {
                const s = document.createElement('script');
                s.src = url;
                s.async = true;
                s.onload = () => resolve({ url, ok: true });
                s.onerror = () => resolve({ url, ok: false });
                document.head.appendChild(s);
            } catch (e) {
                resolve({ url, ok: false, err: e });
            }
        });
    }

    async function start() {
        // ждать пока Lampa инициализируется, чтобы плагины не падали от отсутствия API
        const wait = (ms) => new Promise(r => setTimeout(r, ms));

        for (let i = 0; i < 120; i++) { // ~60 сек
            if (window.Lampa && window.Lampa.Listener) break;
            await wait(500);
        }

        for (const url of PLUGINS) {
            const r = await load(url);
            console.log('[AutoPlugin]', r.ok ? 'OK' : 'FAIL', r.url);
        }
    }

    start();
})();
