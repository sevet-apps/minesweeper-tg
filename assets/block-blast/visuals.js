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
    const particleBudget = (count, calm, lowPower) => calm ? 0 : Math.min(lowPower ? 10 : 24, count * 2);
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
                    const t = Math.min(1, (time - start) / 280);
                    update(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))));
                    frame = t < 1 ? schedule(tick) : 0;
                };
                frame = schedule(tick);
            },
        };
    }
    const api = { catalog, formatNumber, uniqueCells, particleBudget, createCounter };
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
    const lowPower = Number(navigator.hardwareConcurrency || 8) <= 4 || Number(navigator.deviceMemory || 8) <= 2;
    const active = new Map();
    let sheet, restoreFocus, dragging = null, layer, feedback, feedbackTimer;
    const counter = createCounter(requestAnimationFrame, cancelAnimationFrame, () => performance.now());
    const lang = () => /^zh/.test(doc.documentElement.lang) ? 'zh' : /^en/.test(doc.documentElement.lang) ? 'en' : 'ru';
    const text = (ru, en, zh) => ({ ru, en, zh })[lang()];
    api.reduced = () => calm || media.matches || doc.body.classList.contains('lite-mode');
    api.count = (from, to, update) => counter.run(from, to, update, api.reduced() || doc.hidden);
    api.stopCounter = () => counter.stop();
    api.theme = () => theme;
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
        for (const [animation, el] of active) { animation.cancel(); el.remove(); }
        active.clear();
        if (layer) layer.remove();
        if (feedback) feedback.remove();
        clearTimeout(feedbackTimer);
        doc.querySelectorAll('.bb-line-score').forEach(el => el.remove());
        closePicker(true);
    };
    const clearFrames = effect => {
        const end = { opacity: 0, transform: 'scale(.18)' };
        switch (effect) {
            case 'squish': return [{ transform: 'scale(1)' }, { transform: 'scale(1.18,.72)', offset: .32 }, { opacity: 0, transform: 'scale(.35,1.3) translateY(-9px)' }];
            case 'soft': return [{ transform: 'scale(1)' }, { transform: 'scale(1.06)', offset: .25 }, { opacity: 0, transform: 'translateY(-12px) scale(.55) rotate(-12deg)' }];
            case 'paint': return [{ transform: 'scale(1)' }, { transform: 'scale(1.12,.8)', offset: .3 }, { opacity: 0, transform: 'scale(1.6,.08)' }];
            case 'honey': return [{ transform: 'scale(1)' }, { transform: 'scale(.85,1.12)', offset: .35 }, { opacity: 0, transform: 'translateY(12px) scale(.2,.7)' }];
            case 'wood': return [{ transform: 'scale(1)' }, { transform: 'translateY(-3px)', offset: .25 }, { opacity: 0, transform: 'translateY(14px) rotate(12deg) scale(.5)' }];
            case 'ice': return [{ opacity: 1, transform: 'scale(1)' }, { opacity: .8, transform: 'scale(1.06)', offset: .2 }, { opacity: 0, transform: 'scale(.85) translateY(6px)' }];
            case 'candy': return [{ transform: 'scale(1)' }, { transform: 'scale(1.13)', offset: .25 }, { opacity: 0, transform: 'scale(.12) rotate(65deg)' }];
            case 'shatter': return [{ transform: 'scale(1)' }, { transform: 'scale(1.08)', offset: .2 }, { opacity: 0, transform: 'scale(.4) rotate(-18deg)' }];
            case 'porcelain': return [{ transform: 'scale(1)' }, { transform: 'scale(.94)', offset: .2 }, { opacity: 0, transform: 'translateY(8px) rotate(22deg) scale(.6)' }];
            case 'crumb': return [{ transform: 'scale(1)' }, { transform: 'scale(.92,1.05)', offset: .2 }, { opacity: 0, transform: 'translateY(9px) scale(.35)' }];
            default: return [{ transform: 'scale(1)' }, { transform: 'scale(1.12)', offset: .25 }, end];
        }
    };
    api.clearLines = (rows, cols, getCell) => {
        // Repeated clears share one bounded burst, even when the player moves very fast.
        for (const [animation, el] of active) { animation.cancel(); el.remove(); }
        active.clear();
        const cells = uniqueCells(rows, cols);
        // Read all geometry before writes. Visual copies have no access to the live board.
        const snapshots = cells.map(({ r, c }) => {
            const cell = getCell(r, c);
            const color = ['cheese', 'honey', 'porcelain', 'wood', 'ice'].includes(theme.id) ? theme.accent : getComputedStyle(cell).color;
            return { cell, r, c, color, x: cell.offsetLeft, y: cell.offsetTop, w: cell.offsetWidth, h: cell.offsetHeight, clone: api.reduced() ? null : cell.cloneNode(false) };
        });
        const container = api.reduced() ? null : fxLayer();
        for (const item of snapshots) {
            const { cell, clone, x, y, w, h, r, c } = item;
            if (clone) {
                clone.classList.remove('place-pop', 'no-transition', 'pre-clear');
                clone.classList.add('bb-clear-tile');
                clone.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
                container.appendChild(clone);
                motion(clone, clearFrames(theme.effect), { duration: 290, delay: Math.abs((rows.includes(r) ? c : r) - 3.5) * 14, easing: 'cubic-bezier(.2,.7,.25,1)', fill: 'both' });
            }
            cell.className = 'bb-cell';
            cell.removeAttribute('style');
        }
        if (container) spawnParticles(snapshots, container);
    };
    function spawnParticles(snapshots, container) {
        const count = particleBudget(snapshots.length, api.reduced(), lowPower);
        const remaining = Math.max(0, count - container.querySelectorAll('.bb-material-particle').length);
        for (let i = 0; i < remaining; i++) {
            const source = snapshots[Math.floor(i * snapshots.length / remaining)];
            const el = doc.createElement('i');
            el.className = 'bb-material-particle bb-particle-' + theme.effect;
            const size = theme.effect === 'soft' ? 7 : 4 + Math.random() * 5;
            el.style.cssText = `left:${source.x + source.w / 2}px;top:${source.y + source.h / 2}px;width:${size}px;height:${size}px;--particle-color:${source.color};--particle-accent:${theme.accent};`;
            container.appendChild(el);
            const angle = Math.random() * Math.PI * 2;
            const distance = (theme.effect === 'soft' ? 18 : 24) + Math.random() * 24;
            const dx = Math.cos(angle) * distance;
            const dy = Math.sin(angle) * distance;
            let end = `translate(${dx}px,${dy + 18}px) rotate(${i % 2 ? 85 : -85}deg) scale(.25)`;
            if (theme.effect === 'soft') end = `translate(${dx * .6}px,${-Math.abs(dy) - 10}px) rotate(25deg) scale(.6)`;
            if (theme.effect === 'squish') end = `translate(${dx}px,${dy + 25}px) scale(.4,1.3)`;
            if (theme.effect === 'honey') end = `translate(${dx * .4}px,${Math.abs(dy) + 28}px) scale(.25,1.5)`;
            if (theme.effect === 'paint') end = `translate(${dx * 1.6}px,${dy * .5}px) scale(1.4,.25)`;
            if (theme.effect === 'ice') end = `translate(${dx * .7}px,${-Math.abs(dy)}px) rotate(35deg) scale(.35)`;
            if (theme.effect === 'wood') end = `translate(${dx * .8}px,${Math.abs(dy) + 20}px) rotate(${i % 2 ? 35 : -35}deg) scale(.4,1.2)`;
            if (theme.effect === 'candy') end = `translate(${dx}px,${dy}px) rotate(180deg) scale(.2)`;
            motion(el, [
                { opacity: 0, transform: 'translate(-50%,-50%) scale(.4)' },
                { opacity: .9, transform: `translate(${dx * .45}px,${dy * .45}px) scale(1)`, offset: .25 },
                { opacity: 0, transform: end },
            ], { duration: 430 + Math.random() * 120, easing: 'ease-out', delay: 40, fill: 'both' });
        }
    }
    api.lineScore = (points, cells, getCell) => {
        if (!points || !cells || !cells.length || doc.hidden) return;
        const rects = cells.map(p => getCell(p.r, p.c)?.getBoundingClientRect()).filter(Boolean);
        if (!rects.length) return;
        doc.querySelectorAll('.bb-line-score').forEach(el => el.remove());
        const el = doc.createElement('div');
        el.className = 'bb-line-score';
        el.textContent = '+' + formatNumber(points);
        const x = rects.reduce((n, b) => n + b.left + b.width / 2, 0) / rects.length;
        const y = rects.reduce((n, b) => n + b.top + b.height / 2, 0) / rects.length;
        el.style.left = Math.max(90, Math.min(innerWidth - 90, x)) + 'px';
        el.style.top = y + 'px';
        doc.body.appendChild(el);
        motion(el, api.reduced() ? [{ opacity: 1 }, { opacity: 0 }] : [
            { opacity: 0, transform: 'translate(-50%,-25%) scale(.7)' },
            { opacity: 1, transform: 'translate(-50%,-55%) scale(1.06)', offset: .18 },
            { opacity: 1, transform: 'translate(-50%,-70%) scale(1)', offset: .65 },
            { opacity: 0, transform: 'translate(-50%,-110%) scale(.96)' },
        ], { duration: api.reduced() ? 500 : 850, easing: 'ease-out', fill: 'both' });
    };
    api.combo = (value, animate = true) => {
        const label = doc.getElementById('bbComboLabel');
        if (!label) return;
        const content = value > 1 ? text('Серия', 'Combo', '连击') + ' ×' + formatNumber(value) : '';
        if (label.textContent !== content) label.textContent = content;
        if (animate && !api.reduced() && value > 1) {
            label.getAnimations().forEach(a => a.cancel());
            label.animate([{ transform: 'scale(.9)' }, { transform: 'scale(1.08)', offset: .45 }, { transform: 'scale(1)' }], { duration: 250 });
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
        feedbackTimer = setTimeout(() => { feedback?.remove(); feedback = null; }, 1200);
    };
    function selectTheme(id, persist = true) {
        theme = catalog.find(t => t.id === id) || catalog[1];
        doc.body.dataset.bbMaterial = theme.id;
        doc.body.dataset.bbMotion = calm ? 'calm' : 'full';
        doc.body.style.setProperty('--bb-texture', theme.id === 'classic' ? 'none' : `url("${textureBase}${theme.id}.svg")`);
        doc.body.style.setProperty('--bb-material-accent', theme.accent);
        doc.body.style.setProperty('--bb-material-surface', theme.surface);
        if (persist) write('bb_material', theme.id);
        doc.querySelectorAll('[data-material-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.materialChoice === theme.id)));
        const trigger = doc.getElementById('bbMaterialButton');
        if (trigger) trigger.setAttribute('aria-label', text('Оформление: ', 'Style: ', '风格：') + theme.name[lang()]);
    }
    api.selectTheme = selectTheme;
    api.refreshLanguage = () => selectTheme(theme.id, false);
    const cross = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m7 7 10 10M17 7 7 17"/></svg>';
    function closePicker(immediate = false) {
        immediate = immediate === true;
        if (!sheet || !sheet.open || (!immediate && sheet.classList.contains('is-closing'))) return;
        dragging = null;
        const panel = sheet.querySelector('.bb-material-panel');
        const from = getComputedStyle(panel).transform;
        panel.getAnimations().forEach(animation => animation.cancel());
        panel.style.transform = '';
        sheet.classList.add('is-closing');
        const finish = () => { sheet.close(); sheet.classList.remove('is-closing'); restoreFocus?.focus({ preventScroll: true }); };
        if (immediate || api.reduced()) finish();
        else {
            const animation = panel.animate([{ transform: from === 'none' ? 'translateY(0)' : from }, { transform: 'translateY(105%)' }], { duration: 210, easing: 'cubic-bezier(.4,0,1,1)' });
            animation.onfinish = finish;
        }
    }
    api.openPicker = () => {
        if (sheet?.open) return;
        restoreFocus = doc.activeElement;
        if (!sheet) {
            sheet = doc.createElement('dialog');
            sheet.className = 'bb-material-dialog';
            sheet.setAttribute('aria-labelledby', 'bbMaterialTitle');
            doc.body.appendChild(sheet);
            sheet.addEventListener('cancel', event => { event.preventDefault(); closePicker(); });
            sheet.addEventListener('click', event => { if (event.target === sheet) closePicker(); });
        }
        sheet.innerHTML = `<section class="bb-material-panel"><div class="bb-material-grab"><span></span></div><header><div><small>BLOCK BLAST</small><h2 id="bbMaterialTitle">${text('На ощупь — по-новому', 'A fresh feel', '触感焕新')}</h2></div><button class="bb-material-close" aria-label="${text('Закрыть', 'Close', '关闭')}">${cross}</button></header><div class="bb-material-choices"></div><label class="bb-motion-option"><span>${text('Спокойные эффекты', 'Gentle effects', '轻柔效果')}<small>${text('Меньше движения и частиц', 'Less motion and fewer particles', '减少动画和粒子')}</small></span><input type="checkbox" ${calm ? 'checked' : ''} role="switch"><i></i></label></section>`;
        const choices = sheet.querySelector('.bb-material-choices');
        for (const item of catalog) {
            const button = doc.createElement('button');
            button.className = 'bb-material-choice';
            button.dataset.materialChoice = item.id;
            button.setAttribute('aria-pressed', String(item.id === theme.id));
            button.innerHTML = `<span class="bb-material-swatch" data-bb-swatch="${item.id}" style="--swatch-texture:${item.id === 'classic' ? 'none' : `url('${textureBase}${item.id}.svg')`}"><i></i><i></i><i></i><i></i></span><span>${item.name[lang()]}</span><b aria-hidden="true">✓</b>`;
            button.onclick = () => { selectTheme(item.id); if (typeof api.onSelect === 'function') api.onSelect(); };
            choices.appendChild(button);
        }
        sheet.querySelector('.bb-material-close').onclick = closePicker;
        sheet.querySelector('input').onchange = event => {
            calm = event.target.checked;
            write('bb_motion', calm ? 'calm' : 'full');
            doc.body.dataset.bbMotion = calm ? 'calm' : 'full';
        };
        const panel = sheet.querySelector('.bb-material-panel');
        const handle = sheet.querySelector('.bb-material-grab');
        handle.onpointerdown = event => {
            if (dragging || event.isPrimary === false || event.button !== 0) return;
            panel.getAnimations().forEach(animation => animation.cancel());
            dragging = { y: event.clientY, id: event.pointerId };
            handle.setPointerCapture(event.pointerId);
        };
        handle.onpointermove = event => { if (dragging?.id === event.pointerId) panel.style.transform = `translateY(${Math.max(0, event.clientY - dragging.y)}px)`; };
        handle.onpointerup = event => {
            if (dragging?.id !== event.pointerId) return;
            const distance = event.clientY - dragging.y;
            dragging = null;
            if (distance > 70) closePicker();
            else {
                panel.style.transform = '';
                if (!api.reduced()) panel.animate([{ transform: `translateY(${Math.max(0, distance)}px)` }, { transform: 'translateY(0)' }], { duration: 230, easing: 'cubic-bezier(.2,.8,.2,1)' });
            }
        };
        handle.onpointercancel = event => { if (dragging?.id === event.pointerId) { dragging = null; panel.style.transform = ''; } };
        handle.onlostpointercapture = handle.onpointercancel;
        sheet.showModal();
        if (!api.reduced()) panel.animate([{ transform: 'translateY(105%)', opacity: .5 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 360, easing: 'cubic-bezier(.16,1,.3,1)' });
    };
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) api.cleanup(); });
    doc.addEventListener('DOMContentLoaded', () => { selectTheme(theme.id, false); });
})(typeof window !== 'undefined' ? window : globalThis);
