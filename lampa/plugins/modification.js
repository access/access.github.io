(function () {
    'use strict';

    // список автоплагинов
    const PLUGINS = [
        "http://skaz.tv/onlines.js",
        "http://skaz.tv/vcdn.js",
        "https://netfix.cc/netfix.js",
        "https://tsynik.github.io/lampa/e.js",
        "https://and7ey.github.io/lampa/stats.js",
        "https://and7ey.github.io/lampa/head_filter.js",
        "https://andreyurl54.github.io/diesel/tricks.js",

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
