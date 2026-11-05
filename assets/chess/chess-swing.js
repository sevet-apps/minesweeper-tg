/* Spark: раскачка фигуры, которую тянут мышью. Фигура висит на точке хвата
   и поворачивается вокруг неё: по инерции при разгоне и торможении, отстаёт
   при движении, круговыми движениями её можно раскрутить. Чем дальше от
   центра взята фигура, тем сильнее рычаг и тем больше она качается; взятая
   за центр почти не качается. Только физика, без DOM: работает и в Mini App
   (globalThis.SparkChessSwing), и в тестах (require).
   Единицы — клетка доски (сторона клетки = 1) и секунды. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SparkChessSwing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const PARAMS = Object.freeze({
        com: [0.5, 0.56],   // центр масс в клетке: у фигур тяжёлый низ
        grabMax: 0.46,      // дальше этого от центра масс точку хвата не уводим: за пределами клетки фигуры нет
        deadZone: 0.03,     // ближе к центру масс рычага нет вовсе...
        ramp: 0.09,         // ...и он плавно вырастает на этом отрезке, чтобы дрожь руки у центра не качала фигуру
        inertia: 0.5,       // собственный момент инерции фигуры (относительно центра масс)
        drag: 14,           // сопротивление движению центра масс: фигура отстаёт и тянется следом
        upright: 50,        // сила, возвращающая фигуру прямо
        damping: 0.8,       // затухание вращения
        smooth: 0.035,      // сглаживание скорости мыши, с
        maxSpin: 40,        // предел угловой скорости, рад/с
        step: 1 / 240,      // шаг интегрирования, с
    });

    /** Точка хвата (x, y в долях клетки от её левого верхнего угла) → плечо до центра масс. */
    function lever(grabX, grabY, p = PARAMS) {
        let rx = p.com[0] - grabX, ry = p.com[1] - grabY;
        const d = Math.hypot(rx, ry);
        if (d > p.grabMax) { rx *= p.grabMax / d; ry *= p.grabMax / d; }
        const k = Math.max(0, Math.min(1, (Math.min(d, p.grabMax) - p.deadZone) / p.ramp));
        return [rx * k, ry * k];
    }

    /** Раскачка одной фигуры. step(x, y, dt) — где сейчас точка хвата (в клетках), возвращает угол в радианах
        (по часовой стрелке на экране, как CSS rotate). */
    function createSwing(grabX, grabY, p = PARAMS) {
        const r0 = lever(grabX, grabY, p);
        const inertia = p.inertia + r0[0] ** 2 + r0[1] ** 2;
        const s = { angle: 0, spin: 0, vx: 0, vy: 0, x: null, y: null };
        return {
            get angle() { return s.angle; },
            get spin() { return s.spin; },
            lever: r0,
            step(x, y, dt) {
                if (!(dt > 0)) return s.angle;
                dt = Math.min(dt, 0.05);   // после паузы вкладки не разгоняемся рывком
                if (s.x == null) { s.x = x; s.y = y; }
                const blend = 1 - Math.exp(-dt / p.smooth);
                const vx = s.vx + ((x - s.x) / dt - s.vx) * blend;
                const vy = s.vy + ((y - s.y) / dt - s.vy) * blend;
                const ax = (vx - s.vx) / dt, ay = (vy - s.vy) / dt;
                s.vx = vx; s.vy = vy; s.x = x; s.y = y;
                const n = Math.max(1, Math.ceil(dt / p.step));
                const h = dt / n;
                for (let i = 0; i < n; i++) {
                    const cos = Math.cos(s.angle), sin = Math.sin(s.angle);
                    const rx = r0[0] * cos - r0[1] * sin, ry = r0[0] * sin + r0[1] * cos;
                    // на центр масс действуют сила инерции (-a) и сопротивление его скорости
                    const cvx = vx - s.spin * ry, cvy = vy + s.spin * rx;
                    const fx = -ax - p.drag * cvx, fy = -ay - p.drag * cvy;
                    const accel = (rx * fy - ry * fx) / inertia - p.upright * Math.sin(s.angle) - p.damping * s.spin;
                    s.spin = Math.max(-p.maxSpin, Math.min(p.maxSpin, s.spin + accel * h));
                    s.angle += s.spin * h;
                }
                return s.angle;
            },
        };
    }

    /** Угол в (-π, π]: фигура возвращается прямо коротким путём. */
    const settleAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

    return { PARAMS, lever, createSwing, settleAngle };
});
