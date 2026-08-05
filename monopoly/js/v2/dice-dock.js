/* ============================================================
   dice-dock.js (v2) — арена кубиков в центре панели.
   Использует существующие SceneManager/Dice (Three.js + Cannon).
   Если WebGL/библиотеки недоступны — быстрый 2D-фолбэк.
   Engine кидает событие 'dice'(a,b); мы возвращаем Promise,
   который резолвится после того, как кубики докатились.
   ============================================================ */
(function (global) {
    'use strict';

    let scene = null, dice = null, ready = false, el = null;

    function mount(container) {
        el = container;
        try {
            if (!global.THREE || !global.CANNON) throw new Error('no libs');
            /* контейнер обязан иметь размер в момент создания рендерера,
               поэтому показываем его на время монтирования */
            el.classList.add('show');
            scene = new global.SceneManager(container);
            dice = new global.Dice(scene);     // класс сам содержит оба кубика
            scene.start();
            ready = true;
            el.classList.remove('show');
        } catch (e) {
            console.warn('DiceDock: 3D недоступно, включаю 2D-фолбэк —', e.message);
            ready = false;
            el.classList.remove('show');
        }
    }

    function show(v) {
        if (!el) return;
        el.classList.toggle('show', !!v);
        if (v && scene && scene._onResize) scene._onResize();
    }

    /** roll(a, b) — обычный бросок двух кубиков.
        roll(a)     — одиночный бросок (казино): второй кубик прячем. */
    async function roll(a, b) {
        const single = (b == null);
        show(true);
        document.body.classList.add('rolling');
        /* звук отскоков идёт параллельно броску */
        if (global.SFX) global.SFX.dice(single ? 1 : 2);
        const second = single && ready && dice && dice.dieB ? dice.dieB : null;
        if (second && second.setVisible) second.setVisible(false);
        try {
            if (ready) await dice.rollTo(a, single ? 1 + Math.floor(Math.random() * 6) : b);
            else await roll2D(a, single ? null : b);
        } catch (e) {
            console.warn('DiceDock: rollTo error, 2D-фолбэк —', e.message);
            await roll2D(a, single ? null : b);
        }
        await sleep(650);            // пауза, чтобы увидеть результат
        if (second && second.setVisible) second.setVisible(true);
        document.body.classList.remove('rolling');
        show(false);
    }

    /* ---- 2D фолбэк: две «кости» с перебором граней ---- */
    const PIP = {
        1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8],
        5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
    };
    function face(v) {
        let s = '<div class="d2-face">';
        for (let i = 0; i < 9; i++) s += `<i class="${PIP[v].includes(i) ? 'pip' : ''}"></i>`;
        return s + '</div>';
    }
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    async function roll2D(a, b) {
        const single = (b == null);
        el.innerHTML = `<div class="d2"></div>`;
        const box = el.querySelector('.d2');
        const rnd6 = () => 1 + Math.floor(Math.random() * 6);
        const t0 = performance.now(), dur = 1300;
        while (performance.now() - t0 < dur) {
            box.innerHTML = single ? face(rnd6()) : face(rnd6()) + face(rnd6());
            await sleep(70 + (performance.now() - t0) / 8);
        }
        box.innerHTML = single ? face(a) : face(a) + face(b);
    }

    global.DiceDock = { mount, roll, show };
})(window);
