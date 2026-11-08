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
    /** still — номер кадра: эмодзи стоит картинкой, без анимации (корона на пьедестале). */
    function emoji(box, name, { loop = false, still = null } = {}) {
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
            anim.__still = still;
            anim.addEventListener('DOMLoaded', () => {
                if (still != null) anim.goToAndStop(still, true);
                else if (lite() || REDUCED) anim.goToAndStop(anim.totalFrames - 1, true);
                else anim.goToAndPlay(0, true);
            });
        }
        return anim;
    }
    function replay(box) {
        const anim = anims.get(box);
        if (!anim || anim.__still != null || lite() || REDUCED || !anim.isLoaded) return;
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
    /* ---------- пьедестал: первая тройка топа над списком ---------- */
    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const hue = text => [...String(text)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
    function podium(list) {
        const rows = [1, 2, 3].map(n => list.querySelector(`:scope > .lb-item.rank-${n}`));
        let box = list.previousElementSibling?.classList.contains('jc-podium') ? list.previousElementSibling : null;
        if (!rows[0]) { box?.remove(); list.classList.remove('jc-has-podium'); return; }
        if (!box) { box = document.createElement('div'); box.className = 'jc-podium'; list.before(box); }
        const place = (row, n) => {
            if (!row) return `<div class="jc-pod jc-pod-${n}" aria-hidden="true"></div>`;
            const img = row.querySelector('img.lb-avatar');
            const name = (row.querySelector('.lb-name')?.childNodes[0]?.textContent || row.querySelector('.lb-name')?.textContent || '').trim();
            const val = row.querySelector('.lb-val')?.textContent.trim() || '';
            const me = /accent/.test(row.style.border || '');
            const ava = img ? `<img src="${esc(img.src)}" alt="" referrerpolicy="no-referrer">` : `<span style="--h:${hue(name)}">${esc((name || '?').slice(0, 1).toUpperCase())}</span>`;
            return `<button type="button" class="jc-pod jc-pod-${n}${me ? ' is-me' : ''}" data-place="${n}">`
                + `<span class="jc-pod-ava">${ava}${n === 1 ? '<i class="jc-pod-crown" aria-hidden="true"></i>' : ''}</span>`
                + `<b class="jc-pod-name">${esc(name)}</b><small class="jc-pod-val">${esc(val)}</small>`
                + `<span class="jc-pod-bar"><em>${n}</em></span></button>`;
        };
        box.innerHTML = place(rows[1], 2) + place(rows[0], 1) + place(rows[2], 3);
        list.classList.add('jc-has-podium');
        emoji(box.querySelector('.jc-pod-crown'), 'crown', { still: 0 });   // кадр 0 — корона стоит ровно
        box.querySelectorAll('[data-place]').forEach(btn => { btn.onclick = () => rows[Number(btn.dataset.place) - 1]?.click(); });
    }
    function watchLists() {
        const list = document.getElementById('lbList');
        if (!list || list.__jcWatch) return;
        list.__jcWatch = true;
        let queued = false;
        const update = () => { queued = false; medals(list); podium(list); };
        new MutationObserver(() => {
            if (queued) return;
            queued = true;
            requestAnimationFrame(update);
        }).observe(list, { childList: true });
        update();
    }

    /* ---------- шторки игр: иконка и цвет игры ---------- */
    const SHEETS = { modalSaper: ['saper', 'minesweeper'], modalCheckers: ['checkers', 'checkers'], modalChess: ['chess', 'chess'], modalNardy: ['nardy', 'nardy'], modalSudoku: ['sudoku', 'sudoku'] };
    function decorateSheet(sheet) {
        const conf = SHEETS[sheet.id];
        const heading = sheet.querySelector('.ui-mode-panel > .ui-sheet-heading');
        if (!conf || !heading || heading.querySelector('.jc-sheet-icon')) return;
        sheet.classList.add('jc-sheet', `jc-g-${conf[0]}`);
        const icon = document.createElement('img');
        icon.className = 'jc-sheet-icon';
        icon.alt = '';
        icon.src = new URL(`../game-icons/${conf[1]}.png`, BASE).href;
        heading.prepend(icon);
    }
    function watchSheets() {
        Object.keys(SHEETS).forEach(id => {
            const sheet = document.getElementById(id);
            if (!sheet || sheet.__jcWatch) return;
            sheet.__jcWatch = true;
            decorateSheet(sheet);
            // шторка шахмат строится при первом открытии
            new MutationObserver(() => { if (sheet.classList.contains('visible')) decorateSheet(sheet); }).observe(sheet, { attributes: true, attributeFilter: ['class'] });
        });
    }

    function init() {
        decorate();
        hookTabs();
        watchLists();
        watchSheets();
        const active = document.querySelector('.tab-item.active');
        requestAnimationFrame(() => {
            movePill(active);
            active?.classList.remove('jc-pop');
            const tab = active?.dataset.tab || 'games';
            enter(tab);
        });
        window.addEventListener('resize', () => movePill(document.querySelector('.tab-item.active')));
    }
    window.SparkJuicy = { init, decorate, medals, emoji, podium };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
