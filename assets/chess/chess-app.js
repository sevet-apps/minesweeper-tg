/* Spark Chess: партия на доске, бот (Stockfish), игра вдвоём, онлайн и
   подсказка лучшего хода для владельца. Подключается лениво из index.html,
   после chess-core.js и chess-i18n.js; правила — chess.js (ES-модуль). */
(function () {
    'use strict';
    if (window.SparkChess) return;

    const BASE = new URL('.', document.currentScript?.src || location.href).href;
    // Версия из адреса скрипта: новые звуки не застревают в кэше Telegram.
    const VERSION = new URL(document.currentScript?.src || location.href).searchParams.get('v') || '';
    const core = window.SparkChessCore;
    const I18N = window.SparkChessI18n;
    const OWNER_ID = '1482228376';
    const SAVE_KEY = 'chess_saved_game';
    const SETTINGS_KEY = 'chess_settings';
    const PREFS_KEY = 'chess_prefs';
    const STATS_KEY = 'chess_stats';
    const HINT_KEY = 'chess_admin_hint';
    const HISTORY_KEY = 'chess_history';              // партии с ботом и вдвоём на этом устройстве
    const HISTORY_CACHE_KEY = 'chess_history_cache';  // последний список партий с сервера
    const PIECE_NAMES = 'KQRBNP';
    const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // Тактильная система: физика фигур, морфинг, звуки материала (chess-feel.js, chess-sfx.js).
    const Feel = window.SparkChessFeel;
    const FINE_POINTER = !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

    let Chess = null;
    let ready = null;

    /* ---------- окружение приложения ---------- */
    const tg = window.Telegram?.WebApp;
    const lang = () => (typeof currentLang === 'string' ? currentLang : 'ru');
    const tr = (key, vars) => I18N.t(lang(), key, vars);
    const esc = value => String(value == null ? '' : value).replace(/[&<>"'`]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[ch]));
    const me = () => tg?.initDataUnsafe?.user || null;
    const isOwner = () => String(me()?.id || '') === OWNER_ID;
    /** Экшен-режим пока в тесте: только у владельца. */
    const actionOn = () => !!settings.action && isOwner() && game?.mode !== 'puzzle';
    const myName = () => (typeof tgName === 'function' ? tgName(me()) : (me()?.first_name || tr('you')));
    const pieceUrl = code => `${BASE}pieces/${code}.svg`;
    const FLAG_LANGS = ['ru', 'en', 'zh', 'es', 'pt', 'id', 'fr', 'ja', 'de', 'ko', 'tr', 'vi'];
    /** Круглый флаг языка игрока, как в настройках языка приложения. */
    const flagHtml = code => (FLAG_LANGS.includes(code) ? `<i class="cs-flag" style="background-image:url('${BASE}../flags/${code}.svg?v=20261022')"></i>` : '');
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const readJson = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v ?? fallback; } catch (_) { return fallback; } };
    const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} };

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
            if (action === 'begin' && typeof beginGamePlaytime === 'function') beginGamePlaytime('chess');
            if (action === 'stop' && typeof stopGamePlaytime === 'function') stopGamePlaytime('chess');
            if (action === 'note' && typeof noteGamePlaytimeAction === 'function') noteGamePlaytimeAction('chess');
        } catch (_) {}
    }

    const ICON = {
        expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5"/></svg>',
        collapse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14h6v6M20 10h-6V4M14 10l6.5-6.5M10 14l-6.5 6.5"/></svg>',
        history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/><path d="M12 7.5V12l3 2"/></svg>',
        mOnline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5S9.4 5.9 12 3.5z"/></svg>',
        mBot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="7.5" width="15" height="12" rx="3.5"/><path d="M12 3.5v4M9.2 12.6h.01M14.8 12.6h.01M9.5 16.2h5"/></svg>',
        mLocal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9.5" r="2.5"/><path d="M15.8 14.4a4.4 4.4 0 0 1 5 4.6"/></svg>',
        back: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
        gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
        bulb: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z"/></svg>',
        prev: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
        next: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
        first: '<svg viewBox="0 0 24 24"><path d="M17 18l-6-6 6-6M7 6v12"/></svg>',
        last: '<svg viewBox="0 0 24 24"><path d="M7 6l6 6-6 6M17 6v12"/></svg>',
        flip: '<svg viewBox="0 0 24 24"><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/></svg>',
        undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
        flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
        draw: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor"/></svg>',
        abort: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/></svg>',
        plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
        rematch: '<svg viewBox="0 0 24 24"><path d="M5.24 10.19A7 7 0 0 1 17.36 7.5M18.76 13.81A7 7 0 0 1 6.64 16.5"/><path d="M19.03 9.49 19.28 5.89 15.45 9.11ZM4.97 14.51 4.72 18.11 8.55 14.89Z" fill="currentColor"/></svg>',
        trophy: '<svg viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>',
        handshake: '<svg viewBox="0 0 24 24"><path d="M12 6 8.5 4.5 3 7v7l3 1.5M12 6l3.5-1.5L21 7v7l-5.5 3.5"/><path d="M12 6 9 9.5a1.6 1.6 0 0 0 2.3 2.2L13 10l4.5 4.5M15.5 17.5l-2-2M12.5 19l-2-2M9 18.5 7.5 17"/></svg>',
        broken: '<svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/><path d="m15 15 5 5M20 15l-5 5"/></svg>',
        search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>',
        arrow: '<svg class="ck-hero-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>',
        key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.7-8.7M16 7l3 3M14 9l2 2"/></svg>',
        add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
        refresh: '<span class="refresh-glyph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.24 10.19A7 7 0 0 1 17.36 7.50M18.76 13.81A7 7 0 0 1 6.64 16.50"/><path d="M19.03 9.49L19.28 5.89L15.45 9.11ZM4.97 14.51L4.72 18.11L8.55 14.89Z" fill="currentColor" stroke-width=".6"/></svg></span>',
        send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3 3 10.5l7 2.5 2.5 7z"/><path d="m10 13 4-4"/></svg>',
        chevron: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
        pen: '<svg viewBox="0 0 24 24"><path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20z"/><path d="M14 7l3 3"/></svg>',
        target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
        flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c-3.9 0-6.5-2.6-6.5-6.1 0-3.4 2.4-5.3 3.6-8 .4 1.9 1.5 3 2.6 3.5-.3-3 .9-5.7 3.2-7.4.2 3.1 4.6 5.3 4.6 10.6C19.5 18.1 16.3 21 12 21z"/></svg>',
        calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M9 15l2 2 4-4"/></svg>',
        eye: '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>',
        device: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.75" width="10" height="18.5" rx="2.6"/><path d="M10.37 8.9v6.2l4.9-3.1z"/></svg>',
        qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z"/><path d="M14 14h2v2h-2zM19 14h1M14 19v1M18 18h2v2h-2z"/></svg>',
    };

    /* ---------- настройки ---------- */
    const settings = Object.assign({ sound: true, coords: true, showMoves: true, feelStyle: 'glass', feelLevel: 'balanced', talk: false, autoFlip: false, action: true, review: true, botLabel: true, skin: 'classic' }, readJson(SETTINGS_KEY, {}));
    if (!Feel?.STYLES.includes(settings.feelStyle)) settings.feelStyle = 'glass';
    if (!Feel?.LEVELS.includes(settings.feelLevel)) settings.feelLevel = 'balanced';
    const prefs = Object.assign({ tab: 'bot', level: 3, color: 'w', botTc: 'none', localTc: 'none', onlineTc: core.DEFAULT_ONLINE_TC }, readJson(PREFS_KEY, {}));
    const saveSettings = () => writeJson(SETTINGS_KEY, settings);
    // Владельцу сервер дописывает к нику бота « (бот)»; в настройках он может эту приписку спрятать.
    const BOT_LABEL_RE = / \(бот\)$/;
    const nick = name => (name && settings.botLabel === false && isOwner() ? String(name).replace(BOT_LABEL_RE, '') : name);
    const savePrefs = () => writeJson(PREFS_KEY, prefs);

    /* ---------- скины доски ----------
       Базовые доступны всем; премиальные открываются лучшим рейтингом (peak)
       в своём режиме — после проигрышей доска не пропадает. Скин видит только
       тот, кто его выбрал: у соперника на экране своя доска. */
    const SKINS = Object.freeze([
        { id: 'classic' }, { id: 'slate' }, { id: 'sage' }, { id: 'wood', tex: true },
        { id: 'ice', unlock: { cat: 'bullet', elo: 1300 } },
        { id: 'rosewood', unlock: { cat: 'rapid', elo: 1400 }, tex: true },
        { id: 'emerald', unlock: { cat: 'blitz', elo: 1500 }, tex: true },
        { id: 'marble', unlock: { cat: 'classical', elo: 1700 }, tex: true },
        { id: 'sapphire', unlock: { cat: 'bullet', elo: 1800 }, tex: true },
        { id: 'obsidian', unlock: { cat: 'blitz', elo: 2000 }, tex: true },
        { id: 'gold', unlock: { cat: 'rapid', elo: 2100 } },
        { id: 'cosmos', unlock: { cat: 'blitz', elo: 2300 }, tex: true },
        { id: 'platinum', unlock: { cat: 'bullet', elo: 2500 }, tex: true },
    ].map(Object.freeze));
    function skinUnlocked(skin, profile) {
        if (!skin.unlock || isOwner()) return true;
        const row = profile?.categories?.[skin.unlock.cat];
        return Math.max(Number(row?.peak) || 0, Number(row?.rating) || 0) >= skin.unlock.elo;
    }
    /** Фактура доски — картинки плит (scripts/build-chess-textures.py). Адреса
        задаются из JS абсолютными: url() в CSS-переменной браузеры разрешают по-разному. */
    function texVars(skin, small) {
        if (!skin.tex) return '';
        const v = VERSION ? `?v=${VERSION}` : '';
        const sm = small ? '-sm' : '';
        return `--cs-light-tex:url('${BASE}boards/${skin.id}-light${sm}.jpg${v}');--cs-dark-tex:url('${BASE}boards/${skin.id}-dark${sm}.jpg${v}');--cs-tex-size:800% 800%;`;
    }
    function applySkin() {
        if (!screen) return;
        const skin = SKINS.find(item => item.id === settings.skin) || SKINS[0];
        const ok = skinUnlocked(skin, ratingCache?.data);
        // Пока профиль не загружен, премиальную доску не снимаем — проверим, когда придут данные.
        const current = ok || !ratingCache ? skin : SKINS[0];
        if (current.id === 'classic') delete screen.dataset.skin; else screen.dataset.skin = current.id;
        for (const name of ['--cs-light-tex', '--cs-dark-tex', '--cs-tex-size']) screen.style.removeProperty(name);
        if (current.tex) for (const part of texVars(current, false).split(';').filter(Boolean)) {
            const i = part.indexOf(':');
            screen.style.setProperty(part.slice(0, i), part.slice(i + 1));
        }
    }

    /* ---------- звук (Web Audio: без задержек и с наложением) ---------- */
    const Sound = {
        ctx: null, buffers: {}, loading: null,
        names: ['move', 'move2', 'capture', 'castle', 'check', 'promote', 'start', 'win', 'lose', 'draw', 'lowtime', 'notify'],
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
            this.loading = Promise.all(this.names.map(name => fetch(`${BASE}sounds/${name}.mp3${VERSION ? `?v=${VERSION}` : ''}`)
                .then(r => r.arrayBuffer())
                .then(data => new Promise((resolve, reject) => this.ctx.decodeAudioData(data, resolve, reject)))
                .then(buffer => { this.buffers[name] = buffer; })
                .catch(() => {})));
            return this.loading;
        },
        /** when — через сколько секунд (точно по часам звука: совпадает с касанием фигуры). */
        play(name, volume = 1, when = 0) {
            if (!settings.sound || !this.ctx || !this.buffers[name]) return;
            try {
                if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
                const source = this.ctx.createBufferSource();
                const gain = this.ctx.createGain();
                source.buffer = this.buffers[name];
                source.playbackRate.value = name.startsWith('move') ? 0.96 + Math.random() * 0.08 : 1;
                gain.gain.value = volume;
                source.connect(gain).connect(this.ctx.destination);
                source.start(this.ctx.currentTime + Math.max(0, when));
            } catch (_) {}
        },
    };
    /** Синтезированные звуки материала (chess-sfx.js) — в характере выбранного стиля. */
    const Sfx = window.SparkChessSfx?.createSfx(() => Sound.ctx) || null;
    function sfx(name, { when = 0, gain = 1, arg } = {}) {
        if (!settings.sound || !Sfx || !Sound.ctx) return;
        Sfx.play(name, { style: settings.feelStyle, level: feelLevel(), when, gain, arg });
    }

    /** Звук хода — в момент касания клетки (at, мс). Шах звучит своим резонансом. */
    function playMoveSound(move, inCheck, at = 0) {
        const w = at / 1000;
        const lv = feelLevel();
        if (move.flags.includes('k') || move.flags.includes('q')) { Sound.play('castle', 1, w); Sound.play('move2', 0.9, w + 0.11); }
        else if (move.captured) { Sound.play('capture', 1, w); sfx('capture', { when: w, gain: lv === 'minimal' ? 0.6 : 1 }); }
        else { Sound.play(Math.random() < 0.5 ? 'move' : 'move2', 1, w); if (lv !== 'minimal') sfx('place', { when: w }); }
        if (inCheck) sfx('check', { when: w + 0.05 });
    }

    /* ---------- Stockfish в Web Worker ---------- */
    class Engine {
        constructor({ hash = 16, threads = 1, url = null } = {}) {
            this.listeners = new Set();
            this.queue = Promise.resolve();
            this.skill = null;
            this.threads = threads;
            this.hash = hash;
            this.worker = new Worker(url || `${BASE}engine/stockfish.js`);
            this.worker.onmessage = event => {
                const line = typeof event.data === 'string' ? event.data : String(event.data || '');
                for (const fn of [...this.listeners]) fn(line);
            };
            this.ready = new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('engine timeout')), 20000);
                this.worker.onerror = error => { clearTimeout(timer); reject(error instanceof Error ? error : new Error('engine failed')); };
                this.wait('uci', line => line === 'uciok')
                    .then(() => {
                        if (threads > 1) this.send(`setoption name Threads value ${threads}`);
                        this.send(`setoption name Hash value ${hash}`);
                        return this.wait('isready', line => line === 'readyok');
                    })
                    .then(() => { clearTimeout(timer); resolve(); }, reject);
            });
        }
        send(command) { this.worker.postMessage(command); }
        wait(command, test) {
            return new Promise(resolve => {
                const fn = line => { if (test(line)) { this.listeners.delete(fn); resolve(line); } };
                this.listeners.add(fn);
                this.send(command);
            });
        }
        /** Один поиск за раз: команды разных поисков не перемешиваются. */
        /** multipv > 1 — несколько лучших продолжений (lines[1], lines[2]…). */
        search({ fen, skill = 20, depth = null, movetime = null, multipv = 1, onInfo = null }) {
            const job = this.queue.then(() => this.ready).then(() => new Promise(resolve => {
                if (this.skill !== skill) { this.send(`setoption name Skill Level value ${skill}`); this.skill = skill; }
                if ((this.multipv || 1) !== multipv) { this.send(`setoption name MultiPV value ${multipv}`); this.multipv = multipv; }
                const turn = fen.split(' ')[1] || 'w';
                let score = null;
                const lines = {};
                const fn = line => {
                    if (line.startsWith('info') && line.includes(' pv ')) {
                        const s = line.match(/ score (cp|mate) (-?\d+)/);
                        const pv = line.match(/ pv (.+)$/);
                        const d = line.match(/ depth (\d+)/);
                        const mp = line.match(/ multipv (\d+)/);
                        if (s && !/ (?:lower|upper)bound/.test(line)) {
                            const sign = turn === 'w' ? 1 : -1;
                            const k = mp ? Number(mp[1]) : 1;
                            const sc = { type: s[1], value: Number(s[2]) * sign, depth: d ? Number(d[1]) : 0 };
                            const move = pv ? pv[1].split(' ')[0] : null;
                            lines[k] = { score: sc, move };
                            if (k === 1) score = sc;
                            if (onInfo && pv) onInfo({ score: sc, move, multipv: k });
                        }
                    } else if (line.startsWith('bestmove')) {
                        this.listeners.delete(fn);
                        const best = line.split(' ')[1];
                        resolve({ bestmove: best && best !== '(none)' ? best : null, score, lines });
                    }
                };
                this.listeners.add(fn);
                this.send(`position fen ${fen}`);
                const limits = [];
                if (depth) limits.push(`depth ${depth}`);
                if (movetime) limits.push(`movetime ${movetime}`);
                this.send(`go ${limits.join(' ') || 'depth 12'}`);
            }));
            this.queue = job.catch(() => {});
            return job;
        }
        stop() { try { this.send('stop'); } catch (_) {} }
        terminate() { try { this.worker.terminate(); } catch (_) {} }
    }
    const engines = { bot: null, hint: null, action: null, review: null };
    function engine(kind) {
        if (!engines[kind]) {
            const options = kind === 'hint' ? hintEngineOptions() : { hash: 16 };
            const created = engines[kind] = new Engine(options);
            created.ready.catch(() => {
                if (options.threads > 1) mtFailed = true;   // многопоточный не завёлся — дальше обычный
                created.terminate();
                if (engines[kind] === created) engines[kind] = null;
            });
        }
        return engines[kind];
    }

    /* ---------- подсказка владельца на компьютере: движок на полную ----------
       На телефоне подсказка бережёт батарею: один поток, 32 МБ, глубина 30.
       На компьютере владельца — многопоточный Stockfish на все ядра (кроме
       одного), большая хеш-таблица и расчёт без потолка, пока ход твой.
       Потокам нужна изолированная страница: её даёт chess-isolation-sw.js,
       он ставится здесь же и включается со следующего запуска приложения. */
    const DESKTOP = FINE_POINTER && (navigator.hardwareConcurrency || 0) >= 4;
    const ISOLATION_SW = new URL('../../chess-isolation-sw.js', BASE).href;
    let mtFailed = false;
    const maxHint = () => isOwner() && DESKTOP;
    const canThreads = () => typeof SharedArrayBuffer === 'function' && window.crossOriginIsolated === true && !mtFailed;
    function hintEngineOptions() {
        if (!maxHint()) return { hash: 32 };
        const cores = navigator.hardwareConcurrency || 4;
        const memory = navigator.deviceMemory || 8;          // браузер называет не больше 8 ГБ
        if (canThreads()) return { url: `${BASE}engine/stockfish-mt.js${VERSION ? `?v=${VERSION}` : ''}`, threads: Math.max(2, Math.min(cores - 1, 32)), hash: memory >= 8 ? 1024 : 512 };
        return { hash: memory >= 8 ? 512 : 256 };
    }
    /** Ставит service worker изоляции на компьютере владельца; у остальных — снимает, если остался. */
    function setupIsolation() {
        if (!('serviceWorker' in navigator)) return;
        try {
            if (maxHint()) navigator.serviceWorker.register(ISOLATION_SW).catch(() => {});
            else navigator.serviceWorker.getRegistrations().then(list => list.forEach(reg => {
                if ((reg.active || reg.waiting || reg.installing)?.scriptURL === ISOLATION_SW) reg.unregister();
            })).catch(() => {});
        } catch (_) {}
    }

    /* ---------- DOM ---------- */
    let screen, sheetEl, waitEl, refs = {};
    const view = { orientation: 'w', els: new Map(), size: 0 };
    const ui = { selected: null, targets: [], preMode: false, drag: null, hover: null, promo: null, banner: null, dialog: null };
    let game = null;
    let clockTimer = null;
    let botToken = 0;
    let hintToken = 0;
    let lowTimeWarned = false;

    function buildScreen() {
        screen = document.getElementById('chess-screen');
        screen.innerHTML = `
            <div class="game-overlay-bg" id="bgPatternChess"></div>
            <div class="game-top-bar">
                <div class="back-btn" data-act="back">${ICON.back}<span data-t="menu"></span></div>
                <div class="cs-title"><b data-ref="title"></b><small data-ref="status"></small></div>
                <div class="cs-top-actions">
                    <span class="cs-eval" data-ref="eval"></span>
                    <button class="cs-icon-btn" type="button" data-act="hint" data-ref="hintBtn" hidden>${ICON.bulb}</button>
                    <button class="cs-icon-btn" type="button" data-act="settings" data-ref="settingsBtn">${ICON.gear}</button>
                </div>
            </div>
            <div class="cs-main" data-ref="main">
                <div class="cs-col" data-ref="col">
                <div class="cs-player" data-ref="topPlayer"></div>
                <div class="cs-board-wrap" data-ref="frame">
                    <div class="cs-coords cs-files top" data-ref="filesTop" aria-hidden="true"></div>
                    <div class="cs-coords cs-files bottom" data-ref="filesBottom" aria-hidden="true"></div>
                    <div class="cs-coords cs-ranks left" data-ref="ranksLeft" aria-hidden="true"></div>
                    <div class="cs-coords cs-ranks right" data-ref="ranksRight" aria-hidden="true"></div>
                    <div class="cs-board" data-ref="board">
                        <div class="cs-cam" data-ref="cam">
                            <div class="cs-squares" data-ref="squares"></div>
                            <div class="cs-tension" data-ref="tension" aria-hidden="true"></div>
                            <svg class="cs-threads" data-ref="threads" viewBox="0 0 8 8" preserveAspectRatio="none" aria-hidden="true"></svg>
                            <div class="cs-layer" data-ref="marks"></div>
                            <div class="cs-layer cs-fx" data-ref="fx" aria-hidden="true"></div>
                            <div class="cs-pieces" data-ref="pieces"></div>
                            <div class="cs-badges" data-ref="badges"></div>
                            <svg class="cs-arrows cs-notes" data-ref="notes" viewBox="0 0 8 8" preserveAspectRatio="none" aria-hidden="true"></svg>
                            <svg class="cs-arrows" data-ref="arrows" viewBox="0 0 8 8" preserveAspectRatio="none" aria-hidden="true"></svg>
                        </div>
                    </div>
                    <div class="cs-pills" data-ref="pills" aria-hidden="true"></div>
                    <div class="cs-talk" data-ref="talk" aria-hidden="true"></div>
                </div>
                <div class="cs-player" data-ref="bottomPlayer"></div>
                </div>
                <div class="cs-side" data-ref="side">
                    <div class="cs-side-head" data-t="movesTitle"></div>
                    <div class="cs-coach" data-ref="coach" hidden></div>
                    <div class="cs-moves">
                        <button class="cs-nav cs-nav-end" type="button" data-act="first" data-ref="firstBtn">${ICON.first}</button>
                        <button class="cs-nav" type="button" data-act="prev" data-ref="prevBtn">${ICON.prev}</button>
                        <div class="cs-movelist" data-ref="moveList"></div>
                        <button class="cs-nav" type="button" data-act="next" data-ref="nextBtn">${ICON.next}</button>
                        <button class="cs-nav cs-nav-end" type="button" data-act="last" data-ref="lastBtn">${ICON.last}</button>
                    </div>
                    <div class="cs-actions" data-ref="actions"></div>
                </div>
            </div>
            <div class="cs-banner" data-ref="banner"><p></p></div>
            <div class="cs-sheet-scrim" data-ref="scrim"></div>
            <div class="cs-sheet" data-ref="sheet" role="dialog" aria-modal="true"></div>`;
        refs = {};
        screen.querySelectorAll('[data-ref]').forEach(el => { refs[el.dataset.ref] = el; });
        applyFeel();
        screen.addEventListener('click', onScreenClick);
        refs.scrim.addEventListener('click', () => { if (ui.dialog?.dismissable !== false) closeDialog(); });
        bindBoard();
        window.addEventListener('resize', () => { if (screen.classList.contains('visible')) layout(); });
        document.addEventListener('keydown', onKey);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) { hintToken++; engines.hint?.stop(); engines.review?.stop(); }
            else if (screen.classList.contains('visible')) { scheduleHint(); scheduleReview(); }
        });
        if (typeof updateBackgroundPatterns === 'function') updateBackgroundPatterns();
        applyTexts(screen);
    }

    /** ← → листают ходы, Home / End — к началу и к концу партии. */
    function onKey(event) {
        if (!game || !screen.classList.contains('visible') || ui.dialog || ui.promo || event.altKey || event.ctrlKey || event.metaKey) return;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
        const current = game.view == null ? game.moves.length : game.view;
        const target = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: game.moves.length }[event.key];
        if (target == null) return;
        event.preventDefault();
        setView(target);
    }

    function applyTexts(root) {
        root.querySelectorAll('[data-t]').forEach(el => { el.textContent = tr(el.dataset.t); });
    }

    /** Размер доски: сколько помещается между шапкой и кнопками.
        На широком окне (Telegram на компьютере) ходы, стрелки и кнопки
        уходят в панель справа от доски, а доска занимает всю высоту. */
    const SIDE_GAP = 18;
    function layout() {
        const main = refs.main;
        if (!main) return;
        const style = getComputedStyle(main);
        const gap = parseFloat(style.rowGap) || 10;
        const width = main.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const full = main.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        const players = refs.topPlayer.offsetHeight + refs.bottomPlayer.offsetHeight;
        const side = Math.round(Math.max(270, Math.min(360, width * 0.3)));
        // широкий вид — только если доска в нём не меньше, чем в обычном
        const narrowAvail = Math.min(width, full - players - 190, 600);
        const wideAvail = Math.min(width - side - SIDE_GAP, full - players - gap * 2, 760);
        const wide = width >= 640 && wideAvail >= narrowAvail - 16;
        screen.classList.toggle('is-wide', wide);
        screen.style.setProperty('--cs-side', `${side}px`);
        let avail = wideAvail;
        if (!wide) {
            const flow = [refs.topPlayer, refs.frame, refs.bottomPlayer, refs.coach, screen.querySelector('.cs-moves'), refs.actions].filter(el => el && !el.hidden);
            const others = flow.reduce((sum, el) => sum + (el === refs.frame ? 0 : el.offsetHeight), 0);
            avail = Math.min(width, full - others - gap * (flow.length - 1), 600);
        }
        // Рамка вокруг доски: поля с буквами и цифрами одинаковые со всех сторон.
        const margin = settings.coords ? Math.max(15, Math.min(22, Math.round(avail * 0.046))) : 9;
        const size = Math.max(200, Math.floor((avail - 2 * margin) / 8) * 8);
        view.size = size;
        screen.style.setProperty('--cs-size', `${size}px`);
        screen.style.setProperty('--cs-margin', `${margin}px`);
        screen.style.setProperty('--cs-outer', `${size + 2 * margin}px`);
        screen.style.setProperty('--cs-col-h', `${refs.col.offsetHeight}px`);
        const anchor = wide ? refs.frame.getBoundingClientRect().bottom - 64 : screen.querySelector('.cs-moves').getBoundingClientRect().top;
        screen.style.setProperty('--cs-banner-top', `${Math.max(8, anchor - screen.getBoundingClientRect().top - 4)}px`);
        renderMoveList();
    }

    /* ---------- координаты на доске ---------- */
    function sqXY(sq) {
        const f = sq.charCodeAt(0) - 97, r = Number(sq[1]) - 1;
        return view.orientation === 'w' ? [f, 7 - r] : [7 - f, r];
    }
    function xySq(x, y) {
        const f = view.orientation === 'w' ? x : 7 - x;
        const r = view.orientation === 'w' ? 7 - y : y;
        return String.fromCharCode(97 + f) + (r + 1);
    }
    const tf = (x, y) => `translate(${(x * 100).toFixed(2)}%, ${(y * 100).toFixed(2)}%)`;
    const sqTf = sq => { const [x, y] = sqXY(sq); return tf(x, y); };

    function buildSquares() {
        let html = '';
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const sq = xySq(x, y);
                const dark = (sq.charCodeAt(0) - 97 + Number(sq[1]) - 1) % 2 === 0;
                html += `<div class="cs-sq${dark ? ' d' : ''}" style="--x:${x};--y:${y}"></div>`;
            }
        }
        refs.squares.innerHTML = html;
        // Подписи на полях рамки: слева направо и сверху вниз — как видит игрок.
        const files = [0, 1, 2, 3, 4, 5, 6, 7].map(x => `<span>${xySq(x, 7)[0]}</span>`).join('');
        const ranks = [0, 1, 2, 3, 4, 5, 6, 7].map(y => `<span>${xySq(0, y)[1]}</span>`).join('');
        refs.filesTop.innerHTML = refs.filesBottom.innerHTML = files;
        refs.ranksLeft.innerHTML = refs.ranksRight.innerHTML = ranks;
        refs.frame.classList.toggle('no-coords', !settings.coords);
    }

    /* ---------- тактильная система: стиль, интенсивность, темп ----------
       Стиль (стекло / упругость) и интенсивность (минимум / баланс / максимум)
       выбирает игрок. Темп партии смягчает частые эффекты: в пуле и блице они
       короче, при очереди быстрых ходов и на последних секундах — ещё короче. */
    const liteMode = () => !!document.body?.classList.contains('lite-mode');
    const feelLevel = () => (REDUCED_MOTION || liteMode() ? 'minimal' : settings.feelLevel);
    let lastMoveAt = 0;
    function feel() {
        if (!Feel) return null;
        const cat = game?.tc?.cat || 'none';
        const rush = performance.now() - lastMoveAt < 900;
        let lowTime = false;
        if (game && (game.clock || game.online?.clock)) {
            const values = clockValues();
            const mine = game.myColor || game.chess.turn();
            lowTime = !!values && values[mine] < 10000;
        }
        return Feel.profile(settings.feelStyle, feelLevel(), Feel.tempoFor(cat, { rush, lowTime }));
    }
    function applyFeel() {
        if (!screen) return;
        const P = Feel?.profile(settings.feelStyle, feelLevel(), 1);
        screen.dataset.feel = settings.feelStyle;
        screen.dataset.level = feelLevel();
        if (!P) return;
        screen.style.setProperty('--cs-lift-y', `${(P.liftY * 0.6).toFixed(2)}%`);
        screen.style.setProperty('--cs-lift-s', String(1 + (P.liftScale - 1) * 0.6));
        screen.style.setProperty('--cs-cp', String(P.clockPulse));
    }
    const later = (fn, ms) => (ms > 4 ? setTimeout(fn, ms) : fn());

    /* ---------- фигуры ---------- */
    function createPiece(code, sq) {
        const el = document.createElement('div');
        el.className = 'cs-pc';
        el.dataset.code = code;
        el.innerHTML = `<i style="--img:url('${pieceUrl(code)}')"></i>`;
        el.style.transform = sqTf(sq);
        refs.pieces.appendChild(el);
        return el;
    }
    function setPieceCode(el, code, animate) {
        el.dataset.code = code;
        el.firstChild.style.setProperty('--img', `url('${pieceUrl(code)}')`);
        if (animate && !REDUCED_MOTION) { el.classList.remove('promoted'); void el.offsetWidth; el.classList.add('promoted'); }
    }
    function removePiece(el, animate, delay = 0) {
        if (!animate || REDUCED_MOTION) { el.remove(); return; }
        later(() => { el.classList.add('vanish'); setTimeout(() => el.remove(), 300); }, delay);
    }
    /** Где фигура сейчас (в клетках) — по её transform. */
    function pieceXY(el) {
        const m = (el.style.transform || '').match(/-?[\d.]+/g);
        return m && m.length >= 2 ? [Number(m[0]) / 100, Number(m[1]) / 100] : [0, 0];
    }
    /** Поза выбранной (приподнятой) фигуры — как в CSS (.cs-pc.selected). */
    const liftedPose = P => `translateY(${(P.liftY * 0.6).toFixed(2)}%) scale(${(1 + (P.liftScale - 1) * 0.6).toFixed(4)})`;

    /** Фигура едет на клетку sq и садится в неё: магнитное «доезжание»,
        короткая упругая посадка, сжатие и рябь по клетке. Возвращает момент
        касания (мс от сейчас) — в него звучит ход и приходит вибрация. */
    function slide(el, sq, { dropped = false, delay = 0, speed = 0, effects = true, rest = 'none' } = {}) {
        const to = sqXY(sq);
        const from = pieceXY(el);
        const face = el.firstChild;
        const pose = face.style.transform;
        face.style.transform = '';
        el.style.transform = tf(to[0], to[1]);
        el.getAnimations?.().forEach(a => a.cancel());
        face.getAnimations?.().forEach(a => a.cancel());
        el.classList.remove('moving');
        const P = feel();
        const same = Math.abs(from[0] - to[0]) < 1e-3 && Math.abs(from[1] - to[1]) < 1e-3;
        if (REDUCED_MOTION || !el.animate || !P || (same && !pose)) return delay;
        const path = Feel.travelFrames(from, to, P, { dropped, speed });
        el.classList.add('moving');
        const anim = el.animate(path.frames.map(f => ({ offset: f.offset, transform: tf(f.x, f.y) })), { duration: path.total, delay, easing: 'linear', fill: 'backwards' });
        anim.onfinish = anim.oncancel = () => el.classList.remove('moving');
        // лицо фигуры: из руки (или с подъёмом в полёте) — к посадке со сжатием и «усадкой»
        const c = path.contact;
        const squash = effects ? Feel.squashFrames(P, dropped ? 0.8 + Math.min(0.6, speed / 25) : 1) : null;
        const settle = squash ? P.squashMs : (effects ? 130 * P.tempo : 90);
        const total = c + settle;
        const kf = [{ offset: 0, transform: pose || 'none' }];
        if (!pose && !dropped && path.dist > 0.2 && c > 60) {
            const lean = (to[0] - from[0] >= 0 ? 1 : -1) * P.lean;
            kf.push({ offset: 0.42 * c / total, transform: `rotate(${lean.toFixed(2)}deg) scale(${P.hop})` });
        }
        const seat = effects && rest === 'none' ? P.seat : 1;
        const steps = squash || [{ offset: 0, sx: 1, sy: 1 }, { offset: 1, sx: 1, sy: 1 }];
        for (const f of steps) {
            const k = 1 + (seat - 1) * Math.pow(1 - f.offset, 2);
            kf.push({ offset: Math.min(1, (c + f.offset * settle) / total), transform: f.offset >= 1 ? rest : `scale(${(f.sx * k).toFixed(4)}, ${(f.sy * k).toFixed(4)})` });
        }
        face.animate(kf, { duration: total, delay, easing: 'linear' });
        if (effects && !same) later(() => ripple(sq, dropped ? 1 : 0.8), delay + c);
        return delay + c;
    }

    /** Рябь по поверхности клетки в момент посадки. */
    function ripple(sq, power = 1) {
        const P = feel();
        if (!sq || !refs.fx || !P || P.ripple * power < 0.02 || REDUCED_MOTION) return;
        const el = document.createElement('div');
        el.className = 'cs-ripple';
        el.style.transform = sqTf(sq);
        el.style.setProperty('--a', (P.ripple * power).toFixed(3));
        el.style.setProperty('--t', `${Math.round(560 * Math.max(0.6, P.tempo))}ms`);
        refs.fx.appendChild(el);
        setTimeout(() => el.remove(), 900);
    }

    function positionMap(chess) {
        const map = new Map();
        for (const row of chess.board()) for (const p of row) if (p) map.set(p.square, p.color + p.type.toUpperCase());
        return map;
    }

    /** Приводит фигуры на доске к позиции: стоящие на месте не трогает,
        переехавшие плавно перевозит, лишние растворяет. */
    function syncPieces(target, { animate = true } = {}) {
        const current = new Map(view.els);
        const next = new Map();
        const missing = [];
        for (const [sq, code] of target) {
            const el = current.get(sq);
            if (el && el.dataset.code === code) { next.set(sq, el); current.delete(sq); }
            else missing.push([sq, code]);
        }
        const dist = (a, b) => Math.abs(a.charCodeAt(0) - b.charCodeAt(0)) + Math.abs(Number(a[1]) - Number(b[1]));
        for (const [sq, code] of missing) {
            let best = null, bestD = Infinity;
            for (const [from, el] of current) {
                if (el.dataset.code !== code) continue;
                const d = dist(from, sq);
                if (d < bestD) { bestD = d; best = from; }
            }
            if (best) {
                const el = current.get(best);
                current.delete(best);
                next.set(sq, el);
                if (animate) slide(el, sq, { effects: false });
                else { el.getAnimations?.().forEach(a => a.cancel()); el.style.transform = sqTf(sq); }
            } else {
                const el = createPiece(code, sq);
                next.set(sq, el);
                if (animate && !REDUCED_MOTION) el.classList.add('appear');
            }
        }
        for (const el of current.values()) removePiece(el, animate);
        view.els = next;
    }

    function rebuildPieces(chess) {
        refs.pieces.innerHTML = '';
        view.els = new Map();
        for (const [sq, code] of positionMap(chess)) view.els.set(sq, createPiece(code, sq));
    }
    const squareOf = el => { for (const [sq, item] of view.els) if (item === el) return sq; return null; };

    /** Живой ход: фигура едет и садится, взятая уходит в момент касания,
        ладья в рокировке едет следом, пешка на последней горизонтали
        перетекает в новую фигуру. Возвращает момент касания (мс). */
    function animateMove(move, { dropped = false } = {}) {
        const els = view.els;
        const el = els.get(move.from);
        if (!el) return 0;
        el.classList.remove('selected', 'dragging');
        let captureSq = null;
        if (move.flags.includes('e')) captureSq = move.to[0] + move.from[1];
        else if (move.captured) captureSq = move.to;
        const victim = captureSq ? els.get(captureSq) : null;
        if (victim && victim !== el) els.delete(captureSq);
        els.delete(move.from);
        els.set(move.to, el);
        const contact = slide(el, move.to, { dropped, speed: dropped ? ui.dropSpeed || 0 : 0 });
        if (victim && victim !== el) removePiece(victim, true, Math.max(0, contact - 25));
        if (move.flags.includes('k') || move.flags.includes('q')) {
            const rank = move.from[1];
            const [rf, rt] = move.flags.includes('k') ? [`h${rank}`, `f${rank}`] : [`a${rank}`, `d${rank}`];
            const rook = els.get(rf);
            if (rook) { els.delete(rf); els.set(rt, rook); slide(rook, rt, { delay: 70 }); }
        }
        if (move.promotion) {
            const code = move.color + move.promotion.toUpperCase();
            el.dataset.code = code;
            later(() => morphPiece(el, move.color + 'P', code), contact);
        }
        return contact;
    }

    /* ---------- превращение: пешка перетекает в новую фигуру ----------
       Силуэты фигур рисуются в маску 96×96 и превращаются в поле расстояний
       (SDF). Смесь двух полей даёт промежуточную форму: края пешки плавно
       вытекают в зубцы ладьи или корону ферзя. Стекло перетекает с бегущим
       бликом, упругость чуть перелетает форму и возвращается. */
    const SDF_N = 96;
    const sdfCache = new Map();
    function pieceSdf(code) {
        if (sdfCache.has(code) || !Feel) return sdfCache.get(code);
        const job = (async () => {
            const text = await (await fetch(pieceUrl(code))).text();
            const svg = text.replace(/<svg\b/, `<svg width="${SDF_N}" height="${SDF_N}" preserveAspectRatio="none"`);
            const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
            try {
                const img = new Image();
                img.src = url;
                await img.decode();
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = SDF_N;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, 0, 0, SDF_N, SDF_N);
                const rgba = ctx.getImageData(0, 0, SDF_N, SDF_N).data;
                const alpha = new Uint8Array(SDF_N * SDF_N);
                for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
                const value = { sdf: Feel.silhouetteSdf(alpha, SDF_N), look: Feel.svgLook(text) };
                sdfCache.set(code, value);
                return value;
            } finally { URL.revokeObjectURL(url); }
        })();
        job.catch(() => sdfCache.delete(code));
        sdfCache.set(code, job);
        return job;
    }
    /** Силуэты для превращения считаем заранее, в простое. */
    let morphPreloaded = false;
    function preloadMorph() {
        if (!Feel || REDUCED_MOTION || morphPreloaded) return;
        morphPreloaded = true;
        const idle = window.requestIdleCallback ? fn => window.requestIdleCallback(fn, { timeout: 1500 }) : fn => setTimeout(fn, 300);
        const codes = ['wP', 'bP', 'wQ', 'bQ', 'wR', 'bR', 'wN', 'bN', 'wB', 'bB'];
        const next = () => { const code = codes.shift(); if (!code) return; Promise.resolve(pieceSdf(code)).catch(() => {}).finally(() => idle(next)); };
        idle(next);
    }
    function morphPiece(el, fromCode, toCode) {
        if (!el.isConnected) return;
        const P = feel();
        const a = sdfCache.get(fromCode), b = sdfCache.get(toCode);
        if (!P || REDUCED_MOTION || !a?.sdf || !b?.sdf) { sfx('promote', { arg: 0.35 }); setPieceCode(el, el.dataset.code, true); return; }
        // редкое событие: темп укорачивает его меньше, чем частые
        const dur = Math.round(P.morphMs * (0.55 + 0.45 * P.tempo));
        sfx('promote', { arg: dur / 1000 });
        haptic('medium');
        el.querySelector('.cs-morph')?.remove();
        const size = Math.max(48, Math.min(220, Math.round(view.size / 8 * Math.min(2.5, window.devicePixelRatio || 1))));
        const canvas = document.createElement('canvas');
        canvas.className = 'cs-morph';
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(size, size);
        el.appendChild(canvas);
        el.classList.add('morphing');
        const t0 = performance.now();
        const glass = P.style === 'glass';
        const frame = now => {
            if (!canvas.isConnected) { el.classList.remove('morphing'); return; }
            const u = Math.min(1, (now - t0) / dur);
            const k = Feel.morphCurve(u, P);
            Feel.paintSdf(img, size, Feel.mixSdf(a.sdf, b.sdf, k, P.bulge), SDF_N, Feel.mixLook(a.look, b.look, Feel.clamp(k)), glass ? { sheen: -0.35 + 1.7 * u } : {});
            ctx.putImageData(img, 0, 0);
            if (!glass) {
                // упругая форма: вытягивается вверх, приседает и выпрямляется
                const q = Math.sin(u * Math.PI * 2.2) * Math.pow(1 - u, 1.4) * (0.05 + 0.03 * P.li);
                canvas.style.transform = `scale(${(1 - q * 0.6).toFixed(4)}, ${(1 + q).toFixed(4)})`;
            }
            if (u < 1) { requestAnimationFrame(frame); return; }
            setPieceCode(el, el.dataset.code);
            el.classList.remove('morphing');
            const fade = canvas.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, fill: 'forwards' });
            fade.onfinish = () => canvas.remove();
            el.firstChild.animate([{ transform: `scale(${(P.seat + 0.025).toFixed(3)})` }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.9,.3,1)' });
            ripple(squareOf(el), 1.3);
        };
        requestAnimationFrame(frame);
    }

    /* ---------- подсветка ---------- */
    function viewChess() {
        if (!game) return null;
        if (game.view == null) return game.chess;
        const c = new Chess(game.startFen);
        for (let i = 0; i < game.view; i++) c.move(game.moves[i].san);
        return c;
    }
    function lastMoveInView() {
        if (!game) return null;
        const ply = game.view == null ? game.moves.length : game.view;
        return ply > 0 ? game.moves[ply - 1] : null;
    }

    /** Подсветка клеток. Метки живут между перерисовками: новые проступают из
        доски (с задержкой по расстоянию от фигуры — волной), ушедшие плавно
        тают, а не пропадают разом. Клетка под фигурой в руке «загорается». */
    const markEls = new Map();
    function renderMarks() {
        if (!refs.marks) return;
        const list = [];
        const chess = viewChess();
        const last = lastMoveInView();
        if (last) { list.push([last.from, 'last']); list.push([last.to, 'last']); }
        if (game?.premove && game.view == null) { list.push([game.premove.from, 'pre']); list.push([game.premove.to, 'pre']); }
        if (ui.selected) list.push([ui.selected, ui.preMode ? 'pre' : 'sel']);
        if (chess?.inCheck()) {
            const king = findKing(chess, chess.turn());
            if (king) list.push([king, 'check']);
        }
        const hint = activeHint() || puzzleHintMove();
        if (hint) { list.push([hint.from, 'hint']); list.push([hint.to, 'hint']); }
        const pzFrom = puzzleHintFrom();
        if (pzFrom && !hint) list.push([pzFrom, 'hint']);
        if (ui.selected && settings.showMoves) {
            const seen = new Set();
            for (const m of ui.targets) {
                if (seen.has(m.to)) continue;
                seen.add(m.to);
                const capture = !!(m.captured || chess.get(m.to));
                list.push([m.to, `${capture ? 'cap' : 'dot'}${ui.preMode ? ' is-pre' : ''}`, m.to === ui.hover]);
            }
        }
        if (ui.hover) list.push([ui.hover, 'hover']);
        const P = feel();
        const origin = ui.selected ? sqXY(ui.selected) : null;
        const keep = new Set();
        for (const [sq, cls, hot] of list) {
            const key = `${view.orientation}${sq}|${cls}`;
            keep.add(key);
            let el = markEls.get(key);
            if (!el) {
                el = document.createElement('div');
                el.className = `cs-mark ${cls}`;
                el.style.transform = sqTf(sq);
                if (origin && /^(dot|cap)/.test(cls)) {
                    const [x, y] = sqXY(sq);
                    el.style.setProperty('--d', `${Math.round(Math.hypot(x - origin[0], y - origin[1]) * (P?.stagger || 0))}ms`);
                }
                refs.marks.appendChild(el);
                markEls.set(key, el);
            }
            if (hot != null) el.classList.toggle('is-hot', !!hot);
        }
        for (const [key, el] of markEls) {
            if (keep.has(key)) continue;
            markEls.delete(key);
            if (REDUCED_MOTION || /\b(hover|last)\b/.test(el.className)) { el.remove(); continue; }
            el.classList.add('is-out');
            setTimeout(() => el.remove(), 240);
        }
        renderThreads();
        renderArrow(hint || reviewArrow());
        renderBadge();
        renderPills();
    }
    function resetMarks() {
        markEls.clear();
        if (refs.marks) refs.marks.innerHTML = '';
        threadKey = '';
        if (refs.threads) refs.threads.innerHTML = '';
        if (refs.fx) refs.fx.innerHTML = '';
        if (refs.pills) refs.pills.innerHTML = '';
    }

    /* ---------- нити к доступным клеткам ----------
       Тонкие линии от выбранной фигуры к самым дальним клеткам каждого
       направления: у упругости — эластичные нити, которые вытягиваются с
       небольшим перелётом, у стекла (на максимуме) — тонкие лучи света.
       При отмене выбора нити втягиваются обратно в фигуру. */
    const SVGNS = 'http://www.w3.org/2000/svg';
    let threadKey = '';
    function threadEnds(from, targets) {
        const [x0, y0] = sqXY(from);
        const best = new Map();
        for (const m of targets) {
            const [x1, y1] = sqXY(m.to);
            const dx = x1 - x0, dy = y1 - y0;
            if (!dx && !dy) continue;
            const knight = Math.abs(dx) * Math.abs(dy) === 2;
            const dir = knight ? `n${dx},${dy}` : `${Math.sign(dx)},${Math.sign(dy)}`;
            const d = Math.hypot(dx, dy);
            if (!best.has(dir) || best.get(dir).d < d) best.set(dir, { x: x1, y: y1, d });
        }
        return { x0, y0, ends: [...best.values()] };
    }
    function retractThreads(g) {
        g.classList.add('is-out');
        if (!g.animate || REDUCED_MOTION) { g.remove(); return; }
        const anim = g.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.04)', opacity: 0.2 }], { duration: 190, easing: 'cubic-bezier(.55,0,.8,.3)', fill: 'forwards' });
        anim.onfinish = () => g.remove();
    }
    function renderThreads() {
        const svg = refs.threads;
        if (!svg) return;
        const P = feel();
        const on = !!(ui.selected && settings.showMoves && P?.threads && !REDUCED_MOTION && game?.view == null && ui.targets.length);
        const key = on ? `${view.orientation}|${ui.selected}|${ui.preMode}|${ui.targets.map(m => m.to).join('')}` : '';
        if (key === threadKey) return;
        threadKey = key;
        svg.querySelectorAll('g.cs-th:not(.is-out)').forEach(retractThreads);
        if (!on) return;
        const { x0, y0, ends } = threadEnds(ui.selected, ui.targets);
        const cx = x0 + 0.5, cy = y0 + 0.5;
        const g = document.createElementNS(SVGNS, 'g');
        g.setAttribute('class', `cs-th is-${P.style}${ui.preMode ? ' is-pre' : ''}`);
        g.style.transformOrigin = `${cx}px ${cy}px`;
        for (const e of ends) {
            const ex = e.x + 0.5, ey = e.y + 0.5;
            const path = document.createElementNS(SVGNS, 'path');
            if (P.style === 'elastic') {
                // нить чуть провисает: контрольная точка сдвинута поперёк, к «низу» экрана
                const len = Math.hypot(ex - cx, ey - cy);
                const nx = -(ey - cy) / len, ny = (ex - cx) / len;
                const sag = Math.min(0.22, 0.07 * Math.sqrt(len)) * (ny >= 0 ? 1 : -1);
                path.setAttribute('d', `M${cx} ${cy}Q${((cx + ex) / 2 + nx * sag).toFixed(3)} ${((cy + ey) / 2 + ny * sag).toFixed(3)} ${ex} ${ey}`);
            } else {
                path.setAttribute('d', `M${cx} ${cy}L${ex} ${ey}`);
            }
            g.appendChild(path);
        }
        svg.appendChild(g);
        if (!g.animate) return;
        const t = P.tempo;
        if (P.style === 'elastic') {
            g.animate([
                { transform: 'scale(0)', opacity: 0 },
                { transform: 'scale(1.07)', opacity: 1, offset: 0.55 },
                { transform: 'scale(0.985)', offset: 0.8 },
                { transform: 'scale(1)', opacity: 1 },
            ], { duration: Math.round(460 * t), easing: 'cubic-bezier(.25,.8,.35,1)' });
        } else {
            g.animate([{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: Math.round(320 * t), easing: 'cubic-bezier(.2,.85,.3,1)' });
        }
    }

    function findKing(chess, color) {
        for (const row of chess.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
        return null;
    }

    function renderArrow(hint) {
        if (!refs.arrows) return;
        if (!hint) { refs.arrows.innerHTML = ''; delete refs.arrows.dataset.key; return; }
        const key = `${view.orientation}${hint.from}${hint.to}`;
        if (refs.arrows.dataset.key === key && refs.arrows.firstChild) return;
        refs.arrows.dataset.key = key;
        refs.arrows.innerHTML = arrowSvg(hint.from, hint.to, 'var(--cs-hint)', 'cs-arrow');
        requestAnimationFrame(() => refs.arrows.querySelector('.cs-arrow')?.classList.add('show'));
    }

    /** Стрелка от клетки к клетке; у коня — уголком, как ходит фигура. */
    function arrowSvg(from, to, color, cls = '') {
        const [x0, y0] = sqXY(from), [x1, y1] = sqXY(to);
        const a = [x0 + 0.5, y0 + 0.5], b = [x1 + 0.5, y1 + 0.5];
        const knight = Math.abs(x1 - x0) * Math.abs(y1 - y0) === 2;
        const points = knight
            ? (Math.abs(y1 - y0) === 2 ? [a, [a[0], b[1]], b] : [a, [b[0], a[1]], b])
            : [a, b];
        // укорачиваем конец под наконечник
        const [p, q] = points.slice(-2);
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const end = [q[0] - (q[0] - p[0]) / len * 0.32, q[1] - (q[1] - p[1]) / len * 0.32];
        const line = [...points.slice(0, -1), end].map(pt => pt.map(v => v.toFixed(3)).join(',')).join(' ');
        const ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
        const head = [
            q,
            [q[0] - Math.cos(ang) * 0.42 + Math.cos(ang + Math.PI / 2) * 0.24, q[1] - Math.sin(ang) * 0.42 + Math.sin(ang + Math.PI / 2) * 0.24],
            [q[0] - Math.cos(ang) * 0.42 - Math.cos(ang + Math.PI / 2) * 0.24, q[1] - Math.sin(ang) * 0.42 - Math.sin(ang + Math.PI / 2) * 0.24],
        ].map(pt => pt.map(v => v.toFixed(3)).join(',')).join(' ');
        return `<g class="${cls}" fill="none" stroke="${color}" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="${line}" stroke-width="0.17"/><polygon points="${head}" fill="${color}" stroke-width="0.04"/></g>`;
    }

    /* ---------- разметка: стрелки и кружки ---------- */
    const NOTE_COLORS = { orange: '#ff9f0a', green: '#30c35a', blue: '#0a84ff', red: '#ff453a' };
    ui.notes = { arrows: [], circles: [] };
    ui.drawMode = false;
    ui.noteDrag = null;
    function noteColor(event) {
        if (event.shiftKey) return 'green';
        if (event.altKey) return 'blue';
        if (event.ctrlKey || event.metaKey) return 'red';
        return 'orange';
    }
    function renderNotes() {
        if (!refs.notes) return;
        const parts = [];
        for (const c of ui.notes.circles) {
            const [x, y] = sqXY(c.sq);
            parts.push(`<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.44" fill="none" stroke="${NOTE_COLORS[c.color]}" stroke-width="0.08"/>`);
        }
        for (const a of ui.notes.arrows) parts.push(arrowSvg(a.from, a.to, NOTE_COLORS[a.color]));
        const d = ui.noteDrag;
        if (d && d.to && d.to !== d.from) parts.push(arrowSvg(d.from, d.to, NOTE_COLORS[d.color], 'is-preview'));
        refs.notes.innerHTML = parts.join('');
    }
    function toggleNote(from, to, color) {
        const notes = ui.notes;
        const list = from === to ? notes.circles : notes.arrows;
        const i = from === to ? list.findIndex(c => c.sq === from) : list.findIndex(a => a.from === from && a.to === to);
        const same = i >= 0 && list[i].color === color;
        if (i >= 0) list.splice(i, 1);
        if (!same) list.push(from === to ? { sq: from, color } : { from, to, color });
        haptic('select');
        renderNotes();
    }
    function clearAnnotations(render = true) {
        if (!ui.notes.arrows.length && !ui.notes.circles.length) return;
        ui.notes = { arrows: [], circles: [] };
        if (render) renderNotes(); else if (refs.notes) refs.notes.innerHTML = '';
    }
    function setDrawMode(on) {
        ui.drawMode = !!on;
        renderActions();
        haptic('light');
        if (ui.drawMode) {
            clearSelection();
            let seen = false;
            try { seen = !!localStorage.getItem('chess_arrows_hint'); localStorage.setItem('chess_arrows_hint', '1'); } catch (_) {}
            if (!seen) toast(tr('arrowsHint'));
        }
    }

    /* ---------- ввод: нажатие и перетаскивание ---------- */
    function pointSq(event) {
        const rect = refs.board.getBoundingClientRect();
        const x = Math.floor((event.clientX - rect.left) / rect.width * 8);
        const y = Math.floor((event.clientY - rect.top) / rect.height * 8);
        if (x < 0 || x > 7 || y < 0 || y > 7) return null;
        return xySq(x, y);
    }

    function bindBoard() {
        const board = refs.board;
        board.addEventListener('pointerdown', onPointerDown);
        board.addEventListener('pointermove', onPointerMove);
        board.addEventListener('pointerup', onPointerUp);
        board.addEventListener('pointerleave', () => { if (!ui.drag) setGrabCursor(''); });
        board.addEventListener('pointercancel', () => { ui.noteDrag = null; renderNotes(); cancelDrag(true); });
        board.addEventListener('contextmenu', event => event.preventDefault());
    }

    function onPointerDown(event) {
        if (!game) return;
        Sound.unlock();
        const sq = pointSq(event);
        if (!sq) return;
        // Правая кнопка мыши или режим «Стрелки» — рисуем, а не ходим.
        if (event.button === 2 || (ui.drawMode && event.button === 0)) {
            if (event.button === 2 && game.premove) clearPremove();
            ui.noteDrag = { from: sq, to: sq, color: noteColor(event), pointerId: event.pointerId };
            try { refs.board.setPointerCapture(event.pointerId); } catch (_) {}
            event.preventDefault();
            return;
        }
        if (event.button > 0) return;
        clearAnnotations();
        if (game.view != null) { goLive(); return; }
        if (ui.promo) return;
        if (ui.drag) cancelDrag(true);
        const chess = game.chess;
        const piece = chess.get(sq);
        // ход на подсвеченную клетку
        if (ui.selected && sq !== ui.selected && ui.targets.some(m => m.to === sq)) {
            const from = ui.selected;
            event.preventDefault();
            userMove(from, sq);
            return;
        }
        if (piece && canSelect(piece.color)) {
            const wasSelected = ui.selected === sq;
            select(sq);
            const el = view.els.get(sq);
            if (el) {
                ui.drag = { sq, el, x: event.clientX, y: event.clientY, px: event.clientX, py: event.clientY, active: false, wasSelected, pointerId: event.pointerId, touch: event.pointerType === 'touch' };
                try { refs.board.setPointerCapture(event.pointerId); } catch (_) {}
            }
            return;
        }
        if (game.premove) { clearPremove(); }
        clearSelection();
    }

    function onPointerMove(event) {
        const note = ui.noteDrag;
        if (note && event.pointerId === note.pointerId) {
            const over = pointSq(event);
            if (over && over !== note.to) { note.to = over; renderNotes(); }
            return;
        }
        const drag = ui.drag;
        if (!drag) { hoverGrab(event); return; }
        if (event.pointerId !== drag.pointerId) return;
        drag.px = event.clientX;
        drag.py = event.clientY;
        if (!drag.active) {
            if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
            startDrag(drag);
        }
        aimDrag(drag);
    }

    /** Палец (с подъёмом на тач-экране, чтобы фигура не пряталась под ним) → клетка под фигурой. */
    function dragPoint(drag) {
        const rect = refs.board.getBoundingClientRect();
        const cell = rect.width / 8;
        const lift = drag.touch ? cell * 0.45 : 0;
        return { rect, cell, x: drag.px, y: drag.py - lift };
    }

    /** Фигуру подняли: она становится телом на пружине за пальцем. */
    function startDrag(drag) {
        const P = feel();
        drag.active = true;
        drag.P = P;
        drag.el.classList.remove('selected');
        drag.el.classList.add('dragging');
        refs.board.classList.add('is-dragging');
        setGrabCursor('grabbing');
        const face = drag.el.firstChild;
        face.getAnimations?.().forEach(a => a.cancel());
        drag.el.getAnimations?.().forEach(a => a.cancel());
        drag.targets = [];
        const seen = new Set();
        for (const m of ui.targets) if (!seen.has(m.to)) { seen.add(m.to); const [x, y] = sqXY(m.to); drag.targets.push([x, y, m.to]); }
        drag.model = Feel ? Feel.createDrag(pieceXY(drag.el), P) : null;
        // отпечаток на клетке, откуда взяли фигуру
        if (refs.fx && P && !REDUCED_MOTION) {
            const imp = document.createElement('div');
            imp.className = 'cs-imprint';
            imp.style.transform = sqTf(drag.sq);
            imp.style.setProperty('--img', `url('${pieceUrl(drag.el.dataset.code)}')`);
            refs.fx.appendChild(imp);
            drag.imprint = imp;
        }
        // упругость: резинка от клетки до фигуры
        if (P?.style === 'elastic' && refs.threads && !REDUCED_MOTION) {
            const band = document.createElementNS(SVGNS, 'path');
            band.setAttribute('class', 'cs-band');
            refs.threads.appendChild(band);
            drag.band = band;
        }
        if (!drag.model) return;
        let last = performance.now();
        const frame = now => {
            if (ui.drag !== drag || !drag.active) return;
            drag.model.step((now - last) / 1000);
            last = now;
            renderDrag(drag);
            drag.raf = requestAnimationFrame(frame);
        };
        drag.raf = requestAnimationFrame(frame);
    }

    function renderDrag(drag) {
        const m = drag.model;
        drag.el.style.transform = tf(m.x, m.y);
        const face = drag.el.firstChild;
        face.style.transform = Feel.dragFace(m, drag.P);
        // блик стекла скользит по фигуре вслед за наклоном
        if (drag.P.style === 'glass') face.style.setProperty('--sheen', `${(50 - m.tilt * 9 - m.vx * 0.6).toFixed(1)}%`);
        if (drag.band) {
            const [ox, oy] = sqXY(drag.sq);
            const ax = ox + 0.5, ay = oy + 0.5, bx = m.x + 0.5, by = m.y + 0.62;
            const len = Math.hypot(bx - ax, by - ay);
            const w = Math.max(0.02, 0.11 / (1 + len * 0.9));
            drag.band.setAttribute('d', `M${ax.toFixed(3)} ${ay.toFixed(3)}L${bx.toFixed(3)} ${by.toFixed(3)}`);
            drag.band.style.strokeWidth = w.toFixed(3);
            drag.band.style.opacity = Math.max(0, Math.min(0.42, len * 0.6)).toFixed(3);
        }
    }

    /** Куда тянется фигура: магнит доступной клетки мягко затягивает её к центру. */
    function aimDrag(drag) {
        const { rect, cell, x, y } = dragPoint(drag);
        const px = Math.max(-0.4, Math.min(7.4, (x - rect.left) / cell - 0.5));
        const py = Math.max(-0.6, Math.min(7.4, (y - rect.top) / cell - 0.5));
        let caught = null;
        if (drag.model) caught = drag.model.aim(px, py, drag.targets);
        else drag.el.style.transform = tf(px, py);
        const over = pointSq({ clientX: x, clientY: y });
        const hover = over && ui.targets.some(m => m.to === over) ? over : (caught && caught !== drag.sq ? caught : null);
        if (hover !== ui.hover) {
            ui.hover = hover;
            renderMarks();
            if (hover) { haptic('select'); if (feelLevel() !== 'minimal') sfx('catch', { gain: 0.9 }); }
        }
    }

    function onPointerUp(event) {
        const note = ui.noteDrag;
        if (note && event.pointerId === note.pointerId) {
            ui.noteDrag = null;
            try { refs.board.releasePointerCapture(event.pointerId); } catch (_) {}
            toggleNote(note.from, pointSq(event) || note.to, note.color);
            return;
        }
        const drag = ui.drag;
        if (!drag || event.pointerId !== drag.pointerId) return;
        ui.drag = null;
        try { refs.board.releasePointerCapture(event.pointerId); } catch (_) {}
        if (!drag.active) {
            if (drag.wasSelected) clearSelection();
            return;
        }
        drag.px = event.clientX;
        drag.py = event.clientY;
        const { x, y } = dragPoint(drag);
        const over = pointSq({ clientX: x, clientY: y });
        const caught = drag.model?.caught;
        const target = over && over !== drag.sq && ui.targets.some(m => m.to === over) ? over
            : caught && caught !== drag.sq && ui.targets.some(m => m.to === caught) ? caught : null;
        ui.dropSpeed = drag.model ? Math.hypot(drag.model.vx, drag.model.vy) : 0;
        endDrag(drag, target);
        ui.hover = null;
        if (target) {
            userMove(drag.sq, target, { dropped: true });
        } else {
            // мимо: фигура возвращается на свою клетку и остаётся выбранной
            const keep = ui.selected === drag.sq;
            slide(drag.el, drag.sq, { dropped: true, effects: false, rest: keep && drag.P ? liftedPose(drag.P) : 'none' });
            if (keep) drag.el.classList.add('selected');
            renderMarks();
        }
    }

    /** Фигуру отпустили: убираем отпечаток и резинку (резинка втягивается). */
    function endDrag(drag, target) {
        cancelAnimationFrame(drag.raf);
        drag.active = false;
        drag.el.classList.remove('dragging');
        refs.board.classList.remove('is-dragging');
        setGrabCursor('');
        const imp = drag.imprint;
        if (imp) { imp.classList.add('is-out'); setTimeout(() => imp.remove(), 260); }
        const band = drag.band;
        if (band) {
            if (band.animate && target) band.animate([{ opacity: band.style.opacity || 0.3 }, { opacity: 0 }], { duration: 140, fill: 'forwards' }).onfinish = () => band.remove();
            else if (band.animate) band.animate([{ opacity: band.style.opacity || 0.3, strokeWidth: band.style.strokeWidth }, { opacity: 0, strokeWidth: 0.12 }], { duration: 220, easing: 'ease-out', fill: 'forwards' }).onfinish = () => band.remove();
            else band.remove();
        }
    }

    function cancelDrag(restore) {
        const drag = ui.drag;
        ui.drag = null;
        ui.hover = null;
        if (!drag) return;
        const wasActive = drag.active;
        if (wasActive) endDrag(drag, null);
        if (wasActive && restore && drag.el.isConnected) slide(drag.el, drag.sq, { dropped: true, effects: false });
        else if (wasActive) drag.el.firstChild.style.transform = '';
    }

    /** Курсор «рука» над фигурой, которую можно взять мышью. */
    function hoverGrab(event) {
        if (!FINE_POINTER || event.pointerType !== 'mouse' || !game || game.view != null || ui.promo) { setGrabCursor(''); return; }
        const sq = pointSq(event);
        const piece = sq && game.chess.get(sq);
        setGrabCursor(piece && view.els.get(sq) && canSelect(piece.color) ? 'grab' : '');
    }
    function setGrabCursor(kind) {
        refs.board.classList.toggle('is-grab', kind === 'grab');
        refs.board.classList.toggle('is-grabbing', kind === 'grabbing');
    }


    /* ---------- говорящие фигуры ----------
       После хода фигура говорит реплику в облачке над собой (кто и что — решает
       chess-talk.js). Облачко висит 2,2–4,2 с — по длине фразы, чтобы успеть
       прочитать. Следующий ход (бот отвечает сразу) не перебивает реплику, пока
       её не показали хотя бы на 80%: его сценка ждёт, а из нескольких ждущих
       остаётся самая важная. Облачка никогда не налезают друг на друга: ответ
       в диалоге появляется рядом, пока первая реплика ещё видна, только если
       есть свободное место (над фигурой или под ней), иначе — после неё. */
    const Talk = window.SparkChessTalk;
    const REPLY_AT = 1300;
    const talkView = { engine: null, gameId: null, current: null, pending: null, pendingTimer: 0, timers: [], token: 0, lastEnd: 0 };
    const talkOn = () => !!Talk && !!settings.talk && !!game && game.mode !== 'puzzle';
    const sayDuration = text => Math.max(2200, Math.min(4200, 1500 + 60 * text.length));
    /** Сколько реплику нельзя перебить следующим ходом. */
    const sayGuard = ms => Math.max(1800, ms * 0.8);
    const sceneLength = scene => {
        const d0 = sayDuration(scene.lines[0].text);
        return scene.lines[1] ? Math.max(d0, Math.min(REPLY_AT, d0 / 2) + sayDuration(scene.lines[1].text)) : d0;
    };
    /** Сколько ещё идёт сценка последнего хода — окно итогов партии ждёт, пока король договорит. */
    const talkHold = () => (talkOn() && talkView.lastEnd ? Math.max(0, talkView.lastEnd - performance.now()) : 0);
    function talkEngine() {
        if (!talkView.engine || talkView.gameId !== game.id) {
            talkView.engine = Talk.createTalk();
            talkView.gameId = game.id;
        }
        return talkView.engine;
    }
    function talkAfterMove(move) {
        if (!talkOn()) return;
        let scene = null;
        try { scene = talkEngine().onMove(game.chess, move, { lang: lang() }); } catch (_) { scene = null; }
        if (!scene) return;
        talkView.lastEnd = performance.now() + 240 + sceneLength(scene);
        const id = game.id;
        const go = () => { if (game?.id === id && game.view == null) queueScene(scene); };
        if (cinema) afterCinema(go, 300); else setTimeout(go, 240);
    }
    function queueScene(scene) {
        if (!talkOn()) return;
        const wait = talkView.current ? talkView.current.until - performance.now() : 0;
        if (wait > 0) {
            if (!talkView.pending || scene.prio >= talkView.pending.prio) talkView.pending = scene;
            clearTimeout(talkView.pendingTimer);
            talkView.pendingTimer = setTimeout(() => {
                const next = talkView.pending;
                talkView.pending = null;
                if (next) queueScene(next);
            }, wait + 20);
            return;
        }
        playScene(scene);
    }
    function playScene(scene) {
        // старое облачко сначала уходит, новое появляется следом — без наложения
        const fade = clearTalk({ keepPending: true }) ? 170 : 0;
        const token = talkView.token;
        const later = (fn, ms) => talkView.timers.push(setTimeout(() => { if (token === talkView.token) fn(); }, ms));
        const [first, reply] = scene.lines;
        const d0 = sayDuration(first.text);
        const start = performance.now() + fade;
        const cur = talkView.current = { until: start + sayGuard(d0) };
        later(() => {
            showBubble(first, d0);
            if (!reply) return;
            const d1 = sayDuration(reply.text);
            const at = Math.min(REPLY_AT, d0 / 2);
            cur.until = Math.max(cur.until, start + at + sayGuard(d1));
            later(() => {
                if (showBubble(reply, d1, { avoid: true })) return;
                cur.until = Math.min(start + 6500, Math.max(cur.until, start + d0 + 200 + sayGuard(d1)));
                later(() => showBubble(reply, d1), d0 - at + 200);
            }, at);
        }, fade);
    }
    /** Облачко над фигурой (или под ней). avoid — не показывать, если некуда встать, не задев другое облачко. */
    function showBubble(line, ms, { avoid = false } = {}) {
        const layer = refs.talk;
        const sq = talkView.engine?.squareOf(line.id);
        if (!layer || !view.size || !sq) return true;
        const el = document.createElement('div');
        el.className = `cs-say ${line.color === 'w' ? 'is-w' : 'is-b'}`;
        el.textContent = line.text;
        layer.appendChild(el);
        const w = el.offsetWidth, h = el.offsetHeight + 6;   // + хвостик
        const [x, y] = sqXY(sq);
        const cell = view.size / 8;
        const margin = parseFloat(screen.style.getPropertyValue('--cs-margin')) || 9;
        const cx = (x + 0.5) * cell;
        const left = Math.max(4 - margin, Math.min(view.size + margin - 4 - w, cx - w / 2));
        const above = { below: false, anchor: (y + 0.1) * cell, top: (y + 0.1) * cell - h, bottom: (y + 0.1) * cell };
        const under = { below: true, anchor: (y + 0.92) * cell, top: (y + 0.92) * cell, bottom: (y + 0.92) * cell + h };
        // верхний ряд — только вниз (не залезать на шапку), нижний — только вверх
        const options = y === 0 ? [under] : y === 7 ? [above] : [above, under];
        const others = [...layer.querySelectorAll('.cs-say:not(.is-out)')].filter(o => o !== el && o.box).map(o => o.box);
        const fits = o => others.every(b => left + w + 4 <= b.left || left >= b.right + 4 || o.bottom + 2 <= b.top || o.top >= b.bottom + 2);
        let spot = options.find(fits);
        if (!spot) {
            if (avoid) { el.remove(); return false; }
            spot = options[0];
        }
        el.classList.toggle('is-below', spot.below);
        el.box = { left, right: left + w, top: spot.top, bottom: spot.bottom };
        el.style.left = `${Math.round(left)}px`;
        el.style.top = `${Math.round(spot.anchor)}px`;
        el.style.setProperty('--tail', `${Math.round(Math.max(14, Math.min(w - 14, cx - left)))}px`);
        talkView.timers.push(setTimeout(() => hideBubble(el), ms));
        return true;
    }
    function hideBubble(el) {
        if (!el.isConnected || el.classList.contains('is-out')) return;
        if (REDUCED_MOTION) { el.remove(); return; }
        el.classList.add('is-out');
        setTimeout(() => el.remove(), 170);
    }
    /** Убирает облачка и отменяет сценку; возвращает, сколько облачков было на экране. */
    function clearTalk({ keepPending = false } = {}) {
        talkView.token++;
        talkView.timers.forEach(clearTimeout);
        talkView.timers = [];
        talkView.current = null;
        if (!keepPending) { talkView.pending = null; talkView.lastEnd = 0; clearTimeout(talkView.pendingTimer); }
        const shown = refs.talk ? [...refs.talk.querySelectorAll('.cs-say:not(.is-out)')] : [];
        shown.forEach(hideBubble);
        return shown.length;
    }
    /** Только что включили — фигуры здороваются с игроком. */
    function sayHello() {
        if (!talkOn() || game.view != null) return;
        let scene = null;
        try { scene = talkEngine().hello(game.chess, view.orientation, { lang: lang() }); } catch (_) { scene = null; }
        if (scene) queueScene(scene);
    }

    function controls(color) {
        if (!game || game.over) return false;
        if (game.mode === 'puzzle') return color === game.myColor && !!game.puzzle && !game.puzzle.locked && !game.puzzle.done;
        return game.mode === 'local' || color === game.myColor;
    }
    function canMoveNow() {
        return !!game && !game.over && game.view == null && !ui.promo && controls(game.chess.turn()) && !game.botBusy && !(game.mode === 'online' && game.online.pending);
    }
    function canPremove() {
        return !!game && !game.over && game.view == null && game.mode !== 'local' && game.mode !== 'puzzle' && game.chess.turn() !== game.myColor;
    }
    function canSelect(color) {
        if (canMoveNow() && color === game.chess.turn()) return true;
        return canPremove() && color === game.myColor;
    }

    function select(sq) {
        const piece = game.chess.get(sq);
        if (!piece) { clearSelection(); return; }
        if (ui.selected && ui.selected !== sq) view.els.get(ui.selected)?.classList.remove('selected');
        ui.preMode = !(canMoveNow() && piece.color === game.chess.turn());
        ui.selected = sq;
        ui.targets = ui.preMode ? premoveTargets(sq) : game.chess.moves({ square: sq, verbose: true });
        const el = view.els.get(sq);
        if (el) {
            el.classList.add('selected');
            // касание: фигуру чуть вдавили — и приподняли с поверхности
            const P = feel();
            const face = el.firstChild;
            if (P && face.animate && !REDUCED_MOTION && !el.classList.contains('moving')) {
                face.getAnimations().forEach(a => a.cancel());
                face.animate([
                    { transform: 'none' },
                    { transform: `scale(${P.press})`, offset: 0.3 },
                    { transform: liftedPose(P) },
                ], { duration: Math.round((P.style === 'elastic' ? 230 : 170) * Math.max(0.7, P.tempo)), easing: P.style === 'elastic' ? 'cubic-bezier(.3,1.5,.5,1)' : 'cubic-bezier(.25,.9,.3,1)' });
            }
        }
        haptic('select');
        sfx('pick', { gain: ui.preMode ? 0.6 : 1 });
        renderMarks();
    }

    /** После хода соперника выбранная фигура остаётся выбранной: пересчитываем,
        куда она теперь может пойти (предход превращается в обычный ход). */
    function refreshSelection() {
        const sq = ui.selected;
        if (!sq) return;
        const piece = game.chess.get(sq);
        if (!piece || !canSelect(piece.color)) { clearSelection(false); return; }
        ui.preMode = !(canMoveNow() && piece.color === game.chess.turn());
        ui.targets = ui.preMode ? premoveTargets(sq) : game.chess.moves({ square: sq, verbose: true });
        if (ui.hover && !ui.targets.some(m => m.to === ui.hover)) ui.hover = null;
        const el = view.els.get(sq);
        if (el && !el.classList.contains('dragging')) el.classList.add('selected');
    }

    function clearSelection(render = true) {
        if (ui.selected) view.els.get(ui.selected)?.classList.remove('selected');
        ui.selected = null;
        ui.targets = [];
        ui.preMode = false;
        ui.hover = null;
        if (render) renderMarks();
    }

    /** Предход: куда фигура могла бы пойти, будь сейчас наш ход. */
    function premoveTargets(sq) {
        const parts = game.chess.fen().split(' ');
        parts[1] = game.myColor;
        parts[3] = '-';
        try { return new Chess(parts.join(' ')).moves({ square: sq, verbose: true }); }
        catch (_) { return []; }
    }
    function clearPremove() {
        if (!game?.premove) return;
        game.premove = null;
        renderMarks();
    }

    function userMove(from, to, { dropped = false } = {}) {
        if (ui.preMode) {
            const piece = game.chess.get(from);
            const promotion = piece?.type === 'p' && (to[1] === '8' || to[1] === '1') ? 'q' : undefined;
            game.premove = { from, to, promotion };
            if (dropped) { const el = view.els.get(from); if (el) slide(el, from, { dropped: true }); }
            clearSelection();
            haptic('light');
            return;
        }
        const options = game.chess.moves({ square: from, verbose: true }).filter(m => m.to === to);
        if (!options.length) return;
        if (options.some(m => m.promotion)) { askPromotion(from, to, dropped); return; }
        playMove({ from, to }, { byUser: true, dropped });
    }

    /** Выбор фигуры для превращения: стеклянная капсула выезжает из клетки
        горизонтально; наклоняется за курсором или пальцем (с бликом), фигура
        под пальцем приподнимается, соседние — чуть меньше, как магнит. Можно
        нажать на фигуру или провести пальцем и отпустить на нужной. */
    function askPromotion(from, to, dropped) {
        const color = game.chess.turn();
        const [x, y] = sqXY(to);
        const below = y <= 3;   // клетка превращения вверху — меню под ней, внизу — над ней
        const el = view.els.get(from);
        if (el && dropped) slide(el, to, { dropped: true, effects: false });
        const P = feel();
        const kinds = ['q', 'r', 'b', 'n'];
        const promo = document.createElement('div');
        promo.className = 'cs-promo';
        promo.innerHTML = `<div class="cs-promo-bar ${below ? 'is-below' : 'is-above'}"><div class="cs-promo-tilt"><i class="cs-promo-tail" aria-hidden="true"></i><div class="cs-promo-glass"></div><div class="cs-promo-row"><i class="cs-promo-hl" aria-hidden="true"></i>${kinds.map(k => `<button type="button" data-promo="${k}" aria-label="${esc(tr(`piece${k.toUpperCase()}`))}"><i style="background-image:url('${pieceUrl(color + k.toUpperCase())}')"></i></button>`).join('')}</div></div></div>`;
        const bar = promo.firstChild;
        const tilt = bar.firstChild;
        // кольцо вокруг пешки, которая ждёт превращения
        const halo = document.createElement('div');
        halo.className = 'cs-promo-halo';
        halo.style.transform = tf(x, y);
        promo.insertBefore(halo, bar);
        const buttons = [...bar.querySelectorAll('[data-promo]')];
        // ширина — четыре клетки и поля; капсула над файлом пешки, но не за краем доски
        const W = 4 * 12.5 + 4;
        const cx = (x + 0.5) * 12.5;
        const left = Math.max(1.2, Math.min(98.8 - W, cx - W / 2));
        bar.style.left = `${left}%`;
        bar.style.width = `${W}%`;
        bar.style[below ? 'top' : 'bottom'] = `${(below ? y + 1 : 8 - y) * 12.5 + 1.4}%`;
        bar.style.setProperty('--tail', `${((cx - left) / W * 100).toFixed(2)}%`);
        bar.style.transformOrigin = `${((cx - left) / W * 100).toFixed(2)}% ${below ? '-10%' : '110%'}`;
        refs.board.appendChild(promo);
        ui.promo = { el: promo, from, to };
        clearSelection();
        haptic('light');
        if (bar.animate && !REDUCED_MOTION) {
            bar.animate([
                { transform: 'scale(0.3, 0.5)', opacity: 0, filter: 'blur(6px)' },
                { transform: P?.style === 'elastic' ? 'scale(1.06, 0.96)' : 'scale(1.015)', opacity: 1, filter: 'blur(0)', offset: 0.6 },
                { transform: 'none', opacity: 1, filter: 'blur(0)' },
            ], { duration: P?.style === 'elastic' ? 420 : 340, easing: 'cubic-bezier(.2,.9,.3,1)' });
            buttons.forEach((b, i) => b.firstChild.animate([
                { transform: 'translateY(40%) scale(.4)', opacity: 0 },
                { transform: 'none', opacity: 1 },
            ], { duration: 360, delay: 40 + Math.abs(i - (cx - left) / W * 4 + 0.5) * 35, easing: 'cubic-bezier(.3,1.45,.5,1)', fill: 'backwards' }));
        }
        requestAnimationFrame(() => promo.classList.add('show'));

        // наклон и «док»: пружины, чтобы движение было мягким, но точным
        const hl = bar.querySelector('.cs-promo-hl');
        // плашка выбора: сначала под ферзём, дальше пружиной едет под фигуру у пальца
        const st = { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, tx: 0, ty: 0, px: null, slot: 0, hl: { x: 0, v: 0 }, scales: buttons.map(() => ({ x: 1, v: 0 })), raf: 0, last: 0 };
        const springy = P?.style === 'elastic';
        const step = now => {
            const dt = Math.min(0.05, (now - (st.last || now)) / 1000 || 0.016);
            st.last = now;
            const w = springy ? 18 : 22, z = springy ? 0.55 : 0.85;
            Feel?.spring(st.rx, st.tx, w, z, dt);
            Feel?.spring(st.ry, st.ty, w, z, dt);
            tilt.style.transform = `perspective(560px) rotateX(${(-st.ry.x * 9).toFixed(2)}deg) rotateY(${(st.rx.x * 12).toFixed(2)}deg)`;
            tilt.style.setProperty('--hx', `${(50 + st.rx.x * 38).toFixed(1)}%`);
            tilt.style.setProperty('--hy', `${(50 + st.ry.x * 60).toFixed(1)}%`);
            const box = bar.getBoundingClientRect();
            const cell = box.width / (W / 12.5);
            let moving = Math.abs(st.rx.v) + Math.abs(st.ry.v) + Math.abs(st.rx.x - st.tx) + Math.abs(st.ry.x - st.ty) > 0.002;
            if (st.px != null) {
                const row = bar.querySelector('.cs-promo-row').getBoundingClientRect();
                const slot = Math.max(0, Math.min(3, Math.floor((st.px + box.left - row.left) / (row.width / 4))));
                if (slot !== st.slot) {
                    st.slot = slot;
                    haptic('select');
                    if (feelLevel() !== 'minimal') sfx('catch', { gain: 0.8 });
                    hl.classList.remove('pop'); void hl.offsetWidth; hl.classList.add('pop');
                    // выбранная фигура выпрыгивает: толчок пружине её масштаба
                    st.scales[slot].v += springy ? 3.2 : 2.2;
                }
            }
            Feel?.spring(st.hl, st.slot, springy ? 26 : 32, springy ? 0.55 : 0.82, dt);
            // плашка тянется в сторону движения, как капля, и собирается на месте
            const stretch = Math.min(springy ? 0.5 : 0.32, Math.abs(st.hl.v) * (springy ? 0.075 : 0.05));
            hl.style.transform = `translateX(${(st.hl.x * 100).toFixed(2)}%) scale(${(1 + stretch).toFixed(3)}, ${(1 - stretch * 0.22).toFixed(3)})`;
            hl.classList.toggle('is-first', st.hl.x < 0.5);
            hl.classList.toggle('is-last', st.hl.x > 2.5);
            if (Math.abs(st.hl.v) > 0.002 || Math.abs(st.hl.x - st.slot) > 0.002) moving = true;
            buttons.forEach((b, i) => {
                const r = b.getBoundingClientRect();
                const d = st.px == null ? 9 : (st.px - (r.left + r.width / 2 - box.left)) / cell;
                const want = 1 + (springy ? 0.16 : 0.11) * Math.exp(-d * d * 1.6) + (i === st.slot ? 0.1 : -0.02);
                Feel?.spring(st.scales[i], want, springy ? 24 : 30, springy ? 0.5 : 0.8, dt);
                const s = st.scales[i].x;
                b.firstChild.style.transform = `translateY(${(-(s - 1) * 40).toFixed(2)}%) scale(${s.toFixed(4)})`;
                b.classList.toggle('is-sel', i === st.slot);
                if (Math.abs(st.scales[i].v) > 0.002 || Math.abs(s - want) > 0.002) moving = true;
            });
            st.raf = moving && promo.isConnected ? requestAnimationFrame(step) : 0;
        };
        const kick = () => { if (!st.raf) { st.last = 0; st.raf = requestAnimationFrame(step); } };
        const aim = event => {
            const box = bar.getBoundingClientRect();
            st.tx = Math.max(-1.2, Math.min(1.2, ((event.clientX - box.left) / box.width) * 2 - 1));
            st.ty = Math.max(-1.6, Math.min(1.6, ((event.clientY - box.top) / box.height) * 2 - 1));
            const inside = event.clientY > box.top - box.height * 0.6 && event.clientY < box.bottom + box.height * 0.6;
            st.px = inside ? event.clientX - box.left : null;
            kick();
        };
        let pressed = null;
        // попадание считаем по ровной (не наклонённой) капсуле: наклон не должен уводить фигуру из-под пальца
        const buttonAt = event => {
            const box = bar.getBoundingClientRect();
            const padX = box.width * 0.03, padY = box.height * 0.35;
            if (event.clientX < box.left - padX || event.clientX > box.right + padX || event.clientY < box.top - padY || event.clientY > box.bottom + padY) return null;
            return buttons[Math.max(0, Math.min(3, Math.floor((event.clientX - box.left) / box.width * 4)))];
        };
        const close = () => {
            ui.promo = null;
            promo.style.pointerEvents = 'none';
            promo.classList.remove('show');
            if (!bar.animate || REDUCED_MOTION) { promo.remove(); return; }
            bar.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(0.6, 0.4)', opacity: 0, filter: 'blur(4px)' }], { duration: 170, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }).onfinish = () => promo.remove();
        };
        const pick = kind => {
            const pending = ui.promo;
            if (!pending) return;
            const b = buttons.find(item => item.dataset.promo === kind);
            b?.classList.add('is-picked');
            close();
            playMove({ from: pending.from, to: pending.to, promotion: kind }, { byUser: true, dropped: true });
        };
        const cancel = () => {
            if (!ui.promo) return;
            close();
            if (el && dropped) slide(el, from, { dropped: true, effects: false });
        };
        promo.addEventListener('pointermove', event => {
            aim(event);
            if (pressed && pressed !== 'outside') {
                const b = buttonAt(event);
                buttons.forEach(item => item.classList.toggle('is-pressed', item === b));
                if (b && b !== pressed) { pressed = b; haptic('select'); }
            }
        });
        promo.addEventListener('pointerleave', () => { st.tx = st.ty = 0; st.px = null; kick(); });
        promo.addEventListener('pointerdown', event => {
            event.stopPropagation();
            event.preventDefault();
            aim(event);
            pressed = buttonAt(event) || 'outside';
            if (pressed !== 'outside') { pressed.classList.add('is-pressed'); haptic('select'); }
            try { promo.setPointerCapture(event.pointerId); } catch (_) {}
        });
        promo.addEventListener('pointerup', event => {
            event.stopPropagation();
            const b = buttonAt(event);
            buttons.forEach(item => item.classList.remove('is-pressed'));
            const was = pressed;
            pressed = null;
            if (b) pick(b.dataset.promo);
            else if (was === 'outside') cancel();
            else if (event.pointerType !== 'mouse') { st.tx = st.ty = 0; st.px = null; kick(); }
        });
        promo.addEventListener('pointercancel', () => { pressed = null; buttons.forEach(item => item.classList.remove('is-pressed')); st.tx = st.ty = 0; st.px = null; kick(); });
        kick();
    }


    /* ---------- ход ---------- */
    function playMove(raw, { byUser = false, dropped = false, quiet = false } = {}) {
        if (!game || game.over) return null;
        if (!byUser) cancelCinema();   // ход соперника прерывает кат-сцену
        const before = byUser && actionOn() && game.view == null ? { fen: game.chess.fen(), board: positionMap(game.chess) } : null;
        const move = core.tryMove(game.chess, raw);
        if (!move) return null;
        game.moves.push(move);
        // Ход соперника не сбрасывает выбранную (или перетаскиваемую) фигуру —
        // если только её не взяли этим ходом.
        const capturedSq = move.flags.includes('e') ? move.to[0] + move.from[1] : move.to;
        const keepSelection = !byUser && ui.selected && ui.selected !== capturedSq && ui.selected !== move.from;
        if (!keepSelection) clearSelection(false);
        if (!byUser && ui.drag && (ui.drag.sq === capturedSq || ui.drag.sq === move.from)) cancelDrag(false);
        clearAnnotations(false);
        let contact = 0;
        // мат: ход разыгрывается заново в фильме на доске — фигура пока остаётся на своей клетке
        const mated = game.chess.isCheckmate() && game.mode !== 'puzzle';
        let replay = null;
        if (game.view != null) { game.view = null; refs.board.classList.remove('is-review'); syncPieces(positionMap(game.chess), { animate: true }); }
        else if (mated && mateReplayOk(move) && (replay = stageMateMove(move))) contact = 0;
        else contact = animateMove(move, { dropped });
        lastMoveAt = performance.now();
        game.contactAt = lastMoveAt + contact;
        if (keepSelection) refreshSelection();
        if (game.clock) pressOfflineClock(move.color);
        const check = game.chess.inCheck();
        const cinema = before && !mated ? planCinema(move, before) : null;
        if (cinema) quiet = true;
        if (mated) {
            // фильм начинается сразу после хода (без перетаскивания — после касания клетки)
            cancelMateShow();
            const id = game.id;
            game.mateShow = new Promise(resolve => later(() => {
                if (game?.id !== id) { resolve(); return; }
                playMateShow({ replay, move }).then(resolve);
            }, replay ? 0 : contact + 40));
            if (replay) quiet = true;
        }
        if (!quiet) {
            // звук, вибрация и реакция доски — в один момент: когда фигура коснулась клетки
            playMoveSound(move, check, contact);
            later(() => haptic(move.captured ? 'medium' : 'light'), contact);
            if (check && !game.chess.isCheckmate()) checkFx(findKing(game.chess, game.chess.turn()), contact);
        }
        playtime('note');
        game.hint = null;
        afterChange();
        talkAfterMove(move);
        if (cinema) startCinema(cinema);
        if (game.mode === 'online' && byUser) {
            game.online.pending = true;
            emit('chess_move', { roomCode: game.online.roomCode, ply: game.moves.length - 1, move: { from: move.from, to: move.to, promotion: move.promotion } });
            setTimeout(() => { if (game?.online) game.online.pending = false; }, 1500);
        }
        if (game.mode === 'puzzle') {
            if (byUser) puzzleUserMove(move);
            return move;
        }
        if (game.mode !== 'online') {
            const outcome = core.boardOutcome(game.chess);
            if (outcome) { finishGame(outcome); return move; }
            saveOffline();
            if (game.mode === 'bot' && game.chess.turn() !== game.myColor) botMove();
            if (game.mode === 'local' && settings.autoFlip) setTimeout(() => setOrientation(game.chess.turn()), 420);
        }
        return move;
    }

    /** После хода соперника пробуем отложенный предход. */
    function runPremove() {
        const pm = game?.premove;
        if (!pm) return;
        game.premove = null;
        if (!canMoveNow()) { renderMarks(); return; }
        const legal = game.chess.moves({ square: pm.from, verbose: true }).some(m => m.to === pm.to);
        if (legal) setTimeout(() => { if (canMoveNow()) playMove(pm, { byUser: true }); }, 60);
        else renderMarks();
    }

    /** Шах как физическое событие: король вздрагивает, от его клетки уходит
        импульс, доска на миг «напрягается» — пространство чуть темнеет к краям,
        и внимание стягивается к королю. Без вспышек: коротко и благородно. */
    function checkFx(kingSq, at = 0) {
        const P = feel();
        later(() => { haptic('heavy'); setTimeout(() => haptic('warning'), 90); }, at);
        if (!P || !kingSq || REDUCED_MOTION || !refs.fx) return;
        later(() => {
            if (!game || game.view != null) return;
            const [kx, ky] = sqXY(kingSq);
            const el = view.els.get(kingSq);
            const face = el?.firstChild;
            if (face?.animate && !el.classList.contains('dragging')) {
                // вздрагивание: затухающие колебания; упругий король ещё и приседает
                const n = 9, amp = P.shudder * 100, frames = [];
                for (let i = 0; i <= n; i++) {
                    const u = i / n, decay = Math.pow(1 - u, 1.6);
                    const dx = i === n ? 0 : amp * decay * Math.sin(u * Math.PI * 7);
                    const sq = P.style === 'elastic' ? 1 - 0.06 * P.amp * decay * Math.max(0, Math.cos(u * Math.PI * 3.5)) : 1;
                    frames.push({ offset: u, transform: i === n ? 'none' : `translateX(${dx.toFixed(2)}%) scale(${(2 - sq).toFixed(4)}, ${sq.toFixed(4)})` });
                }
                face.animate(frames, { duration: Math.round(P.shudderMs), easing: 'linear' });
            }
            // импульс вокруг клетки короля
            const pulse = document.createElement('div');
            pulse.className = 'cs-pulse';
            pulse.style.transform = sqTf(kingSq);
            pulse.style.setProperty('--t', `${Math.round(620 * Math.max(0.7, P.tempo))}ms`);
            refs.fx.appendChild(pulse);
            setTimeout(() => pulse.remove(), 900);
            // напряжение: края доски темнеют, у короля — тихий красный
            const tension = refs.tension;
            if (tension?.animate && P.tension > 0.01) {
                const X = ((kx + 0.5) * 12.5).toFixed(2), Y = ((ky + 0.5) * 12.5).toFixed(2);
                tension.style.background = `radial-gradient(circle at ${X}% ${Y}%, rgba(255, 45, 60, ${(P.tension * 0.55).toFixed(3)}) 0, rgba(255, 45, 60, 0) 11%, rgba(14, 4, 10, 0) 16%, rgba(14, 4, 10, ${(P.tension * 0.6).toFixed(3)}) 38%, rgba(10, 2, 8, ${P.tension.toFixed(3)}) 75%)`;
                tension.getAnimations().forEach(a => a.cancel());
                const hold = P.li === 2 ? 1150 : 820;
                tension.animate([{ opacity: 0 }, { opacity: 1, offset: 0.14 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], { duration: Math.round(hold * Math.max(0.7, P.tempo)), easing: 'ease-out' });
            }
            // доска чуть «сжимается» к королю и отпускает
            if (refs.cam?.animate && P.press2 > 0) {
                // сжатие к королю: сдвиг компенсирует масштаб, точка отсчёта камеры не меняется
                const k = 1 - P.press2, ox = ((kx + 0.5) / 8) * (1 - k) * 100, oy = ((ky + 0.5) / 8) * (1 - k) * 100;
                refs.cam.animate([{ transform: 'none' }, { transform: `translate(${ox.toFixed(3)}%, ${oy.toFixed(3)}%) scale(${k.toFixed(4)})`, offset: 0.25 }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.3,.7,.4,1)' });
            }
        }, at);
    }

    function afterChange() {
        renderMarks();
        renderCoach();
        renderMoveList();
        renderPlayers();
        renderStatus();
        renderActions();
        scheduleHint();
        scheduleAnalysis();
        scheduleReview();
    }

    /* ---------- бот ---------- */
    async function botMove() {
        if (!game || game.mode !== 'bot' || game.over) return;
        const token = ++botToken;
        game.botBusy = true;
        renderStatus();
        const level = core.botLevel(game.level);
        const started = performance.now();
        const fen = game.chess.fen();
        const legal = game.chess.moves({ verbose: true });
        let choice = null;
        if (Math.random() < level.random) {
            choice = legal[Math.floor(Math.random() * legal.length)];
        } else {
            try {
                const left = game.clock ? core.clockLeft(game.clock, game.chess.turn(), Date.now()) : Infinity;
                const think = core.botThinkTime(level.level, left, game.clock?.inc || 0);
                const result = await engine('bot').search({ fen, skill: level.skill, depth: level.depth, movetime: think });
                if (result.bestmove) choice = core.normalizeMove(result.bestmove);
            } catch (_) {
                if (!game.engineWarned) { game.engineWarned = true; toast(tr('e_engine'), 'error'); }
            }
            if (!choice) choice = fallbackMove(legal);
        }
        const lowTime = game.clock && core.clockLeft(game.clock, game.chess.turn(), Date.now()) < 15000;
        const minDelay = lowTime ? 120 : 420 + Math.random() * 380;
        const spent = performance.now() - started;
        if (spent < minDelay) await sleep(minDelay - spent);
        if (cinema) { await waitCinema(); await sleep(260); }
        if (token !== botToken || !game || game.over || game.chess.fen() !== fen) return;
        game.botBusy = false;
        if (!playMove(choice)) { const any = legal[0]; if (any) playMove(any); }
        runPremove();
        renderStatus();
    }

    /** Без движка: берём самое ценное взятие, иначе случайный ход. */
    function fallbackMove(legal) {
        const captures = legal.filter(m => m.captured).sort((a, b) => core.PIECE_VALUE[b.captured] - core.PIECE_VALUE[a.captured]);
        return captures[0] || legal[Math.floor(Math.random() * legal.length)];
    }

    /* ---------- подсказка владельца ---------- */
    let hintOn = false;
    function activeHint() {
        if (!hintOn || !isOwner() || !game || game.over || game.mode === 'puzzle' || game.view != null || !game.hint) return null;
        if (game.hint.fen !== game.chess.fen() || !game.hint.move) return null;
        if (!controls(game.chess.turn())) return null;
        return game.hint.move;
    }
    let hintTimer = null;
    function scheduleHint() {
        clearTimeout(hintTimer);
        if (!hintOn || !isOwner() || !game || game.over || game.mode === 'puzzle') { hintToken++; engines.hint?.stop(); renderEval(null); return; }
        hintTimer = setTimeout(runHint, 120);
    }
    /* Анализ идёт непрерывно, пока ход ваш: глубина растёт (20, 25, 30…),
       стрелка уточняется. Её показываем только с глубины 14 — раньше расчёт
       ещё поверхностный и стрелка дёргалась бы. Предел — глубина 30 или
       30 секунд, чтобы не сажать батарею; в ход соперника хватает короткой оценки. */
    const HINT_MIN_DEPTH = 14;
    const HINT_MAX_DEPTH = 30;
    const HINT_MAX_MS = 30000;
    // компьютер владельца: считаем, пока ход твой (до 245 — предел Stockfish, или 20 минут)
    const HINT_FULL_DEPTH = 245;
    const HINT_FULL_MS = 20 * 60 * 1000;
    async function runHint() {
        if (!hintOn || !isOwner() || !game || game.over || document.hidden) return;
        const fen = game.chess.fen();
        const token = ++hintToken;
        const mine = controls(game.chess.turn());
        const show = (move, score) => {
            if (!move || !score) return;
            const prev = game.hint;
            const sameMove = prev && prev.fen === fen && prev.move && prev.move.from === move.from && prev.move.to === move.to && prev.move.promotion === move.promotion;
            game.hint = { fen, move, score };
            if (!sameMove) renderMarks();
            renderEval(score);
        };
        try {
            const eng = engine('hint');
            eng.stop();
            const result = await eng.search({
                fen, skill: 20,
                depth: mine ? (maxHint() ? HINT_FULL_DEPTH : HINT_MAX_DEPTH) : (maxHint() ? 22 : 16),
                movetime: mine ? (maxHint() ? HINT_FULL_MS : HINT_MAX_MS) : 2500,
                onInfo: info => {
                    if (token !== hintToken || !game || game.chess.fen() !== fen) return;
                    if (info.score.depth < HINT_MIN_DEPTH && info.score.type !== 'mate') return;
                    show(core.normalizeMove(info.move), info.score);
                },
            });
            if (token !== hintToken || !game || game.chess.fen() !== fen) return;
            const score = result.score;
            if (score && (score.depth >= HINT_MIN_DEPTH || score.type === 'mate')) show(result.bestmove && core.normalizeMove(result.bestmove), score);
        } catch (_) {
            if (token === hintToken) toast(tr('e_engine'), 'error');
        }
    }
    function renderEval(score) {
        const pill = refs.eval;
        if (!pill) return;
        if (!hintOn || !score) { pill.classList.remove('show'); return; }
        const text = score.type === 'mate'
            ? `${score.value > 0 ? '+' : '−'}M${Math.abs(score.value)}`
            : `${score.value >= 0 ? '+' : '−'}${(Math.abs(score.value) / 100).toFixed(1)}`;
        pill.textContent = text;
        if (score.depth) {
            const depth = document.createElement('small');
            depth.textContent = String(score.depth);
            pill.appendChild(depth);
        }
        pill.classList.add('show');
    }
    function setHint(on) {
        hintOn = !!on && isOwner();
        try { localStorage.setItem(HINT_KEY, hintOn ? '1' : '0'); } catch (_) {}
        refs.hintBtn?.classList.toggle('is-on', hintOn);
        if (!hintOn) { hintToken++; if (game) game.hint = null; engines.hint?.stop(); renderMarks(); renderEval(null); }
        else {
            scheduleHint();
            if (maxHint() && !canThreads() && !mtFailed) setTimeout(() => toast(tr('hintRestart')), 1200);
        }
    }

    /* ---------- задачи ----------
       Тысячи задач из открытой базы lichess (CC0): assets/chess/puzzles, разбиты по
       рейтингу и грузятся по мере надобности (scripts/build-chess-puzzles.mjs).
       Режимы: с рейтингом (Эло против рейтинга задачи), серия (без ошибок, всё
       сложнее), задача дня (одна на всех), темы (мат в 1/2/3, вилка, связка…).
       «Огонёк» — сколько задач подряд решено с первой попытки и без подсказок. */
    const PUZZLE_KEY = 'chess_puzzles';
    const PUZZLE_COLORS = ['#ff3b30', '#ff6b2c', '#ff9f0a', '#34c759', '#00b8d4', '#0a84ff', '#5e5ce6', '#af52de', '#ff2d78', '#c0392b', '#f5b400', '#8e8e93'];
    const pz = Object.assign({ rating: core.PUZZLE_START_RATING, played: 0, solved: 0, firstTry: 0, bestFirstTry: 0, streakBest: 0, daily: null, dayStreak: 0, seen: [] }, readJson(PUZZLE_KEY, {}));
    const savePz = () => { pz.seen = pz.seen.slice(-800); writeJson(PUZZLE_KEY, pz); };
    const puzzleData = { index: null, shards: new Map() };
    let puzzleRun = null;      // серия: { count }
    let puzzleToken = 0;       // новая партия или задача отменяет загружающуюся
    let puzzleStartedAt = 0;
    const dayKey = (offset = 0) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
    const dayBefore = day => new Date(Date.parse(day) - 864e5).toISOString().slice(0, 10);
    const signed = n => (n > 0 ? `+${n}` : String(n));

    function puzzleFile(name) {
        return fetch(`${BASE}puzzles/${name}${VERSION ? `?v=${VERSION}` : ''}`).then(r => { if (!r.ok) throw new Error('puzzles'); return r.json(); });
    }
    function puzzleIndex() {
        if (!puzzleData.index) {
            puzzleData.index = puzzleFile('index.json');
            puzzleData.index.catch(() => { puzzleData.index = null; });
        }
        return puzzleData.index;
    }
    /** Часть базы; обещание кладётся сразу, чтобы один файл не качался дважды. */
    function puzzleShard(n) {
        if (!puzzleData.shards.has(n)) {
            const load = puzzleIndex().then(index => puzzleFile(index.shards[n].file));
            puzzleData.shards.set(n, load);
            load.catch(() => puzzleData.shards.delete(n));
        }
        return puzzleData.shards.get(n);
    }
    /** Задачи рядом с рейтингом: своя часть базы, у края — и соседняя (грузятся параллельно). */
    async function puzzlesNear(target) {
        const shards = (await puzzleIndex()).shards;
        let n = shards.findIndex(s => target >= s.from && target < s.to);
        if (n < 0) n = target < shards[0].from ? 0 : shards.length - 1;
        const parts = [n];
        if (n > 0 && target - shards[n].from < 150) parts.push(n - 1);
        if (n < shards.length - 1 && shards[n].to - target < 150) parts.push(n + 1);
        return (await Promise.all(parts.map(puzzleShard))).flat();
    }
    /** Для тем — вся база: у редких тем на краях рейтинга мало задач. */
    async function puzzlesAll() {
        const shards = (await puzzleIndex()).shards;
        return (await Promise.all(shards.map((_, n) => puzzleShard(n)))).flat();
    }

    async function startPuzzle(kind, { theme = null, button = null } = {}) {
        if (Date.now() - puzzleStartedAt < 800) return;   // двойное нажатие
        const token = ++puzzleToken;
        button?.classList.add('is-busy');
        try {
            let entry;
            if (kind === 'daily') {
                const index = await puzzleIndex();
                const list = await puzzleShard(Math.min(2, index.shards.length - 1));
                entry = list[core.dailyPuzzleIndex(dayKey(), list.length)];
            } else {
                const target = kind === 'streak' ? core.streakTarget(puzzleRun?.count || 0) : pz.rating;
                const list = theme != null ? await puzzlesAll() : await puzzlesNear(target);
                entry = core.pickPuzzle(list, { target, themeBit: theme, seen: new Set(pz.seen) });
            }
            if (token !== puzzleToken) return;   // пока грузили, начали другую партию или задачу
            if (!entry) throw new Error('empty');
            playPuzzle(entry, kind, theme);
        } catch (_) {
            if (token === puzzleToken) toast(tr('pzLoadFailed'), 'error');
        } finally {
            button?.classList.remove('is-busy');
        }
    }

    function playPuzzle([id, fen, moves, rating, mask], kind, theme, { retry = false } = {}) {
        const solution = String(moves).split(' ');
        const myColor = new Chess(fen).turn() === 'w' ? 'b' : 'w';   // первый ход — соперника
        puzzleStartedAt = Date.now();
        puzzleToken++;
        if (ui.promo) { ui.promo.el.remove(); ui.promo = null; }
        hideBanner();
        closeSheet();
        // партия раньше экрана: при открытии экрана режим уже «задача» (экшен-режим не грузится)
        newGame({ mode: 'puzzle', myColor, startFen: fen, orientation: myColor });
        openScreen();
        refs.hintBtn.hidden = true;   // оценка движка выдала бы ответ
        const p = game.puzzle = {
            id, rating, mask, kind, theme, solution, retry, day: dayKey(), startedAt: Date.now(),
            step: 0, mistakes: 0, hint: 0, hinted: false, done: false, solved: false, failed: false, locked: true,
            recorded: false, delta: null, feedback: null, result: null,
        };
        if (!pz.seen.includes(id)) pz.seen.push(id);
        savePz();
        afterChange();
        setTimeout(() => {
            if (game?.puzzle !== p) return;
            playMove(solution[0]);
            p.step = 1;
            p.locked = false;
            afterChange();
        }, 700);
    }

    function puzzleUserMove(move) {
        const p = game.puzzle;
        if (!p || p.done) return;
        const mates = game.chess.isCheckmate();
        if (core.puzzleMoveOk(p.solution[p.step], move, mates)) {
            puzzleMark(move.to, true);
            p.feedback = 'ok';
            p.step++;
            if (mates || p.step >= p.solution.length) { puzzleSolved(p); return; }
            p.locked = true;
            afterChange();
            setTimeout(() => {
                if (game?.puzzle !== p) return;
                playMove(p.solution[p.step]);
                p.step++;
                p.hint = 0;   // подсказка была к прошлому ходу
                p.locked = false;
                afterChange();
            }, 450);
            return;
        }
        // не тот ход: отметка, ход откатывается, ошибка учитывается
        puzzleMark(move.to, false);
        haptic('error');
        p.mistakes++;
        p.feedback = 'wrong';
        p.locked = true;
        if (p.mistakes === 1) puzzleFailed(p);
        afterChange();
        setTimeout(() => {
            if (game?.puzzle !== p) return;
            // успели листнуть назад — возвращаемся к текущей позиции
            if (game.view != null) { game.view = null; refs.board.classList.remove('is-review'); }
            game.chess.undo();
            game.moves.pop();
            syncPieces(positionMap(game.chess), { animate: true });
            p.locked = p.done;
            afterChange();
        }, 700);
    }

    /** Рейтинг меняется один раз за задачу: при первой ошибке, подсказке, решении-ответе или решении. */
    function recordPuzzle(p, solved) {
        if (p.recorded || p.kind !== 'rated') return;
        p.recorded = true;
        p.delta = core.puzzleRatingChange(pz.rating, p.rating, solved, pz.played);
        pz.rating = Math.max(400, pz.rating + p.delta);
        pz.played++;
        savePz();
    }
    /** Повтор и уже решённая сегодня задача дня статистику не меняют. */
    const countsForStats = p => !p.retry && !(p.kind === 'daily' && pz.daily === p.day);

    function puzzleFailed(p) {
        p.failed = true;
        recordPuzzle(p, false);
        if (countsForStats(p)) pz.firstTry = 0;
        savePz();
        if (p.kind !== 'streak') return;
        // серия заканчивается на первой ошибке
        const n = puzzleRun?.count || 0;
        p.done = true;
        p.runFinal = n;   // заголовок и строка игрока показывают итог серии
        p.result = { text: tr('streakOver', { n }), tone: 'bad' };
        puzzleRun = null;
        pz.streakBest = Math.max(pz.streakBest, n);
        savePz();
    }

    function puzzleSolved(p) {
        p.done = true;
        p.solved = true;
        p.locked = true;
        const perfect = !p.failed && !p.hinted;
        recordPuzzle(p, perfect);
        if (countsForStats(p)) {
            pz.solved++;
            if (perfect) { pz.firstTry++; pz.bestFirstTry = Math.max(pz.bestFirstTry, pz.firstTry); } else pz.firstTry = 0;
            if (p.kind === 'daily') {
                pz.dayStreak = pz.daily === dayBefore(p.day) ? pz.dayStreak + 1 : 1;
                pz.daily = p.day;
            }
        }
        if (p.kind === 'streak' && puzzleRun) { puzzleRun.count++; pz.streakBest = Math.max(pz.streakBest, puzzleRun.count); }
        savePz();
        let text = tr(perfect ? 'pzSolved' : 'pzSolvedLate');
        if (p.kind === 'rated' && p.delta != null) text += ` ${signed(p.delta)}`;
        if (p.kind === 'daily' && countsForStats(p) && pz.dayStreak > 1) text += ` ${tr('dailyDays', { n: pz.dayStreak })}`;
        if (p.kind === 'streak') text = `${tr('pzCorrect')} ${tr('streakNow', { n: puzzleRun?.count || 0 })}`;
        p.result = { text, tone: perfect ? 'good' : 'late' };
        Sound.play('win', 0.55);
        haptic('success');
        afterChange();
        // в серии сразу дальше; в остальных — кнопкой «Дальше»
        if (p.kind === 'streak') setTimeout(() => { if (game?.puzzle === p && puzzleRun) startPuzzle('streak'); }, 1300);
    }

    function puzzleHint() {
        const p = game?.puzzle;
        if (!p || p.done || p.locked || p.kind === 'streak') return;
        p.hint = Math.min(2, p.hint + 1);
        if (!p.hinted) {
            p.hinted = true;
            if (p.kind === 'rated' && !p.recorded) { recordPuzzle(p, false); toast(tr('pzHintCost')); }
            if (countsForStats(p)) pz.firstTry = 0;
            savePz();
        }
        haptic('light');
        afterChange();
    }
    function puzzleNextExpected() {
        const p = game?.puzzle;
        if (!p || p.done || p.locked || game.view != null) return null;
        return core.normalizeMove(p.solution[p.step] || '');
    }
    function puzzleHintFrom() {
        const p = game?.puzzle;
        return p?.hint === 1 ? puzzleNextExpected()?.from || null : null;
    }
    function puzzleHintMove() {
        const p = game?.puzzle;
        return p?.hint >= 2 ? puzzleNextExpected() : null;
    }

    /** Решение: оставшиеся ходы проигрываются по очереди. */
    function showPuzzleSolution() {
        const p = game?.puzzle;
        if (!p || (p.locked && !p.done) || p.solved) return;
        if (!p.done) {
            p.failed = true;
            recordPuzzle(p, false);
            if (countsForStats(p)) pz.firstTry = 0;
            savePz();
            p.result = { text: tr('pzFailed'), tone: 'bad' };
        }
        p.done = true;
        p.locked = true;
        p.showing = true;
        afterChange();
        const step = () => {
            if (game?.puzzle !== p) return;
            if (p.step >= p.solution.length) { p.showing = false; afterChange(); return; }
            playMove(p.solution[p.step]);
            p.step++;
            setTimeout(step, 700);
        };
        setTimeout(step, 250);
    }
    function retryPuzzle() {
        const p = game?.puzzle;
        if (!p) return;
        playPuzzle([p.id, game.startFen, p.solution.join(' '), p.rating, p.mask], p.kind === 'rated' ? 'practice' : p.kind, p.theme, { retry: true });
    }
    function nextPuzzle() {
        const p = game?.puzzle;
        if (!p) return;
        if (p.kind === 'streak') { if (!puzzleRun) puzzleRun = { count: 0 }; startPuzzle('streak'); return; }
        if (p.kind === 'daily') { closeScreen(); openSheet('puzzles'); return; }
        startPuzzle(p.kind === 'practice' ? 'rated' : p.kind, { theme: p.theme });
    }

    function puzzleMark(sq, ok) {
        let layer = refs.board.querySelector('.pz-fx');
        if (!layer) {
            layer = document.createElement('div');
            layer.className = 'pz-fx';
            refs.board.appendChild(layer);
        }
        const node = document.createElement('div');
        node.className = `pz-flash ${ok ? 'ok' : 'no'}`;
        node.style.transform = sqTf(sq);
        node.innerHTML = `<span class="cs-q">${ok ? Q_GLYPH.good : Q_GLYPH.miss}</span>`;
        layer.appendChild(node);
        // крестик уходит вместе с откатом хода, галочка чуть дольше
        setTimeout(() => node.remove(), ok ? 1200 : 700);
    }

    function puzzleTitle(p) {
        if (!p) return tr('modePuzzles');
        if (p.kind === 'streak') return tr('streakNow', { n: puzzleRun?.count ?? p.runFinal ?? 0 });
        if (p.kind === 'daily') return tr('dailyPuzzle');
        if (p.kind === 'theme') return tr(`th_${core.PUZZLE_THEMES[p.theme]}`);
        return tr('modePuzzles');
    }
    function puzzleStatus() {
        const p = game.puzzle;
        if (!p) return '';
        if (p.done) return tr('pzTaskInfo', { rating: p.rating });   // итог — в строке над доской, здесь не повторяется
        if (p.step === 0) return tr('pzLoading');
        if (p.feedback === 'wrong' && p.locked) return tr('pzWrong');
        if (p.feedback === 'ok' && p.step > 1) return tr('pzCorrect');
        return tr('yourMove');
    }
    /** Вместо игроков — задача сверху (задание, потом итог) и вы снизу (рейтинг, «огонёк»). */
    function renderPuzzlePlayers() {
        const p = game.puzzle;
        if (!p) return;
        const themes = core.PUZZLE_THEMES.filter((t, i) => p.mask & (1 << i)).slice(0, 3).map(t => tr(`th_${t}`)).join(' · ');
        // задание видно сразу; темы — только после решения, иначе это подсказка
        const head = p.done && p.result ? `<span class="pz-result pz-${p.result.tone}">${esc(p.result.text)}</span>` : `<span>${esc(tr('pzTaskInfo', { rating: p.rating }))}</span>`;
        const topSub = p.done ? themes || tr('pzTaskInfo', { rating: p.rating }) : tr(game.myColor === 'w' ? 'findWhite' : 'findBlack');
        refs.topPlayer.innerHTML = `
            <div class="cs-ava pz-ava${p.done ? ` pz-${p.result?.tone || 'bad'}` : ''}">${p.done && p.solved ? Q_GLYPH.good : p.done ? Q_GLYPH.miss : ICON.target}</div>
            <div class="cs-pinfo">
                <div class="cs-pname">${head}</div>
                <div class="cs-captured pz-sub">${esc(topSub)}</div>
            </div>
            <div class="cs-clock" hidden></div>`;
        const photo = me()?.photo_url && /^https:\/\//i.test(me().photo_url) ? me().photo_url : null;
        const avatar = photo ? `<img src="${esc(photo)}" alt="" referrerpolicy="no-referrer">` : `<span class="cs-ava-piece" style="background-image:url('${pieceUrl(game.myColor + 'K')}')"></span>`;
        const sub = p.kind === 'streak' ? tr('streakNow', { n: puzzleRun?.count ?? p.runFinal ?? 0 }) : `${pz.rating}${p.delta != null ? ` (${signed(p.delta)})` : ''}`;
        refs.bottomPlayer.innerHTML = `
            <div class="cs-ava is-turn">${avatar}</div>
            <div class="cs-pinfo">
                <div class="cs-pname"><span>${esc(myName())}</span><small class="${p.delta > 0 ? 'pz-up' : p.delta < 0 ? 'pz-down' : ''}">${esc(sub)}</small></div>
                <div class="cs-captured pz-sub">${pz.firstTry > 0 ? `<span class="pz-fire">${ICON.flame}${esc(tr('firstTry', { n: pz.firstTry }))}</span>` : ''}</div>
            </div>
            <div class="cs-clock" hidden></div>`;
    }
    function renderPuzzlePanel() {
        if (!refs.s_pzRating) return;
        refs.s_pzRating.textContent = String(pz.rating);
        refs.s_pzStats.textContent = tr('solvedCount', { n: pz.solved });
        refs.s_pzFirst.hidden = !pz.firstTry;
        refs.s_pzFirst.innerHTML = pz.firstTry ? `${ICON.flame}<span>${esc(tr('firstTry', { n: pz.firstTry }))}</span>` : '';
        refs.s_pzStreakSub.textContent = pz.streakBest ? tr('best', { n: pz.streakBest }) : tr('streakSub');
        const today = pz.daily === dayKey();
        const alive = today || pz.daily === dayKey(-1);
        refs.s_pzDailySub.textContent = today
            ? `${tr('dailySolved')}${pz.dayStreak > 1 ? ` · ${tr('dailyDays', { n: pz.dayStreak })}` : ''}`
            : alive && pz.dayStreak > 0 ? tr('dailyDays', { n: pz.dayStreak }) : tr('dailyNew');
    }

    /* ---------- оценка ходов и разбор партии ----------
       Отдельный Stockfish разбирает каждую позицию партии (две лучшие линии),
       и ход получает класс, как в разборе chess.com (core.classifyMove).
       С ботом — по ходу партии; с человеком и вдвоём — только после конца,
       чтобы движок ничего не подсказывал во время игры. На доске — значок
       у фигуры, в списке ходов и в отчёте — классы обеих сторон и точность;
       при разборе — оценка позиции, лучший ход стрелкой и график партии. */
    const REVIEW_DEPTH = 12;
    const REVIEW_MS = 900;
    const BOOK_PLIES = 30;
    /* Знаки в кружках — SVG-фигуры в квадрате 24×24 с центром в (12, 12),
       а не текст: у шрифтов «!» и «?» сидят по-разному и съезжают из центра. */
    const qExcl = x => `<rect x="${x - 1.6}" y="4" width="3.2" height="10.2" rx="1.6"/><circle cx="${x}" cy="18" r="1.95"/>`;
    const qQuest = x => `<path d="M${x - 3.3} 8.6a3.3 3.3 0 1 1 5 2.8c-1.1.7-1.7 1.4-1.7 2.7v.1" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${x}" cy="18.2" r="1.9"/>`;
    const qSvg = (body, scale = 1) => `<svg viewBox="0 0 24 24" aria-hidden="true">${scale === 1 ? body : `<g transform="translate(12 12) scale(${scale}) translate(-12 -12)">${body}</g>`}</svg>`;
    const Q_GLYPH = {
        brilliant: qSvg(qExcl(9) + qExcl(15)),
        great: qSvg(qExcl(12)),
        best: qSvg('<path transform="translate(0 .8)" d="M12 2.6l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 16.9l-5.6 2.9 1.1-6.2L3 9.2l6.2-.9z"/>'),
        excellent: qSvg('<path transform="translate(.5 .55)" d="M2.6 10.2h3.6v9.9H2.6zM8 20.1h8.7a2.2 2.2 0 0 0 2.2-1.8l1.5-6.9a2.2 2.2 0 0 0-2.2-2.6H14V5.2a2.4 2.4 0 0 0-2.4-2.4L8 10.2z"/>'),
        good: qSvg('<path d="M4.6 12.6l4.9 4.9 9.9-10.8" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>'),
        book: qSvg('<path d="M2.8 5.6c3-1.5 6.2-1.3 8.4.6v13.3c-2.2-1.7-5.4-1.9-8.4-.5zM21.2 5.6c-3-1.5-6.2-1.3-8.4.6v13.3c2.2-1.7 5.4-1.9 8.4-.5z"/>'),
        inaccuracy: qSvg(qQuest(9.9) + qExcl(17.3), 0.92),
        mistake: qSvg(qQuest(12)),
        miss: qSvg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/>'),
        blunder: qSvg(qQuest(7) + qQuest(17), 0.78),
    };
    const qBadge = cls => `<span class="cs-q q-${cls}">${Q_GLYPH[cls]}</span>`;
    const reviewOn = () => !!game && settings.review !== false && (game.mode === 'bot'
        || ((game.mode === 'online' || game.mode === 'local') && !!game.over && game.over.result !== 'aborted' && game.moves.length > 0));
    const BAD_MOVES = new Set(['inaccuracy', 'mistake', 'miss', 'blunder']);
    const TOP_MOVES = new Set(['brilliant', 'great', 'best', 'book']);
    const GRAPH_DOTS = new Set(['brilliant', 'great', 'mistake', 'miss', 'blunder']);
    const reviewFens = g => [g.startFen, ...g.moves.map(m => m.after)];
    const bookKey = fen => fen.split(' ').slice(0, 3).join(' ');
    let openingBook = null;
    /** Дебютная книга: позиции из линий lichess chess-openings (CC0). */
    function loadBook() {
        if (!openingBook) {
            openingBook = fetch(`${BASE}openings.json${VERSION ? `?v=${VERSION}` : ''}`)
                .then(r => (r.ok ? r.json() : []))
                .then(list => new Set(Array.isArray(list) ? list : []))
                .catch(() => new Set());
        }
        return openingBook;
    }

    function scheduleReview() {
        if (!reviewOn() || document.hidden || !screen?.classList.contains('visible')) return;
        const review = game.review || (game.review = { evals: [], marks: [], busy: false });
        if (!review.busy) pumpReview(game);
    }
    async function pumpReview(g) {
        const review = g.review;
        review.busy = true;
        try {
            const book = await loadBook();
            while (game === g && reviewOn() && !document.hidden && screen.classList.contains('visible')) {
                const fens = [g.startFen, ...g.moves.map(m => m.after)];
                if (classifyReady(g, fens, book)) renderReview();
                // сначала две последние позиции (значок свежего хода), потом остальные по порядку
                const order = [fens.length - 2, fens.length - 1, ...fens.keys()];
                const i = order.find(k => k >= 0 && review.evals[k]?.fen !== fens[k]);
                if (i == null) break;
                review.evals[i] = await evalPosition(fens[i]);
            }
        } catch (_) {
            // движок недоступен — партия идёт без оценок
        } finally {
            review.busy = false;
        }
    }
    async function evalPosition(fen) {
        const chess = new Chess(fen);
        const legal = chess.moves().length;
        // мат и пат оцениваем без движка: 1 — выиграли белые, −1 — чёрные, 0 — ничья
        if (!legal) return { fen, legal, terminal: chess.isCheckmate() ? (chess.turn() === 'w' ? -1 : 1) : 0, lines: {} };
        const result = await engine('review').search({ fen, skill: 20, depth: REVIEW_DEPTH, movetime: REVIEW_MS, multipv: Math.min(2, legal) });
        const lines = {};
        for (const [k, line] of Object.entries(result.lines || {})) {
            const move = core.normalizeMove(line.move);
            if (move && line.score) lines[k] = { move, score: line.score };
        }
        if (!lines[1] && result.bestmove && result.score) lines[1] = { move: core.normalizeMove(result.bestmove), score: result.score };
        if (!lines[1]) throw new Error('no eval');
        return { fen, legal, lines };
    }
    /** Шансы стороны color (0…100) в разобранной позиции по линии line. */
    function winFor(ev, color, line = 1) {
        if (!ev) return null;
        if (ev.terminal != null) return ev.terminal === 0 ? 50 : (ev.terminal === 1) === (color === 'w') ? 100 : 0;
        const l = ev.lines[line];
        if (!l) return null;
        const cp = core.scoreToCp(l.score);
        return core.winPercent(color === 'w' ? cp : -cp);
    }
    /** Ставит классы ходам, для которых готовы обе позиции. true — что-то изменилось. */
    function classifyReady(g, fens, book) {
        const review = g.review;
        let changed = review.marks.length > g.moves.length;
        review.marks.length = Math.min(review.marks.length, g.moves.length);
        g.moves.forEach((m, i) => {
            const a = review.evals[i], b = review.evals[i + 1];
            const prevMark = i > 0 ? review.marks[i - 1] : null;
            const key = `${fens[i]}|${fens[i + 1]}|${prevMark ? prevMark.cls : '-'}`;
            if (review.marks[i]?.key === key) return;
            if (a?.fen !== fens[i] || b?.fen !== fens[i + 1]) {
                if (review.marks[i]) { review.marks[i] = null; changed = true; }
                return;
            }
            const best = winFor(a, m.color), after = winFor(b, m.color);
            if (best == null || after == null) return;
            const top = a.lines[1]?.move;
            const isBest = !!top && top.from === m.from && top.to === m.to && (top.promotion || null) === (m.promotion || null);
            const prev = i > 0 ? g.moves[i - 1] : null;
            const prevEval = i > 0 ? review.evals[i - 1] : null;
            let sac = false;
            try { sac = core.sacrifice(new Chess(fens[i + 1]), m); } catch (_) {}
            const result = core.classifyMove({
                best, after, isBest,
                second: a.legal > 1 ? winFor(a, m.color, 2) : null,
                book: i < BOOK_PLIES && book.has(bookKey(fens[i + 1])),
                sacrifice: sac,
                recapture: !!(prev?.captured && m.captured && prev.to === m.to),
                capture: !!m.captured,
                prevLoss: prevMark?.loss || 0,
                prevBest: prevEval?.fen === fens[i - 1] ? winFor(prevEval, m.color) : null,
            });
            review.marks[i] = { key, ...result, acc: result.cls === 'book' ? 100 : core.moveAccuracy(best, after, isBest) };
            changed = true;
        });
        return changed;
    }
    function renderReview() {
        renderMarks();
        renderMoveList();
        renderCoach();
        if (ui.dialog?.kind === 'result') {
            const box = refs.sheet.querySelector('[data-ref="report"]');
            if (box) box.innerHTML = reportHtml();
        }
    }

    /** Разбор после партии: панель с оценкой показанного хода. */
    function openReview(ply) {
        if (!game || !reviewOn()) return;
        game.coach = true;
        renderCoach();
        setView(ply);
        renderMarks();
        renderCoach();
    }
    /** Оценка за белых: «+1.4», «−0.3», «M3», «−M2», после мата — «1-0». */
    function evalLabel(ev) {
        if (!ev) return null;
        if (ev.terminal != null) return { text: ev.terminal === 0 ? '½-½' : ev.terminal === 1 ? '1-0' : '0-1', white: ev.terminal >= 0 };
        const sc = ev.lines[1]?.score;
        if (!sc) return null;
        if (sc.type === 'mate') return { text: `${sc.value < 0 ? '−' : ''}M${Math.abs(sc.value)}`, white: sc.value > 0 };
        const v = sc.value / 100;
        return { text: `${v > 0.04 ? '+' : v < -0.04 ? '−' : ''}${Math.abs(v).toFixed(Math.abs(v) >= 10 ? 0 : 1)}`, white: v >= 0 };
    }
    function sanOf(fen, move) {
        if (!move) return null;
        try { return new Chess(fen).move({ from: move.from, to: move.to, promotion: move.promotion || 'q' })?.san || null; } catch (_) { return null; }
    }
    /** Лучший ход на месте ошибки — зелёной стрелкой поверх доски. */
    function reviewArrow() {
        if (!game?.coach || !reviewOn()) return null;
        const ply = game.view == null ? game.moves.length : game.view;
        const mark = ply > 0 ? game.review?.marks[ply - 1] : null;
        if (!mark || !BAD_MOVES.has(mark.cls)) return null;
        const before = game.review.evals[ply - 1];
        return before?.fen === reviewFens(game)[ply - 1] ? before.lines[1]?.move || null : null;
    }
    function renderCoach() {
        const box = refs.coach;
        if (!box) return;
        const show = !!game?.coach && reviewOn();
        if (box.hidden === show) { box.hidden = !show; layout(); }
        if (!show) { box.innerHTML = ''; return; }
        const review = game.review || { evals: [], marks: [] };
        const fens = reviewFens(game);
        const ply = game.view == null ? game.moves.length : game.view;
        const total = game.moves.length;
        const done = review.marks.filter(Boolean).length;
        const ev = review.evals[ply]?.fen === fens[ply] ? review.evals[ply] : null;
        const score = evalLabel(ev);
        const mark = ply > 0 ? review.marks[ply - 1] : null;
        let icon = '<span class="cs-q cs-coach-dot"></span>';
        let title = esc(tr('startPos'));
        let note = '';
        if (ply > 0) {
            const move = game.moves[ply - 1];
            const label = `${moveNumber(ply - 1)}${move.color === 'b' ? '…' : '.'} ${figurine(move)}`;
            if (mark) {
                icon = qBadge(mark.cls);
                title = `<span class="cs-coach-move">${label}</span><span class="cs-coach-cls">${esc(tr(`q_${mark.cls}`))}</span>`;
                const before = review.evals[ply - 1];
                const best = before?.fen === fens[ply - 1] ? before.lines[1]?.move : null;
                const same = best && best.from === move.from && best.to === move.to;
                if (best && !same && !TOP_MOVES.has(mark.cls)) note = esc(tr('betterWas', { move: sanOf(fens[ply - 1], best) || `${best.from}-${best.to}` }));
            } else title = `<span class="cs-coach-move">${label}</span>`;
        }
        if (!note && done < total) note = esc(tr('analysing', { done, total }));
        box.className = `cs-coach${mark ? ` q-${mark.cls}` : ''}`;
        box.innerHTML = `
            <div class="cs-coach-row">
                ${icon}
                <div class="cs-coach-text"><b>${title}</b>${note ? `<small>${note}</small>` : ''}</div>
                ${score ? `<span class="cs-coach-eval ${score.white ? 'is-w' : 'is-b'}">${esc(score.text)}</span>` : ''}
            </div>
            ${graphHtml(ply)}`;
    }
    /** График шансов белых по ходам: белая часть — перевес белых. Нажатие — к ходу. */
    function graphHtml(current = null) {
        const review = game?.review;
        if (!review || !game.moves.length) return '';
        const fens = reviewFens(game);
        const n = fens.length - 1;
        const points = [];
        fens.forEach((fen, i) => {
            const ev = review.evals[i];
            const w = ev?.fen === fen ? winFor(ev, 'w') : null;
            if (w != null) points.push([i / n * 100, 100 - w]);
        });
        if (points.length < 2) return '';
        const path = `M${points[0][0].toFixed(2)},100 ${points.map(([x, y]) => `L${x.toFixed(2)},${y.toFixed(2)}`).join(' ')} L${points[points.length - 1][0].toFixed(2)},100 Z`;
        const dots = review.marks.map((mark, i) => {
            if (!mark || !GRAPH_DOTS.has(mark.cls)) return '';
            const ev = review.evals[i + 1];
            const w = ev?.fen === fens[i + 1] ? winFor(ev, 'w') : null;
            return w == null ? '' : `<i class="cs-gdot q-${mark.cls}" style="left:${((i + 1) / n * 100).toFixed(2)}%;top:${Math.min(93, Math.max(7, 100 - w)).toFixed(2)}%" title="${esc(tr(`q_${mark.cls}`))}"></i>`;
        }).join('');
        const cur = current == null ? '' : `<i class="cs-gcur" style="left:${(current / n * 100).toFixed(2)}%"></i>`;
        return `<div class="cs-graph" data-plies="${n}" role="img" aria-label="${esc(tr('gameReview'))}">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="${path}"/><line x1="0" y1="50" x2="100" y2="50"/></svg>${cur}${dots}</div>`;
    }
    /** Значки классов у фигур: в партии — у двух последних ходов (свой и бота),
        при просмотре — у показанного хода. Значки не пересоздаются, чтобы не мигать. */
    function renderBadge() {
        const layer = refs.badges;
        if (!layer) return;
        const plies = [];
        if (game && reviewOn()) {
            if (game.view != null) { if (game.view > 0) plies.push(game.view); }
            else { if (game.moves.length > 1) plies.push(game.moves.length - 1); if (game.moves.length) plies.push(game.moves.length); }
        }
        // ход на клетку предыдущего (взятие) закрывает его значок
        const bySquare = new Map();
        for (const ply of plies) {
            const move = game.moves[ply - 1], mark = game.review?.marks[ply - 1];
            if (mark) bySquare.set(move.to, { key: `${ply}|${mark.cls}`, sq: move.to, cls: mark.cls });
            else bySquare.delete(move.to);
        }
        const want = new Map([...bySquare.values()].map(item => [item.key, item]));
        for (const el of [...layer.children]) if (!want.has(el.dataset.k)) el.remove();
        for (const [key, item] of want) {
            let el = [...layer.children].find(child => child.dataset.k === key);
            if (!el) {
                el = document.createElement('div');
                el.className = 'cs-badge-sq';
                el.dataset.k = key;
                el.innerHTML = qBadge(item.cls);
                layer.appendChild(el);
            }
            el.style.transform = sqTf(item.sq);
            el.title = tr(`q_${item.cls}`);
        }
    }
    /** Отчёт после партии: точность и сколько ходов каждого класса у обеих сторон. */
    function reportHtml() {
        const review = game?.review;
        if (!reviewOn() || !review || !game.moves.length) return '';
        const mine = game.myColor || 'w', bot = other(mine);
        const done = review.marks.filter(Boolean).length;
        const accuracy = color => core.gameAccuracy(game.moves.map((m, i) => (m.color === color ? review.marks[i]?.acc : null)).filter(v => v != null));
        const count = (color, cls) => game.moves.filter((m, i) => m.color === color && review.marks[i]?.cls === cls).length;
        const fmt = value => (value == null ? '—' : value.toFixed(1));
        const rows = core.MOVE_CLASSES.map(cls => {
            const a = count(mine, cls), b = count(bot, cls);
            return `<div class="cs-rep-row q-${cls}${a || b ? '' : ' is-zero'}"><b${a ? '' : ' class="is-zero"'}>${a}</b><span>${qBadge(cls)}${esc(tr(`q_${cls}`))}</span><b${b ? '' : ' class="is-zero"'}>${b}</b></div>`;
        }).join('');
        return `
            <div class="cs-rep-head">
                <div><small>${esc(playerInfo(mine).name)}</small><b>${fmt(accuracy(mine))}</b></div>
                <span>${esc(tr('accuracy'))}</span>
                <div><small>${esc(playerInfo(bot).name)}</small><b>${fmt(accuracy(bot))}</b></div>
            </div>
            ${graphHtml()}
            ${done < game.moves.length ? `<p class="cs-rep-progress">${esc(tr('analysing', { done, total: game.moves.length }))}</p>` : ''}
            <div class="cs-rep-rows">${rows}</div>`;
    }

    /* ---------- экшен-режим: кат-сцены взятий и лучших ходов ----------
       Сцены живут в chess-action.js (three.js) и грузятся лениво. Лучший ход
       считает отдельный Stockfish с двумя линиями: ход «лучший», если он
       совпал с первой линией и заметно сильнее второй. */
    const Action = {
        director: null, choose: null, loading: null, last: null,
        load() {
            if (this.loading) return this.loading;
            this.loading = import(`${BASE}chess-action.js${VERSION ? `?v=${VERSION}` : ''}`).then(mod => {
                this.director = mod.createDirector({ host: screen, base: BASE });
                this.choose = mod.chooseTemplate;
                setTimeout(() => this.director?.warmup(Sound.ctx), 60);
                return this.director;
            });
            this.loading.catch(() => { this.loading = null; });
            return this.loading;
        },
    };
    let cinema = null;   // { id, game, clockColor, waiters }
    let cinemaId = 0;
    let analysisToken = 0;
    let analysisTimer = null;

    function scheduleAnalysis() {
        clearTimeout(analysisTimer);
        if (!actionOn() || REDUCED_MOTION || !game || game.over || game.view != null) return;
        if (!controls(game.chess.turn()) || game.analysis?.fen === game.chess.fen()) return;
        analysisTimer = setTimeout(runAnalysis, 80);
    }
    async function runAnalysis() {
        if (!game || game.over || !actionOn()) return;
        const fen = game.chess.fen();
        if (game.chess.moves().length < 2) return;
        const token = ++analysisToken;
        const store = { fen, lines: {} };
        game.analysis = store;
        try {
            const eng = engine('action');
            eng.stop();
            const result = await eng.search({
                fen, skill: 20, depth: 14, movetime: 1500, multipv: 2,
                onInfo: info => {
                    if (token !== analysisToken) return;
                    const move = core.normalizeMove(info.move);
                    if (move) store.lines[info.multipv] = { move, score: info.score };
                },
            });
            if (token !== analysisToken) return;
            for (const [k, line] of Object.entries(result.lines || {})) {
                const move = core.normalizeMove(line.move);
                if (move) store.lines[k] = { move, score: line.score };
            }
        } catch (_) {}
    }
    const scoreCp = s => (s.type === 'mate' ? Math.sign(s.value || 1) * (100000 - Math.abs(s.value) * 100) : s.value);
    /** Ход совпал с первой линией движка и сильнее второй хотя бы на ~пешку. */
    function isBestMove(fen, move) {
        const a = game?.analysis;
        if (!a || a.fen !== fen) return false;
        const l1 = a.lines[1], l2 = a.lines[2];
        if (!l1 || !l2 || l1.score.depth < 8 || l2.score.depth < l1.score.depth - 1) return false;
        if (l1.move.from !== move.from || l1.move.to !== move.to) return false;
        const sign = fen.split(' ')[1] === 'w' ? 1 : -1;
        return (scoreCp(l1.score) - scoreCp(l2.score)) * sign >= 110;
    }

    /** Нужна ли кат-сцена: взятие, лучший ход или мат — и какая. */
    function planCinema(move, before) {
        if (REDUCED_MOTION || !Action.director || document.hidden || !screen.classList.contains('visible')) return null;
        const mate = game.chess.isCheckmate();
        const capture = !!move.captured;
        const promo = !!move.promotion;
        const best = isBestMove(before.fen, move);
        if (!capture && !best && !mate && !promo) return null;
        const value = capture ? core.PIECE_VALUE[move.captured] : 0;
        let threats = [];
        try {
            const parts = game.chess.fen().split(' ');
            parts[1] = move.color;
            parts[3] = '-';
            threats = [...new Set(new Chess(parts.join(' ')).moves({ square: move.to, verbose: true }).filter(m => m.captured).map(m => m.to))];
        } catch (_) {}
        // Вилка: ход бьёт сразу две ценные фигуры (или короля и фигуру).
        const weight = sq => { const p = game.chess.get(sq); return !p ? 0 : p.type === 'k' ? 100 : core.PIECE_VALUE[p.type]; };
        const fork = threats.filter(sq => weight(sq) >= 3).length >= 2;
        const { template, world } = Action.choose({ capture, best, mate, promo, fork, value }, Action.last);
        Action.last = template;
        return {
            template, world, best, threats,
            pieces: [...before.board],
            move: {
                from: move.from, to: move.to, color: move.color, piece: move.piece, captured: move.captured, promotion: move.promotion,
                capSq: move.flags.includes('e') ? move.to[0] + move.from[1] : (move.captured ? move.to : null),
            },
            kingSq: mate ? findKing(game.chess, game.chess.turn()) : null,
        };
    }

    function startCinema(plan) {
        const director = Action.director;
        if (!director || !game) return;
        cancelCinema();
        const board = refs.board.getBoundingClientRect();
        const host = screen.getBoundingClientRect();
        const style = getComputedStyle(screen);
        const css = name => style.getPropertyValue(name).trim();
        const spec = {
            ...plan,
            orientation: view.orientation,
            rect: { x: board.left - host.left, y: board.top - host.top, w: board.width, h: board.height, margin: parseFloat(css('--cs-margin')) || 16 },
            theme: { light: css('--cs-light') || '#fff', dark: css('--cs-dark') || '#e1e5ea', frame: css('--cs-frame') || '#fff', line: css('--cs-line') || '#c9ced6', coord: css('--cs-coord') || '#9aa2ad' },
            coords: settings.coords ? { files: [...refs.filesTop.children].map(el => el.textContent), ranks: [...refs.ranksLeft.children].map(el => el.textContent) } : null,
            texts: {
                best: tr('bestMove'), mate: tr('mateTitle'), skip: tr('tapToSkip'), capture: tr('actCapture'), brilliant: tr('actBrilliant'),
                fork: tr('actFork'), forkSub: tr('actForkSub'), promotion: tr('actPromotion'),
                pieces: { Q: tr('pieceQ'), R: tr('pieceR'), B: tr('pieceB'), N: tr('pieceN'), P: tr('pieceP'), K: tr('pieceK') },
            },
            sound: settings.sound, music: settings.sound, audio: Sound.ctx,
            onImpact: kind => haptic(kind),
        };
        const id = ++cinemaId;
        // часы на время сцены стоят: она не должна стоить никому времени
        let clockColor = null;
        if (game.clock?.running) {
            clockColor = game.clock.running;
            game.clock.left[clockColor] = core.clockLeft(game.clock, clockColor, Date.now());
            game.clock.running = null;
        }
        cinema = { id, game, clockColor, waiters: [] };
        Sound.unlock();
        director.play(spec).then(() => endCinema(id), () => endCinema(id));
    }
    function endCinema(id) {
        if (!cinema || cinema.id !== id) return;
        const done = cinema;
        cinema = null;
        if (done.game === game && game?.clock && done.clockColor && !game.over && !game.clock.running) {
            game.clock.running = done.clockColor;
            game.clock.since = Date.now();
        }
        done.waiters.forEach(fn => { try { fn(); } catch (_) {} });
    }
    function cancelCinema() {
        if (!cinema) return;
        const id = cinema.id;
        Action.director?.skip();
        endCinema(id);
    }
    function waitCinema() {
        return cinema ? new Promise(resolve => cinema.waiters.push(resolve)) : Promise.resolve();
    }
    /** Выполнить после кат-сцены (итог партии не перекрывает её). */
    function afterCinema(fn, delay = 0) {
        if (!cinema) { fn(); return; }
        cinema.waiters.push(() => setTimeout(fn, delay));
    }

    /* ---------- часы ---------- */
    function pressOfflineClock(color) {
        const ply = game.moves.length;
        core.clockPress(game.clock, color, Date.now(), { startOther: ply >= 2, addIncrement: ply > 2 });
    }
    function clockValues() {
        if (!game) return null;
        if (game.mode === 'online') {
            const snap = game.online.clock;
            if (!snap) return null;
            const elapsed = performance.now() - game.online.clockAt;
            const left = c => Math.max(0, snap[c] - (snap.running === c && !game.over ? elapsed : 0));
            return { w: left('w'), b: left('b'), running: game.over ? null : snap.running };
        }
        if (!game.clock) return null;
        const now = Date.now();
        return { w: core.clockLeft(game.clock, 'w', now), b: core.clockLeft(game.clock, 'b', now), running: game.over ? null : game.clock.running };
    }
    function formatClock(ms) {
        const total = Math.max(0, ms);
        if (total < 10000) return `0:0${Math.floor(total / 1000)}.${Math.floor(total % 1000 / 100)}`;
        const s = Math.ceil(total / 1000);
        const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
        return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
    }
    /** Живые часы. Переход хода — импульс: нажатые часы чуть вдавливаются и
        успокаиваются, у соперника часы «просыпаются». Меняющиеся цифры секунд
        мягко прокручиваются (десятые — нет: их надо читать мгновенно).
        Прибавка времени всплывает «+2», последние секунды бьются сердцем. */
    function renderClockText(el, text, roll) {
        const chars = [...text];
        let spans = el._spans;
        if (!spans || spans.length !== chars.length) {
            el.innerHTML = chars.map(ch => `<span class="cs-cd${/\d/.test(ch) ? '' : ' cs-cd-sep'}">${ch}</span>`).join('');
            el._spans = [...el.children];
            el._text = text;
            return;
        }
        const dot = text.indexOf('.');
        chars.forEach((ch, i) => {
            if (el._text[i] === ch) return;
            const span = spans[i];
            span.textContent = ch;
            if (roll && (dot < 0 || i < dot)) { span.classList.remove('roll'); void span.offsetWidth; span.classList.add('roll'); }
        });
        el._text = text;
    }
    function clockFx(el, kind) {
        if (REDUCED_MOTION) return;
        el.classList.remove('is-wake', 'is-press', 'beat');
        void el.offsetWidth;
        el.classList.add(kind);
    }
    function incrementFx(el, ms) {
        if (REDUCED_MOTION || feelLevel() === 'minimal') return;
        const chip = document.createElement('span');
        chip.className = 'cs-inc';
        chip.textContent = `+${Math.round(ms / 1000)}`;
        el.parentElement?.appendChild(chip);
        setTimeout(() => chip.remove(), 1100);
    }
    function tickClocks() {
        if (!game || !refs.topPlayer) return;
        const values = clockValues();
        const P = feel();
        for (const [slot, color] of [['topPlayer', other(view.orientation)], ['bottomPlayer', view.orientation]]) {
            const el = refs[slot].querySelector('.cs-clock');
            if (!el) continue;
            if (!values) { el.hidden = true; continue; }
            el.hidden = false;
            const left = values[color];
            const running = values.running === color;
            const same = el.dataset.color === color && el._game === game.id;
            if (!same) { el.dataset.color = color; el._game = game.id; el._running = running; el._left = left; el._spans = null; }
            renderClockText(el, formatClock(left), same && running && !!P?.digitRoll);
            if (same && el._running !== running) {
                clockFx(el, running ? 'is-wake' : 'is-press');
                if (running) sfx('clock', { gain: controls(other(color)) ? 1 : 0.7 });
            }
            if (same && !running && left - el._left > 400 && game.tc?.inc) incrementFx(el, left - el._left);
            el._running = running;
            el.classList.toggle('is-running', running);
            el.classList.toggle('is-live', running && !!P?.clockLive);
            const low = running && left < Math.min(20000, (game.tcBase || 60000) * 0.1 + 1);
            el.classList.toggle('is-low', low);
            // последние секунды: удар сердца на каждую секунду, тихий тик на максимуме
            const sec = Math.ceil(left / 1000);
            if (low && same && el._sec !== sec && !game.over) {
                clockFx(el, 'beat');
                if (controls(color) && game.mode !== 'local' && sec <= 10 && P && (P.li === 2 || (P.li === 1 && sec <= 5))) { sfx('tick', { gain: 0.8 }); if (P.li === 2) haptic('soft'); }
            }
            el._sec = sec;
            el._left = left;
            if (low && controls(color) && !lowTimeWarned && game.mode !== 'local') { lowTimeWarned = true; Sound.play('lowtime'); haptic('warning'); }
        }
        updateFirstMoveNotice();
        if (game.mode !== 'online' && game.clock && !game.over) {
            const flagged = core.clockFlagged(game.clock, Date.now());
            if (flagged) finishGame(core.timeoutOutcome(game.chess, flagged));
        }
    }

    function startClockLoop() {
        clearInterval(clockTimer);
        clockTimer = setInterval(tickClocks, 100);
        tickClocks();
    }
    const other = c => (c === 'w' ? 'b' : 'w');

    function updateFirstMoveNotice() {
        if (game?.mode !== 'online' || game.over || !game.online.firstMoveDeadline) return;
        if (!controls(game.chess.turn())) return;
        const left = Math.max(0, Math.ceil((game.online.firstMoveDeadline - game.online.serverNow()) / 1000));
        refs.status.textContent = tr('firstMoveIn', { s: left });
        refs.status.classList.toggle('is-alert', left <= 10);
    }

    /* ---------- отрисовка панелей ---------- */
    function playerInfo(color) {
        if (game.mode === 'puzzle') {
            if (color === game.myColor) return { name: myName(), sub: String(pz.rating), avatar: me()?.photo_url || null, lang: lang() };
            return { name: `lichess #${game.puzzle?.id || ''}`, sub: game.puzzle ? String(game.puzzle.rating) : '', avatar: null, bot: true };
        }
        if (game.mode === 'local') return { name: tr(color === 'w' ? 'white' : 'black'), sub: '', avatar: null };
        if (color === game.myColor) {
            const sub = game.mode === 'online' && game.online.myRating ? String(game.online.myRating) : '';
            return { name: myName(), sub, avatar: me()?.photo_url || null, lang: lang() };
        }
        if (game.mode === 'bot') {
            const level = core.botLevel(game.level);
            return { name: tr('botName', { level: tr(`level${level.level}`) }), sub: `~${level.elo}`, avatar: null, bot: true };
        }
        const opp = game.online.opponent || {};
        return { name: nick(opp.name) || tr('opponent'), sub: opp.rating ? String(opp.rating) : '', avatar: opp.avatar || null, lang: opp.lang || null, away: !!game.online.away };
    }

    function renderPlayers() {
        if (!game) return;
        if (game.mode === 'puzzle') { renderPuzzlePlayers(); return; }
        const chess = viewChess();
        const { score, captured } = core.material(chess);
        for (const [slot, color] of [['topPlayer', other(view.orientation)], ['bottomPlayer', view.orientation]]) {
            const info = playerInfo(color);
            const safeAvatar = info.avatar && /^https:\/\//i.test(info.avatar) ? info.avatar : null;
            const avatar = safeAvatar
                ? `<img src="${esc(safeAvatar)}" alt="" referrerpolicy="no-referrer">`
                : `<span class="cs-ava-piece" style="background-image:url('${pieceUrl(color + (info.bot ? 'N' : 'K'))}')"></span>`;
            const caps = captured[color];
            let capHtml = '';
            let prev = null;
            for (const type of caps) {
                capHtml += `<i class="${prev && prev !== type ? 'cs-gap' : ''}" style="background-image:url('${pieceUrl(other(color) + type.toUpperCase())}')"></i>`;
                prev = type;
            }
            const adv = color === 'w' ? score : -score;
            if (adv > 0) capHtml += `<b>+${adv}</b>`;
            const turn = !game.over && chess.turn() === color;
            const el = refs[slot];
            // часы живут между перерисовками: их анимации и цифры не сбрасываются
            let clock = el.querySelector('.cs-clock');
            if (!clock) { clock = document.createElement('div'); clock.className = 'cs-clock'; clock.hidden = true; }
            el.innerHTML = `
                <div class="cs-ava${turn ? ' is-turn' : ''}${info.away ? ' is-away' : ''}">${avatar}</div>
                <div class="cs-pinfo">
                    <div class="cs-pname">${flagHtml(info.lang)}<span>${esc(info.name)}</span>${info.sub ? `<small>${esc(info.sub)}</small>` : ''}</div>
                    <div class="cs-captured">${capHtml}</div>
                </div>`;
            el.appendChild(clock);
        }
        tickClocks();
    }

    function figurine(move) {
        const letter = move.san[0];
        if (!PIECE_NAMES.includes(letter) || letter === 'P' || move.san.startsWith('O-O')) return esc(move.san);
        return `<i style="background-image:url('${pieceUrl(move.color + letter)}')"></i>${esc(move.san.slice(1))}`;
    }

    /** Номер хода для полухода i с учётом начальной позиции (номер и очередь из FEN). */
    function moveNumber(i) {
        const [, side = 'w', , , , full = '1'] = String(game.startFen || '').split(' ');
        return (Number(full) || 1) + Math.floor((i + (side === 'b' ? 1 : 0)) / 2);
    }
    function renderMoveList() {
        if (!game || !refs.moveList) return;
        const current = game.view == null ? game.moves.length : game.view;
        let html = '';
        game.moves.forEach((m, i) => {
            if (m.color === 'w' || i === 0) html += `<span class="cs-mn">${moveNumber(i)}.${m.color === 'b' && i === 0 ? '…' : ''}</span>`;
            // в таблице ходов первый ход чёрных стоит во второй колонке
            if (m.color === 'b' && i === 0) html += '<span class="cs-mv-gap"></span>';
            const q = reviewOn() ? game.review?.marks[i] : null;
            html += `<button type="button" class="cs-mv${i + 1 === current ? ' is-current' : ''}${q ? ` q-${q.cls}` : ''}" data-ply="${i + 1}">${figurine(m)}${q ? qBadge(q.cls) : ''}</button>`;
        });
        const list = refs.moveList;
        if (list.csHtml !== html) { list.innerHTML = html; list.csHtml = html; }
        const active = list.querySelector('.is-current');
        const behavior = REDUCED_MOTION ? 'auto' : 'smooth';
        if (screen.classList.contains('is-wide')) {
            if (active) list.scrollTo({ top: active.offsetTop - list.clientHeight / 2 + active.offsetHeight / 2, behavior });
            else if (!current) list.scrollTo({ top: 0, behavior });
        } else if (active) {
            list.scrollTo({ left: active.offsetLeft - list.clientWidth / 2 + active.offsetWidth / 2, behavior });
        }
        refs.prevBtn.disabled = refs.firstBtn.disabled = current <= 0;
        refs.nextBtn.disabled = refs.lastBtn.disabled = current >= game.moves.length;
    }

    function renderStatus() {
        if (!game) return;
        refs.title.textContent = gameTitle();
        const status = refs.status;
        status.classList.remove('is-alert');
        if (game.view != null) { status.textContent = tr('reviewing', { n: game.view }); return; }
        if (game.mode === 'puzzle') { status.textContent = puzzleStatus(); status.classList.toggle('is-alert', game.puzzle?.feedback === 'wrong' && game.puzzle.locked && !game.puzzle.done); return; }
        if (game.over) { status.textContent = game.archive ? `${resultTitle(game.over)} · ${whenText(game.archive.at)}` : resultTitle(game.over); return; }
        const turn = game.chess.turn();
        if (game.mode === 'bot' && game.botBusy) status.textContent = tr('botThinking');
        else if (game.mode === 'local') status.textContent = tr(turn === 'w' ? 'whiteToMove' : 'blackToMove');
        else status.textContent = tr(controls(turn) ? 'yourMove' : 'theirMove');
        if (game.chess.inCheck()) { status.textContent = `${tr('check')} ${status.textContent}`; status.classList.add('is-alert'); }
        updateFirstMoveNotice();
    }

    function gameTitle() {
        if (game.mode === 'puzzle') return puzzleTitle(game.puzzle);
        const tc = game.tc ? `${tr(game.tc.cat)} ${game.tc.id}` : '';
        if (game.mode === 'bot') return [tr('modeBot'), tc].filter(Boolean).join(' · ');
        if (game.mode === 'local') return [tr('modeLocal'), tc].filter(Boolean).join(' · ');
        return tc || tr('modeOnline');
    }

    function renderActions() {
        if (!game) return;
        const buttons = [];
        const add = (act, icon, label, opts = {}) => buttons.push(`<button type="button" class="cs-act${opts.danger ? ' is-danger' : ''}${opts.active ? ' is-active' : ''}${opts.primary ? ' is-primary' : ''}" data-act="${act}"${opts.disabled ? ' disabled' : ''}${opts.active != null ? ` aria-pressed="${opts.active ? 'true' : 'false'}"` : ''}>${icon}<span>${esc(label)}</span></button>`);
        if (game.mode === 'puzzle') {
            const p = game.puzzle;
            add('flip', ICON.flip, tr('flip'));
            if (p && !p.done) {
                if (p.kind !== 'streak') {
                    add('pz_hint', ICON.bulb, tr('pzHint'), { disabled: p.locked || p.hint >= 2 });
                    add('pz_solution', ICON.eye, tr('pzSolution'), { disabled: p.locked });
                }
            } else if (p) {
                if (p.kind === 'streak' && !p.solved && p.step < p.solution.length && !p.showing) add('pz_solution', ICON.eye, tr('pzSolution'));
                else if (p.failed && p.kind !== 'streak') add('pz_retry', ICON.undo, tr('pzRetry'), { disabled: p.showing });
                add('pz_next', ICON.next, p.kind === 'streak' && !puzzleRun ? tr('pzNewStreak') : p.kind === 'daily' ? tr('modePuzzles') : tr('pzNext'), { primary: true, disabled: p.showing });
            }
            refs.actions.innerHTML = buttons.join('');
            return;
        }
        if (game.archive) {
            add('history', ICON.history, tr('histShort'));
            add('flip', ICON.flip, tr('flip'));
            add('pen', ICON.pen, tr('arrows'), { active: ui.drawMode });
            add('result', ICON.trophy, tr('resultBtn'));
        } else if (game.over) {
            if (game.mode === 'online') add('rematch', ICON.rematch, tr('rematch'));
            else add('again', ICON.plus, tr('newGame'));
            add('flip', ICON.flip, tr('flip'));
            add('pen', ICON.pen, tr('arrows'), { active: ui.drawMode });
            add('result', ICON.trophy, tr('resultBtn'));
        } else if (game.mode === 'online') {
            add('flip', ICON.flip, tr('flip'));
            add('pen', ICON.pen, tr('arrows'), { active: ui.drawMode });
            add('draw', ICON.draw, tr('offerDraw'), { disabled: game.moves.length < 2 || game.online.drawSent });
            if (game.moves.length < 2) add('resign', ICON.abort, tr('abort'), { danger: true });
            else add('resign', ICON.flag, tr('resign'), { danger: true });
        } else {
            add('undo', ICON.undo, tr('takeback'), { disabled: !game.moves.length });
            add('flip', ICON.flip, tr('flip'));
            add('pen', ICON.pen, tr('arrows'), { active: ui.drawMode });
            if (game.mode === 'local') add('draw', ICON.draw, tr('offerDraw'), { disabled: game.moves.length < 2 });
            add('resign', ICON.flag, tr('resign'), { danger: true, disabled: !game.moves.length });
        }
        refs.actions.innerHTML = buttons.join('');
    }

    /* ---------- просмотр партии ---------- */
    function setView(ply) {
        if (!game) return;
        const max = game.moves.length;
        const target = Math.max(0, Math.min(max, ply));
        const prev = game.view == null ? max : game.view;
        if (target === prev) return;
        cancelMateShow();
        clearSelection(false);
        clearTalk();
        game.view = target === max ? null : target;
        clearAnnotations();
        const chess = viewChess();
        if (Math.abs(target - prev) === 1 && target > prev) {
            const m = game.moves[target - 1];
            playMoveSound(m, chess.inCheck(), animateMove(m));
        } else {
            syncPieces(positionMap(chess), { animate: true });
            Sound.play('move', 0.6);
        }
        syncPieces(positionMap(chess), { animate: true });
        refs.board.classList.toggle('is-review', game.view != null);
        haptic('select');
        renderMarks();
        renderMoveList();
        renderPlayers();
        renderStatus();
        renderCoach();
    }
    function goLive() { if (game?.view != null) setView(game.moves.length); }

    function setOrientation(color) {
        if (view.orientation === color) return;
        view.orientation = color;
        clearTalk();
        buildSquares();
        for (const [sq, el] of view.els) slide(el, sq, { effects: false });
        renderMarks();
        renderNotes();
        renderPlayers();
    }

    /* ---------- начало и конец партии ---------- */
    function newGame({ mode, myColor = 'w', level = 3, tcId = 'none', moves = [], clock = null, online = null, orientation = null, startFen = null, archive = null }) {
        if (mode !== 'puzzle') puzzleToken++;
        cancelCinema();
        cancelBot();
        clearTalk();
        closeDialog(true);
        hideBanner();
        const chess = new Chess(startFen || undefined);
        const played = [];
        for (const san of moves) {
            const m = core.tryMove(chess, san) || (() => { try { return chess.move(san); } catch (_) { return null; } })();
            if (!m) break;
            played.push(m);
        }
        const tc = core.timeControl(tcId);
        game = {
            mode, myColor: mode === 'local' ? null : myColor, level, tc, tcBase: tc?.base || 0,
            chess, startFen: startFen || new Chess().fen(),
            moves: played, view: null, over: null, premove: null, hint: null, botBusy: false,
            clock: mode !== 'online' && tc && !archive ? core.createClock(tc) : null,
            online,
            id: Date.now(),
        };
        if (archive) {
            game.archive = archive;
            game.over = { result: archive.result, reason: archive.reason || null, rated: !!archive.rated };
            if (game.over.reason === 'checkmate') game.matePills = true;
        }
        if (game.clock && clock) {
            game.clock.left.w = Number(clock.w) || tc.base;
            game.clock.left.b = Number(clock.b) || tc.base;
            if (played.length >= 2) { game.clock.running = chess.turn(); game.clock.since = Date.now(); }
        }
        lowTimeWarned = false;
        view.orientation = orientation || (mode === 'local' ? 'w' : myColor);
        ui.notes = { arrows: [], circles: [] };
        ui.drawMode = false;
        if (refs.notes) refs.notes.innerHTML = '';
        cancelMateShow();
        resetMarks();
        buildSquares();
        rebuildPieces(chess);
        preloadMorph();
        refs.board.classList.remove('is-review', 'is-over');
        if (archive) refs.board.classList.add('is-over');
        clearSelection(false);
        afterChange();
        startClockLoop();
        if (archive) return game;
        if (mode === 'bot' && chess.turn() !== game.myColor) setTimeout(botMove, 500);
        if (mode !== 'online') saveOffline();
        return game;
    }

    function openScreen() {
        if (!screen.classList.contains('visible')) {
            screen.classList.add('visible');
            playtime('begin');
        }
        applySkin();
        if (SKINS.find(item => item.id === settings.skin)?.unlock) fetchProfile();
        requestAnimationFrame(() => { layout(); renderMarks(); });
        setTimeout(layout, 380);
        refs.hintBtn.hidden = !isOwner();
        refs.hintBtn.classList.toggle('is-on', hintOn);
        if (actionOn() && !REDUCED_MOTION) setTimeout(() => Action.load().catch(() => {}), 700);
    }

    function closeScreen() {
        cancelMateShow();
        cancelCinema();
        cancelBot();
        clearTalk();
        hintToken++;
        analysisToken++;
        // Вспомогательные движки освобождают память: на iPhone WebView с
        // несколькими Stockfish могли выгрузить, и приложение открывалось заново.
        for (const kind of ['hint', 'action', 'review']) { engines[kind]?.terminate(); engines[kind] = null; }
        clearInterval(clockTimer);
        clockTimer = null;
        closeDialog(true);
        hideBanner();
        if (ui.promo) { ui.promo.el.remove(); ui.promo = null; }
        cancelDrag(false);
        screen.classList.remove('visible');
        playtime('stop');
        if (game?.mode === 'online' && game.over && !game.archive) emit('chess_leave', {});
        if (game && game.mode !== 'online' && !game.over && game.clock) {
            core.clockStop(game.clock, Date.now());
            saveOffline();
        }
        game = null;
    }

    function cancelBot() {
        botToken++;
        if (game) game.botBusy = false;
        engines.bot?.stop();
    }

    /* ---------- мат: короткий фильм на доске (вид сверху) ----------
       Как в наших роликах: камера плавно подъезжает к королю, лишний план
       уходит в тень и теряет цвет, ключевые фигуры остаются насыщенными.
       Линия атаки загорается клетка за клеткой, вокруг короля по очереди
       краснеют клетки, куда ему не уйти, король дрожит — и на удар доска
       вздрагивает, камера отъезжает, над королями всплывают пилюли:
       зелёная у победителя, красная у проигравшего. Тап — сразу к концу. */
    let mateShow = null;
    const CROWN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 8.2 7.6 12l4.4-6.6 4.4 6.6 4.1-3.8-1.6 9.3H5.1z" fill="currentColor"/><rect x="5.2" y="18.6" width="13.6" height="2.2" rx="1.1" fill="currentColor"/></svg>';
    const MATE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.6 3.5 7.8 20.5M16.2 3.5l-1.8 17M4.5 9h16M3.5 15h16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';

    function cancelMateShow() {
        if (!mateShow) return;
        const show = mateShow;
        mateShow = null;
        show.cancel();
    }
    /** Пилюли над королями после мата: живут, пока на доске итоговая позиция. */
    function renderPills() {
        const layer = refs.pills;
        if (!layer) return;
        const on = !!(game?.over?.reason === 'checkmate' && game.view == null && game.matePills);
        const key = on ? `${view.orientation}|${game.id}` : '';
        if (layer.dataset.key === key) return;
        layer.dataset.key = key;
        layer.innerHTML = '';
        if (!on) return;
        const loser = game.chess.turn();
        const animate = game.matePills === 'anim';
        game.matePills = true;
        const add = (color, good, delay) => {
            const sq = findKing(game.chess, color);
            if (!sq) return;
            const at = document.createElement('div');
            at.className = 'cs-pill-at';
            at.style.transform = sqTf(sq);
            at.innerHTML = `<div class="cs-pill ${good ? 'is-win' : 'is-lose'}${animate ? ' is-new' : ''}" style="--d:${delay}ms"><i>${good ? CROWN_SVG : MATE_SVG}</i><span>${esc(tr(good ? 'pillWin' : 'pillMate'))}</span></div>`;
            layer.appendChild(at);
            if (animate) setTimeout(() => sfx('pill', { arg: good }), delay + 60);
        };
        add(loser, false, 0);
        add(other(loser), true, animate ? 260 : 0);
    }

    function matePlan(move) {
        const chess = game.chess;
        const loser = chess.turn();
        const king = findKing(chess, loser);
        if (!king) return null;
        let checkers = [];
        try { checkers = chess.attackers(king, other(loser)); } catch (_) { checkers = []; }
        const [kx, ky] = sqXY(king);
        // линии шаха: от каждой атакующей фигуры к королю (у коня и пешки линии нет — волна идёт сразу в короля)
        const lanes = checkers.map(sq => {
            const [x, y] = sqXY(sq);
            const p = chess.get(sq);
            const line = [];
            if (p && p.type !== 'n' && p.type !== 'p') {
                const dx = Math.sign(kx - x), dy = Math.sign(ky - y);
                for (let cx = x + dx, cy = y + dy; cx !== kx || cy !== ky; cx += dx, cy += dy) line.push(xySq(cx, cy));
            }
            return { from: sq, line };
        });
        // главная линия — от фигуры, которая только что пошла (если шах дала она)
        lanes.sort((a, b) => (b.from === move?.to) - (a.from === move?.to));
        // клетки вокруг короля, куда ему не уйти — по кругу
        const cage = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const x = kx + dx, y = ky + dy;
            if (x < 0 || x > 7 || y < 0 || y > 7) continue;
            const sq = xySq(x, y);
            const p = chess.get(sq);
            if (p && p.color === loser) continue;
            cage.push(sq);
        }
        // клетки линии шаха уже горят — второй раз их не красим
        const onLine = new Set(lanes.flatMap(l => l.line));
        for (let i = cage.length - 1; i >= 0; i--) if (onLine.has(cage[i])) cage.splice(i, 1);
        // волна идёт от клетки удара: ближние к ней клетки краснеют раньше
        const origin = sqXY(move?.to || checkers[0] || king);
        const dist = sq => { const [x, y] = sqXY(sq); return Math.hypot(x - origin[0], y - origin[1]); };
        cage.sort((a, b) => dist(a) - dist(b));
        const keys = new Set([king, ...checkers, move?.to].filter(Boolean));
        return { loser, king, checkers, lanes, cage, keys, dist };
    }

    /** Камера: точка f (в долях доски) — в центр, с зумом z, не показывая края за доской. */
    function camAt(f, z) {
        const tx = Math.min(0, Math.max(1 - z, 0.5 - z * f[0]));
        const ty = Math.min(0, Math.max(1 - z, 0.5 - z * f[1]));
        return `translate(${(tx * 100).toFixed(3)}%, ${(ty * 100).toFixed(3)}%) scale(${z.toFixed(4)})`;
    }

    /** Можно ли разыграть матующий ход заново в сцене (рокировку и превращение оставляем обычными). */
    const mateReplayOk = move => !!move && !move.flags.includes('k') && !move.flags.includes('q') && game.mode !== 'puzzle'
        && feelLevel() !== 'minimal' && !REDUCED_MOTION && !document.hidden && !!refs.fx;
    /** Матующий ход в логике уже сделан, а на доске фигура пока стоит на исходной клетке: дальше её ведёт сцена. */
    function stageMateMove(move) {
        const els = view.els;
        const el = els.get(move.from);
        if (!el) return null;
        const capSq = move.flags.includes('e') ? move.to[0] + move.from[1] : (move.captured ? move.to : null);
        const victim = capSq ? els.get(capSq) : null;
        if (victim && victim !== el) els.delete(capSq);
        els.delete(move.from);
        els.set(move.to, el);
        el.getAnimations?.().forEach(a => a.cancel());
        el.firstChild.getAnimations?.().forEach(a => a.cancel());
        el.classList.remove('selected', 'dragging', 'moving');
        el.firstChild.style.transform = '';
        el.style.transform = sqTf(move.from);
        if (move.promotion) el.dataset.code = move.color + move.promotion.toUpperCase();
        return { move, el, victim: victim && victim !== el ? victim : null };
    }

    /** Фильм мата. replay — матующая фигура ещё на своей клетке и пролетит ход в сцене. */
    function playMateShow({ replay = null, move = null } = {}) {
        cancelMateShow();
        const plan = matePlan(move || replay?.move);
        const P = Feel?.profile(settings.feelStyle, feelLevel(), 1);
        if (!plan || !P || !refs.fx) { if (game) { game.matePills = 'anim'; renderPills(); } return Promise.resolve(); }
        const full = P.li >= 1 && !REDUCED_MOTION;
        const rich = P.li === 2;
        const T = rich ? 1.1 : 1;
        const t = ms => Math.round(ms * T);
        const gid = game.id;
        const timers = [], nodes = [], anims = [];
        let finished = false;
        let landed = !replay;
        let resolveShow;
        const done = new Promise(resolve => { resolveShow = resolve; });
        const at = (ms, fn) => timers.push(setTimeout(() => { if (!finished && game?.id === gid) fn(); }, ms));
        const node = (cls, sq, parent = refs.fx) => {
            const el = document.createElement('div');
            el.className = cls;
            if (sq) el.style.transform = sqTf(sq);
            parent.appendChild(el);
            nodes.push(el);
            return el;
        };
        const play = (el, frames, opts) => { if (!el?.animate) return null; const a = el.animate(frames, opts); anims.push(a); return a; };
        const cam = refs.cam;
        cam.getAnimations().forEach(a => a.cancel());
        const pieces = [...view.els.entries()];
        const mv = replay?.move || move;
        const atkSq = mv?.to;
        const kingEl = view.els.get(plan.king);
        const atkEl = replay?.el || (atkSq ? view.els.get(atkSq) : null);

        // кадр: откуда и куда шла фигура, король и клетка вокруг него
        const pts = [plan.king, ...plan.checkers, ...plan.cage, ...(replay ? [mv.from, mv.to] : [])].map(sqXY);
        const minX = Math.min(...pts.map(p => p[0])), maxX = Math.max(...pts.map(p => p[0]));
        const minY = Math.min(...pts.map(p => p[1])), maxY = Math.max(...pts.map(p => p[1]));
        const span = Math.max(maxX - minX, maxY - minY) + 1;
        const zoom = Math.max(1.18, Math.min(rich ? 1.9 : 1.75, 8 / (span + 1.6)));
        const focus = [((minX + maxX) / 2 + 0.5) / 8, ((minY + maxY) / 2 + 0.5) / 8];
        const shot = camAt(focus, zoom);

        const finish = () => {
            if (finished) return;
            finished = true;
            timers.forEach(clearTimeout);
            if (game?.id === gid) { game.matePills = game.matePills === true ? true : 'anim'; renderPills(); }
            resolveShow();
        };
        const cleanup = () => {
            anims.forEach(a => { try { a.cancel(); } catch (_) {} });
            cam.style.transform = '';
            cam.classList.remove('is-mate');
            refs.board.classList.remove('is-mate-show');
            refs.squares.classList.remove('is-drained');
            for (const [, el] of pieces) el.classList.remove('is-dim', 'is-key', 'is-hero', 'is-doomed');
            if (replay && !landed) {
                replay.victim?.remove();
                replay.el.style.transform = sqTf(mv.to);
                setPieceCode(replay.el, replay.el.dataset.code);
            }
            if (atkEl) atkEl.style.zIndex = '';
            nodes.forEach(el => el.remove());
            refs.board.removeEventListener('pointerdown', skip, true);
        };
        // тап по доске — сразу к итогу
        const skip = event => { event.stopPropagation(); event.preventDefault(); if (mateShow === show) { mateShow = null; cleanup(); finish(); } };
        const show = { cancel() { cleanup(); finish(); } };
        mateShow = show;
        refs.board.addEventListener('pointerdown', skip, true);
        refs.board.classList.add('is-mate-show');

        // 1. мгновенно после хода: доска гаснет, цвет уходит, камера едет к королю
        let landAt = 0;
        if (full) {
            cam.classList.add('is-mate');
            refs.squares.classList.add('is-drained');
            const dim = node('cs-mate-dim');
            play(dim, [{ opacity: 0 }, { opacity: 1 }], { duration: t(320), easing: 'ease-out', fill: 'forwards' });
            for (const [sq, el] of pieces) {
                if (el === atkEl) el.classList.add('is-key', 'is-hero');
                else if (sq === plan.king) el.classList.add('is-key', 'is-doomed');
                else if (plan.keys.has(sq)) el.classList.add('is-key');
                else el.classList.add('is-dim');
            }
            play(cam, [{ transform: 'none' }, { transform: shot }], { duration: t(950), easing: 'cubic-bezier(.45,.05,.25,1)', fill: 'forwards' });
        }
        // 2. сцена: матующая фигура поднимается со своей клетки и летит, оставляя шлейф, под ней крутится неоновый ромб
        if (replay && full && atkEl) {
            const from = sqXY(mv.from), to = sqXY(mv.to);
            const lift = t(200), fly = t(Math.min(720, 420 + 70 * Math.hypot(to[0] - from[0], to[1] - from[1])));
            landAt = lift + fly;
            const face = atkEl.firstChild;
            const n = 24, path = [], lean = (to[0] >= from[0] ? 1 : -1) * (atkEl.dataset.code[1] === 'N' ? 12 : 6);
            const eio = u => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
            for (let i = 0; i <= n; i++) {
                const u = i / n, e = eio(u);
                path.push({ offset: u, transform: tf(from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e) });
            }
            atkEl.style.zIndex = 12;
            play(atkEl, path, { duration: fly, delay: lift, easing: 'linear', fill: 'both' });
            play(face, [
                { transform: 'none' },
                { transform: 'translateY(-13%) scale(1.3)', offset: lift / (lift + fly) },
                { transform: `translateY(-13%) rotate(${lean}deg) scale(1.42)`, offset: (lift + fly * 0.5) / (lift + fly) },
                { transform: 'translateY(-6%) scale(1.3)', offset: (lift + fly * 0.92) / (lift + fly) },
                { transform: 'scale(1.16, 0.84)' },
            ], { duration: lift + fly, easing: 'linear', fill: 'forwards' });
            // шлейф: три полупрозрачных отражения той же фигуры чуть позади
            for (let i = 1; i <= 3; i++) {
                const ghost = node('cs-mate-ghost', mv.from, refs.pieces);
                ghost.style.setProperty('--img', atkEl.firstChild.style.getPropertyValue('--img'));
                ghost.style.opacity = '0';
                play(ghost, path.map(f => ({ offset: f.offset, transform: `${f.transform} translateY(-13%) scale(1.3)`, opacity: f.offset > 0.04 && f.offset < 0.96 ? 0.34 - i * 0.09 : 0 })), { duration: fly, delay: lift + i * t(34), easing: 'linear', fill: 'both' });
            }
            // неоновый ромб под фигурой
            const diamond = node('cs-mate-diamond', mv.from);
            play(diamond, path.map(f => {
                const u = f.offset;
                return { offset: u, opacity: u < 0.12 ? u / 0.12 : u > 0.9 ? (1 - u) / 0.1 * 0.9 : 1, transform: `${f.transform} rotate(${45 + 225 * (1 - Math.pow(1 - u, 3))}deg) scale(${(0.7 + 0.45 * Math.min(1, u * 2)).toFixed(3)})` };
            }), { duration: fly, delay: lift, easing: 'linear', fill: 'both' });
            at(lift, () => sfx('pick'));
        } else if (replay && atkEl) {
            landAt = slide(atkEl, mv.to, {});
        }

        // 3. удар посадки: вспышка клетки, ударная волна, звук хода и вибрация
        const land = () => {
            if (replay) {
                landed = true;
                replay.el.style.transform = sqTf(mv.to);
                replay.victim && removePiece(replay.victim, true, 0);
                playMoveSound(mv, false, 0);
                haptic(mv.captured ? 'heavy' : 'medium');
                if (mv.promotion && atkEl) morphPiece(atkEl, mv.color + 'P', atkEl.dataset.code);
            }
            if (!full) return;
            if (atkEl) play(atkEl.firstChild, [{ transform: 'scale(1.16, 0.84)' }, { transform: 'scale(0.96, 1.06)', offset: 0.45 }, { transform: 'none' }], { duration: t(320), easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' });
            node('cs-mate-sq is-impact', mv?.to || plan.checkers[0]);
            const ring = node('cs-mate-shock is-green', mv?.to || plan.checkers[0]);
            ring.style.setProperty('--t', `${t(620)}ms`);
            play(cam, [{ transform: shot }, { transform: camAt(focus, zoom * 1.03) }, { transform: shot }], { duration: 240, easing: 'ease-out', fill: 'forwards' });
        };
        at(landAt, land);

        // 4. от клетки удара красные клетки бегут волной по линии мата к королю
        const step = full ? t(75) : 25;
        const lane0 = landAt + (full ? t(90) : 0);
        let laneEnd = lane0;
        plan.lanes.forEach((lane, li) => {
            const start = lane0 + li * t(140);
            const from = node('cs-mate-sq is-from', lane.from);
            from.style.setProperty('--d', `${start}ms`);
            lane.line.forEach((sq, i) => {
                const el = node('cs-mate-sq is-lane', sq);
                const d = start + (i + 1) * step;
                el.style.setProperty('--d', `${d}ms`);
                laneEnd = Math.max(laneEnd, d);
            });
            laneEnd = Math.max(laneEnd, start + (lane.line.length + 1) * step);
        });
        // король загорается красным в конце линии
        const kingGlow = node('cs-mate-sq is-king', plan.king);
        kingGlow.style.setProperty('--d', `${laneEnd}ms`);
        // 5. клетки вокруг короля краснеют по одной, король дрожит всё сильнее
        const cage0 = laneEnd + (full ? t(160) : 30);
        const cageStep = full ? t(105) : 25;
        plan.cage.forEach((sq, i) => {
            const el = node('cs-mate-sq is-cage', sq);
            el.style.setProperty('--d', `${cage0 + i * cageStep}ms`);
        });
        const hit = cage0 + plan.cage.length * cageStep + (full ? t(260) : 60);
        // по всем красным клеткам снова и снова бегут волны света — от клетки удара наружу
        const period = t(1000);
        for (const el of refs.fx.querySelectorAll('.cs-mate-sq.is-lane, .cs-mate-sq.is-cage')) {
            const [x, y] = pieceXY(el);
            const sq = xySq(Math.round(x), Math.round(y));
            el.style.setProperty('--w', `${period}ms`);
            el.style.setProperty('--wd', `${Math.round(Math.max(laneEnd, cage0) + plan.dist(sq) * t(85))}ms`);
        }
        if (kingEl?.firstChild.animate && !REDUCED_MOTION) {
            const frames = [];
            const len = Math.max(240, hit - laneEnd), n = Math.round(len / 30);
            for (let i = 0; i <= n; i++) {
                const u = i / n, a = (0.3 + 1.7 * u * u) * (full ? 1 : 0.5);
                frames.push({ offset: u, transform: i === n ? 'none' : `translate(${(a * 2.6 * Math.sin(i * 2.7)).toFixed(2)}%, ${(a * 0.9 * Math.sin(i * 3.9 + 1)).toFixed(2)}%) rotate(${(a * 1.8 * Math.sin(i * 2.2 + 0.4)).toFixed(2)}deg)` });
            }
            play(kingEl.firstChild, frames, { duration: len, delay: laneEnd, easing: 'linear' });
        }
        // 6. мат: удар, красная волна от короля, король оседает
        at(hit, () => {
            sfx('mate');
            haptic('heavy');
            setTimeout(() => haptic('rigid'), 120);
            const shock = node('cs-mate-shock', plan.king);
            shock.style.setProperty('--t', `${t(760)}ms`);
            if (kingEl?.firstChild.animate) play(kingEl.firstChild, [
                { transform: 'none' }, { transform: 'scale(1.1, 0.84)', offset: 0.16 }, { transform: 'rotate(-8deg) scale(0.97)', offset: 0.5 }, { transform: 'rotate(-5deg) scale(0.98)' },
            ], { duration: t(560), easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' });
            if (full) {
                const flash = node('cs-mate-flash');
                const [kx, ky] = sqXY(plan.king);
                flash.style.setProperty('--x', `${((kx + 0.5) * 12.5).toFixed(2)}%`);
                flash.style.setProperty('--y', `${((ky + 0.5) * 12.5).toFixed(2)}%`);
                play(cam, [{ transform: shot }, { transform: camAt(focus, zoom * 1.045) }, { transform: shot }], { duration: 300, easing: 'ease-out', fill: 'forwards' });
            }
        });
        // 7. камера отъезжает к целой доске, свет возвращается, над королями — пилюли
        const back = hit + (full ? t(480) : 160);
        at(back, () => {
            if (full) {
                play(cam, [{ transform: shot }, { transform: 'none' }], { duration: t(900), easing: 'cubic-bezier(.5,0,.25,1)', fill: 'forwards' });
                for (const el of refs.fx.querySelectorAll('.cs-mate-dim')) play(el, [{ opacity: 1 }, { opacity: 0 }], { duration: t(900), fill: 'forwards' });
                refs.squares.classList.remove('is-drained');
                for (const [, el] of pieces) el.classList.remove('is-dim');
            }
            for (const el of refs.fx.querySelectorAll('.cs-mate-sq.is-lane, .cs-mate-sq.is-from, .cs-mate-sq.is-impact')) el.classList.add('is-out');
        });
        const pillsAt = back + (full ? t(560) : 80);
        at(pillsAt, () => { game.matePills = 'anim'; renderPills(); });
        at(pillsAt + t(800), () => { for (const el of refs.fx.querySelectorAll('.cs-mate-sq')) el.classList.add('is-out'); });
        at(pillsAt + t(650), () => {
            if (mateShow === show) mateShow = null;
            refs.board.removeEventListener('pointerdown', skip, true);
            finish();
            setTimeout(() => {
                if (mateShow) return;
                anims.forEach(a => { try { a.cancel(); } catch (_) {} });
                cam.style.transform = '';
                cam.classList.remove('is-mate');
                refs.board.classList.remove('is-mate-show');
                for (const [, el] of pieces) el.classList.remove('is-key', 'is-hero', 'is-doomed');
                if (atkEl) atkEl.style.zIndex = '';
                nodes.forEach(el => el.remove());
            }, t(700));
        });
        return done;
    }


    function finishGame(outcome, { rated = false } = {}) {
        if (!game || game.over) return;
        cancelBot();
        if (game.clock) core.clockStop(game.clock, Date.now());
        game.over = { ...outcome, rated };
        game.premove = null;
        clearSelection(false);
        refs.board.classList.add('is-over');
        if (game.mode !== 'online') localStorage.removeItem(SAVE_KEY);
        recordStats(outcome);
        archiveFinished(outcome);
        const result = myResult(outcome);
        const fanfare = () => {
            if (result === 'win' || result === 'white' || result === 'black') { Sound.play('win'); haptic('success'); celebrate(); }
            else if (result === 'loss') { Sound.play('lose'); haptic('error'); }
            else { Sound.play('draw'); haptic('warning'); }
        };
        const id = game.id;
        const stillOver = () => game?.id === id && game.over?.reason === outcome.reason;
        afterChange();
        tickClocks();
        if (outcome.reason === 'checkmate' && game.mateShow) {
            // мат: фильм на доске уже идёт с момента хода — итог после него
            game.mateShow.then(() => {
                if (!stillOver()) return;
                fanfare();
                setTimeout(() => { if (stillOver()) showResult(); }, Math.max(650, Math.min(5500, talkHold() + 150)));
            });
            return;
        }
        if (outcome.reason === 'checkmate') game.matePills = true;
        setTimeout(() => afterCinema(fanfare), 180);
        setTimeout(() => afterCinema(() => { if (stillOver()) { renderPills(); showResult(); } }, 350), Math.max(outcome.reason === 'checkmate' ? 900 : 450, Math.min(5500, talkHold() + 150)));
    }

    /** 'win' | 'loss' | 'draw' | 'aborted' | 'white' | 'black' (вдвоём). */
    function myResult(outcome) {
        if (outcome.result === 'aborted') return 'aborted';
        if (outcome.result === 'draw') return 'draw';
        if (game.mode === 'local') return outcome.result;
        return (outcome.result === 'white') === (game.myColor === 'w') ? 'win' : 'loss';
    }
    function resultTitle(outcome) {
        const r = myResult(outcome);
        if (r === 'win') return tr('win');
        if (r === 'loss') return tr('loss');
        if (r === 'draw') return tr('drawResult');
        if (r === 'aborted') return tr('aborted');
        return tr(r === 'white' ? 'whiteWins' : 'blackWins');
    }
    function reasonText(outcome) {
        const r = outcome.reason;
        if (r === 'resign') {
            if (game.mode === 'local') return tr('r_resignSide', { side: tr(outcome.result === 'white' ? 'black' : 'white') });
            return myResult(outcome) === 'win' ? tr('r_resign') : tr('r_resignSelf');
        }
        if (r === 'abandon') return myResult(outcome) === 'win' || outcome.result === 'draw' ? tr('r_abandon') : tr('r_abandonSelf');
        const key = `r_${r}`;
        return I18N.T[key] ? tr(key) : '';
    }

    function celebrate() {
        if (typeof confetti !== 'function') return;
        try { confetti({ particleCount: 140, spread: 75, origin: { y: 0.6 }, zIndex: 2147483647 }); } catch (_) {}
    }

    function recordStats(outcome) {
        if (game.mode === 'online' || outcome.result === 'aborted') return;
        const stats = Object.assign({ botGames: 0, botWins: 0, botDraws: 0, bestLevel: 0, localGames: 0 }, readJson(STATS_KEY, {}));
        if (game.mode === 'local') stats.localGames++;
        else {
            stats.botGames++;
            const r = myResult(outcome);
            if (r === 'win') { stats.botWins++; stats.bestLevel = Math.max(stats.bestLevel, game.level); }
            if (r === 'draw') stats.botDraws++;
        }
        writeJson(STATS_KEY, stats);
    }

    /* ---------- сохранение партии с ботом / вдвоём ---------- */
    function saveOffline() {
        if (!game || game.mode === 'online' || game.mode === 'puzzle' || game.over || game.archive) return;
        if (!game.moves.length) { localStorage.removeItem(SAVE_KEY); return; }
        const clock = game.clock ? { w: core.clockLeft(game.clock, 'w', Date.now()), b: core.clockLeft(game.clock, 'b', Date.now()) } : null;
        writeJson(SAVE_KEY, {
            v: 1, mode: game.mode, myColor: game.myColor, level: game.level, tc: game.tc?.id || 'none',
            moves: game.moves.map(m => m.san), clock, orientation: view.orientation, savedAt: Date.now(),
        });
    }
    function savedGame() {
        const saved = readJson(SAVE_KEY, null);
        if (!saved || saved.v !== 1 || !Array.isArray(saved.moves) || !saved.moves.length) return null;
        if (saved.mode !== 'bot' && saved.mode !== 'local') return null;
        return saved;
    }
    function resumeSaved() {
        const saved = savedGame();
        if (!saved) return;
        closeSheet();
        openScreen();
        newGame({ mode: saved.mode, myColor: saved.myColor || 'w', level: saved.level || 3, tcId: saved.tc, moves: saved.moves, clock: saved.clock, orientation: saved.orientation });
        Sound.play('start', 0.7);
    }

    /* ---------- онлайн ---------- */
    function emit(event, payload) {
        if (typeof socket === 'undefined' || !socket) return false;
        if (!socket.connected) { toast(tr('e_network'), 'error'); }
        socket.emit(event, payload);
        return true;
    }

    function onlineStateToGame(state, { resumed = false } = {}) {
        const color = state.color === 'black' ? 'b' : 'w';
        const offset = Number(state.serverTime) - Date.now();
        const opponent = state.opponent || (color === 'w' ? state.players?.black : state.players?.white) || {};
        const mine = color === 'w' ? state.players?.white : state.players?.black;
        const online = {
            roomCode: state.roomCode,
            opponent,
            myRating: mine?.rating || null,
            clock: state.clock, clockAt: performance.now(),
            serverNow: () => Date.now() + offset,
            firstMoveDeadline: state.firstMoveDeadline || null,
            drawSent: false, pending: false, away: null,
        };
        const keepOrientation = game?.mode === 'online' && game.online?.roomCode === state.roomCode ? view.orientation : null;
        openScreen();
        newGame({ mode: 'online', myColor: color, tcId: state.tc, moves: (state.moves || []).map(m => m.san), online, orientation: keepOrientation });
        if (state.drawOffer && state.drawOffer !== (color === 'w' ? 'white' : 'black')) showDrawOffer();
        if (!resumed) { Sound.play('start'); haptic('success'); }
    }

    function bindSocket() {
        if (typeof socket === 'undefined' || !socket || socket.__chessBound) return;
        socket.__chessBound = true;
        const forMe = data => game?.mode === 'online' && data && data.roomCode === game.online.roomCode;

        // переподключились (или сервер перезапустился) — просим свою партию по коду
        socket.on('connect', () => {
            if (game?.mode === 'online' && !game.over) socket.emit('chess_rejoin', { roomCode: game.online.roomCode });
        });
        // партии на сервере больше нет: не «замираем» с идущими часами, а честно заканчиваем
        socket.on('chess_gone', data => {
            if (!forMe(data) || game.over) return;
            hideBanner();
            finishGame({ result: 'aborted', reason: 'serverLost' });
        });
        socket.on('chess_rooms', data => { renderRooms(Array.isArray(data?.rooms) ? data.rooms : []); renderOnline(data?.online); });
        socket.on('chess_created', data => showWait(data));
        socket.on('chess_error', data => {
            const key = `e_${data?.code}`;
            if (data?.code === 'drawUnavailable') toast(tr('drawUnavailable'), 'error');
            else toast(I18N.T[key] ? tr(key) : tr('e_network'), 'error');
            if (data?.code !== 'drawUnavailable' && data?.code !== 'alreadyPlaying') hideWait();
        });
        socket.on('chess_start', data => { window.__chessElsewhere = null; handleStart(data); });
        socket.on('chess_state', data => {
            if (!forMe(data)) return;
            const sameMoves = data.moves.length === game.moves.length && data.moves.every((m, i) => m.san === game.moves[i].san);
            game.online.clock = data.clock;
            game.online.clockAt = performance.now();
            game.online.pending = false;
            if (!sameMoves) {
                const chess = new Chess();
                const played = [];
                for (const m of data.moves) { const mv = core.tryMove(chess, m); if (!mv) break; played.push(mv); }
                game.chess = chess;
                game.moves = played;
                game.view = null;
                clearSelection(false);
                syncPieces(positionMap(chess), { animate: true });
                afterChange();
            }
            tickClocks();
        });
        socket.on('chess_moved', data => {
            if (!forMe(data)) return;
            game.online.clock = data.clock;
            game.online.clockAt = performance.now();
            game.online.firstMoveDeadline = data.firstMoveDeadline || null;
            if (data.ply <= game.moves.length) {
                game.online.pending = false;
                const mine = game.moves[data.ply - 1];
                if (!mine || mine.san !== data.san) emit('chess_sync', { roomCode: game.online.roomCode });
                tickClocks();
                renderStatus();
                return;
            }
            if (data.ply !== game.moves.length + 1) { emit('chess_sync', { roomCode: game.online.roomCode }); return; }
            const move = playMove({ from: data.from, to: data.to, promotion: data.promotion || undefined });
            if (!move) { emit('chess_sync', { roomCode: game.online.roomCode }); return; }
            runPremove();
        });
        socket.on('chess_over', data => {
            if (!forMe(data)) return;
            game.online.clock = data.clock;
            game.online.clockAt = performance.now();
            hideBanner();
            finishGame({ result: data.result, reason: data.reason }, { rated: !!data.rated });
        });
        socket.on('chess_rating', data => {
            if (!forMe(data) && data?.roomCode !== game?.online?.roomCode) return;
            const mine = game.myColor === 'w' ? data.white : data.black;
            const theirs = game.myColor === 'w' ? data.black : data.white;
            if (mine) { game.online.myRating = mine.rating; game.online.ratingChange = mine; }
            if (theirs && game.online.opponent) game.online.opponent.rating = theirs.rating;
            renderPlayers();
            updateResultRating();
            ratingCache = null;
        });
        socket.on('chess_draw_offered', data => { if (forMe(data)) showDrawOffer(); });
        socket.on('chess_draw_sent', data => { if (forMe(data)) { game.online.drawSent = true; renderActions(); toast(tr('drawSent')); } });
        socket.on('chess_draw_declined', data => {
            if (!forMe(data)) return;
            game.online.drawSent = false;
            renderActions();
            toast(tr('drawDeclined'), 'error');
        });
        socket.on('chess_opponent_away', data => {
            if (!forMe(data)) return;
            const offset = Number(data.serverTime) - Date.now();
            game.online.away = Number(data.deadline) - offset;
            renderPlayers();
            showAwayBanner();
        });
        socket.on('chess_opponent_back', data => {
            if (!forMe(data)) return;
            game.online.away = null;
            hideBanner();
            renderPlayers();
            toast(tr('opponentBack'));
        });
        socket.on('chess_moved_elsewhere', data => {
            if (!forMe(data)) return;
            window.__chessElsewhere = { roomCode: data.roomCode, tc: game.tc?.id, opponent: game.online.opponent, at: Date.now() };
            closeScreen();
            toast(tr('movedElsewhere'));
            openSheet('online');
        });
        socket.on('chess_elsewhere', data => {
            window.__chessElsewhere = data && data.roomCode ? { ...data, at: Date.now() } : null;
            if (sheetEl?.classList.contains('visible')) refreshSheetTexts();
        });
        socket.on('chess_rematch_waiting', data => { if (forMe(data)) setResultNote(tr('rematchWaiting')); });
        socket.on('chess_rematch_offer', data => {
            if (!forMe(data)) return;
            Sound.play('notify');
            haptic('warning');
            if (ui.dialog?.kind === 'result') setResultNote(tr('rematchOffered', { name: data.name || tr('opponent') }), true);
            else showBanner(tr('rematchOffered', { name: data.name || tr('opponent') }), [
                { label: tr('decline'), act: () => emit('chess_rematch_decline', { roomCode: game.online.roomCode }) },
                { label: tr('accept'), primary: true, act: () => emit('chess_rematch', { roomCode: game.online.roomCode }) },
            ]);
        });
        socket.on('chess_rematch_declined', data => {
            if (!forMe(data)) return;
            hideBanner();
            setResultNote(tr('rematchDeclined'));
            toast(tr('rematchDeclined'), 'error');
        });
    }

    function handleStart(data) {
        hideWait();
        closeSheet();
        onlineStateToGame(data, { resumed: !!data.resumed });
    }

    function showDrawOffer() {
        Sound.play('notify');
        haptic('warning');
        const name = nick(game.online.opponent?.name) || tr('opponent');
        showBanner(tr('drawOffered', { name }), [
            { label: tr('decline'), act: () => emit('chess_draw_answer', { roomCode: game.online.roomCode, accept: false }) },
            { label: tr('accept'), primary: true, act: () => emit('chess_draw_answer', { roomCode: game.online.roomCode, accept: true }) },
        ]);
    }

    let awayTimer = null;
    function showAwayBanner() {
        clearInterval(awayTimer);
        const update = () => {
            if (!game?.online?.away || game.over) { clearInterval(awayTimer); return; }
            const s = Math.max(0, Math.ceil((game.online.away - Date.now()) / 1000));
            showBanner(tr('opponentAway', { s }), [], { keep: true });
        };
        update();
        awayTimer = setInterval(update, 1000);
    }

    /* ---------- плашка поверх доски ---------- */
    function showBanner(text, buttons = [], { keep = false } = {}) {
        const banner = refs.banner;
        if (!keep || !banner.classList.contains('show') || banner.dataset.kind !== 'info') {
            banner.innerHTML = `<p></p>${buttons.map((b, i) => `<button type="button" data-banner="${i}" class="${b.primary ? 'is-primary' : ''}">${esc(b.label)}</button>`).join('')}`;
            banner.querySelectorAll('[data-banner]').forEach(btn => {
                btn.onclick = () => { const b = buttons[Number(btn.dataset.banner)]; hideBanner(); b?.act?.(); };
            });
        }
        banner.dataset.kind = buttons.length ? 'action' : 'info';
        banner.querySelector('p').textContent = text;
        banner.classList.add('show');
        ui.banner = true;
    }
    function hideBanner() {
        clearInterval(awayTimer);
        refs.banner?.classList.remove('show');
        ui.banner = null;
    }

    /* ---------- шторки внутри экрана: подтверждение, итог, настройки ---------- */
    function openDialog(kind, html, { dismissable = true } = {}) {
        ui.dialog = { kind, dismissable };
        // Шапка с крестиком не прокручивается; содержимое листается внутри.
        refs.sheet.innerHTML = `<div class="cs-sheet-head${dismissable ? ' has-close' : ''}">${dismissable ? `<button class="ui-close cs-sheet-close" type="button" data-dlg="x" aria-label="${esc(tr('cancel'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button>` : ''}</div><div class="cs-sheet-body">${html}</div>`;
        refs.sheet.querySelector('[data-dlg="x"]')?.addEventListener('click', () => closeDialog());
        const head = refs.sheet.querySelector('.cs-sheet-head'), body = refs.sheet.querySelector('.cs-sheet-body');
        body.addEventListener('scroll', () => head.classList.toggle('is-scrolled', body.scrollTop > 2), { passive: true });
        refs.scrim.classList.add('show');
        requestAnimationFrame(() => refs.sheet.classList.add('show'));
    }
    function closeDialog(instant = false) {
        if (!refs.sheet) return;
        if (ui.talkHello) { ui.talkHello = false; setTimeout(sayHello, 420); }
        ui.dialog = null;
        refs.sheet.classList.remove('show');
        refs.scrim.classList.remove('show');
        if (instant) refs.sheet.innerHTML = '';
    }

    function confirmDialog({ title, text, okLabel, okDanger = true, onOk }) {
        openDialog('confirm', `
            <h2>${esc(title)}</h2><p>${esc(text)}</p>
            <div class="cs-sheet-actions">
                <button type="button" class="cs-btn is-primary${okDanger ? ' is-danger' : ''}" data-dlg="ok">${esc(okLabel)}</button>
                <button type="button" class="cs-btn" data-dlg="cancel">${esc(tr('stay'))}</button>
            </div>`);
        refs.sheet.querySelector('[data-dlg="ok"]').onclick = () => { closeDialog(); onOk(); };
        refs.sheet.querySelector('[data-dlg="cancel"]').onclick = () => closeDialog();
    }

    function showResult() {
        if (!game?.over) return;
        const outcome = game.over;
        const r = myResult(outcome);
        const icon = r === 'win' ? ICON.trophy : r === 'loss' ? ICON.broken : r === 'aborted' ? ICON.abort : r === 'draw' ? ICON.handshake : ICON.trophy;
        const iconClass = r === 'win' || r === 'white' || r === 'black' ? 'win' : r === 'loss' ? 'loss' : 'draw';
        const primary = game.archive
            ? `<button type="button" class="cs-btn is-primary" data-dlg="history">${esc(tr('history'))}</button>`
            : game.mode === 'online'
            ? `<button type="button" class="cs-btn is-primary" data-dlg="rematch">${esc(tr('rematch'))}</button>`
            : `<button type="button" class="cs-btn is-primary" data-dlg="again">${esc(tr(game.mode === 'bot' ? 'playAgain' : 'newGame'))}</button>`;
        openDialog('result', `
            <div class="cs-result-icon ${iconClass}">${icon}</div>
            <h2>${esc(resultTitle(outcome))}</h2>
            <p data-ref="resultReason">${esc(reasonText(outcome))}</p>
            ${reviewOn() ? `<div class="cs-report" data-ref="report">${reportHtml()}</div>` : ''}
            <div class="cs-rating-chip" data-ref="resultRating" hidden></div>
            <p data-ref="resultNote" hidden></p>
            <div class="cs-sheet-actions">
                ${primary}
                <button type="button" class="cs-btn" data-dlg="review">${esc(tr(reviewOn() ? 'gameReview' : 'review'))}</button>
                <button type="button" class="cs-btn" data-dlg="menu">${esc(tr('menu'))}</button>
            </div>`);
        const sheet = refs.sheet;
        sheet.querySelector('[data-dlg="review"]').onclick = () => { closeDialog(); if (reviewOn()) openReview(game.view ?? 1); };
        if (reviewOn() && !game.coach) { game.coach = true; renderCoach(); renderMarks(); }
        sheet.querySelector('[data-dlg="menu"]').onclick = () => { closeDialog(true); closeScreen(); openSheet(); };
        sheet.querySelector('[data-dlg="again"]')?.addEventListener('click', () => { closeDialog(); playAgain(); });
        sheet.querySelector('[data-dlg="history"]')?.addEventListener('click', () => { closeDialog(true); closeScreen(); showHistory(); });
        sheet.querySelector('[data-dlg="rematch"]')?.addEventListener('click', () => {
            emit('chess_rematch', { roomCode: game.online.roomCode });
            setResultNote(tr('rematchWaiting'));
        });
        updateResultRating();
    }
    function updateResultRating() {
        const chip = refs.sheet?.querySelector('[data-ref="resultRating"]');
        if (!chip || game?.mode !== 'online') return;
        const change = game.online.ratingChange;
        if (!game.over?.rated && !change) {
            if (game.over && game.over.result !== 'aborted') { chip.hidden = false; chip.textContent = tr('unrated'); }
            return;
        }
        if (!change) return;
        const delta = change.delta > 0 ? `+${change.delta}` : String(change.delta);
        chip.hidden = false;
        const cat = core.ratingCategory(game.tc) || 'blitz';
        chip.innerHTML = `${esc(tr('rating'))} · ${esc(tr(cat))} <b>${change.rating}</b> <b class="${change.delta >= 0 ? 'up' : 'down'}">${delta}</b>`;
    }
    function setResultNote(text, withAccept = false) {
        if (ui.dialog?.kind !== 'result') { if (text) toast(text); return; }
        const note = refs.sheet.querySelector('[data-ref="resultNote"]');
        if (!note) return;
        note.hidden = !text;
        note.textContent = text || '';
        const btn = refs.sheet.querySelector('[data-dlg="rematch"]');
        if (btn && withAccept) btn.textContent = tr('accept');
    }

    /* ---------- облачко с подробностями у кнопки «i» в настройках ---------- */
    function toggleBubble(btn) {
        const row = btn.closest('.cs-toggle-row');
        const bubble = row?.querySelector('.cs-bubble');
        if (!bubble) return;
        const opening = bubble.hidden || bubble.classList.contains('is-closing');
        refs.sheet.querySelectorAll('.cs-bubble:not([hidden])').forEach(other => { if (other !== bubble) closeBubble(other); });
        if (!opening) { closeBubble(bubble); return; }
        // хвостик облачка смотрит точно на «i»
        const rowBox = row.getBoundingClientRect(), iBox = btn.getBoundingClientRect();
        bubble.style.setProperty('--tail-x', `${Math.round(iBox.left + iBox.width / 2 - rowBox.left)}px`);
        clearTimeout(bubble.closeTimer);
        bubble.classList.remove('is-closing');
        bubble.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        haptic('select');
    }
    function closeBubble(bubble) {
        if (bubble.hidden || bubble.classList.contains('is-closing')) return;
        bubble.closest('.cs-toggle-row')?.querySelector('.cs-info')?.setAttribute('aria-expanded', 'false');
        if (REDUCED_MOTION) { bubble.hidden = true; return; }
        bubble.classList.add('is-closing');
        bubble.closeTimer = setTimeout(() => { bubble.hidden = true; bubble.classList.remove('is-closing'); }, 170);
    }
    function closeBubblesOutside(event) {
        if (event.target.closest?.('.cs-bubble, .cs-info')) return;
        refs.sheet.querySelectorAll('.cs-bubble:not([hidden])').forEach(closeBubble);
    }

    function showSettings() {
        const rows = [['sound', 'sound'], ['coords', 'coordinates'], ['showMoves', 'showMoves']];
        if (Talk) rows.push(['talk', 'talkingPieces', null, 'talkingPiecesInfo']);
        if (isOwner()) rows.unshift(['action', 'actionMode', 'actionModeHint']);
        if (isOwner()) rows.push(['botLabel', 'botLabel', 'botLabelHint']);
        if (game?.mode === 'local') rows.push(['autoFlip', 'autoFlip']);
        if (game?.mode === 'bot' || (game?.over && game.mode !== 'puzzle')) rows.splice(isOwner() ? 1 : 0, 0, ['review', 'moveReview', 'moveReviewHint']);
        openDialog('settings', `
            <h2>${esc(tr('settings'))}</h2>
            ${Feel ? feelSettingsHtml() : ''}
            <div class="cs-settings" style="margin-top:12px">
                ${rows.map(([key, label, sub, info]) => `<div class="cs-toggle-row"><span>${esc(tr(label))}${info ? `<button type="button" class="cs-info" data-info="${info}" aria-expanded="false" aria-label="${esc(tr('moreInfo'))}">i</button>` : ''}${sub ? `<small class="cs-switch-sub">${esc(tr(sub))}</small>` : ''}</span><button type="button" class="cs-switch${settings[key] ? ' on' : ''}" data-setting="${key}" role="switch" aria-checked="${!!settings[key]}" aria-label="${esc(tr(label))}"></button>${info ? `<div class="cs-bubble" data-bubble="${info}" role="tooltip" hidden>${esc(tr(info))}</div>` : ''}</div>`).join('')}
            </div>
            <p class="cs-settings-label">${esc(tr('board'))}</p>
            <div class="cs-skins" data-ref="skins">${skinTiles()}</div>
            <div class="cs-sheet-actions">
                ${game?.moves.length ? `<button type="button" class="cs-btn" data-dlg="pgn">${esc(tr('copyPgn'))}</button>` : ''}
                <button type="button" class="cs-btn" data-dlg="close">${esc(tr('backToGame'))}</button>
            </div>`);
        refs.sheet.querySelector('[data-dlg="pgn"]')?.addEventListener('click', copyPgn);
        bindFeelSettings();
        refs.sheet.querySelector('.cs-skins').addEventListener('click', onSkinClick);
        refs.sheet.querySelectorAll('.cs-info').forEach(btn => { btn.onclick = event => { event.stopPropagation(); toggleBubble(btn); }; });
        refs.sheet.addEventListener('click', closeBubblesOutside);
        fetchProfile().then(() => {
            const grid = refs.sheet.querySelector('.cs-skins');
            if (grid && ui.dialog?.kind === 'settings') grid.innerHTML = skinTiles();
        });
        refs.sheet.querySelectorAll('[data-setting]').forEach(btn => {
            btn.onclick = () => {
                const key = btn.dataset.setting;
                settings[key] = !settings[key];
                saveSettings();
                btn.classList.toggle('on', settings[key]);
                btn.setAttribute('aria-checked', String(settings[key]));
                haptic('select');
                if (key === 'coords') { refs.frame.classList.toggle('no-coords', !settings.coords); layout(); }
                if (key === 'showMoves') renderMarks();
                if (key === 'sound' && settings.sound) { Sound.unlock(); Sound.play('move'); }
                if (key === 'autoFlip' && settings.autoFlip && game) setOrientation(game.chess.turn());
                if (key === 'talk') { if (settings.talk) ui.talkHello = true; else clearTalk(); }
                if (key === 'botLabel') renderPlayers();
                if (key === 'review') {
                    if (!settings.review) engines.review?.stop();
                    scheduleReview();
                    renderMarks();
                    renderMoveList();
                    renderCoach();
                }
                if (key === 'action') {
                    if (actionOn()) { Action.load().catch(() => {}); scheduleAnalysis(); }
                    else { analysisToken++; engines.action?.stop(); cancelCinema(); }
                }
            };
        });
        refs.sheet.querySelector('[data-dlg="close"]').onclick = () => closeDialog();
    }

    /** Ощущения: физический стиль и интенсивность — два переключателя-сегмента. */
    function feelSettingsHtml() {
        const seg = (key, values, labels) => `<div class="cs-seg" data-seg="${key}" style="--n:${values.length};--i:${Math.max(0, values.indexOf(settings[key]))}" role="radiogroup">
            <i class="cs-seg-glider" aria-hidden="true"></i>
            ${values.map((v, i) => `<button type="button" data-v="${v}" role="radio" aria-checked="${settings[key] === v}" class="${settings[key] === v ? 'is-on' : ''}">${esc(tr(labels[i]))}</button>`).join('')}
        </div>`;
        return `<p class="cs-settings-label">${esc(tr('feelTitle'))}</p>
            <div class="cs-feel">
                ${seg('feelStyle', Feel.STYLES, ['styleGlass', 'styleElastic'])}
                ${seg('feelLevel', Feel.LEVELS, ['levelMinimal', 'levelBalanced', 'levelImmersive'])}
                <p class="cs-feel-note" data-ref="feelNote">${esc(feelNote())}</p>
            </div>`;
    }
    const feelNote = () => `${tr(settings.feelStyle === 'elastic' ? 'feelElasticHint' : 'feelGlassHint')} · ${tr(`feel_${settings.feelLevel}`)}`;
    function bindFeelSettings() {
        refs.sheet.querySelectorAll('.cs-seg').forEach(seg => {
            seg.addEventListener('click', event => {
                const btn = event.target.closest('button[data-v]');
                if (!btn) return;
                const key = seg.dataset.seg;
                if (settings[key] === btn.dataset.v) return;
                settings[key] = btn.dataset.v;
                saveSettings();
                applyFeel();
                const buttons = [...seg.querySelectorAll('button[data-v]')];
                seg.style.setProperty('--i', String(buttons.indexOf(btn)));
                buttons.forEach(b => { b.classList.toggle('is-on', b === btn); b.setAttribute('aria-checked', String(b === btn)); });
                const note = refs.sheet.querySelector('[data-ref="feelNote"]');
                if (note) note.textContent = feelNote();
                haptic('select');
                Sound.unlock();
                sfx('pick');
                threadKey = '';
                renderMarks();
            });
        });
    }

    function skinTiles() {
        const profile = ratingCache?.data || null;
        return SKINS.map(skin => {
            const open = skinUnlocked(skin, profile);
            const current = screen?.dataset.skin || 'classic';
            const active = current === skin.id;
            // Требование видно всегда; у открытой доски — с галочкой.
            const note = skin.unlock ? `${tr(skin.unlock.cat)} ${skin.unlock.elo}${open ? ' ✓' : ''}` : '';
            const squares = Array.from({ length: 8 }, (_, i) => `<span class="${(i + Math.floor(i / 4)) % 2 ? 'd' : ''}" style="--x:${i % 4};--y:${Math.floor(i / 4)}"></span>`).join('');
            return `<button type="button" class="cs-skin${active ? ' is-active' : ''}${open ? '' : ' is-locked'}" data-skin="${skin.id}" data-skin-pick="${skin.id}" aria-pressed="${active}" style="${texVars(skin, true)}">
                <span class="cs-skin-board"><span class="cs-skin-grid"><span class="cs-skin-cells">${squares}</span><i class="cs-skin-piece w" style="background-image:url('${pieceUrl('wQ')}')"></i><i class="cs-skin-piece b" style="background-image:url('${pieceUrl('bN')}')"></i></span></span>
                <b>${esc(tr(`skin_${skin.id}`))}</b>${note ? `<small>${esc(note)}</small>` : ''}</button>`;
        }).join('');
    }
    async function onSkinClick(event) {
        const tile = event.target.closest('[data-skin-pick]');
        if (!tile) return;
        const skin = SKINS.find(item => item.id === tile.dataset.skinPick);
        if (!skin) return;
        if (skin.unlock && !ratingCache) await fetchProfile();
        if (!skinUnlocked(skin, ratingCache?.data)) {
            haptic('error');
            toast(tr('locked', { cat: tr(skin.unlock.cat), elo: skin.unlock.elo }), 'error');
            return;
        }
        settings.skin = skin.id;
        saveSettings();
        applySkin();
        haptic('select');
        tile.parentElement.querySelectorAll('.cs-skin').forEach(el => {
            const on = el === tile;
            el.classList.toggle('is-active', on);
            el.setAttribute('aria-pressed', String(on));
        });
    }

    /** Партия в PGN: заголовки, ходы и результат — для разбора в любой программе. */
    function gamePgn() {
        const c = new Chess(game.startFen);
        const white = game.mode === 'local' ? tr('white') : playerInfo('w').name;
        const black = game.mode === 'local' ? tr('black') : playerInfo('b').name;
        const result = !game.over || game.over.result === 'aborted' ? '*' : game.over.result === 'white' ? '1-0' : game.over.result === 'black' ? '0-1' : '1/2-1/2';
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
        c.setHeader('Event', `Spark Chess · ${gameTitle()}`);
        c.setHeader('Site', 'https://t.me/spark_game_bot');
        c.setHeader('Date', date);
        c.setHeader('White', white);
        c.setHeader('Black', black);
        c.setHeader('Result', result);
        if (game.tc) c.setHeader('TimeControl', `${game.tc.base / 1000}+${game.tc.inc / 1000}`);
        for (const m of game.moves) c.move(m.san);
        const pgn = c.pgn();
        return /(1-0|0-1|1\/2-1\/2|\*)\s*$/.test(pgn) ? pgn : `${pgn} ${result}`;
    }
    async function copyPgn() {
        if (!game) return;
        const text = gamePgn();
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch (_) {
            try {
                const area = document.createElement('textarea');
                area.value = text; area.style.position = 'fixed'; area.style.opacity = '0';
                document.body.appendChild(area); area.select(); ok = document.execCommand('copy'); area.remove();
            } catch (_) {}
        }
        toast(ok ? tr('pgnCopied') : tr('e_network'), ok ? 'success' : 'error');
        haptic(ok ? 'success' : 'error');
    }

    /* ---------- кнопки экрана ---------- */
    function onScreenClick(event) {
        const mv = event.target.closest('.cs-mv');
        if (mv) { setView(Number(mv.dataset.ply)); return; }
        const graph = event.target.closest('.cs-graph');
        if (graph && game) {
            const box = graph.getBoundingClientRect();
            const ply = Math.round(Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * Number(graph.dataset.plies));
            if (ui.dialog) closeDialog();
            openReview(ply);
            return;
        }
        const button = event.target.closest('[data-act]');
        if (!button || button.disabled) return;
        if (game?.mode === 'puzzle' && button.dataset.act !== 'back' && Date.now() - (game.puzzle?.startedAt || 0) < 450) return;
        Sound.unlock();
        switch (button.dataset.act) {
            case 'back': return requestLeave();
            case 'settings': return showSettings();
            case 'hint':
                setHint(!hintOn);
                haptic('light');
                toast(hintOn ? tr('hintOn') : tr('hintOff'));
                return;
            case 'prev': return setView((game.view == null ? game.moves.length : game.view) - 1);
            case 'next': return setView((game.view == null ? game.moves.length : game.view) + 1);
            case 'first': return setView(0);
            case 'last': return setView(game.moves.length);
            case 'flip': haptic('light'); return setOrientation(other(view.orientation));
            case 'pen': return setDrawMode(!ui.drawMode);
            case 'undo': return takeback();
            case 'draw': return offerDraw();
            case 'resign': return resign();
            case 'again': return playAgain();
            case 'rematch': return emit('chess_rematch', { roomCode: game.online.roomCode }) && toast(tr('rematchWaiting'));
            case 'result': return showResult();
            case 'history': closeScreen(); return showHistory();
            case 'pz_hint': return puzzleHint();
            case 'pz_solution': return showPuzzleSolution();
            case 'pz_retry': return retryPuzzle();
            case 'pz_next': return nextPuzzle();
            default: return undefined;
        }
    }

    function requestLeave() {
        if (ui.promo) { ui.promo.el.remove(); ui.promo = null; syncPieces(positionMap(game.chess), { animate: true }); return; }
        if (ui.dialog) { closeDialog(); return; }
        if (!game) { closeScreen(); return; }
        if (game.mode === 'puzzle') { puzzleRun = null; hideBanner(); closeScreen(); openSheet('puzzles'); return; }
        if (game.archive) { closeScreen(); showHistory(); return; }
        if (game.mode === 'online' && !game.over) {
            confirmDialog({
                title: tr('confirmLeave'), text: tr('confirmLeaveOnline'), okLabel: tr('leave'),
                onOk: () => { emit('chess_resign', { roomCode: game.online.roomCode }); closeScreen(); openSheet(); },
            });
            return;
        }
        if (game.mode !== 'online' && !game.over && game.moves.length) toast(tr('confirmLeaveLocal'));
        closeScreen();
        openSheet();
    }

    function takeback() {
        if (!game || game.over || game.mode === 'online' || !game.moves.length) return;
        cancelCinema();
        cancelBot();
        clearTalk();
        let undo = 1;
        if (game.mode === 'bot' && game.chess.turn() === game.myColor && game.moves.length >= 2) undo = 2;
        if (game.mode === 'bot' && game.chess.turn() === game.myColor && game.moves.length === 1) undo = 1;
        for (let i = 0; i < undo; i++) { game.chess.undo(); game.moves.pop(); }
        game.view = null;
        game.premove = null;
        clearSelection(false);
        syncPieces(positionMap(game.chess), { animate: true });
        clearAnnotations();
        Sound.play('move', 0.7);
        haptic('light');
        afterChange();
        saveOffline();
        if (game.mode === 'bot' && game.chess.turn() !== game.myColor) botMove();
    }

    function offerDraw() {
        if (!game || game.over) return;
        if (game.mode === 'online') { emit('chess_draw_offer', { roomCode: game.online.roomCode }); return; }
        if (game.mode === 'local') {
            confirmDialog({ title: tr('offerDraw'), text: tr('drawOffered', { name: tr(game.chess.turn() === 'w' ? 'white' : 'black') }), okLabel: tr('accept'), okDanger: false, onOk: () => finishGame({ result: 'draw', reason: 'agreement' }) });
        }
    }

    function resign() {
        if (!game || game.over) return;
        if (game.mode === 'online') {
            if (game.moves.length < 2) { emit('chess_resign', { roomCode: game.online.roomCode }); return; }
            confirmDialog({ title: tr('confirmResign'), text: tr('confirmResignText'), okLabel: tr('resign'), onOk: () => emit('chess_resign', { roomCode: game.online.roomCode }) });
            return;
        }
        const loser = game.mode === 'local' ? game.chess.turn() : game.myColor;
        confirmDialog({
            title: tr('confirmResign'), text: game.mode === 'local' ? tr(loser === 'w' ? 'white' : 'black') : tr('confirmResignText'), okLabel: tr('resign'),
            onOk: () => finishGame({ result: loser === 'w' ? 'black' : 'white', reason: 'resign' }),
        });
    }

    function playAgain() {
        if (!game) return;
        if (game.mode === 'online') { emit('chess_rematch', { roomCode: game.online.roomCode }); return; }
        const color = prefs.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : (game.mode === 'bot' && prefs.color === game.myColor ? game.myColor : prefs.color);
        newGame({ mode: game.mode, myColor: color, level: game.level, tcId: game.tc?.id || 'none' });
        Sound.play('start', 0.8);
    }

    /* ---------- шторка выбора режима ---------- */
    let ratingCache = null;
    let roomsTimer = null;

    function buildSheet() {
        sheetEl = document.getElementById('modalChess');
        waitEl = document.getElementById('modalChessWait');
        const panel = sheetEl.querySelector('.ui-mode-panel');
        const tcButtons = (list, none) => (none ? `<button type="button" class="cs-tc" data-tc="none"><b>∞</b><small data-t="noTime"></small></button>` : '')
            + list.map(tc => `<button type="button" class="cs-tc" data-tc="${tc.id}"><b>${tc.id}</b><small data-t="${tc.cat}"></small></button>`).join('');
        const offlineTcs = core.TIME_CONTROLS.filter(tc => ['1+0', '3+0', '3+2', '5+0', '10+0', '15+10', '30+0'].includes(tc.id));
        panel.innerHTML = `
            <div class="ui-sheet-grab" aria-hidden="true"></div>
            <div class="ui-sheet-heading"><h2 data-t="title"></h2><span class="cs-head-btns"><button class="cs-expand" type="button" data-sheet="expand" data-ref="expandBtn" aria-expanded="false">${ICON.expand}</button><button class="ui-close" type="button" data-sheet="close" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button></span></div>
            <div class="cs-menu-body"><div class="cs-menu">
            <div class="segment-control cs-tabs" role="tablist">
                <div class="segment-glider" data-ref="glider"></div>
                <button type="button" class="segment-item" data-tab="bot" data-t="modeBot"></button>
                <button type="button" class="segment-item" data-tab="online" data-t="modeOnline"></button>
                <button type="button" class="segment-item" data-tab="local" data-t="modeLocal"></button>
                <button type="button" class="segment-item" data-tab="puzzles" data-t="modePuzzles"></button>
            </div>
            <button type="button" class="cs-continue is-elsewhere" data-sheet="takeover" hidden><span class="cs-continue-ico">${ICON.device}</span><span><b data-t="elsewhereTitle"></b><small data-ref="elsewhereHint"></small></span>${ICON.chevron}</button>
            <button type="button" class="cs-continue" data-sheet="continue" hidden><i style="background-image:url('${pieceUrl('wN')}')"></i><span><b data-t="continueGame"></b><small data-ref="continueHint"></small></span>${ICON.chevron}</button>
            <div class="cs-panel" data-panel="bot">
                <p class="cs-label" data-t="botLevel"></p>
                <div class="cs-levels">${core.BOT_LEVELS.map(l => `<button type="button" class="cs-level" data-level="${l.level}">${l.level}</button>`).join('')}</div>
                <div class="cs-level-info"><span data-ref="levelName"></span><small data-ref="levelElo"></small></div>
                <p class="cs-label" data-t="yourColor"></p>
                <div class="cs-colors">
                    <button type="button" class="cs-color" data-color="w"><i style="background-image:url('${pieceUrl('wK')}')"></i><span data-t="white"></span></button>
                    <button type="button" class="cs-color" data-color="r"><i class="half"></i><span data-t="random"></span></button>
                    <button type="button" class="cs-color" data-color="b"><i style="background-image:url('${pieceUrl('bK')}')"></i><span data-t="black"></span></button>
                </div>
                <p class="cs-label" data-t="timeControl"></p>
                <div class="cs-tcs" data-tcs="botTc">${tcButtons(offlineTcs, true)}</div>
                <button type="button" class="btn-main" data-sheet="playBot" data-t="play"></button>
            </div>
            <div class="cs-panel" data-panel="online">
                <div class="cs-rating-card"><i style="background-image:url('${pieceUrl('wQ')}')"></i><div><small data-ref="myRatingLabel"></small><b data-ref="myRating">—</b></div><span data-ref="myGames"></span></div>
                <p class="cs-label" data-t="timeControl"></p>
                <div class="cs-tcs" data-tcs="onlineTc">${tcButtons(core.TIME_CONTROLS, false)}</div>
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
                    <button type="button" class="ck-scan" data-sheet="scan" data-ref="scanBtn" hidden>${ICON.qr}</button>
                    <button type="button" data-sheet="join" data-t="join"></button>
                </div>
                <div class="ck-rooms-head">
                    <div class="cs-rooms-title"><h3 data-t="openRooms"></h3><span class="cs-online" data-ref="online" role="status" hidden><i class="cs-online-dot"></i><b data-ref="onlineNum">0</b><span data-t="onlineNow"></span><em><b data-ref="onlinePlay">0</b><span data-t="inGame"></span></em></span></div>
                    <button class="ck-refresh" type="button" data-sheet="refresh">${ICON.refresh}</button>
                </div>
                <div class="ck-rooms" data-ref="rooms"></div>
            </div>
            <div class="cs-panel" data-panel="local">
                <p class="cs-label" data-t="localHint"></p>
                <p class="cs-label" data-t="timeControl"></p>
                <div class="cs-tcs" data-tcs="localTc">${tcButtons(offlineTcs, true)}</div>
                <button type="button" class="btn-main" data-sheet="playLocal" data-t="play"></button>
            </div>
            <div class="cs-panel" data-panel="puzzles">
                <div class="cs-rating-card pz-rating"><i class="pz-rating-ico">${ICON.target}</i><div><small data-t="puzzleRating"></small><b data-ref="pzRating">—</b></div><span data-ref="pzStats"></span></div>
                <p class="pz-first" data-ref="pzFirst" hidden></p>
                <button class="ck-hero pz-hero" type="button" data-sheet="pz_rated">
                    <span class="ck-hero-icon">${ICON.target}</span>
                    <span class="ck-hero-text"><b data-t="solvePuzzles"></b><small data-t="solveHint"></small></span>
                    ${ICON.arrow}
                </button>
                <div class="ck-tiles">
                    <button class="ck-tile pz-tile-streak" type="button" data-sheet="pz_streak"><span class="ck-tile-icon">${ICON.flame}</span><b data-t="puzzleStreak"></b><small data-ref="pzStreakSub"></small></button>
                    <button class="ck-tile pz-tile-daily" type="button" data-sheet="pz_daily"><span class="ck-tile-icon">${ICON.calendar}</span><b data-t="dailyPuzzle"></b><small data-ref="pzDailySub"></small></button>
                </div>
                <p class="cs-label" data-t="themes"></p>
                <div class="pz-themes">${core.PUZZLE_THEMES.map((theme, i) => `<button type="button" class="pz-theme" data-pz-theme="${i}" style="--c:${PUZZLE_COLORS[i]}"><i></i><span data-t="th_${theme}"></span></button>`).join('')}</div>
            </div>
            <button type="button" class="cs-continue cs-history-row" data-sheet="history"><span class="cs-continue-ico">${ICON.history}</span><span><b data-t="history"></b><small data-ref="histRowHint"></small></span>${ICON.chevron}</button>
            </div>
            <section class="cs-history" data-ref="history">
                <div class="cs-history-head"><h3 data-t="history"></h3><button class="ck-refresh" type="button" data-sheet="histRefresh" data-ref="histRefresh">${ICON.refresh}</button></div>
                <div class="cs-history-stats" data-ref="histStats"></div>
                <div class="cs-history-filters" data-ref="histFilters">
                    <button type="button" data-hist-filter="all" data-t="histAll"></button>
                    <button type="button" data-hist-filter="online" data-t="modeOnline"></button>
                    <button type="button" data-hist-filter="bot" data-t="modeBot"></button>
                    <button type="button" data-hist-filter="local" data-t="modeLocal"></button>
                </div>
                <div class="cs-history-list" data-ref="histList"></div>
                <button type="button" class="cs-btn cs-history-more" data-sheet="histMore" data-ref="histMore" data-t="histMore" hidden></button>
            </section>
            </div>`;
        panel.style.setProperty('--cs-wk', `url('${pieceUrl('wK')}')`);
        panel.style.setProperty('--cs-bk', `url('${pieceUrl('bK')}')`);
        panel.querySelectorAll('[data-ref]').forEach(el => { refs['s_' + el.dataset.ref] = el; });
        panel.addEventListener('click', onSheetClick);
        refs.s_codeInput.addEventListener('keydown', event => { if (event.key === 'Enter') joinByCode(); });
        refs.s_codeInput.addEventListener('input', () => { refs.s_codeInput.value = refs.s_codeInput.value.replace(/\D/g, '').slice(0, 5); });

        waitEl.querySelector('.modal').innerHTML = `
            <div class="ck-radar" aria-hidden="true"><span></span><span></span><span></span><img src="${BASE}../game-icons/chess.png" alt=""></div>
            <h2 data-ref="waitTitle"></h2>
            <p class="ck-wait-hint" data-ref="waitTc"></p>
            <div data-ref="waitCodeBox"><p class="ck-wait-sub" data-t="roomCode"></p><div class="ck-wait-code" data-ref="waitCode">-----</div>
            <div class="ck-qr" data-ref="waitQr" role="img"></div><p class="ck-wait-hint" data-t="qrHint"></p>
            <button class="btn-main ck-invite" type="button" data-wait="invite">${ICON.send}<span data-t="inviteFriend"></span></button></div>
            <button class="cs-btn" type="button" data-wait="cancel" data-t="cancel"></button>`;
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
        renderPuzzlePanel();
        refs.s_codeInput.placeholder = tr('code');
        refs.s_scanBtn.hidden = !canScan();
        refs.s_scanBtn.setAttribute('aria-label', tr('scanQr'));
        const level = core.botLevel(prefs.level);
        refs.s_levelName.textContent = tr(`level${level.level}`);
        refs.s_levelElo.textContent = `~${level.elo}`;
        const tc = core.timeControl(prefs.onlineTc) || core.timeControl(core.DEFAULT_ONLINE_TC);
        refs.s_quickHint.textContent = tr('findHint', { tc: `${tr(tc.cat)} ${tc.id}` });
        if (refs.s_myRatingLabel) showRating(ratingCache?.data || null);
        panel.querySelectorAll('[data-level]').forEach(b => b.classList.toggle('active', Number(b.dataset.level) === prefs.level));
        panel.querySelectorAll('[data-color]').forEach(b => b.classList.toggle('active', b.dataset.color === prefs.color));
        panel.querySelectorAll('[data-tcs]').forEach(group => {
            const value = prefs[group.dataset.tcs];
            group.querySelectorAll('[data-tc]').forEach(b => b.classList.toggle('active', b.dataset.tc === value));
        });
        const away = elsewhereGame();
        panel.querySelector('[data-sheet="takeover"]').hidden = !away;
        if (away) {
            const tc = core.timeControl(away.tc);
            refs.s_elsewhereHint.textContent = [tr('playHere'), nick(away.opponent?.name), tc ? `${tr(tc.cat)} ${tc.id}` : ''].filter(Boolean).join(' · ');
        }
        renderHistory();
        const saved = savedGame();
        const cont = panel.querySelector('[data-sheet="continue"]');
        cont.hidden = !saved;
        if (saved) {
            const who = saved.mode === 'bot' ? tr('botName', { level: tr(`level${core.botLevel(saved.level).level}`) }) : tr('modeLocal');
            refs.s_continueHint.textContent = `${who} · ${tr('movesCount', { n: Math.ceil(saved.moves.length / 2) })}`;
        }
    }

    function setTab(tab, animate = true) {
        prefs.tab = tab;
        savePrefs();
        const panel = sheetEl.querySelector('.ui-mode-panel');
        const tabs = [...panel.querySelectorAll('[data-tab]')];
        const index = tabs.findIndex(b => b.dataset.tab === tab);
        tabs.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        refs.s_glider.style.transition = animate ? '' : 'none';
        refs.s_glider.style.transform = `translateX(${index * 100}%)`;
        panel.querySelectorAll('[data-panel]').forEach(p => p.classList.toggle('active', p.dataset.panel === tab));
        clearInterval(roomsTimer);
        if (tab === 'puzzles') { renderPuzzlePanel(); puzzlesNear(pz.rating).catch(() => {}); }
        if (tab === 'online') {
            loadRating();
            requestRooms();
            roomsTimer = setInterval(requestRooms, 5000);
        }
    }

    function onSheetClick(event) {
        const panel = sheetEl.querySelector('.ui-mode-panel');
        Sound.unlock();
        const tab = event.target.closest('[data-tab]');
        if (tab) { setTab(tab.dataset.tab); haptic('select'); return; }
        const level = event.target.closest('[data-level]');
        if (level) { prefs.level = Number(level.dataset.level); savePrefs(); refreshSheetTexts(); haptic('select'); return; }
        const color = event.target.closest('[data-color]');
        if (color) { prefs.color = color.dataset.color; savePrefs(); refreshSheetTexts(); haptic('select'); return; }
        const tc = event.target.closest('[data-tc]');
        if (tc) { prefs[tc.closest('[data-tcs]').dataset.tcs] = tc.dataset.tc; savePrefs(); refreshSheetTexts(); haptic('select'); return; }
        const pzTheme = event.target.closest('[data-pz-theme]');
        if (pzTheme) { haptic('light'); startPuzzle('theme', { theme: Number(pzTheme.dataset.pzTheme), button: pzTheme }); return; }
        const join = event.target.closest('[data-join]');
        if (join) { joinRoom(join.dataset.join); return; }
        // вся строка комнаты — большая кнопка «играть»
        const roomRow = event.target.closest('.ck-room[data-code]:not(.is-leaving)');
        if (roomRow) { joinRoom(roomRow.dataset.code); return; }
        const histFilter = event.target.closest('[data-hist-filter]');
        if (histFilter) { prefs.histFilter = histFilter.dataset.histFilter; savePrefs(); histShown = HIST_PAGE; renderHistory(); haptic('select'); return; }
        const hist = event.target.closest('[data-hist]');
        if (hist) { openArchived(historyGames().find(g => g.id === hist.dataset.hist)); return; }
        const button = event.target.closest('[data-sheet]');
        if (!button) return;
        switch (button.dataset.sheet) {
            case 'close': return closeSheet();
            case 'expand': haptic('light'); return setFull(!prefs.full);
            case 'history': haptic('light'); return showHistory();
            case 'histMore': histShown += HIST_PAGE; return renderHistory();
            case 'histRefresh': {
                button.classList.remove('spin'); void button.offsetWidth; button.classList.add('spin');
                return loadHistory(true).then(renderHistory);
            }
            case 'continue': return resumeSaved();
            case 'takeover': {
                window.__chessElsewhere = null;
                refreshSheetTexts();
                closeSheet();
                emit('chess_rejoin', { takeover: true });
                return;
            }
            case 'playBot': return startOffline('bot');
            case 'playLocal': return startOffline('local');
            case 'quick': return quickMatch();
            case 'create': return createRoom();
            case 'code': {
                const row = refs.s_codeRow;
                row.classList.toggle('open');
                if (row.classList.contains('open')) setTimeout(() => refs.s_codeInput.focus(), 120);
                return;
            }
            case 'join': return joinByCode();
            case 'pz_rated': return startPuzzle('rated', { button });
            case 'pz_streak': puzzleRun = { count: 0 }; return startPuzzle('streak', { button });
            case 'pz_daily': return startPuzzle('daily', { button });
            case 'scan': return scanInvite();
            case 'refresh': {
                const glyph = button;
                glyph.classList.remove('spin'); void glyph.offsetWidth; glyph.classList.add('spin');
                return requestRooms();
            }
            default: return panel;
        }
    }

    function startOffline(mode) {
        const color = prefs.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : prefs.color;
        const tcId = mode === 'bot' ? prefs.botTc : prefs.localTc;
        localStorage.removeItem(SAVE_KEY);
        closeSheet();
        openScreen();
        newGame({ mode, myColor: mode === 'bot' ? color : 'w', level: prefs.level, tcId });
        Sound.play('start', 0.8);
        haptic('light');
        if (mode === 'bot') engine('bot');   // прогреваем движок, пока игрок думает
    }

    function profilePayload() {
        const user = me();
        return { username: myName(), photo_url: user?.photo_url || '', lang: lang() };
    }

    function quickMatch() {
        const tc = prefs.onlineTc;
        if (!emit('chess_quick', { ...profilePayload(), tc })) return;
        haptic('light');
        showWait({ quick: true, tc });
    }
    function createRoom() {
        if (!emit('chess_create', { ...profilePayload(), tc: prefs.onlineTc, isPublic: true })) return;
        haptic('light');
    }
    function joinByCode() {
        const code = refs.s_codeInput.value.trim();
        if (!/^\d{5}$/.test(code)) { haptic('error'); refs.s_codeInput.focus(); return; }
        joinRoom(code);
    }
    function joinRoom(code) {
        emit('chess_join', { ...profilePayload(), roomCode: String(code) });
        haptic('light');
    }
    function requestRooms() { emit('chess_list', {}); }

    function roomHtml(room) {
        const name = nick(room.name);
        const avatar = typeof room.avatar === 'string' && /^https:\/\//i.test(room.avatar)
            ? `<img class="ck-room-ava" src="${esc(room.avatar)}" alt="" referrerpolicy="no-referrer">`
            : `<span class="ck-room-ava">${esc((name || '?').slice(0, 1).toUpperCase())}</span>`;
        const tc = core.timeControl(room.tc);
        // контроль времени и его вид («блиц») — в одной плашке, подпись под именем не переносится
        return `${avatar}<div class="ck-room-text"><b>${flagHtml(room.lang)}${esc(name)}</b><small>${esc(tr('rating'))} ${esc(room.rating || core.START_RATING)}</small></div>
            <span class="cs-room-tc"><b>${esc(tc ? tc.id : room.tc)}</b>${tc ? `<small>${esc(tr(tc.cat))}</small>` : ''}</span>
            <button class="ck-room-join" type="button" data-join="${esc(room.code)}">${esc(tr('join'))}</button>`;
    }
    /** Список обновляется раз в 5 с, но строки не пересоздаются: те же комнаты
        остаются на месте, новые плавно появляются, ушедшие сворачиваются. */
    function renderRooms(rooms) {
        const list = refs.s_rooms;
        if (!list) return;
        const live = el => !el.classList.contains('is-leaving');
        const rows = new Map([...list.querySelectorAll('.ck-room[data-code]')].filter(live).map(el => [el.dataset.code, el]));
        const codes = new Set(rooms.map(room => String(room.code)));
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

    /** Счётчик «в сети · в игре» над комнатами: числа плавно доезжают до новых. */
    let onlineNow = null;
    let onlineFrame = 0;
    function renderOnline(online) {
        const box = refs.s_online;
        if (!box) return;
        const total = Math.round(Number(online?.total));
        if (!(total > 0)) { box.hidden = true; onlineNow = null; return; }
        const to = { total, playing: Math.max(0, Math.min(total, Math.round(Number(online.playing) || 0))) };
        const paint = v => { refs.s_onlineNum.textContent = v.total; refs.s_onlinePlay.textContent = v.playing; onlineNow = v; };
        box.setAttribute('aria-label', `${to.total} ${tr('onlineNow')}, ${to.playing} ${tr('inGame')}`);
        const from = onlineNow || { total: Math.round(total * 0.7), playing: Math.round(to.playing * 0.7) };
        if (box.hidden) box.hidden = false;
        else if (from.total !== to.total) { box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump'); }
        cancelAnimationFrame(onlineFrame);
        if (REDUCED_MOTION || (from.total === to.total && from.playing === to.playing)) { paint(to); return; }
        const started = performance.now();
        const step = time => {
            const k = Math.min(1, (time - started) / 700);
            const e = 1 - Math.pow(1 - k, 3);
            paint({ total: Math.round(from.total + (to.total - from.total) * e), playing: Math.round(from.playing + (to.playing - from.playing) * e) });
            if (k < 1) onlineFrame = requestAnimationFrame(step);
        };
        onlineFrame = requestAnimationFrame(step);
    }

    async function fetchProfile() {
        if (ratingCache && Date.now() - ratingCache.at < 30000) return ratingCache.data;
        try {
            const response = await fetch(`${typeof API_BASE_URL === 'string' ? API_BASE_URL : ''}/api/chess/profile`, { headers: { 'X-Init-Data': tg?.initData || '' } });
            if (!response.ok) throw new Error(String(response.status));
            const data = await response.json();
            ratingCache = { at: Date.now(), data };
            applySkin();
            return data;
        } catch (_) { return ratingCache?.data || null; }
    }
    async function loadRating() {
        showRating(await fetchProfile());
    }
    /** Рейтинг в той категории (пуля, блиц, рапид), что выбрана для онлайна. */
    function showRating(data) {
        const cat = core.ratingCategory(prefs.onlineTc) || 'blitz';
        const row = data?.categories?.[cat] || null;
        refs.s_myRatingLabel.textContent = `${tr('yourRating')} · ${tr(cat)}`;
        refs.s_myRating.textContent = String(row?.rating || core.START_RATING);
        refs.s_myGames.textContent = row?.games ? tr('gamesShort', { n: row.games }) : '';
    }

    let waitInfo = null;
    function showWait(data) {
        waitInfo = { ...waitInfo, ...data };
        const quick = !!waitInfo.quick;
        refs.w_waitTitle.textContent = quick ? tr('searching') : tr('waitingFriend');
        refs.w_waitCodeBox.hidden = quick;
        waitEl.classList.toggle('has-qr', !quick);
        if (data.roomCode) {
            refs.w_waitCode.textContent = data.roomCode;
            renderInviteQr(data.roomCode);
        }
        const tc = core.timeControl(waitInfo.tc);
        refs.w_waitTc.textContent = tc ? `${tr(tc.cat)} · ${tc.id}` : '';
        applyTexts(waitEl);
        waitEl.classList.add('visible');
    }
    function hideWait() {
        waitInfo = null;
        waitEl?.classList.remove('visible');
    }
    function cancelWait() {
        emit('chess_cancel', {});
        hideWait();
    }
    const inviteLink = code => `https://t.me/spark_game_bot/sparkapp?startapp=cs_${code}`;
    let qrLib = null;
    /** Генератор QR (qrcode-generator, MIT) подгружается только для приглашения. */
    function loadQr() {
        if (!qrLib) {
            qrLib = new Promise((resolve, reject) => {
                if (window.qrcode) return resolve(window.qrcode);
                const script = document.createElement('script');
                script.src = `${BASE}vendor/qrcode.js${VERSION ? `?v=${VERSION}` : ''}`;
                script.onload = () => (window.qrcode ? resolve(window.qrcode) : reject(new Error('qrcode')));
                script.onerror = reject;
                document.head.appendChild(script);
            });
            qrLib.catch(() => { qrLib = null; });
        }
        return qrLib;
    }
    /** QR со ссылкой-приглашением: друг наводит камеру — Telegram открывает партию. */
    async function renderInviteQr(code) {
        const box = refs.w_waitQr;
        box.innerHTML = '';
        box.setAttribute('aria-label', inviteLink(code));
        try {
            const make = await loadQr();
            if (waitInfo?.roomCode !== code) return;
            const qr = make(0, 'M');
            qr.addData(inviteLink(code));
            qr.make();
            const n = qr.getModuleCount();
            let d = '';
            for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
            box.innerHTML = `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" aria-hidden="true"><path d="${d}" fill="#111"/></svg>`;
        } catch (_) {
            box.innerHTML = '';
        }
    }
    /** Встроенный сканер Telegram (Bot API 6.4+); в обычном браузере кнопки нет. */
    const canScan = () => typeof tg?.showScanQrPopup === 'function' && (typeof tg.isVersionAtLeast !== 'function' || tg.isVersionAtLeast('6.4'));
    function inviteCodeFrom(text) {
        const value = String(text || '').trim();
        const match = value.match(/startapp=cs_(\d{5})(?!\d)/) || value.match(/^(\d{5})$/);
        return match ? match[1] : null;
    }
    function scanInvite() {
        if (!canScan()) return;
        haptic('light');
        try {
            tg.showScanQrPopup({ text: tr('scanQrHint') }, text => {
                const code = inviteCodeFrom(text);
                if (!code) return false;
                setTimeout(() => joinRoom(code), 60);
                return true;
            });
        } catch (_) {}
    }
    async function inviteFriend() {
        const code = waitInfo?.roomCode;
        if (!code) return;
        haptic('light');
        if (typeof sharePreparedMessage === 'function' && await sharePreparedMessage('chess', code)) return;
        const link = inviteLink(code);
        const text = tr('inviteText', { name: myName() });
        const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
        if (tg?.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
    }

    /** Онлайн-партия, открытая на другом устройстве (сведения не старше часа). */
    function elsewhereGame() {
        const away = window.__chessElsewhere;
        return away && away.roomCode && Date.now() - (away.at || 0) < 3600e3 ? away : null;
    }
    function openSheet(tab, { history = false } = {}) {
        if (!sheetEl) return;
        // Свежие сведения: если другое устройство уже закрыто, сервер сам вернёт партию сюда.
        if (typeof socket !== 'undefined' && socket?.connected && !game) socket.emit('chess_rejoin');
        refreshSheetTexts();
        setTab(tab || prefs.tab || 'bot', false);
        setFull(history || !!prefs.full, { save: false, scroll: history });
        sheetEl.classList.add('visible');
        loadHistory().then(renderHistory);
        uploadHistory();
    }
    function closeSheet() {
        clearInterval(roomsTimer);
        sheetEl?.classList.remove('visible');
    }

    /* ---------- шторка на весь экран ----------
       Стрелки у крестика разворачивают меню на весь экран; там же — история партий
       (на широком экране — второй колонкой справа). Выбор запоминается. */
    function setFull(on, { save = true, scroll = false } = {}) {
        if (!sheetEl) return;
        if (save) { prefs.full = !!on; savePrefs(); }
        sheetEl.classList.toggle('is-full', !!on);
        const btn = refs.s_expandBtn;
        if (btn) {
            btn.innerHTML = on ? ICON.collapse : ICON.expand;
            btn.setAttribute('aria-label', tr(on ? 'collapse' : 'expand'));
            btn.setAttribute('aria-expanded', String(!!on));
        }
        if (on) renderHistory();
        if (scroll && on) setTimeout(() => refs.s_history?.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'start' }), 60);
    }
    function showHistory() {
        if (!sheetEl.classList.contains('visible')) { openSheet(null, { history: true }); return; }
        setFull(true, { save: false, scroll: true });
        loadHistory(true).then(renderHistory);
    }

    /* ---------- история партий ----------
       Онлайн-партии записывает сервер. Партии с ботом и вдвоём сохраняются здесь
       (HISTORY_KEY) и отправляются на сервер, чтобы были видны на всех устройствах.
       Список: с сервера, плюс свои партии, которые туда ещё не дошли. */
    const HIST_PAGE = 30;
    const HISTORY_LOCAL_MAX = 100;
    let histShown = HIST_PAGE;
    const histStore = { server: null, at: 0, loading: null, uploading: false };
    const apiBase = () => (typeof API_BASE_URL === 'string' ? API_BASE_URL : '');
    const localHistory = () => { const list = readJson(HISTORY_KEY, []); return Array.isArray(list) ? list.filter(g => g && Array.isArray(g.moves)) : []; };

    /** Партия с ботом или вдвоём закончилась: в историю на устройстве и на сервер. */
    function archiveFinished(outcome) {
        if (!game || game.archive || (game.mode !== 'bot' && game.mode !== 'local')) return;
        if (!outcome || outcome.result === 'aborted' || !game.moves.length) return;
        const entry = {
            id: `l${game.id}`,
            cid: `g-${game.id.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            mode: game.mode, at: Date.now(), result: outcome.result, reason: outcome.reason || null,
            tc: game.tc?.id || 'none', rated: false, level: game.mode === 'bot' ? game.level : null,
            myColor: game.mode === 'local' ? null : game.myColor,
            startFen: game.startFen && game.startFen !== new Chess().fen() ? game.startFen : null,
            moves: game.moves.map(m => m.san), white: null, black: null, synced: false,
        };
        writeJson(HISTORY_KEY, [entry, ...localHistory()].slice(0, HISTORY_LOCAL_MAX));
        uploadHistory();
    }
    async function uploadHistory() {
        if (histStore.uploading || !tg?.initData) return;
        const pending = localHistory().filter(g => !g.synced).slice(0, 20);
        if (!pending.length) return;
        histStore.uploading = true;
        try {
            for (const entry of pending) {
                const response = await fetch(`${apiBase()}/api/chess/history`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Init-Data': tg.initData },
                    body: JSON.stringify({ cid: entry.cid, mode: entry.mode, level: entry.level, myColor: entry.myColor, tc: entry.tc, result: entry.result, reason: entry.reason, startFen: entry.startFen, moves: entry.moves, at: entry.at }),
                });
                // 400 — сервер партию не принял (не прошла проверку): больше не шлём, но у себя оставляем
                if (!response.ok && response.status !== 400) break;
                const list = localHistory();
                const hit = list.find(g => g.cid === entry.cid);
                if (hit) { hit.synced = true; writeJson(HISTORY_KEY, list); }
            }
        } catch (_) {
        } finally {
            histStore.uploading = false;
        }
    }
    function loadHistory(force = false) {
        if (histStore.loading) return histStore.loading;
        if (!force && histStore.server && Date.now() - histStore.at < 20000) return Promise.resolve();
        if (!histStore.server) {
            const cache = readJson(HISTORY_CACHE_KEY, null);
            if (cache && String(cache.uid) === String(me()?.id || '') && Array.isArray(cache.games)) histStore.server = cache.games;
        }
        histStore.loading = (async () => {
            try {
                if (!tg?.initData) throw new Error('no initData');
                const response = await fetch(`${apiBase()}/api/chess/history`, { headers: { 'X-Init-Data': tg.initData } });
                if (!response.ok) throw new Error(String(response.status));
                const data = await response.json();
                histStore.server = Array.isArray(data?.games) ? data.games : [];
                histStore.at = Date.now();
                writeJson(HISTORY_CACHE_KEY, { uid: me()?.id || null, games: histStore.server });
            } catch (_) {
                if (!histStore.server) histStore.server = [];
                histStore.failed = true;
            } finally {
                histStore.loading = null;
            }
        })();
        return histStore.loading;
    }
    function historyGames() {
        const server = histStore.server || [];
        const known = new Set(server.map(g => g.cid).filter(Boolean));
        return [...server, ...localHistory().filter(g => !known.has(g.cid))].sort((a, b) => b.at - a.at);
    }

    /** Итог партии для игрока: win | loss | draw, а вдвоём — white | black | draw. */
    function entryResult(g) {
        if (g.result === 'draw') return 'draw';
        if (g.mode === 'local' || !g.myColor) return g.result;
        return (g.result === 'white') === (g.myColor === 'w') ? 'win' : 'loss';
    }
    function entryOpponent(g) {
        if (g.mode === 'bot') {
            const level = core.botLevel(g.level);
            return { name: tr('botName', { level: tr(`level${level.level}`) }), sub: `~${level.elo}`, avatar: null };
        }
        if (g.mode === 'local') return { name: `${tr('white')} — ${tr('black')}`, sub: '', avatar: null };
        const opp = g.myColor === 'b' ? g.white : g.black;
        return { name: nick(opp?.name) || tr('opponent'), sub: opp?.rating ? String(opp.rating) : '', avatar: opp?.avatar || null };
    }
    function entryDelta(g) {
        if (g.mode !== 'online' || !g.rated) return null;
        const mine = g.myColor === 'b' ? g.black : g.white;
        return Number.isFinite(mine?.delta) ? mine.delta : null;
    }
    function entryReason(g, res) {
        const r = g.reason;
        if (!r) return '';
        if (r === 'resign' || r === 'abandon') {
            if (res !== 'win' && res !== 'loss') return '';
            return tr(r === 'resign' ? (res === 'win' ? 'r_resign' : 'r_resignSelf') : (res === 'win' ? 'r_abandon' : 'r_abandonSelf'));
        }
        return I18N.T[`r_${r}`] ? tr(`r_${r}`) : '';
    }
    function whenText(at) {
        try {
            const d = new Date(at), now = new Date();
            const time = d.toLocaleTimeString(lang(), { hour: '2-digit', minute: '2-digit' });
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            if (at >= today) return `${tr('today')}, ${time}`;
            if (at >= today - 86400000) return `${tr('yesterday')}, ${time}`;
            return d.toLocaleDateString(lang(), { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
        } catch (_) { return ''; }
    }
    const finalBoards = new Map();
    /** Последняя позиция партии — для мини-доски в списке. */
    function finalBoard(g) {
        if (finalBoards.has(g.id)) return finalBoards.get(g.id);
        let board = null;
        try {
            const chess = new Chess(g.startFen || undefined);
            for (const san of g.moves) {
                let m = null;
                try { m = chess.move(san); } catch (_) { m = core.tryMove(chess, san); }
                if (!m) break;
            }
            board = chess.board();
        } catch (_) {}
        finalBoards.set(g.id, board);
        return board;
    }
    function currentSkinId() {
        const skin = SKINS.find(item => item.id === settings.skin);
        return skin && skinUnlocked(skin, ratingCache?.data) ? skin.id : 'classic';
    }
    function miniBoardHtml(g) {
        const board = finalBoard(g);
        const flip = g.myColor === 'b';
        let pieces = '';
        if (board) board.forEach((row, r) => row.forEach((p, f) => {
            if (!p) return;
            const x = flip ? 7 - f : f, y = flip ? 7 - r : r;
            pieces += `<i style="left:${x * 12.5}%;top:${y * 12.5}%;background-image:url('${pieceUrl(p.color + p.type.toUpperCase())}')"></i>`;
        }));
        return `<span class="cs-mini" data-skin="${currentSkinId()}" aria-hidden="true">${pieces}</span>`;
    }
    function historyItemHtml(g) {
        const res = entryResult(g);
        const resText = res === 'win' ? tr('resWin') : res === 'loss' ? tr('loss') : res === 'draw' ? tr('drawResult') : tr(res === 'white' ? 'whiteWins' : 'blackWins');
        const opp = entryOpponent(g);
        const delta = entryDelta(g);
        const tc = core.timeControl(g.tc);
        const meta = [tc ? `${tr(tc.cat)} ${tc.id}` : tr('noTime'), tr('histMoves', { n: Math.ceil(g.moves.length / 2) }), entryReason(g, res)].filter(Boolean).join(' · ');
        const icon = g.mode === 'online' ? ICON.mOnline : g.mode === 'bot' ? ICON.mBot : ICON.mLocal;
        const safeAvatar = opp.avatar && /^https:\/\//i.test(opp.avatar) ? opp.avatar : null;
        const tone = res === 'win' ? 'win' : res === 'loss' ? 'loss' : res === 'draw' ? 'draw' : 'side';
        return `<button type="button" class="cs-hist is-${tone}" data-hist="${esc(g.id)}">
            ${miniBoardHtml(g)}
            <span class="cs-hist-main">
                <span class="cs-hist-top"><b class="cs-hist-res">${esc(resText)}</b><time>${esc(whenText(g.at))}</time></span>
                <span class="cs-hist-opp"><span class="cs-hist-mode" title="${esc(tr(g.mode === 'online' ? 'modeOnline' : g.mode === 'bot' ? 'modeBot' : 'modeLocal'))}">${icon}</span>${safeAvatar ? `<img src="${esc(safeAvatar)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : ''}<span class="cs-hist-name">${esc(opp.name)}</span>${opp.sub ? `<small>${esc(opp.sub)}</small>` : ''}</span>
                <span class="cs-hist-meta">${esc(meta)}</span>
            </span>
            ${delta != null ? `<span class="cs-hist-delta ${delta >= 0 ? 'is-up' : 'is-down'}">${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta)}</span>` : ''}
        </button>`;
    }
    function renderHistory() {
        if (!refs.s_histList || !Chess) return;
        const all = historyGames();
        const filter = ['all', 'online', 'bot', 'local'].includes(prefs.histFilter) ? prefs.histFilter : 'all';
        const list = filter === 'all' ? all : all.filter(g => g.mode === filter);
        refs.s_histRowHint.textContent = all.length ? tr('histCount', { n: all.length }) : tr('histRowHint');
        refs.s_histRefresh.setAttribute('aria-label', tr('refresh'));
        refs.s_histFilters.querySelectorAll('[data-hist-filter]').forEach(b => {
            b.classList.toggle('active', b.dataset.histFilter === filter);
            b.setAttribute('aria-pressed', String(b.dataset.histFilter === filter));
        });
        // счёт: победы, ничьи, поражения (без партий вдвоём — там играешь сам с собой)
        const scored = list.filter(g => g.mode !== 'local');
        const count = { win: 0, draw: 0, loss: 0 };
        for (const g of scored) count[entryResult(g)]++;
        const total = scored.length;
        refs.s_histStats.hidden = !total;
        if (total) {
            const pct = n => `${(n / total * 100).toFixed(2)}%`;
            refs.s_histStats.innerHTML = `
                <div class="cs-hstat is-win"><b>${count.win}</b><small>${esc(tr('histWins'))}</small></div>
                <div class="cs-hstat is-draw"><b>${count.draw}</b><small>${esc(tr('histDraws'))}</small></div>
                <div class="cs-hstat is-loss"><b>${count.loss}</b><small>${esc(tr('histLosses'))}</small></div>
                <div class="cs-hbar" aria-hidden="true"><i class="is-win" style="width:${pct(count.win)}"></i><i class="is-draw" style="width:${pct(count.draw)}"></i><i class="is-loss" style="width:${pct(count.loss)}"></i></div>`;
        }
        const loading = !histStore.server && !!histStore.loading;
        if (loading && !list.length) {
            refs.s_histList.innerHTML = Array.from({ length: 3 }, () => '<div class="cs-hist is-skeleton"><span class="cs-mini"></span><span class="cs-hist-main"><i></i><i></i><i></i></span></div>').join('');
        } else if (!list.length) {
            refs.s_histList.innerHTML = `<div class="cs-history-empty"><i style="background-image:url('${pieceUrl('wN')}')"></i><b>${esc(tr('histEmpty'))}</b><small>${esc(tr('histEmptyHint'))}</small></div>`;
        } else {
            refs.s_histList.innerHTML = list.slice(0, histShown).map(historyItemHtml).join('');
        }
        refs.s_histMore.hidden = list.length <= histShown;
    }

    /** Партия из истории: на доске, с ходами, разбором и итогом; часов и ходов нет. */
    function openArchived(entry) {
        if (!entry || !Array.isArray(entry.moves) || !entry.moves.length) return;
        let online = null;
        if (entry.mode === 'online') {
            const mine = entry.myColor === 'b' ? entry.black : entry.white;
            const opp = entry.myColor === 'b' ? entry.white : entry.black;
            const delta = entryDelta(entry);
            online = {
                roomCode: null, archived: true,
                opponent: { name: opp?.name || '', avatar: opp?.avatar || null, rating: opp?.rating ?? null },
                myRating: mine?.rating ?? null,
                ratingChange: delta != null && Number.isFinite(mine?.rating) ? { rating: mine.rating + delta, delta } : null,
                clock: null, clockAt: 0, serverNow: () => Date.now(), firstMoveDeadline: null,
                drawSent: false, pending: false, away: null,
            };
        }
        haptic('light');
        closeSheet();
        openScreen();
        newGame({ mode: entry.mode, myColor: entry.myColor || 'w', level: entry.level || 3, tcId: entry.tc || 'none', moves: entry.moves, startFen: entry.startFen || null, online, orientation: entry.myColor || 'w', archive: entry });
        Sound.play('start', 0.5);
    }

    /* ---------- запуск ---------- */
    function init() {
        if (ready) return ready;
        ready = import(`${BASE}vendor/chess.js`).then(module => {
            Chess = module.Chess;
            buildScreen();
            buildSheet();
            bindSocket();
            hintOn = isOwner() && localStorage.getItem(HINT_KEY) === '1';
            setupIsolation();
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
            if (game) { afterChange(); if (ui.dialog?.kind === 'result') showResult(); }
        },
        /** Приглашение по ссылке startapp=cs_12345. */
        joinInvite(code) { if (/^\d{5}$/.test(String(code))) joinRoom(String(code)); },
        /** chess_start, пришедший до загрузки модуля (возврат в партию). */
        handleStart(data) { if (data && data.roomCode) handleStart(data); },
        // для отладки и тестов
        _state: () => ({ game, view, ui }),
    };
    window.SparkChess = api;
})();
