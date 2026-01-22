(function () {
    'use strict';

    // список автоплагинов
    const PLUGINS = [
        "https://bwa.to/rc",
        "https://nb557.github.io/plugins/online_mod.js",
        "https://bwa.to/cloud.js",
        "https://skaztv.online/store.js",
        "https://bylampa.github.io/addon.js",
        "https://amiv1.github.io/lampa/rating.js",
        "https://amikdn.github.io/buttons.js"
    ];

    function load(url) {
        return new Promise((resolve) => {
            try {
                const s = document.createElement('script');
                s.src = url;
                s.async = true;
                s.onload = () => resolve(true);
                s.onerror = () => resolve(false);
                document.head.appendChild(s);
            } catch (e) {
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

    async function start() {
        await waitLampa();

        for (const url of PLUGINS) {
            const ok = await load(url);
            console.log('[AutoPlugin]', ok ? 'OK' : 'FAIL', url);
        }
    }

    start();
})();
