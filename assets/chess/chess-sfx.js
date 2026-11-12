/* Spark Chess: короткие «материальные» звуки тактильной системы — синтез
   Web Audio, без файлов и без задержек. Два характера: стекло (чистые
   высокие призвуки, тонкий щелчок) и упругость (мягкие низкие «туки» с
   падением высоты). Записанный звук хода (move.mp3) остаётся главным звуком
   контакта; здесь — слои под ним и звуки новых событий: захват фигуры,
   «магнит» над клеткой, взятие, шах, превращение, часы, мат, пилюли итога.
   Громкость зависит от интенсивности (минимум / баланс / максимум). */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SparkChessSfx = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const LEVEL_GAIN = { minimal: 0.6, balanced: 0.85, immersive: 1 };

    function createSfx(getCtx) {
        let noise = null;
        let master = null;
        let masterCtx = null;

        function out(ctx) {
            if (master && masterCtx === ctx) return master;
            masterCtx = ctx;
            // мягкий компрессор: щелчки не режут ухо, тихие хвосты слышны
            const comp = ctx.createDynamicsCompressor();
            comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.002; comp.release.value = 0.12;
            master = ctx.createGain();
            master.gain.value = 0.9;
            master.connect(comp).connect(ctx.destination);
            return master;
        }
        function noiseBuf(ctx) {
            if (noise && noise.sampleRate === ctx.sampleRate) return noise;
            const len = ctx.sampleRate;
            noise = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = noise.getChannelData(0);
            let seed = 1234567;
            for (let i = 0; i < len; i++) { seed = (seed * 16807) % 2147483647; d[i] = seed / 1073741823.5 - 1; }
            return noise;
        }
        function env(ctx, g, t, a, peak, d) {
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(peak, t + a);
            g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
        }
        /** Чистый тон с падением/подъёмом высоты. */
        function tone(ctx, dst, { t, f, f2 = f, glide = 0.04, type = 'sine', a = 0.002, d = 0.05, g = 0.1, vib = 0, vibF = 7, lp = 0, lp2 = 0 }) {
            const o = ctx.createOscillator();
            const e = ctx.createGain();
            o.type = type;
            o.frequency.setValueAtTime(f, t);
            if (f2 !== f) o.frequency.exponentialRampToValueAtTime(f2, t + Math.max(0.005, glide));
            let node = o;
            if (vib) {
                const lfo = ctx.createOscillator(), depth = ctx.createGain();
                lfo.frequency.value = vibF; depth.gain.setValueAtTime(vib, t); depth.gain.exponentialRampToValueAtTime(0.01, t + a + d);
                lfo.connect(depth).connect(o.frequency);
                lfo.start(t); lfo.stop(t + a + d + 0.05);
            }
            if (lp) {
                const flt = ctx.createBiquadFilter();
                flt.type = 'lowpass'; flt.Q.value = 0.8;
                flt.frequency.setValueAtTime(lp, t);
                if (lp2) flt.frequency.exponentialRampToValueAtTime(lp2, t + a + d);
                node.connect(flt); node = flt;
            }
            node.connect(e).connect(dst);
            env(ctx, e, t, a, g, d);
            o.start(t);
            o.stop(t + a + d + 0.03);
        }
        /** Шумовой щелчок или шорох через фильтр. */
        function burst(ctx, dst, { t, type = 'bandpass', f = 3000, f2 = f, q = 1, a = 0.001, d = 0.01, g = 0.1 }) {
            const src = ctx.createBufferSource();
            src.buffer = noiseBuf(ctx);
            const flt = ctx.createBiquadFilter();
            flt.type = type; flt.Q.value = q;
            flt.frequency.setValueAtTime(f, t);
            if (f2 !== f) flt.frequency.exponentialRampToValueAtTime(f2, t + a + d);
            const e = ctx.createGain();
            src.connect(flt).connect(e).connect(dst);
            env(ctx, e, t, a, g, d);
            const off = Math.random() * 0.8;
            src.start(t, off, a + d + 0.03);
        }

        const R = {
            /** Захват: фигуру сняли с поверхности. */
            pick(ctx, o, t, s, lv) {
                if (s === 'glass') {
                    burst(ctx, o, { t, f: 5200, q: 2.5, d: 0.006, g: 0.32 });
                    tone(ctx, o, { t, f: 2960, d: 0.045, g: 0.05 });
                    tone(ctx, o, { t: t + 0.001, f: 4630, d: 0.03, g: 0.028 });
                    if (lv === 'immersive') tone(ctx, o, { t, f: 7020, d: 0.02, g: 0.012 });
                } else {
                    tone(ctx, o, { t, f: 640, f2: 360, glide: 0.035, d: 0.06, g: 0.22 });
                    burst(ctx, o, { t, type: 'lowpass', f: 1400, d: 0.012, g: 0.12 });
                }
            },
            /** «Магнит»: фигура над клеткой, куда можно пойти. Едва слышно. */
            catch(ctx, o, t, s) {
                if (s === 'glass') {
                    tone(ctx, o, { t, f: 3150, d: 0.028, g: 0.026 });
                    burst(ctx, o, { t, type: 'highpass', f: 6000, d: 0.003, g: 0.045 });
                } else {
                    tone(ctx, o, { t, f: 520, f2: 430, glide: 0.02, d: 0.03, g: 0.065 });
                }
            },
            /** Слой под записанным звуком хода: материал посадки. */
            place(ctx, o, t, s) {
                if (s === 'glass') {
                    tone(ctx, o, { t, f: 2240, d: 0.07, g: 0.032 });
                    tone(ctx, o, { t, f: 3480, d: 0.05, g: 0.018 });
                } else {
                    tone(ctx, o, { t, f: 170, f2: 108, glide: 0.06, d: 0.09, g: 0.15 });
                    burst(ctx, o, { t, type: 'lowpass', f: 600, d: 0.02, g: 0.08 });
                }
            },
            /** Слой под взятием: плотнее и ниже. */
            capture(ctx, o, t, s) {
                if (s === 'glass') {
                    tone(ctx, o, { t, f: 96, f2: 70, glide: 0.08, d: 0.11, g: 0.24 });
                    burst(ctx, o, { t, type: 'lowpass', f: 900, d: 0.04, g: 0.14 });
                    for (let i = 0; i < 3; i++) tone(ctx, o, { t: t + 0.004 + i * 0.011, f: 3200 + Math.random() * 2800, d: 0.05 + Math.random() * 0.04, g: 0.022 });
                } else {
                    tone(ctx, o, { t, f: 120, f2: 62, glide: 0.1, d: 0.14, g: 0.28 });
                    burst(ctx, o, { t, type: 'lowpass', f: 700, d: 0.05, g: 0.17 });
                    tone(ctx, o, { t, f: 300, f2: 180, glide: 0.05, d: 0.05, g: 0.06 });
                }
            },
            /** Шах: короткий напряжённый резонанс с биениями. */
            check(ctx, o, t, s, lv) {
                const long = lv === 'immersive' ? 1.25 : lv === 'minimal' ? 0.7 : 1;
                if (s === 'glass') {
                    tone(ctx, o, { t, f: 740, a: 0.008, d: 0.55 * long, g: 0.065 });
                    tone(ctx, o, { t, f: 747.5, a: 0.008, d: 0.55 * long, g: 0.065 });
                    tone(ctx, o, { t, f: 1110, a: 0.006, d: 0.3 * long, g: 0.026 });
                    tone(ctx, o, { t, f: 70, f2: 52, glide: 0.12, d: 0.16, g: 0.24 });
                    if (lv !== 'minimal') burst(ctx, o, { t, f: 900, q: 1.2, a: 0.05, d: 0.25, g: 0.045 });
                } else {
                    tone(ctx, o, { t, f: 98, type: 'sawtooth', a: 0.006, d: 0.5 * long, g: 0.07, lp: 1600, lp2: 260 });
                    tone(ctx, o, { t, f: 98.9, type: 'sawtooth', a: 0.006, d: 0.5 * long, g: 0.07, lp: 1600, lp2: 260 });
                    tone(ctx, o, { t, f: 65, f2: 46, glide: 0.14, d: 0.18, g: 0.3 });
                }
            },
            /** Превращение: текстура звука плавно меняется вместе с формой. */
            promote(ctx, o, t, s, lv, dur = 0.55) {
                if (s === 'glass') {
                    const notes = [880, 1175, 1320, 1760, 2350];
                    notes.forEach((f, i) => tone(ctx, o, { t: t + dur * 0.8 * i / (notes.length - 1), f, a: 0.004, d: 0.45, g: 0.045 }));
                    burst(ctx, o, { t, f: 500, f2: 4500, q: 1.4, a: dur * 0.3, d: dur * 0.9, g: 0.055 });
                } else {
                    tone(ctx, o, { t, f: 220, f2: 660, glide: dur * 0.8, a: 0.02, d: dur, g: 0.11, vib: 18, vibF: 7 });
                    tone(ctx, o, { t: t + dur * 0.82, f: 900, f2: 1200, glide: 0.04, d: 0.05, g: 0.055 });
                    burst(ctx, o, { t, type: 'lowpass', f: 300, f2: 1600, a: dur * 0.4, d: dur * 0.6, g: 0.05 });
                }
            },
            /** Часы: нажатие кнопки и её отпускание. */
            clock(ctx, o, t, s) {
                const k = s === 'glass' ? 1 : 0.72;
                burst(ctx, o, { t, type: 'highpass', f: 2600 * k, d: 0.004, g: 0.18 });
                tone(ctx, o, { t, f: 2400 * k, d: 0.012, g: 0.045 });
                burst(ctx, o, { t: t + 0.028, type: 'highpass', f: 1800 * k, d: 0.003, g: 0.09 });
                tone(ctx, o, { t: t + 0.028, f: 1650 * k, d: 0.01, g: 0.03 });
            },
            /** Последние секунды: тихий деревянный «тик». */
            tick(ctx, o, t, s) {
                tone(ctx, o, { t, f: s === 'glass' ? 1250 : 820, d: 0.025, g: 0.05 });
                burst(ctx, o, { t, f: 3000, d: 0.003, g: 0.05 });
            },
            /** Мат: глубокий удар и долгий резонанс. */
            mate(ctx, o, t, s) {
                if (s === 'glass') {
                    tone(ctx, o, { t, f: 55, f2: 38, glide: 0.3, d: 0.4, g: 0.34 });
                    [[65.4, 0.11], [98, 0.075], [130.8, 0.055]].forEach(([f, g]) => tone(ctx, o, { t, f, a: 0.02, d: 1.8, g }));
                    [1568, 2093, 2637].forEach((f, i) => tone(ctx, o, { t: t + 0.12 + i * 0.09, f, a: 0.004, d: 0.9, g: 0.022 }));
                } else {
                    tone(ctx, o, { t, f: 60, f2: 35, glide: 0.35, d: 0.5, g: 0.4 });
                    tone(ctx, o, { t, f: 82, type: 'sawtooth', a: 0.01, d: 1.2, g: 0.055, lp: 900, lp2: 180 });
                    tone(ctx, o, { t: t + 0.05, f: 330, f2: 220, glide: 0.25, d: 0.3, g: 0.05 });
                }
            },
            /** Пилюля итога над королём. */
            pill(ctx, o, t, s, lv, good = true) {
                const k = good ? 1 : 0.75;
                if (s === 'glass') {
                    tone(ctx, o, { t, f: 1320 * k, f2: 1760 * k, glide: 0.05, d: 0.08, g: 0.04 });
                    tone(ctx, o, { t: t + 0.01, f: 2640 * k, d: 0.05, g: 0.014 });
                } else {
                    tone(ctx, o, { t, f: 520 * k, f2: 880 * k, glide: 0.05, d: 0.07, g: 0.07 });
                }
            },
        };

        return {
            names: Object.keys(R),
            /** name, { style, level, when (с), gain, arg } — arg уходит в рецепт (длительность превращения, «хорошая» пилюля). */
            play(name, { style = 'glass', level = 'balanced', when = 0, gain = 1, arg } = {}) {
                const ctx = getCtx();
                const recipe = R[name];
                if (!ctx || !recipe) return;
                try {
                    const bus = ctx.createGain();
                    bus.gain.value = (LEVEL_GAIN[level] ?? 0.85) * gain;
                    bus.connect(out(ctx));
                    recipe(ctx, bus, ctx.currentTime + Math.max(0, when) + 0.004, style, level, arg);
                    setTimeout(() => { try { bus.disconnect(); } catch (_) {} }, (when + 3) * 1000);
                } catch (_) {}
            },
        };
    }

    return { createSfx, LEVEL_GAIN };
});
