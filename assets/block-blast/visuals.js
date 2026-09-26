/* Material rendering is deliberately separate from board state and scoring. */
(function (root) {
    'use strict';
    const catalog = [
        ['classic', 'Классика', 'Classic', '经典', 'classic', '#a7c9ff', '#26334b'],
        ['jelly', 'Желе', 'Jelly', '果冻', 'squish', '#a8e9dd', '#203c3b'],
        ['wool', 'Шерсть', 'Wool', '毛线', 'soft', '#efb6d1', '#342a3e'],
        ['gem', 'Кристалл', 'Crystal', '宝石', 'shatter', '#becbff', '#262d48'],
        ['paint', 'Краски', 'Paint', '颜料', 'paint', '#f2b5a0', '#41302d'],
        ['cheese', 'Сыр', 'Cheese', '芝士', 'crumb', '#ffda80', '#403522'],
        ['honey', 'Мёд', 'Honey', '蜂蜜', 'honey', '#edbb65', '#3d3121'],
        ['porcelain', 'Фарфор', 'Porcelain', '青花瓷', 'porcelain', '#a8c8ff', '#25374c'],
        ['wood', 'Дерево', 'Wood', '木纹', 'wood', '#dfb58b', '#392e27'],
        ['candy', 'Леденец', 'Candy', '糖果', 'candy', '#f2b5db', '#3e2a3b'],
        ['ice', 'Лёд', 'Ice', '冰块', 'ice', '#afe8fa', '#233b46'],
    ].map(([id, ru, en, zh, effect, accent, surface]) => ({ id, name: { ru, en, zh }, effect, accent, surface }));
    const formatNumber = value => {
        const n = Number(value);
        return (Number.isFinite(n) ? Math.trunc(n) : 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
    };
    const uniqueCells = (rows, cols) => {
        const keys = new Set();
        rows.forEach(r => { for (let c = 0; c < 8; c++) keys.add(r * 8 + c); });
        cols.forEach(c => { for (let r = 0; r < 8; r++) keys.add(r * 8 + c); });
        return Array.from(keys, key => ({ r: Math.floor(key / 8), c: key % 8 }));
    };
    const particleBudget = (count, calm, lowPower) => calm ? 0 : Math.min(lowPower ? 192 : 360, count * 12);
    const materialGlow = {
        cheese: '#f8bd44', honey: '#f5a409', porcelain: '#a8c8ff', wood: '#c28d61', ice: '#8bd5ed',
    };
    const previewGlowHex = (themeId, pieceHex) => materialGlow[themeId] || pieceHex;
    // One cancellable counter; a newer score can never be overwritten by an older frame.
    function createCounter(schedule, cancel, now) {
        let frame = 0;
        return {
            stop() { cancel(frame); frame = 0; },
            run(from, to, update, immediate) {
                this.stop();
                if (immediate || from === to) { update(to); return; }
                const start = now();
                const tick = time => {
                    const t = Math.min(1, (time - start) / 420);
                    update(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))));
                    frame = t < 1 ? schedule(tick) : 0;
                };
                frame = schedule(tick);
            },
        };
    }
    const api = { catalog, formatNumber, uniqueCells, particleBudget, createCounter, previewGlowHex };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (!root.document) return;
    root.BBVisuals = api;
    const doc = root.document;
    const textureBase = new URL('./themes/', doc.currentScript?.src || new URL('assets/block-blast/visuals.js', doc.baseURI)).href;
    const media = root.matchMedia('(prefers-reduced-motion: reduce)');
    const read = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch (_) { return fallback; } };
    const write = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };
    let theme = catalog.find(t => t.id === read('bb_material', 'jelly')) || catalog[1];
    let calm = read('bb_motion', 'full') === 'calm';
    let shake = read('bb_shake', 'on') !== 'off', shakeAnimation;
    const storedVolume = Number(read('bb_volume', '100'));
    let volume = Number.isFinite(storedVolume) ? Math.max(0, Math.min(100, storedVolume)) : 100;
    const lowPower = Number(navigator.hardwareConcurrency || 8) <= 4 || Number(navigator.deviceMemory || 8) <= 2;
    const active = new Map();
    let layer, feedback, feedbackTimer, picker;
    const renderer = root.BBMaterialMotion.create({ document: doc, textureBase, lowPower });
    const counter = createCounter(requestAnimationFrame, cancelAnimationFrame, () => performance.now());
    const lang = () => /^zh/.test(doc.documentElement.lang) ? 'zh' : /^en/.test(doc.documentElement.lang) ? 'en' : 'ru';
    const text = (ru, en, zh) => ({ ru, en, zh })[lang()];
    api.reduced = () => calm || media.matches || doc.body.classList.contains('lite-mode');
    api.count = (from, to, update) => counter.run(from, to, update, api.reduced() || doc.hidden);
    api.stopCounter = () => counter.stop();
    api.theme = () => theme;
    api.volume = () => volume;
    api.setVolume = value => { volume = Math.max(0, Math.min(100, Math.round(Number(value) || 0))); write('bb_volume', String(volume)); };
    api.previewGlow = pieceHex => previewGlowHex(theme.id, pieceHex);
    function motion(el, frames, options) {
        const animation = el.animate(frames, options);
        active.set(animation, el);
        const finish = () => { active.delete(animation); el.remove(); };
        animation.onfinish = finish;
        animation.oncancel = finish;
        return animation;
    }
    function fxLayer() {
        const grid = doc.getElementById('bbGrid');
        if (!layer || !layer.isConnected) {
            layer = doc.createElement('div');
            layer.className = 'bb-material-fx';
            layer.setAttribute('aria-hidden', 'true');
            grid.appendChild(layer);
        }
        return layer;
    }
    api.cleanup = () => {
        counter.stop();
        shakeAnimation?.cancel(); shakeAnimation = null;
        for (const [animation, el] of active) { animation.cancel(); el.remove(); }
        active.clear();
        renderer.cleanup();
        if (layer) layer.remove();
        if (feedback) feedback.remove();
        clearTimeout(feedbackTimer);
        doc.querySelectorAll('.bb-line-score').forEach(el => el.remove());
        picker?.close(true);
    };
    api.occlude = cells => renderer.occlude(cells);
    api.inspectFrame = elapsed => renderer.inspectFrame(elapsed);
    api.preparePreClear = (cell, r, c) => {
        if (theme.id !== 'ice') return;
        const seed = (r * 53 + c * 97 + 17);
        cell.style.setProperty('--ice-phase', -(seed % 211) + 'ms');
        cell.style.setProperty('--ice-speed', (145 + seed % 83) + 'ms');
        cell.style.setProperty('--ice-x', ((seed % 2 ? 1 : -1) * (.5 + seed % 5 * .13)) + 'px');
        cell.style.setProperty('--ice-y', ((seed % 3 ? -1 : 1) * (.5 + seed % 7 * .08)) + 'px');
        cell.style.setProperty('--ice-angle', ((seed % 2 ? -1 : 1) * (.7 + seed % 4 * .25)) + 'deg');
    };
    function clearFeedback(grid, color, lines) {
        const hex = previewGlowHex(theme.id, ['#ff3b30','#ff9500','#ffcc00','#34c759','#007aff','#5856d6','#af52de'][color]);
        // One composited rim fades; its shadow is static, never recalculated per frame.
        for (const el of grid.querySelectorAll('.bb-clear-rim')) { el.getAnimations().forEach(a => a.cancel()); el.remove(); }
        const rim = doc.createElement('div'); rim.className = 'bb-clear-rim'; rim.setAttribute('aria-hidden', 'true');
        rim.style.setProperty('--bb-clear-color', hex); grid.appendChild(rim);
        motion(rim, [{ opacity: .85 }, { opacity: 1, offset: .13 }, { opacity: .55, offset: .48 }, { opacity: 0 }], { duration: 620, easing: 'ease-out', fill: 'both' });
        if (!shake) return;
        const container = doc.querySelector('.bb-game-container');
        if (!container) return;
        shakeAnimation?.cancel();
        const force = Math.min(8, 5 + (lines - 1) * 1.15);
        shakeAnimation = container.animate([
            { transform: 'translate3d(0,0,0)' },
            { transform: `translate3d(${-force}px,${force * .62}px,0)`, offset: .09 },
            { transform: `translate3d(${force * .78}px,${-force * .5}px,0)`, offset: .25 },
            { transform: `translate3d(${-force * .52}px,${force * .28}px,0)`, offset: .46 },
            { transform: `translate3d(${force * .24}px,${-force * .13}px,0)`, offset: .7 },
            { transform: 'translate3d(0,0,0)' },
        ], { duration: 310, easing: 'ease-out' });
    }
    api.clearLines = (rows, cols, getCell, triggerColor = 'bb-c-5') => {
        const cells = uniqueCells(rows, cols), grid = doc.getElementById('bbGrid');
        const color = Number(triggerColor.match(/^bb-c-([1-7])$/)?.[1] || 5) - 1;
        // One geometry read, before any writes. All fragments are cached canvas sprites.
        const size = grid.getBoundingClientRect().width, w = (size - 36) / 8;
        const snapshots = cells.map(({ r, c }) => {
            const cell = getCell(r, c);
            return { cell, r, c, color, x: 4 + c * (w + 4), y: 4 + r * (w + 4), w };
        });
        if (!api.reduced() && !doc.hidden) {
            renderer.clear(theme, snapshots, rows, cols, grid, size);
            clearFeedback(grid, color, rows.length + cols.length);
        }
        for (const { cell } of snapshots) { cell.className = 'bb-cell'; cell.removeAttribute('style'); }
    };
    api.lineScore = (points, cells, getCell) => {
        if (!points || !cells || !cells.length || doc.hidden) return;
        const rects = cells.map(p => getCell(p.r, p.c)?.getBoundingClientRect()).filter(Boolean);
        if (!rects.length) return;
        const labels = [...doc.querySelectorAll('.bb-line-score')];
        if (labels.length >= 3) { const oldest = labels[0]; oldest.getAnimations().forEach(a => a.cancel()); oldest.remove(); }
        const el = doc.createElement('div');
        el.className = 'bb-line-score';
        el.textContent = '+' + formatNumber(points);
        const x = rects.reduce((n, b) => n + b.left + b.width / 2, 0) / rects.length;
        const y = rects.reduce((n, b) => n + b.top + b.height / 2, 0) / rects.length;
        el.style.left = Math.max(90, Math.min(innerWidth - 90, x)) + 'px';
        el.style.top = (y - labels.length * 26) + 'px';
        doc.body.appendChild(el);
        const half = Math.min(innerWidth / 2 - 12, el.offsetWidth / 2 + 8);
        el.style.left = Math.max(half, Math.min(innerWidth - half, x)) + 'px';
        motion(el, api.reduced() ? [{ opacity: 1 }, { opacity: 0 }] : [
            { opacity: 0, transform: 'translate(-50%,-25%) scale(.7)' },
            { opacity: 1, transform: 'translate(-50%,-55%) scale(1.06)', offset: .12 },
            { opacity: 1, transform: 'translate(-50%,-70%) scale(1)', offset: .78 },
            { opacity: 0, transform: 'translate(-50%,-110%) scale(.96)' },
        ], { duration: api.reduced() ? 1600 : 2100, easing: 'ease-out', fill: 'both' });
    };
    api.combo = (value, animate = true) => {
        const label = doc.getElementById('bbComboLabel');
        if (!label) return;
        const content = value > 0 ? text('Серия', 'Combo', '连击') + ' ×' + formatNumber(value) : '';
        if (label.textContent !== content) label.textContent = content;
        if (animate && !api.reduced() && value > 0) {
            label.getAnimations().forEach(a => a.cancel());
            label.animate([{ transform: 'scale(.94)' }, { transform: 'scale(1.06)', offset: .4 }, { transform: 'scale(1)' }], { duration: 420 });
            const score = doc.getElementById('bbScore');
            if (score) {
                score.getAnimations().forEach(a => a.cancel());
                score.animate([{ transform: 'scale(1.035)' }, { transform: 'scale(1.07)', offset: .38 }, { transform: 'scale(1.035)' }], { duration: 480, easing: 'ease-out' });
            }
        }
    };
    api.allClear = bonus => {
        if (feedback) feedback.remove();
        clearTimeout(feedbackTimer);
        feedback = doc.createElement('div');
        feedback.className = 'bb-material-celebration';
        const title = doc.createElement('strong');
        title.textContent = text('Чистая работа!', 'All clear!', '全部消除！');
        const score = doc.createElement('span');
        score.textContent = '+' + formatNumber(bonus);
        feedback.append(title, score);
        doc.querySelector('.bb-game-container').appendChild(feedback);
        if (!api.reduced()) {
            const ring = doc.createElement('div');
            ring.className = 'bb-material-ring';
            fxLayer().appendChild(ring);
            motion(ring, [{ opacity: .7, transform: 'scale(.45)' }, { opacity: 0, transform: 'scale(1.1)' }], { duration: 750, easing: 'ease-out', fill: 'both' });
        }
        feedbackTimer = setTimeout(() => { feedback?.remove(); feedback = null; }, 1900);
    };
    function selectTheme(id, persist = true) {
        theme = catalog.find(t => t.id === id) || catalog[1];
        doc.body.dataset.bbMaterial = theme.id;
        doc.body.dataset.bbMotion = calm ? 'calm' : 'full';
        doc.body.style.setProperty('--bb-texture', theme.id === 'classic' ? 'none' : `url("${textureBase}${theme.id}.svg")`);
        doc.body.style.setProperty('--bb-material-accent', theme.accent);
        doc.body.style.setProperty('--bb-material-surface', theme.surface);
        renderer.prepare(theme);
        if (persist) write('bb_material', theme.id);
        doc.querySelectorAll('[data-material-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.materialChoice === theme.id)));
        const trigger = doc.getElementById('bbMaterialButton');
        if (trigger) trigger.setAttribute('aria-label', text('Настройки Блок Бласта', 'Block Blast settings', '方块消除设置'));
    }
    api.selectTheme = selectTheme;
    api.refreshLanguage = () => { selectTheme(theme.id, false); picker?.refresh(); };
    api.openPicker = () => {
        if (!picker) picker = root.BBMaterialPicker.create({ catalog, textureBase, getTheme: () => theme, isCalm: () => calm, isShake: () => shake, getVolume: api.volume, setVolume: api.setVolume,
            setShake(value) { shake = value; write('bb_shake', shake ? 'on' : 'off'); if (!shake) shakeAnimation?.cancel(); },
            setCalm(value) { calm = value; write('bb_motion', calm ? 'calm' : 'full'); doc.body.dataset.bbMotion = calm ? 'calm' : 'full'; if (calm) { renderer.cleanup(); shakeAnimation?.cancel(); } },
            selectTheme, reduced: api.reduced, lang });
        picker.open();
    };
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) api.cleanup(); });
    doc.addEventListener('DOMContentLoaded', () => { selectTheme(theme.id, false); });
})(typeof window !== 'undefined' ? window : globalThis);
