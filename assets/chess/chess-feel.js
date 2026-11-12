/* Spark Chess: тактильная система доски — как фигура отзывается на касание,
   тянется за пальцем, притягивается к клетке и садится в неё.
   Два физических стиля (стекло с магнитом и упругий магнит) и три уровня
   интенсивности; темп партии (пуля, блиц) укорачивает и смягчает частые
   эффекты. Здесь же морфинг пешки в новую фигуру по полям расстояний (SDF),
   горизонтальное меню превращения с наклоном за пальцем и мелкие реакции
   поверхности: рябь от посадки, импульс шаха, нити к доступным клеткам.
   Всё чисто декоративное: логика партии меняется сразу, анимации ничего не
   блокируют и обрываются следующим действием игрока.
   Единицы — клетка доски (сторона клетки = 1), время — миллисекунды. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SparkChessFeel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const STYLES = Object.freeze(['glass', 'elastic']);
    const LEVELS = Object.freeze(['minimal', 'balanced', 'immersive']);

    /* Каждое значение — [минимум, баланс, максимум]. */
    const TABLE = {
        glass: {
            liftScale: [1.06, 1.1, 1.13],     // насколько крупнее поднятая фигура
            liftY: [-3, -5, -7],              // % клетки: приподнята над поверхностью
            press: [0.97, 0.955, 0.94],       // короткое «нажатие» в момент касания
            followW: [95, 75, 64],            // жёсткость следования за пальцем, рад/с
            followZ: [1, 1, 0.95],
            tiltMax: [1.5, 3.2, 5],           // наклон от скорости, градусы
            tiltGain: [0.5, 0.9, 1.25],       // градусов на клетку/с
            tiltW: [44, 36, 30], tiltZ: [1, 0.92, 0.82],
            stretchMax: [0, 0.014, 0.028], stretchGain: [0, 0.0035, 0.006],
            magnetR: [0.5, 0.52, 0.56],       // радиус притяжения клетки
            magnet: [0.16, 0.3, 0.42],        // сила притяжения
            magnetHold: [0.985, 0.965, 0.95], // фигура «готовится сесть» над клеткой
            landMs: [80, 100, 120],
            travel: [0.92, 1, 1.08],          // длительность обычного хода
            lean: [0, 1.6, 2.6],              // наклон в сторону хода в полёте
            hop: [1.05, 1.07, 1.09],          // подъём в полёте
            settleAmp: [0.004, 0.009, 0.014], settleW: [48, 42, 38], settleZ: [0.95, 0.75, 0.62],
            squash: [0, 0.022, 0.036], wobble: [0, 0.15, 0.3], squashMs: [0, 150, 190],
            seat: [1.012, 1.026, 1.04],
            ripple: [0.06, 0.15, 0.24],
            stagger: [0, 9, 14],
            threads: [0, 0, 1],
            shudder: [0.012, 0.022, 0.032], shudderMs: [220, 300, 380],
            tension: [0.05, 0.13, 0.22], press2: [0, 0.004, 0.007],
            clockPulse: [0.012, 0.03, 0.045], digitRoll: [0, 1, 1], clockLive: [0, 0, 1],
            morphMs: [300, 560, 820], bulge: [0.01, 0.03, 0.045], overshoot: [0, 0, 0],
            gain: [0.55, 0.8, 1],
            mate: [0, 1, 1],
        },
        elastic: {
            liftScale: [1.08, 1.13, 1.17],
            liftY: [-4, -6, -8],
            press: [0.95, 0.92, 0.9],
            followW: [70, 46, 38],
            followZ: [0.95, 0.72, 0.6],
            tiltMax: [3, 8, 12],
            tiltGain: [1, 2, 2.8],
            tiltW: [34, 26, 22], tiltZ: [0.8, 0.5, 0.4],
            stretchMax: [0.02, 0.06, 0.1], stretchGain: [0.004, 0.012, 0.019],
            magnetR: [0.5, 0.55, 0.6],
            magnet: [0.2, 0.38, 0.52],
            magnetHold: [0.98, 0.955, 0.93],
            landMs: [95, 120, 140],
            travel: [0.95, 1.05, 1.12],
            lean: [2, 5, 8],
            hop: [1.06, 1.1, 1.13],
            settleAmp: [0.01, 0.028, 0.042], settleW: [36, 30, 27], settleZ: [0.7, 0.45, 0.36],
            squash: [0.04, 0.09, 0.14], wobble: [0.25, 0.55, 0.7], squashMs: [200, 300, 380],
            seat: [1, 1, 1],
            ripple: [0.08, 0.18, 0.28],
            stagger: [8, 14, 20],
            threads: [0, 1, 1],
            shudder: [0.018, 0.034, 0.05], shudderMs: [260, 360, 460],
            tension: [0.06, 0.14, 0.24], press2: [0, 0.005, 0.009],
            clockPulse: [0.02, 0.045, 0.065], digitRoll: [0, 1, 1], clockLive: [0, 0, 1],
            morphMs: [320, 600, 860], bulge: [0, 0.012, 0.02], overshoot: [0.04, 0.1, 0.14],
            gain: [0.55, 0.8, 1],
            mate: [0, 1, 1],
        },
    };

    /** Темп партии: пуля и блиц — частые эффекты короче и тише. Редкие (мат) не трогаем. */
    const TEMPO = { bullet: 0.55, blitz: 0.75, rapid: 0.92, classical: 1, none: 1 };
    function tempoFor(cat, { rush = false, lowTime = false } = {}) {
        let k = TEMPO[cat] ?? 1;
        if (rush) k *= 0.8;          // ходы идут очередью — анимации не копятся
        if (lowTime) k *= 0.75;      // у игрока мало времени
        return Math.max(0.4, k);
    }

    /** Параметры для стиля, уровня и темпа. dur — множитель времени, amp — амплитуд. */
    function profile(style = 'glass', level = 'balanced', tempo = 1) {
        const t = TABLE[style] || TABLE.glass;
        const i = Math.max(0, LEVELS.indexOf(level));
        const p = { style: TABLE[style] ? style : 'glass', level: LEVELS[i], li: i, tempo };
        for (const [key, row] of Object.entries(t)) p[key] = row[i];
        const amp = Math.sqrt(tempo);
        p.dur = k => k * tempo;
        p.amp = amp;
        for (const key of ['tiltMax', 'stretchMax', 'settleAmp', 'squash', 'ripple', 'shudder', 'tension', 'clockPulse']) p[key] *= amp;
        for (const key of ['landMs', 'squashMs', 'shudderMs', 'stagger']) p[key] *= tempo;
        p.followW /= Math.max(0.7, tempo);   // в пуле фигура держится за пальцем плотнее
        return p;
    }

    /* ---------- пружины ---------- */
    const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, k) => a + (b - a) * k;
    const smooth = k => k * k * (3 - 2 * k);

    /** Шаг пружины (полунеявный Эйлер, с подшагами): x — к цели, v — скорость. */
    function spring(state, target, w, z, dt) {
        const n = Math.max(1, Math.ceil(dt / (1 / 240)));
        const h = dt / n;
        for (let i = 0; i < n; i++) {
            const a = -w * w * (state.x - target) - 2 * z * w * state.v;
            state.v += a * h;
            state.x += state.v * h;
        }
        return state.x;
    }

    /** Затухающий отклик пружины на толчок (с нуля, начальная скорость в единицах амплитуды). */
    function ring(t, w, z) {
        if (t <= 0) return 0;
        if (z >= 1) return w * t * Math.exp(-w * t);
        const wd = w * Math.sqrt(1 - z * z);
        return Math.exp(-z * w * t) * Math.sin(wd * t) * (w / wd);
    }

    /** Кубическая Безье для 0..1 (как CSS cubic-bezier). */
    function bezier(x1, y1, x2, y2) {
        const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
        const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
        const sx = t => ((ax * t + bx) * t + cx) * t;
        const sy = t => ((ay * t + by) * t + cy) * t;
        const dx = t => (3 * ax * t + 2 * bx) * t + cx;
        return x => {
            if (x <= 0) return 0;
            if (x >= 1) return 1;
            let t = x;
            for (let i = 0; i < 6; i++) {
                const e = sx(t) - x, d = dx(t);
                if (Math.abs(e) < 1e-5 || !d) break;
                t -= e / d;
            }
            return sy(clamp(t));
        };
    }
    // Ход фигуры: уверенный старт, торможение у клетки, а последний сантиметр
    // фигура «доезжает» магнитом — с остаточной скоростью, которую гасит посадка.
    const TRAVEL = bezier(0.24, 0.7, 0.5, 0.96);

    /** Длительность хода без перетаскивания: короткие ходы быстрые, длинные — не тянутся. */
    function travelMs(dist, p) {
        return Math.round(Math.min(340, 150 + 62 * Math.sqrt(dist)) * p.travel * p.tempo);
    }

    /** Кадры полёта фигуры от from к to (клетки) с посадкой: [{offset, x, y}] и момент касания. */
    function travelFrames(from, to, p, { dropped = false, speed = 0 } = {}) {
        const dx = to[0] - from[0], dy = to[1] - from[1];
        const dist = Math.hypot(dx, dy);
        const ux = dist ? dx / dist : 0, uy = dist ? dy / dist : 0;
        const contact = dropped ? Math.round(clamp(p.landMs * (0.55 + 0.6 * Math.min(1, dist)), 45, 160)) : travelMs(dist, p);
        // посадка: перелёт за центр вдоль хода и возврат; у брошенной фигуры — от её скорости
        const push = dropped ? Math.min(1, 0.35 + speed / 18) : Math.min(1, 0.4 + dist / 4);
        const amp = p.settleAmp * push;
        const settle = amp > 0.0005 ? Math.round(Math.min(420, 5.5 / (p.settleZ * p.settleW) * 1000)) : 0;
        const total = contact + settle;
        const steps = Math.max(2, Math.round(total / 16));
        const frames = [];
        for (let i = 0; i <= steps; i++) {
            const t = total * i / steps;
            let x, y;
            if (t < contact) {
                const k = TRAVEL(t / contact);
                x = from[0] + dx * k; y = from[1] + dy * k;
            } else {
                const r = amp * ring((t - contact) / 1000, p.settleW, p.settleZ);
                x = to[0] + ux * r; y = to[1] + uy * r;
            }
            frames.push({ offset: i / steps, x, y });
        }
        frames[frames.length - 1].x = to[0];
        frames[frames.length - 1].y = to[1];
        return { frames, contact, total, dist };
    }

    /** Сжатие фигуры при посадке: [{offset, sx, sy}] за squashMs. */
    function squashFrames(p, power = 1) {
        const s = p.squash * power;
        if (!(s > 0.002) || !(p.squashMs > 20)) return null;
        const steps = Math.max(4, Math.round(p.squashMs / 16));
        const w = 2 * Math.PI * (1 + p.wobble * 1.6) / (p.squashMs / 1000);
        const out = [];
        for (let i = 0; i <= steps; i++) {
            const u = i / steps;
            const decay = Math.pow(1 - u, 2.2);
            const q = s * decay * Math.cos(w * u * p.squashMs / 1000 * (0.5 + 0.5 * p.wobble));
            out.push({ offset: u, sx: 1 + q * 0.6, sy: 1 - q });
        }
        out[out.length - 1].sx = out[out.length - 1].sy = 1;
        return out;
    }

    /* ---------- перетаскивание: фигура на пружине за пальцем ---------- */
    /** Модель перетаскиваемой фигуры. Позиции — левый верхний угол фигуры в клетках. */
    function createDrag(start, p) {
        const sx = { x: start[0], v: 0 }, sy = { x: start[1], v: 0 };
        const tilt = { x: 0, v: 0 };
        const st = { tx: start[0], ty: start[1], vx: 0, vy: 0, stretch: 0, angle: 0, hold: 1, caught: null };
        return {
            get x() { return sx.x; },
            get y() { return sy.x; },
            get vx() { return sx.v; },
            get vy() { return sy.v; },
            get tilt() { return tilt.x; },
            get stretch() { return st.stretch; },
            get angle() { return st.angle; },
            get hold() { return st.hold; },
            get caught() { return st.caught; },
            /** Куда тянет палец; targets — свободные клетки [[x, y, key]], к центрам которых притягивает. */
            aim(x, y, targets = []) {
                let best = null, bestD = Infinity;
                for (const t of targets) {
                    const d = Math.hypot(x - t[0], y - t[1]);
                    if (d < bestD) { bestD = d; best = t; }
                }
                st.caught = null;
                st.tx = x; st.ty = y;
                if (best && bestD < p.magnetR) {
                    // ближе к центру — сильнее: фигуру мягко затягивает в «лунку» клетки
                    const k = p.magnet * smooth(1 - bestD / p.magnetR);
                    st.tx = lerp(x, best[0], k);
                    st.ty = lerp(y, best[1], k);
                    if (bestD < p.magnetR * 0.8) st.caught = best[2] ?? best;
                }
                return st.caught;
            },
            step(dt) {
                if (!(dt > 0)) return;
                dt = Math.min(dt, 0.05);
                spring(sx, st.tx, p.followW, p.followZ, dt);
                spring(sy, st.ty, p.followW, p.followZ, dt);
                const speed = Math.hypot(sx.v, sy.v);
                // наклон — от горизонтальной скорости, как у предмета, который несут
                const want = clamp(sx.v * p.tiltGain, -p.tiltMax, p.tiltMax);
                spring(tilt, want, p.tiltW, p.tiltZ, dt);
                // растяжение вдоль движения, с плавным выходом
                const s = Math.min(p.stretchMax, speed * p.stretchGain);
                st.stretch += (s - st.stretch) * (1 - Math.exp(-dt * 26));
                if (speed > 0.4) st.angle = Math.atan2(sy.v, sx.v) * 180 / Math.PI;
                const hold = st.caught ? p.magnetHold : 1;
                st.hold += (hold - st.hold) * (1 - Math.exp(-dt * 22));
            },
        };
    }

    /** Трансформация «лица» фигуры при перетаскивании. */
    function dragFace(d, p) {
        const s = d.stretch;
        const k = p.liftScale * d.hold;
        const a = d.angle.toFixed(1);
        return `translateY(${p.liftY}%) rotate(${d.tilt.toFixed(2)}deg) rotate(${a}deg) scale(${(1 + s).toFixed(4)}, ${(1 - s * 0.7).toFixed(4)}) rotate(${-a}deg) scale(${k.toFixed(4)})`;
    }

    /* ---------- поле расстояний силуэта и морфинг ---------- */
    const INF = 1e20;
    function edt1d(f, n, d, v, z) {
        let k = 0;
        v[0] = 0; z[0] = -INF; z[1] = INF;
        for (let q = 1; q < n; q++) {
            let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
            while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
            k++; v[k] = q; z[k] = s; z[k + 1] = INF;
        }
        k = 0;
        for (let q = 0; q < n; q++) {
            while (z[k + 1] < q) k++;
            d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
        }
    }
    /** Квадрат расстояния до ближайшей «внутренней» точки (Фельценшвальб–Хуттенлохер). */
    function edt(inside, n) {
        const grid = new Float64Array(n * n);
        for (let i = 0; i < n * n; i++) grid[i] = inside[i] ? 0 : INF;
        const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
        for (let x = 0; x < n; x++) {
            for (let y = 0; y < n; y++) f[y] = grid[y * n + x];
            edt1d(f, n, d, v, z);
            for (let y = 0; y < n; y++) grid[y * n + x] = d[y];
        }
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) f[x] = grid[y * n + x];
            edt1d(f, n, d, v, z);
            for (let x = 0; x < n; x++) grid[y * n + x] = d[x];
        }
        return grid;
    }
    /** Знаковое расстояние в долях стороны: < 0 внутри фигуры. alpha — 0..255, n × n. */
    function silhouetteSdf(alpha, n) {
        const inside = new Uint8Array(n * n), outside = new Uint8Array(n * n);
        for (let i = 0; i < n * n; i++) { inside[i] = alpha[i] >= 128 ? 1 : 0; outside[i] = 1 - inside[i]; }
        const dIn = edt(inside, n), dOut = edt(outside, n);
        const sdf = new Float32Array(n * n);
        for (let i = 0; i < n * n; i++) {
            // полпикселя поправки по прозрачности: край гладкий, а не ступеньками
            const a = alpha[i] / 255;
            const raw = inside[i] ? -(Math.sqrt(dOut[i]) - 0.5) : Math.sqrt(dIn[i]) - 0.5;
            sdf[i] = (raw + (0.5 - a) * 0.5) / n;
        }
        return sdf;
    }
    function sampleSdf(sdf, n, x, y) {
        const fx = clamp(x * n - 0.5, 0, n - 1.001), fy = clamp(y * n - 0.5, 0, n - 1.001);
        const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j;
        const a = sdf[j * n + i], b = sdf[j * n + i + 1], c = sdf[(j + 1) * n + i], d = sdf[(j + 1) * n + i + 1];
        return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    }

    /** Смесь двух силуэтов в момент k (0 — первый, 1 — второй; можно чуть за 1 — «перелёт» формы). */
    function mixSdf(a, b, k, bulge = 0) {
        const out = new Float32Array(a.length);
        const swell = bulge * Math.sin(Math.PI * clamp(k));
        for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * k - swell;
        return out;
    }

    const parseHex = hex => {
        const h = String(hex || '').replace('#', '');
        const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
        const n = parseInt(v || '888888', 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    /** Цвета и толщина обводки фигуры из её SVG. */
    function svgLook(text) {
        const stops = [...String(text).matchAll(/stop-color="(#[0-9a-fA-F]{3,6})"/g)].map(m => m[1]);
        const stroke = /stroke="(#[0-9a-fA-F]{3,6})"/.exec(text)?.[1] || '#888888';
        const sw = Number(/stroke-width="([\d.]+)"/.exec(text)?.[1]) || 24;
        const box = /viewBox="([-\d.\s]+)"/.exec(text)?.[1].trim().split(/\s+/).map(Number) || [0, 0, 512, 512];
        const gloss = /stroke-opacity="([\d.]+)"/.test(text);
        // видна наружная половина обводки (paint-order: stroke под заливкой)
        return { top: parseHex(stops[0]), bottom: parseHex(stops[1] || stops[0]), stroke: parseHex(stroke), sw: sw / 2 / (box[2] || 512), gloss };
    }

    /** Рисует смесь силуэтов в ImageData size × size. look — цвета (смешанные). */
    function paintSdf(img, size, sdf, n, look, { sheen = -1, sheenW = 0.16 } = {}) {
        const data = img.data;
        const px = 1 / size;
        const sw = look.sw;
        for (let j = 0; j < size; j++) {
            const y = (j + 0.5) / size;
            const g = clamp((y - 0.08) / 0.84);
            const fr = lerp(look.top[0], look.bottom[0], g), fg = lerp(look.top[1], look.bottom[1], g), fb = lerp(look.top[2], look.bottom[2], g);
            for (let i = 0; i < size; i++) {
                const x = (i + 0.5) / size;
                const d = sampleSdf(sdf, n, x, y);
                const o = (j * size + i) * 4;
                const a = clamp(0.5 - d / px);
                if (a <= 0) { data[o + 3] = 0; continue; }
                // обводка — полоса у края, внутри — вертикальный градиент заливки
                const band = clamp((d + sw) / px + 0.5);
                let r = lerp(fr, look.stroke[0], band), gr = lerp(fg, look.stroke[1], band), b = lerp(fb, look.stroke[2], band);
                if (look.gloss) {
                    // смоляной блик у чёрных: светлая кромка по верхним граням
                    const dy = sampleSdf(sdf, n, x, y - 2 / n) - d;
                    const rim = clamp(1 - Math.abs(d + sw * 2.1) / (sw * 0.9)) * clamp(dy * n * 0.6) * 0.18;
                    r += (255 - r) * rim; gr += (255 - gr) * rim; b += (255 - b) * rim;
                }
                if (sheen >= -0.5) {
                    // стеклянный перелив: диагональная полоса света бежит по фигуре
                    const s = Math.exp(-(((x + y) * 0.5 - sheen) ** 2) / (sheenW * sheenW)) * 0.55 * (1 - band);
                    r += (255 - r) * s; gr += (255 - gr) * s; b += (255 - b) * s;
                }
                data[o] = r; data[o + 1] = gr; data[o + 2] = b; data[o + 3] = a * 255;
            }
        }
    }
    const mixLook = (a, b, k) => ({
        top: a.top.map((v, i) => lerp(v, b.top[i], k)), bottom: a.bottom.map((v, i) => lerp(v, b.bottom[i], k)),
        stroke: a.stroke.map((v, i) => lerp(v, b.stroke[i], k)), sw: lerp(a.sw, b.sw, k), gloss: a.gloss || b.gloss,
    });

    /** Кривая морфинга: стекло перетекает плавно, упругость перелетает форму и возвращается. */
    function morphCurve(u, p) {
        u = clamp(u);
        if (p.style === 'elastic') {
            const base = 1 - Math.pow(1 - u, 3);
            return base + p.overshoot * Math.sin(Math.PI * clamp((u - 0.35) / 0.65)) * (1 - u * 0.4);
        }
        return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    }

    return {
        STYLES, LEVELS, TABLE, TEMPO, tempoFor, profile,
        clamp, lerp, smooth, spring, ring, bezier, TRAVEL, travelMs, travelFrames, squashFrames,
        createDrag, dragFace,
        edt, silhouetteSdf, sampleSdf, mixSdf, svgLook, paintSdf, mixLook, morphCurve,
    };
});
