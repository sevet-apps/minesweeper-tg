/* Spark: слой оформления (стили — assets/ui/juicy.css).
   Только вид: таблетка «Играть», появление волной при переходе на
   вкладку, подсветка активной вкладки, анимированные эмодзи у заголовков,
   пьедестал и медали в топах, докрутка чисел. Анимации эмодзи (lottie) играют
   один раз при показе — постоянно не крутятся. «Упрощённая графика» их не
   запускает. Эмодзи качаются заранее, пока идёт заставка, поэтому на вкладках
   и в топах появляются сразу, без подгрузки. */
(function () {
    'use strict';
    if (window.SparkJuicy) return;
    const BASE = new URL('.', document.currentScript?.src || location.href).href;
    const VERSION = new URL(document.currentScript?.src || location.href).searchParams.get('v') || '';
    const REDUCED = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const lite = () => document.body.classList.contains('lite-mode');
    const calm = () => REDUCED || lite();
    const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.6v14.8c0 1 1.1 1.6 1.9 1.1l11.4-7.4c.8-.5.8-1.7 0-2.2L8.9 3.5C8.1 3 7 3.6 7 4.6z"/></svg>';
    const CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

    /* ---------- анимированные эмодзи ---------- */
    // Данные lottie держим в памяти: строка JSON на имя. Пока заставка идёт,
    // нужные сразу эмодзи уже скачаны — на вкладке они рисуются в тот же кадр.
    const DATA = new Map();      // имя → Promise<string>
    const READY = new Map();     // имя → string (уже скачано)
    function loadData(name) {
        if (!DATA.has(name)) {
            const url = `${BASE}emoji/${name}.json${VERSION ? `?v=${VERSION}` : ''}`;
            const p = fetch(url).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.text(); })
                .then(text => { READY.set(name, text); return text; });
            p.catch(() => DATA.delete(name));
            DATA.set(name, p);
        }
        return DATA.get(name);
    }
    function preload(names) { names.forEach(name => loadData(name).catch(() => {})); }

    const anims = new WeakMap();
    function startState(anim, still) {
        if (still != null) anim.goToAndStop(still, true);
        else if (calm()) anim.goToAndStop(anim.totalFrames - 1, true);
        else anim.goToAndPlay(0, true);
    }
    function build(box, name, text, loop, still) {
        if (anims.has(box)) return anims.get(box);
        let anim;
        try {
            anim = window.lottie.loadAnimation({
                container: box, renderer: 'svg', loop, autoplay: false,
                animationData: JSON.parse(text),
                rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
            });
        } catch (_) { return null; }
        anims.set(box, anim);
        anim.__still = still;
        if (anim.isLoaded) startState(anim, still);
        else anim.addEventListener('DOMLoaded', () => startState(anim, still));
        return anim;
    }
    /** still — номер кадра: эмодзи стоит картинкой, без анимации (корона на пьедестале). */
    function emoji(box, name, { loop = false, still = null } = {}) {
        if (!box || !window.lottie?.loadAnimation) return null;
        if (anims.has(box)) return anims.get(box);
        box.__jcName = name;
        if (READY.has(name)) return build(box, name, READY.get(name), loop, still);
        loadData(name).then(text => { if (box.__jcName === name) build(box, name, text, loop, still); }).catch(() => {});
        return null;
    }
    function replay(box) {
        const anim = anims.get(box);
        if (!anim || anim.__still != null || calm() || !anim.isLoaded) return;
        anim.goToAndPlay(0, true);
    }

    /* ---------- докрутка чисел ----------
       «12 340», «#3», «38.512 с», «1579» — число бежит от нуля до значения,
       приставки и подписи остаются на месте, формат тот же. */
    const NUM = /^(\D*?)(\d{1,3}(?:[\u202f\u00a0 ]\d{3})+|\d+)(?:([.,])(\d+))?(.*)$/s;
    function countUp(el, { duration = 750, delay = 0 } = {}) {
        if (!el || calm()) return;
        const text = el.textContent;
        if (!text || el.__jcCounting === text || /\d:\d/.test(text)) return;
        const m = text.match(NUM);
        if (!m) return;
        const [, prefix, whole, dot, frac = '', suffix] = m;
        const group = (whole.match(/[\u202f\u00a0 ]/) || [''])[0];
        const target = Number(whole.replace(/\D/g, '') + (frac ? `.${frac}` : ''));
        if (!Number.isFinite(target) || target === 0) return;
        const digits = frac.length;
        const fmt = v => {
            const [w, f] = v.toFixed(digits).split('.');
            return prefix + (group ? w.replace(/\B(?=(\d{3})+(?!\d))/g, group) : w) + (digits ? dot + f : '') + suffix;
        };
        el.__jcCounting = text;
        const t0 = performance.now() + delay;
        const ease = t => 1 - Math.pow(1 - t, 4);
        el.textContent = fmt(0);
        const frame = now => {
            if (el.__jcCounting !== text) return;          // значение сменилось — не мешаем
            const t = Math.max(0, Math.min(1, (now - t0) / duration));
            el.textContent = t < 1 ? fmt(target * ease(t)) : text;
            if (t < 1) requestAnimationFrame(frame);
            else el.__jcCounting = null;
        };
        requestAnimationFrame(frame);
    }
    function countUpIn(root, selector, opts = {}) {
        if (!root) return;
        [...root.querySelectorAll(selector)].forEach((el, i) => {
            if (el.getClientRects().length) countUp(el, { ...opts, delay: (opts.delay || 0) + Math.min(i, 10) * 35 });
        });
    }
    const PROFILE_NUMBERS = '[id^="rec-"], .record-detail-value, .profile-stat-value, .jc-num';

    /* ---------- разметка ---------- */
    const TITLE_EMOJI = { 'view-games': 'fire', 'view-leaderboard': 'crown', 'view-profile': 'star' };
    function decorate() {
        // главная: индексы для волны, таблетка «Играть»
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
        // эмодзи у заголовков разделов (у главной вместо него — огонёк серии, assets/ui/streak.js)
        for (const [id, name] of Object.entries(TITLE_EMOJI)) {
            const title = document.querySelector(`#${id} > .header .app-title`);
            if (!title || title.parentElement.querySelector('.jc-title-emoji, .st-fire')) continue;
            if (id === 'view-games' && window.SparkStreak) continue;
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
        if (!calm()) {
            screen.classList.remove('jc-enter');
            void screen.offsetWidth;
            screen.classList.add('jc-enter');
            clearTimeout(screen.__jcTimer);
            screen.__jcTimer = setTimeout(() => screen.classList.remove('jc-enter'), 1400);
        }
        const box = screen.querySelector(':scope > .header .jc-title-emoji');
        if (box) { if (anims.has(box)) replay(box); else emoji(box, box.dataset.emoji); }
        if (tab === 'profile') countUpIn(screen, PROFILE_NUMBERS, { delay: 120 });
        window.dispatchEvent(new CustomEvent('spark:tab', { detail: { tab } }));
    }

    /* ---------- подсветка вкладки: пружина без вылета за панель ----------
       Пилюля летит на пружине; если по инерции «перелетает» край панели,
       то не выходит за него, а сплющивается об стенку и отпружинивает. */
    const pill = { el: null, x: null, w: null, vx: 0, vw: 0, tx: 0, tw: 0, min: 0, max: 0, raf: 0, last: 0 };
    function drawPill() {
        const left = Math.max(pill.x, pill.min);
        const right = Math.min(pill.x + pill.w, pill.max);
        pill.el.style.transform = `translateX(${left.toFixed(2)}px)`;
        pill.el.style.width = `${Math.max(12, right - left).toFixed(2)}px`;
    }
    function stepPill(now) {
        const dt = Math.min(0.032, (now - pill.last) / 1000 || 0.016);
        pill.last = now;
        const K = 420, C = 27;                          // жёсткость и затухание: лёгкий перелёт
        pill.vx += (-K * (pill.x - pill.tx) - C * pill.vx) * dt;
        pill.x += pill.vx * dt;
        pill.vw += (-K * (pill.w - pill.tw) - C * pill.vw) * dt;
        pill.w += pill.vw * dt;
        drawPill();
        const done = Math.abs(pill.x - pill.tx) < 0.2 && Math.abs(pill.vx) < 4 && Math.abs(pill.w - pill.tw) < 0.2 && Math.abs(pill.vw) < 4;
        if (done) { pill.x = pill.tx; pill.w = pill.tw; pill.vx = pill.vw = 0; drawPill(); pill.raf = 0; return; }
        pill.raf = requestAnimationFrame(stepPill);
    }
    function movePill(item, { instant = false } = {}) {
        const bar = document.getElementById('tabBar');
        if (!bar || !item) return;
        if (!pill.el || !pill.el.isConnected) {
            pill.el = bar.querySelector('.jc-tab-pill') || document.createElement('i');
            pill.el.className = 'jc-tab-pill';
            pill.el.setAttribute('aria-hidden', 'true');
            if (!pill.el.isConnected) bar.prepend(pill.el);
            pill.x = null;
        }
        // тот же отступ, что сверху и снизу (7px): подсветка не прилипает к краю панели
        const inset = 7;
        pill.tx = item.offsetLeft + inset;
        pill.tw = item.offsetWidth - inset * 2;
        pill.min = inset;
        pill.max = bar.clientWidth - inset;
        if (instant || pill.x == null || calm() || !bar.clientWidth) {
            cancelAnimationFrame(pill.raf); pill.raf = 0;
            pill.x = pill.tx; pill.w = pill.tw; pill.vx = pill.vw = 0;
            drawPill();
        } else if (!pill.raf) {
            pill.last = performance.now();
            pill.raf = requestAnimationFrame(stepPill);
        }
        if (!instant) { item.classList.remove('jc-pop'); void item.offsetWidth; item.classList.add('jc-pop'); }
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
        const update = () => {
            queued = false;
            medals(list);
            podium(list);
            if (list.querySelector(':scope > .lb-item')) {
                countUpIn(list.previousElementSibling, '.jc-pod-val', { delay: 250 });
                countUpIn(list, ':scope > .lb-item:nth-child(-n+14) .lb-val', { delay: 120 });
            }
        };
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

    // Пока идёт заставка: эмодзи заголовков, медали, корона, галочка уведомлений.
    preload(['fire', 'crown', 'star', 'medal1', 'medal2', 'medal3', 'check']);

    function init() {
        decorate();
        // надпись «поверни телефон» — на языке приложения
        try { const hint = document.querySelector('#rotateHint b'); if (hint && currentLang && currentLang !== 'ru') hint.textContent = 'Rotate your phone to portrait'; } catch (_) {}   // eslint-disable-line no-undef
        hookTabs();
        watchLists();
        watchSheets();
        const active = document.querySelector('.tab-item.active');
        const tab = active?.dataset.tab || 'games';
        // эмодзи всех трёх разделов создаём сразу: при переходе они уже нарисованы
        document.querySelectorAll('.jc-title-emoji').forEach(box => {
            const screen = box.closest('.screen');
            if (screen && screen.id !== SCREEN[tab]) emoji(box, box.dataset.emoji);
        });
        requestAnimationFrame(() => {
            movePill(active, { instant: true });
            // Волна главной — в тот кадр, когда уходит заставка (под ней её никто не увидит)
            if (document.getElementById('appLoader') && !window.__sparkLoaderDone) {
                window.addEventListener('spark:loader-done', () => enter(tab), { once: true });
            } else enter(tab);
        });
        window.addEventListener('resize', () => movePill(document.querySelector('.tab-item.active'), { instant: true }));
    }
    window.SparkJuicy = { init, decorate, medals, emoji, podium, preload, countUp, countUpIn, replay, data: loadData };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
