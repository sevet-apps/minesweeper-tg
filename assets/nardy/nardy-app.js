/* Spark Nardy: длинные и короткие нарды — с ботом, вдвоём на одном телефоне
   и онлайн с рейтингом. Подключается лениво из index.html после
   nardy-core.js (правила) и nardy-i18n.js (тексты). */
(function () {
    'use strict';
    if (window.SparkNardy) return;

    const BASE = new URL('.', document.currentScript?.src || location.href).href;
    const VERSION = new URL(document.currentScript?.src || location.href).searchParams.get('v') || '';
    const V = VERSION ? `?v=${VERSION}` : '';
    const core = window.SparkNardyCore;
    const I18N = window.SparkNardyI18n;
    const SAVE_KEY = 'nardy_saved_game';
    const SETTINGS_KEY = 'nardy_settings';
    const PREFS_KEY = 'nardy_prefs';
    const STATS_KEY = 'nardy_stats';
    const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    /* ---------- окружение приложения ---------- */
    const tg = window.Telegram?.WebApp;
    const lang = () => (typeof currentLang === 'string' ? currentLang : 'ru');
    const tr = (key, vars) => I18N.t(lang(), key, vars);
    const esc = value => String(value == null ? '' : value).replace(/[&<>"'`]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[ch]));
    const me = () => tg?.initDataUnsafe?.user || null;
    const myName = () => (typeof tgName === 'function' ? tgName(me()) : (me()?.first_name || tr('you')));
    const FLAG_LANGS = ['ru', 'en', 'zh', 'es', 'pt', 'id', 'fr', 'ja', 'de', 'ko', 'tr', 'vi'];
    const flagHtml = code => (FLAG_LANGS.includes(code) ? `<i class="nd-flag" style="background-image:url('${BASE}../flags/${code}.svg?v=20261022')"></i>` : '');
    const sleep = ms => new Promise(resolve => setTimeout(resolve, REDUCED_MOTION ? Math.min(ms, 60) : ms));
    const readJson = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v ?? fallback; } catch (_) { return fallback; } };
    const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} };
    const other = core.other;
    /** Конец анимации, но не дольше ms: остановленная анимация не должна держать партию. */
    const settled = (anim, ms) => Promise.race([anim.finished.catch(() => {}), new Promise(resolve => setTimeout(resolve, ms))]);
    const secureRandom = () => {
        try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; } catch (_) { return Math.random(); }
    };

    function haptic(kind) {
        if (typeof vibrationEnabled !== 'undefined' && !vibrationEnabled) return;
        const h = tg?.HapticFeedback;
        if (!h) return;
        try {
            if (kind === 'select') h.selectionChanged();
            else if (kind === 'success' || kind === 'error' || kind === 'warning') h.notificationOccurred(kind);
            else h.impactOccurred(kind);
        } catch (_) {}
    }
    function toast(message, type = 'success') {
        if (typeof showToast === 'function') showToast(message, type);
    }
    function playtime(action) {
        try {
            if (action === 'begin' && typeof beginGamePlaytime === 'function') beginGamePlaytime('nardy');
            if (action === 'stop' && typeof stopGamePlaytime === 'function') stopGamePlaytime('nardy');
            if (action === 'note' && typeof noteGamePlaytimeAction === 'function') noteGamePlaytimeAction('nardy');
        } catch (_) {}
    }

    const ICON = {
        back: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
        gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
        undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
        flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
        check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
        dice: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/></svg>',
        trophy: '<svg viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>',
        broken: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10z"/><path d="M12 8.5 10.5 12l3 1.5L12 16"/></svg>',
        abort: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>',
        plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
        rematch: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 13.66-5.66L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.66 5.66L4 15.5M4 20v-4.5h4.5"/></svg>',
        search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
        add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
        key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.7-8.7M16 7l2.5 2.5M14 9l2 2"/></svg>',
        arrow: '<svg class="ck-hero-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
        chevron: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
        refresh: '<span class="refresh-glyph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.24 10.19A7 7 0 0 1 17.36 7.50M18.76 13.81A7 7 0 0 1 6.64 16.50"/><path d="M19.03 9.49L19.28 5.89L15.45 9.11ZM4.97 14.51L4.72 18.11L8.55 14.89Z" fill="currentColor" stroke-width=".6"/></svg></span>',
        send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
        device: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="13" height="10" rx="2"/><rect x="15" y="9" width="6" height="11" rx="1.6"/><path d="M7 18h5"/></svg>',
    };

    /* ---------- настройки и скины ---------- */
    const settings = Object.assign({ sound: true, autoRoll: false, oneTap: true, autoDone: false, flipLocal: false, skin: 'classic' }, readJson(SETTINGS_KEY, {}));
    const prefs = Object.assign({ tab: 'bot', variant: 'long', level: 2 }, readJson(PREFS_KEY, {}));
    if (!core.VARIANTS.includes(prefs.variant)) prefs.variant = 'long';
    const saveSettings = () => writeJson(SETTINGS_KEY, settings);
    const savePrefs = () => writeJson(PREFS_KEY, prefs);
    /** Доски — картинки целиком (scripts/build-nardy-skins.py), шашки — PNG с фактурой. */
    const SKINS = Object.freeze([
        { id: 'classic', checkers: ['ivory', 'espresso'], slab: ['#efe4cc', '#3a2314'] },
        { id: 'river', checkers: ['pearl', 'lagoon'], slab: ['#eef6f5', '#0a5a6e'] },
        { id: 'malachite', checkers: ['gold', 'onyx'], slab: ['#e0b85a', '#101614'] },
        { id: 'obsidian', checkers: ['silver', 'amethyst'], slab: ['#dfe3ea', '#5a3596'] },
        { id: 'marble', checkers: ['white-marble', 'black-marble'], slab: ['#f2f0ec', '#1b1a18'] },
    ].map(Object.freeze));
    const skinOf = () => SKINS.find(s => s.id === settings.skin) || SKINS[0];
    function applySkin() {
        if (!screen) return;
        const skin = skinOf();
        screen.dataset.skin = skin.id;
        screen.style.setProperty('--nd-board', `url('${BASE}skins/${skin.id}.jpg${V}')`);
        screen.style.setProperty('--nd-ck-w', `url('${BASE}skins/checker-${skin.checkers[0]}.png${V}')`);
        screen.style.setProperty('--nd-ck-b', `url('${BASE}skins/checker-${skin.checkers[1]}.png${V}')`);
        screen.style.setProperty('--nd-slab-w', skin.slab[0]);
        screen.style.setProperty('--nd-slab-b', skin.slab[1]);
    }

    /* ---------- звук: стук шашек из шахмат, кости — синтез ---------- */
    const Sound = {
        ctx: null, buffers: {}, loading: null,
        names: ['move', 'move2', 'capture', 'start', 'win', 'lose', 'notify'],
        unlock() {
            try {
                const Ctx = window.AudioContext || window.webkitAudioContext;
                if (!Ctx) return;
                if (!this.ctx) this.ctx = new Ctx();
                if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
                this.load();
            } catch (_) {}
        },
        load() {
            if (this.loading || !this.ctx) return this.loading;
            this.loading = Promise.all(this.names.map(name => fetch(`${BASE}../chess/sounds/${name}.mp3`)
                .then(r => r.arrayBuffer())
                .then(data => new Promise((resolve, reject) => this.ctx.decodeAudioData(data, resolve, reject)))
                .then(buffer => { this.buffers[name] = buffer; })
                .catch(() => {})));
            return this.loading;
        },
        play(name, volume = 1, rate = 1) {
            if (!settings.sound || !this.ctx || !this.buffers[name]) return;
            try {
                const source = this.ctx.createBufferSource();
                const gain = this.ctx.createGain();
                source.buffer = this.buffers[name];
                source.playbackRate.value = rate * (name.startsWith('move') ? 0.94 + Math.random() * 0.1 : 1);
                gain.gain.value = volume;
                source.connect(gain).connect(this.ctx.destination);
                source.start();
            } catch (_) {}
        },
        /** Кости катятся по доске: короткие щелчки шума всё реже и тише. */
        dice(count = 2) {
            if (!settings.sound || !this.ctx) return;
            try {
                const ctx = this.ctx;
                let at = ctx.currentTime + 0.02;
                const hits = 6 + Math.floor(Math.random() * 3);
                for (let i = 0; i < hits * Math.min(2, count); i++) {
                    const len = 0.03;
                    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
                    const data = buffer.getChannelData(0);
                    for (let j = 0; j < data.length; j++) data[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / data.length, 3);
                    const src = ctx.createBufferSource();
                    src.buffer = buffer;
                    const filter = ctx.createBiquadFilter();
                    filter.type = 'bandpass';
                    filter.frequency.value = 1800 + Math.random() * 2400;
                    filter.Q.value = 3;
                    const gain = ctx.createGain();
                    gain.gain.value = 0.55 * (1 - i / (hits * 2)) + 0.08;
                    src.connect(filter).connect(gain).connect(ctx.destination);
                    src.start(at);
                    at += 0.035 + Math.random() * 0.05 + i * 0.006;
                }
            } catch (_) {}
        },
    };

    /* ---------- геометрия доски (в ширинах пункта; как в build-nardy-skins.py) ---------- */
    const G = Object.freeze({ FRAME: 0.32, BAR: 0.8, TRAY: 1.05, LEN: 4.9, MID: 1.3, W: 14.81, H: 11.74, D: 0.94 });
    const BAR_X = G.FRAME + 6 + G.BAR / 2;
    const TRAY_X = G.FRAME + 12 + G.BAR + G.FRAME + G.TRAY / 2;
    const FIELD_RIGHT = G.FRAME + 12 + G.BAR;

    /* ---------- DOM ---------- */
    let screen = null, sheetEl = null, waitEl = null, refs = {};
    let game = null;
    let ready = null;
    let unit = 24;                 // px на ширину пункта
    const view = { checkers: [], slots: null };
    const ui = { sel: null, targets: [], drag: null, dialog: null, busy: false };

    function buildScreen() {
        screen = document.getElementById('nardy-screen');
        screen.innerHTML = `
            <div class="game-overlay-bg" id="bgPatternNardy"></div>
            <div class="game-top-bar">
                <div class="back-btn" data-act="back">${ICON.back}<span data-t="menu"></span></div>
                <div class="nd-title"><b data-ref="title"></b><small data-ref="status"></small></div>
                <div class="nd-top-actions"><button class="nd-icon-btn" type="button" data-act="settings" aria-label="">${ICON.gear}</button></div>
            </div>
            <div class="nd-main" data-ref="main">
                <div class="nd-player" data-ref="topPlayer"></div>
                <div class="nd-board-wrap" data-ref="wrap">
                    <div class="nd-board" data-ref="board">
                        <div class="nd-layer nd-hl" data-ref="hl"></div>
                        <div class="nd-layer nd-checkers" data-ref="checkers"></div>
                        <div class="nd-layer nd-dice" data-ref="dice"></div>
                        <div class="nd-layer nd-targets" data-ref="targets"></div>
                        <div class="nd-board-note" data-ref="note"></div>
                    </div>
                </div>
                <div class="nd-player is-me" data-ref="bottomPlayer"></div>
                <div class="nd-controls" data-ref="controls"></div>
            </div>
            <div class="nd-banner" data-ref="banner"><p></p></div>
            <div class="nd-sheet-scrim" data-ref="scrim"></div>
            <div class="nd-sheet" data-ref="sheet" role="dialog" aria-modal="true"></div>`;
        refs = {};
        screen.querySelectorAll('[data-ref]').forEach(el => { refs[el.dataset.ref] = el; });
        screen.addEventListener('click', onScreenClick);
        refs.scrim.addEventListener('click', () => { if (ui.dialog?.dismissable !== false) closeDialog(); });
        bindBoard();
        window.addEventListener('resize', () => { if (screen.classList.contains('visible')) layout(); });
        if (typeof updateBackgroundPatterns === 'function') updateBackgroundPatterns();
        applyTexts(screen);
        applySkin();
        // 30 шашек живут всю партию: двигаются, а не пересоздаются
        refs.checkers.innerHTML = '';
        view.checkers = [];
        for (const color of ['w', 'b']) {
            for (let i = 0; i < core.CHECKERS; i++) {
                const el = document.createElement('div');
                el.className = `nd-ck nd-${color}`;
                el.innerHTML = '<i></i>';
                refs.checkers.appendChild(el);
                view.checkers.push({ el, color, id: `${color}${i}`, x: 0, y: 0, off: false });
            }
        }
    }
    function applyTexts(root) {
        root.querySelectorAll('[data-t]').forEach(el => { el.textContent = tr(el.dataset.t); });
    }

    /** Размер доски: вся ширина, но так, чтобы поместились игроки и кнопки. */
    function layout() {
        if (!refs.main) return;
        const main = refs.main;
        const style = getComputedStyle(main);
        const width = main.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const others = refs.topPlayer.offsetHeight + refs.bottomPlayer.offsetHeight + refs.controls.offsetHeight + (parseFloat(style.rowGap) || 10) * 3;
        const height = main.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - others;
        const byWidth = Math.min(width, 860) / G.W;
        const byHeight = height / G.H;
        unit = Math.max(16, Math.floor(Math.min(byWidth, byHeight) * 10) / 10);
        screen.style.setProperty('--nd-u', `${unit}px`);
        screen.style.setProperty('--nd-bw', `${(unit * G.W).toFixed(1)}px`);
        screen.style.setProperty('--nd-bh', `${(unit * G.H).toFixed(1)}px`);
        if (game) { placeAll(false); renderDice(false); renderTargets(); }
    }

    /* ---------- координаты ---------- */
    /** Чьими глазами смотрим: свой дом внизу справа. */
    function viewColor() {
        if (!game) return 'w';
        if (game.mode === 'local') return settings.flipLocal && game.turnColor ? game.turnColor : 'w';
        return game.myColor || 'w';
    }
    const relOf = idx => core.ownPoint(game.variant, viewColor(), idx);
    const idxOfRel = r => core.absIndex(game.variant, viewColor(), r);
    /** Центр k-й шашки из n на пункте (относительный номер r для зрителя). */
    function pointXY(r, k, n) {
        const bottom = r <= 12;
        const c = bottom ? 12 - r : r - 13;
        const x = G.FRAME + (c < 6 ? c : c + G.BAR) + 0.5;
        const step = n <= 5 ? G.D : (G.LEN - G.D) / (n - 1);
        const off = G.D / 2 + k * step;
        return { x, y: bottom ? G.H - G.FRAME - off : G.FRAME + off };
    }
    function barXY(mine, k) {
        const y = G.H / 2 + (mine ? 1 : -1) * (0.62 + k * 0.62);
        return { x: BAR_X, y };
    }
    function offXY(mine, k) {
        const y = mine ? G.H - G.FRAME - 0.2 - k * 0.33 : G.FRAME + 0.2 + k * 0.33;
        return { x: TRAY_X, y };
    }

    /* ---------- шашки на доске ----------
       slots: pts[24] — массивы шашек снизу вверх, bar.w/b, off.w/b. Ход
       двигает верхнюю шашку из одной стопки в другую, остальные доезжают сами. */
    function rebuildSlots(state) {
        const pool = { w: view.checkers.filter(c => c.color === 'w'), b: view.checkers.filter(c => c.color === 'b') };
        const slots = { pts: Array.from({ length: 24 }, () => []), bar: { w: [], b: [] }, off: { w: [], b: [] } };
        for (let i = 0; i < 24; i++) {
            const v = state.pts[i];
            const color = v > 0 ? 'w' : 'b';
            for (let k = 0; k < Math.abs(v); k++) slots.pts[i].push(pool[color].shift());
        }
        for (const c of ['w', 'b']) {
            for (let k = 0; k < state.bar[c]; k++) slots.bar[c].push(pool[c].shift());
            for (let k = 0; k < state.off[c]; k++) slots.off[c].push(pool[c].shift());
        }
        view.slots = slots;
    }
    function slotXY(checker) {
        const s = view.slots;
        const mineColor = viewColor();
        for (let i = 0; i < 24; i++) {
            const k = s.pts[i].indexOf(checker);
            if (k >= 0) return { ...pointXY(relOf(i), k, s.pts[i].length), off: false, z: 10 + k };
        }
        for (const c of ['w', 'b']) {
            let k = s.bar[c].indexOf(checker);
            if (k >= 0) return { ...barXY(c === mineColor, k), off: false, z: 40 + k };
            k = s.off[c].indexOf(checker);
            if (k >= 0) return { ...offXY(c === mineColor, k), off: true, z: 5 + k };
        }
        return { x: -5, y: -5, off: false, z: 0 };
    }
    function placeChecker(checker, pos, animate) {
        checker.x = pos.x;
        checker.y = pos.y;
        const el = checker.el;
        el.classList.toggle('is-off', pos.off);
        el.style.zIndex = String(pos.z);
        el.style.transition = animate && !REDUCED_MOTION ? '' : 'none';
        el.style.transform = `translate3d(${(pos.x * unit).toFixed(1)}px, ${(pos.y * unit).toFixed(1)}px, 0)`;
    }
    function placeAll(animate = true, except = null) {
        if (!view.slots) return;
        for (const ck of view.checkers) if (ck !== except) placeChecker(ck, slotXY(ck), animate);
        markCounts();
    }
    /** На высокой стопке (больше пяти) — число шашек на верхней. */
    function markCounts() {
        for (const stack of view.slots.pts) {
            stack.forEach((ck, k) => { if (k < stack.length - 1 || stack.length <= 5) ck.el.removeAttribute('data-count'); });
            if (stack.length > 5) stack[stack.length - 1].el.dataset.count = String(stack.length);
        }
        for (const c of ['w', 'b']) for (const ck of [...view.slots.bar[c], ...view.slots.off[c]]) ck.el.removeAttribute('data-count');
    }
    function syncBoard(state) {
        rebuildSlots(state);
        placeAll(false);
    }

    /** Полёт шашки по дуге: подъём, перелёт, мягкая посадка. */
    function fly(checker, from, to, { hit = false } = {}) {
        const el = checker.el;
        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        const duration = REDUCED_MOTION ? 0 : Math.min(560, 230 + dist * 24);
        el.style.transition = 'none';
        el.style.zIndex = '90';
        el.classList.toggle('is-off', !!to.off);
        const a = `translate3d(${(from.x * unit).toFixed(1)}px, ${(from.y * unit).toFixed(1)}px, 0)`;
        const b = `translate3d(${(to.x * unit).toFixed(1)}px, ${(to.y * unit).toFixed(1)}px, 0)`;
        const lift = Math.min(0.9, 0.25 + dist * 0.05);
        const mid = `translate3d(${(((from.x + to.x) / 2) * unit).toFixed(1)}px, ${(((from.y + to.y) / 2 - lift) * unit).toFixed(1)}px, 0)`;
        el.style.transform = b;
        checker.x = to.x;
        checker.y = to.y;
        if (!duration) return Promise.resolve();
        el.classList.add('is-flying');
        const anim = el.animate([{ transform: a }, { transform: mid, offset: 0.5 }, { transform: b }], { duration, easing: 'cubic-bezier(.3,.1,.25,1)' });
        return settled(anim, duration + 250).then(() => {
            el.classList.remove('is-flying');
            el.style.zIndex = String(to.z);
            if (hit) Sound.play('capture', 0.9);
        });
    }

    /** Анимация шага step игрока color (в его координатах). */
    async function animateStep(color, step, { from: dragFrom = null } = {}) {
        const s = view.slots;
        const v = game.variant;
        const fromStack = step.from === 25 ? s.bar[color] : s.pts[core.absIndex(v, color, step.from)];
        const checker = fromStack.pop();
        if (!checker) { syncBoard(game.shown); return; }
        const start = dragFrom || { x: checker.x, y: checker.y };
        let blot = null;
        if (step.to === 0) s.off[color].push(checker);
        else {
            const stack = s.pts[core.absIndex(v, color, step.to)];
            if (stack.length === 1 && stack[0].color !== color) {
                blot = stack.pop();
                s.bar[other(color)].push(blot);
            }
            stack.push(checker);
        }
        placeAll(true, checker);
        const target = slotXY(checker);
        haptic('light');
        await fly(checker, start, target);
        markCounts();
        Sound.play(step.to === 0 ? 'move2' : 'move', step.to === 0 ? 0.7 : 0.95);
        if (blot) { Sound.play('capture', 0.9); haptic('medium'); placeChecker(blot, slotXY(blot), true); }
    }
    /** Обратно (отмена шага): шашка возвращается, сбитая — тоже. */
    async function animateUndo(color, step) {
        const s = view.slots;
        const v = game.variant;
        const toStack = step.to === 0 ? s.off[color] : s.pts[core.absIndex(v, color, step.to)];
        const checker = toStack.pop();
        if (!checker) return;
        const start = { x: checker.x, y: checker.y };
        if (step.from === 25) s.bar[color].push(checker); else s.pts[core.absIndex(v, color, step.from)].push(checker);
        if (step.hit) {
            const blot = s.bar[other(color)].pop();
            if (blot) toStack.push(blot);
        }
        placeAll(true, checker);
        await fly(checker, start, slotXY(checker));
        markCounts();
        Sound.play('move', 0.6);
    }

    /* ---------- кости ---------- */
    const PIPS = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
    const FACE_ROT = { 1: 'rotateX(0deg) rotateY(0deg)', 6: 'rotateY(180deg)', 3: 'rotateY(-90deg)', 4: 'rotateY(90deg)', 5: 'rotateX(-90deg)', 2: 'rotateX(90deg)' };
    const faceHtml = (n, cls) => `<span class="nd-face ${cls}">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => `<i${PIPS[n].includes(i) ? ' class="on"' : ''}></i>`).join('')}</span>`;
    const dieHtml = value => `<div class="nd-die" data-v="${value}"><div class="nd-cube" style="transform:${FACE_ROT[value]}">${faceHtml(1, 'f1')}${faceHtml(6, 'f6')}${faceHtml(3, 'f3')}${faceHtml(4, 'f4')}${faceHtml(5, 'f5')}${faceHtml(2, 'f2')}</div></div>`;
    /** Кости лежат посередине поля: у того, кто бросал, — справа (свои) или слева. */
    function diceSpot(color, count, index) {
        const mine = color === viewColor();
        const cx = mine ? G.FRAME + 6 + G.BAR + 3 : G.FRAME + 3;
        const gap = count > 2 ? 0.95 : 1.25;
        return { x: cx + (index - (count - 1) / 2) * gap, y: G.H / 2 };
    }
    function renderDice(animate = false) {
        const box = refs.dice;
        if (!box) return;
        const d = game?.dice;
        if (!d) { box.innerHTML = ''; return; }
        const values = d.roll[0] === d.roll[1] ? [d.roll[0], d.roll[0], d.roll[0], d.roll[0]] : [...d.roll];
        const left = d.left ? [...d.left] : values.slice();
        const usedFlags = values.map(v => { const i = left.indexOf(v); if (i >= 0) { left.splice(i, 1); return false; } return true; });
        if (box.dataset.key !== `${d.key}|${values.length}` || animate) {
            box.dataset.key = `${d.key}|${values.length}`;
            box.innerHTML = values.map(dieHtml).join('');
        }
        [...box.children].forEach((el, i) => {
            const spot = diceSpot(d.color, values.length, i);
            el.style.setProperty('--x', `${(spot.x * unit).toFixed(1)}px`);
            el.style.setProperty('--y', `${(spot.y * unit).toFixed(1)}px`);
            el.classList.toggle('is-small', values.length > 2);
            el.classList.toggle('is-used', !!usedFlags[i]);
            el.classList.toggle('is-black', d.color === 'b');
        });
    }
    /** Бросок: кубики вылетают с края и кувыркаются до выпавших граней. */
    async function showRoll(color, roll, key) {
        game.dice = { color, roll, left: null, key };
        renderDice(true);
        Sound.unlock();
        Sound.dice(2);
        haptic('light');
        if (REDUCED_MOTION) return;
        const mine = color === viewColor();
        const anims = [...refs.dice.children].map((el, i) => {
            const cube = el.firstElementChild;
            const v = Number(el.dataset.v);
            const spins = `rotateX(${720 + Math.round(secureRandom() * 360)}deg) rotateY(${540 + Math.round(secureRandom() * 360)}deg) rotateZ(${Math.round(secureRandom() * 180)}deg)`;
            cube.animate([{ transform: spins }, { transform: FACE_ROT[v] }], { duration: 760 + i * 70, easing: 'cubic-bezier(.2,.75,.25,1)' });
            const dx = (mine ? 1 : -1) * (2.6 + i * 0.4) * unit;
            const move = el.animate([
                { translate: `${dx}px ${(i % 2 ? -1.1 : 1.1) * unit}px`, opacity: 0 },
                { translate: `${dx * 0.25}px ${(i % 2 ? 0.25 : -0.3) * unit}px`, opacity: 1, offset: 0.55 },
                { translate: '0 0', opacity: 1 },
            ], { duration: 760 + i * 70, easing: 'cubic-bezier(.2,.75,.25,1)' });
            return settled(move, 760 + i * 70 + 250);
        });
        await Promise.all(anims);
    }
    function updateDiceLeft() {
        if (!game?.dice) return;
        game.dice.left = game.turn ? [...game.turn.dice] : [];
        renderDice(false);
    }

    /* ---------- подсветка: что можно двигать и куда ---------- */
    const mover = () => game?.turn?.color || null;
    const humanTurn = () => !!game && !game.over && !!game.turn && !ui.busy && game.phase === 'move' && controls(game.turn.color);
    function controls(color) {
        if (!game) return false;
        if (game.mode === 'local') return true;
        return color === game.myColor;
    }
    /** Цели для шашки с пункта from: одиночные шаги и цепочки одной шашкой. */
    function targetsFrom(from) {
        const out = new Map();
        const walk = (turn, at, path) => {
            for (const step of core.legalSteps(turn)) {
                if (step.from !== at) continue;
                const next = core.playStep(turn, step);
                const chain = [...path, step];
                if (!out.has(step.to) || out.get(step.to).length > chain.length) out.set(step.to, chain);
                if (step.to !== 0 && next && !core.turnDone(next)) walk(next, step.to, chain);
            }
        };
        walk(game.turn, from, []);
        return [...out.entries()].map(([to, path]) => ({ to, path }));
    }
    function movableSources() {
        if (!humanTurn()) return [];
        return [...new Set(core.legalSteps(game.turn).map(s => s.from))];
    }
    function renderTargets() {
        const box = refs.targets;
        if (!box || !game) return;
        const parts = [];
        const color = mover();
        if (humanTurn()) {
            const s = view.slots;
            for (const from of movableSources()) {
                const stack = from === 25 ? s.bar[color] : s.pts[core.absIndex(game.variant, color, from)];
                const top = stack[stack.length - 1];
                if (!top) continue;
                parts.push(`<i class="nd-src${ui.sel === from ? ' is-sel' : ''}" style="transform:translate3d(${(top.x * unit).toFixed(1)}px,${(top.y * unit).toFixed(1)}px,0)"></i>`);
            }
            for (const t of ui.targets) {
                if (t.to === 0) {
                    const mine = color === viewColor();
                    parts.push(`<i class="nd-tgt-off${mine ? '' : ' is-top'}" data-to="0" style="--x:${(TRAY_X * unit).toFixed(1)}px"></i>`);
                    continue;
                }
                const idx = core.absIndex(game.variant, color, t.to);
                const n = view.slots.pts[idx].length;
                const pos = pointXY(relOf(idx), n, n + 1);
                parts.push(`<i class="nd-tgt${t.path.length > 1 ? ' is-far' : ''}" data-to="${t.to}" style="transform:translate3d(${(pos.x * unit).toFixed(1)}px,${(pos.y * unit).toFixed(1)}px,0)"><b>${t.path.reduce((sum, st) => sum + st.die, 0)}</b></i>`);
            }
        }
        box.innerHTML = parts.join('');
        view.checkers.forEach(ck => ck.el.classList.remove('is-sel'));
        if (ui.sel != null && humanTurn()) {
            const s = view.slots;
            const stack = ui.sel === 25 ? s.bar[color] : s.pts[core.absIndex(game.variant, color, ui.sel)];
            stack[stack.length - 1]?.el.classList.add('is-sel');
        }
    }
    function select(from) {
        ui.sel = from;
        ui.targets = from == null ? [] : targetsFrom(from);
        renderTargets();
    }

    /* ---------- ввод: касание и перетаскивание ---------- */
    function boardPoint(event) {
        const rect = refs.board.getBoundingClientRect();
        return { x: (event.clientX - rect.left) / unit, y: (event.clientY - rect.top) / unit };
    }
    /** Что под пальцем: пункт (в координатах ходящего), бар (25) или лоток (0). */
    function hitTest(pt) {
        const color = mover();
        if (!color) return null;
        if (pt.x > FIELD_RIGHT + G.FRAME * 0.4) return 0;
        if (Math.abs(pt.x - BAR_X) < G.BAR / 2) return 25;
        const x = pt.x - G.FRAME;
        let c;
        if (x < 6) c = Math.max(0, Math.floor(x));
        else c = Math.min(11, 6 + Math.max(0, Math.floor(x - 6 - G.BAR)));
        const r = pt.y < G.H / 2 ? 13 + c : 12 - c;
        return core.ownPoint(game.variant, color, idxOfRel(r));
    }
    function bindBoard() {
        const board = refs.board;
        board.addEventListener('pointerdown', event => {
            if (!humanTurn() || event.button > 0) return;
            Sound.unlock();
            const pt = boardPoint(event);
            const hit = hitTest(pt);
            const sources = movableSources();
            // уже выбрана шашка — касание цели делает ход
            if (ui.sel != null) {
                const target = ui.targets.find(t => t.to === hit);
                if (target) { event.preventDefault(); playPath(target.path); return; }
            }
            let from = sources.includes(hit) ? hit : null;
            // на баре ждёт шашка — касание любого пункта входа вводит её
            if (from == null && sources.length === 1 && sources[0] === 25) {
                const entry = targetsFrom(25).find(t => t.to === hit);
                if (entry) { event.preventDefault(); playPath(entry.path); return; }
            }
            if (from == null) {
                const own = hit === 25 ? game.turn.state.bar[game.turn.color] > 0 : hit >= 1 && hit <= 24 && core.count(game.turn.state, game.turn.color, hit) > 0;
                if (own) {
                    const blockedByBar = game.variant === 'short' && game.turn.state.bar[game.turn.color] > 0;
                    note(tr(blockedByBar ? 'mustEnter' : game.variant === 'long' && hit === 24 && game.turn.headUsed ? 'headRule' : 'cantMove'));
                    haptic('warning');
                }
                select(null);
                return;
            }
            event.preventDefault();
            const targets = targetsFrom(from);
            ui.drag = { from, id: event.pointerId, start: pt, moved: false, targets };
            board.setPointerCapture?.(event.pointerId);
            select(from);
            haptic('select');
        });
        board.addEventListener('pointermove', event => {
            const d = ui.drag;
            if (!d || d.id !== event.pointerId) return;
            const pt = boardPoint(event);
            if (!d.moved && Math.hypot(pt.x - d.start.x, pt.y - d.start.y) < 0.35) return;
            d.moved = true;
            const color = mover();
            const s = view.slots;
            const stack = d.from === 25 ? s.bar[color] : s.pts[core.absIndex(game.variant, color, d.from)];
            const top = stack[stack.length - 1];
            if (!top) return;
            d.checker = top;
            top.el.classList.add('is-drag');
            top.el.style.transition = 'none';
            top.el.style.transform = `translate3d(${(pt.x * unit).toFixed(1)}px, ${(pt.y * unit).toFixed(1)}px, 0)`;
            d.at = pt;
        });
        const finish = event => {
            const d = ui.drag;
            if (!d || d.id !== event.pointerId) return;
            ui.drag = null;
            d.checker?.el.classList.remove('is-drag');
            if (!d.moved) {
                // касание: если цель одна — сразу ход (настройка «одним касанием»)
                if (settings.oneTap && d.targets.length === 1) playPath(d.targets[0].path);
                return;
            }
            const hit = hitTest(boardPoint(event));
            const target = d.targets.find(t => t.to === hit);
            if (target) playPath(target.path, { dragFrom: d.at });
            else { placeAll(true); renderTargets(); }
        };
        board.addEventListener('pointerup', finish);
        board.addEventListener('pointercancel', event => { if (ui.drag?.id === event.pointerId) { ui.drag.checker?.el.classList.remove('is-drag'); ui.drag = null; placeAll(true); } });
    }

    let noteTimer = null;
    function note(text) {
        const el = refs.note;
        if (!el) return;
        el.textContent = text;
        el.classList.add('show');
        clearTimeout(noteTimer);
        noteTimer = setTimeout(() => el.classList.remove('show'), 1600);
    }

    /* ---------- ход игрока ---------- */
    async function playPath(path, { dragFrom = null } = {}) {
        if (!humanTurn() || !path.length) return;
        ui.busy = true;
        select(null);
        let first = true;
        for (const step of path) {
            const next = core.playStep(game.turn, step);
            if (!next) break;
            game.undo.push(game.turn);
            game.turn = next;
            game.shown = next.state;
            await animateStep(next.color, next.steps[next.steps.length - 1], { from: first ? dragFrom : null });
            first = false;
            updateDiceLeft();
            renderPlayers();
        }
        ui.busy = false;
        playtime('note');
        afterStep();
    }
    function afterStep() {
        renderTargets();
        renderControls();
        renderStatus();
        if (game.turn && core.turnDone(game.turn) && humanTurn()) {
            if (settings.autoDone || core.winner(game.turn.state)) setTimeout(() => { if (game?.turn && core.turnDone(game.turn)) commitTurn(); }, 260);
        }
    }
    async function undo() {
        if (!game?.turn || !game.undo.length || ui.busy || !humanTurn()) return;
        ui.busy = true;
        select(null);
        const step = game.turn.steps[game.turn.steps.length - 1];
        game.turn = game.undo.pop();
        game.shown = game.turn.state;
        await animateUndo(game.turn.color, step);
        updateDiceLeft();
        ui.busy = false;
        renderPlayers();
        afterStep();
        haptic('light');
    }

    /* ---------- партия ---------- */
    function newGame({ mode, variant, level = 2, myColor = 'w', state = null, online = null }) {
        closeDialog(true);
        hideBanner();
        game = {
            mode, variant, level, myColor: mode === 'local' ? null : myColor,
            state: state || core.initialState(variant), shown: null,
            turnColor: null, turn: null, undo: [], dice: null, phase: 'idle', over: null,
            turns: 0, online, id: Date.now(),
        };
        game.shown = game.state;
        select(null);
        syncBoard(game.state);
        renderDice(false);
        renderAll();
        return game;
    }
    function renderAll() {
        renderPlayers();
        renderControls();
        renderStatus();
        renderTargets();
    }

    function openScreen() {
        if (!screen.classList.contains('visible')) {
            screen.classList.add('visible');
            playtime('begin');
        }
        applySkin();
        requestAnimationFrame(() => layout());
        setTimeout(layout, 380);
    }
    function closeScreen() {
        closeDialog(true);
        hideBanner();
        screen.classList.remove('visible');
        playtime('stop');
        if (game?.mode === 'online' && game.over) emit('nd_leave', {});
        if (game && game.mode !== 'online' && !game.over) saveOffline();
        game = null;
    }

    /* ----- офлайн: бот и вдвоём ----- */

    async function startOffline({ mode, variant, level }) {
        openScreen();
        newGame({ mode, variant, level, myColor: 'w' });
        Sound.unlock();
        Sound.play('start', 0.7);
        await sleep(350);
        await openingRoll();
    }
    /** Розыгрыш первого хода: каждый бросает по кости, у кого больше — тот ходит. */
    async function openingRoll() {
        const g = game;
        const opening = core.openingRoll(secureRandom);
        g.opening = opening;
        g.phase = 'opening';
        renderStatus();
        g.dice = { color: viewColor(), roll: [opening.w, opening.b], left: null, key: `open${g.id}` };
        // обе кости: своя справа, чужая слева — рисуем как два отдельных броска
        await showOpening(opening);
        if (game !== g) return;
        const first = opening.first;
        note(tr('firstMove', { name: playerName(first) }));
        await sleep(900);
        if (game !== g) return;
        if (g.variant === 'short') beginTurn(first, first === 'w' ? [opening.w, opening.b] : [opening.b, opening.w]);
        else beginTurn(first);
    }
    async function showOpening(opening) {
        const mine = viewColor();
        refs.dice.dataset.key = '';
        refs.dice.innerHTML = dieHtml(opening[mine]) + dieHtml(opening[other(mine)]);
        const [a, b] = refs.dice.children;
        const place = (el, color) => {
            const spot = diceSpot(color, 1, 0);
            el.style.setProperty('--x', `${(spot.x * unit).toFixed(1)}px`);
            el.style.setProperty('--y', `${(spot.y * unit).toFixed(1)}px`);
        };
        place(a, mine);
        place(b, other(mine));
        a.classList.toggle('is-black', mine === 'b');
        b.classList.toggle('is-black', mine !== 'b');
        Sound.unlock();
        Sound.dice(2);
        if (!REDUCED_MOTION) {
            await Promise.all([a, b].map((el, i) => {
                const v = Number(el.dataset.v);
                el.firstElementChild.animate([{ transform: `rotateX(${720 + i * 90}deg) rotateY(${540 + i * 70}deg)` }, { transform: FACE_ROT[v] }], { duration: 800, easing: 'cubic-bezier(.2,.75,.25,1)' });
                return settled(el.animate([{ translate: `${(i ? -2.5 : 2.5) * unit}px 0`, opacity: 0 }, { translate: '0 0', opacity: 1 }], { duration: 800, easing: 'cubic-bezier(.2,.75,.25,1)' }), 1050);
            }));
        }
        await sleep(500);
    }

    function playerName(color) {
        if (!game) return '';
        if (game.mode === 'local') return tr(color === 'w' ? 'white' : 'black');
        if (game.mode === 'bot') return color === game.myColor ? myName() : tr('botName', { level: tr(`level${core.botLevel(game.level).level}`) });
        const p = game.online?.players?.[color];
        return color === game.myColor ? myName() : p?.name || tr('opponent');
    }

    /** Новый ход (офлайн): бросок вручную, автоматически или кости уже есть (первый ход коротких). */
    function beginTurn(color, roll = null) {
        const g = game;
        g.turnColor = color;
        g.turn = null;
        g.undo = [];
        g.phase = 'roll';
        select(null);
        if (g.mode === 'local' && settings.flipLocal) { placeAll(true); renderDice(false); }
        renderAll();
        if (roll) { setTimeout(() => { if (game === g) startMoves(roll); }, 150); return; }
        if (g.mode === 'bot' && color !== g.myColor) { setTimeout(() => { if (game === g && !g.over && g.phase === 'roll' && g.turnColor === color) doRoll(); }, 520); return; }
        if (settings.autoRoll) setTimeout(() => { if (game === g && g.phase === 'roll' && g.turnColor === color) doRoll(); }, 450);
    }
    async function doRoll() {
        const g = game;
        if (!g || g.phase !== 'roll' || (ui.busy && controls(g.turnColor) && g.mode !== 'bot')) return;
        if (g.mode === 'online') { requestOnlineRoll(); return; }
        g.phase = 'rolling';
        renderControls();
        const roll = core.rollDice(secureRandom);
        await showRoll(g.turnColor, roll, `${g.id}-${g.turns}`);
        if (game !== g) return;
        startMoves(roll, { animated: true });
    }
    async function startMoves(roll, { animated = false } = {}) {
        const g = game;
        if (!animated) await showRoll(g.turnColor, roll, `${g.id}-${g.turns}`);
        if (game !== g) return;
        g.turn = core.startTurn(g.state, g.turnColor, roll);
        g.undo = [];
        g.phase = 'move';
        updateDiceLeft();
        renderAll();
        if (!g.turn.target) {
            note(tr('noMoves'));
            haptic('warning');
            await sleep(1300);
            if (game === g) commitTurn();
            return;
        }
        if (g.mode === 'bot' && g.turnColor !== g.myColor) runBot();
    }
    async function runBot() {
        const g = game;
        const color = g.turnColor;
        const live = () => game === g && !g.over && g.turn?.color === color;
        g.phase = 'bot';
        renderStatus();
        await sleep(380);
        if (!live()) return;
        const steps = core.botPlay(g.state, color, g.turn.roll, g.level, secureRandom);
        // на всякий случай доигрываем разрешёнными шагами: бот не должен «зависнуть» посреди хода
        const plan = [...steps];
        while (live() && !core.turnDone(g.turn)) {
            const legal = core.legalSteps(g.turn);
            const raw = plan.shift();
            const step = (raw && legal.find(s => s.from === raw.from && s.to === raw.to && s.die === raw.die)) || legal[0];
            if (!step) break;
            const next = core.playStep(g.turn, step);
            if (!next) break;
            g.turn = next;
            g.shown = next.state;
            await animateStep(color, next.steps[next.steps.length - 1]);
            updateDiceLeft();
            renderPlayers();
            await sleep(200);
        }
        if (!live()) return;
        await sleep(200);
        commitTurn();
    }
    function commitTurn() {
        const g = game;
        if (!g?.turn || !core.turnDone(g.turn)) return;
        if (g.mode === 'online') { sendOnlinePlay(); return; }
        const color = g.turn.color;
        g.state = core.endTurn(g.turn);
        g.shown = g.state;
        g.turns++;
        g.turn = null;
        select(null);
        const win = core.winner(g.state);
        if (win) { finishGame({ winner: win, reason: 'bearoff', ...core.outcomeOf(g.state, win) }); return; }
        saveOffline(other(color));
        beginTurn(other(color));
    }

    /* ----- конец партии ----- */
    function finishGame(outcome) {
        const g = game;
        if (!g || g.over) return;
        g.over = outcome;
        g.phase = 'over';
        g.turn = null;
        select(null);
        if (g.mode !== 'online') localStorage.removeItem(SAVE_KEY);
        recordStats(outcome);
        const result = myResult(outcome);
        if (result === 'win' || result === 'white' || result === 'black') { Sound.play('win'); haptic('success'); celebrate(); }
        else if (result === 'loss') { Sound.play('lose'); haptic('error'); }
        renderAll();
        setTimeout(() => { if (game === g) showResult(); }, outcome.reason === 'bearoff' ? 900 : 300);
    }
    /** 'win' | 'loss' | 'aborted' | 'white' | 'black' (вдвоём). */
    function myResult(outcome) {
        if (!outcome.winner) return 'aborted';
        if (game.mode === 'local') return outcome.winner === 'w' ? 'white' : 'black';
        return outcome.winner === game.myColor ? 'win' : 'loss';
    }
    function celebrate() {
        if (typeof confetti !== 'function') return;
        try { confetti({ particleCount: 140, spread: 75, origin: { y: 0.6 }, zIndex: 2147483647 }); } catch (_) {}
    }
    function recordStats(outcome) {
        if (game.mode === 'online' || !outcome.winner) return;
        const stats = Object.assign({ botGames: 0, botWins: 0, bestLevel: 0, localGames: 0, mars: 0 }, readJson(STATS_KEY, {}));
        if (game.mode === 'local') stats.localGames++;
        else {
            stats.botGames++;
            if (outcome.winner === game.myColor) {
                stats.botWins++;
                stats.bestLevel = Math.max(stats.bestLevel, game.level);
                if (outcome.points >= 2) stats.mars++;
            }
        }
        writeJson(STATS_KEY, stats);
    }

    /* ----- сохранение партии с ботом и вдвоём ----- */
    function saveOffline(nextColor = null) {
        const g = game;
        if (!g || g.mode === 'online' || g.over) return;
        const color = nextColor || g.turnColor;
        if (!color || !g.turns) return;
        writeJson(SAVE_KEY, { v: 1, mode: g.mode, variant: g.variant, level: g.level, state: core.serialize(g.state), turnColor: color, turns: g.turns, savedAt: Date.now() });
    }
    function savedGame() {
        const saved = readJson(SAVE_KEY, null);
        if (!saved || saved.v !== 1 || !['bot', 'local'].includes(saved.mode)) return null;
        const state = core.parseState(saved.state);
        if (!state || core.winner(state) || !['w', 'b'].includes(saved.turnColor)) return null;
        return { ...saved, state };
    }
    function continueSaved() {
        const saved = savedGame();
        if (!saved) return;
        closeSheet();
        openScreen();
        newGame({ mode: saved.mode, variant: saved.variant, level: saved.level, myColor: 'w', state: saved.state });
        game.turns = saved.turns || 1;
        beginTurn(saved.turnColor);
    }

    /* ---------- отрисовка игроков, статуса и кнопок ---------- */
    function avatarHtml(color) {
        const p = game?.mode === 'online' ? (color === game.myColor ? { avatar: me()?.photo_url || '' } : game.online?.players?.[color]) : null;
        if (p?.avatar && /^https:\/\//i.test(p.avatar)) return `<img src="${esc(p.avatar)}" alt="" referrerpolicy="no-referrer">`;
        return `<span class="nd-ava-ck nd-${color}"></span>`;
    }
    function renderPlayers() {
        if (!game || !refs.topPlayer) return;
        const bottom = viewColor(), top = other(bottom);
        const state = game.shown || game.state;
        for (const [el, color] of [[refs.bottomPlayer, bottom], [refs.topPlayer, top]]) {
            const active = !game.over && game.turnColor === color;
            const online = game.mode === 'online' ? game.online : null;
            const p = online?.players?.[color];
            const rating = online && p?.rating ? `<small>${esc(p.rating)}</small>` : '';
            const flag = online && color !== game.myColor ? flagHtml(p?.lang) : '';
            const strikes = online?.strikes?.[color] ? `<em class="nd-strikes" title="${esc(tr('strikes', { n: online.strikes[color] }))}">${'●'.repeat(online.strikes[color])}</em>` : '';
            el.classList.toggle('is-turn', active);
            el.innerHTML = `
                <div class="nd-ava${active ? ' is-turn' : ''}${online?.away === color ? ' is-away' : ''}">${avatarHtml(color)}<svg class="nd-timer" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18.5"/></svg></div>
                <div class="nd-pinfo">
                    <div class="nd-pname">${flag}<span>${esc(playerName(color))}</span>${rating}${strikes}</div>
                    <div class="nd-pmeta"><span class="nd-pip" title="${esc(tr('pips'))}">${core.pips(state, color)}</span><span class="nd-offn">${esc(tr('off'))} ${state.off[color]}/15</span></div>
                </div>
                <div class="nd-clock" data-clock="${color}" hidden></div>`;
        }
        tickTimer();
    }
    function renderStatus() {
        if (!game || !refs.title) return;
        refs.title.textContent = `${tr(game.variant === 'long' ? 'longFull' : 'shortFull')}`;
        const status = refs.status;
        status.classList.remove('is-alert');
        if (game.over) { status.textContent = resultTitle(game.over); return; }
        if (game.phase === 'opening' || !game.turnColor) { status.textContent = tr(game.mode === 'local' ? 'modeLocal' : game.mode === 'bot' ? 'modeBot' : 'modeOnline'); return; }
        const color = game.turnColor;
        if (game.mode === 'local') { status.textContent = tr(color === 'w' ? 'whiteTurn' : 'blackTurn'); return; }
        if (!controls(color)) { status.textContent = game.mode === 'bot' ? tr('botThinking') : tr('theirTurn'); return; }
        if (!game.turn) { status.textContent = tr('rollPrompt'); return; }
        status.textContent = game.turn.dice.length ? tr('movePrompt', { dice: game.turn.dice.join(' · ') }) : tr('yourTurn');
    }
    function renderControls() {
        const box = refs.controls;
        if (!box || !game) return;
        const buttons = [];
        const add = (act, icon, label, opts = {}) => buttons.push(`<button type="button" class="nd-act${opts.main ? ' is-main' : ''}${opts.danger ? ' is-danger' : ''}${opts.ghost ? ' is-ghost' : ''}" data-act="${act}"${opts.disabled ? ' disabled' : ''}>${icon}<span>${esc(label)}</span></button>`);
        if (game.over) {
            add('result', ICON.trophy, tr('resultBtn'));
            if (game.mode === 'online') add('rematch', ICON.rematch, tr('rematch'), { main: true });
            else add('again', ICON.plus, tr('playAgain'), { main: true });
        } else {
            const myTurn = !!game.turnColor && controls(game.turnColor);
            const canUndo = myTurn && game.phase === 'move' && game.undo.length > 0 && !ui.busy;
            add('undo', ICON.undo, tr('undo'), { disabled: !canUndo });
            if (myTurn && game.phase === 'roll') add('roll', ICON.dice, tr('roll'), { main: true });
            else if (myTurn && game.phase === 'move' && game.turn && core.turnDone(game.turn)) add('done', ICON.check, tr('done'), { main: true });
            else add('wait', ICON.dice, myTurn && game.turn ? tr('movePrompt', { dice: game.turn.dice.join(' · ') }) : game.mode === 'bot' && !myTurn ? tr('botThinking') : tr(myTurn ? 'yourTurn' : 'theirTurn'), { main: true, ghost: true, disabled: true });
            add('resign', ICON.flag, tr('resign'), { danger: true, disabled: game.mode !== 'online' && !game.turns });
        }
        box.innerHTML = buttons.join('');
        const main = box.querySelector('.is-main:not(.is-ghost)');
        if (main && game.mode === 'local' && game.turnColor) main.dataset.side = game.turnColor;
    }

    /* ----- таймер хода онлайн ----- */
    let timerLoop = null;
    function tickTimer() {
        clearInterval(timerLoop);
        timerLoop = null;
        const g = game;
        if (!g || g.mode !== 'online' || g.over || !g.online?.deadline) return;
        const draw = () => {
            if (game !== g) { clearInterval(timerLoop); return; }
            const left = Math.max(0, g.online.deadline - (Date.now() + (g.online.offset || 0)));
            const total = g.turn ? 60000 : 20000;
            for (const color of ['w', 'b']) {
                const el = screen.querySelector(`[data-clock="${color}"]`);
                const ring = el?.parentElement.querySelector('.nd-timer circle');
                const active = g.turnColor === color;
                if (el) { el.hidden = !active || left > 20000; el.textContent = `${Math.ceil(left / 1000)}`; el.classList.toggle('is-low', left < 10000); }
                if (ring) ring.style.strokeDashoffset = active ? String(116.2 * (1 - Math.min(1, left / total))) : '116.2';
            }
        };
        draw();
        timerLoop = setInterval(draw, 250);
    }

    /* ---------- кнопки экрана ---------- */
    function onScreenClick(event) {
        const button = event.target.closest('[data-act]');
        if (!button || button.disabled) return;
        Sound.unlock();
        switch (button.dataset.act) {
            case 'back': return requestLeave();
            case 'settings': return showSettings();
            case 'roll': return doRoll();
            case 'done': haptic('light'); return commitTurn();
            case 'undo': return undo();
            case 'resign': return confirmResign();
            case 'again': return playAgain();
            case 'rematch': emit('nd_rematch', { roomCode: game.online.roomCode }); toast(tr('rematchWaiting')); return undefined;
            case 'result': return showResult();
            default: return undefined;
        }
    }
    function requestLeave() {
        if (ui.dialog) { closeDialog(); return; }
        if (!game) { closeScreen(); return; }
        if (game.mode === 'online' && !game.over) {
            confirmDialog({
                title: tr('confirmLeave'), text: tr('confirmLeaveOnline'), okLabel: tr('leave'),
                onOk: () => { emit('nd_resign', { roomCode: game.online.roomCode }); closeScreen(); openSheet(); },
            });
            return;
        }
        if (game.mode !== 'online' && !game.over && game.turns) toast(tr('savedLocal'));
        closeScreen();
        openSheet();
    }
    function confirmResign() {
        if (!game || game.over) return;
        confirmDialog({
            title: tr('confirmResign'), text: tr('confirmResignText'), okLabel: tr('resign'),
            onOk: () => {
                if (game.mode === 'online') { emit('nd_resign', { roomCode: game.online.roomCode }); return; }
                const loser = game.mode === 'local' ? game.turnColor || 'w' : game.myColor;
                finishGame({ winner: other(loser), reason: 'resign', points: 1, kind: 'single' });
            },
        });
    }
    function playAgain() {
        if (!game) return;
        const { mode, variant, level } = game;
        closeDialog(true);
        startOffline({ mode, variant, level });
    }

    /* ---------- шторки: подтверждение, итог, настройки ---------- */
    function openDialog(kind, html, { dismissable = true } = {}) {
        ui.dialog = { kind, dismissable };
        refs.sheet.innerHTML = `<div class="nd-sheet-head">${dismissable ? `<button class="ui-close nd-sheet-close" type="button" data-dlg="x" aria-label="${esc(tr('cancel'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button>` : ''}</div><div class="nd-sheet-body">${html}</div>`;
        refs.sheet.querySelector('[data-dlg="x"]')?.addEventListener('click', () => closeDialog());
        refs.scrim.classList.add('show');
        requestAnimationFrame(() => refs.sheet.classList.add('show'));
    }
    function closeDialog(instant = false) {
        if (!refs.sheet) return;
        ui.dialog = null;
        refs.sheet.classList.remove('show');
        refs.scrim.classList.remove('show');
        if (instant) refs.sheet.innerHTML = '';
    }
    function confirmDialog({ title, text, okLabel, onOk }) {
        openDialog('confirm', `
            <h2>${esc(title)}</h2><p>${esc(text)}</p>
            <div class="nd-sheet-actions">
                <button type="button" class="nd-btn is-primary is-danger" data-dlg="ok">${esc(okLabel)}</button>
                <button type="button" class="nd-btn" data-dlg="cancel">${esc(tr('stay'))}</button>
            </div>`);
        refs.sheet.querySelector('[data-dlg="ok"]').onclick = () => { closeDialog(); onOk(); };
        refs.sheet.querySelector('[data-dlg="cancel"]').onclick = () => closeDialog();
    }
    function resultTitle(outcome) {
        const r = myResult(outcome);
        return r === 'win' ? tr('win') : r === 'loss' ? tr('loss') : r === 'aborted' ? tr('aborted') : tr(r === 'white' ? 'whiteWins' : 'blackWins');
    }
    function reasonText(outcome) {
        const r = outcome.reason;
        const mine = myResult(outcome) === 'win';
        if (r === 'bearoff') return tr('r_bearoff');
        if (r === 'resign') return game.mode === 'local' ? tr('r_resignSide', { side: tr(outcome.winner === 'w' ? 'black' : 'white') }) : mine ? tr('r_resign') : tr('r_resignSelf');
        if (r === 'timeout') return mine ? tr('r_timeout') : tr('r_timeoutSelf');
        if (r === 'abandon') return mine ? tr('r_abandon') : tr('r_abandonSelf');
        return tr('r_aborted');
    }
    function showResult() {
        const g = game;
        if (!g?.over) return;
        const outcome = g.over;
        const r = myResult(outcome);
        const icon = r === 'loss' ? ICON.broken : r === 'aborted' ? ICON.abort : ICON.trophy;
        const cls = r === 'loss' ? 'loss' : r === 'aborted' ? 'draw' : 'win';
        // марс/гаммон показываем обоим, обычную победу — только победителю; сдача — без подписи
        const showKind = outcome.winner && outcome.kind && outcome.reason === 'bearoff' && (outcome.points >= 2 || r !== 'loss');
        const kind = showKind ? `<div class="nd-kind k-${esc(outcome.kind)}">${esc(tr(`k_${outcome.kind}`))}</div>` : '';
        const primary = g.mode === 'online'
            ? `<button type="button" class="nd-btn is-primary" data-dlg="rematch">${esc(tr('rematch'))}</button>`
            : `<button type="button" class="nd-btn is-primary" data-dlg="again">${esc(tr('playAgain'))}</button>`;
        openDialog('result', `
            <div class="nd-result-icon ${cls}">${icon}</div>
            <h2>${esc(resultTitle(outcome))}</h2>
            ${kind}
            <p>${esc(reasonText(outcome))}</p>
            <div class="nd-rating-chip" data-ref="resultRating" hidden></div>
            <p data-ref="resultNote" hidden></p>
            <div class="nd-sheet-actions">
                ${outcome.winner || g.mode !== 'online' ? primary : ''}
                <button type="button" class="nd-btn" data-dlg="board">${esc(tr('board'))}</button>
                <button type="button" class="nd-btn" data-dlg="menu">${esc(tr('menu'))}</button>
            </div>`);
        const sheet = refs.sheet;
        sheet.querySelector('[data-dlg="board"]').onclick = () => closeDialog();
        sheet.querySelector('[data-dlg="menu"]').onclick = () => { closeDialog(true); closeScreen(); openSheet(); };
        sheet.querySelector('[data-dlg="again"]')?.addEventListener('click', () => { closeDialog(); playAgain(); });
        sheet.querySelector('[data-dlg="rematch"]')?.addEventListener('click', () => { emit('nd_rematch', { roomCode: g.online.roomCode }); setResultNote(tr('rematchWaiting')); });
        updateResultRating();
    }
    function updateResultRating() {
        const chip = refs.sheet?.querySelector('[data-ref="resultRating"]');
        if (!chip || game?.mode !== 'online' || !game.over) return;
        const change = game.online.ratingChange;
        if (!change) { if (!game.over.rated && game.over.winner) { chip.hidden = false; chip.textContent = tr('unrated'); } return; }
        const delta = change.delta > 0 ? `+${change.delta}` : String(change.delta);
        chip.hidden = false;
        chip.innerHTML = `${esc(tr('rating'))} · ${esc(tr(game.variant))} <b>${change.rating}</b> <b class="${change.delta >= 0 ? 'up' : 'down'}">${delta}</b>`;
    }
    function setResultNote(text) {
        if (ui.dialog?.kind !== 'result') { if (text) toast(text); return; }
        const el = refs.sheet.querySelector('[data-ref="resultNote"]');
        if (!el) return;
        el.hidden = !text;
        el.textContent = text || '';
    }

    function showSettings() {
        const rows = [['sound', 'sound'], ['autoRoll', 'autoRoll'], ['oneTap', 'oneTap', 'oneTapHint'], ['autoDone', 'autoDone', 'autoDoneHint']];
        if (game?.mode === 'local') rows.push(['flipLocal', 'flipLocal']);
        openDialog('settings', `
            <h2>${esc(tr('settings'))}</h2>
            <div class="nd-settings">
                ${rows.map(([key, label, sub]) => `<div class="nd-toggle-row"><span>${esc(tr(label))}${sub ? `<small>${esc(tr(sub))}</small>` : ''}</span><button type="button" class="nd-switch${settings[key] ? ' on' : ''}" data-setting="${key}" role="switch" aria-checked="${!!settings[key]}" aria-label="${esc(tr(label))}"></button></div>`).join('')}
            </div>
            <p class="nd-label">${esc(tr('board'))}</p>
            <div class="nd-skins">${skinTiles()}</div>
            <div class="nd-sheet-actions"><button type="button" class="nd-btn" data-dlg="close">${esc(tr('backToGame'))}</button></div>`);
        refs.sheet.querySelector('.nd-skins').addEventListener('click', event => {
            const tile = event.target.closest('[data-skin]');
            if (!tile) return;
            settings.skin = tile.dataset.skin;
            saveSettings();
            applySkin();
            refs.sheet.querySelectorAll('[data-skin]').forEach(el => el.classList.toggle('is-active', el.dataset.skin === settings.skin));
            haptic('select');
        });
        refs.sheet.querySelectorAll('[data-setting]').forEach(btn => {
            btn.onclick = () => {
                const key = btn.dataset.setting;
                settings[key] = !settings[key];
                saveSettings();
                btn.classList.toggle('on', settings[key]);
                btn.setAttribute('aria-checked', String(settings[key]));
                haptic('select');
                if (key === 'sound' && settings.sound) { Sound.unlock(); Sound.play('move'); }
                if (key === 'flipLocal') { placeAll(true); renderDice(false); renderPlayers(); renderTargets(); }
                if (key === 'autoRoll' && settings.autoRoll && game?.phase === 'roll' && controls(game.turnColor)) setTimeout(doRoll, 300);
            };
        });
        refs.sheet.querySelector('[data-dlg="close"]').onclick = () => closeDialog();
    }
    function skinTiles() {
        return SKINS.map(skin => `<button type="button" class="nd-skin${skin.id === settings.skin ? ' is-active' : ''}" data-skin="${skin.id}">
            <span class="nd-skin-img" style="background-image:url('${BASE}skins/${skin.id}-sm.jpg${V}')"><i style="background-image:url('${BASE}skins/checker-${skin.checkers[0]}.png${V}')"></i><i style="background-image:url('${BASE}skins/checker-${skin.checkers[1]}.png${V}')"></i></span>
            <b>${esc(tr(`skin_${skin.id}`))}</b></button>`).join('');
    }

    /* ---------- плашка поверх доски (соперник отключился и т. п.) ---------- */
    let bannerTimer = null;
    function showBanner(text, buttons = []) {
        const banner = refs.banner;
        banner.innerHTML = `<p>${esc(text)}</p>${buttons.map((b, i) => `<button type="button" data-banner="${i}"${b.primary ? ' class="is-primary"' : ''}>${esc(b.label)}</button>`).join('')}`;
        banner.querySelectorAll('[data-banner]').forEach(el => { el.onclick = () => { hideBanner(); buttons[Number(el.dataset.banner)].act(); }; });
        banner.classList.add('show');
    }
    function hideBanner() {
        clearInterval(bannerTimer);
        refs.banner?.classList.remove('show');
    }

    /* ---------- онлайн ---------- */
    function emit(event, payload) {
        if (typeof socket === 'undefined' || !socket) return false;
        if (!socket.connected) toast(tr('e_network'), 'error');
        socket.emit(event, payload);
        return true;
    }
    const colorFromName = name => core.fromName(name);
    let queue = Promise.resolve();
    /** События партии разбираются по очереди: анимации не перебивают друг друга. */
    const enqueue = fn => { queue = queue.then(fn).catch(error => console.warn('[nardy]', error)); return queue; };

    function onlineStart(data) {
        hideWait();
        closeSheet();
        const myColor = colorFromName(data.color) || 'w';
        const state = core.parseState(data.state) || core.initialState(data.variant);
        const players = {
            w: { ...(data.players?.white || {}) },
            b: { ...(data.players?.black || {}) },
        };
        openScreen();
        newGame({ mode: 'online', variant: state.variant, myColor, state, online: { roomCode: data.roomCode, players, deadline: 0, offset: (Number(data.serverTime) || Date.now()) - Date.now(), strikes: { w: data.strikes?.white || 0, b: data.strikes?.black || 0 }, away: null, ratingChange: null } });
        game.turns = 1;
        if (!data.resumed) { Sound.unlock(); Sound.play('start', 0.7); }
        if (data.turn) applyServerTurn(data.turn, { resumed: true });
        else if (data.opening) return showOpeningOnline(data.opening);
        return null;
    }
    async function showOpeningOnline(opening) {
        const g = game;
        g.phase = 'opening';
        renderStatus();
        await showOpening({ w: opening.white, b: opening.black });
        if (game !== g) return;
        note(tr('firstMove', { name: playerName(colorFromName(opening.first)) }));
    }
    /** Ход с сервера (при старте или после переподключения). */
    function applyServerTurn(turn, { resumed = false } = {}) {
        const g = game;
        const color = colorFromName(turn.color);
        g.turnColor = color;
        g.online.no = turn.no;
        g.online.deadline = Number(turn.deadline) || 0;
        g.undo = [];
        if (turn.roll) {
            g.turn = core.startTurn(g.state, color, turn.roll);
            g.phase = controls(color) ? 'move' : 'wait';
            g.dice = { color, roll: turn.roll, left: [...g.turn.dice], key: `${g.online.roomCode}-${turn.no}` };
            renderDice(true);
        } else {
            g.turn = null;
            g.phase = controls(color) ? 'roll' : 'wait';
        }
        renderAll();
        if (!resumed && !turn.roll && controls(color) && settings.autoRoll) setTimeout(() => { if (game === g && g.phase === 'roll') requestOnlineRoll(); }, 450);
    }
    function requestOnlineRoll() {
        const g = game;
        if (!g || g.phase !== 'roll' || !controls(g.turnColor)) return;
        g.phase = 'rolling';
        renderControls();
        emit('nd_roll', { roomCode: g.online.roomCode, no: g.online.no });
    }
    function sendOnlinePlay() {
        const g = game;
        if (!g?.turn || g.phase !== 'move') return;
        g.phase = 'sent';
        g.sent = { no: g.online.no, key: core.keyOf(core.endTurn(g.turn)) };
        emit('nd_play', { roomCode: g.online.roomCode, no: g.online.no, steps: g.turn.steps.map(s => ({ from: s.from, to: s.to, die: s.die })) });
        renderControls();
        renderTargets();
    }
    const forMe = data => game?.mode === 'online' && data && data.roomCode === game.online.roomCode;

    function bindSocket() {
        if (typeof socket === 'undefined' || !socket || socket.__nardyBound) return;
        socket.__nardyBound = true;
        socket.on('connect', () => { if (game?.mode === 'online' && !game.over) socket.emit('nd_rejoin', { roomCode: game.online.roomCode }); });
        socket.on('nd_rooms', data => renderRooms(Array.isArray(data?.rooms) ? data.rooms : []));
        socket.on('nd_created', data => showWait(data));
        socket.on('nd_error', data => {
            const key = `e_${data?.code}`;
            toast(I18N.T[key] ? tr(key) : tr('e_network'), 'error');
            if (data?.code !== 'alreadyPlaying') hideWait();
        });
        socket.on('nd_start', data => enqueue(() => { window.__nardyElsewhere = null; onlineStart(data); }));
        socket.on('nd_state', data => enqueue(() => {
            if (!forMe(data)) return;
            const state = core.parseState(data.state);
            if (!state) return;
            game.state = state;
            game.shown = state;
            syncBoard(state);
            if (data.turn) applyServerTurn(data.turn, { resumed: true });
        }));
        socket.on('nd_turn', data => enqueue(() => {
            if (!forMe(data) || game.over) return;
            game.online.offset = (Number(data.serverTime) || Date.now()) - Date.now();
            applyServerTurn({ color: data.color, no: data.no, deadline: data.deadline, roll: null });
        }));
        socket.on('nd_rolled', data => enqueue(async () => {
            if (!forMe(data) || game.over) return;
            const g = game;
            const color = colorFromName(data.color);
            g.turnColor = color;
            g.online.no = data.no;
            g.online.deadline = Number(data.deadline) || 0;
            await showRoll(color, data.dice, `${g.online.roomCode}-${data.no}`);
            if (game !== g) return;
            g.turn = core.startTurn(g.state, color, data.dice);
            g.undo = [];
            g.phase = controls(color) ? 'move' : 'wait';
            updateDiceLeft();
            renderAll();
            if (!data.target) { note(tr('noMoves')); await sleep(900); }
        }));
        socket.on('nd_played', data => enqueue(async () => {
            if (!forMe(data)) return;
            const g = game;
            const color = colorFromName(data.color);
            const state = core.parseState(data.state);
            if (!state) return;
            g.online.strikes = { w: data.strikes?.white || 0, b: data.strikes?.black || 0 };
            const mineSent = controls(color) && g.sent?.no === data.no && g.sent.key === core.keyOf(state);
            if (!mineSent) {
                if (controls(color)) {
                    // сервер сыграл за нас (время вышло) — показываем его ход
                    if (data.auto) { toast(tr('autoMoved'), 'error'); haptic('warning'); }
                    syncBoard(g.state);
                }
                // ход соперника: проигрываем шаги поверх прежней позиции
                let turn = core.startTurn(g.state, color, data.dice);
                for (const raw of data.steps || []) {
                    const next = core.playStep(turn, raw);
                    if (!next) break;
                    turn = next;
                    g.turn = next;
                    g.shown = next.state;
                    await animateStep(color, next.steps[next.steps.length - 1]);
                    updateDiceLeft();
                    renderPlayers();
                    await sleep(180);
                }
            }
            g.state = state;
            g.shown = state;
            g.turn = null;
            g.sent = null;
            g.turns++;
            if (core.keyOf(state) !== slotsKey()) syncBoard(state);
            select(null);
            renderAll();
        }));
        socket.on('nd_over', data => enqueue(() => {
            if (!forMe(data)) return;
            const state = core.parseState(data.state);
            if (state) { game.state = state; game.shown = state; if (core.keyOf(state) !== slotsKey()) syncBoard(state); }
            hideBanner();
            finishGame({ winner: colorFromName(data.winner), reason: data.reason, points: data.points, kind: data.kind, rated: !!data.rated });
        }));
        socket.on('nd_rating', data => {
            if (!forMe(data)) return;
            const mine = game.myColor === 'w' ? data.white : data.black;
            game.online.ratingChange = mine || null;
            for (const c of ['w', 'b']) { const row = c === 'w' ? data.white : data.black; if (row) game.online.players[c].rating = row.rating; }
            updateResultRating();
            renderPlayers();
            ratingCache = null;
        });
        socket.on('nd_opponent_away', data => {
            if (!forMe(data) || game.over) return;
            game.online.away = other(game.myColor);
            const deadline = Number(data.deadline) - (Number(data.serverTime) || Date.now()) + Date.now();
            clearInterval(bannerTimer);
            const tick = () => showBanner(tr('opponentAway', { s: Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) }));
            tick();
            bannerTimer = setInterval(tick, 1000);
            renderPlayers();
        });
        socket.on('nd_opponent_back', data => {
            if (!forMe(data)) return;
            game.online.away = null;
            hideBanner();
            toast(tr('opponentBack'));
            renderPlayers();
        });
        socket.on('nd_gone', data => enqueue(() => { if (forMe(data) && !game.over) finishGame({ winner: null, reason: 'aborted' }); }));
        socket.on('nd_rematch_waiting', data => { if (forMe(data)) setResultNote(tr('rematchWaiting')); });
        socket.on('nd_rematch_offer', data => {
            if (!forMe(data)) return;
            Sound.play('notify');
            if (ui.dialog?.kind === 'result') {
                setResultNote(tr('rematchOffer', { name: data.name || tr('opponent') }));
                const btn = refs.sheet.querySelector('[data-dlg="rematch"]');
                if (btn) btn.textContent = tr('accept');
            } else showBanner(tr('rematchOffer', { name: data.name || tr('opponent') }), [
                { label: tr('decline'), act: () => emit('nd_rematch_decline', { roomCode: game.online.roomCode }) },
                { label: tr('accept'), primary: true, act: () => emit('nd_rematch', { roomCode: game.online.roomCode }) },
            ]);
        });
        socket.on('nd_rematch_declined', data => { if (forMe(data)) setResultNote(tr('rematchDeclined')); });
        socket.on('nd_elsewhere', data => { window.__nardyElsewhere = data?.roomCode ? { ...data, at: Date.now() } : null; if (sheetEl?.classList.contains('visible')) refreshSheetTexts(); });
        socket.on('nd_moved_elsewhere', data => {
            if (!forMe(data)) return;
            toast(tr('moved_elsewhere'));
            closeScreen();
        });
    }
    /** Ключ позиции, которую сейчас показывают шашки (для проверки после хода). */
    function slotsKey() {
        const s = view.slots;
        if (!s) return '';
        const pts = s.pts.map(stack => (stack.length ? (stack[0].color === 'w' ? stack.length : -stack.length) : 0));
        return `${pts.join(',')}|${s.bar.w.length},${s.bar.b.length}|${s.off.w.length},${s.off.b.length}`;
    }

    /* ---------- лобби ---------- */
    let roomsTimer = null;
    let ratingCache = null;
    function buildSheet() {
        sheetEl = document.getElementById('modalNardy');
        waitEl = document.getElementById('modalNardyWait');
        const panel = sheetEl.querySelector('.ui-mode-panel');
        const ck = color => `<i class="nd-mini-ck nd-${color}"></i>`;
        panel.innerHTML = `
            <div class="ui-sheet-grab" aria-hidden="true"></div>
            <div class="ui-sheet-heading"><h2 data-t="title"></h2><button class="ui-close" type="button" data-sheet="close" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button></div>
            <div class="nd-variants" role="radiogroup">
                <button type="button" class="nd-variant" data-variant="long"><span class="nd-variant-art long">${ck('w')}${ck('w')}${ck('w')}</span><b data-t="longFull"></b><small data-t="longHint"></small></button>
                <button type="button" class="nd-variant" data-variant="short"><span class="nd-variant-art short">${ck('w')}${ck('b')}${ck('w')}</span><b data-t="shortFull"></b><small data-t="shortHint"></small></button>
            </div>
            <div class="segment-control nd-tabs" role="tablist">
                <div class="segment-glider" data-ref="glider"></div>
                <button type="button" class="segment-item" data-tab="bot" data-t="modeBot"></button>
                <button type="button" class="segment-item" data-tab="online" data-t="modeOnline"></button>
                <button type="button" class="segment-item" data-tab="local" data-t="modeLocal"></button>
            </div>
            <button type="button" class="nd-continue is-elsewhere" data-sheet="takeover" hidden><span class="nd-continue-ico">${ICON.device}</span><span><b data-t="elsewhereTitle"></b><small data-ref="elsewhereHint"></small></span>${ICON.chevron}</button>
            <button type="button" class="nd-continue" data-sheet="continue" hidden><span class="nd-continue-ico">${ck('w')}</span><span><b data-t="continueGame"></b><small data-ref="continueHint"></small></span>${ICON.chevron}</button>
            <div class="nd-panel" data-panel="bot">
                <p class="nd-label" data-t="botLevel"></p>
                <div class="nd-levels">${core.BOT_LEVELS.map(l => `<button type="button" class="nd-level" data-level="${l.level}"><span class="nd-level-dots">${'<i></i>'.repeat(l.level)}</span><b data-t="level${l.level}"></b><small data-t="level${l.level}Hint"></small></button>`).join('')}</div>
                <button type="button" class="btn-main" data-sheet="playBot" data-t="play"></button>
            </div>
            <div class="nd-panel" data-panel="online">
                <div class="nd-rating-card">${ck('w')}<div><small data-ref="myRatingLabel"></small><b data-ref="myRating">—</b></div><span data-ref="myGames"></span></div>
                <button class="ck-hero" type="button" data-sheet="quick">
                    <span class="ck-hero-icon">${ICON.search}</span>
                    <span class="ck-hero-text"><b data-t="findOpponent"></b><small data-ref="quickHint"></small></span>
                    ${ICON.arrow}
                </button>
                <div class="ck-tiles">
                    <button class="ck-tile" type="button" data-sheet="create"><span class="ck-tile-icon">${ICON.add}</span><b data-t="createRoom"></b><small data-t="inviteFriend"></small></button>
                    <button class="ck-tile" type="button" data-sheet="code"><span class="ck-tile-icon">${ICON.key}</span><b data-t="enterCode"></b><small data-t="friendRoom"></small></button>
                </div>
                <div class="ck-code-row" data-ref="codeRow">
                    <input type="text" inputmode="numeric" autocomplete="off" maxlength="5" data-ref="codeInput">
                    <button type="button" data-sheet="join" data-t="join"></button>
                </div>
                <div class="ck-rooms-head"><h3 data-t="openRooms"></h3><button class="ck-refresh" type="button" data-sheet="refresh">${ICON.refresh}</button></div>
                <div class="ck-rooms" data-ref="rooms"></div>
            </div>
            <div class="nd-panel" data-panel="local">
                <div class="nd-local-art">${ck('w')}<span>VS</span>${ck('b')}</div>
                <p class="nd-label nd-center" data-t="localHint"></p>
                <button type="button" class="btn-main" data-sheet="playLocal" data-t="play"></button>
            </div>`;
        panel.querySelectorAll('[data-ref]').forEach(el => { refs['s_' + el.dataset.ref] = el; });
        panel.addEventListener('click', onSheetClick);
        refs.s_codeInput.addEventListener('keydown', event => { if (event.key === 'Enter') joinByCode(); });
        refs.s_codeInput.addEventListener('input', () => { refs.s_codeInput.value = refs.s_codeInput.value.replace(/\D/g, '').slice(0, 5); });
        panel.style.setProperty('--nd-ck-w', `url('${BASE}skins/checker-${skinOf().checkers[0]}.png${V}')`);
        panel.style.setProperty('--nd-ck-b', `url('${BASE}skins/checker-${skinOf().checkers[1]}.png${V}')`);

        waitEl.querySelector('.modal').innerHTML = `
            <div class="ck-radar" aria-hidden="true"><span></span><span></span><span></span><img src="${BASE}../game-icons/nardy.png" alt=""></div>
            <h2 data-ref="waitTitle"></h2>
            <p class="ck-wait-hint" data-ref="waitVariant"></p>
            <div data-ref="waitCodeBox"><p class="ck-wait-sub" data-t="roomCode"></p><div class="ck-wait-code" data-ref="waitCode">-----</div>
            <button class="btn-main ck-invite" type="button" data-wait="invite">${ICON.send}<span data-t="inviteFriend"></span></button></div>
            <button class="nd-btn" type="button" data-wait="cancel" data-t="cancel"></button>`;
        waitEl.querySelectorAll('[data-ref]').forEach(el => { refs['w_' + el.dataset.ref] = el; });
        waitEl.addEventListener('click', event => {
            const button = event.target.closest('[data-wait]');
            if (!button) return;
            if (button.dataset.wait === 'cancel') cancelWait();
            if (button.dataset.wait === 'invite') inviteFriend();
        });
    }

    function refreshSheetTexts() {
        const panel = sheetEl.querySelector('.ui-mode-panel');
        applyTexts(panel);
        applyTexts(waitEl);
        refs.s_codeInput.placeholder = tr('code');
        refs.s_quickHint.textContent = tr('findHint', { variant: tr(prefs.variant === 'long' ? 'longFull' : 'shortFull') });
        panel.querySelectorAll('[data-variant]').forEach(b => { b.classList.toggle('active', b.dataset.variant === prefs.variant); b.setAttribute('aria-checked', String(b.dataset.variant === prefs.variant)); });
        panel.querySelectorAll('[data-level]').forEach(b => b.classList.toggle('active', Number(b.dataset.level) === prefs.level));
        showRating(ratingCache?.data || null);
        const away = elsewhereGame();
        panel.querySelector('[data-sheet="takeover"]').hidden = !away;
        if (away) refs.s_elsewhereHint.textContent = [tr('playHere'), away.opponent?.name, tr(away.variant === 'short' ? 'shortFull' : 'longFull')].filter(Boolean).join(' · ');
        const saved = savedGame();
        const cont = panel.querySelector('[data-sheet="continue"]');
        cont.hidden = !saved;
        if (saved) {
            const who = saved.mode === 'bot' ? tr('botName', { level: tr(`level${core.botLevel(saved.level).level}`) }) : tr('modeLocal');
            refs.s_continueHint.textContent = `${tr(saved.variant === 'short' ? 'shortFull' : 'longFull')} · ${who} · ${tr('turnsCount', { n: saved.turns || 1 })}`;
        }
    }
    function setTab(tab, animate = true) {
        prefs.tab = ['bot', 'online', 'local'].includes(tab) ? tab : 'bot';
        savePrefs();
        const panel = sheetEl.querySelector('.ui-mode-panel');
        const tabs = [...panel.querySelectorAll('[data-tab]')];
        const index = tabs.findIndex(b => b.dataset.tab === prefs.tab);
        tabs.forEach(b => b.classList.toggle('active', b.dataset.tab === prefs.tab));
        refs.s_glider.style.transition = animate ? '' : 'none';
        refs.s_glider.style.transform = `translateX(${index * 100}%)`;
        panel.querySelectorAll('[data-panel]').forEach(p => p.classList.toggle('active', p.dataset.panel === prefs.tab));
        clearInterval(roomsTimer);
        if (prefs.tab === 'online') {
            loadRating();
            requestRooms();
            roomsTimer = setInterval(requestRooms, 5000);
        }
    }
    function onSheetClick(event) {
        Sound.unlock();
        const tab = event.target.closest('[data-tab]');
        if (tab) { setTab(tab.dataset.tab); haptic('select'); return; }
        const variant = event.target.closest('[data-variant]');
        if (variant) { prefs.variant = variant.dataset.variant; savePrefs(); refreshSheetTexts(); if (prefs.tab === 'online') requestRooms(); haptic('select'); return; }
        const level = event.target.closest('[data-level]');
        if (level) { prefs.level = Number(level.dataset.level); savePrefs(); refreshSheetTexts(); haptic('select'); return; }
        const join = event.target.closest('[data-join]');
        if (join) { joinRoom(join.dataset.join); return; }
        const button = event.target.closest('[data-sheet]');
        if (!button) return;
        switch (button.dataset.sheet) {
            case 'close': closeSheet(); return;
            case 'continue': haptic('light'); continueSaved(); return;
            case 'takeover': haptic('light'); emit('nd_rejoin', { roomCode: elsewhereGame()?.roomCode, takeover: true }); return;
            case 'playBot': haptic('light'); closeSheet(); localStorage.removeItem(SAVE_KEY); startOffline({ mode: 'bot', variant: prefs.variant, level: prefs.level }); return;
            case 'playLocal': haptic('light'); closeSheet(); localStorage.removeItem(SAVE_KEY); startOffline({ mode: 'local', variant: prefs.variant, level: 2 }); return;
            case 'quick': quickMatch(); return;
            case 'create': if (emit('nd_create', { ...profilePayload(), variant: prefs.variant, isPublic: true })) haptic('light'); return;
            case 'code': refs.s_codeRow.classList.toggle('show'); if (refs.s_codeRow.classList.contains('show')) refs.s_codeInput.focus(); return;
            case 'join': joinByCode(); return;
            case 'refresh': requestRooms(); haptic('light'); button.classList.remove('spin'); void button.offsetWidth; button.classList.add('spin'); return;
            default: return;
        }
    }
    function profilePayload() {
        const user = me();
        return { username: myName(), photo_url: user?.photo_url || '', lang: lang() };
    }
    function quickMatch() {
        if (!emit('nd_quick', { ...profilePayload(), variant: prefs.variant })) return;
        haptic('light');
        showWait({ quick: true, variant: prefs.variant });
    }
    function joinByCode() {
        const code = refs.s_codeInput.value.trim();
        if (!/^\d{5}$/.test(code)) { toast(tr('e_roomNotFound'), 'error'); return; }
        joinRoom(code);
    }
    function joinRoom(code) {
        emit('nd_join', { ...profilePayload(), roomCode: String(code) });
        haptic('light');
    }
    function requestRooms() { emit('nd_list', {}); }

    function roomHtml(room) {
        const avatar = typeof room.avatar === 'string' && /^https:\/\//i.test(room.avatar)
            ? `<img class="ck-room-ava" src="${esc(room.avatar)}" alt="" referrerpolicy="no-referrer">`
            : `<span class="ck-room-ava">${esc((room.name || '?').slice(0, 1).toUpperCase())}</span>`;
        return `${avatar}<div class="ck-room-text"><b>${flagHtml(room.lang)}${esc(room.name)}</b><small>${esc(tr('rating'))} ${esc(room.rating || core.START_RATING)}</small></div>
            <span class="nd-room-variant">${esc(tr(room.variant === 'short' ? 'short' : 'long'))}</span>
            <button class="ck-room-join" type="button" data-join="${esc(room.code)}">${esc(tr('join'))}</button>`;
    }
    /** Строки комнат не пересоздаются каждые 5 с: новые появляются, ушедшие сворачиваются. */
    function renderRooms(all) {
        const list = refs.s_rooms;
        if (!list) return;
        const rooms = all.filter(r => r.variant === prefs.variant);
        const live = el => !el.classList.contains('is-leaving');
        const rows = new Map([...list.querySelectorAll('.ck-room[data-code]')].filter(live).map(el => [el.dataset.code, el]));
        const codes = new Set(rooms.map(r => String(r.code)));
        for (const [code, el] of rows) {
            if (codes.has(code)) continue;
            el.classList.add('is-leaving');
            el.querySelector('[data-join]')?.removeAttribute('data-join');
            setTimeout(() => el.remove(), REDUCED_MOTION ? 0 : 280);
        }
        const empty = list.querySelector('.ck-empty');
        if (!rooms.length) {
            if (!empty) list.insertAdjacentHTML('beforeend', `<div class="ck-empty"><b>${esc(tr('noRooms'))}</b>${esc(tr('noRoomsHint'))}</div>`);
            return;
        }
        empty?.remove();
        const nextLive = node => { while (node && !live(node)) node = node.nextElementSibling; return node; };
        let prev = null;
        for (const room of rooms) {
            const code = String(room.code);
            const html = roomHtml(room);
            let el = rows.get(code);
            if (!el) {
                el = document.createElement('div');
                el.className = 'ck-room';
                el.dataset.code = code;
                el.addEventListener('animationend', () => el.classList.add('is-settled'), { once: true });
            }
            if (el.dataset.sig !== html) { el.innerHTML = html; el.dataset.sig = html; }
            const at = nextLive(prev ? prev.nextElementSibling : list.firstElementChild);
            if (at !== el) list.insertBefore(el, at);
            prev = el;
        }
    }

    async function fetchProfile() {
        if (ratingCache && Date.now() - ratingCache.at < 30000) return ratingCache.data;
        try {
            const response = await fetch(`${typeof API_BASE_URL === 'string' ? API_BASE_URL : ''}/api/nardy/profile`, { headers: { 'X-Init-Data': tg?.initData || '' } });
            if (!response.ok) throw new Error(String(response.status));
            const data = await response.json();
            ratingCache = { at: Date.now(), data };
            return data;
        } catch (_) { return ratingCache?.data || null; }
    }
    async function loadRating() { showRating(await fetchProfile()); }
    function showRating(data) {
        if (!refs.s_myRatingLabel) return;
        const row = data?.categories?.[prefs.variant] || null;
        refs.s_myRatingLabel.textContent = `${tr('yourRating')} · ${tr(prefs.variant === 'long' ? 'longFull' : 'shortFull')}`;
        refs.s_myRating.textContent = String(row?.rating || core.START_RATING);
        refs.s_myGames.textContent = row?.games ? tr('gamesShort', { n: row.games }) : '';
    }

    let waitInfo = null;
    function showWait(data) {
        waitInfo = { ...waitInfo, ...data };
        const quick = !!waitInfo.quick;
        refs.w_waitTitle.textContent = quick ? tr('searching') : tr('waitingFriend');
        refs.w_waitCodeBox.hidden = quick;
        if (data.roomCode) refs.w_waitCode.textContent = data.roomCode;
        refs.w_waitVariant.textContent = tr(waitInfo.variant === 'short' ? 'shortFull' : 'longFull');
        applyTexts(waitEl);
        waitEl.classList.add('visible');
    }
    function hideWait() {
        waitInfo = null;
        waitEl?.classList.remove('visible');
    }
    function cancelWait() {
        emit('nd_cancel', {});
        hideWait();
    }
    const inviteLink = code => `https://t.me/spark_game_bot/sparkapp?startapp=nd_${code}`;
    async function inviteFriend() {
        const code = waitInfo?.roomCode;
        if (!code) return;
        haptic('light');
        if (typeof sharePreparedMessage === 'function' && await sharePreparedMessage('nardy', code)) return;
        const url = `https://t.me/share/url?url=${encodeURIComponent(inviteLink(code))}&text=${encodeURIComponent(tr('inviteText', { name: myName() }))}`;
        if (tg?.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
    }
    function elsewhereGame() {
        const away = window.__nardyElsewhere;
        return away && away.roomCode && Date.now() - (away.at || 0) < 3600e3 ? away : null;
    }
    function openSheet(tab) {
        if (!sheetEl) return;
        if (typeof socket !== 'undefined' && socket?.connected && !game) socket.emit('nd_rejoin');
        refreshSheetTexts();
        setTab(tab || prefs.tab || 'bot', false);
        sheetEl.classList.add('visible');
    }
    function closeSheet() {
        clearInterval(roomsTimer);
        sheetEl?.classList.remove('visible');
    }

    /* ---------- запуск ---------- */
    function init() {
        if (ready) return ready;
        ready = Promise.resolve().then(() => {
            buildScreen();
            buildSheet();
            bindSocket();
            return api;
        });
        ready.catch(() => { ready = null; });
        return ready;
    }

    const api = {
        init,
        openSheet,
        closeSheet,
        cancelWait,
        isPlaying: () => !!game && !game.over && screen?.classList.contains('visible'),
        get ready() { return !!ready && !!screen; },
        refreshLanguage() {
            if (!screen) return;
            applyTexts(screen);
            if (sheetEl?.classList.contains('visible')) refreshSheetTexts();
            if (game) { renderAll(); if (ui.dialog?.kind === 'result') showResult(); }
        },
        joinInvite(code) { if (/^\d{5}$/.test(String(code))) joinRoom(String(code)); },
        handleStart(data) { if (data && data.roomCode) enqueue(() => onlineStart(data)); },
        // для отладки и тестов
        _state: () => ({ game, view, ui, settings }),
    };
    window.SparkNardy = api;
})();
