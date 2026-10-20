/* Spark Chess: партия на доске, бот (Stockfish), игра вдвоём, онлайн и
   подсказка лучшего хода для владельца. Подключается лениво из index.html,
   после chess-core.js и chess-i18n.js; правила — chess.js (ES-модуль). */
(function () {
    'use strict';
    if (window.SparkChess) return;

    const BASE = new URL('.', document.currentScript?.src || location.href).href;
    const core = window.SparkChessCore;
    const I18N = window.SparkChessI18n;
    const OWNER_ID = '1482228376';
    const SAVE_KEY = 'chess_saved_game';
    const SETTINGS_KEY = 'chess_settings';
    const PREFS_KEY = 'chess_prefs';
    const STATS_KEY = 'chess_stats';
    const HINT_KEY = 'chess_admin_hint';
    const PIECE_NAMES = 'KQRBNP';
    const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let Chess = null;
    let ready = null;

    /* ---------- окружение приложения ---------- */
    const tg = window.Telegram?.WebApp;
    const lang = () => (typeof currentLang === 'string' ? currentLang : 'ru');
    const tr = (key, vars) => I18N.t(lang(), key, vars);
    const esc = value => String(value == null ? '' : value).replace(/[&<>"'`]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[ch]));
    const me = () => tg?.initDataUnsafe?.user || null;
    const isOwner = () => String(me()?.id || '') === OWNER_ID;
    const myName = () => (typeof tgName === 'function' ? tgName(me()) : (me()?.first_name || tr('you')));
    const pieceUrl = code => `${BASE}pieces/${code}.svg`;
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
        back: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
        gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
        bulb: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z"/></svg>',
        prev: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
        next: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
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
    };

    /* ---------- настройки ---------- */
    const settings = Object.assign({ sound: true, coords: true, showMoves: true, autoFlip: false }, readJson(SETTINGS_KEY, {}));
    const prefs = Object.assign({ tab: 'bot', level: 3, color: 'w', botTc: 'none', localTc: 'none', onlineTc: core.DEFAULT_ONLINE_TC }, readJson(PREFS_KEY, {}));
    const saveSettings = () => writeJson(SETTINGS_KEY, settings);
    const savePrefs = () => writeJson(PREFS_KEY, prefs);

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
            this.loading = Promise.all(this.names.map(name => fetch(`${BASE}sounds/${name}.mp3`)
                .then(r => r.arrayBuffer())
                .then(data => new Promise((resolve, reject) => this.ctx.decodeAudioData(data, resolve, reject)))
                .then(buffer => { this.buffers[name] = buffer; })
                .catch(() => {})));
            return this.loading;
        },
        play(name, volume = 1) {
            if (!settings.sound || !this.ctx || !this.buffers[name]) return;
            try {
                if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
                const source = this.ctx.createBufferSource();
                const gain = this.ctx.createGain();
                source.buffer = this.buffers[name];
                source.playbackRate.value = name.startsWith('move') ? 0.96 + Math.random() * 0.08 : 1;
                gain.gain.value = volume;
                source.connect(gain).connect(this.ctx.destination);
                source.start();
            } catch (_) {}
        },
    };

    function playMoveSound(move, inCheck) {
        if (move.promotion) { Sound.play('move'); setTimeout(() => Sound.play('promote', 0.8), 90); }
        else if (move.flags.includes('k') || move.flags.includes('q')) { Sound.play('castle'); setTimeout(() => Sound.play('move2', 0.9), 110); }
        else if (move.captured) Sound.play('capture');
        else Sound.play(Math.random() < 0.5 ? 'move' : 'move2');
        if (inCheck) setTimeout(() => Sound.play('check', 0.75), 70);
    }

    /* ---------- Stockfish в Web Worker ---------- */
    class Engine {
        constructor() {
            this.listeners = new Set();
            this.queue = Promise.resolve();
            this.skill = null;
            this.worker = new Worker(`${BASE}engine/stockfish.js`);
            this.worker.onmessage = event => {
                const line = typeof event.data === 'string' ? event.data : String(event.data || '');
                for (const fn of [...this.listeners]) fn(line);
            };
            this.ready = new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('engine timeout')), 20000);
                this.worker.onerror = error => { clearTimeout(timer); reject(error instanceof Error ? error : new Error('engine failed')); };
                this.wait('uci', line => line === 'uciok')
                    .then(() => { this.send('setoption name Hash value 16'); return this.wait('isready', line => line === 'readyok'); })
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
        search({ fen, skill = 20, depth = null, movetime = null, onInfo = null }) {
            const job = this.queue.then(() => this.ready).then(() => new Promise(resolve => {
                if (this.skill !== skill) { this.send(`setoption name Skill Level value ${skill}`); this.skill = skill; }
                const turn = fen.split(' ')[1] || 'w';
                let score = null;
                const fn = line => {
                    if (line.startsWith('info') && line.includes(' pv ')) {
                        const s = line.match(/ score (cp|mate) (-?\d+)/);
                        const pv = line.match(/ pv (.+)$/);
                        const d = line.match(/ depth (\d+)/);
                        if (s) {
                            const sign = turn === 'w' ? 1 : -1;
                            score = { type: s[1], value: Number(s[2]) * sign, depth: d ? Number(d[1]) : 0 };
                            if (onInfo && pv) onInfo({ score, move: pv[1].split(' ')[0] });
                        }
                    } else if (line.startsWith('bestmove')) {
                        this.listeners.delete(fn);
                        const best = line.split(' ')[1];
                        resolve({ bestmove: best && best !== '(none)' ? best : null, score });
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
    const engines = { bot: null, hint: null };
    function engine(kind) {
        if (!engines[kind]) {
            engines[kind] = new Engine();
            engines[kind].ready.catch(() => { engines[kind]?.terminate(); engines[kind] = null; });
        }
        return engines[kind];
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
                <div class="cs-player" data-ref="topPlayer"></div>
                <div class="cs-board-wrap" data-ref="frame">
                    <div class="cs-coords cs-files top" data-ref="filesTop" aria-hidden="true"></div>
                    <div class="cs-coords cs-files bottom" data-ref="filesBottom" aria-hidden="true"></div>
                    <div class="cs-coords cs-ranks left" data-ref="ranksLeft" aria-hidden="true"></div>
                    <div class="cs-coords cs-ranks right" data-ref="ranksRight" aria-hidden="true"></div>
                    <div class="cs-board" data-ref="board">
                        <div class="cs-squares" data-ref="squares"></div>
                        <div class="cs-layer" data-ref="marks"></div>
                        <div class="cs-pieces" data-ref="pieces"></div>
                        <svg class="cs-arrows" data-ref="arrows" viewBox="0 0 8 8" preserveAspectRatio="none" aria-hidden="true"></svg>
                    </div>
                </div>
                <div class="cs-player" data-ref="bottomPlayer"></div>
                <div class="cs-moves">
                    <button class="cs-nav" type="button" data-act="prev" data-ref="prevBtn">${ICON.prev}</button>
                    <div class="cs-movelist" data-ref="moveList"></div>
                    <button class="cs-nav" type="button" data-act="next" data-ref="nextBtn">${ICON.next}</button>
                </div>
                <div class="cs-actions" data-ref="actions"></div>
            </div>
            <div class="cs-banner" data-ref="banner"><p></p></div>
            <div class="cs-sheet-scrim" data-ref="scrim"></div>
            <div class="cs-sheet" data-ref="sheet" role="dialog" aria-modal="true"></div>`;
        refs = {};
        screen.querySelectorAll('[data-ref]').forEach(el => { refs[el.dataset.ref] = el; });
        screen.addEventListener('click', onScreenClick);
        refs.scrim.addEventListener('click', () => { if (ui.dialog?.dismissable !== false) closeDialog(); });
        bindBoard();
        window.addEventListener('resize', () => { if (screen.classList.contains('visible')) layout(); });
        if (typeof updateBackgroundPatterns === 'function') updateBackgroundPatterns();
        applyTexts(screen);
    }

    function applyTexts(root) {
        root.querySelectorAll('[data-t]').forEach(el => { el.textContent = tr(el.dataset.t); });
    }

    /** Размер доски: сколько помещается между шапкой и кнопками. */
    function layout() {
        const main = refs.main;
        if (!main) return;
        const style = getComputedStyle(main);
        const gap = parseFloat(style.rowGap) || 10;
        let others = 0;
        for (const child of main.children) if (!child.classList.contains('cs-board-wrap')) others += child.offsetHeight;
        const width = main.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const height = main.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - others - gap * (main.children.length - 1);
        // Рамка вокруг доски: поля с буквами и цифрами одинаковые со всех сторон.
        const avail = Math.min(width, height, 600);
        const margin = settings.coords ? Math.max(15, Math.min(22, Math.round(avail * 0.046))) : 9;
        const size = Math.max(200, Math.floor((avail - 2 * margin) / 8) * 8);
        view.size = size;
        screen.style.setProperty('--cs-size', `${size}px`);
        screen.style.setProperty('--cs-margin', `${margin}px`);
        screen.style.setProperty('--cs-outer', `${size + 2 * margin}px`);
        const moves = screen.querySelector('.cs-moves').getBoundingClientRect().top;
        screen.style.setProperty('--cs-banner-top', `${Math.max(8, moves - screen.getBoundingClientRect().top - 4)}px`);
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
                html += `<div class="cs-sq${dark ? ' d' : ''}"></div>`;
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

    /* ---------- фигуры ---------- */
    function createPiece(code, sq) {
        const el = document.createElement('div');
        el.className = 'cs-pc';
        el.dataset.code = code;
        el.innerHTML = `<i style="background-image:url('${pieceUrl(code)}')"></i>`;
        el.style.transform = sqTf(sq);
        refs.pieces.appendChild(el);
        return el;
    }
    function setPieceCode(el, code, animate) {
        el.dataset.code = code;
        el.firstChild.style.backgroundImage = `url('${pieceUrl(code)}')`;
        if (animate && !REDUCED_MOTION) { el.classList.remove('promoted'); void el.offsetWidth; el.classList.add('promoted'); }
    }
    function removePiece(el, animate, delay = 0) {
        if (!animate || REDUCED_MOTION) { el.remove(); return; }
        setTimeout(() => { el.classList.add('vanish'); setTimeout(() => el.remove(), 260); }, delay);
    }
    function slide(el, sq, { dropped = false, delay = 0 } = {}) {
        const to = sqTf(sq);
        const from = el.style.transform || to;
        el.style.transform = to;
        el.getAnimations?.().forEach(a => a.cancel());
        if (REDUCED_MOTION || from === to || !el.animate) return 0;
        const [x0, y0] = (from.match(/-?[\d.]+/g) || [0, 0]).map(Number);
        const [x1, y1] = sqXY(sq);
        const distance = Math.hypot(x1 - x0 / 100, y1 - y0 / 100);
        const duration = dropped ? 110 : Math.round(Math.min(360, 170 + 55 * Math.sqrt(distance)));
        el.classList.add('moving');
        const anim = el.animate([{ transform: from }, { transform: to }], { duration, delay, easing: 'cubic-bezier(.2,.85,.25,1)', fill: 'backwards' });
        if (!dropped) {
            const lift = el.dataset.code[1] === 'N' ? 1.16 : 1.1;
            el.firstChild.animate([{ transform: 'scale(1)' }, { transform: `scale(${lift})`, offset: 0.45 }, { transform: 'scale(1)' }], { duration, delay, easing: 'ease-in-out' });
        }
        anim.onfinish = anim.oncancel = () => el.classList.remove('moving');
        return duration + delay;
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
                if (animate) slide(el, sq); else { el.getAnimations?.().forEach(a => a.cancel()); el.style.transform = sqTf(sq); }
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

    /** Живой ход: фигура едет, взятая растворяется, ладья в рокировке едет следом. */
    function animateMove(move, { dropped = false } = {}) {
        const els = view.els;
        const el = els.get(move.from);
        if (!el) return 0;
        el.classList.remove('selected', 'dragging');
        let captureSq = null;
        if (move.flags.includes('e')) captureSq = move.to[0] + move.from[1];
        else if (move.captured) captureSq = move.to;
        let duration = 0;
        if (captureSq) {
            const victim = els.get(captureSq);
            if (victim && victim !== el) { els.delete(captureSq); removePiece(victim, true, dropped ? 0 : 110); }
        }
        els.delete(move.from);
        els.set(move.to, el);
        duration = slide(el, move.to, { dropped });
        if (move.flags.includes('k') || move.flags.includes('q')) {
            const rank = move.from[1];
            const [rf, rt] = move.flags.includes('k') ? [`h${rank}`, `f${rank}`] : [`a${rank}`, `d${rank}`];
            const rook = els.get(rf);
            if (rook) { els.delete(rf); els.set(rt, rook); slide(rook, rt, { delay: 70 }); }
        }
        if (move.promotion) {
            const code = move.color + move.promotion.toUpperCase();
            el.dataset.code = code;
            setTimeout(() => setPieceCode(el, code, true), Math.max(0, duration - 40));
        }
        return duration;
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
        const hint = activeHint();
        if (hint) { list.push([hint.from, 'hint']); list.push([hint.to, 'hint']); }
        if (ui.selected && settings.showMoves) {
            const seen = new Set();
            for (const m of ui.targets) {
                if (seen.has(m.to)) continue;
                seen.add(m.to);
                const capture = !!(m.captured || chess.get(m.to));
                list.push([m.to, `${capture ? 'cap' : 'dot'}${ui.preMode ? ' is-pre' : ''}`]);
            }
        }
        if (ui.hover) list.push([ui.hover, 'hover']);
        refs.marks.innerHTML = list.map(([sq, cls]) => `<div class="cs-mark ${cls}" style="transform:${sqTf(sq)}"></div>`).join('');
        renderArrow(hint);
    }

    function findKing(chess, color) {
        for (const row of chess.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
        return null;
    }

    function renderArrow(hint) {
        if (!refs.arrows) return;
        if (!hint) { refs.arrows.innerHTML = ''; return; }
        const [x0, y0] = sqXY(hint.from), [x1, y1] = sqXY(hint.to);
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
        refs.arrows.innerHTML = `<g class="cs-arrow" fill="none" stroke="var(--cs-hint)" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="${line}" stroke-width="0.17"/><polygon points="${head}" fill="var(--cs-hint)" stroke-width="0.04"/></g>`;
        requestAnimationFrame(() => refs.arrows.querySelector('.cs-arrow')?.classList.add('show'));
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
        board.addEventListener('pointercancel', () => cancelDrag(true));
        board.addEventListener('contextmenu', event => { event.preventDefault(); clearPremove(); clearSelection(); });
    }

    function onPointerDown(event) {
        if (!game || event.button > 0) return;
        Sound.unlock();
        const sq = pointSq(event);
        if (!sq) return;
        if (game.view != null) { goLive(); return; }
        if (ui.promo) return;
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
                ui.drag = { sq, el, x: event.clientX, y: event.clientY, active: false, wasSelected, pointerId: event.pointerId };
                try { refs.board.setPointerCapture(event.pointerId); } catch (_) {}
            }
            return;
        }
        if (game.premove) { clearPremove(); }
        clearSelection();
    }

    function onPointerMove(event) {
        const drag = ui.drag;
        if (!drag || event.pointerId !== drag.pointerId) return;
        if (!drag.active) {
            if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
            drag.active = true;
            drag.el.classList.remove('selected');
            drag.el.classList.add('dragging');
        }
        const rect = refs.board.getBoundingClientRect();
        const cell = rect.width / 8;
        const lift = event.pointerType === 'touch' ? cell * 0.45 : 0;
        const px = (event.clientX - rect.left) / cell - 0.5;
        const py = (event.clientY - rect.top - lift) / cell - 0.5;
        drag.el.style.transform = tf(Math.max(-0.4, Math.min(7.4, px)), Math.max(-0.6, Math.min(7.4, py)));
        const over = pointSq({ clientX: event.clientX, clientY: event.clientY - lift });
        const hover = over && ui.targets.some(m => m.to === over) ? over : null;
        if (hover !== ui.hover) { ui.hover = hover; renderMarks(); if (hover) haptic('select'); }
    }

    function onPointerUp(event) {
        const drag = ui.drag;
        if (!drag || event.pointerId !== drag.pointerId) return;
        ui.drag = null;
        try { refs.board.releasePointerCapture(event.pointerId); } catch (_) {}
        if (!drag.active) {
            if (drag.wasSelected) clearSelection();
            return;
        }
        drag.el.classList.remove('dragging');
        const lift = event.pointerType === 'touch' ? refs.board.getBoundingClientRect().width / 8 * 0.45 : 0;
        const target = pointSq({ clientX: event.clientX, clientY: event.clientY - lift });
        ui.hover = null;
        if (target && target !== drag.sq && ui.targets.some(m => m.to === target)) {
            userMove(drag.sq, target, { dropped: true });
        } else {
            slide(drag.el, drag.sq, { dropped: true });
            if (ui.selected === drag.sq) drag.el.classList.add('selected');
            renderMarks();
        }
    }

    function cancelDrag(restore) {
        const drag = ui.drag;
        ui.drag = null;
        ui.hover = null;
        if (drag?.active && restore) { drag.el.classList.remove('dragging'); slide(drag.el, drag.sq, { dropped: true }); }
    }

    function controls(color) {
        if (!game || game.over) return false;
        return game.mode === 'local' || color === game.myColor;
    }
    function canMoveNow() {
        return !!game && !game.over && game.view == null && !ui.promo && controls(game.chess.turn()) && !game.botBusy && !(game.mode === 'online' && game.online.pending);
    }
    function canPremove() {
        return !!game && !game.over && game.view == null && game.mode !== 'local' && game.chess.turn() !== game.myColor;
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
        if (el) { el.classList.remove('selected'); void el.offsetWidth; el.classList.add('selected'); }
        haptic('select');
        renderMarks();
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

    function askPromotion(from, to, dropped) {
        const color = game.chess.turn();
        const [x, y] = sqXY(to);
        const down = y === 0;
        const el = view.els.get(from);
        if (el && dropped) el.style.transform = sqTf(to);
        const promo = document.createElement('div');
        promo.className = 'cs-promo';
        const col = document.createElement('div');
        col.className = 'cs-promo-col';
        col.style.left = `${x * 12.5}%`;
        col.style[down ? 'top' : 'bottom'] = '0';
        col.style.transformOrigin = down ? 'top' : 'bottom';
        const kinds = down ? ['q', 'n', 'r', 'b'] : ['b', 'r', 'n', 'q'];
        col.innerHTML = kinds.map(k => `<button type="button" data-promo="${k}" aria-label="${k}"><i style="background-image:url('${pieceUrl(color + k.toUpperCase())}')"></i></button>`).join('');
        promo.appendChild(col);
        refs.board.appendChild(promo);
        requestAnimationFrame(() => promo.classList.add('show'));
        ui.promo = { el: promo, from, to };
        clearSelection();
        promo.addEventListener('pointerdown', event => {
            event.stopPropagation();
            const button = event.target.closest('[data-promo]');
            const pending = ui.promo;
            ui.promo = null;
            promo.remove();
            if (button && pending) {
                playMove({ from: pending.from, to: pending.to, promotion: button.dataset.promo }, { byUser: true, dropped: true });
            } else if (el) {
                slide(el, from, { dropped: true });
            }
        });
    }

    /* ---------- ход ---------- */
    function playMove(raw, { byUser = false, dropped = false, quiet = false } = {}) {
        if (!game || game.over) return null;
        const move = core.tryMove(game.chess, raw);
        if (!move) return null;
        game.moves.push(move);
        clearSelection(false);
        if (game.view != null) { game.view = null; syncPieces(positionMap(game.chess), { animate: true }); }
        else animateMove(move, { dropped });
        if (game.clock) pressOfflineClock(move.color);
        const check = game.chess.inCheck();
        if (!quiet) {
            playMoveSound(move, check);
            haptic(move.captured ? 'medium' : 'light');
            if (check) setTimeout(() => haptic('warning'), 80);
        }
        playtime('note');
        game.hint = null;
        afterChange();
        if (game.mode === 'online' && byUser) {
            game.online.pending = true;
            emit('chess_move', { roomCode: game.online.roomCode, ply: game.moves.length - 1, move: { from: move.from, to: move.to, promotion: move.promotion } });
            setTimeout(() => { if (game?.online) game.online.pending = false; }, 1500);
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

    function afterChange() {
        renderMarks();
        renderMoveList();
        renderPlayers();
        renderStatus();
        renderActions();
        scheduleHint();
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
        if (!hintOn || !isOwner() || !game || game.over || game.view != null || !game.hint) return null;
        if (game.hint.fen !== game.chess.fen() || !game.hint.move) return null;
        if (!controls(game.chess.turn())) return null;
        return game.hint.move;
    }
    let hintTimer = null;
    function scheduleHint() {
        clearTimeout(hintTimer);
        if (!hintOn || !isOwner() || !game || game.over) { renderEval(null); return; }
        hintTimer = setTimeout(runHint, 120);
    }
    async function runHint() {
        if (!hintOn || !game || game.over) return;
        const fen = game.chess.fen();
        const token = ++hintToken;
        try {
            const eng = engine('hint');
            eng.stop();
            const result = await eng.search({
                fen, skill: 20, depth: 18, movetime: 1200,
                onInfo: info => {
                    if (token !== hintToken || !game || game.chess.fen() !== fen) return;
                    const move = core.normalizeMove(info.move);
                    if (info.score.depth >= 8 && move) { game.hint = { fen, move, score: info.score }; renderMarks(); renderEval(info.score); }
                },
            });
            if (token !== hintToken || !game || game.chess.fen() !== fen) return;
            const move = result.bestmove && core.normalizeMove(result.bestmove);
            game.hint = { fen, move, score: result.score };
            renderMarks();
            renderEval(result.score);
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
        pill.classList.add('show');
    }
    function setHint(on) {
        hintOn = !!on && isOwner();
        try { localStorage.setItem(HINT_KEY, hintOn ? '1' : '0'); } catch (_) {}
        refs.hintBtn?.classList.toggle('is-on', hintOn);
        if (!hintOn) { hintToken++; if (game) game.hint = null; engines.hint?.stop(); renderMarks(); renderEval(null); }
        else scheduleHint();
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
    function tickClocks() {
        if (!game || !refs.topPlayer) return;
        const values = clockValues();
        for (const [slot, color] of [['topPlayer', other(view.orientation)], ['bottomPlayer', view.orientation]]) {
            const el = refs[slot].querySelector('.cs-clock');
            if (!el) continue;
            if (!values) { el.hidden = true; continue; }
            el.hidden = false;
            const left = values[color];
            el.textContent = formatClock(left);
            el.classList.toggle('is-running', values.running === color);
            const low = values.running === color && left < Math.min(20000, (game.tcBase || 60000) * 0.1 + 1);
            el.classList.toggle('is-low', low);
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
        if (game.mode === 'local') return { name: tr(color === 'w' ? 'white' : 'black'), sub: '', avatar: null };
        if (color === game.myColor) {
            const sub = game.mode === 'online' && game.online.myRating ? String(game.online.myRating) : '';
            return { name: myName(), sub, avatar: me()?.photo_url || null };
        }
        if (game.mode === 'bot') {
            const level = core.botLevel(game.level);
            return { name: tr('botName', { level: tr(`level${level.level}`) }), sub: `~${level.elo}`, avatar: null, bot: true };
        }
        const opp = game.online.opponent || {};
        return { name: opp.name || tr('opponent'), sub: opp.rating ? String(opp.rating) : '', avatar: opp.avatar || null, away: !!game.online.away };
    }

    function renderPlayers() {
        if (!game) return;
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
            el.innerHTML = `
                <div class="cs-ava${turn ? ' is-turn' : ''}${info.away ? ' is-away' : ''}">${avatar}</div>
                <div class="cs-pinfo">
                    <div class="cs-pname"><span>${esc(info.name)}</span>${info.sub ? `<small>${esc(info.sub)}</small>` : ''}</div>
                    <div class="cs-captured">${capHtml}</div>
                </div>
                <div class="cs-clock" hidden></div>`;
        }
        tickClocks();
    }

    function figurine(move) {
        const letter = move.san[0];
        if (!PIECE_NAMES.includes(letter) || letter === 'P' || move.san.startsWith('O-O')) return esc(move.san);
        return `<i style="background-image:url('${pieceUrl(move.color + letter)}')"></i>${esc(move.san.slice(1))}`;
    }

    function renderMoveList() {
        if (!game) return;
        const current = game.view == null ? game.moves.length : game.view;
        let html = '';
        game.moves.forEach((m, i) => {
            if (m.color === 'w' || i === 0) html += `<span class="cs-mn">${Math.floor(i / 2) + 1}.${m.color === 'b' && i === 0 ? '…' : ''}</span>`;
            html += `<button type="button" class="cs-mv${i + 1 === current ? ' is-current' : ''}" data-ply="${i + 1}">${figurine(m)}</button>`;
        });
        refs.moveList.innerHTML = html;
        const active = refs.moveList.querySelector('.is-current');
        if (active) {
            const list = refs.moveList;
            const left = active.offsetLeft - list.clientWidth / 2 + active.offsetWidth / 2;
            list.scrollTo({ left, behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
        }
        refs.prevBtn.disabled = current <= 0;
        refs.nextBtn.disabled = current >= game.moves.length;
    }

    function renderStatus() {
        if (!game) return;
        refs.title.textContent = gameTitle();
        const status = refs.status;
        status.classList.remove('is-alert');
        if (game.view != null) { status.textContent = tr('reviewing', { n: game.view }); return; }
        if (game.over) { status.textContent = resultTitle(game.over); return; }
        const turn = game.chess.turn();
        if (game.mode === 'bot' && game.botBusy) status.textContent = tr('botThinking');
        else if (game.mode === 'local') status.textContent = tr(turn === 'w' ? 'whiteToMove' : 'blackToMove');
        else status.textContent = tr(controls(turn) ? 'yourMove' : 'theirMove');
        if (game.chess.inCheck()) { status.textContent = `${tr('check')} ${status.textContent}`; status.classList.add('is-alert'); }
        updateFirstMoveNotice();
    }

    function gameTitle() {
        const tc = game.tc ? `${tr(game.tc.cat)} ${game.tc.id}` : '';
        if (game.mode === 'bot') return [tr('modeBot'), tc].filter(Boolean).join(' · ');
        if (game.mode === 'local') return [tr('modeLocal'), tc].filter(Boolean).join(' · ');
        return tc || tr('modeOnline');
    }

    function renderActions() {
        if (!game) return;
        const buttons = [];
        const add = (act, icon, label, opts = {}) => buttons.push(`<button type="button" class="cs-act${opts.danger ? ' is-danger' : ''}" data-act="${act}"${opts.disabled ? ' disabled' : ''}>${icon}<span>${esc(label)}</span></button>`);
        if (game.over) {
            if (game.mode === 'online') add('rematch', ICON.rematch, tr('rematch'));
            else add('again', ICON.plus, tr('newGame'));
            add('flip', ICON.flip, tr('flip'));
            add('result', ICON.trophy, tr('resultBtn'));
        } else if (game.mode === 'online') {
            add('flip', ICON.flip, tr('flip'));
            add('draw', ICON.draw, tr('offerDraw'), { disabled: game.moves.length < 2 || game.online.drawSent });
            if (game.moves.length < 2) add('resign', ICON.abort, tr('abort'), { danger: true });
            else add('resign', ICON.flag, tr('resign'), { danger: true });
        } else {
            add('undo', ICON.undo, tr('takeback'), { disabled: !game.moves.length });
            add('flip', ICON.flip, tr('flip'));
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
        clearSelection(false);
        game.view = target === max ? null : target;
        const chess = viewChess();
        if (Math.abs(target - prev) === 1 && target > prev) {
            const m = game.moves[target - 1];
            animateMove(m);
            playMoveSound(m, chess.inCheck());
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
    }
    function goLive() { if (game?.view != null) setView(game.moves.length); }

    function setOrientation(color) {
        if (view.orientation === color) return;
        view.orientation = color;
        buildSquares();
        for (const [sq, el] of view.els) slide(el, sq);
        renderMarks();
        renderPlayers();
    }

    /* ---------- начало и конец партии ---------- */
    function newGame({ mode, myColor = 'w', level = 3, tcId = 'none', moves = [], clock = null, online = null, orientation = null, startFen = null }) {
        cancelBot();
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
            clock: mode !== 'online' && tc ? core.createClock(tc) : null,
            online,
            id: Date.now(),
        };
        if (game.clock && clock) {
            game.clock.left.w = Number(clock.w) || tc.base;
            game.clock.left.b = Number(clock.b) || tc.base;
            if (played.length >= 2) { game.clock.running = chess.turn(); game.clock.since = Date.now(); }
        }
        lowTimeWarned = false;
        view.orientation = orientation || (mode === 'local' ? 'w' : myColor);
        buildSquares();
        rebuildPieces(chess);
        refs.board.classList.remove('is-review', 'is-over');
        clearSelection(false);
        afterChange();
        startClockLoop();
        if (mode === 'bot' && chess.turn() !== game.myColor) setTimeout(botMove, 500);
        if (mode !== 'online') saveOffline();
        return game;
    }

    function openScreen() {
        if (!screen.classList.contains('visible')) {
            screen.classList.add('visible');
            playtime('begin');
        }
        requestAnimationFrame(() => { layout(); renderMarks(); });
        setTimeout(layout, 380);
        refs.hintBtn.hidden = !isOwner();
        refs.hintBtn.classList.toggle('is-on', hintOn);
    }

    function closeScreen() {
        cancelBot();
        hintToken++;
        engines.hint?.stop();
        clearInterval(clockTimer);
        clockTimer = null;
        closeDialog(true);
        hideBanner();
        if (ui.promo) { ui.promo.el.remove(); ui.promo = null; }
        cancelDrag(false);
        screen.classList.remove('visible');
        playtime('stop');
        if (game?.mode === 'online' && game.over) emit('chess_leave', {});
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
        const result = myResult(outcome);
        setTimeout(() => {
            if (result === 'win') { Sound.play('win'); haptic('success'); celebrate(); }
            else if (result === 'loss') { Sound.play('lose'); haptic('error'); }
            else { Sound.play('draw'); haptic('warning'); }
        }, 180);
        afterChange();
        tickClocks();
        setTimeout(() => { if (game?.over === outcome || game?.over?.reason === outcome.reason) showResult(); }, outcome.reason === 'checkmate' ? 900 : 450);
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
        if (!game || game.mode === 'online' || game.over) return;
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

        socket.on('connect', () => {
            if (game?.mode === 'online' && !game.over) socket.emit('chess_rejoin');
        });
        socket.on('chess_rooms', data => renderRooms(Array.isArray(data?.rooms) ? data.rooms : []));
        socket.on('chess_created', data => showWait(data));
        socket.on('chess_error', data => {
            const key = `e_${data?.code}`;
            if (data?.code === 'drawUnavailable') toast(tr('drawUnavailable'), 'error');
            else toast(I18N.T[key] ? tr(key) : tr('e_network'), 'error');
            if (data?.code !== 'drawUnavailable' && data?.code !== 'alreadyPlaying') hideWait();
        });
        socket.on('chess_start', handleStart);
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
        socket.on('chess_moved_elsewhere', data => { if (forMe(data)) closeScreen(); });
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
        const name = game.online.opponent?.name || tr('opponent');
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
        refs.sheet.innerHTML = html;
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

    function confirmDialog({ title, text, okLabel, okDanger = true, onOk }) {
        openDialog('confirm', `
            <h2>${esc(title)}</h2><p>${esc(text)}</p>
            <div class="cs-sheet-actions">
                <button type="button" class="btn-main${okDanger ? ' is-danger' : ''}" data-dlg="ok">${esc(okLabel)}</button>
                <button type="button" class="btn-secondary" data-dlg="cancel">${esc(tr('stay'))}</button>
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
        const primary = game.mode === 'online'
            ? `<button type="button" class="btn-main" data-dlg="rematch">${esc(tr('rematch'))}</button>`
            : `<button type="button" class="btn-main" data-dlg="again">${esc(tr(game.mode === 'bot' ? 'playAgain' : 'newGame'))}</button>`;
        openDialog('result', `
            <div class="cs-result-icon ${iconClass}">${icon}</div>
            <h2>${esc(resultTitle(outcome))}</h2>
            <p data-ref="resultReason">${esc(reasonText(outcome))}</p>
            <div class="cs-rating-chip" data-ref="resultRating" hidden></div>
            <p data-ref="resultNote" hidden></p>
            <div class="cs-sheet-actions">
                ${primary}
                <button type="button" class="btn-secondary" data-dlg="review">${esc(tr('review'))}</button>
                <button type="button" class="btn-secondary" data-dlg="menu">${esc(tr('menu'))}</button>
            </div>`);
        const sheet = refs.sheet;
        sheet.querySelector('[data-dlg="review"]').onclick = () => closeDialog();
        sheet.querySelector('[data-dlg="menu"]').onclick = () => { closeDialog(true); closeScreen(); openSheet(); };
        sheet.querySelector('[data-dlg="again"]')?.addEventListener('click', () => { closeDialog(); playAgain(); });
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
        chip.innerHTML = `${esc(tr('rating'))} <b>${change.rating}</b> <b class="${change.delta >= 0 ? 'up' : 'down'}">${delta}</b>`;
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

    function showSettings() {
        const rows = [['sound', 'sound'], ['coords', 'coordinates'], ['showMoves', 'showMoves']];
        if (game?.mode === 'local') rows.push(['autoFlip', 'autoFlip']);
        openDialog('settings', `
            <h2>${esc(tr('settings'))}</h2>
            <div class="cs-settings" style="margin-top:12px">
                ${rows.map(([key, label]) => `<div class="cs-toggle-row"><span>${esc(tr(label))}</span><button type="button" class="cs-switch${settings[key] ? ' on' : ''}" data-setting="${key}" role="switch" aria-checked="${!!settings[key]}" aria-label="${esc(tr(label))}"></button></div>`).join('')}
            </div>
            <div class="cs-sheet-actions">
                ${game?.moves.length ? `<button type="button" class="btn-secondary" data-dlg="pgn">${esc(tr('copyPgn'))}</button>` : ''}
                <button type="button" class="btn-secondary" data-dlg="close">${esc(tr('backToGame'))}</button>
            </div>`);
        refs.sheet.querySelector('[data-dlg="pgn"]')?.addEventListener('click', copyPgn);
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
            };
        });
        refs.sheet.querySelector('[data-dlg="close"]').onclick = () => closeDialog();
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
        const button = event.target.closest('[data-act]');
        if (!button || button.disabled) return;
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
            case 'flip': haptic('light'); return setOrientation(other(view.orientation));
            case 'undo': return takeback();
            case 'draw': return offerDraw();
            case 'resign': return resign();
            case 'again': return playAgain();
            case 'rematch': return emit('chess_rematch', { roomCode: game.online.roomCode }) && toast(tr('rematchWaiting'));
            case 'result': return showResult();
            default: return undefined;
        }
    }

    function requestLeave() {
        if (ui.promo) { ui.promo.el.remove(); ui.promo = null; syncPieces(positionMap(game.chess), { animate: true }); return; }
        if (ui.dialog) { closeDialog(); return; }
        if (!game) { closeScreen(); return; }
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
        cancelBot();
        let undo = 1;
        if (game.mode === 'bot' && game.chess.turn() === game.myColor && game.moves.length >= 2) undo = 2;
        if (game.mode === 'bot' && game.chess.turn() === game.myColor && game.moves.length === 1) undo = 1;
        for (let i = 0; i < undo; i++) { game.chess.undo(); game.moves.pop(); }
        game.view = null;
        game.premove = null;
        clearSelection(false);
        syncPieces(positionMap(game.chess), { animate: true });
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
            <div class="ui-sheet-heading"><h2 data-t="title"></h2><button class="ui-close" type="button" data-sheet="close" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button></div>
            <div class="segment-control cs-tabs" role="tablist">
                <div class="segment-glider" data-ref="glider"></div>
                <button type="button" class="segment-item" data-tab="bot" data-t="modeBot"></button>
                <button type="button" class="segment-item" data-tab="online" data-t="modeOnline"></button>
                <button type="button" class="segment-item" data-tab="local" data-t="modeLocal"></button>
            </div>
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
                <div class="cs-rating-card"><i style="background-image:url('${pieceUrl('wQ')}')"></i><div><small data-t="yourRating"></small><b data-ref="myRating">—</b></div><span data-ref="myGames"></span></div>
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
                    <button type="button" data-sheet="join" data-t="join"></button>
                </div>
                <div class="ck-rooms-head"><h3 data-t="openRooms"></h3><button class="ck-refresh" type="button" data-sheet="refresh">${ICON.refresh}</button></div>
                <div class="ck-rooms" data-ref="rooms"></div>
            </div>
            <div class="cs-panel" data-panel="local">
                <p class="cs-label" data-t="localHint"></p>
                <p class="cs-label" data-t="timeControl"></p>
                <div class="cs-tcs" data-tcs="localTc">${tcButtons(offlineTcs, true)}</div>
                <button type="button" class="btn-main" data-sheet="playLocal" data-t="play"></button>
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
            <div data-ref="waitCodeBox"><p class="ck-wait-sub" data-t="roomCode"></p><div class="ck-wait-code" data-ref="waitCode">-----</div><p class="ck-wait-hint" data-t="shareCode"></p>
            <button class="btn-main ck-invite" type="button" data-wait="invite">${ICON.send}<span data-t="inviteFriend"></span></button></div>
            <button class="btn-secondary" style="width:100%; margin-top:8px;" type="button" data-wait="cancel" data-t="cancel"></button>`;
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
        const level = core.botLevel(prefs.level);
        refs.s_levelName.textContent = tr(`level${level.level}`);
        refs.s_levelElo.textContent = `~${level.elo}`;
        const tc = core.timeControl(prefs.onlineTc) || core.timeControl(core.DEFAULT_ONLINE_TC);
        refs.s_quickHint.textContent = tr('findHint', { tc: `${tr(tc.cat)} ${tc.id}` });
        panel.querySelectorAll('[data-level]').forEach(b => b.classList.toggle('active', Number(b.dataset.level) === prefs.level));
        panel.querySelectorAll('[data-color]').forEach(b => b.classList.toggle('active', b.dataset.color === prefs.color));
        panel.querySelectorAll('[data-tcs]').forEach(group => {
            const value = prefs[group.dataset.tcs];
            group.querySelectorAll('[data-tc]').forEach(b => b.classList.toggle('active', b.dataset.tc === value));
        });
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
        const join = event.target.closest('[data-join]');
        if (join) { joinRoom(join.dataset.join); return; }
        const button = event.target.closest('[data-sheet]');
        if (!button) return;
        switch (button.dataset.sheet) {
            case 'close': return closeSheet();
            case 'continue': return resumeSaved();
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
        return { username: myName(), photo_url: user?.photo_url || '' };
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

    function renderRooms(rooms) {
        const list = refs.s_rooms;
        if (!list) return;
        if (!rooms.length) {
            list.innerHTML = `<div class="ck-empty"><b>${esc(tr('noRooms'))}</b>${esc(tr('noRoomsHint'))}</div>`;
            return;
        }
        list.innerHTML = rooms.map(room => {
            const avatar = typeof room.avatar === 'string' && /^https:\/\//i.test(room.avatar)
                ? `<img class="ck-room-ava" src="${esc(room.avatar)}" alt="" referrerpolicy="no-referrer">`
                : `<span class="ck-room-ava">${esc((room.name || '?').slice(0, 1).toUpperCase())}</span>`;
            const tc = core.timeControl(room.tc);
            return `<div class="ck-room">${avatar}<div class="ck-room-text"><b>${esc(room.name)}</b><small>${esc(tr('rating'))} ${esc(room.rating || core.START_RATING)}</small></div>
                <span class="cs-room-tc">${esc(tc ? tc.id : room.tc)}</span>
                <button class="ck-room-join" type="button" data-join="${esc(room.code)}">${esc(tr('join'))}</button></div>`;
        }).join('');
    }

    async function loadRating() {
        if (ratingCache && Date.now() - ratingCache.at < 30000) { showRating(ratingCache.data); return; }
        try {
            const response = await fetch(`${typeof API_BASE_URL === 'string' ? API_BASE_URL : ''}/api/chess/profile`, { headers: { 'X-Init-Data': tg?.initData || '' } });
            if (!response.ok) throw new Error(String(response.status));
            const data = await response.json();
            ratingCache = { at: Date.now(), data };
            showRating(data);
        } catch (_) { showRating(null); }
    }
    function showRating(data) {
        refs.s_myRating.textContent = data?.rating ? String(data.rating) : String(core.START_RATING);
        refs.s_myGames.textContent = data?.games ? tr('gamesShort', { n: data.games }) : '';
    }

    let waitInfo = null;
    function showWait(data) {
        waitInfo = { ...waitInfo, ...data };
        const quick = !!waitInfo.quick;
        refs.w_waitTitle.textContent = quick ? tr('searching') : tr('waitingFriend');
        refs.w_waitCodeBox.hidden = quick;
        if (data.roomCode) refs.w_waitCode.textContent = data.roomCode;
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
    async function inviteFriend() {
        const code = waitInfo?.roomCode;
        if (!code) return;
        haptic('light');
        if (typeof sharePreparedMessage === 'function' && await sharePreparedMessage('chess', code)) return;
        const link = `https://t.me/spark_game_bot/sparkapp?startapp=cs_${code}`;
        const text = tr('inviteText', { name: myName() });
        const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
        if (tg?.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
    }

    function openSheet(tab) {
        if (!sheetEl) return;
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
        ready = import(`${BASE}vendor/chess.js`).then(module => {
            Chess = module.Chess;
            buildScreen();
            buildSheet();
            bindSocket();
            hintOn = isOwner() && localStorage.getItem(HINT_KEY) === '1';
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
