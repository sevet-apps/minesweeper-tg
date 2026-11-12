/* Spark: фигура, которую тянут мышью, — твёрдое тело на шарнире. Шарнир — та
   точка фигуры, за которую её взяли; он идёт за мышью. На фигуру действуют
   тяжесть (вниз по экрану), сила инерции от разгона и торможения руки,
   слабое сопротивление воздуха и трение в пальцах. Центр тяжести и момент
   инерции у каждой фигуры свои: их считают по её силуэту (analyzeShape).
   Поэтому взятая за макушку фигура висит и качается, за бок — повисает
   боком, за низ — переворачивается, за центр тяжести — почти не крутится,
   а круговыми движениями её можно раскрутить, как маятник.
   Только физика, без DOM: работает и в Mini App (globalThis.SparkChessSwing),
   и в тестах (require). Единицы — клетка доски (сторона клетки = 1) и секунды. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SparkChessSwing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const PARAMS = Object.freeze({
        gravity: 30,        // клеток/с²: фигура маленькая, но качается не суетливо
        air: 0.3,           // сопротивление воздуха движению центра тяжести
        grip: 1.0,          // трение в пальцах: гасит вращение относительно руки
        spinDrag: 0.03,     // воздух против быстрого вращения (растёт как квадрат скорости)
        scale: 1.24,        // поднятая фигура увеличена вокруг точки хвата (как в .cs-pc.dragging)
        smooth: 0.025,      // сглаживание скорости мыши, с
        maxAccel: 400,      // клеток/с²: скачок курсора (подвисший кадр) не швыряет фигуру
        maxSpin: 24,        // рад/с, около 4 оборотов в секунду: быстрее глаз видит мелькание
        step: 1 / 480,      // шаг интегрирования, с
        solid: 0.35,        // непрозрачность, начиная с которой пиксель — это фигура
        reach: 2,           // запас в пикселях маски вокруг силуэта, за который ещё можно взять
    });

    // Пока силуэт не посчитан: усреднённая фигура, взять можно за любую точку клетки.
    const FALLBACK = Object.freeze({ com: [0.5, 0.56], k2: 0.07, area: 0.36, hit: () => true });

    /** Силуэт фигуры: alpha — непрозрачность (0..255) квадратной картинки size × size,
        растянутой на клетку. Возвращает центр тяжести, квадрат радиуса инерции и проверку «попал в фигуру». */
    function analyzeShape(alpha, size, p = PARAMS) {
        let mass = 0, sx = 0, sy = 0;
        for (let j = 0; j < size; j++) {
            for (let i = 0; i < size; i++) {
                const a = alpha[j * size + i] / 255;
                mass += a; sx += a * (i + 0.5); sy += a * (j + 0.5);
            }
        }
        if (mass <= 0) return FALLBACK;
        const cx = sx / mass / size, cy = sy / mass / size;
        let k = 0;
        const solid = new Uint8Array(size * size);
        for (let j = 0; j < size; j++) {
            for (let i = 0; i < size; i++) {
                const a = alpha[j * size + i] / 255;
                k += a * (((i + 0.5) / size - cx) ** 2 + ((j + 0.5) / size - cy) ** 2);
                if (a >= p.solid) solid[j * size + i] = 1;
            }
        }
        const reach = p.reach;
        return {
            com: [cx, cy],
            k2: k / mass,
            area: mass / size / size,
            /** x, y — доли клетки от её левого верхнего угла. */
            hit(x, y) {
                const ci = Math.floor(x * size), cj = Math.floor(y * size);
                for (let j = cj - reach; j <= cj + reach; j++) {
                    if (j < 0 || j >= size) continue;
                    for (let i = ci - reach; i <= ci + reach; i++) {
                        if (i >= 0 && i < size && (i - ci) ** 2 + (j - cj) ** 2 <= reach * reach && solid[j * size + i]) return true;
                    }
                }
                return false;
            },
        };
    }

    /** Фигура с силуэтом shape, взятая в точке (grabX, grabY) клетки. step(x, y, dt) — где сейчас точка хвата
        (в клетках доски), возвращает угол поворота в радианах (по часовой стрелке на экране, как CSS rotate). */
    function createSwing(shape = FALLBACK, grabX = 0.5, grabY = 0.5, p = PARAMS) {
        const com = shape.com || FALLBACK.com;
        const r0 = [(com[0] - grabX) * p.scale, (com[1] - grabY) * p.scale];
        // момент инерции относительно точки хвата (на единицу массы): свой у фигуры + перенос (Штейнер)
        const inertia = (shape.k2 ?? FALLBACK.k2) * p.scale ** 2 + r0[0] ** 2 + r0[1] ** 2;
        const s = { angle: 0, spin: 0, vx: 0, vy: 0, x: null, y: null };
        return {
            get angle() { return s.angle; },
            get spin() { return s.spin; },
            lever: r0,
            inertia,
            step(x, y, dt) {
                if (!(dt > 0)) return s.angle;
                dt = Math.min(dt, 0.05);   // после паузы вкладки не разгоняемся рывком
                if (s.x == null) { s.x = x; s.y = y; }
                const blend = 1 - Math.exp(-dt / p.smooth);
                const vx = s.vx + ((x - s.x) / dt - s.vx) * blend;
                const vy = s.vy + ((y - s.y) / dt - s.vy) * blend;
                let ax = (vx - s.vx) / dt, ay = (vy - s.vy) / dt;
                const jerk = Math.hypot(ax, ay) / p.maxAccel;
                if (jerk > 1) { ax /= jerk; ay /= jerk; }
                s.vx = vx; s.vy = vy; s.x = x; s.y = y;
                const n = Math.max(1, Math.ceil(dt / p.step));
                const h = dt / n;
                for (let i = 0; i < n; i++) {
                    const cos = Math.cos(s.angle), sin = Math.sin(s.angle);
                    const rx = r0[0] * cos - r0[1] * sin, ry = r0[0] * sin + r0[1] * cos;
                    // в системе руки на центр тяжести действуют тяжесть, сила инерции (-a) и воздух
                    const cvx = vx - s.spin * ry, cvy = vy + s.spin * rx;
                    const fx = -ax - p.air * cvx;
                    const fy = p.gravity - ay - p.air * cvy;
                    const accel = (rx * fy - ry * fx) / inertia - p.grip * s.spin - p.spinDrag * s.spin * Math.abs(s.spin);
                    s.spin = Math.max(-p.maxSpin, Math.min(p.maxSpin, s.spin + accel * h));
                    s.angle += s.spin * h;
                }
                return s.angle;
            },
        };
    }

    /** Угол в (-π, π]: отпущенная фигура встаёт прямо коротким путём. */
    const settleAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

    return { PARAMS, FALLBACK, analyzeShape, createSwing, settleAngle };
});
