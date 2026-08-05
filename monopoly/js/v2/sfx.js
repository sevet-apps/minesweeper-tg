/* ============================================================
   sfx.js — звук монополии.
   Готовых сэмплов в проекте нет, поэтому звуки синтезируются
   через Web Audio: так они точно ложатся на анимацию и не тянут
   ни килобайта. Тембры подобраны мягкими — деревянная доска,
   костяные кубики, короткие приятные тоны на событиях.
   ============================================================ */
(function (global) {
    'use strict';

    let ctx = null, master = null, muted = false;

    /** Контекст создаём при первом касании: браузеры не дают звучать раньше. */
    function ac() {
        if (ctx) {
            if (ctx.state === 'suspended') ctx.resume();
            return ctx;
        }
        const C = global.AudioContext || global.webkitAudioContext;
        if (!C) return null;
        ctx = new C();
        master = ctx.createGain();
        master.gain.value = 0.5;
        /* мягкий потолок: даже наложение звуков не режет слух */
        const lim = ctx.createDynamicsCompressor();
        lim.threshold.value = -12; lim.knee.value = 8; lim.ratio.value = 6;
        master.connect(lim).connect(ctx.destination);
        return ctx;
    }

    const now = () => (ctx ? ctx.currentTime : 0);

    /* короткий шумовой буфер — основа стуков и шороха */
    let noiseBuf = null;
    function noise() {
        if (noiseBuf) return noiseBuf;
        const n = ctx.sampleRate * 0.4;
        noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        return noiseBuf;
    }

    /** Удар: шумовой щелчок + резонанс «деревяшки». */
    function knock(at, { gain = 0.5, freq = 320, decay = 0.13, tone = 0.5 } = {}) {
        const src = ctx.createBufferSource();
        src.buffer = noise();
        src.playbackRate.value = 0.8 + Math.random() * 0.5;

        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = freq * 3;
        bp.Q.value = 0.9;

        const g = ctx.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(gain, at + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0008, at + decay);

        src.connect(bp).connect(g).connect(master);
        src.start(at); src.stop(at + decay + 0.02);

        /* призвук корпуса — от него удар «деревянный», а не сухой щелчок */
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(freq, at);
        o.frequency.exponentialRampToValueAtTime(freq * 0.62, at + decay);
        og.gain.setValueAtTime(0, at);
        og.gain.linearRampToValueAtTime(gain * tone, at + 0.005);
        og.gain.exponentialRampToValueAtTime(0.0008, at + decay * 0.9);
        o.connect(og).connect(master);
        o.start(at); o.stop(at + decay + 0.02);
    }

    /** Чистый мягкий тон — для событий (покупка, выигрыш). */
    function tone(at, freq, { gain = 0.22, dur = 0.28, type = 'sine' } = {}) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, at);
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(gain, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0008, at + dur);
        o.connect(g).connect(master);
        o.start(at); o.stop(at + dur + 0.02);
    }

    /* ---------- кубики ----------
       Бросок звучит как настоящий: кубик вылетает из руки, несколько раз
       отскакивает от доски (удары чаще и тише к концу), затем короткое
       дребезжание при остановке. Второй кубик идёт со сдвигом, чтобы
       не сливаться с первым в один шлепок. */
    function dice(count) {
        if (!ready()) return;
        const t0 = now() + 0.02;
        const dies = count === 1 ? [0] : [0, 0.055];
        dies.forEach(off => {
            let t = t0 + off;
            let gap = 0.13 + Math.random() * 0.04;
            let g = 0.55;
            const bounces = 4 + Math.floor(Math.random() * 2);
            for (let i = 0; i < bounces; i++) {
                knock(t, {
                    gain: g,
                    freq: 300 + Math.random() * 90,
                    decay: 0.14 - i * 0.015,
                    tone: 0.45,
                });
                t += gap;
                gap *= 0.72;              // отскоки учащаются
                g *= 0.62;                // и слабеют
            }
            /* остановка: два едва слышных касания грани */
            knock(t + 0.02, { gain: 0.12, freq: 380, decay: 0.07, tone: 0.3 });
            knock(t + 0.07, { gain: 0.07, freq: 300, decay: 0.05, tone: 0.2 });
        });
    }

    /* ---------- шаги фишки ----------
       Один сухой тик на клетку. Высота чуть растёт к концу пути — путь
       читается на слух, а последний шаг заметно мягче: фишка встала. */
    function step(i, total) {
        if (!ready()) return;
        const k = total > 1 ? i / (total - 1) : 1;
        knock(now() + 0.005, {
            gain: 0.3,
            freq: 520 + k * 190,
            decay: 0.075,
            tone: 0.55,
        });
    }
    function land() {
        if (!ready()) return;
        const t = now() + 0.005;
        knock(t, { gain: 0.42, freq: 240, decay: 0.19, tone: 0.7 });
        tone(t + 0.01, 392, { gain: 0.1, dur: 0.22, type: 'sine' });
    }

    /* ---------- события ---------- */
    function buy() {                       // покупка: короткий светлый аккорд
        if (!ready()) return;
        const t = now() + 0.01;
        tone(t, 523.25, { gain: 0.2, dur: 0.22 });
        tone(t + 0.075, 659.25, { gain: 0.19, dur: 0.24 });
        tone(t + 0.15, 783.99, { gain: 0.22, dur: 0.42 });
        knock(t, { gain: 0.16, freq: 700, decay: 0.05, tone: 0.2 });
    }
    function coin() {                      // оплата: две монетки
        if (!ready()) return;
        const t = now() + 0.01;
        tone(t, 1046, { gain: 0.12, dur: 0.14, type: 'triangle' });
        tone(t + 0.06, 1318, { gain: 0.1, dur: 0.18, type: 'triangle' });
    }
    function win() {                       // выигрыш
        if (!ready()) return;
        const t = now() + 0.01;
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
            tone(t + i * 0.09, f, { gain: 0.2, dur: i === 3 ? 0.6 : 0.26 }));
    }
    function bad() {                       // неприятность: мягкий низкий тон
        if (!ready()) return;
        const t = now() + 0.01;
        tone(t, 233.08, { gain: 0.18, dur: 0.3, type: 'sine' });
        tone(t + 0.1, 185, { gain: 0.16, dur: 0.42, type: 'sine' });
    }
    function tap() {                       // нажатие в интерфейсе
        if (!ready()) return;
        knock(now() + 0.004, { gain: 0.18, freq: 620, decay: 0.05, tone: 0.3 });
    }

    function ready() {
        if (muted) return false;
        return !!ac();
    }

    /* ---------- управление ---------- */
    function setMuted(v) {
        muted = !!v;
        try { localStorage.setItem('mono_muted', muted ? '1' : '0'); } catch (e) {}
        if (master) master.gain.value = muted ? 0 : 0.5;
    }
    function isMuted() { return muted; }
    try { muted = localStorage.getItem('mono_muted') === '1'; } catch (e) {}

    /* Первое касание разблокирует звук — до него браузер молчит. */
    function unlock() {
        ac();
        document.removeEventListener('pointerdown', unlock);
        document.removeEventListener('touchstart', unlock);
        document.removeEventListener('keydown', unlock);
    }
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('touchstart', unlock);
    document.addEventListener('keydown', unlock);

    global.SFX = { dice, step, land, buy, coin, win, bad, tap, setMuted, isMuted };
})(window);
