/* Spark: слой оформления (стили — assets/ui/juicy.css).
   Только вид: таблетка «Играть», появление волной при переходе на
   вкладку, подсветка активной вкладки, анимированные эмодзи у заголовков и
   медали за 1–3 место в топах. Анимации эмодзи (lottie) играют один раз при
   показе — постоянно не крутятся. «Упрощённая графика» их не запускает. */
(function () {
    'use strict';
    if (window.SparkJuicy) return;
    const BASE = new URL('.', document.currentScript?.src || location.href).href;
    const VERSION = new URL(document.currentScript?.src || location.href).searchParams.get('v') || '';
    const REDUCED = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const lite = () => document.body.classList.contains('lite-mode');
    const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.6v14.8c0 1 1.1 1.6 1.9 1.1l11.4-7.4c.8-.5.8-1.7 0-2.2L8.9 3.5C8.1 3 7 3.6 7 4.6z"/></svg>';
    const CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

    /* ---------- анимированные эмодзи ---------- */
    const anims = new WeakMap();
    function emoji(box, name, { loop = false } = {}) {
        if (!box || !window.lottie?.loadAnimation) return null;
        let anim = anims.get(box);
        if (!anim) {
            try {
                anim = window.lottie.loadAnimation({
                    container: box, renderer: 'svg', loop, autoplay: false,
                    path: `${BASE}emoji/${name}.json${VERSION ? `?v=${VERSION}` : ''}`,
                    rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true },
                });
            } catch (_) { return null; }
            anims.set(box, anim);
            // без анимаций — сразу последний кадр, как картинка
            anim.addEventListener('DOMLoaded', () => { if (lite() || REDUCED) anim.goToAndStop(anim.totalFrames - 1, true); else anim.goToAndPlay(0, true); });
        }
        return anim;
    }
    function replay(box) {
        const anim = anims.get(box);
        if (!anim || lite() || REDUCED || !anim.isLoaded) return;
        anim.goToAndPlay(0, true);
    }

    /* ---------- разметка ---------- */
    const TITLE_EMOJI = { 'view-games': 'fire', 'view-leaderboard': 'crown', 'view-profile': 'star' };
    function decorate() {
        // главная: индексы для волны и бликов, таблетка «Играть», искорки у иконки
        document.querySelectorAll('#view-games > .game-card').forEach((card, i) => {
            card.style.setProperty('--i', String(i));
            const play = card.querySelector(':scope > [data-i18n="play"]');
            if (play && !play.classList.contains('jc-play')) {
                play.classList.add('jc-play');
                play.removeAttribute('style');
                // текст переводится через data-i18n, поэтому подпись — отдельным узлом
                const label = document.createElement('span');
                label.dataset.i18n = 'play';
                label.textContent = play.textContent.trim();
                play.removeAttribute('data-i18n');
                play.innerHTML = PLAY;
                play.appendChild(label);
            }
        });
        // топы: цвет игры по строке, круглая стрелка
        document.querySelectorAll('#view-leaderboard > .card').forEach((card, i) => {
            card.style.setProperty('--i', String(i));
            const game = (card.getAttribute('onclick') || '').match(/openLeaderboardDetail\('([a-z]+)'\)/)?.[1];
            if (!game || card.dataset.game) return;
            card.dataset.game = game;
            card.classList.add(`jc-g-${game}`);
            const chev = card.lastElementChild;
            if (chev && chev.querySelector('svg')) { chev.classList.add('jc-chev'); chev.removeAttribute('style'); chev.innerHTML = CHEV; }
        });
        // эмодзи у заголовков разделов
        for (const [id, name] of Object.entries(TITLE_EMOJI)) {
            const title = document.querySelector(`#${id} > .header .app-title`);
            if (!title || title.nextElementSibling?.classList.contains('jc-title-emoji')) continue;
            const box = document.createElement('span');
            box.className = 'jc-title-emoji';
            box.setAttribute('aria-hidden', 'true');
            title.after(box);
            box.dataset.emoji = name;
        }
    }

    /* ---------- переходы между вкладками ---------- */
    const SCREEN = { games: 'view-games', leaderboard: 'view-leaderboard', profile: 'view-profile' };
    function enter(tab) {
        const screen = document.getElementById(SCREEN[tab]);
        if (!screen) return;
        if (!lite() && !REDUCED) {
            screen.classList.remove('jc-enter');
            void screen.offsetWidth;
            screen.classList.add('jc-enter');
            clearTimeout(screen.__jcTimer);
            screen.__jcTimer = setTimeout(() => screen.classList.remove('jc-enter'), 1400);
        }
        const box = screen.querySelector(':scope > .header .jc-title-emoji');
        if (box) { if (anims.has(box)) replay(box); else emoji(box, box.dataset.emoji); }
    }
    function movePill(item) {
        const bar = document.getElementById('tabBar');
        if (!bar || !item) return;
        let pill = bar.querySelector('.jc-tab-pill');
        if (!pill) { pill = document.createElement('i'); pill.className = 'jc-tab-pill'; pill.setAttribute('aria-hidden', 'true'); bar.prepend(pill); }
        // тот же отступ, что сверху и снизу (7px): подсветка не прилипает к краю панели
        const inset = 7;
        pill.style.setProperty('--x', `${item.offsetLeft + inset}px`);
        pill.style.setProperty('--w', `${item.offsetWidth - inset * 2}px`);
        item.classList.remove('jc-pop'); void item.offsetWidth; item.classList.add('jc-pop');
    }
    function hookTabs() {
        if (typeof window.switchTab !== 'function' || window.switchTab.__jc) return;
        const original = window.switchTab;
        const wrapped = function (tab, el) {
            const result = original.apply(this, arguments);
            try { movePill(el || document.querySelector(`.tab-item[data-tab="${tab}"]`)); enter(tab); } catch (_) {}
            return result;
        };
        wrapped.__jc = true;
        window.switchTab = wrapped;
    }

    /* ---------- медали в топах: 1, 2, 3 место ---------- */
    function medals(root) {
        root.querySelectorAll('.lb-item.rank-1 .lb-rank-badge:not(.jc-medal), .lb-item.rank-2 .lb-rank-badge:not(.jc-medal), .lb-item.rank-3 .lb-rank-badge:not(.jc-medal)').forEach(badge => {
            const place = badge.closest('.lb-item').className.match(/rank-([123])\b/)?.[1];
            if (!place) return;
            badge.classList.add('jc-medal');
            badge.setAttribute('aria-label', place);
            emoji(badge, `medal${place}`);
        });
    }
    function watchLists() {
        const list = document.getElementById('lbList');
        if (!list || list.__jcWatch) return;
        list.__jcWatch = true;
        let queued = false;
        new MutationObserver(() => {
            if (queued) return;
            queued = true;
            requestAnimationFrame(() => { queued = false; medals(list); });
        }).observe(list, { childList: true });
        medals(list);
    }

    function init() {
        decorate();
        hookTabs();
        watchLists();
        const active = document.querySelector('.tab-item.active');
        requestAnimationFrame(() => {
            movePill(active);
            active?.classList.remove('jc-pop');
            const tab = active?.dataset.tab || 'games';
            enter(tab);
        });
        window.addEventListener('resize', () => movePill(document.querySelector('.tab-item.active')));
    }
    window.SparkJuicy = { init, decorate, medals, emoji };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
