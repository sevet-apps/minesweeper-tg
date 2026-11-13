/* Spark Chess: эффекты доски поверх партии — отклик поверхности на посадку,
   импульс шаха, перетекание пешки в новую фигуру, капсула выбора превращения,
   шторки начала партии, фильм мата сверху и пилюли итога над королями.
   Всё декоративное: партия меняется сразу, эффекты ничего не блокируют и
   обрываются следующим действием. Физика — chess-motion.js.
   Подключается перед chess-app.js; приложение создаёт слой через create(env). */
(function () {
    'use strict';
    const Motion = window.SparkChessMotion;
    if (!Motion || window.SparkChessFx) return;
    const { clamp, lerp } = Motion;
    const SVG_NS = 'http://www.w3.org/2000/svg';

    /** Шаги по времени, которые можно промотать до конца одним вызовом skip(). */
    function timeline() {
        const steps = [];
        const timers = [];
        let finish = null, done = false;
        const tl = {
            fast: false,
            at(ms, fn) { steps.push({ ms, fn, ran: false }); return tl; },
            run() {
                return new Promise(resolve => {
                    finish = resolve;
                    for (const step of steps) timers.push(setTimeout(() => { if (!done && !step.ran) { step.ran = true; step.fn(tl); } }, step.ms));
                    timers.push(setTimeout(() => tl.stop(), Math.max(0, ...steps.map(s => s.ms)) + 30));
                });
            },
            skip() {
                if (done) return;
                tl.fast = true;
                timers.forEach(clearTimeout);
                [...steps].sort((a, b) => a.ms - b.ms).forEach(step => { if (!step.ran) { step.ran = true; try { step.fn(tl); } catch (_) {} } });
                tl.stop();
            },
            stop() { if (done) return; done = true; timers.forEach(clearTimeout); finish?.(); },
            get done() { return done; },
        };
        return tl;
    }

    function create(env) {
        const { sqXY, tf, haptic, sound } = env;
        const R = () => env.refs();
        const tempo = () => env.tempo();
        const div = (cls, html = '') => { const node = document.createElement('div'); node.className = cls; if (html) node.innerHTML = html; return node; };
        const onSq = (node, sq) => { const [x, y] = sqXY(sq); node.style.transform = tf(x, y); return node; };
        /** Короткая вспышка на клетке: элемент сам уходит через life мс. */
        function spot(layer, cls, sq, life) {
            const node = onSq(div(`cs-fxsq ${cls}`, '<i></i>'), sq);
            layer.appendChild(node);
            if (life) setTimeout(() => node.remove(), life);
            return node;
        }

        /* ---------- посадка: едва заметная волна поверхности под фигурой ---------- */
        function ripple(sq, { strong = false } = {}) {
            if (env.reduced || !R().fx) return;
            spot(R().fx, `cs-ripple${strong ? ' is-strong' : ''}`, sq, 560);
            if (R().glitter?.dataset.on) sparkle(sq, strong ? 7 : 4);
        }

        /* ---------- шах: король вздрагивает, вокруг клетки проходит импульс, доска на миг темнеет к краям ---------- */
        function check(kingSq, kingEl) {
            const r = R();
            if (env.reduced || !r.fx) return;
            const k = Math.sqrt(tempo());
            spot(r.fx, 'cs-pulse', kingSq, 700);
            spot(r.fx, 'cs-pulse is-second', kingSq, 800);
            const [x, y] = sqXY(kingSq);
            r.tension.style.setProperty('--kx', `${(x + 0.5) * 12.5}%`);
            r.tension.style.setProperty('--ky', `${(y + 0.5) * 12.5}%`);
            r.tension.classList.remove('on');
            void r.tension.offsetWidth;
            r.tension.classList.add('on');
            const face = kingEl?.firstChild;
            if (face?.animate) {
                // затухающая дрожь: пять коротких качаний и лёгкое сжатие
                const frames = [];
                const n = 14;
                for (let i = 0; i <= n; i++) {
                    const u = i / n, decay = Math.pow(1 - u, 1.6);
                    const s = Math.sin(u * Math.PI * 5) * decay;
                    frames.push({ transform: `translateX(${(s * 4.2).toFixed(2)}%) rotate(${(s * 2.4).toFixed(2)}deg) scale(${(1 + 0.05 * decay * Math.sin(u * Math.PI)).toFixed(4)})` });
                }
                face.animate(frames, { duration: Math.round(380 * k), easing: 'linear' });
            }
            thump(0.008);
        }
        /** Доска едва заметно «принимает удар». */
        function thump(depth = 0.008) {
            const frame = R().frame;
            if (env.reduced || !frame?.animate) return;
            frame.animate({ scale: ['1', String(1 - depth), String(1 + depth * 0.3), '1'], offset: [0, 0.3, 0.68, 1] }, { duration: 260, easing: 'ease-out' });
        }

        /* ---------- блёстки: несколько искр вспыхивают там, где села фигура ---------- */
        function sparkle(sq, count = 5) {
            const layer = R().fx;
            if (env.reduced || !layer) return;
            const node = onSq(div('cs-fxsq cs-sparks'), sq);
            let html = '';
            for (let i = 0; i < count; i++) {
                const a = Math.random() * Math.PI * 2, d = 18 + Math.random() * 44;
                html += `<i style="--sx:${(Math.cos(a) * d).toFixed(1)}%;--sy:${(Math.sin(a) * d).toFixed(1)}%;--ss:${(0.5 + Math.random() * 0.8).toFixed(2)};--sd:${Math.round(Math.random() * 90)}ms"></i>`;
            }
            node.innerHTML = html;
            layer.appendChild(node);
            setTimeout(() => node.remove(), 760);
        }

        /* ---------- перетекание пешки в новую фигуру ---------- */
        const FIG_N = 144, FIG_PAD = 1.3;
        const figures = new Map();
        async function loadFigure(url) {
            const text = await (await fetch(url)).text();
            const inner = Math.round(FIG_N / FIG_PAD);
            // у SVG фигур нет своих размеров — задаём их, чтобы все браузеры рисовали одинаково
            const svg = text.replace(/<svg\b/, `<svg width="${inner}" height="${inner}" preserveAspectRatio="none"`);
            const blob = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
            try {
                const img = new Image();
                img.src = blob;
                await img.decode();
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = FIG_N;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                const off = (FIG_N - inner) / 2;
                ctx.drawImage(img, off, off, inner, inner);
                const figure = Motion.analyzeFigure(ctx.getImageData(0, 0, FIG_N, FIG_N).data, FIG_N);
                if (figure.area < 0.02 || figure.area > 0.7) throw new Error('figure');
                return figure;
            } finally { URL.revokeObjectURL(blob); }
        }
        function figure(url) {
            if (!figures.has(url)) figures.set(url, loadFigure(url).catch(() => null));
            return figures.get(url);
        }
        /** Заранее считает силуэты (пока игрок выбирает фигуру), чтобы перетекание началось без паузы. */
        function prepareMorph(urls) { if (!env.reduced) urls.forEach(figure); }

        /** Пешка pieceEl перетекает из картинки fromUrl в toUrl; swap() ставит новую картинку самой фигуре. */
        async function morph(pieceEl, fromUrl, toUrl, swap) {
            const face = pieceEl.firstChild;
            if (env.reduced) { swap(); return; }
            const [a, b] = await Promise.all([figure(fromUrl), figure(toUrl)]);
            if (!a || !b || !pieceEl.isConnected) {
                swap();
                if (pieceEl.isConnected) { pieceEl.classList.remove('promoted'); void pieceEl.offsetWidth; pieceEl.classList.add('promoted'); }
                return;
            }
            const canvas = document.createElement('canvas');
            canvas.className = 'cs-morph';
            canvas.width = canvas.height = FIG_N;
            const ctx = canvas.getContext('2d');
            const img = ctx.createImageData(FIG_N, FIG_N);
            Motion.morphFrame(a, b, 0, img.data);
            ctx.putImageData(img, 0, 0);
            pieceEl.appendChild(canvas);
            pieceEl.classList.add('is-morphing');
            const ms = Math.round(lerp(360, 600, clamp((tempo() - 0.6) / 0.4)));
            const t0 = performance.now();
            const A = 0.24;   // доля времени на «замах»: материал сначала сжимается
            await new Promise(resolve => {
                const frame = now => {
                    const u = clamp((now - t0) / ms);
                    Motion.morphFrame(a, b, Motion.morphCurve(u), img.data, { bulge: 1.5 });
                    ctx.putImageData(img, 0, 0);
                    let sx = 1, sy = 1;
                    if (u < A) { const q = Math.sin(Math.PI * u / A); sy = 1 - 0.11 * q; sx = 1 + 0.08 * q; }
                    else { const ring = Motion.ring((u - A) * ms / 1000, 21, 0.36); sy = 1 + 0.13 * ring; sx = 1 - 0.075 * ring; }
                    canvas.style.transform = `scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
                    if (u < 1 && pieceEl.isConnected) requestAnimationFrame(frame); else resolve();
                };
                requestAnimationFrame(frame);
            });
            swap();
            pieceEl.classList.remove('is-morphing');
            canvas.remove();
        }

        /* ---------- капсула выбора фигуры при превращении ----------
           Горизонтальная тёмная (для чёрных — светлая) капсула с большим хвостом,
           слитым с ней в одну форму и указывающим на пешку. Капсула наклоняется
           за пальцем или курсором; подсветка выбранной фигуры скользит между
           ячейками и тянется в движении. Отпустили на фигуре — выбрали. */
        let promo = null;
        const PROMO_KINDS = ['q', 'r', 'b', 'n'];
        function capsulePath(w, h, r, tx, tw, th) {
            const p = n => n.toFixed(1);
            return `M${p(r)} 0H${p(w - r)}A${p(r)} ${p(r)} 0 0 1 ${p(w)} ${p(r)}V${p(h - r)}A${p(r)} ${p(r)} 0 0 1 ${p(w - r)} ${p(h)}`
                + `H${p(tx + tw / 2)}C${p(tx + tw * 0.34)} ${p(h)} ${p(tx + tw * 0.1)} ${p(h + th)} ${p(tx)} ${p(h + th)}`
                + `C${p(tx - tw * 0.1)} ${p(h + th)} ${p(tx - tw * 0.34)} ${p(h)} ${p(tx - tw / 2)} ${p(h)}`
                + `H${p(r)}A${p(r)} ${p(r)} 0 0 1 0 ${p(h - r)}V${p(r)}A${p(r)} ${p(r)} 0 0 1 ${p(r)} 0Z`;
        }
        /** sq — клетка превращения, color — чья пешка, urls — картинки фигур по порядку PROMO_KINDS.
            Возвращает Promise с буквой фигуры или null (передумал). */
        function openPromo({ sq, color, urls }) {
            closePromo(null);
            const r = R();
            const cell = env.view.size / 8;
            const m = parseFloat(getComputedStyle(r.frame).getPropertyValue('--m')) || 16;
            const [x, y] = sqXY(sq);
            const opt = Math.round(clamp(cell * 1.1, 46, 78));
            const pad = Math.round(opt * 0.1);
            const w = opt * 4 + pad * 2, h = opt + pad * 2;
            const rad = Math.round(h * 0.3);
            const tw = opt * 0.86, th = Math.round(opt * 0.4);
            const cx = (x + 0.5) * cell;
            const left = clamp(cx - w / 2, -m + 3, env.view.size + m - 3 - w);
            const tx = clamp(cx - left, rad + tw / 2 + 2, w - rad - tw / 2 - 2);
            const tipY = y * cell + cell * 0.04;
            const top = tipY - th - h;
            const root = div(`cs-promo is-${color}`);
            root.innerHTML = `
                <div class="cs-promo-pop" style="left:${left.toFixed(1)}px;top:${top.toFixed(1)}px;width:${w}px;height:${h + th}px;transform-origin:${tx.toFixed(1)}px ${h + th}px">
                    <div class="cs-promo-tilt" style="transform-origin:${(w / 2).toFixed(1)}px ${(h / 2).toFixed(1)}px">
                        <svg class="cs-promo-shape" width="${w}" height="${h + th}" viewBox="0 0 ${w} ${h + th}" aria-hidden="true"><path d="${capsulePath(w, h, rad, tx, tw, th)}"/></svg>
                        <div class="cs-promo-in" style="left:${pad}px;top:${pad}px;width:${opt * 4}px;height:${opt}px;border-radius:${Math.round(rad * 0.72)}px">
                            <span class="cs-promo-pick" style="width:${opt}px;height:${opt}px;border-radius:${Math.round(rad * 0.72)}px"></span>
                            ${PROMO_KINDS.map((k, i) => `<button type="button" data-promo="${k}" aria-label="${k}" style="left:${i * opt}px;width:${opt}px;height:${opt}px;--i:${i}"><i style="background-image:url('${urls[i]}')"></i></button>`).join('')}
                        </div>
                        <div class="cs-promo-light" style="width:${w}px;height:${h}px;border-radius:${rad}px"></div>
                    </div>
                </div>`;
            r.over.appendChild(root);
            const pop = root.firstElementChild, tilt = pop.firstElementChild;
            const pick = root.querySelector('.cs-promo-pick'), light = root.querySelector('.cs-promo-light');
            const buttons = [...root.querySelectorAll('[data-promo]')];
            const state = {
                root, resolve: null, index: 0, pressed: false, raf: 0, closed: false,
                rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, px: { x: 0, v: 0 }, press: { x: 0, v: 0 },
                wantRx: 0, wantRy: 0, lx: 50, ly: 30,
            };
            promo = state;
            const local = event => {
                // Положение пальца считаем по несдвинутой рамке капсулы: наклон в 3D не должен менять, куда попал палец.
                const box = r.over.getBoundingClientRect();
                const px = event.clientX - box.left - left, py = event.clientY - box.top - top;
                return { px, py, inside: px >= -6 && px <= w + 6 && py >= -6 && py <= h + 8, index: clamp(Math.floor((px - pad) / opt), 0, 3) };
            };
            const setIndex = index => {
                if (index === state.index) return;
                state.index = index;
                buttons.forEach((b, i) => b.classList.toggle('is-on', i === index));
                haptic('select');
                sound('ui_tick', 0.5);
            };
            buttons[0].classList.add('is-on');
            const aim = event => {
                const p = local(event);
                state.wantRy = clamp((p.px - w / 2) / (w / 2), -1.5, 1.5) * 9;
                state.wantRx = -clamp((p.py - h / 2) / (h / 2), -2.2, 2.2) * 6.5;
                state.lx = clamp(p.px / w * 100, -20, 120);
                state.ly = clamp(p.py / h * 100, -40, 140);
                return p;
            };
            const choose = index => {
                if (state.closed) return;
                const kind = PROMO_KINDS[index];
                buttons[index].classList.add('is-chosen');
                pick.classList.add('is-chosen');
                haptic('medium');
                closePromo(kind, env.reduced ? 0 : Math.round(110 * tempo()));
            };
            root.addEventListener('pointerdown', event => {
                event.stopPropagation();
                event.preventDefault();
                const p = aim(event);
                if (!p.inside) { closePromo(null); return; }
                state.pressed = true;
                try { root.setPointerCapture(event.pointerId); } catch (_) {}
                setIndex(p.index);
            });
            root.addEventListener('pointermove', event => {
                const p = aim(event);
                if (p.inside && (state.pressed || event.pointerType === 'mouse')) setIndex(p.index);
            });
            root.addEventListener('pointerup', event => {
                if (!state.pressed) return;
                state.pressed = false;
                const p = local(event);
                if (p.inside) choose(p.index);
                if (event.pointerType !== 'mouse') { state.wantRx = 0; state.wantRy = 0; }
            });
            root.addEventListener('pointerleave', () => { if (!state.pressed) { state.wantRx = 0; state.wantRy = 0; } });
            root.addEventListener('pointercancel', () => { state.pressed = false; state.wantRx = 0; state.wantRy = 0; });
            root.addEventListener('contextmenu', event => event.preventDefault());
            // пружины наклона, подсветки и нажатия
            let last = null;
            const frame = now => {
                if (state.closed) return;
                const dt = last == null ? 1 / 60 : Math.min(0.05, (now - last) / 1000);
                last = now;
                Motion.springStep(state.rx, state.wantRx, 17, 0.62, dt);
                Motion.springStep(state.ry, state.wantRy, 17, 0.62, dt);
                Motion.springStep(state.px, state.index * opt, 30, 0.66, dt);
                Motion.springStep(state.press, state.pressed ? 1 : 0, 34, 0.6, dt);
                const stretch = Math.min(0.32, Math.abs(state.px.v) / opt * 0.016);
                tilt.style.transform = `rotateX(${state.rx.x.toFixed(2)}deg) rotateY(${state.ry.x.toFixed(2)}deg) scale(${(1 - 0.028 * state.press.x).toFixed(4)})`;
                pick.style.transform = `translateX(${state.px.x.toFixed(2)}px) scale(${(1 + stretch).toFixed(3)}, ${(1 - stretch * 0.4).toFixed(3)})`;
                light.style.setProperty('--lx', `${state.lx.toFixed(1)}%`);
                light.style.setProperty('--ly', `${state.ly.toFixed(1)}%`);
                state.raf = requestAnimationFrame(frame);
            };
            if (!env.reduced) state.raf = requestAnimationFrame(frame);
            requestAnimationFrame(() => root.classList.add('show'));
            sound('promo_open', 0.7);
            haptic('light');
            return new Promise(resolve => { state.resolve = resolve; });
        }
        function closePromo(result = null, delay = 0) {
            const state = promo;
            if (!state || state.closed) return;
            state.closed = true;
            promo = null;
            cancelAnimationFrame(state.raf);
            state.root.classList.add('is-closing');
            state.root.classList.remove('show');
            setTimeout(() => state.root.remove(), 240);
            if (delay) setTimeout(() => state.resolve?.(result), delay); else state.resolve?.(result);
        }

        /* ---------- начало партии: шторки противостояния и расстановка ---------- */
        let intro = null;
        /** top, bottom: { color, name, sub, avatar (готовый HTML) }, chip — подпись на шве (контроль времени).
            onOpen() зовётся, когда шторки начинают расходиться. */
        function playIntro({ top, bottom, chip, onOpen }) {
            stopIntro();
            const r = R();
            if (env.reduced || !r.board) { onOpen?.(); return Promise.resolve(); }
            const k = lerp(0.72, 1, clamp((tempo() - 0.6) / 0.4));
            const side = (info, where) => `
                <div class="cs-curtain is-${where} is-${info.color}">
                    <div class="cs-cur-id"><span class="cs-cur-ava">${info.avatar || ''}</span><b>${info.name || ''}</b>${info.sub ? `<small>${info.sub}</small>` : ''}</div>
                </div>`;
            const root = div('cs-intro', `${side(top, 'top')}${side(bottom, 'bottom')}<div class="cs-cur-seam"><i></i>${chip ? `<span>${chip}</span>` : ''}<i></i></div>`);
            root.style.setProperty('--k', String(k));
            r.board.appendChild(root);
            const tl = timeline();
            const state = intro = { root, tl };
            const open = line => {
                if (state.opened) return;
                state.opened = true;
                if (line.fast) root.classList.add('is-fast');
                root.classList.add('is-open');
                try { onOpen?.(line.fast); } catch (_) {}
            };
            const hold = Math.round(760 * k), part = Math.round(560 * k);
            tl.at(hold, open);
            tl.at(hold + part + 40, () => { root.remove(); if (intro === state) intro = null; });
            root.addEventListener('pointerdown', event => { event.stopPropagation(); event.preventDefault(); skipIntro(); });
            requestAnimationFrame(() => root.classList.add('show'));
            return tl.run();
        }
        /** Игрок коснулся доски — шторки расходятся сразу. */
        function skipIntro() {
            const state = intro;
            if (!state || state.opened) return;
            state.tl.fast = true;
            state.opened = true;
            state.root.classList.add('is-fast', 'is-open');
            setTimeout(() => state.tl.skip(), 190);
        }
        function stopIntro() {
            const state = intro;
            if (!state) return;
            intro = null;
            state.tl.stop();
            state.root.remove();
        }
        /** Фигуры «встают» на доску волной от центра к краям; пешки — следом за фигурами. */
        function pieceWave(els, { fast = false, wait = 0 } = {}) {
            if (env.reduced) return 0;
            const k = (fast ? 0.6 : 1) * lerp(0.72, 1, clamp((tempo() - 0.6) / 0.4));
            let longest = 0;
            for (const [sq, el] of els) {
                const face = el.firstChild;
                if (!face?.animate) continue;
                const [x, y] = sqXY(sq);
                const pawnRow = y === 1 || y === 6;
                const delay = Math.round(wait + (Math.abs(x - 3.5) * 24 + (pawnRow ? 80 : 0)) * k);
                const dir = y < 4 ? -1 : 1;   // каждая армия опускается со своей стороны
                const frames = [];
                const n = 16;
                for (let i = 0; i <= n; i++) {
                    const u = i / n;
                    const p = 1 - Motion.springAt(1, 0, 13, 0.52, u).x;   // пружина с одним перелётом
                    const land = u > 0.34 ? Motion.ring((u - 0.34) * 0.42, 40, 0.4) : 0;
                    frames.push({
                        offset: u, opacity: clamp(u * 4.5),
                        transform: `translateY(${((1 - p) * dir * 46).toFixed(2)}%) scale(${(lerp(0.62, 1, clamp(p)) + 0.035 * land).toFixed(4)}, ${(lerp(0.62, 1, clamp(p)) - 0.06 * land).toFixed(4)})`,
                    });
                }
                frames[n].transform = Motion.FACE_REST;
                const duration = Math.round(430 * k);
                face.animate(frames, { duration, delay, easing: 'linear', fill: 'backwards' });
                longest = Math.max(longest, delay + duration);
            }
            return longest;
        }

        /* ---------- пилюли итога над королями ---------- */
        const PILL_ICON = {
            win: '<svg viewBox="0 0 24 24"><path d="M3.4 18.6 2.3 7.9l5.6 4L12 4.4l4.1 7.5 5.6-4-1.1 10.7z"/></svg>',
            mate: '<svg viewBox="0 0 24 24"><path d="M9.2 3.5 7.6 20.5M16.4 3.5l-1.6 17M4 9h17M3 15.2h17" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>',
            resign: '<svg viewBox="0 0 24 24"><path d="M6 21V4" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M7.5 4.6h11.3l-2.6 4.2 2.6 4.2H7.5z"/></svg>',
            time: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12.5" r="8" fill="none" stroke="#fff" stroke-width="2.8"/><path d="M12 8v5l3.2 2" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            draw: '<svg viewBox="0 0 24 24"><path d="M5 9.5h14M5 15h14" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/></svg>',
            left: '<svg viewBox="0 0 24 24"><path d="M14 4h4.5a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 8l-4 4 4 4M6 12h9" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        };
        /** list: [{ sq, tone: 'win' | 'loss' | 'draw', icon, text }]. animate — с пружинным появлением и звуком. */
        function showPills(list, { animate = true } = {}) {
            clearPills();
            const layer = R().over;
            if (!layer) return;
            const m = parseFloat(getComputedStyle(R().frame).getPropertyValue('--m')) || 16;
            list.forEach((item, i) => {
                const node = onSq(div(`cs-pill is-${item.tone}${animate && !env.reduced ? ' is-in' : ''}`), item.sq);
                node.innerHTML = `<span style="--pd:${i * 150}ms"><i>${PILL_ICON[item.icon] || ''}</i><b></b></span>`;
                node.querySelector('b').textContent = item.text;
                layer.appendChild(node);
                // пилюля не вылезает за рамку доски: сдвигаем её, а хвостик остаётся над королём
                const span = node.firstElementChild;
                const box = span.getBoundingClientRect(), host = layer.getBoundingClientRect();
                const over = Math.max(0, box.right - (host.right + m - 2)) - Math.max(0, (host.left - m + 2) - box.left);
                if (over) { span.style.setProperty('--dx', `${-over.toFixed(1)}px`); }
                if (animate && !env.reduced) setTimeout(() => { sound(item.tone === 'win' ? 'pill_win' : 'pill', 0.7); haptic(item.tone === 'win' ? 'success' : 'light'); }, i * 150 + 60);
            });
        }
        function clearPills() { R().over?.querySelectorAll('.cs-pill').forEach(node => node.remove()); }

        /* ---------- фильм мата: вид сверху, камера наезжает на развязку ----------
           Доска темнеет, лишние фигуры гаснут; матующая фигура возвращается на свою
           клетку и повторяет ход насыщенным неоном; от клетки удара по линии шаха
           бегут красные клетки и стрелка; клетки вокруг короля, куда ему нельзя,
           загораются по одной (и вспыхивает фигура, которая их держит); король
           дрожит и падает; камера отъезжает, по доске проходит блик. */
        let film = null;
        const camTf = (z, cx, cy) => `scale(${z.toFixed(4)}) translate(${((4 / z - cx) * 12.5).toFixed(3)}%, ${((4 / z - cy) * 12.5).toFixed(3)}%)`;
        function svgEl(name, attrs) {
            const node = document.createElementNS(SVG_NS, name);
            for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
            return node;
        }
        function filmArrow(svg, from, to, cls) {
            const [x0, y0] = sqXY(from), [x1, y1] = sqXY(to);
            const a = [x0 + 0.5, y0 + 0.5], b = [x1 + 0.5, y1 + 0.5];
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
            const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
            const s = [a[0] + ux * 0.3, a[1] + uy * 0.3], e = [b[0] - ux * 0.52, b[1] - uy * 0.52];
            const g = svgEl('g', { class: cls });
            g.appendChild(svgEl('path', { d: `M${s[0].toFixed(3)} ${s[1].toFixed(3)}L${e[0].toFixed(3)} ${e[1].toFixed(3)}`, pathLength: '1' }));
            const hw = 0.2, hl = 0.3;
            g.appendChild(svgEl('polygon', { points: [[e[0] + ux * hl, e[1] + uy * hl], [e[0] - uy * hw, e[1] + ux * hw], [e[0] + uy * hw, e[1] - ux * hw]].map(p => p.map(v => v.toFixed(3)).join(',')).join(' ') }));
            svg.appendChild(g);
            return g;
        }
        /** spec: { els: Map клетка → фигура, move: { from, to }, kingSq, checkers: [клетки],
            lines: { клетка шахующего: [клетки между ним и королём] }, cage: [{ sq, by }] }. */
        function playMate(spec) {
            stopMate();
            const r = R();
            const mover = spec.els.get(spec.move.to), king = spec.els.get(spec.kingSq);
            if (env.reduced || !r.cam?.animate || !king) {
                king?.classList.add('is-fallen');
                return Promise.resolve();
            }
            const board = r.board, cam = r.cam, fx = r.fx;
            const svg = document.createElementNS(SVG_NS, 'svg');
            svg.setAttribute('class', 'cs-film-svg');
            svg.setAttribute('viewBox', '0 0 8 8');
            svg.setAttribute('preserveAspectRatio', 'none');
            r.fxTop.appendChild(svg);
            const made = [svg];
            const keys = new Set([mover, king, ...spec.checkers.map(sq => spec.els.get(sq))].filter(Boolean));
            const tile = (sq, cls) => { const node = spot(fx, `cs-tile ${cls}`, sq, 0); made.push(node); return node; };
            // куда смотрит камера: ход, король и клетки вокруг него
            const pts = [spec.move.from, spec.move.to, spec.kingSq, ...spec.checkers, ...spec.cage.map(c => c.sq)].map(sqXY);
            const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
            const x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, y0 = Math.min(...ys), y1 = Math.max(...ys) + 1;
            const zoom = clamp(8 / (Math.max(x1 - x0, y1 - y0) + 1.7), 1.12, 1.72);
            const half = 4 / zoom;
            const cx = clamp((x0 + x1) / 2, half, 8 - half), cy = clamp((y0 + y1) / 2, half, 8 - half);
            const tl = timeline();
            const state = film = { tl, made, board, cam, keys, anims: [], mover, king, spec, ghosts: [] };
            const anim = (node, frames, options) => { if (tl.fast || !node?.animate) return null; const a = node.animate(frames, options); state.anims.push(a); return a; };
            const [fx0, fy0] = sqXY(spec.move.from), [tx0, ty0] = sqXY(spec.move.to);
            const moverFace = mover?.firstChild;

            // 0. доска темнеет, камера наезжает
            tl.at(0, () => {
                board.classList.add('is-film');
                r.frame.classList.add('is-film');   // буквы и цифры рамки гаснут: камера уезжает от них
                keys.forEach(el => el.classList.add('is-key'));
                king.classList.add('is-doomed');
                anim(cam, [{ transform: camTf(1, 4, 4) }, { transform: camTf(zoom, cx, cy) }], { duration: 760, easing: 'cubic-bezier(.5, 0, .2, 1)', fill: 'forwards' });
                sound('mate_rise', 0.8);
            });
            // 1. матующая фигура гаснет на клетке удара и возвращается на свою
            tl.at(110, () => { anim(moverFace, [{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards', easing: 'ease-in' }); });
            tl.at(250, line => {
                if (!mover || line.fast) return;
                state.anims = state.anims.filter(a => { if (a.effect?.target === moverFace) { a.cancel(); return false; } return true; });
                mover.style.transform = tf(fx0, fy0);
                mover.classList.add('is-neon');
                // «замах»: фигура наливается светом и чуть отклоняется назад
                const back = Math.atan2(ty0 - fy0, tx0 - fx0);
                anim(moverFace, [
                    { opacity: 0, transform: 'scale(.8)' },
                    { opacity: 1, transform: `translate(${(-Math.cos(back) * 7).toFixed(1)}%, ${(-Math.sin(back) * 7).toFixed(1)}%) scale(1.2)`, offset: 0.7 },
                    { opacity: 1, transform: `translate(${(-Math.cos(back) * 9).toFixed(1)}%, ${(-Math.sin(back) * 9).toFixed(1)}%) scale(1.16)` },
                ], { duration: 230, easing: 'cubic-bezier(.2, .8, .3, 1)', fill: 'forwards' });
            });
            // 2. удар: стремительный полёт со шлейфом
            const FLY = 250, STRIKE = 500;
            tl.at(STRIKE, line => {
                if (!mover) return;
                mover.style.transform = tf(tx0, ty0);
                if (line.fast) return;
                state.anims = state.anims.filter(a => { if (a.effect?.target === moverFace) { a.cancel(); return false; } return true; });
                const path = [{ transform: tf(fx0, fy0) }, { transform: tf(tx0, ty0) }];
                const ease = 'cubic-bezier(.55, 0, .85, .35)';
                mover.classList.add('moving');
                anim(mover, path, { duration: FLY, easing: ease });
                anim(moverFace, [{ transform: 'scale(1.16)' }, { transform: 'scale(1.3)', offset: 0.5 }, { transform: 'scale(1.12)' }], { duration: FLY, easing: 'ease-in' });
                for (let i = 1; i <= 3; i++) {
                    const ghost = mover.cloneNode(true);
                    ghost.classList.add('cs-ghost');
                    ghost.style.setProperty('--go', String(0.36 - i * 0.09));
                    mover.parentNode.insertBefore(ghost, mover);
                    state.ghosts.push(ghost);
                    ghost.style.transform = tf(tx0, ty0);
                    const a = ghost.animate(path, { duration: FLY, delay: i * 26, easing: ease, fill: 'backwards' });
                    a.onfinish = () => ghost.remove();
                }
            });
            const HIT = STRIKE + FLY;
            tl.at(HIT, line => {
                mover?.classList.remove('moving');
                tile(spec.move.to, 'is-win');
                if (line.fast) return;
                made.push(spot(r.fxTop, 'cs-shock is-win', spec.move.to, 0));
                anim(moverFace, Motion.landFace({ from: 'scale(1.12)', contact: 0, power: 2.1 }).frames, { duration: 300, easing: 'linear' });
                thump(0.02);
                haptic('heavy');
                sound('mate_hit', 1);
            });
            // 3. красная волна по линии шаха и стрелка к королю
            let longest = 0;
            spec.checkers.forEach((sq, c) => {
                const lane = spec.lines[sq] || [];
                longest = Math.max(longest, lane.length);
                lane.forEach((cell, i) => tl.at(HIT + 70 + i * 46, () => tile(cell, 'is-lane')));
                tl.at(HIT + 60 + c * 60, line => { const arrow = filmArrow(svg, sq, spec.kingSq, 'cs-film-arrow'); if (line.fast) arrow.classList.add('is-done'); });
            });
            const KING = HIT + 90 + longest * 46;
            tl.at(KING, line => {
                tile(spec.kingSq, 'is-king');
                if (line.fast) return;
                king.classList.add('is-tremble');
                haptic('medium');
            });
            // 4. клетка за клеткой: королю некуда идти
            const cage = spec.cage;
            const step = cage.length ? clamp(640 / cage.length, 82, 132) : 0;
            const CAGE = KING + 260;
            cage.forEach((cell, i) => tl.at(CAGE + i * step, line => {
                // клетка с самой матующей фигурой остаётся зелёной: её защищают — вспыхнет только защитник
                if (!spec.checkers.includes(cell.sq) && cell.sq !== spec.move.to) tile(cell.sq, 'is-cage');
                const guard = cell.by ? spec.els.get(cell.by) : null;
                if (guard) { guard.classList.add('is-key'); keys.add(guard); }
                if (line.fast) return;
                if (cell.by) {
                    const [gx, gy] = sqXY(cell.by), [sx, sy] = sqXY(cell.sq);
                    svg.appendChild(svgEl('line', { class: 'cs-film-guard', x1: gx + 0.5, y1: gy + 0.5, x2: sx + 0.5, y2: sy + 0.5, pathLength: '1' }));
                    anim(guard?.firstChild, Motion.pulseFace({ amp: 0.13, w: 34, z: 0.42 }).frames, { duration: 300, easing: 'linear' });
                }
                haptic('light');
                sound('mate_tick', 0.75, 0, 1 + i * 0.07);
            }));
            // 5. король падает
            const FALL = CAGE + cage.length * step + 150;
            tl.at(FALL, line => {
                king.classList.remove('is-tremble');
                king.classList.add('is-fallen');
                if (line.fast) return;
                const frames = [];
                const n = 22, drop = 0.56;
                for (let i = 0; i <= n; i++) {
                    const u = i / n;
                    // падение под тяжестью, удар о доску и короткий отскок
                    const angle = u < drop ? 90 * Math.pow(u / drop, 2.2) : 90 - 8 * Motion.ring((u - drop) * 0.4, 30, 0.34);
                    frames.push({ offset: u, transform: `translate(${(-3 * angle / 90).toFixed(2)}%, ${(9 * angle / 90).toFixed(2)}%) rotate(${(-angle).toFixed(2)}deg)` });
                }
                anim(king.firstChild, frames, { duration: 520, easing: 'linear' });
            });
            tl.at(FALL + 290, line => {
                if (line.fast) return;
                made.push(spot(r.fxTop, 'cs-shock is-loss', spec.kingSq, 0));
                thump(0.014);
                haptic('heavy');
                sound('mate_fall', 0.95);
            });
            // 6. камера отъезжает, свет возвращается, по доске проходит блик
            const BACK = FALL + 760;
            tl.at(BACK, line => {
                board.classList.add('is-film-out');
                r.frame.classList.remove('is-film');
                if (line.fast) return;
                anim(cam, [{ transform: camTf(zoom, cx, cy) }, { transform: camTf(1, 4, 4) }], { duration: 760, easing: 'cubic-bezier(.6, 0, .2, 1)', fill: 'forwards' });
                sound('mate_out', 0.7);
            });
            tl.at(BACK + 300, line => { if (!line.fast) { const sheen = div('cs-sheen', '<i></i>'); cam.appendChild(sheen); made.push(sheen); } });
            tl.at(BACK + 800, () => endMate(state));
            board.addEventListener('pointerdown', state.onTap = event => { event.stopPropagation(); event.preventDefault(); tl.skip(); }, { capture: true });
            return tl.run();
        }
        function endMate(state) {
            if (state.ended) return;
            state.ended = true;
            if (film === state) film = null;
            state.board.removeEventListener('pointerdown', state.onTap, { capture: true });
            state.anims.forEach(a => { try { a.cancel(); } catch (_) {} });
            state.ghosts.forEach(g => g.remove());
            state.made.forEach(node => node.remove());
            state.board.classList.remove('is-film', 'is-film-out');
            R().frame?.classList.remove('is-film');
            state.keys.forEach(el => el.classList.remove('is-key', 'is-neon', 'is-tremble', 'is-doomed', 'moving'));
            if (state.mover) { const [x, y] = sqXY(state.spec.move.to); state.mover.style.transform = tf(x, y); }
        }
        /** Обрывает фильм (новая партия, листание ходов, выход). */
        function stopMate() {
            const state = film;
            if (!state) return;
            state.tl.stop();
            endMate(state);
        }
        const skipMate = () => film?.tl.skip();

        return {
            ripple, check, thump, sparkle, prepareMorph, morph,
            openPromo, closePromo, get promoOpen() { return !!promo; },
            playIntro, skipIntro, stopIntro, pieceWave, get introOn() { return !!intro; },
            showPills, clearPills,
            playMate, stopMate, skipMate, get filmOn() { return !!film; },
        };
    }

    window.SparkChessFx = { create, timeline, PROMO_KINDS: ['q', 'r', 'b', 'n'] };
})();
