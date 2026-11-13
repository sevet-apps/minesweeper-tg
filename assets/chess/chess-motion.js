/* Spark Chess: физика «магнитной эластичной» доски. Один характер движения на
   всё: фигура идёт за пальцем на жёсткой пружине, центры доступных клеток
   притягивают её, как лунки с магнитом, скорость наклоняет и чуть вытягивает
   фигуру, а посадка — короткий упругий щелчок. Здесь же темп партии (пуля и
   блиц — всё короче) и перетекание пешки в новую фигуру по полям расстояний.
   Только математика, без DOM: работает и в Mini App (globalThis
   .SparkChessMotion), и в тестах (require). Единицы — клетка доски (сторона
   клетки = 1), секунды; длительности анимаций — миллисекунды. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SparkChessMotion = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, k) => a + (b - a) * k;
    const smooth = k => { k = clamp(k); return k * k * (3 - 2 * k); };

    /* Один тщательно настроенный характер — без режимов и переключателей. */
    const FEEL = Object.freeze({
        // фигура за пальцем
        followW: 82, followZ: 0.86,     // пружина «рука → фигура»: без болтанки, с едва заметной инерцией
        liftMouse: 1.14, liftTouch: 1.24, // поднятая фигура крупнее (под пальцем её должно быть видно)
        rise: 0.07,                     // и приподнята над клеткой, доля клетки
        tiltGain: 0.62, tiltMax: 8.5,   // наклон: градусов на клетку/с и предел
        tiltW: 24, tiltZ: 0.46,         // наклон возвращается с одним мягким покачиванием
        stretchGain: 0.0042, stretchMax: 0.055,
        // магнит клетки
        magnetR: 0.62,                  // радиус, с которого клетка начинает тянуть
        magnetK: 0.58,                  // у самого центра фигура проходит лишь 42% пути пальца
        catchR: 0.4,                    // «поймана»: отклик поверхности и тактильный тик
        catchDip: 0.035,                // пойманная фигура чуть опускается к клетке
        // посадка
        snapW: 40, snapZ: 0.58,         // щелчок в центр: один короткий перелёт и возврат
        squash: 0.085,                  // сжатие при касании
        squashW: 46, squashZ: 0.42,
        // обычный ход (нажатием, ход соперника)
        hop: 1.1, hopKnight: 1.17,
        lean: 5.5,                      // наклон по ходу, градусы
        travelZ: [0.7, 0.86],           // демпфирование хода: короткий — упруже, длинный — строже
    });

    /** Темп партии: пуля и блиц — частые эффекты короче. Редкие события (мат) не ускоряются. */
    const TEMPO = Object.freeze({ bullet: 0.6, blitz: 0.78, rapid: 0.94, classical: 1, none: 1 });
    function tempoFor(cat, { lowTime = false } = {}) {
        const base = TEMPO[cat] ?? 1;
        return Math.max(0.5, lowTime ? base * 0.82 : base);
    }

    /* ---------- пружины ---------- */
    /** Шаг пружины (полунеявный Эйлер с подшагами): state = { x, v } тянется к target. */
    function springStep(state, target, w, z, dt) {
        const n = Math.max(1, Math.ceil(dt * 240));
        const h = dt / n;
        for (let i = 0; i < n; i++) {
            state.v += (-w * w * (state.x - target) - 2 * z * w * state.v) * h;
            state.x += state.v * h;
        }
        return state.x;
    }

    /** Точное решение пружины: отклонение x0 и скорость v0 в момент 0 → { x, v } через t секунд (цель — 0). */
    function springAt(x0, v0, w, z, t) {
        if (t <= 0) return { x: x0, v: v0 };
        if (z < 1) {
            const wd = w * Math.sqrt(1 - z * z);
            const e = Math.exp(-z * w * t), c = Math.cos(wd * t), s = Math.sin(wd * t);
            const b = (v0 + z * w * x0) / wd;
            return { x: e * (x0 * c + b * s), v: e * (v0 * c - (z * w * b + wd * x0) * s) };
        }
        // критическое демпфирование (z ≥ 1 считаем как 1 — нам достаточно)
        const e = Math.exp(-w * t), b = v0 + w * x0;
        return { x: e * (x0 + b * t), v: e * (v0 - w * b * t) };
    }

    /** Когда пружина успокоится (огибающая упадёт до eps), секунды. */
    const settleTime = (w, z, eps = 0.01) => Math.log(1 / eps) / (Math.max(0.05, Math.min(z, 1)) * w);

    /* ---------- перетаскивание ---------- */
    /** Куда магнит клетки сдвигает фигуру: point — куда её тянет палец (центр фигуры, клетки),
        targets — центры доступных клеток [[x, y, key]]. Возвращает точку и пойманную клетку. */
    function magnet(point, targets, f = FEEL) {
        let best = null, bestD = Infinity;
        for (const t of targets) {
            const d = Math.hypot(point[0] - t[0], point[1] - t[1]);
            if (d < bestD) { bestD = d; best = t; }
        }
        if (!best || bestD >= f.magnetR) return { x: point[0], y: point[1], caught: null, pull: 0 };
        const u = bestD / f.magnetR;
        const pull = f.magnetK * (1 - u * u) * (1 - u * u);
        return {
            x: lerp(point[0], best[0], pull), y: lerp(point[1], best[1], pull),
            caught: bestD < f.catchR ? (best[2] ?? best) : null, pull,
        };
    }

    /** Фигура в руке. start — её центр в клетках; touch — палец (фигура крупнее). */
    function createDrag(start, { touch = false, tempo = 1, lift: lifted = 0, feel = FEEL } = {}) {
        const f = feel;
        const px = { x: start[0], v: 0 }, py = { x: start[1], v: 0 };
        const tilt = { x: 0, v: 0 };
        const lift = { x: clamp(lifted), v: 0 };   // 0 — стоит на клетке, 1 — поднята (выбранная уже приподнята)
        const st = { tx: start[0], ty: start[1], stretch: 0, angle: 0, dip: 0, caught: null };
        const followW = f.followW / Math.max(0.75, Math.sqrt(tempo));   // в пуле держится за пальцем плотнее
        const liftScale = touch ? f.liftTouch : f.liftMouse;
        return {
            get x() { return px.x; }, get y() { return py.x; },
            get vx() { return px.v; }, get vy() { return py.v; },
            get tilt() { return tilt.x; }, get lift() { return lift.x; },
            get stretch() { return st.stretch; }, get angle() { return st.angle; },
            get caught() { return st.caught; },
            liftScale,
            /** Палец в точке (x, y) — центр фигуры под ним; targets — центры доступных клеток. */
            aim(x, y, targets = []) {
                const m = magnet([x, y], targets, f);
                st.tx = m.x; st.ty = m.y; st.caught = m.caught;
                return m.caught;
            },
            step(dt) {
                if (!(dt > 0)) return;
                dt = Math.min(dt, 0.05);            // после паузы вкладки не дёргаемся
                springStep(px, st.tx, followW, f.followZ, dt);
                springStep(py, st.ty, followW, f.followZ, dt);
                springStep(lift, 1, 30, 0.5, dt);   // подъём — с маленьким «выпрыгиванием»
                const speed = Math.hypot(px.v, py.v);
                // верх фигуры ведёт, основание отстаёт: наклон по горизонтальной скорости
                springStep(tilt, clamp(px.v * f.tiltGain, -f.tiltMax, f.tiltMax), f.tiltW, f.tiltZ, dt);
                const want = Math.min(f.stretchMax, speed * f.stretchGain);
                st.stretch += (want - st.stretch) * (1 - Math.exp(-dt * 24));
                if (speed > 0.6) st.angle = Math.atan2(py.v, px.v) * 180 / Math.PI;
                st.dip += ((st.caught ? f.catchDip : 0) - st.dip) * (1 - Math.exp(-dt * 20));
            },
            /** CSS-трансформация самой фигуры (внутри её клетки). */
            face() {
                const s = st.stretch, a = st.angle.toFixed(1);
                const k = 1 + (liftScale - 1 - st.dip) * lift.x;
                const rise = -(f.rise - st.dip * 0.6) * lift.x * 100;
                return `translateY(${rise.toFixed(2)}%) rotate(${tilt.x.toFixed(2)}deg) rotate(${a}deg) scale(${(1 + s).toFixed(4)}, ${(1 - s * 0.62).toFixed(4)}) rotate(${-a}deg) scale(${k.toFixed(4)})`;
            },
        };
    }

    /* ---------- полёт и посадка ---------- */
    /** Длительность обычного хода, мс: короткие — быстрые, длинные не тянутся. */
    function travelMs(dist, tempo = 1) {
        return Math.round(Math.min(330, 150 + 58 * Math.sqrt(dist)) * tempo);
    }
    /** Ход по Эрмиту: уверенный старт (наклон s0) и приход в клетку с остаточной скоростью s1 —
        её гасит пружина посадки, поэтому перелёт продолжает движение без рывка. */
    const easeTravel = (u, s1 = 0, s0 = 2.3) => {
        u = clamp(u);
        const u2 = u * u, u3 = u2 * u;
        return (u3 - 2 * u2 + u) * s0 + (3 * u2 - 2 * u3) + (u3 - u2) * s1;
    };
    /** Отклик пружины на толчок, приведённый к первому пику = 1 (дальше — затухающие качания). */
    function ring(t, w, z) {
        if (t <= 0) return 0;
        const wd = w * Math.sqrt(1 - z * z);
        const peak = Math.exp(-z * w * Math.atan2(wd, z * w) / wd) / w;
        return springAt(0, 1, w, z, t).x / peak;
    }

    /** Путь фигуры к клетке. from, to — левый верхний угол фигуры в клетках.
        dropped — её отпустили из руки со скоростью (vx, vy): тогда это щелчок магнита.
        Возвращает кадры [{ offset, x, y }], полную длительность и момент касания (мс). */
    function flight(from, to, { tempo = 1, dropped = false, vx = 0, vy = 0, feel = FEEL } = {}) {
        const f = feel;
        const dx = to[0] - from[0], dy = to[1] - from[1];
        const dist = Math.hypot(dx, dy);
        const frames = [];
        if (dropped) {
            // пружина из текущей точки с остаточной скоростью руки
            const w = f.snapW / Math.sqrt(tempo), z = f.snapZ;
            const cap = 16, sp = Math.hypot(vx, vy), kv = sp > cap ? cap / sp : 1;
            const total = Math.min(0.36, settleTime(w, z, 0.012));
            const steps = Math.max(4, Math.round(total * 60));
            let contact = null;
            for (let i = 0; i <= steps; i++) {
                const t = total * i / steps;
                const sx = springAt(-dx, vx * kv, w, z, t), sy = springAt(-dy, vy * kv, w, z, t);
                if (contact == null && Math.hypot(sx.x, sy.x) < Math.max(0.06, dist * 0.22)) contact = t;
                frames.push({ offset: i / steps, x: to[0] + sx.x, y: to[1] + sy.x });
            }
            frames[frames.length - 1].x = to[0];
            frames[frames.length - 1].y = to[1];
            return { frames, duration: Math.round(total * 1000), contact: Math.round((contact ?? total * 0.3) * 1000), dist };
        }
        // Обычный ход — тоже пружина: фигура мягко разгоняется, тормозит у клетки, чуть
        // перелетает центр и возвращается одним непрерывным движением. Короткий ход упруже.
        const travel = travelMs(dist, tempo);
        if (!dist) return { frames: [{ offset: 0, x: to[0], y: to[1] }, { offset: 1, x: to[0], y: to[1] }], duration: travel, contact: travel, dist };
        const z = lerp(f.travelZ[0], f.travelZ[1], clamp(dist / 6));
        const root = Math.sqrt(1 - z * z);
        // жёсткость такова, что центр клетки фигура впервые проходит ровно в момент travel
        const w = (Math.PI - Math.atan2(root, z)) / (root * travel / 1000);
        const settle = Math.min(260, Math.max(0, settleTime(w, z, 0.004 / Math.max(dist, 0.5)) * 1000 - travel));
        const total = travel + settle;
        const steps = Math.max(6, Math.round(total / 16));
        for (let i = 0; i <= steps; i++) {
            const k = 1 - springAt(1, 0, w, z, total * i / steps / 1000).x;
            frames.push({ offset: i / steps, x: from[0] + dx * k, y: from[1] + dy * k });
        }
        frames[frames.length - 1].x = to[0];
        frames[frames.length - 1].y = to[1];
        return { frames, duration: Math.round(total), contact: travel, dist };
    }

    const faceTf = (rise, rot, sx, sy) => `translateY(${(rise * 100).toFixed(2)}%) rotate(${rot.toFixed(2)}deg) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
    const FACE_REST = 'translateY(0%) rotate(0deg) scale(1, 1)';

    /** Кадры самой фигуры в обычном ходе: подъём, наклон по ходу, касание и упругое сжатие.
        dx — смещение по горизонтали в клетках (со знаком). Возвращает [{ offset, transform }]. */
    function flightFace({ contact, duration, dx = 0, dist = 1, knight = false, power = 1, tempo = 1, feel = FEEL }) {
        const f = feel;
        const hop = (knight ? f.hopKnight : f.hop) - 1;
        const lean = dist ? f.lean * clamp(dx / Math.max(1, dist), -1, 1) * Math.min(1, 0.5 + dist / 4) : 0;
        const sq = f.squash * power * Math.sqrt(tempo);
        const w = f.squashW / Math.sqrt(tempo), z = f.squashZ;
        const tail = Math.min(0.3, settleTime(w, z, 0.05)) * 1000;
        const total = Math.max(duration, contact + tail);
        const steps = Math.max(8, Math.round(total / 16));
        const out = [];
        for (let i = 0; i <= steps; i++) {
            const t = total * i / steps;
            let sx = 1, sy = 1, rot = 0, rise = 0;
            if (t < contact) {
                const u = t / contact, arc = Math.sin(Math.PI * u);
                sx = sy = 1 + hop * arc;
                rise = -f.rise * 0.6 * arc;
                rot = lean * Math.sin(Math.PI * Math.min(1, u * 1.12));
            } else {
                // касание: фигура сжимается и пружинит обратно; наклон отыгрывает в обратную сторону
                const r = ring((t - contact) / 1000, w, z);
                sy = 1 - sq * r; sx = 1 + sq * 0.55 * r;
                rot = -lean * 0.3 * r;
            }
            out.push({ offset: i / steps, transform: faceTf(rise, rot, sx, sy) });
        }
        out[out.length - 1].transform = FACE_REST;
        return { frames: out, duration: Math.round(total) };
    }

    /** Кадры посадки фигуры, отпущенной из руки: из её текущей трансформации — сжатие в момент касания. */
    function landFace({ from, contact, power = 1, tempo = 1, feel = FEEL }) {
        const f = feel;
        const sq = f.squash * power * Math.sqrt(tempo);
        const w = f.squashW / Math.sqrt(tempo), z = f.squashZ;
        const tail = Math.min(0.3, settleTime(w, z, 0.05)) * 1000;
        const total = contact + tail;
        const steps = Math.max(6, Math.round(tail / 16));
        const out = [{ offset: 0, transform: from }];
        for (let i = 0; i <= steps; i++) {
            const t = tail * i / steps;
            const r = ring(t / 1000, w, z);
            out.push({ offset: (contact + t) / total, transform: faceTf(0, 0, 1 + sq * 0.55 * r, 1 - sq * r) });
        }
        out[out.length - 1].transform = FACE_REST;
        return { frames: out, duration: Math.round(total) };
    }

    /** Короткий упругий отклик фигуры на месте (выбор, шах): кадры масштаба от толчка силы amp. */
    function pulseFace({ amp = 0.06, w = 40, z = 0.4, rest = FACE_REST, lift = 0, scale = 1 } = {}) {
        const tail = Math.min(0.42, settleTime(w, z, 0.04)) * 1000;
        const steps = Math.max(6, Math.round(tail / 16));
        const out = [];
        for (let i = 0; i <= steps; i++) {
            const r = ring(tail * i / steps / 1000, w, z);
            out.push({ offset: i / steps, transform: faceTf(lift, 0, scale * (1 + amp * r), scale * (1 + amp * r)) });
        }
        out[out.length - 1].transform = rest;
        return { frames: out, duration: Math.round(tail) };
    }

    /** CSS linear() для пружины (перелёт задаёт z): ею пружинят переходы интерфейса. */
    function springEasing(z = 0.5, points = 28) {
        const w = settleTime(1, z, 0.004);   // так, чтобы к t = 1 пружина успокоилась
        const out = [];
        for (let i = 0; i <= points; i++) {
            const t = i / points;
            out.push((1 - springAt(1, 0, w, z, t).x).toFixed(4).replace(/\.?0+$/, '') || '0');
        }
        out[out.length - 1] = '1';
        return `linear(${out.join(', ')})`;
    }

    /* ---------- поля расстояний: пешка перетекает в новую фигуру ---------- */
    /** Расстояние до ближайшего «зерна» (8SSEDT): seed[i] = 1 — зерно. Возвращает
        расстояния в пикселях и индекс ближайшего зерна для каждой точки. */
    function nearestField(seed, n) {
        const INF = 1e6;
        const ox = new Float32Array(n * n), oy = new Float32Array(n * n);
        for (let i = 0; i < n * n; i++) { ox[i] = seed[i] ? 0 : INF; oy[i] = seed[i] ? 0 : INF; }
        const test = (i, x, y, dx, dy) => {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= n || ny >= n) return;
            const j = ny * n + nx;
            const cx = ox[j] + dx, cy = oy[j] + dy;
            if (cx * cx + cy * cy < ox[i] * ox[i] + oy[i] * oy[i]) { ox[i] = cx; oy[i] = cy; }
        };
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) { const i = y * n + x; test(i, x, y, -1, 0); test(i, x, y, 0, -1); test(i, x, y, -1, -1); test(i, x, y, 1, -1); }
            for (let x = n - 1; x >= 0; x--) test(y * n + x, x, y, 1, 0);
        }
        for (let y = n - 1; y >= 0; y--) {
            for (let x = n - 1; x >= 0; x--) { const i = y * n + x; test(i, x, y, 1, 0); test(i, x, y, 0, 1); test(i, x, y, 1, 1); test(i, x, y, -1, 1); }
            for (let x = 0; x < n; x++) test(y * n + x, x, y, -1, 0);
        }
        const dist = new Float32Array(n * n), near = new Int32Array(n * n);
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const i = y * n + x;
                if (ox[i] >= INF) { dist[i] = INF; near[i] = -1; continue; }
                dist[i] = Math.hypot(ox[i], oy[i]);
                near[i] = (y + Math.round(oy[i])) * n + (x + Math.round(ox[i]));
            }
        }
        return { dist, near };
    }

    /** Силуэт и цвета фигуры для перетекания. rgba — картинка n × n (Uint8ClampedArray).
        sdf — знаковое расстояние в пикселях (< 0 внутри); fill — цвет «нутра», растянутый
        на весь квадрат; edge — цвет кромки (обводки), тоже растянутый. */
    function analyzeFigure(rgba, n, band = Math.max(2, n * 0.026)) {
        const inside = new Uint8Array(n * n), outside = new Uint8Array(n * n);
        for (let i = 0; i < n * n; i++) { inside[i] = rgba[i * 4 + 3] >= 128 ? 1 : 0; outside[i] = 1 - inside[i]; }
        const toIn = nearestField(inside, n), toOut = nearestField(outside, n);
        const raw = new Float32Array(n * n);
        for (let i = 0; i < n * n; i++) {
            // полпикселя поправки по прозрачности: край гладкий, а не ступеньками
            const a = rgba[i * 4 + 3] / 255;
            raw[i] = (inside[i] ? -(toOut.dist[i] - 0.5) : toIn.dist[i] - 0.5) + (0.5 - a) * 0.6;
        }
        // лёгкое сглаживание поля: смесь двух силуэтов не «звенит» на диагоналях
        const sdf = new Float32Array(n * n);
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                let sum = 0, wsum = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = x + dx, ny = y + dy;
                        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
                        const wgt = dx === 0 && dy === 0 ? 4 : (dx === 0 || dy === 0 ? 2 : 1);
                        sum += raw[ny * n + nx] * wgt; wsum += wgt;
                    }
                }
                sdf[y * n + x] = sum / wsum;
            }
        }
        const deep = new Uint8Array(n * n), rim = new Uint8Array(n * n);
        let deepCount = 0;
        for (let i = 0; i < n * n; i++) {
            if (raw[i] < -band) { deep[i] = 1; deepCount++; } else if (inside[i]) rim[i] = 1;
        }
        if (!deepCount) for (let i = 0; i < n * n; i++) deep[i] = inside[i];   // совсем тонкая фигура
        const spread = seeds => {
            const { near } = nearestField(seeds, n);
            const out = new Uint8ClampedArray(n * n * 3);
            for (let i = 0; i < n * n; i++) {
                const j = near[i] < 0 ? i : near[i];
                out[i * 3] = rgba[j * 4]; out[i * 3 + 1] = rgba[j * 4 + 1]; out[i * 3 + 2] = rgba[j * 4 + 2];
            }
            return out;
        };
        let area = 0;
        for (let i = 0; i < n * n; i++) area += inside[i];
        return { n, sdf, band, fill: spread(deep), edge: spread(rim.some(Boolean) ? rim : inside), area: area / (n * n) };
    }

    /** Кадр перетекания a → b в момент k (0 — a, 1 — b; чуть больше 1 — упругий перелёт формы).
        bulge — насколько материал «набухает» в середине (пиксели). Пишет RGBA в out. */
    function morphFrame(a, b, k, out, { bulge = 0 } = {}) {
        const n = a.n, total = n * n;
        const swell = bulge * Math.sin(Math.PI * clamp(k));
        const c = clamp(k), band = lerp(a.band, b.band, c);
        for (let i = 0; i < total; i++) {
            const d = a.sdf[i] + (b.sdf[i] - a.sdf[i]) * k - swell;
            const o = i * 4;
            const alpha = clamp(0.5 - d);
            if (alpha <= 0) { out[o + 3] = 0; continue; }
            // у кромки — цвет обводки, глубже — цвет заливки; оба — смесь двух фигур
            const e = clamp((d + band + 0.5));
            const j = i * 3;
            for (let ch = 0; ch < 3; ch++) {
                const fill = a.fill[j + ch] + (b.fill[j + ch] - a.fill[j + ch]) * c;
                const edge = a.edge[j + ch] + (b.edge[j + ch] - a.edge[j + ch]) * c;
                out[o + ch] = fill + (edge - fill) * e;
            }
            out[o + 3] = alpha * 255;
        }
        return out;
    }

    /** Кривая перетекания: разгон, упругий перелёт формы за новую фигуру и возврат. */
    function morphCurve(u) {
        u = clamp(u);
        const base = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        return base + 0.085 * Math.sin(Math.PI * clamp((u - 0.42) / 0.58)) * (1 - u * 0.25);
    }

    return {
        FEEL, TEMPO, tempoFor, clamp, lerp, smooth,
        springStep, springAt, settleTime, springEasing,
        magnet, createDrag, travelMs, easeTravel, ring, flight, flightFace, landFace, pulseFace, FACE_REST,
        nearestField, analyzeFigure, morphFrame, morphCurve,
    };
});
