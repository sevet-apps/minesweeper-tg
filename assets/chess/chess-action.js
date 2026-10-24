/* Spark Chess: экшен-режим. Кат-сцены взятий, лучших ходов, превращений
   и мата. Доска собирается в 3D (three.js) из текущей позиции, и заранее
   заготовленный многокадровый шаблон (2.5D и 3D) разыгрывает удар именно
   этими фигурами на этих клетках: свечение с блумом, вспышки, рамки и
   бейджи на клетках, подписи, замедления и рывки камеры. Первый и
   последний кадр совпадают с доской на экране. Музыка — отрывки треков
   (music/), удары — сэмплы и синтез Web Audio. ES-модуль, грузится лениво. */
import * as THREE from './vendor/three.module.min.js';
import { SVGLoader } from './vendor/SVGLoader.js';
import { EffectComposer } from './vendor/post/EffectComposer.js';
import { RenderPass } from './vendor/post/RenderPass.js';
import { UnrealBloomPass } from './vendor/post/UnrealBloomPass.js';
import { ShaderPass } from './vendor/post/ShaderPass.js';
import { OutputPass } from './vendor/post/OutputPass.js';

/* ---------- фигуры: силуэты Font Awesome (как в pieces/*.svg) ---------- */
const SHAPES = {
    K: [448, 'M224 0c17.7 0 32 14.3 32 32V48h16c17.7 0 32 14.3 32 32s-14.3 32-32 32H256v48H408c22.1 0 40 17.9 40 40c0 5.3-1 10.5-3.1 15.4L368 400H80L3.1 215.4C1 210.5 0 205.3 0 200c0-22.1 17.9-40 40-40H192V112H176c-17.7 0-32-14.3-32-32s14.3-32 32-32h16V32c0-17.7 14.3-32 32-32zM38.6 473.4L80 432H368l41.4 41.4c4.2 4.2 6.6 10 6.6 16c0 12.5-10.1 22.6-22.6 22.6H54.6C42.1 512 32 501.9 32 489.4c0-6 2.4-11.8 6.6-16z'],
    Q: [512, 'M256 0a56 56 0 1 1 0 112A56 56 0 1 1 256 0zM134.1 143.8c3.3-13 15-23.8 30.2-23.8c12.3 0 22.6 7.2 27.7 17c12 23.2 36.2 39 64 39s52-15.8 64-39c5.1-9.8 15.4-17 27.7-17c15.3 0 27 10.8 30.2 23.8c7 27.8 32.2 48.3 62.1 48.3c10.8 0 21-2.7 29.8-7.4c8.4-4.4 18.9-4.5 27.6 .9c13 8 17.1 25 9.2 38L399.7 400H384 343.6 168.4 128 112.3L5.4 223.6c-7.9-13-3.8-30 9.2-38c8.7-5.3 19.2-5.3 27.6-.9c8.9 4.7 19 7.4 29.8 7.4c29.9 0 55.1-20.5 62.1-48.3zM112 432H400l41.4 41.4c4.2 4.2 6.6 10 6.6 16c0 12.5-10.1 22.6-22.6 22.6H86.6C74.1 512 64 501.9 64 489.4c0-6 2.4-11.8 6.6-16L112 432z'],
    R: [448, 'M32 192V48c0-8.8 7.2-16 16-16h64c8.8 0 16 7.2 16 16V88c0 4.4 3.6 8 8 8h32c4.4 0 8-3.6 8-8V48c0-8.8 7.2-16 16-16h64c8.8 0 16 7.2 16 16V88c0 4.4 3.6 8 8 8h32c4.4 0 8-3.6 8-8V48c0-8.8 7.2-16 16-16h64c8.8 0 16 7.2 16 16V192c0 10.1-4.7 19.6-12.8 25.6L352 256l16 144H80L96 256 44.8 217.6C36.7 211.6 32 202.1 32 192zm176 96h32c8.8 0 16-7.2 16-16V224c0-17.7-14.3-32-32-32s-32 14.3-32 32v48c0 8.8 7.2 16 16 16zM22.6 473.4L64 432H384l41.4 41.4c4.2 4.2 6.6 10 6.6 16c0 12.5-10.1 22.6-22.6 22.6H38.6C26.1 512 16 501.9 16 489.4c0-6 2.4-11.8 6.6-16z'],
    B: [320, 'M128 0C110.3 0 96 14.3 96 32c0 16.1 11.9 29.4 27.4 31.7C78.4 106.8 8 190 8 288c0 47.4 30.8 72.3 56 84.7V400H256V372.7c25.2-12.5 56-37.4 56-84.7c0-37.3-10.2-72.4-25.3-104.1l-99.4 99.4c-6.2 6.2-16.4 6.2-22.6 0s-6.2-16.4 0-22.6L270.8 154.6c-23.2-38.1-51.8-69.5-74.2-90.9C212.1 61.4 224 48.1 224 32c0-17.7-14.3-32-32-32H128zM48 432L6.6 473.4c-4.2 4.2-6.6 10-6.6 16C0 501.9 10.1 512 22.6 512H297.4c12.5 0 22.6-10.1 22.6-22.6c0-6-2.4-11.8-6.6-16L272 432H48z'],
    N: [448, 'M96 48L82.7 61.3C70.7 73.3 64 89.5 64 106.5V238.9c0 10.7 5.3 20.7 14.2 26.6l10.6 7c14.3 9.6 32.7 10.7 48.1 3l3.2-1.6c2.6-1.3 5-2.8 7.3-4.5l49.4-37c6.6-5 15.7-5 22.3 0c10.2 7.7 9.9 23.1-.7 30.3L90.4 350C73.9 361.3 64 380 64 400H384l28.9-159c2.1-11.3 3.1-22.8 3.1-34.3V192C416 86 330 0 224 0H83.8C72.9 0 64 8.9 64 19.8c0 7.5 4.2 14.3 10.9 17.7L96 48zm24 68a20 20 0 1 1 40 0 20 20 0 1 1 -40 0zM22.6 473.4c-4.2 4.2-6.6 10-6.6 16C16 501.9 26.1 512 38.6 512H409.4c12.5 0 22.6-10.1 22.6-22.6c0-6-2.4-11.8-6.6-16L384 432H64L22.6 473.4z'],
    P: [320, 'M215.5 224c29.2-18.4 48.5-50.9 48.5-88c0-57.4-46.6-104-104-104S56 78.6 56 136c0 37.1 19.4 69.6 48.5 88H96c-17.7 0-32 14.3-32 32c0 16.5 12.5 30 28.5 31.8L80 400H240L227.5 287.8c16-1.8 28.5-15.3 28.5-31.8c0-17.7-14.3-32-32-32h-8.5zM22.6 473.4c-4.2 4.2-6.6 10-6.6 16C16 501.9 26.1 512 38.6 512H281.4c12.5 0 22.6-10.1 22.6-22.6c0-6-2.4-11.8-6.6-16L256 432H64L22.6 473.4z'],
};
// Высота фигуры в долях клетки — как в scripts/build-chess-pieces.py.
const HEIGHT = { K: 0.86, Q: 0.83, R: 0.74, B: 0.80, N: 0.79, P: 0.66 };
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const DEPTH = 0.12;          // толщина «вырезанной» фигуры
const SLAB = 0.3;            // толщина доски
const FLOOR_Y = -SLAB;

/* ---------- мелочи ---------- */
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = list => list[Math.floor(Math.random() * list.length)];
const E = {
    linear: k => k,
    in: k => k * k * k,
    out: k => 1 - Math.pow(1 - k, 3),
    inOut: k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    outExpo: k => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
    inExpo: k => (k <= 0 ? 0 : Math.pow(2, 10 * k - 10)),
    outBack: k => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
    sine: k => 0.5 - Math.cos(Math.PI * k) / 2,
};
function lerpAngle(a, b, k) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * k;
}
const yawOf = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

function canvasTexture(size, draw, { repeat = false, srgb = true } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    draw(canvas.getContext('2d'), size);
    const tex = new THREE.CanvasTexture(canvas);
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; }
    tex.anisotropy = 4;
    return tex;
}

/* ---------- таймлайн: дорожки в реальных секундах ---------- */
class Timeline {
    constructor() { this.items = []; this.end = 0; }
    /** fn(k) вызывается каждый кадр, пока дорожка идёт; begin — один раз в начале. */
    tween(start, dur, fn, ease = E.inOut, begin = null) {
        this.items.push({ start, dur: Math.max(0.001, dur), fn, ease, begin, state: 0 });
        this.end = Math.max(this.end, start + dur);
        return this;
    }
    at(time, fn) { return this.tween(time, 0.001, k => { if (k >= 1) fn(); }, E.linear); }
    update(t) {
        for (const it of this.items) {
            if (it.state === 2 || t < it.start) continue;
            if (it.state === 0) { it.state = 1; it.begin?.(); }
            const k = clamp((t - it.start) / it.dur);
            it.fn(it.ease(k), k);
            if (k >= 1) it.state = 2;
        }
    }
}

/* ---------- звук: всё синтезируется, без чужой музыки ---------- */
const audioCache = new WeakMap();
function audioAssets(ctx) {
    let a = audioCache.get(ctx);
    if (a) return a;
    const rate = ctx.sampleRate;
    const noise = ctx.createBuffer(1, rate * 2, rate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const len = Math.floor(rate * 2.8);
    const impulse = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
        const d = impulse.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
    }
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 2.6); }
    a = { noise, impulse, curve };
    audioCache.set(ctx, a);
    return a;
}
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);

class Sfx {
    constructor(ctx) {
        this.ctx = ctx;
        this.assets = audioAssets(ctx);
        this.t0 = ctx.currentTime + 0.04;
        this.out = ctx.createGain();
        this.out.gain.value = 0.85;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.3;
        // Компрессор держит пики, усиление после него — общую громкость.
        this.post = ctx.createGain();
        this.post.gain.value = 1.3;
        // Быстрый лимитер в конце: удары, наложившиеся друг на друга, не хрипят.
        this.limit = ctx.createDynamicsCompressor();
        this.limit.threshold.value = -4; this.limit.knee.value = 0; this.limit.ratio.value = 20;
        this.limit.attack.value = 0.001; this.limit.release.value = 0.12;
        const trim = ctx.createGain();
        trim.gain.value = 0.92;
        this.out.connect(comp).connect(this.post).connect(this.limit).connect(trim).connect(ctx.destination);
        this.trim = trim;
        this.comp = comp;
        this.verb = ctx.createConvolver();
        this.verb.buffer = this.assets.impulse;
        this.send = ctx.createGain();
        this.send.gain.value = 0.5;
        this.send.connect(this.verb).connect(this.out);
        this.nodes = [];
    }
    T(t) { return this.t0 + t; }
    track(node) { this.nodes.push(node); return node; }
    gain(t, peak, attack, decay, dest = this.out, verb = 0) {
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
        g.connect(dest);
        if (verb) { const s = this.ctx.createGain(); s.gain.value = verb; g.connect(s).connect(this.send); }
        return g;
    }
    osc(type, freq, t, dur, dest) {
        const o = this.track(this.ctx.createOscillator());
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        o.connect(dest);
        o.start(t);
        o.stop(t + dur + 0.05);
        return o;
    }
    noise(t, dur, dest) {
        const s = this.track(this.ctx.createBufferSource());
        s.buffer = this.assets.noise;
        s.loop = true;
        s.connect(dest);
        s.start(t, Math.random());
        s.stop(t + dur + 0.05);
        return s;
    }
    filter(type, freq, q = 0.8) {
        const f = this.ctx.createBiquadFilter();
        f.type = type; f.frequency.value = freq; f.Q.value = q;
        return f;
    }
    /** Низкий удар: синус с падающим тоном и плотный шум. */
    boom(t, g = 1, f = 52) {
        t = this.T(t);
        const out = this.gain(t, g, 0.006, 1.3, this.out, 0.25);
        const o = this.osc('sine', f * 3.2, t, 1.4, out);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
        o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 1.2);
        const lp = this.filter('lowpass', 420);
        lp.connect(this.gain(t, g * 0.55, 0.004, 0.5));
        this.noise(t, 0.6, lp);
    }
    /** «Браам» — тяжёлая медь из трейлеров: искажённые пилы и открывающийся фильтр. */
    braam(t, g = 0.7, root = 41.2, dur = 1.9) {
        t = this.T(t);
        const out = this.ctx.createGain();
        out.gain.setValueAtTime(0.0001, t);
        out.gain.exponentialRampToValueAtTime(g, t + 0.05);
        out.gain.setValueAtTime(g, t + dur * 0.45);
        out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        out.connect(this.out);
        const s = this.ctx.createGain(); s.gain.value = 0.7; out.connect(s).connect(this.send);
        const lp = this.filter('lowpass', 140, 3.5);
        lp.frequency.setValueAtTime(140, t);
        lp.frequency.exponentialRampToValueAtTime(1700, t + 0.16);
        lp.frequency.exponentialRampToValueAtTime(260, t + dur);
        lp.connect(out);
        const shaper = this.ctx.createWaveShaper();
        shaper.curve = this.assets.curve;
        shaper.connect(lp);
        const pre = this.ctx.createGain(); pre.gain.value = 0.32; pre.connect(shaper);
        for (const [ratio, detune] of [[1, -9], [1, 8], [2, 4], [3, -6], [1.5, 3]]) {
            const o = this.osc('sawtooth', root * ratio, t, dur, pre);
            o.detune.value = detune;
        }
    }
    whoosh(t, dur = 0.45, g = 0.5, f0 = 350, f1 = 2600) {
        t = this.T(t);
        const out = this.ctx.createGain();
        out.gain.setValueAtTime(0.0001, t);
        out.gain.exponentialRampToValueAtTime(g, t + dur * 0.7);
        out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
        if (pan) { pan.pan.setValueAtTime(-0.7, t); pan.pan.linearRampToValueAtTime(0.7, t + dur); out.connect(pan).connect(this.out); } else out.connect(this.out);
        const bp = this.filter('bandpass', f0, 1.4);
        bp.frequency.setValueAtTime(f0, t);
        bp.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.75);
        bp.connect(out);
        this.noise(t, dur, bp);
    }
    riser(t, dur = 1, g = 0.3) {
        t = this.T(t);
        const out = this.ctx.createGain();
        out.gain.setValueAtTime(0.0001, t);
        out.gain.exponentialRampToValueAtTime(g, t + dur);
        out.gain.setValueAtTime(0.0001, t + dur + 0.02);
        out.connect(this.out);
        const hp = this.filter('highpass', 300, 2);
        hp.frequency.setValueAtTime(300, t);
        hp.frequency.exponentialRampToValueAtTime(5000, t + dur);
        hp.connect(out);
        this.noise(t, dur, hp);
        const lp = this.filter('lowpass', 900, 4);
        lp.connect(out);
        const o = this.osc('sawtooth', 90, t, dur, lp);
        o.frequency.exponentialRampToValueAtTime(520, t + dur);
    }
    tick(t, g = 0.22, f = 1900) {
        t = this.T(t);
        const out = this.gain(t, g, 0.002, 0.09, this.out, 0.2);
        this.osc('sine', f, t, 0.12, out);
        this.osc('triangle', f * 2.01, t, 0.06, this.gain(t, g * 0.3, 0.002, 0.05));
    }
    crackle(t, dur = 0.5, g = 0.35) {
        const hp = this.filter('highpass', 2200, 0.7);
        hp.connect(this.out);
        for (let i = 0; i < Math.round(dur * 26); i++) {
            const at = this.T(t + Math.random() * dur);
            const v = this.gain(at, g * rand(0.3, 1), 0.001, rand(0.01, 0.05));
            v.disconnect(); v.connect(hp);
            this.noise(at, 0.07, v);
        }
    }
    thunder(t, g = 0.9) {
        this.boom(t, g, 38);
        this.crackle(t, 0.3, 0.5);
        const at = this.T(t);
        const lp = this.filter('lowpass', 1200, 0.5);
        lp.frequency.setValueAtTime(1400, at);
        lp.frequency.exponentialRampToValueAtTime(160, at + 2.2);
        lp.connect(this.gain(at, g * 0.8, 0.01, 2.4, this.out, 0.4));
        this.noise(at, 2.5, lp);
    }
    shatter(t, g = 0.45) {
        const at = this.T(t);
        const hp = this.filter('highpass', 2800, 0.6);
        hp.connect(this.gain(at, g * 0.7, 0.002, 0.28, this.out, 0.3));
        this.noise(at, 0.3, hp);
        for (let i = 0; i < 12; i++) {
            const s = at + Math.random() * 0.16;
            this.osc('sine', rand(2400, 6800), s, 0.2, this.gain(s, g * rand(0.08, 0.25), 0.001, rand(0.04, 0.18), this.out, 0.4));
        }
    }
    shimmer(t, g = 0.3) {
        [1318.5, 1975.5, 2637, 3951.1, 2637 * 1.5].forEach((f, i) => {
            const at = this.T(t + i * 0.045);
            this.osc('sine', f, at, 1.5, this.gain(at, g * (1 - i * 0.12), 0.004, 1.3, this.out, 0.9));
        });
    }
    /** Длинная тянущаяся «подложка» под кат-сцену. */
    drone(t, dur, g = 0.22, root = 55) {
        const at = this.T(t);
        const out = this.ctx.createGain();
        out.gain.setValueAtTime(0.0001, at);
        out.gain.exponentialRampToValueAtTime(g, at + Math.min(0.7, dur * 0.3));
        out.gain.setValueAtTime(g, at + dur * 0.7);
        out.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        out.connect(this.out);
        const s = this.ctx.createGain(); s.gain.value = 0.6; out.connect(s).connect(this.send);
        const lp = this.filter('lowpass', 420, 2);
        lp.connect(out);
        const lfo = this.osc('sine', 0.7, at, dur, this.ctx.createGain());
        const depth = this.ctx.createGain(); depth.gain.value = 160;
        lfo.disconnect(); lfo.connect(depth).connect(lp.frequency);
        for (const [ratio, det] of [[1, -6], [1, 6], [1.498, 0], [2, 3]]) {
            const o = this.osc('sawtooth', root * ratio, at, dur, lp);
            o.detune.value = det;
        }
    }
    kick(t, g = 0.9) {
        const at = this.T(t);
        const o = this.osc('sine', 160, at, 0.45, this.gain(at, g, 0.003, 0.42));
        o.frequency.exponentialRampToValueAtTime(42, at + 0.13);
    }
    clap(t, g = 0.35) {
        const at = this.T(t);
        const bp = this.filter('bandpass', 1400, 0.9);
        bp.connect(this.gain(at, g, 0.002, 0.18, this.out, 0.3));
        this.noise(at, 0.2, bp);
    }
    cowbell(t, f, g = 0.22) {
        const at = this.T(t);
        const bp = this.filter('bandpass', f * 2.2, 1.2);
        bp.connect(this.gain(at, g, 0.002, 0.26, this.out, 0.25));
        this.osc('square', f, at, 0.3, bp);
        this.osc('square', f * 1.4813, at, 0.3, bp);
    }
    bass(t, f, dur, g = 0.5) {
        const at = this.T(t);
        const out = this.gain(at, g, 0.005, dur);
        const sh = this.ctx.createWaveShaper(); sh.curve = this.assets.curve; sh.connect(out);
        const o = this.osc('sine', f * 1.12, at, dur, sh);
        o.frequency.exponentialRampToValueAtTime(f, at + 0.06);
    }
    /** Короткий фонк-луп (ковбелл + 808), как в шахматных эдитах. */
    phonk(t, bars = 1, bpm = 150) {
        const e = 60 / bpm / 2;   // восьмая
        const mel = [73, 73, 68, 71, 73, 76, 75, 71, 73, 73, 68, 71, 75, 73, 71, 68];
        for (let b = 0; b < bars; b++) {
            const s = t + b * e * 8;
            [0, 3, 6].forEach(i => this.kick(s + i * e, 0.75));
            [2, 6].forEach(i => this.clap(s + i * e, 0.22));
            for (let i = 0; i < 8; i++) this.cowbell(s + i * e, NOTE(mel[(b * 8 + i) % mel.length]), i % 2 ? 0.13 : 0.19);
            this.bass(s, NOTE(37), e * 3, 0.42);
            this.bass(s + e * 3, NOTE(37), e * 3, 0.38);
            this.bass(s + e * 6, NOTE(44), e * 2, 0.38);
        }
    }
    /** Сэмпл из банка (assets/chess/sounds/fx-*.mp3). */
    sample(name, t, g = 1, rate = 1) {
        const buf = this.bank?.[name];
        if (!buf) return;
        const at = this.T(t);
        const s = this.track(this.ctx.createBufferSource());
        s.buffer = buf;
        s.playbackRate.value = rate;
        const v = this.ctx.createGain();
        v.gain.value = g;
        s.connect(v).connect(this.out);
        s.start(Math.max(at, this.ctx.currentTime));
    }
    /** Отрезок трека: с offset секунды файла, звучит с t до t+dur, мимо компрессора ударов. */
    music(buf, offset, t, dur, g = 0.7) {
        if (!buf) return;
        let at = this.T(t);
        const now = this.ctx.currentTime;
        if (at < now) { offset += now - at; at = now; }
        const s = this.track(this.ctx.createBufferSource());
        s.buffer = buf;
        const v = this.ctx.createGain();
        v.gain.setValueAtTime(0.0001, at);
        v.gain.exponentialRampToValueAtTime(g, at + 0.35);
        v.gain.setValueAtTime(g, at + Math.max(0.4, dur - 0.9));
        v.gain.linearRampToValueAtTime(0, at + dur);
        s.connect(v).connect(this.limit);
        s.start(at, Math.max(0, Math.min(offset, buf.duration - 0.1)), dur + 0.05);
        this.musicGain = v;
    }
    stop(fade = 0.15) {
        const now = this.ctx.currentTime;
        try {
            this.out.gain.cancelScheduledValues(now);
            this.out.gain.setValueAtTime(this.out.gain.value, now);
            this.out.gain.linearRampToValueAtTime(0, now + fade);
            if (this.musicGain) {
                this.musicGain.gain.cancelScheduledValues(now);
                this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
                this.musicGain.gain.linearRampToValueAtTime(0, now + fade);
            }
        } catch (_) {}
        setTimeout(() => {
            for (const n of this.nodes) { try { n.stop(); } catch (_) {} }
            try { this.out.disconnect(); this.comp.disconnect(); this.post.disconnect(); this.limit.disconnect(); this.trim.disconnect(); this.send.disconnect(); this.verb.disconnect(); } catch (_) {}
        }, fade * 1000 + 60);
    }
}
const SILENT = new Proxy({}, { get: () => () => {} });

/* ---------- частицы: искры (сложение) и дым ---------- */
const POINT_VS = `
attribute float aSize; attribute vec4 aColor; varying vec4 vColor; uniform float uScale;
void main() { vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.05, -mv.z); gl_Position = projectionMatrix * mv; }`;
const POINT_FS = `
uniform sampler2D uTex; varying vec4 vColor;
void main() { float a = texture2D(uTex, gl_PointCoord).a * vColor.a; if (a < 0.003) discard; gl_FragColor = vec4(vColor.rgb, a); }`;

class Particles {
    constructor(max, tex, blending) {
        this.max = max;
        this.pos = new Float32Array(max * 3);
        this.col = new Float32Array(max * 4);
        this.size = new Float32Array(max);
        this.vel = new Float32Array(max * 3);
        this.life = new Float32Array(max);
        this.age = new Float32Array(max);
        this.s0 = new Float32Array(max);
        this.s1 = new Float32Array(max);
        this.a0 = new Float32Array(max);
        this.grav = new Float32Array(max);
        this.drag = new Float32Array(max);
        this.next = 0;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
        this.geo = geo;
        this.mat = new THREE.ShaderMaterial({
            uniforms: { uScale: { value: 400 }, uTex: { value: tex } },
            vertexShader: POINT_VS, fragmentShader: POINT_FS,
            transparent: true, depthWrite: false, blending,
        });
        this.points = new THREE.Points(geo, this.mat);
        this.points.frustumCulled = false;
        this.points.renderOrder = 5;
    }
    emit({ pos, vel = [0, 0, 0], color = [1, 1, 1], size = 0.08, size1 = null, life = 0.8, gravity = 0, drag = 0, alpha = 1 }) {
        const i = this.next;
        this.next = (this.next + 1) % this.max;
        this.pos.set([pos.x, pos.y, pos.z], i * 3);
        this.vel.set(Array.isArray(vel) ? vel : [vel.x, vel.y, vel.z], i * 3);
        const c = color.isColor ? [color.r, color.g, color.b] : color;
        this.col.set([c[0], c[1], c[2], alpha], i * 4);
        this.s0[i] = size; this.s1[i] = size1 == null ? size : size1;
        this.life[i] = life; this.age[i] = 0; this.a0[i] = alpha;
        this.grav[i] = gravity; this.drag[i] = drag;
    }
    update(dt) {
        for (let i = 0; i < this.max; i++) {
            if (this.life[i] <= 0) { this.size[i] = 0; continue; }
            this.age[i] += dt;
            const k = this.age[i] / this.life[i];
            if (k >= 1) { this.life[i] = 0; this.size[i] = 0; continue; }
            const d = Math.max(0, 1 - this.drag[i] * dt);
            this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt; this.vel[i * 3 + 2] *= d;
            this.pos[i * 3] += this.vel[i * 3] * dt;
            this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
            this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
            this.size[i] = lerp(this.s0[i], this.s1[i], k);
            this.col[i * 4 + 3] = this.a0[i] * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
        }
        this.geo.attributes.position.needsUpdate = true;
        this.geo.attributes.aColor.needsUpdate = true;
        this.geo.attributes.aSize.needsUpdate = true;
    }
    clear() { this.life.fill(0); this.size.fill(0); this.geo.attributes.aSize.needsUpdate = true; }
}

/* ---------- одна фигура на 3D-доске ---------- */

/* ---------- одна фигура на 3D-доске ---------- */
class Piece {
    constructor(world, code, sq) {
        this.world = world;
        this.code = code;
        this.color = code[0];
        this.kind = code[1];
        this.sq = sq;
        this.root = new THREE.Group();
        this.pivot = new THREE.Group();
        this.base = world.materials[this.color];
        this.mats = this.base.map(m => m.clone());
        this.mesh = new THREE.Mesh(world.geometry(this.kind), this.mats);
        this.mesh.castShadow = true;
        this.pivot.add(this.mesh);
        this.root.add(this.pivot);
        this.pos = world.P(sq);
        this.stand = 0;          // 0 — лежит на клетке (вид сверху), 1 — стоит
        this.yaw = 0;
        this.spin = 0;           // собственный поворот вокруг вертикали
        this.tilt = 0;           // наклон «на ребро», видна толщина
        this.fall = 0;           // опрокидывание (мат)
        this.free = null;        // свободный полёт: { vel, spin }
        this.jitter = 0;
        this.squash = 1;
        this.scale = 1;
        this.dim = 0;            // «режим фокуса»: остальные фигуры гаснут
        this.glowK = 0;
        this.glowColor = new THREE.Color(0xffffff);
        this.faceCamera = true;
        world.board.add(this.root);
    }
    get h() { return HEIGHT[this.kind]; }
    setKind(kind) { this.kind = kind; this.mesh.geometry = this.world.geometry(kind); }
    glow(color, k) { this.glowColor.set(color); this.glowK = k; }
    /** Точка на фигуре в мировых координатах: доли ширины/высоты силуэта. */
    point(u = 0, v = 0.5) {
        this.root.updateMatrixWorld(true);
        return this.mesh.localToWorld(new THREE.Vector3(u * 0.4 * this.h, v * this.h, 0));
    }
    eye() { return this.kind === 'N' ? this.point(-0.41, 0.77) : this.point(0, 0.82); }
    update(dt, camera) {
        const [cap, side] = this.mats;
        const d = 1 - this.dim * 0.82;
        cap.color.copy(this.base[0].color).multiplyScalar(d);
        side.color.copy(this.base[1].color).multiplyScalar(d);
        cap.emissive.copy(this.glowColor); cap.emissiveIntensity = this.glowK;
        side.emissive.copy(this.glowColor); side.emissiveIntensity = this.glowK * 0.6;
        if (this.free) {
            const f = this.free;
            f.vel.y -= 11 * dt;
            this.root.position.addScaledVector(f.vel, dt);
            this.root.rotation.x += f.spin.x * dt;
            this.root.rotation.y += f.spin.y * dt;
            this.root.rotation.z += f.spin.z * dt;
            const onBoard = Math.abs(this.root.position.x) < 4.3 && Math.abs(this.root.position.z) < 4.3 && this.world.boardSolid;
            const floor = onBoard ? 0.06 : FLOOR_Y + 0.06;
            if (this.root.position.y < floor && f.vel.y < 0) {
                this.root.position.y = floor;
                f.vel.y = Math.abs(f.vel.y) * 0.35;
                f.vel.x *= 0.6; f.vel.z *= 0.6; f.spin.multiplyScalar(0.6);
            }
            return;
        }
        const s = this.stand;
        this.root.position.copy(this.pos);
        if (s < 0.5 && this.pos.y < 0.05) this.root.position.y += this.world.rippleAt(this.pos.x, this.pos.z);
        if (this.jitter) this.root.position.add(new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).multiplyScalar(this.jitter));
        if (this.faceCamera) {
            const want = yawOf(this.root.position, camera.position);
            const k = 1 - Math.pow(0.0005, dt);
            this.yaw = s > 0.02 ? lerpAngle(this.yaw, want, k) : 0;
        }
        this.root.rotation.set(0, lerpAngle(0, this.yaw, E.sine(clamp(s))) + this.spin, 0);
        this.pivot.rotation.set(-(Math.PI / 2) * (1 - s) - this.fall * 1.48 - this.tilt * (1 - s), 0, 0);
        this.pivot.position.set(0, (DEPTH / 2 + 0.02) * (1 - s), (this.h / 2) * (1 - s));
        this.mesh.scale.set(this.scale / Math.sqrt(this.squash), this.scale * this.squash, this.scale);
    }
    launch(vel, spin) {
        this.root.updateMatrixWorld(true);
        this.free = { vel: vel.clone(), spin: spin.clone() };
    }
    dispose() { this.root.removeFromParent(); this.mats.forEach(m => m.dispose()); }
}

/* ---------- миры: доска, небо и акценты под настроение сцены ---------- */
const WORLDS = {
    // Тёмно-бирюзовый (реклама Duolingo): мягкий прожектор, четыре акцента
    teal: { light: '#3a5157', dark: '#1d2a2e', frame: '#141e21', floor: ['#18232a', '#0e1518'], glow: 0.55, sky: { top: '#04080a', horizon: '#14232a', bottom: '#05090b', nebula: '#1f4a52', neb: 0.35, stars: 0.4 }, fog: '#10191c' },
    // Светлая контрастная доска (ChessFXS)
    bright: { light: '#a9adab', dark: '#262829', frame: '#1c2021', floor: ['#26292b', '#151718'], glow: 0.18, sky: { top: '#101314', horizon: '#2e3637', bottom: '#0b0d0e', nebula: '#3a4a60', neb: 0.25, stars: 0.3 }, fog: '#22282a' },
    // Розово-лиловая, туман (ChessFXS v3)
    mauve: { light: '#5c4a54', dark: '#2a2027', frame: '#18171c', floor: ['#2e2c33', '#121115'], glow: 0.6, sky: { top: '#0b0a0e', horizon: '#3a2a35', bottom: '#09080b', nebula: '#6a2448', neb: 0.55, stars: 0.3 }, fog: '#241b22' },
    // Фиолетовая туманность
    void: { light: '#4a4e62', dark: '#17182a', frame: '#100f1c', floor: ['#1d1d33', '#0c0c18'], glow: 0.55, sky: { top: '#05040c', horizon: '#2a2160', bottom: '#04030a', nebula: '#6b4bd0', neb: 0.9, stars: 0.9 }, fog: '#140f2a' },
    // Красное небо мата
    crimson: { light: '#46434a', dark: '#121114', frame: '#0c0b0d', floor: ['#3a3a3e', '#0d0d10'], glow: 0.45, sky: { top: '#16060a', horizon: '#c04848', bottom: '#0a0405', nebula: '#7e3632', neb: 0.6, stars: 0.2 }, fog: '#3a1416' },
};
/** Значки на бейджах — SVG, ровно по центру круга. */
const GLYPHS = {
    '!!': '<svg viewBox="0 0 24 24"><rect x="5.6" y="3.5" width="4.2" height="11.5" rx="2.1"/><circle cx="7.7" cy="19" r="2.3"/><rect x="14.2" y="3.5" width="4.2" height="11.5" rx="2.1"/><circle cx="16.3" cy="19" r="2.3"/></svg>',
    '!': '<svg viewBox="0 0 24 24"><rect x="9.9" y="3.5" width="4.2" height="11.5" rx="2.1"/><circle cx="12" cy="19" r="2.3"/></svg>',
    '★': '<svg viewBox="0 0 24 24"><path d="M12 3.1 14.35 9.36 21.03 9.66 15.8 13.84 17.58 20.29 12 16.6 6.42 20.29 8.2 13.84 2.97 9.66 9.65 9.36Z"/></svg>',
    '#': '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round"><path d="M9.5 4 8 20M16 4l-1.5 16M4.5 9h15.5M4 15h15.5"/></svg>',
    '♛': '<svg viewBox="0 0 24 24"><path d="M3.5 8.2 7.6 11.6 12 4.8l4.4 6.8 4.1-3.4-1.6 9.3H5.1zM5.2 19h13.6v2H5.2z"/></svg>',
    '?': '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M8.6 8.4a3.6 3.6 0 1 1 5.3 3.2c-1.2.6-1.9 1.4-1.9 2.6v.6"/><circle cx="12" cy="19.2" r="1.3" fill="#fff" stroke="none"/></svg>',
};
const PIECE_HUE = { B: '#7fe6ff', N: '#ff8a3d', R: '#7cff4f', Q: '#ff8ad8', P: '#ffffff', K: '#ffd54a' };
const PIECE_WORLD = { B: '#1d2c3c', N: '#3e1e16', R: '#13280f', Q: '#3c1f38', P: '#140b1e' };

/* ---------- шейдеры ---------- */
const SKY_VS = `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FS = `
uniform vec3 uTop, uHorizon, uBottom, uNebula, uGlow, uGlowDir; uniform float uNeb, uGlowAmt, uTime, uStars, uFade;
varying vec3 vDir;
float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir); float h = d.y;
  vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHorizon, uBottom, pow(clamp(-h, 0.0, 1.0), 0.45));
  float n = fbm(d * 2.6 + vec3(0.0, uTime * 0.025, uTime * 0.01));
  float n2 = fbm(d * 5.3 - vec3(uTime * 0.02, 0.0, 0.0));
  c += uNebula * uNeb * (smoothstep(0.42, 0.85, n) * 1.4 + smoothstep(0.5, 0.9, n2) * 0.6);
  vec3 gd = normalize(uGlowDir);
  float g = pow(max(dot(d, gd), 0.0), 5.0);
  float band = exp(-abs(h) * 11.0) * pow(max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-4), normalize(vec3(gd.x, 0.0, gd.z) + 1e-4)), 0.0), 1.5);
  c += uGlow * uGlowAmt * (g * 1.6 + band * 1.2);
  vec3 sp = floor(d * 180.0); float st = step(0.9965, h3(sp)) * uStars * (0.5 + 0.5 * sin(uTime * 3.0 + h3(sp + 3.0) * 30.0));
  c += vec3(st);
  gl_FragColor = vec4(c * uFade, 1.0);
}`;
const FINAL_FS = `
uniform sampler2D tDiffuse; uniform float uTime, uFlash, uInvert, uCA, uBlur, uVig, uGrain, uDesat, uTintAmt, uExposure;
uniform vec3 uFlashColor, uTint; uniform vec2 uCenter, uRes; varying vec2 vUv;
void main() {
  vec2 uv = vUv; vec2 d = uv - uCenter; vec3 c;
  if (uBlur > 0.002) {
    c = vec3(0.0);
    for (int i = 0; i < 12; i++) { float s = 1.0 - uBlur * 0.16 * float(i) / 11.0; c += texture2D(tDiffuse, uCenter + d * s).rgb; }
    c /= 12.0;
  } else {
    c = texture2D(tDiffuse, uv).rgb;
  }
  if (uCA > 0.0005) { vec2 o = d * uCA * 2.0; c.r = texture2D(tDiffuse, uv + o).r; c.b = texture2D(tDiffuse, uv - o).b; }
  c *= uExposure;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, vec3(l), uDesat);
  c = mix(c, c * uTint * 1.7 + uTint * 0.04, uTintAmt);
  c = max(c - vec3(0.01), vec3(0.0)) * 1.02;
  float sl = dot(c, vec3(0.299, 0.587, 0.114));
  c = max(mix(vec3(sl), c, 1.3), vec3(0.0));
  float v = smoothstep(0.92, 0.2, length(d * vec2(1.0, 1.15)));
  c *= mix(1.0, v * v, uVig);
  c += uFlashColor * uFlash;
  c = mix(c, vec3(1.0) - clamp(c, 0.0, 1.0), uInvert);
  float g = fract(sin(dot(uv * uRes + fract(uTime) * 91.7, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  c += g * uGrain;
  gl_FragColor = vec4(c, 1.0);
}`;

/* ---------- режиссёр ---------- */
export function createDirector({ host, base = '' }) {
    const lite = document.body.classList.contains('lite-mode') || document.body.classList.contains('android-opt')
        || (navigator.hardwareConcurrency || 8) <= 4;
    const root = document.createElement('div');
    root.className = 'ca-root';
    root.innerHTML = `<div class="ca-speed"></div><div class="ca-streak"></div><div class="ca-crt"></div><div class="ca-labels"></div><div class="ca-caption"></div><div class="ca-skip"></div>`;
    host.appendChild(root);
    const dom = {
        speed: root.querySelector('.ca-speed'), streak: root.querySelector('.ca-streak'), crt: root.querySelector('.ca-crt'),
        labels: root.querySelector('.ca-labels'), caption: root.querySelector('.ca-caption'), skip: root.querySelector('.ca-skip'),
    };

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    const pixelRatio = Math.min(window.devicePixelRatio || 1, lite ? 1.25 : 1.75);
    renderer.setPixelRatio(pixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = !lite;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;
    root.insertBefore(renderer.domElement, root.firstChild);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a0b0e, 500, 1000);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 220);
    camera.rotation.order = 'YXZ';

    /* --- пост-обработка: блум и финальный проход --- */
    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(pixelRatio);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0, 0.3, 2.0);
    composer.addPass(bloom);
    const finalPass = new ShaderPass({
        uniforms: {
            tDiffuse: { value: null }, uTime: { value: 0 }, uFlash: { value: 0 }, uInvert: { value: 0 }, uCA: { value: 0 }, uBlur: { value: 0 },
            uVig: { value: 0 }, uGrain: { value: 0 }, uDesat: { value: 0 }, uTintAmt: { value: 0 }, uExposure: { value: 1 },
            uFlashColor: { value: new THREE.Color(1, 1, 1) }, uTint: { value: new THREE.Color(1, 1, 1) }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uRes: { value: new THREE.Vector2(512, 512) },
        },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: FINAL_FS,
    });
    composer.addPass(finalPass);
    composer.addPass(new OutputPass());
    const FU = finalPass.uniforms;

    /* --- текстуры --- */
    const radialTex = canvasTexture(128, (g, s) => {
        const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.22, 'rgba(255,255,255,.6)'); r.addColorStop(0.55, 'rgba(255,255,255,.14)'); r.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = r; g.fillRect(0, 0, s, s);
    });
    const sparkTex = canvasTexture(64, (g, s) => {
        const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.7)'); r.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = r; g.fillRect(0, 0, s, s);
    }, { srgb: false });
    const smokeTex = canvasTexture(128, (g, s) => {
        for (let i = 0; i < 26; i++) {
            const x = s / 2 + rand(-22, 22), y = s / 2 + rand(-22, 22), rr = rand(18, 40);
            const r = g.createRadialGradient(x, y, 0, x, y, rr);
            r.addColorStop(0, 'rgba(255,255,255,.22)'); r.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = r; g.fillRect(0, 0, s, s);
        }
    }, { srgb: false });
    const tileTex = canvasTexture(128, (g, s) => {
        const r = g.createRadialGradient(s / 2, s / 2, s * 0.1, s / 2, s / 2, s * 0.72);
        r.addColorStop(0, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,.85)');
        g.fillStyle = r; g.fillRect(4, 4, s - 8, s - 8);
        g.strokeStyle = '#fff'; g.lineWidth = 7; g.strokeRect(6, 6, s - 12, s - 12);
    });
    const haloTex = canvasTexture(128, (g, s) => {
        const r = g.createRadialGradient(s / 2, s / 2, s * 0.12, s / 2, s / 2, s / 2);
        r.addColorStop(0, 'rgba(255,255,255,.7)'); r.addColorStop(0.45, 'rgba(255,255,255,.25)'); r.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = r; g.fillRect(0, 0, s, s);
    });
    const dotsTex = canvasTexture(128, (g, s) => {
        g.fillStyle = '#fff';
        const n = 7, step = s / n;
        for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) { g.beginPath(); g.arc((x + 0.5) * step, (y + 0.5) * step, step * 0.26, 0, Math.PI * 2); g.fill(); }
    });
    const frameTex = canvasTexture(128, (g, s) => { g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(8, 8, s - 16, s - 16); });
    const flareTex = n => canvasTexture(256, (g, s) => {
        g.translate(s / 2, s / 2);
        const core = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.22);
        core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(0.3, 'rgba(255,255,255,.5)'); core.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = core; g.fillRect(-s / 2, -s / 2, s, s);
        for (let i = 0; i < n; i++) {
            g.save(); g.rotate(i * Math.PI * 2 / n);
            const long = n === 8 && i % 2 ? 0.55 : 1;
            const gr = g.createLinearGradient(0, 0, s / 2 * long, 0);
            gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = gr;
            g.beginPath(); g.moveTo(0, -s * 0.018); g.lineTo(s / 2 * long, 0); g.lineTo(0, s * 0.018); g.closePath(); g.fill();
            g.restore();
        }
    });
    const flare4 = flareTex(4), flare8 = flareTex(8);
    const moonTex = canvasTexture(512, (g, s) => {
        const R = s * 0.44, c = s / 2;
        const halo = g.createRadialGradient(c, c, R * 0.9, c, c, s / 2);
        halo.addColorStop(0, 'rgba(220,225,255,.35)'); halo.addColorStop(1, 'rgba(220,225,255,0)');
        g.fillStyle = halo; g.fillRect(0, 0, s, s);
        g.save(); g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.clip();
        g.fillStyle = '#d9d8e2'; g.fillRect(0, 0, s, s);
        // моря — тёмные пятна с мягкими краями
        for (const [x, y, r, a] of [[0.38, 0.36, 0.2, 0.32], [0.55, 0.3, 0.13, 0.28], [0.62, 0.52, 0.18, 0.3], [0.4, 0.62, 0.12, 0.24], [0.3, 0.48, 0.09, 0.2], [0.7, 0.68, 0.08, 0.18]]) {
            const gr = g.createRadialGradient(x * s, y * s, 0, x * s, y * s, r * s);
            gr.addColorStop(0, `rgba(95,92,112,${a})`); gr.addColorStop(0.7, `rgba(95,92,112,${a * 0.6})`); gr.addColorStop(1, 'rgba(95,92,112,0)');
            g.fillStyle = gr; g.fillRect(0, 0, s, s);
        }
        // кратеры с тенью и светлым краем
        for (let i = 0; i < 60; i++) {
            const x = c + rand(-R, R), y = c + rand(-R, R), r = Math.pow(Math.random(), 2.2) * 26 + 2;
            g.fillStyle = `rgba(70,68,86,${rand(0.12, 0.3)})`; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
            g.strokeStyle = `rgba(255,255,255,${rand(0.1, 0.25)})`; g.lineWidth = Math.max(1, r * 0.18); g.beginPath(); g.arc(x - r * 0.12, y - r * 0.12, r, Math.PI * 0.9, Math.PI * 1.9); g.stroke();
        }
        for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '60,58,76'},${rand(0.03, 0.09)})`; g.fillRect(rand(0, s), rand(0, s), 2, 2); }
        // затемнение к краю диска
        const limb = g.createRadialGradient(c - R * 0.2, c - R * 0.25, R * 0.2, c, c, R);
        limb.addColorStop(0, 'rgba(255,255,255,.12)'); limb.addColorStop(0.75, 'rgba(0,0,0,0)'); limb.addColorStop(1, 'rgba(10,10,30,.55)');
        g.fillStyle = limb; g.fillRect(0, 0, s, s);
        g.restore();
    });
    const circleTex = canvasTexture(1024, (g, s) => {
        g.translate(s / 2, s / 2);
        g.strokeStyle = '#fff'; g.fillStyle = '#fff';
        const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
        ring(490, 10); ring(452, 4); ring(330, 6); ring(300, 3); ring(130, 5);
        g.font = 'bold 34px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
        for (let i = 0; i < 36; i++) { g.save(); g.rotate(i * Math.PI * 2 / 36); g.fillText(runes[i % runes.length], 0, -471); g.restore(); }
        g.lineWidth = 5;
        for (const [k, r] of [[8, 452], [4, 330]]) {
            g.beginPath();
            for (let i = 0; i <= k; i++) { const a = i * Math.PI * 2 / k * (k === 8 ? 3 : 1) - Math.PI / 2; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); }
            g.stroke();
        }
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ring.call(null, 0, 0); g.beginPath(); g.arc(Math.cos(a) * 390, Math.sin(a) * 390, 26, 0, Math.PI * 2); g.stroke(); }
    });
    /** Стрелки ходов фигуры (для «перебора» при превращении). */
    const arrowTex = {};
    function arrowsFor(kind) {
        if (arrowTex[kind]) return arrowTex[kind];
        arrowTex[kind] = canvasTexture(512, (g, s) => {
            g.translate(s / 2, s / 2);
            g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 14; g.lineCap = 'round'; g.lineJoin = 'round';
            const arrow = pts => {
                g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
                const [x1, y1] = pts[pts.length - 1], [x0, y0] = pts[pts.length - 2];
                const a = Math.atan2(y1 - y0, x1 - x0);
                g.beginPath(); g.moveTo(x1 + Math.cos(a) * 18, y1 + Math.sin(a) * 18);
                g.lineTo(x1 + Math.cos(a + 2.4) * 40, y1 + Math.sin(a + 2.4) * 40); g.lineTo(x1 + Math.cos(a - 2.4) * 40, y1 + Math.sin(a - 2.4) * 40); g.fill();
            };
            const r0 = 70, r1 = 225;
            const dirs = kind === 'B' ? [1, 3, 5, 7] : kind === 'R' ? [0, 2, 4, 6] : [0, 1, 2, 3, 4, 5, 6, 7];
            if (kind === 'N') {
                for (const [dx, dy] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) {
                    const L = 95;
                    const mid = Math.abs(dx) === 2 ? [dx * L, 0] : [0, dy * L];
                    arrow([[Math.sign(mid[0]) * 40, Math.sign(mid[1]) * 40], mid, [dx * L, dy * L]]);
                }
            } else {
                for (const i of dirs) { const a = i * Math.PI / 4; arrow([[Math.cos(a) * r0, Math.sin(a) * r0], [Math.cos(a) * r1, Math.sin(a) * r1]]); }
            }
        });
        return arrowTex[kind];
    }

    /* --- материалы фигур --- */
    const materials = {
        w: [new THREE.MeshStandardMaterial({ color: 0xe9edf2, roughness: 0.45, metalness: 0.02 }), new THREE.MeshStandardMaterial({ color: 0x4f5864, roughness: 0.55 })],
        b: [new THREE.MeshStandardMaterial({ color: 0x5d636c, roughness: 0.32, metalness: 0.18 }), new THREE.MeshStandardMaterial({ color: 0x1f2226, roughness: 0.5 })],
    };
    const svg = new SVGLoader();
    const geoCache = {};
    function geometry(kind) {
        if (geoCache[kind]) return geoCache[kind];
        const [width, d] = SHAPES[kind];
        const s = HEIGHT[kind] / 512;
        const data = svg.parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`);
        const shapes = data.paths.flatMap(p => SVGLoader.createShapes(p));
        const geo = new THREE.ExtrudeGeometry(shapes, { depth: DEPTH / s, bevelEnabled: true, bevelThickness: 0.018 / s, bevelSize: 0.014 / s, bevelSegments: 2, curveSegments: 7 });
        geo.scale(s, -s, -s);
        geo.translate(-width / 2 * s, 512 * s, DEPTH / 2);
        geo.computeBoundingSphere();
        geo.computeBoundingBox();
        geoCache[kind] = geo;
        return geo;
    }

    /* --- небо --- */
    const skyU = {
        uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() }, uNebula: { value: new THREE.Color() },
        uGlow: { value: new THREE.Color(0xff3030) }, uGlowDir: { value: new THREE.Vector3(0, 0.1, -1) }, uNeb: { value: 0 }, uGlowAmt: { value: 0 },
        uTime: { value: 0 }, uStars: { value: 0 }, uFade: { value: 1 },
    };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false }));
    sky.renderOrder = -10;
    scene.add(sky);
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, transparent: true, opacity: 0, depthWrite: false }));
    moon.renderOrder = -9;
    scene.add(moon);

    /* --- доска: рябь «как ткань», разбивается на стёкла --- */
    const board = new THREE.Group();
    scene.add(board);
    const boardU = { map2: { value: null }, mixK: { value: 0 }, glow: { value: 0 }, pool: { value: new THREE.Vector2() }, poolAmt: { value: 0 } };
    const topMat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.05 });
    topMat.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, boardU);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
            .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D map2; uniform float mixK, glow, poolAmt; uniform vec2 pool; varying vec3 vWPos;')
            .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, texture2D(map2, vMapUv).rgb, mixK);')
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat pf = mix(1.0, smoothstep(7.0, 0.4, distance(vWPos.xz, pool)), poolAmt);\ntotalEmissiveRadiance += diffuseColor.rgb * glow * pf;');
    };
    const SEG = 48;
    const topGeo = new THREE.PlaneGeometry(1, 1, SEG, SEG);
    topGeo.rotateX(-Math.PI / 2);
    const topBase = topGeo.attributes.position.array.slice();
    const top = new THREE.Mesh(topGeo, topMat);
    top.receiveShadow = true;
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.7 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1, SLAB, 1), slabMat);
    slab.position.y = -SLAB / 2 - 0.004;
    slab.receiveShadow = true;
    board.add(slab, top);
    const floorTex = canvasTexture(128, () => {}, { repeat: true });
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8, transparent: true, opacity: 0 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR_Y;
    floor.receiveShadow = true;
    scene.add(floor);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f99, 2.6);
    const key = new THREE.SpotLight(0xfff1e0, 0, 0, 0.55, 0.85, 0);
    key.position.set(-3, 11, 6);
    key.castShadow = !lite;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0004;
    key.shadow.camera.near = 2; key.shadow.camera.far = 30;
    const rim = new THREE.PointLight(0xff3b30, 0, 8, 0);
    const accentLight = new THREE.PointLight(0xffffff, 0, 5, 0);
    const camFill = new THREE.DirectionalLight(0xdfe6ff, 0);
    scene.add(hemi, key, key.target, rim, accentLight, camFill, camFill.target);

    /* --- пулы эффектов --- */
    const sparks = new Particles(lite ? 700 : 1400, sparkTex, THREE.AdditiveBlending);
    const dust = new Particles(lite ? 160 : 320, sparkTex, THREE.AdditiveBlending);
    const smoke = new Particles(lite ? 120 : 220, smokeTex, THREE.NormalBlending);
    smoke.points.renderOrder = 4;
    scene.add(sparks.points, dust.points, smoke.points);
    const fx = new THREE.Group();
    scene.add(fx);

    // клетки: заливка, ореол, точечная LED-матрица, рамка
    const tileSets = { fill: tileTex, halo: haloTex, dots: dotsTex, frame: frameTex };
    const tiles = {};
    for (const [kind, tex] of Object.entries(tileSets)) {
        tiles[kind] = [];
        for (let i = 0; i < 64; i++) {
            const size = kind === 'halo' ? 2.6 : kind === 'frame' ? 1.0 : 1;
            const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
            m.rotation.x = -Math.PI / 2;
            m.position.set((i % 8) - 3.5, { fill: 0.006, halo: 0.004, dots: 0.008, frame: 0.01 }[kind], Math.floor(i / 8) - 3.5);
            m.renderOrder = 2;
            m.visible = false;
            board.add(m);
            tiles[kind].push(m);
        }
    }

    const world = {
        board, materials, geometry,
        orientation: 'w',
        boardSolid: true,
        ripple: [],          // { t0, cx, cz, amp, dur }
        time: 0,
        P(sq, y = 0) {
            const f = sq.charCodeAt(0) - 97, r = Number(sq[1]) - 1;
            const x = this.orientation === 'w' ? f : 7 - f;
            const z = this.orientation === 'w' ? 7 - r : r;
            return new THREE.Vector3(x - 3.5, y, z - 3.5);
        },
        xy(sq) { const p = this.P(sq); return [p.x + 3.5, p.z + 3.5]; },
        rippleAt(x, z) {
            let y = 0;
            for (const r of this.ripple) {
                const e = this.time - r.t0;
                if (e < 0 || e > r.dur) continue;
                const d = Math.hypot(x - r.cx, z - r.cz);
                const env = Math.sin(Math.PI * e / r.dur) * Math.exp(-d * 0.18);
                y += r.amp * env * Math.sin(d * 1.6 - e * 9);
            }
            return y;
        },
    };

    /* --- звук: сэмплы и треки грузятся один раз --- */
    const bank = {};
    let bankLoading = null;
    const FX = ['fx-drop', 'fx-hit', 'fx-glitch', 'fx-glitch2', 'fx-shine', 'fx-whoosh', 'fx-pop'];
    const TRACKS = { track1: { file: 'music/track1.mp3', drop: 7.50 }, track2: { file: 'music/track2.mp3', drop: 10.72 } };
    function loadAudio(ctx) {
        if (bankLoading || !ctx) return bankLoading;
        const get = (name, path) => fetch(`${base}${path}`).then(r => r.arrayBuffer())
            .then(data => new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject)))
            .then(buf => { bank[name] = buf; }).catch(() => {});
        bankLoading = Promise.all([...FX.map(n => get(n, `sounds/${n}.mp3`)), ...Object.entries(TRACKS).map(([n, t]) => get(n, t.file))]);
        return bankLoading;
    }

    /* --- состояние проигрывания --- */
    let run = null;
    let rafId = 0;

    function sizeToHost() {
        const rect = host.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
        renderer.setSize(w, h, false);
        composer.setSize(w, h);
        bloom.resolution.set(w / 2, h / 2);
        FU.uRes.value.set(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        return { w, h, rect };
    }

    /** Кадр, в котором 3D-доска ложится ровно на доску страницы. */
    function homeShot(spec, size) {
        const fov = 30;
        const S = spec.rect.w;
        const dist = 8 * size.h / (2 * S * Math.tan(THREE.MathUtils.degToRad(fov / 2)));
        const u = 2 * dist * Math.tan(THREE.MathUtils.degToRad(fov / 2)) / size.h;
        const cx = spec.rect.x + spec.rect.w / 2, cy = spec.rect.y + spec.rect.h / 2;
        return { target: new THREE.Vector3((size.w / 2 - cx) * u, 0, (size.h / 2 - cy) * u), dist, yaw: 0, pitch: Math.PI / 2, roll: 0, fov };
    }

    function drawBoard(spec, colors, coords) {
        const m = spec.margin;
        const total = 8 + 2 * m;
        return canvasTexture(1024, (g, s) => {
            const u = s / total;
            g.fillStyle = colors.frame; g.fillRect(0, 0, s, s);
            for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
                const f = world.orientation === 'w' ? x : 7 - x, r = world.orientation === 'w' ? 7 - y : y;
                g.fillStyle = (f + r) % 2 === 0 ? colors.dark : colors.light;
                g.fillRect((m + x) * u, (m + y) * u, u + 0.5, u + 0.5);
            }
            g.strokeStyle = colors.line || 'rgba(255,255,255,.18)'; g.lineWidth = u * 0.03;
            g.strokeRect(m * u - g.lineWidth / 2, m * u - g.lineWidth / 2, 8 * u + g.lineWidth, 8 * u + g.lineWidth);
            if (coords) {
                g.fillStyle = colors.coord || 'rgba(255,255,255,.35)';
                g.font = `600 ${Math.round(m * u * 0.62)}px -apple-system, system-ui, sans-serif`;
                g.textAlign = 'center'; g.textBaseline = 'middle';
                coords.files.forEach((t, i) => { g.fillText(t, (m + i + 0.5) * u, m * u / 2); g.fillText(t, (m + i + 0.5) * u, s - m * u / 2); });
                coords.ranks.forEach((t, i) => { g.fillText(t, m * u / 2, (m + i + 0.5) * u); g.fillText(t, s - m * u / 2, (m + i + 0.5) * u); });
            }
        });
    }

    function setCamera(shot) {
        const p = shot.pitch, y = shot.yaw;
        camera.position.set(
            shot.target.x + shot.dist * Math.cos(p) * Math.sin(y),
            shot.target.y + shot.dist * Math.sin(p),
            shot.target.z + shot.dist * Math.cos(p) * Math.cos(y));
        camera.rotation.set(-p, y, shot.roll || 0, 'YXZ');
        if (Math.abs(camera.fov - shot.fov) > 1e-4) { camera.fov = shot.fov; camera.updateProjectionMatrix(); }
    }
    function mixShot(a, b, k) {
        return {
            target: a.target.clone().lerp(b.target, k), dist: lerp(a.dist, b.dist, k),
            yaw: lerpAngle(a.yaw, b.yaw, k), pitch: lerp(a.pitch, b.pitch, k), roll: lerp(a.roll || 0, b.roll || 0, k), fov: lerp(a.fov, b.fov, k),
        };
    }
    const copyShot = s => ({ ...s, target: s.target.clone() });

    function clearFx() {
        while (fx.children.length) {
            const o = fx.children[0];
            o.removeFromParent();
            o.traverse?.(n => {
                if (n.geometry && !n.userData.shared && !n.isSprite) n.geometry.dispose();
                if (n.material && !n.userData.sharedMat) [].concat(n.material).forEach(mm => mm.dispose());
            });
        }
        sparks.clear(); dust.clear(); smoke.clear();
        for (const list of Object.values(tiles)) list.forEach(m => { m.visible = false; m.material.opacity = 0; });
        dom.labels.innerHTML = '';
        dom.caption.innerHTML = '';
        dom.speed.style.opacity = '0';
        dom.streak.style.opacity = '0';
        dom.crt.style.opacity = '0';
        dom.skip.style.opacity = '0';
        moon.material.opacity = 0;
        world.ripple = [];
        world.boardSolid = true;
        board.visible = true;
        slab.visible = top.visible = true;
    }

    function play(spec) {
        if (run) finish(true);
        clearFx();
        world.orientation = spec.orientation;
        const size = sizeToHost();
        spec.margin = spec.rect.margin / (spec.rect.w / 8);
        const total = 8 + 2 * spec.margin;
        slab.scale.set(total, 1, total);
        const pos = topGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) pos.setXYZ(i, topBase[i * 3] * total, 0, topBase[i * 3 + 2] * total);
        pos.needsUpdate = true;
        topGeo.computeVertexNormals();
        const W = WORLDS[spec.world] || WORLDS.teal;
        if (topMat.map) topMat.map.dispose();
        if (boardU.map2.value) boardU.map2.value.dispose();
        topMat.map = drawBoard(spec, spec.theme, spec.coords);
        boardU.map2.value = drawBoard(spec, { light: W.light, dark: W.dark, frame: W.frame, coord: 'rgba(255,255,255,.28)' }, spec.coords);
        topMat.needsUpdate = true;
        const ft = floorTex.image.getContext('2d');
        ft.fillStyle = W.floor[0]; ft.fillRect(0, 0, 128, 128);
        ft.fillStyle = W.floor[1]; ft.fillRect(0, 0, 64, 64); ft.fillRect(64, 64, 64, 64);
        floorTex.needsUpdate = true;
        floorTex.repeat.set(80, 80);
        skyU.uTop.value.set(W.sky.top); skyU.uHorizon.value.set(W.sky.horizon); skyU.uBottom.value.set(W.sky.bottom);
        skyU.uNebula.value.set(W.sky.nebula); skyU.uNeb.value = W.sky.neb; skyU.uStars.value = W.sky.stars; skyU.uGlowAmt.value = 0;

        const pieces = new Map();
        for (const [sq, code] of spec.pieces) pieces.set(sq, new Piece(world, code, sq));
        const home = homeShot(spec, size);
        const sfx = spec.audio && spec.sound ? new Sfx(spec.audio) : SILENT;
        if (sfx !== SILENT) { sfx.bank = bank; loadAudio(spec.audio); }

        const st = {
            spec, pieces, home, W, sfx, size,
            tl: new Timeline(), t: 0, timeScale: 1, mood: 0,
            shot: copyShot(home), shake: 0, shakeDecay: 3, punch: 0, drift: 1, camSeq: 0, camOwner: 0, moveSeq: 0,
            labels: [], tileFx: [], updaters: [],
            speed: 0, flashDecay: 9,
            post: { flash: 0, flashColor: new THREE.Color(1, 1, 1), invert: 0, ca: 0, caBase: 0.0015, blur: 0, tint: new THREE.Color(1, 1, 1), tintAmt: 0, desat: 0, exposure: 1, bloom: 0.45, bloomRadius: 0.3 },
            focus: null, resolve: null, last: performance.now(),
        };
        run = st;
        setCamera(home);
        dom.skip.textContent = spec.texts?.skip || '';
        const C = context(st);
        const template = TEMPLATES[spec.template] || TEMPLATES.lockon;
        const out = template(C);
        const D = out.duration;
        common(C, D);
        st.duration = D;
        // музыка: главный удар сцены совпадает с дропом трека
        if (sfx !== SILENT && spec.music !== false) {
            const name = out.track || 'track1';
            const tr = TRACKS[name];
            const hit = out.drop ?? 1;
            const offset = tr.drop - hit;
            const play = () => sfx.music(bank[name], Math.max(0, offset), Math.max(0, -offset), D - Math.max(0, -offset), 0.62);
            if (bank[name]) play(); else bankLoading?.then(() => { if (run === st && bank[name] && st.t < hit - 0.5) { const late = st.t; sfx.music(bank[name], Math.max(0, offset) + late, late, D - late, 0.62); } });
        }
        tick(st, 0);
        root.classList.add('on');
        root.onpointerdown = event => { event.preventDefault(); event.stopPropagation(); skip(); };
        cancelAnimationFrame(rafId);
        if (!spec.manual) rafId = requestAnimationFrame(frame);
        return new Promise(resolve => { st.resolve = resolve; });
    }

    function frame(now) {
        const st = run;
        if (!st) return;
        const dt = Math.min(0.05, Math.max(0, (now - st.last) / 1000));
        st.last = now;
        if (tick(st, dt)) rafId = requestAnimationFrame(frame);
    }

    /** Один кадр сцены; false — сцена закончилась. */
    function tick(st, dt) {
        st.t += dt;
        world.time = st.t;
        st.tl.update(st.t);
        const wdt = dt * st.timeScale;
        for (const fn of st.updaters) fn(wdt, dt);
        sparks.update(wdt); dust.update(wdt); smoke.update(wdt);
        for (const p of st.pieces.values()) p.update(wdt, camera);
        updateRipple();
        // камера: кадр + «дыхание» + толчок зума + тряска
        const k = st.mood * st.drift;
        const s = st.shot;
        const shot = { ...s, roll: (s.roll || 0) + Math.sin(st.t * 0.63 + 1) * 0.04 * k, yaw: s.yaw + Math.sin(st.t * 0.41) * 0.025 * k, dist: s.dist * (1 + Math.sin(st.t * 0.37 + 2) * 0.02 * k), fov: s.fov * (1 - st.punch) };
        setCamera(shot);
        st.punch *= Math.exp(-7 * dt);
        if (st.shake > 0.0005) {
            const a = st.shake;
            camera.position.x += Math.sin(st.t * 61) * a * 0.5 + rand(-a, a) * 0.25;
            camera.position.y += Math.sin(st.t * 47 + 1) * a * 0.4;
            camera.rotation.z += Math.sin(st.t * 53 + 2) * a * 0.05;
            st.shake *= Math.exp(-st.shakeDecay * dt);
        }
        sky.position.copy(camera.position);
        skyU.uTime.value = st.t;
        applyMood(st, dt);
        updateTiles(st);
        updateLabels(st);
        const scale = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
        sparks.mat.uniforms.uScale.value = dust.mat.uniforms.uScale.value = smoke.mat.uniforms.uScale.value = scale;
        composer.render(dt);
        if (st.t >= st.duration) { finish(false); return false; }
        return true;
    }

    function updateRipple() {
        const active = world.ripple.some(r => world.time >= r.t0 && world.time <= r.t0 + r.dur + 0.05);
        if (!active && !world.rippleDirty) return;
        const pos = topGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) pos.setY(i, active ? world.rippleAt(pos.getX(i), pos.getZ(i)) : 0);
        pos.needsUpdate = true;
        topGeo.computeVertexNormals();
        world.rippleDirty = active;
    }

    function applyMood(st, dt) {
        const k = st.mood, W = st.W, P = st.post;
        hemi.intensity = lerp(2.65, 0.25, k);
        hemi.groundColor.set(0x8a8f99).lerp(new THREE.Color(0x101216), k);
        key.intensity = lerp(0, 3.6, k);
        rim.intensity = lerp(0, 9, k) * (st.rimBoost ?? 1);
        rim.color.set(st.accent || '#ff3b30');
        camFill.intensity = lerp(0, 0.8, k);
        camFill.position.copy(camera.position).add(new THREE.Vector3(0, 1.5, 0));
        boardU.mixK.value = k;
        boardU.glow.value = W.glow * 1.1 * k * (st.boardGlow ?? 1);
        boardU.poolAmt.value = 0.75 * k;
        floorMat.opacity = k;
        scene.fog.color.set(W.fog);
        scene.fog.near = lerp(400, 8, k);
        scene.fog.far = lerp(900, 30, k);
        skyU.uFade.value = 1;
        if (st.focus) {
            boardU.pool.value.set(st.focus.x, st.focus.z);
            key.target.position.copy(st.focus);
            camFill.target.position.copy(st.focus);
            rim.position.copy(st.focus).add(new THREE.Vector3(-Math.sin(st.shot.yaw) * 2, 1.3, -Math.cos(st.shot.yaw) * 2));
        }
        // пост-обработка
        P.flash *= Math.exp(-st.flashDecay * dt);
        P.blur *= Math.exp(-9 * dt);
        P.ca = Math.max(P.caBase, P.ca * Math.exp(-6 * dt));
        bloom.strength = P.bloom * k;
        bloom.radius = P.bloomRadius;
        FU.uTime.value = st.t;
        FU.uFlash.value = P.flash;
        FU.uFlashColor.value.copy(P.flashColor);
        FU.uInvert.value = P.invert;
        FU.uCA.value = P.ca * k;
        FU.uBlur.value = P.blur;
        FU.uVig.value = 0.9 * k;
        FU.uGrain.value = 0.018 * k;
        FU.uDesat.value = P.desat;
        FU.uTint.value.copy(P.tint);
        FU.uTintAmt.value = P.tintAmt;
        FU.uExposure.value = P.exposure * lerp(1, 1.18, k);
        dom.speed.style.opacity = String(st.speed);
        // пыль в воздухе вокруг кадра
        if (k > 0.3 && Math.random() < 0.8 * k) {
            const c = st.focus || new THREE.Vector3();
            dust.emit({ pos: new THREE.Vector3(c.x + rand(-4, 4), rand(0.05, 2.6), c.z + rand(-4, 4)), vel: [rand(-0.06, 0.06), rand(0.03, 0.15), rand(-0.06, 0.06)], color: st.dustColor || [0.8, 0.9, 1], size: rand(0.015, 0.045), life: rand(2, 4), alpha: rand(0.3, 0.8) });
        }
    }

    function updateTiles(st) {
        const acc = {};
        for (const kind of Object.keys(tiles)) acc[kind] = { a: new Float32Array(64), c: new Array(64) };
        for (const fn of st.tileFx) fn(st.t, (kind, i, alpha, color) => {
            const A = acc[kind];
            alpha *= st.mood;
            if (alpha > A.a[i]) { A.a[i] = alpha; A.c[i] = color; }
        });
        for (const kind of Object.keys(tiles)) {
            const A = acc[kind];
            for (let i = 0; i < 64; i++) {
                const m = tiles[kind][i];
                m.visible = A.a[i] > 0.004 && world.boardSolid;
                if (m.visible) {
                    m.material.opacity = Math.min(1, A.a[i]);
                    m.material.color.set(A.c[i]).multiplyScalar(kind === 'halo' ? 0.9 : kind === 'fill' ? 1.5 : 2.2);
                    const x = (i % 8) - 3.5, z = Math.floor(i / 8) - 3.5;
                    m.position.y = world.rippleAt(x, z) + { fill: 0.006, halo: 0.004, dots: 0.008, frame: 0.01 }[kind];
                }
            }
        }
    }

    function updateLabels(st) {
        const w = st.size.w, h = st.size.h;
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        for (const l of st.labels) {
            const live = st.t >= l.from && st.t <= l.to;
            if (!live) { if (l.shown) { l.el.style.display = 'none'; l.shown = false; } continue; }
            if (l.screen) {
                if (!l.shown) { l.el.style.display = ''; l.shown = true; }
                l.el.classList.toggle('out', st.t > l.to - 0.3);
                continue;
            }
            const at = typeof l.at === 'function' ? l.at() : l.at;
            const p = at.clone().project(camera);
            if (p.z >= 1) { l.el.style.display = 'none'; l.shown = false; continue; }
            if (!l.shown) { l.el.style.display = ''; l.shown = true; }
            let scale = 1;
            if (l.world) {
                const q = at.clone().addScaledVector(right, l.world).project(camera);
                scale = Math.max(0.6, Math.min(1.8, Math.hypot((q.x - p.x) * w / 2, (q.y - p.y) * h / 2) / 40));
            }
            const px = clamp((p.x + 1) / 2 * w, 40, w - 40), py = clamp((1 - p.y) / 2 * h, 86, h - 40);
            // сглаживание: метка не дрожит вместе с «дыханием» камеры
            if (l.sx == null) { l.sx = px; l.sy = py; l.ss = scale; }
            l.sx += (px - l.sx) * 0.35; l.sy += (py - l.sy) * 0.35; l.ss += (scale - l.ss) * 0.15;
            l.el.style.transform = `translate3d(${l.sx.toFixed(1)}px, ${l.sy.toFixed(1)}px, 0) scale(${l.ss.toFixed(3)})`;
            l.el.classList.toggle('out', st.t > l.to - 0.25);
        }
    }

    function finish(abort) {
        const st = run;
        if (!st) return;
        run = null;
        cancelAnimationFrame(rafId);
        st.sfx.stop(abort ? 0.15 : 0.5);
        root.onpointerdown = null;
        root.classList.remove('on');
        setTimeout(() => {
            if (run) return;
            for (const p of st.pieces.values()) p.dispose();
            clearFx();
        }, 340);
        st.resolve?.(!abort);
    }
    function skip() { if (run) finish(true); }

    /* --- набор инструментов для шаблонов --- */
    function context(st) {
        const spec = st.spec;
        const tl = st.tl;
        const pcs = st.pieces;
        const P = (sq, y = 0) => world.P(sq, y);
        const mv = spec.move;
        const capSq = mv.capSq || (mv.captured ? mv.to : null);
        const attacker = pcs.get(mv.from);
        const victim = capSq ? pcs.get(capSq) : null;
        const A = P(mv.from), T = P(mv.to), V = capSq ? P(capSq) : T.clone();
        const dir = V.clone().sub(A).setY(0);
        if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
        dir.normalize();
        const side = new THREE.Vector3(-dir.z, 0, dir.x);
        const n = lite ? 0.55 : 1;
        const sqIndex = sq => { const [x, y] = world.xy(sq); return y * 8 + x; };
        const tx = spec.texts || {};

        const C = {
            st, tl, spec, P, A, T, V, dir, side, attacker, victim, sfx: st.sfx, world, lite, camera, tx,
            value: mv.captured ? VALUE[mv.captured] : 0,
            set focus(v) { st.focus = v; },
            shot: (target, dist, yaw, pitch, fov = 42, roll = 0) => ({ target: target.clone(), dist, yaw, pitch, fov, roll }),
            /** Кадр сбоку/сзади точки: камера на высоте y, смотрит на look. */
            from(pos, look, fov = 46, roll = 0) {
                const d = pos.distanceTo(look);
                return { target: look.clone(), dist: d, yaw: yawOf(look, pos), pitch: Math.asin(clamp((pos.y - look.y) / d, -1, 1)), fov, roll };
            },
            /** Плавный перелёт камеры; кадром владеет последний начавшийся перелёт. */
            cam(start, dur, to, ease = E.inOut) {
                let from = null, id = 0;
                tl.tween(start, dur, k => { if (st.camOwner === id) st.shot = mixShot(from, typeof to === 'function' ? to() : to, k); }, ease, () => { from = copyShot(st.shot); id = ++st.camSeq; st.camOwner = id; });
            },
            camFn(start, dur, fn, ease = E.linear) {
                let id = 0;
                tl.tween(start, dur, k => { if (st.camOwner === id) st.shot = fn(k); }, ease, () => { id = ++st.camSeq; st.camOwner = id; });
            },
            /** Быстрый, но плавный переезд (без рывка) с лёгким размытием. */
            whip(start, to, dur = 0.55) {
                C.cam(start, dur, to, E.inOut);
                tl.at(start + dur * 0.3, () => { st.post.blur = Math.max(st.post.blur, 0.35); });
            },
            /** Склейка под мягкой вспышкой. */
            cut(start, to, { flash = 0.5, color = '#ffffff', invert = false } = {}) {
                tl.at(start, () => { st.camOwner = ++st.camSeq; st.shot = copyShot(typeof to === 'function' ? to() : to); });
                C.flash(start, flash, color);
                if (invert) C.invert(start, 1);
            },
            /** Переход в объём: под вспышкой все фигуры уже стоят (без видимого «вставания»). */
            rise(start, to = 1) {
                tl.at(start, () => { for (const p of pcs.values()) if (!p.free) { p.stand = to; p.yaw = to ? yawOf(p.root.position, camera.position) : 0; } });
            },
            punch(start, amount = 0.14) { tl.at(start, () => { st.punch = amount; st.post.blur = Math.max(st.post.blur, Math.abs(amount) * 4); }); },
            shake(start, amount = 0.2, decay = 3) { tl.at(start, () => { st.shake = Math.max(st.shake, amount); st.shakeDecay = decay; }); },
            flash(start, amount = 0.8, color = '#ffffff', decay = 9) { tl.at(start, () => { st.post.flash = Math.min(0.42, amount); st.post.flashColor.set(color); st.flashDecay = Math.max(16, decay); }); },
            invert(start, frames = 1) { tl.tween(start, frames / 30, k => { st.post.invert = k < 1 ? 1 : 0; }, E.linear); },
            ca(start, amount = 0.012) { tl.at(start, () => { st.post.ca = amount; }); },
            post(start, dur, key, to, ease = E.inOut) {
                let from = 0;
                const isColor = typeof to === 'string';
                const target = isColor ? new THREE.Color(to) : null;
                let fromC = null;
                tl.tween(start, dur, k => { if (isColor) st.post[key].copy(fromC).lerp(target, k); else st.post[key] = lerp(from, to, k); }, ease, () => { if (isColor) fromC = st.post[key].clone(); else from = st.post[key]; });
            },
            sky(start, dur, props, ease = E.inOut) {
                const from = {};
                tl.tween(start, dur, k => {
                    for (const [key, v] of Object.entries(props)) {
                        const u = skyU[key];
                        if (typeof v === 'number') u.value = lerp(from[key], v, k);
                        else if (u.value.isColor) u.value.copy(from[key]).lerp(new THREE.Color(v), k);
                        else u.value.copy(from[key]).lerp(v, k);
                    }
                }, ease, () => { for (const key of Object.keys(props)) from[key] = typeof props[key] === 'number' ? skyU[key].value : skyU[key].value.clone(); });
            },
            value01(start, dur, prop, to, ease = E.inOut) { let from = 0; tl.tween(start, dur, k => { st[prop] = lerp(from, to, k); }, ease, () => { from = st[prop] ?? 0; }); },
            mood(start, dur, to, ease = E.inOut) { C.value01(start, dur, 'mood', to, ease); },
            timeScale(start, dur, to, ease = E.inOut) { C.value01(start, dur, 'timeScale', to, ease); },
            hitstop(start, dur = 0.09) { C.timeScale(start, 0.01, 0.02); C.timeScale(start + dur, 0.05, 1); },
            standAll(start, dur, to, center = V, stagger = 0.035) {
                for (const p of pcs.values()) {
                    const d = p.pos.distanceTo(center);
                    let from = 0;
                    tl.tween(start + d * stagger, dur, k => { if (!p.free) p.stand = lerp(from, to, k); }, to > 0.5 ? E.outBack : E.inOut, () => { from = p.stand; });
                }
            },
            /** Режим фокуса: всё, кроме участников, гаснет. */
            dimOthers(start, dur, to, keep = []) {
                for (const p of pcs.values()) if (!keep.includes(p)) C.prop(p, start, dur, 'dim', to);
                C.value01(start, dur, 'boardGlow', to > 0.5 ? 0.35 : 1);
            },
            move(p, start, dur, to, { arc = 0, ease = E.inOut } = {}) {
                let from = null, id = 0;
                const dest = to.clone();
                tl.tween(start, dur, k => {
                    if (p.posOwner !== id) return;
                    p.pos.copy(from).lerp(dest, k); p.pos.y = lerp(from.y, dest.y, k) + arc * 4 * k * (1 - k);
                }, ease, () => { from = p.pos.clone(); id = ++st.moveSeq; p.posOwner = id; });
            },
            /** Подъём и удар: плавный подъём, медленное парение, резкий удар вниз. */
            hover(p, start, dur, to, { lift = 0.9, scale = 2.0, share = 0.3 } = {}) {
                let from = null, id = 0;
                const dest = to.clone();
                const L = 0.3, S = 0.84;
                const ramp = k => (k < L ? 0.04 * E.sine(k / L) : k < S ? 0.04 + share * E.sine((k - L) / (S - L)) : 0.04 + share + (0.96 - share) * E.in((k - S) / (1 - S)));
                const height = k => (k < L ? E.sine(k / L) : k < S ? 1 + 0.06 * Math.sin((k - L) / (S - L) * Math.PI) : 1 - E.in((k - S) / (1 - S)));
                tl.tween(start, dur, k => {
                    if (p.posOwner !== id) return;
                    p.pos.copy(from).lerp(dest, Math.min(1, ramp(k)));
                    p.pos.y = lift * height(k);
                    p.scale = 1 + (scale - 1) * clamp(height(k));
                }, E.linear, () => { from = p.pos.clone(); id = ++st.moveSeq; p.posOwner = id; });
            },
            prop(p, start, dur, name, to, ease = E.inOut) { let from = 0; tl.tween(start, dur, k => { p[name] = lerp(from, to, k); }, ease, () => { from = p[name]; }); },
            /** Свечение клетки: заливка + ореол (+ точки / рамка). */
            fill(sq, color, from, to, { alpha = 0.9, halo = 0.55, pulse = 0, dots = false, frame = false, fadeIn = 0.12, fadeOut = 0.35 } = {}) {
                if (!sq) return;
                const i = sqIndex(sq);
                st.tileFx.push((t, put) => {
                    if (t < from || t > to) return;
                    let a = Math.min(1, (t - from) / fadeIn, (to - t) / fadeOut);
                    if (pulse) a *= 0.72 + 0.28 * Math.sin((t - from) * pulse);
                    put('fill', i, a * alpha, color);
                    if (halo) put('halo', i, a * halo, color);
                    if (dots) put('dots', i, a, color);
                    if (frame) put('frame', i, a, color);
                });
            },
            /** LED-матрица: клетки вспыхивают точками вразнобой и гаснут снаружи внутрь. */
            led(start, squares, color, { dur = 1.0, center = null, fill = 0.25, radius = 99 } = {}) {
                const [cx, cy] = center ? world.xy(center) : [3.5, 3.5];
                const list = (squares === 'all' ? Array.from({ length: 64 }, (_, i) => i) : squares.map(sqIndex)).filter(i => Math.hypot((i % 8) - cx, Math.floor(i / 8) - cy) <= radius);
                const on = list.map(i => ({ i, d: Math.hypot((i % 8) - cx, Math.floor(i / 8) - cy), r: Math.random() }));
                st.tileFx.push((t, put) => {
                    const e = t - start;
                    if (e < 0 || e > dur + 0.6) return;
                    for (const o of on) {
                        if (e < o.r * 0.18) continue;
                        const outT = dur - o.d * 0.07;
                        const a = e > outT ? 1 - (e - outT) / 0.35 : 1;
                        if (a <= 0) continue;
                        put('dots', o.i, a, color);
                        if (fill) put('fill', o.i, a * fill, color);
                    }
                });
            },
            /** Волна по клеткам от центра. */
            wave(start, center, color, { speed = 7, width = 1.4, alpha = 0.85, dots = true, dur = 1.3 } = {}) {
                const [cx, cy] = world.xy(center);
                st.tileFx.push((t, put) => {
                    const e = t - start;
                    if (e < 0 || e > dur) return;
                    const front = e * speed, fade = 1 - e / dur;
                    for (let i = 0; i < 64; i++) {
                        const d = Math.hypot((i % 8) - cx, Math.floor(i / 8) - cy);
                        const w = 1 - Math.abs(d - front) / width;
                        if (w > 0) { put(dots ? 'dots' : 'fill', i, w * alpha * fade, color); if (dots) put('fill', i, w * alpha * fade * 0.3, color); }
                    }
                });
            },
            /** Заливка всей доски цветом (омывание). */
            wash(start, color, { dur = 0.9, alpha = 0.4 } = {}) {
                st.tileFx.push((t, put) => {
                    const e = t - start;
                    if (e < 0 || e > dur) return;
                    const a = alpha * (e < 0.06 ? e / 0.06 : 1 - (e - 0.06) / (dur - 0.06));
                    for (let i = 0; i < 64; i++) put('fill', i, a, color);
                });
            },
            ripple(start, at, amp = 0.2, dur = 1.2) { tl.at(start, () => world.ripple.push({ t0: start, cx: at.x, cz: at.z, amp, dur })); },
            label(html, cls, at, from, to, worldSize = 0) {
                const el = document.createElement('div');
                el.className = `ca-label ${cls}`;
                el.innerHTML = `<div class="ca-label-in">${html}</div>`;
                el.style.display = 'none';
                dom.labels.appendChild(el);
                st.labels.push({ el, at, from, to, world: worldSize });
                return el;
            },
            /** Бейдж-кружок на углу клетки, с расходящимися кольцами. */
            badge(sq, glyph, color, from, to) {
                const at = () => P(sq).add(new THREE.Vector3(0.62, 0.05, -0.55));
                const el = C.label(`<i style="--c:${color}">${GLYPHS[glyph] || esc(glyph)}</i>`, 'ca-badge', at, from, to, 0.5);
                C.snd('fx-pop', from, 0.3);
                return el;
            },
            /** Значение «−9»/«+9» над клеткой, крупно. */
            amount(text, kind, at, from, to) { return C.label(esc(text), `ca-val ${kind}`, at, from, to); },
            /** Крупная подпись по центру экрана. */
            caption(text, color, from, to, { sub = '', pos = 'mid', size = 1, sound = true } = {}) {
                const el = document.createElement('div');
                el.className = `ca-cap ca-cap-${pos}`;
                el.style.setProperty('--c', color);
                el.style.setProperty('--s', size * Math.min(1, 9 / Math.max(1, String(text).length)));
                const num = /^[+−-]\d/.test(String(sub));
                el.innerHTML = `<b>${esc(text)}</b>${sub ? `<small class="${num ? 'num ' + (String(sub)[0] === '+' ? 'pos' : 'neg') : ''}">${esc(sub)}</small>` : ''}`;
                el.style.display = 'none';
                dom.caption.appendChild(el);
                st.labels.push({ el, from, to, screen: true });
                if (sound) C.snd('fx-shine', from, 0.32);
            },
            glow(at, color, size, { from = 0, to = 99, peak = 1, pulse = 0, fadeIn = 0.15, fadeOut = 0.3, map = radialTex, rot = 0, spin = 0 } = {}) {
                const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: new THREE.Color(color).multiplyScalar(map === radialTex ? 1.3 : 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: map === radialTex, fog: false, opacity: 0 }));
                sp.renderOrder = 6;
                fx.add(sp);
                const obj = { sp, size, peak };
                st.updaters.push(() => {
                    const t = st.t;
                    let a = 0;
                    if (t >= from && t <= to) a = Math.min(1, (t - from) / fadeIn, (to - t) / fadeOut);
                    a *= obj.peak * (pulse ? 0.75 + 0.25 * Math.sin(t * pulse) : 1);
                    sp.material.opacity = clamp(a);
                    sp.material.rotation = rot + spin * t;
                    sp.visible = a > 0.003;
                    sp.position.copy(typeof at === 'function' ? at() : at);
                    sp.scale.setScalar(typeof obj.size === 'function' ? obj.size(t) : obj.size);
                });
                return obj;
            },
            flare(at, color, size, opts = {}) { return C.glow(at, color, size, { ...opts, map: opts.points === 8 ? flare8 : flare4 }); },
            ring(start, at, color, { size = 2.4, dur = 0.7, width = 0.08, y = 0.03, from = 0.2, contract = false } = {}) {
                const m = new THREE.Mesh(new THREE.RingGeometry(1 - width, 1, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide, opacity: 0 }));
                m.rotation.x = -Math.PI / 2;
                m.renderOrder = 6;
                m.visible = false;
                fx.add(m);
                tl.tween(start, dur, k => {
                    m.visible = k < 1;
                    m.position.copy(typeof at === 'function' ? at() : at).setY((typeof at === 'function' ? at() : at).y + y);
                    m.scale.setScalar(contract ? lerp(size, from, E.in(k)) : from + size * E.outExpo(k));
                    m.material.opacity = contract ? Math.min(1, k * 4) * (k > 0.85 ? (1 - k) / 0.15 : 1) : (1 - k) * 0.95;
                }, E.linear);
            },
            /** Рамка-прицел: квадрат, повёрнутый и медленно крутящийся. */
            reticle(sq, color, from, to, { size = 1.35, rot = 0.45, spin = 0.6 } = {}) {
                const mat = new THREE.MeshBasicMaterial({ map: frameTex, color: new THREE.Color(color).multiplyScalar(2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 });
                const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
                m.rotation.x = -Math.PI / 2;
                m.renderOrder = 7;
                fx.add(m);
                const dot = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), mat);
                dot.rotation.x = -Math.PI / 2;
                fx.add(dot);
                st.updaters.push(() => {
                    const t = st.t;
                    const live = t >= from && t <= to;
                    m.visible = dot.visible = live;
                    if (!live) return;
                    const k = clamp((t - from) / 0.3);
                    const at = P(sq);
                    m.position.copy(at).setY(0.03 + world.rippleAt(at.x, at.z));
                    dot.position.copy(m.position);
                    m.rotation.z = rot + t * spin;
                    m.scale.setScalar(size * lerp(1.7, 1, E.outBack(k)));
                    mat.opacity = Math.min(k, clamp((to - t) / 0.25));
                });
            },
            sparks(at, count, { color = st.accent || '#ffffff', speed = 4, up = 2, dirv = null, size = 0.07, life = 0.8, gravity = 6, spread = 1 } = {}) {
                count = Math.round(count * n);
                for (let i = 0; i < count; i++) {
                    const v = new THREE.Vector3(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0.3, 1) * speed * spread);
                    if (dirv) v.addScaledVector(dirv, speed * rand(0.2, 1));
                    v.y += up * rand(0.2, 1);
                    const c = new THREE.Color(pick(Array.isArray(color) ? color : [color])).multiplyScalar(2);
                    sparks.emit({ pos: at.clone(), vel: v, color: c, size: size * rand(0.5, 1.4), size1: 0, life: life * rand(0.5, 1.2), gravity, drag: 1.4, alpha: 1 });
                }
            },
            /** Поток искр/угольков, пока идёт интервал. */
            embers(at, from, to, { rate = 30, color = '#ff6a3d', radius = 1.2, up = 0.8, size = 0.05, life = 1.8 } = {}) {
                tl.tween(from, to - from, () => {
                    const k = rate * (1 / 60) * n;
                    for (let i = 0; i < k + (Math.random() < k % 1 ? 1 : 0); i++) {
                        const c0 = typeof at === 'function' ? at() : at;
                        const a = Math.random() * Math.PI * 2, r = Math.random() * radius;
                        sparks.emit({ pos: new THREE.Vector3(c0.x + Math.cos(a) * r, c0.y + rand(0, 0.3), c0.z + Math.sin(a) * r), vel: [rand(-0.15, 0.15), up * rand(0.5, 1.4), rand(-0.15, 0.15)], color: new THREE.Color(pick(Array.isArray(color) ? color : [color])).multiplyScalar(2), size: size * rand(0.6, 1.5), size1: 0, life: life * rand(0.6, 1.2), gravity: -0.2, drag: 0.4 });
                    }
                }, E.linear);
            },
            smoke(at, count, { color = '#6f6a7a', speed = 0.9, size = 0.9, life = 1.8, ring = false, alpha = [0.18, 0.4] } = {}) {
                count = Math.round(count * n);
                for (let i = 0; i < count; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const v = ring ? new THREE.Vector3(Math.cos(a), rand(0.05, 0.25), Math.sin(a)).multiplyScalar(speed * rand(0.7, 1.2))
                        : new THREE.Vector3(rand(-1, 1), rand(0.2, 1), rand(-1, 1)).multiplyScalar(speed * rand(0.3, 1));
                    smoke.emit({ pos: at.clone().add(new THREE.Vector3(rand(-0.15, 0.15), rand(0, 0.2), rand(-0.15, 0.15))), vel: v, color: new THREE.Color(color), size: size * rand(0.5, 0.9), size1: size * rand(1.4, 2.4), life: life * rand(0.7, 1.2), drag: 1.6, alpha: rand(alpha[0], alpha[1]) });
                }
            },
            /** Фигура разлетается на осколки её же цвета. */
            shatter(p, start, { power = 4, dirv = null, count = 40 } = {}) {
                tl.at(start, () => {
                    p.root.updateMatrixWorld(true);
                    const box = p.mesh.geometry.boundingBox;
                    const center = p.point(0, 0.5);
                    const shards = [];
                    const total = Math.round(count * (lite ? 0.6 : 1));
                    for (let i = 0; i < total; i++) {
                        const local = new THREE.Vector3(rand(box.min.x, box.max.x) * 0.8, rand(box.min.y, box.max.y), rand(box.min.z, box.max.z));
                        const pos = p.mesh.localToWorld(local);
                        const g = new THREE.TetrahedronGeometry(rand(0.035, 0.1) * (p.h / 0.8));
                        g.scale(1, rand(0.4, 1), rand(0.25, 0.6));
                        const m = new THREE.Mesh(g, i % 3 ? p.mats[0] : p.mats[1]);
                        m.userData.sharedMat = true;
                        m.castShadow = !lite;
                        m.position.copy(pos);
                        m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
                        const v = pos.clone().sub(center).setY(0).normalize().multiplyScalar(power * rand(0.3, 1));
                        if (dirv) v.addScaledVector(dirv, power * rand(0.3, 0.9));
                        v.y += power * rand(0.25, 0.9);
                        shards.push({ m, v, s: new THREE.Vector3(rand(-14, 14), rand(-14, 14), rand(-14, 14)) });
                        fx.add(m);
                    }
                    p.root.visible = false;
                    st.updaters.push(dt => {
                        for (const s of shards) {
                            s.v.y -= 11 * dt;
                            s.m.position.addScaledVector(s.v, dt);
                            s.m.rotation.x += s.s.x * dt; s.m.rotation.y += s.s.y * dt; s.m.rotation.z += s.s.z * dt;
                            const onBoard = Math.abs(s.m.position.x) < 4.3 && Math.abs(s.m.position.z) < 4.3 && world.boardSolid;
                            const fl = (onBoard ? 0 : FLOOR_Y) + 0.02;
                            if (s.m.position.y < fl) { s.m.position.y = fl; s.v.y *= -0.3; s.v.x *= 0.55; s.v.z *= 0.55; s.s.multiplyScalar(0.5); }
                            if (st.shrink != null) s.m.scale.setScalar(Math.max(0.001, 1 - st.shrink));
                        }
                    });
                });
            },
            /** Доска раскалывается на стеклянные куски, они летят к камере. */
            boardShatter(start, center, { power = 3.5, restore = null } = {}) {
                const shards = [];
                const cracks = new THREE.Group();
                fx.add(cracks);
                tl.at(start - 0.45, () => {
                    // светящиеся трещины перед разломом
                    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
                    for (let i = 0; i < 9; i++) {
                        let p = center.clone().setY(0.02);
                        const a0 = rand(0, Math.PI * 2);
                        for (let j = 0; j < 7; j++) {
                            const a = a0 + rand(-0.6, 0.6), L = rand(0.3, 0.8);
                            const q = p.clone().add(new THREE.Vector3(Math.cos(a) * L, 0, Math.sin(a) * L));
                            const seg = new THREE.Mesh(new THREE.PlaneGeometry(0.035, L), mat);
                            seg.rotation.x = -Math.PI / 2;
                            seg.rotation.z = -Math.atan2(q.z - p.z, q.x - p.x) + Math.PI / 2;
                            seg.position.copy(p).lerp(q, 0.5);
                            cracks.add(seg);
                            p = q;
                        }
                    }
                });
                tl.tween(start - 0.45, 0.45, k => { cracks.children.forEach((c, i) => { c.visible = Math.random() < 0.4 + k * 0.6 && i / cracks.children.length < k * 1.5; }); }, E.linear);
                tl.at(start, () => {
                    cracks.visible = false;
                    world.boardSolid = false;
                    slab.visible = top.visible = false;
                    const total = 8 + 2 * st.spec.margin, half = total / 2;
                    const map = boardU.map2.value;
                    const cells = lite ? 5 : 6;
                    const pts = [];
                    for (let y = 0; y <= cells; y++) for (let x = 0; x <= cells; x++) {
                        const edge = x === 0 || y === 0 || x === cells || y === cells;
                        pts.push(new THREE.Vector2(-half + total * x / cells + (edge ? 0 : rand(-0.35, 0.35)), -half + total * y / cells + (edge ? 0 : rand(-0.35, 0.35))));
                    }
                    const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.15, metalness: 0.4, emissive: new THREE.Color('#7ff6ff'), emissiveIntensity: 0.3, emissiveMap: map, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
                    const edgeMat = new THREE.LineBasicMaterial({ color: new THREE.Color('#7ff6ff').multiplyScalar(3), transparent: true, opacity: 0.95, fog: false });
                    for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
                        const a = pts[y * (cells + 1) + x], b = pts[y * (cells + 1) + x + 1], c = pts[(y + 1) * (cells + 1) + x + 1], d = pts[(y + 1) * (cells + 1) + x];
                        for (const tri of (Math.random() < 0.5 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]])) {
                            const cx = (tri[0].x + tri[1].x + tri[2].x) / 3, cz = (tri[0].y + tri[1].y + tri[2].y) / 3;
                            const shape = new THREE.Shape(tri.map(p => new THREE.Vector2(p.x - cx, -(p.y - cz))));
                            const g = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
                            g.rotateX(-Math.PI / 2);
                            g.translate(0, -0.12, 0);
                            const uv = g.attributes.uv, ps = g.attributes.position;
                            for (let i = 0; i < ps.count; i++) uv.setXY(i, (ps.getX(i) + cx + half) / total, 1 - (ps.getZ(i) + cz + half) / total);
                            const m = new THREE.Mesh(g, mat);
                            m.userData.sharedMat = true;
                            const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), edgeMat);
                            e.userData.sharedMat = true;
                            m.add(e);
                            m.position.set(cx, 0, cz);
                            fx.add(m);
                            const off = new THREE.Vector3(cx - center.x, 0, cz - center.z);
                            const d0 = off.length();
                            const v = off.normalize().multiplyScalar(power * rand(0.4, 1) / (0.6 + d0 * 0.25));
                            v.add(camera.position.clone().sub(m.position).setY(0).normalize().multiplyScalar(-power * rand(0.1, 0.4) / (0.8 + d0 * 0.3)));
                            v.y += power * rand(0.3, 0.9) / (0.7 + d0 * 0.2);
                            shards.push({ m, v, s: new THREE.Vector3(rand(-3, 3), rand(-3, 3), rand(-3, 3)) });
                        }
                    }
                    st.updaters.push(dt => {
                        for (const s of shards) {
                            s.v.y -= 2.2 * dt;
                            s.m.position.addScaledVector(s.v, dt);
                            s.m.rotation.x += s.s.x * dt; s.m.rotation.y += s.s.y * dt; s.m.rotation.z += s.s.z * dt;
                        }
                    });
                });
                if (restore != null) tl.at(restore, () => {
                    for (const s of shards) s.m.visible = false;
                    world.boardSolid = true;
                    slab.visible = top.visible = true;
                });
            },
            beam(a, b, color, { from, to, width = 0.06, grow = 0.1 } = {}) {
                const geo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
                geo.translate(0, 0.5, 0);
                const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 }));
                const outer = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 }));
                core.renderOrder = outer.renderOrder = 7;
                fx.add(core, outer);
                st.updaters.push(() => {
                    const t = st.t;
                    const live = t >= from && t <= to;
                    core.visible = outer.visible = live;
                    if (!live) return;
                    const A2 = typeof a === 'function' ? a() : a, B2 = typeof b === 'function' ? b() : b;
                    const d = B2.clone().sub(A2);
                    const len = d.length() * clamp((t - from) / grow);
                    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
                    const fade = clamp((to - t) / 0.25);
                    const born = 1 + 0.8 * Math.max(0, 1 - (t - from) / 0.2);
                    const flick = 0.85 + 0.15 * Math.sin(t * 90);
                    for (const [m, w, o] of [[core, width * 0.35, 1], [outer, width * flick * born, 0.55]]) {
                        m.position.copy(A2); m.quaternion.copy(q); m.scale.set(w * fade, Math.max(0.001, len), w * fade);
                        m.material.opacity = o * fade;
                    }
                });
            },
            /** Луч-«лазер» по клеткам: полоса во всю клетку с белыми кромками. */
            laser(fromSq, toSq, color, from, to, { width = 0.92, full = false } = {}) {
                const a = P(fromSq), b = P(toSq);
                const len = a.distanceTo(b) + (full ? 0.9 : 0);
                const tex = canvasTexture(64, (g, s) => {
                    const gr = g.createLinearGradient(0, 0, s, 0);
                    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.08, 'rgba(255,255,255,.35)'); gr.addColorStop(0.5, 'rgba(255,255,255,.22)');
                    gr.addColorStop(0.92, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
                    g.fillStyle = gr; g.fillRect(0, 0, s, s);
                });
                const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(color).multiplyScalar(2.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 });
                const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
                m.rotation.x = -Math.PI / 2;
                m.rotation.z = -Math.atan2(b.z - a.z, b.x - a.x) + Math.PI / 2;
                m.position.copy(a).lerp(b, 0.5).setY(0.02);
                m.renderOrder = 7;
                fx.add(m);
                st.updaters.push(() => {
                    const t = st.t;
                    m.visible = t >= from && t <= to;
                    if (!m.visible) return;
                    const e = t - from;
                    const born = 1 + 0.75 * Math.max(0, 1 - e / 0.2);
                    m.scale.set(width * born * (0.92 + 0.08 * Math.sin(t * 70)), len * Math.min(1, e / 0.12), 1);
                    mat.opacity = Math.min(1, e / 0.05, (to - t) / 0.35);
                });
            },
            lightning(a, b, color, { from, to, width = 0.03, branches = 2 } = {}) {
                const group = new THREE.Group();
                fx.add(group);
                const mats = [new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
                    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.5 })];
                let built = -1;
                const bolt = (p, q, w, disp, gens) => {
                    let pts = [p.clone(), q.clone()];
                    for (let g = 0; g < gens; g++) {
                        const next = [pts[0]];
                        for (let i = 0; i < pts.length - 1; i++) {
                            const m = pts[i].clone().lerp(pts[i + 1], 0.5).add(new THREE.Vector3(rand(-1, 1), rand(-0.3, 0.3), rand(-1, 1)).multiplyScalar(disp));
                            next.push(m, pts[i + 1]);
                        }
                        pts = next;
                        disp *= 0.55;
                    }
                    const path = new THREE.CurvePath();
                    for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
                    group.add(new THREE.Mesh(new THREE.TubeGeometry(path, pts.length * 2, w, 5, false), mats[0]));
                    group.add(new THREE.Mesh(new THREE.TubeGeometry(path, pts.length, w * 3.2, 6, false), mats[1]));
                    return pts;
                };
                st.updaters.push(() => {
                    const t = st.t;
                    const live = t >= from && t <= to;
                    group.visible = live;
                    if (!live) return;
                    const slot = Math.floor(t / 0.05);
                    if (slot !== built) {
                        built = slot;
                        while (group.children.length) { const c = group.children.pop(); c.geometry.dispose(); }
                        const A2 = typeof a === 'function' ? a() : a, B2 = typeof b === 'function' ? b() : b;
                        const len = A2.distanceTo(B2);
                        const pts = bolt(A2, B2, width, len * 0.18, 6);
                        for (let i = 0; i < branches; i++) {
                            const s = pts[Math.floor(rand(0.2, 0.7) * pts.length)];
                            bolt(s, s.clone().add(new THREE.Vector3(rand(-1, 1), rand(-1.2, -0.3), rand(-1, 1)).multiplyScalar(len * 0.22)), width * 0.6, len * 0.06, 4);
                        }
                    }
                    const fade = clamp((to - t) / 0.15);
                    mats[0].opacity = fade * (Math.random() < 0.85 ? 1 : 0.3);
                    mats[1].opacity = 0.5 * fade;
                });
            },
            /** Аура вокруг фигуры: языки пламени-искр и короткие разряды. */
            aura(p, color, from, to, { arcs = true, rate = 70, color2 = null } = {}) {
                tl.tween(from, to - from, k => {
                    const c = color2 ? new THREE.Color(color).lerp(new THREE.Color(color2), clamp(k * 1.6)) : new THREE.Color(color);
                    const cnt = rate / 60 * n;
                    for (let i = 0; i < cnt; i++) {
                        const at = p.point(rand(-1.1, 1.1), rand(0, 1.05)).add(new THREE.Vector3(rand(-0.08, 0.08), 0, rand(-0.08, 0.08)));
                        sparks.emit({ pos: at, vel: [rand(-0.25, 0.25), rand(0.6, 1.6), rand(-0.25, 0.25)], color: c.clone().multiplyScalar(2.2), size: rand(0.05, 0.13), size1: 0, life: rand(0.35, 0.8), gravity: -0.6, drag: 1 });
                    }
                }, E.linear);
                if (arcs) for (let i = 0; i < 3; i++) C.lightning(() => p.point(rand(-1, 1), rand(0.1, 0.9)), () => p.point(rand(-1, 1), rand(0.2, 1.1)).add(new THREE.Vector3(rand(-0.25, 0.25), rand(0, 0.35), rand(-0.25, 0.25))), color2 || color, { from: from + i * 0.2, to, width: 0.008, branches: 1 });
                C.glow(() => p.point(0, 0.5), color, p.h * 2.6, { from, to, peak: 0.55, pulse: 11 });
            },
            /** Комета: голова-звезда и хвост, переливающийся радугой. */
            comet(pos, from, to, { size = 0.5, hue = true, color = '#ffffff', rate = 90 } = {}) {
                C.flare(pos, color, () => size * 3.2, { from, to, rot: -0.26, fadeIn: 0.1 });
                C.glow(pos, color, () => size * 2.2, { from, to, fadeIn: 0.1 });
                let last = null;
                tl.tween(from, to - from, k => {
                    const p0 = typeof pos === 'function' ? pos() : pos;
                    const c = hue ? new THREE.Color().setHSL((st.t * 1.6) % 1, 1, 0.6) : new THREE.Color(color);
                    const cnt = rate / 60 * n;
                    for (let i = 0; i < cnt; i++) {
                        const back = last ? last.clone().sub(p0) : new THREE.Vector3(0.3, 0.5, 0);
                        if (back.lengthSq() < 1e-6) back.set(0.3, 0.5, 0);
                        back.normalize().add(new THREE.Vector3(rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-0.3, 0.3)));
                        sparks.emit({ pos: p0.clone(), vel: back.multiplyScalar(rand(0.6, 1.6) * size * 3), color: c.clone().multiplyScalar(2.4), size: size * rand(0.15, 0.35), size1: 0, life: rand(0.25, 0.6), drag: 2 });
                    }
                    last = p0.clone();
                }, E.linear);
            },
            /** Магический круг на клетке. */
            circle(at, color, from, to, { size = 3.2, spin = 0.5, y = 0.04 } = {}) {
                const mat = new THREE.MeshBasicMaterial({ map: circleTex, color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 });
                const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
                m.rotation.x = -Math.PI / 2;
                m.renderOrder = 5;
                fx.add(m);
                const obj = { mat, m, size, colorFn: null };
                st.updaters.push(() => {
                    const t = st.t;
                    m.visible = t >= from && t <= to;
                    if (!m.visible) return;
                    m.position.copy(typeof at === 'function' ? at() : at).setY(y);
                    const k = clamp((t - from) / 0.4);
                    m.scale.setScalar((typeof obj.size === 'function' ? obj.size(t) : obj.size) * lerp(0.6, 1, E.outBack(k)));
                    m.rotation.z = -t * spin;
                    mat.opacity = Math.min(k, clamp((to - t) / 0.3));
                });
                return obj;
            },
            /** Стрелки ходов фигуры над клеткой. */
            arrows(at, kind, color, from, to, { size = 3.4 } = {}) {
                const mat = new THREE.MeshBasicMaterial({ map: arrowsFor(kind), color: new THREE.Color(color).multiplyScalar(2.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 });
                const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
                m.rotation.x = -Math.PI / 2;
                m.renderOrder = 6;
                fx.add(m);
                st.updaters.push(() => {
                    const t = st.t;
                    m.visible = t >= from && t <= to;
                    if (!m.visible) return;
                    m.position.copy(typeof at === 'function' ? at() : at).setY(0.06);
                    const k = clamp((t - from) / 0.08);
                    m.scale.setScalar(lerp(0.7, 1, E.out(k)));
                    mat.opacity = k;
                });
            },
            /** Плитки-осколки клетчатой доски, кружащие вокруг точки. */
            orbiters(center, count, from, to, { radius = 2.2, color = '#ffffff' } = {}) {
                const mat = new THREE.MeshStandardMaterial({ map: boardU.map2.value, roughness: 0.3, metalness: 0.3, emissive: new THREE.Color(color), emissiveIntensity: 0.35, transparent: true, opacity: 0 });
                const list = [];
                for (let i = 0; i < Math.round(count * n); i++) {
                    const g = new THREE.BoxGeometry(rand(0.3, 0.7), 0.08, rand(0.3, 0.7));
                    const m = new THREE.Mesh(g, mat);
                    m.userData.sharedMat = i > 0;
                    fx.add(m);
                    list.push({ m, a: rand(0, Math.PI * 2), r: radius * rand(0.7, 1.3), y: rand(0.3, 2.2), w: rand(0.4, 0.9) * pick([-1, 1]), s: new THREE.Vector3(rand(-2, 2), rand(-2, 2), rand(-2, 2)) });
                }
                st.updaters.push(dt => {
                    const t = st.t;
                    const live = t >= from && t <= to;
                    mat.opacity = live ? Math.min(1, (t - from) / 0.3, (to - t) / 0.3) : 0;
                    const c = typeof center === 'function' ? center() : center;
                    for (const o of list) {
                        o.m.visible = live;
                        if (!live) continue;
                        o.a += o.w * dt;
                        o.m.position.set(c.x + Math.cos(o.a) * o.r, c.y + o.y, c.z + Math.sin(o.a) * o.r);
                        o.m.rotation.x += o.s.x * dt; o.m.rotation.y += o.s.y * dt; o.m.rotation.z += o.s.z * dt;
                    }
                });
                return mat;
            },
            moon(dirFn, from, to, { size = 14, dist = 60 } = {}) {
                st.updaters.push(() => {
                    const t = st.t;
                    const a = t >= from && t <= to ? Math.min(1, (t - from) / 0.6, (to - t) / 0.4) : 0;
                    moon.material.opacity = a * st.mood;
                    if (a > 0) { const d = dirFn(); moon.position.copy(camera.position).addScaledVector(d, dist); moon.scale.setScalar(size); }
                });
            },
            /** Цветок: лепестки раскрываются, светится сердцевина. */
            flower(at, from, to, { size = 0.6, color = '#c2185b', open = 1.6 } = {}) {
                const group = new THREE.Group();
                const petal = new THREE.Shape();
                petal.moveTo(0, 0); petal.bezierCurveTo(0.32, 0.18, 0.3, 0.78, 0, 1); petal.bezierCurveTo(-0.3, 0.78, -0.32, 0.18, 0, 0);
                const pg = new THREE.ExtrudeGeometry(petal, { depth: 0.015, bevelEnabled: false, curveSegments: 10 });
                const mats = [new THREE.MeshStandardMaterial({ color, roughness: 0.55, emissive: new THREE.Color(color), emissiveIntensity: 0.25, side: THREE.DoubleSide }),
                    new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.6), roughness: 0.6, side: THREE.DoubleSide })];
                const petals = [];
                for (let ring = 0; ring < 2; ring++) {
                    const count = ring ? 7 : 9;
                    for (let i = 0; i < count; i++) {
                        const holder = new THREE.Group();
                        holder.rotation.y = (i / count) * Math.PI * 2 + ring * 0.35;
                        const m = new THREE.Mesh(pg, mats);
                        m.userData.shared = true;
                        m.scale.setScalar(ring ? 0.7 : 1);
                        holder.add(m);
                        group.add(holder);
                        petals.push({ m, ring });
                    }
                }
                const core = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshStandardMaterial({ color: '#f5e050', emissive: new THREE.Color('#f0e040'), emissiveIntensity: 1.6, roughness: 0.6 }));
                core.position.y = 0.05;
                group.add(core);
                fx.add(group);
                st.updaters.push(() => {
                    const t = st.t;
                    group.visible = t >= from && t <= to;
                    if (!group.visible) return;
                    const k = E.out(clamp((t - from) / open));
                    group.position.copy(typeof at === 'function' ? at() : at);
                    group.scale.setScalar(size * lerp(0.2, 1, E.outBack(clamp((t - from) / 0.6))));
                    group.rotation.y = t * 0.15;
                    for (const pt of petals) pt.m.rotation.x = -lerp(0.15, pt.ring ? 0.95 : 1.25, k);
                });
                C.glow(() => (typeof at === 'function' ? at() : at).clone().setY(0.1), '#ffd2f0', size * 2.2, { from: from + 0.3, to, peak: 0.35 });
                tl.tween(from + 0.5, to - from - 0.5, () => {
                    if (Math.random() < 0.25) {
                        const c0 = typeof at === 'function' ? at() : at;
                        sparks.emit({ pos: c0.clone().add(new THREE.Vector3(rand(-0.4, 0.4), rand(0.1, 0.5), rand(-0.4, 0.4))), vel: [rand(-0.2, 0.2), rand(-0.05, 0.25), rand(-0.2, 0.2)], color: new THREE.Color(color).multiplyScalar(1.6), size: rand(0.05, 0.1), size1: 0.02, life: rand(1.2, 2.2), gravity: 0.05, drag: 0.3 });
                    }
                }, E.linear);
            },
            snd(name, t, g = 1, rate = 1) { st.sfx.sample?.(name, t, g, rate); },
            /** Клетки на пути фигуры (без начальной). */
            path(from, to) {
                const f0 = from.charCodeAt(0), r0 = Number(from[1]), f1 = to.charCodeAt(0), r1 = Number(to[1]);
                const df = Math.sign(f1 - f0), dr = Math.sign(r1 - r0);
                const sq = (f, r) => String.fromCharCode(f) + r;
                const out = [];
                if (Math.abs(f1 - f0) * Math.abs(r1 - r0) === 2) {
                    if (Math.abs(f1 - f0) === 2) out.push(sq(f0 + df, r0), sq(f0 + 2 * df, r0)); else out.push(sq(f0, r0 + dr), sq(f0, r0 + 2 * dr));
                    out.push(to);
                    return out;
                }
                let f = f0, r = r0;
                for (let i = 0; i < 8 && (f !== f1 || r !== r1); i++) { f += df; r += dr; out.push(sq(f, r)); }
                return out;
            },
            /** Соседние клетки (для «некуда бежать»). */
            around(sq) {
                const out = [];
                const f0 = sq.charCodeAt(0), r0 = Number(sq[1]);
                for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
                    if (!df && !dr) continue;
                    const f = f0 + df, r = r0 + dr;
                    if (f >= 97 && f <= 104 && r >= 1 && r <= 8) out.push(String.fromCharCode(f) + r);
                }
                return out;
            },
            pieceName(code) { return tx.pieces?.[(code || '')[1]] || ''; },
            /** Камера «из-за плеча» фигуры from, смотрит на toward; пути к обеим свободны. */
            clearOS(from, toward, dist, y) {
                const base = yawOf(toward, from);
                let best = null, bestScore = -Infinity;
                for (const off of [0, 0.2, -0.2, 0.4, -0.4, 0.6, -0.6, 0.8, -0.8, 1.0, -1.0]) {
                    const yaw = base + off;
                    const pos = new THREE.Vector3(from.x + Math.sin(yaw) * dist, y, from.z + Math.cos(yaw) * dist);
                    let score = -Math.abs(off) * 0.3;
                    for (const tgt of [from, toward]) {
                        const vx = tgt.x - pos.x, vz = tgt.z - pos.z, vv = vx * vx + vz * vz || 1;
                        for (const pc of pcs.values()) {
                            if (!pc.root.visible || pc.pos.distanceTo(from) < 0.3 || pc.pos.distanceTo(toward) < 0.3) continue;
                            const t = clamp(((pc.pos.x - pos.x) * vx + (pc.pos.z - pos.z) * vz) / vv);
                            const d = Math.hypot(pos.x + vx * t - pc.pos.x, pos.z + vz * t - pc.pos.z);
                            if (d < 0.6 && t < 0.97) score -= (0.6 - d) * 4 * (1.3 - t);
                        }
                    }
                    if (score > bestScore) { bestScore = score; best = pos; }
                }
                return best;
            },
            /** Точка для камеры у земли, откуда между ней и целью нет других фигур. */
            clearPos(center, dist, y, preferYaw = null) {
                let best = null, bestScore = -Infinity;
                for (let i = 0; i < 24; i++) {
                    const yaw = i / 24 * Math.PI * 2;
                    const pos = new THREE.Vector3(center.x + Math.sin(yaw) * dist, y, center.z + Math.cos(yaw) * dist);
                    let score = 0;
                    const vx = center.x - pos.x, vz = center.z - pos.z, vv = vx * vx + vz * vz;
                    for (const p of pcs.values()) {
                        if (!p.root.visible || p.pos.distanceTo(center) < 0.3) continue;
                        const t = clamp(((p.pos.x - pos.x) * vx + (p.pos.z - pos.z) * vz) / vv);
                        const d = Math.hypot(pos.x + vx * t - p.pos.x, pos.z + vz * t - p.pos.z);
                        if (d < 0.6 && t < 0.93) score -= (0.6 - d) * 4 * (1.3 - t);
                    }
                    if (Math.abs(pos.x) > 6 || Math.abs(pos.z) > 6) score -= 0.5;
                    if (preferYaw != null) score -= Math.abs(lerpAngle(0, yaw - preferYaw, 1)) * 0.12;
                    if (score > bestScore) { bestScore = score; best = pos; }
                }
                return best;
            },
        };
        return C;
    }

    /** Общее начало и конец: уход в сцену и возврат к доске страницы. */
    function common(C, D) {
        const { st } = C;
        C.mood(0, 0.55, 1, E.out);
        C.tl.at(1.2, () => { dom.skip.style.opacity = st.spec.texts?.skip ? '1' : '0'; });
        const out = D - 0.8;
        C.cam(out, 0.72, st.home, E.inOut);
        C.mood(out + 0.05, 0.72, 0, E.inOut);
        C.value01(out, 0.3, 'speed', 0);
        C.timeScale(out, 0.2, 1);
        C.post(out, 0.5, 'tintAmt', 0);
        C.post(out, 0.5, 'desat', 0);
        C.post(out, 0.5, 'exposure', 1);
        C.sky(out, 0.5, { uGlowAmt: 0 });
        C.tl.tween(out, 0.4, k => { st.shrink = k; });
        for (const p of st.pieces.values()) {
            C.prop(p, out, 0.4, 'fall', 0); C.prop(p, out, 0.1, 'jitter', 0); C.prop(p, out, 0.5, 'dim', 0);
            C.prop(p, out, 0.5, 'glowK', 0); C.prop(p, out, 0.5, 'tilt', 0); C.prop(p, out, 0.5, 'spin', 0);
        }
        C.tl.at(out - 0.03, () => {
            if ([...st.pieces.values()].some(p => p.stand > 0.5 && !p.free)) {
                st.post.flash = 0.45; st.post.flashColor.set('#ffffff'); st.flashDecay = 14;
                for (const p of st.pieces.values()) { p.stand = 0; p.yaw = 0; }
                st.camOwner = ++st.camSeq;
                st.shot = { target: C.T.clone(), dist: 7.2, yaw: 0.15, pitch: 1.12, fov: 40, roll: 0.05 };
            }
        });
        C.tl.at(out, () => {
            dom.skip.style.opacity = '0';
            for (const p of st.pieces.values()) if (p.free && p !== C.attacker) p.root.visible = false;
            if (!world.boardSolid) { world.boardSolid = true; slab.visible = top.visible = true; }
            const a = C.attacker;
            if (!a) return;
            a.free = null;
            a.root.visible = true;
            a.pos.copy(C.T);
            if (st.spec.move.promotion) a.setKind(st.spec.move.promotion.toUpperCase());
        });
        if (C.attacker) { C.prop(C.attacker, out, 0.5, 'scale', 1); C.prop(C.attacker, out, 0.5, 'squash', 1); }
    }

    /* ---------- общие рецепты ---------- */
    const pieceValue = p => (p ? (p.kind === 'K' ? 100 : VALUE[p.kind.toLowerCase()] || 0) : 0);
    const allSquares = () => Array.from({ length: 64 }, (_, i) => String.fromCharCode(97 + (i % 8)) + (1 + Math.floor(i / 8)));

    /** Удар по жертве: осколки, кольца, искры, дым, звук и вибрация. */
    function impact(C, t, at, color, { power = 4, victim = C.victim, big = true, dirv = C.dir } = {}) {
        if (victim) C.shatter(victim, t, { power, dirv });
        C.tl.at(t, () => {
            C.sparks(at.clone().setY(0.2), big ? 120 : 60, { speed: 4.5, up: 2.4, color: ['#ffffff', color, color] });
            C.smoke(at.clone().setY(0.05), big ? 10 : 6, { ring: true, speed: 1.5 });
        });
        C.ring(t, at, color, { size: 3 });
        C.ring(t + 0.06, at, '#ffffff', { size: 1.7, dur: 0.5 });
        C.flash(t, 0.5, color);
        C.shake(t, big ? 0.1 : 0.05);
        C.snd(big ? 'fx-drop' : 'fx-hit', t, big ? 1 : 0.8);
        C.tl.at(t, () => C.spec.onImpact?.('heavy'));
    }

    /** Разрез фигуры светящейся линией: две половины расходятся и падают. */
    function slice(C, p, t, color) {
        const st = C.st;
        C.tl.at(t, () => {
            p.root.updateMatrixWorld(true);
            const n0 = new THREE.Vector3(rand(-0.35, 0.35), 1, rand(-0.35, 0.35)).normalize();
            const c0 = p.point(0, 0.55);
            const away = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize();
            const halves = [1, -1].map(sgn => {
                const plane = new THREE.Plane();
                const mats = p.mats.map(m => { const c = m.clone(); c.clippingPlanes = [plane]; c.clipShadows = true; c.side = THREE.DoubleSide; return c; });
                const mesh = new THREE.Mesh(p.mesh.geometry, mats);
                mesh.userData.shared = true;
                p.mesh.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
                fx.add(mesh);
                return { mesh, plane, sgn, base: mesh.position.clone() };
            });
            p.root.visible = false;
            const lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.5).multiplyScalar(4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
            const line = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.03), lineMat);
            line.position.copy(c0);
            line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), camera.position.clone().sub(c0).normalize());
            line.rotateZ(Math.atan2(n0.x, n0.y) * 0.6);
            fx.add(line);
            let e = 0, fall = 0, vy = 0;
            st.updaters.push(dt => {
                e += dt;
                const sep = 0.12 * E.out(clamp(e / 1.0));
                if (e > 0.9) { vy -= 5 * dt; fall = Math.max(-0.42, fall + vy * dt); }
                for (const h of halves) {
                    const off = n0.clone().multiplyScalar(sep * h.sgn);
                    if (h.sgn > 0) off.addScaledVector(away, -fall * 0.5).add(new THREE.Vector3(0, fall, 0));
                    h.mesh.position.copy(h.base).add(off);
                    h.plane.setFromNormalAndCoplanarPoint(n0.clone().multiplyScalar(h.sgn), c0.clone().add(off));
                }
                lineMat.opacity = clamp(1 - e / 0.8);
                line.scale.x = 0.2 + 1.1 * E.out(clamp(e / 0.14));
                if (e < 1.2 && Math.random() < 0.7) C.sparks(c0.clone().addScaledVector(new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize(), rand(0, 0.32)), 1, { speed: 1.4, up: 0.1, size: 0.05, life: 0.5, color: [color, '#ffffff'] });
            });
            C.smoke(c0, 10, { speed: 0.9, color: '#5a3a3a' });
        });
        C.flash(t, 0.3, '#ffffff');
        C.snd('fx-drop', t, 1);
        C.snd('fx-glitch2', t - 0.04, 0.35);
        C.tl.at(t, () => C.spec.onImpact?.('heavy'));
    }

    /* ---------- шаблоны ----------
       Каждый строит дорожки на таймлайне по реальной позиции и возвращает
       { duration, drop, track }: drop — момент главного удара, на него
       ложится дроп трека. Последние 0.8 с — общий возврат к доске.
       Правила: камера движется плавно (один владелец кадра), «вставание»
       фигур — только под вспышкой, никаких синтезированных писков. */
    const TEMPLATES = {
        /** 2.5D, тёмно-бирюзовая доска: захват цели, плавный подъём, удар, облёт. */
        lockon(C) {
            const { A, T, V, attacker: a, spec, tx } = C;
            const st = C.st;
            const TEAL = '#3fe0c5', RED = '#ff4a3a', LIME = '#ccfc7e', WARM = '#ffd27a';
            st.accent = TEAL; st.dustColor = [0.6, 1, 0.9];
            const quick = C.value <= 1 && !spec.best;
            const yaw = pick([-1, 1]) * rand(0.25, 0.4);
            const cap = spec.move.capSq || spec.move.to;
            C.focus = V;
            C.cam(0, 1.1, C.shot(V, 6.4, yaw, 0.98, 40, -0.22));
            C.ring(0.55, V, RED, { contract: true, size: 1.25, from: 0.7, dur: 0.35 });
            C.fill(cap, RED, 0.6, 3.4, { pulse: 7 });
            C.reticle(cap, TEAL, 0.7, 3.1);
            if (C.value) C.amount(`−${C.value}`, 'neg', () => V.clone().setY(0.35).add(new THREE.Vector3(0, 0, -0.5)), 0.8, 3.0);
            C.cam(1.15, 0.85, C.shot(A.clone().lerp(V, 0.35), 6.2, yaw + 0.4, 1.0, 42, 0.15));
            C.fill(spec.move.from, LIME, 1.2, 3.0, { pulse: 5 });
            C.badge(spec.move.from, spec.best ? '!!' : '!', spec.best ? '#14b886' : '#2f7fe0', 1.35, 2.85);
            const pluck = 1.95, hit = 3.35;
            C.flash(pluck, 0.18, LIME);
            C.laser(spec.move.from, cap, LIME, pluck, hit, { width: 0.4 });
            C.hover(a, pluck, hit - pluck, V, { lift: 0.7, scale: 1.6, share: 0.3 });
            C.prop(a, pluck, 0.8, 'tilt', 0.18, E.inOut);
            C.prop(a, hit - 0.15, 0.15, 'tilt', 0, E.in);
            C.ripple(pluck + 0.2, A, 0.1, 1.4);
            C.camFn(pluck, hit - pluck, k => C.shot(A.clone().lerp(V, 0.35 + 0.45 * k), 7.2 - 1.0 * k, yaw + 0.4 - 0.3 * k, 1.05 + 0.06 * k, 42, 0.15 - 0.25 * k), E.inOut);
            C.flare(() => V.clone().setY(0.1), '#e8ff8a', 0.8, { from: pluck + 0.4, to: hit, spin: 1.5, peak: 0.7 });
            C.led(hit - 0.35, 'all', WARM, { dur: 0.35, center: cap, fill: 0, radius: 2.4 });
            C.hitstop(hit, 0.08);
            C.led(hit, 'all', RED, { dur: 0.7, center: cap, fill: 0.1, radius: 2.0 });
            C.ripple(hit, V, 0.26, 1.5);
            impact(C, hit, V, RED);
            C.punch(hit, -0.1);
            C.prop(a, hit, 0.08, 'squash', 0.78, E.out);
            C.prop(a, hit + 0.08, 0.5, 'squash', 1, E.outBack);
            C.fill(spec.move.to, TEAL, hit + 0.1, quick ? hit + 2.4 : hit + 4.4, { pulse: 4 });
            const capName = C.pieceName((spec.move.color === 'w' ? 'b' : 'w') + (spec.move.captured || 'p').toUpperCase());
            C.caption(capName || tx.capture, RED, hit + 0.2, hit + 2.5, { sub: `+${C.value || 1}` });
            C.embers(V, hit + 0.1, hit + 2.6, { rate: 24, color: ['#ff6a3d', '#ffb36b'], radius: 1.4 });
            C.badge(spec.move.to, '★', '#14b886', hit + 0.5, quick ? hit + 2.2 : hit + 4.1);
            C.cam(hit + 0.05, 1.6, C.shot(V, 7.4, yaw - 0.1, 1.06, 42, 0.12), E.out);
            if (quick) return { duration: hit + 3.0, drop: hit, track: 'track1' };
            const o0 = yaw - 0.1;
            C.camFn(hit + 1.7, 2.6, k => C.shot(T, 7.4 - 1.6 * E.sine(k), o0 + 0.9 * E.sine(k), 1.06 - 0.12 * E.sine(k), 42, 0.12 - 0.1 * k), E.linear);
            C.wave(hit + 1.8, spec.move.to, TEAL, { speed: 5, width: 1.6, alpha: 0.6, dur: 1.6 });
            C.flare(() => a.point(0, 0.9), TEAL, 0.6, { from: hit + 2, to: hit + 4.2, pulse: 6, peak: 0.6 });
            return { duration: hit + 5.1, drop: hit, track: 'track1' };
        },

        /** Лучший ход: LED-доска, полёт фигуры, «!!», лучи к целям, облёт героя. */
        brilliant(C) {
            const { A, T, attacker: a, victim: v, spec, tx } = C;
            const st = C.st;
            const LIME = '#ccfc7e', GREEN = '#5cff8a', TEAL = '#3fe0c5', RED = '#ff4a4a';
            st.accent = GREEN; st.dustColor = [0.6, 1, 0.75];
            const yaw = pick([-1, 1]) * rand(0.2, 0.35);
            C.focus = A.clone().lerp(T, 0.5);
            C.cam(0, 1.2, C.shot(A.clone().lerp(T, 0.4), 7.4, yaw, 1.0, 40, -0.18));
            C.caption(tx.best || '', GREEN, 0.5, 2.7, { pos: 'top' });
            C.fill(spec.move.from, TEAL, 0.3, 2.0, { pulse: 6 });
            const go = 1.3;
            C.led(go, allSquares().filter(() => Math.random() < 0.42), GREEN, { dur: 1.0, center: spec.move.to, fill: 0.15 });
            C.flash(go, 0.22, GREEN);
            C.reticle(spec.move.to, TEAL, go, go + 3.2);
            C.prop(a, go, 0.5, 'scale', 1.7, E.inOut);
            C.prop(a, go, 0.5, 'tilt', 0.18, E.inOut);
            C.move(a, go + 0.2, 1.0, T.clone().setY(0.35), { arc: a.kind === 'N' ? 0.6 : 0.15 });
            C.laser(spec.move.from, spec.move.to, LIME, go + 0.2, go + 1.5, { width: 0.35 });
            C.camFn(go, 1.2, k => C.shot(A.clone().lerp(T, 0.4 + 0.5 * k), 7.4 + 0.6 * k, yaw + 0.5 * k, 1.0, 40, -0.18 + 0.45 * k), E.inOut);
            const land = go + 1.25;
            C.move(a, land - 0.1, 0.12, T, { ease: E.in });
            C.prop(a, land - 0.1, 0.3, 'scale', 1.08, E.out);
            C.prop(a, land - 0.1, 0.12, 'tilt', 0);
            if (v) C.shatter(v, land, { power: 3, dirv: C.dir });
            C.ring(land, T, TEAL, { size: 1.0, from: 0.7, width: 0.12, dur: 0.6 });
            C.ring(land + 0.08, T, TEAL, { size: 1.6, from: 0.6, width: 0.06, dur: 0.7 });
            C.flash(land, 0.3, '#eaffd8');
            C.punch(land, 0.06);
            C.tl.at(land, () => C.sparks(T.clone().setY(0.1), 50, { speed: 2, up: 2.5, color: [LIME, '#ffffff', TEAL] }));
            C.snd('fx-hit', land, 0.6);
            C.tl.at(land, () => spec.onImpact?.('medium'));
            C.badge(spec.move.to, '!!', '#14b886', land + 0.1, land + 4.0);
            C.fill(spec.move.to, LIME, land, land + 4.3, { pulse: 4, halo: 0.45, alpha: 0.6 });
            C.glow(T.clone().setY(0.05), LIME, 1.1, { from: land, to: land + 4.2, peak: 0.2, pulse: 5 });
            C.caption(tx.brilliant || '!!', LIME, land + 0.2, land + 2.5, { size: 1.1 });
            C.embers(T, land, land + 2.4, { rate: 22, color: [LIME, '#ffffff'], radius: 0.6, up: 1.2 });
            C.cam(land, 1.6, C.shot(T, 5.4, yaw + 0.35, 1.08, 40, 0.25), E.out);
            const threats = (spec.threats || []).slice(0, 4);
            const th = land + 1.7;
            if (threats.length) C.cam(th, 0.9, C.shot(T, 7.4, yaw, 1.15, 42, 0.05), E.inOut);
            threats.forEach((sq, i) => {
                const t0 = th + 0.3 + i * 0.15;
                const P2 = C.P(sq);
                C.laser(spec.move.to, sq, RED, t0, th + 2.2, { width: 0.3 });
                C.fill(sq, RED, t0, th + 2.3, { pulse: 8 });
                C.ring(t0, P2, RED, { contract: true, size: 1.2, from: 0.7, dur: 0.3 });
            });
            const hero = th + (threats.length ? 2.4 : 0.6);
            const heroPos = C.clearPos(T, 3.1, 0.45, yawOf(T, A));
            C.cut(hero, C.from(heroPos, T.clone().setY(0.55), 44, 0.08), { flash: 0.45, color: GREEN });
            C.rise(hero);
            C.beam(T.clone().setY(9), T.clone().setY(0), GREEN, { from: hero + 0.2, to: hero + 2.1, width: 0.1, grow: 0.15 });
            C.aura(a, GREEN, hero + 0.2, hero + 2.1, { arcs: false, rate: 30 });
            C.sky(hero, 0.5, { uGlow: new THREE.Color(GREEN), uGlowAmt: 0.3, uGlowDir: T.clone().sub(heroPos).setY(0.2).normalize() });
            const hy = yawOf(T.clone().setY(0.55), heroPos);
            const hd = heroPos.distanceTo(T.clone().setY(0.55));
            C.camFn(hero + 0.05, 2.2, k => C.shot(T.clone().setY(0.55), hd * (1 - 0.12 * k), hy + 0.7 * E.sine(k), 0.08, 44), E.linear);
            return { duration: hero + 3.1, drop: land, track: 'track1' };
        },

        /** 2.5D лилово-розовая: лазер по линии атаки, рывок вдоль луча, замедленный облёт. */
        laser(C) {
            const { A, T, V, attacker: a, spec, tx } = C;
            const st = C.st;
            const PINK = '#e040c0', RED = '#ff4050';
            st.accent = PINK; st.dustColor = [1, 0.6, 0.85];
            const yaw = pick([-1, 1]) * rand(0.2, 0.35);
            const cap = spec.move.capSq || spec.move.to;
            C.focus = A.clone().lerp(V, 0.5);
            C.cam(0, 1.1, C.shot(A.clone().lerp(V, 0.5), 7.2, yaw, 1.1, 40, -0.2));
            C.fill(spec.move.from, PINK, 0.4, 3.5, { pulse: 6 });
            C.fill(cap, RED, 0.6, 3.5, { frame: true, pulse: 8 });
            C.badge(spec.move.from, spec.best ? '!!' : '!', spec.best ? '#c020a8' : '#6a4cff', 0.7, 3.1);
            C.prop(a, 1.1, 0.6, 'scale', 1.35, E.inOut);
            C.prop(a, 1.1, 0.6, 'tilt', 0.2, E.inOut);
            C.move(a, 1.1, 0.6, A.clone().setY(0.2), { ease: E.inOut });
            C.led(1.2, C.path(spec.move.from, spec.move.to), RED, { dur: 2.4, center: spec.move.from, fill: 0.3 });
            C.laser(spec.move.from, cap, RED, 1.6, 3.6, { width: 0.55 });
            C.cam(1.4, 1.9, C.shot(V.clone().lerp(A, 0.35), 5.2, yaw - 0.25, 0.95, 42, -0.32), E.inOut);
            if (C.value) C.amount(`−${C.value}`, 'neg', () => V.clone().setY(0.4), 2.0, 3.4);
            const hit = 3.4;
            C.move(a, hit - 0.24, 0.24, V, { ease: E.in });
            C.prop(a, hit - 0.1, 0.4, 'scale', 1.05, E.out);
            C.prop(a, hit - 0.24, 0.24, 'tilt', 0);
            C.hitstop(hit, 0.08);
            impact(C, hit, V, RED);
            C.led(hit, 'all', RED, { dur: 0.8, center: cap, fill: 0.15, radius: 2.1 });
            C.punch(hit, -0.08);
            C.timeScale(hit + 0.05, 0.1, 0.35);
            C.timeScale(hit + 1.3, 0.4, 1);
            C.camFn(hit + 0.1, 2.8, k => C.shot(T, 5.2 + 1.6 * E.sine(k), yaw - 0.25 + 0.8 * E.sine(k), 0.95 + 0.12 * k, 42, -0.32 + 0.3 * k), E.linear);
            C.caption(tx.capture || '', RED, hit + 0.25, hit + 2.6, { sub: C.value ? `+${C.value}` : '' });
            C.embers(V, hit + 0.1, hit + 2.4, { rate: 26, color: [PINK, '#ffb0c0'] });
            C.fill(spec.move.to, RED, hit + 0.4, hit + 3.0, { pulse: 4 });
            C.badge(spec.move.to, '★', '#e0203a', hit + 0.6, hit + 3.0);
            return { duration: hit + 3.8, drop: hit, track: 'track1' };
        },

        /** 3D гроза: аура молний, удар с неба по жертве, рывок на клетку под луной. */
        storm(C) {
            const { A, T, V, attacker: a, victim: v, spec, tx } = C;
            const st = C.st;
            const VIO = '#8a8aff', RED = '#ff4060';
            st.accent = VIO; st.dustColor = [0.7, 0.68, 1];
            const sgn = pick([-1, 1]);
            const cap = spec.move.capSq || spec.move.to;
            C.focus = A;
            C.cam(0, 1.1, C.shot(A.clone().lerp(V, 0.3), 7, 0.15 * sgn, 1.1, 40, 0));
            C.fill(spec.move.from, VIO, 0.3, 1.2);
            C.fill(cap, RED, 0.5, 1.2);
            const startPos = C.clearPos(A, 4.0, 0.75, yawOf(A, A.clone().addScaledVector(C.dir, -1)));
            C.cut(1.15, C.from(startPos, A.clone().lerp(V, 0.35).setY(0.5), 46, 0.05 * sgn), { flash: 0.45, color: '#b9b0ff' });
            C.rise(1.15);
            C.sky(1.15, 0.4, { uNeb: 1.0, uStars: 1 });
            const moonDir = () => A.clone().lerp(V, 0.5).setY(4.2).sub(camera.position).normalize().add(new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(0.22 * sgn)).normalize();
            C.moon(moonDir, 1.2, 9.4, { size: 16 });
            C.aura(a, RED, 1.3, 5.2, { color2: VIO });
            C.smoke(A.clone(), 8, { speed: 0.3, color: '#4a4466', life: 3 });
            const os = C.from(C.clearOS(A, V, 2.0, 0.8), V.clone().setY(0.42), 46, 0.04 * sgn);
            C.cam(1.4, 1.8, os, E.inOut);
            for (let i = 0; i < 2; i++) {
                const t0 = 2.6 + i * 0.3;
                const p = V.clone().add(new THREE.Vector3(rand(-1.5, 1.5), 0, rand(-1.5, 1.5)));
                C.lightning(p.clone().add(new THREE.Vector3(rand(-1, 1), 8, rand(-1, 1))), p, VIO, { from: t0, to: t0 + 0.12, width: 0.018, branches: 2 });
                C.flash(t0, 0.25, '#c8c0ff');
            }
            if (v) { C.prop(v, 2.8, 0.3, 'jitter', 0.02); C.prop(v, 3.35, 0.05, 'jitter', 0); }
            C.reticle(cap, VIO, 2.8, 3.45);
            const strike = 3.45;
            C.lightning(V.clone().add(new THREE.Vector3(rand(-0.4, 0.4), 10, rand(-0.4, 0.4))), () => (v ? v.point(0, 0.9) : V.clone().setY(0.5)), VIO, { from: strike, to: strike + 0.4, width: 0.032, branches: 4 });
            C.glow(() => V.clone().setY(0.4), VIO, 3.2, { from: strike, to: strike + 0.9, fadeIn: 0.02, fadeOut: 0.8, peak: 0.7 });
            C.flash(strike, 0.55, '#b88cff');
            C.shake(strike, 0.2, 2.6);
            C.snd('fx-drop', strike, 1);
            C.tl.at(strike, () => spec.onImpact?.('heavy'));
            C.ring(strike, V, VIO, { size: 3.4 });
            C.tl.at(strike, () => { C.sparks(V.clone().setY(0.2), 120, { speed: 3.5, up: 4, color: ['#c0c0ff', '#ffffff', VIO] }); C.smoke(V.clone(), 12, { ring: true, speed: 1.6, color: '#5a5480' }); });
            C.caption(tx.capture || '', VIO, strike + 0.2, strike + 2.4, { sub: C.value ? `+${C.value}` : '', pos: 'low' });
            if (v) {
                C.tl.at(strike + 0.04, () => v.launch(new THREE.Vector3(C.dir.x * 0.5, 5.5, C.dir.z * 0.5), new THREE.Vector3(rand(3, 5), rand(-2, 2), rand(2, 4))));
                C.timeScale(strike + 0.06, 0.12, 0.3);
                C.camFn(strike + 0.05, 1.0, k => ({ ...os, target: V.clone().setY(0.42 + 1.0 * E.out(k)), dist: os.dist * (1 + 0.12 * k) }), E.inOut);
                const burst = strike + 0.9;
                C.shatter(v, burst, { power: 3.2 });
                C.tl.at(burst, () => C.sparks(v.root.position.clone(), 80, { speed: 3.2, up: 0.5, color: ['#ffffff', VIO] }));
                C.flash(burst, 0.3, VIO);
                C.snd('fx-hit', burst, 0.7);
                C.timeScale(burst + 0.1, 0.4, 1);
            }
            const zip = strike + 1.35;
            C.move(a, zip, 0.75, T, { arc: 0.45, ease: E.inOut });
            C.lightning(() => a.point(0, 0.5), () => a.point(0, 0.5).addScaledVector(C.dir, -1.2).add(new THREE.Vector3(0, 0.2, 0)), VIO, { from: zip, to: zip + 0.75, width: 0.015, branches: 1 });
            const heroPos = C.clearPos(T, 3.2, 0.32, yawOf(T, A));
            C.cam(zip - 0.05, 1.0, C.from(heroPos, T.clone().setY(0.62), 46, 0.03), E.inOut);
            C.tl.at(zip + 0.75, () => { C.sparks(T.clone().setY(0.1), 70, { speed: 3, up: 1.5, color: ['#c0c0ff', '#ffffff'] }); C.smoke(T.clone(), 10, { ring: true, speed: 1.6, color: '#5a5480' }); });
            C.ring(zip + 0.75, T, VIO, { size: 3 });
            C.snd('fx-hit', zip + 0.75, 0.7);
            C.flare(() => a.eye(), '#cfe0ff', 0.5, { from: zip + 1.2, to: zip + 3.7, pulse: 12 });
            const hy = yawOf(T.clone().setY(0.62), heroPos), hd = heroPos.distanceTo(T.clone().setY(0.62));
            C.camFn(zip + 1.0, 2.8, k => C.shot(T.clone().setY(0.62 - 0.1 * k), hd * (1 - 0.15 * E.sine(k)), hy + 0.35 * E.sine(k), Math.asin(clamp((heroPos.y - 0.62) / hd, -1, 1)) + 0.04 * k, 46 - 4 * k), E.linear);
            C.badge(spec.move.to, spec.best ? '!!' : '★', spec.best ? '#c020a8' : '#5a4cff', zip + 1.2, zip + 3.7);
            return { duration: zip + 4.6, drop: strike, track: 'track2' };
        },

        /** Светлая доска: прыжок в 3D, видимый удар, доска бьётся в стекло, туманность. */
        shatter(C) {
            const { A, T, V, attacker: a, victim: v, spec, tx } = C;
            const st = C.st;
            const CYAN = '#4fd5f0', AQUA = '#2ce0c0', RED = '#e8433f';
            st.accent = CYAN; st.dustColor = [0.7, 0.95, 1];
            const sgn = pick([-1, 1]);
            const cap = spec.move.capSq || spec.move.to;
            C.focus = V;
            C.cam(0, 1.15, C.shot(A.clone().lerp(V, 0.5), 7.2, 0.12 * sgn, 1.25, 40, 0.3 * sgn));
            C.dimOthers(0.3, 0.6, 0.7, [a, v].filter(Boolean));
            C.fill(spec.move.from, CYAN, 0.3, 1.4, { pulse: 6 });
            C.fill(cap, RED, 0.5, 1.4, { pulse: 8 });
            C.reticle(cap, RED, 0.6, 1.4);
            C.badge(spec.move.from, spec.best ? '!!' : '!', spec.best ? '#14b8a0' : '#2f7fe0', 0.6, 1.35);
            const osPos = C.clearOS(A, V, 2.3, 0.75);
            const os = C.from(osPos, A.clone().lerp(V, 0.6).setY(0.45), 46, 0.05 * sgn);
            C.cut(1.4, os, { flash: 0.45, color: '#bff6ff' });
            C.rise(1.4);
            const hit = 2.75;
            C.move(a, 1.5, hit - 1.5, V.clone().setY(0.1), { arc: 1.0 });
            C.tl.tween(1.5, hit - 1.5, () => C.sparks(a.point(0, 0.5), 2, { speed: 0.4, up: 0.3, size: 0.05, life: 0.5, color: [CYAN, '#ffffff'] }), E.linear);
            C.snd('fx-whoosh', 1.45, 0.45);
            C.camFn(1.5, hit - 1.5, k => { const tg = a.root.position.clone().lerp(V, 0.45).setY(0.45); return C.from(osPos.clone().lerp(V, 0.25 * E.sine(k)).setY(0.75), tg, 46, 0.05 * sgn); }, E.linear);
            C.hitstop(hit, 0.08);
            impact(C, hit, V, CYAN, { power: 4.5 });
            C.caption(spec.best ? (tx.brilliant || '!!') : (tx.capture || ''), AQUA, hit + 0.2, hit + 2.4, { sub: C.value ? `+${C.value}` : '' });
            C.timeScale(hit + 0.05, 0.1, 0.35);
            C.timeScale(hit + 1.2, 0.4, 1);
            C.move(a, hit + 0.1, 0.35, T, { ease: E.out });
            const orb = C.from(C.clearPos(T, 2.7, 0.6, yawOf(T, A)), T.clone().setY(0.45), 46, 0.05 * sgn);
            C.camFn(hit + 0.1, 1.8, k => ({ ...orb, yaw: orb.yaw + 0.35 * sgn * E.sine(k), dist: orb.dist * (1 + 0.15 * k) }), E.linear);
            C.badge(spec.move.to, spec.best ? '!!' : '★', '#14b8a0', hit + 0.3, hit + 1.9);
            C.fill(spec.move.to, AQUA, hit + 0.1, hit + 1.9, { pulse: 5 });
            const brk = hit + 2.0;
            C.boardShatter(brk, T, { power: 3.2, restore: brk + 3.0 });
            C.flash(brk, 0.5, '#e0fbff');
            C.shake(brk, 0.2, 2.2);
            C.snd('fx-hit', brk, 0.9);
            C.snd('fx-glitch', brk - 0.03, 0.35);
            C.tl.at(brk, () => { for (const p of st.pieces.values()) if (p !== a && p.root.visible) p.launch(new THREE.Vector3(rand(-0.8, 0.8), rand(1.2, 2.6), rand(-0.8, 0.8)), new THREE.Vector3(rand(-3, 3), rand(-3, 3), rand(-3, 3))); });
            C.move(a, brk, 1.8, T.clone().setY(0.9), { ease: E.out });
            C.prop(a, brk, 2.6, 'spin', 0.9, E.inOut);
            C.timeScale(brk + 0.05, 0.1, 0.4);
            C.timeScale(brk + 1.6, 0.5, 1);
            C.sky(brk, 1.2, { uNebula: new THREE.Color('#6b4bd0'), uNeb: 1.1, uStars: 1, uHorizon: new THREE.Color('#2a2160') });
            const back0 = T.clone().addScaledVector(C.dir, -3.0).setY(0.9), back1 = T.clone().addScaledVector(C.dir, -4.6).addScaledVector(C.side, 1.2 * sgn).setY(2.0);
            C.camFn(brk + 0.05, 2.8, k => C.from(back0.clone().lerp(back1, E.sine(k)), T.clone().setY(0.7), 48, 0.05 * sgn), E.linear);
            C.glow(() => a.point(0, 0.5), '#8a7dff', 2.2, { from: brk + 0.6, to: brk + 2.9, peak: 0.5 });
            C.embers(T.clone().setY(0.3), brk + 0.2, brk + 2.9, { rate: 34, color: ['#8fe6ff', '#b9b0ff', '#ffffff'], radius: 2.5, up: 0.5 });
            const back = brk + 3.0;
            C.flash(back - 0.2, 0.3, '#8a6cff');
            C.cut(back, C.shot(T, 6.6, 0.15, 1.2, 40, 0.12 * sgn), { flash: 0.5 });
            C.tl.at(back, () => { a.spin = 0; a.pos.copy(T); for (const p of st.pieces.values()) if (p !== a && p.free) { p.free = null; p.root.rotation.set(0, 0, 0); } });
            C.rise(back, 0);
            C.sky(back, 0.6, { uNeb: 0.3, uStars: 0.3 });
            C.dimOthers(back, 0.4, 0, []);
            C.fill(spec.move.to, AQUA, back, back + 1.8, { pulse: 5 });
            C.badge(spec.move.to, '★', '#14b8a0', back + 0.2, back + 1.8);
            C.ring(back + 0.1, T, AQUA, { size: 2.4 });
            return { duration: back + 2.3, drop: hit, track: 'track2' };
        },

        /** 3D буллет-тайм: облёт фигуры в полёте, удар сносит жертву с доски. */
        bullet(C) {
            const { A, T, V, attacker: a, victim: v, spec, tx } = C;
            const st = C.st;
            const CYAN = '#3fd0ff';
            st.accent = CYAN; st.dustColor = [0.6, 0.9, 1];
            const sideSign = pick([-1, 1]);
            const yawSide = yawOf(A, A.clone().addScaledVector(C.side, sideSign));
            const cap = spec.move.capSq || spec.move.to;
            C.focus = A.clone().lerp(V, 0.5);
            C.cam(0, 1.0, C.shot(A.clone().lerp(V, 0.4), 7.0, 0.1 * sideSign, 1.08, 40, 0));
            C.fill(spec.move.from, '#22e0c8', 0.3, 3.3, { alpha: 0.6 });
            C.fill(cap, '#ff4a3a', 0.4, 3.4, { pulse: 7 });
            C.reticle(cap, '#ff4a4a', 0.5, 3.4);
            C.cut(1.0, C.shot(A.clone().setY(0.45), 3.6, yawSide, 0.22, 46), { flash: 0.4, color: '#bfefff' });
            C.rise(1.0);
            C.prop(a, 1.15, 0.3, 'squash', 0.82, E.inOut);
            const leap = 1.45, dur = 2.1, hit = leap + dur;
            C.prop(a, leap, 0.2, 'squash', 1.08, E.out);
            C.prop(a, leap + 0.2, 0.4, 'squash', 1, E.inOut);
            C.move(a, leap, dur, V, { arc: a.kind === 'N' ? 1.4 : 0.85, ease: k => 0.5 + 0.5 * Math.sign(k - 0.5) * Math.pow(Math.abs(2 * k - 1), 2.4) });
            C.prop(a, leap, dur, 'spin', Math.PI * 2 * sideSign, E.inOut);
            C.tl.tween(leap, dur, () => C.sparks(a.point(0, 0.5), 2, { speed: 0.3, up: 0.2, size: 0.06, life: 0.6, color: [CYAN, '#ffffff'] }), E.linear);
            C.value01(leap + 0.2, 0.4, 'speed', 0.7);
            C.value01(hit - 0.2, 0.25, 'speed', 0);
            C.camFn(leap, dur, k => C.shot(a.root.position.clone().setY(a.root.position.y + 0.45), 3.4 - 0.6 * Math.sin(k * Math.PI), yawSide + sideSign * 2.4 * E.sine(k), 0.22 + 0.15 * Math.sin(k * Math.PI), 50), E.linear);
            C.snd('fx-whoosh', leap - 0.1, 0.5, 0.7);
            C.post(leap, 0.5, 'desat', 0.3);
            C.post(hit, 0.2, 'desat', 0);
            if (v) {
                C.tl.at(hit, () => v.launch(C.dir.clone().multiplyScalar(7).add(new THREE.Vector3(0, 3.4, 0)), new THREE.Vector3(rand(-10, 10), rand(-5, 5), rand(7, 12))));
                C.tl.at(hit + 1.6, () => { v.root.visible = false; });
            }
            C.hitstop(hit, 0.1);
            impact(C, hit, V, CYAN, { victim: null });
            C.wave(hit, spec.move.to, CYAN, { speed: 9 });
            C.punch(hit, 0.12);
            C.timeScale(hit + 0.12, 0.1, 0.4);
            C.timeScale(hit + 1.2, 0.4, 1);
            C.move(a, hit + 0.12, 0.35, T, { ease: E.out });
            const endYaw = yawOf(V, C.clearPos(V, 3.2, 1.0, yawSide + sideSign * 2.4));
            C.camFn(hit + 0.05, 1.3, k => C.shot(V.clone().setY(0.45), 3.2 + 0.8 * k, endYaw + 0.25 * k * sideSign, 0.3 + 0.08 * k, 50), E.out);
            C.caption(tx.capture || '', CYAN, hit + 0.2, hit + 2.4, { sub: C.value ? `+${C.value}` : '' });
            if (C.value) C.amount(`−${C.value}`, 'neg', () => (v ? v.root.position.clone().add(new THREE.Vector3(0, 0.4, 0)) : V), hit + 0.05, hit + 1.3);
            const hero = hit + 1.45;
            const heroPos = C.clearPos(T, 2.9, 0.4, yawSide);
            C.cam(hero, 0.9, C.from(heroPos, T.clone().setY(0.55), 44, 0.08 * sideSign), E.inOut);
            C.fill(spec.move.to, CYAN, hero, hero + 2.5, { pulse: 5 });
            C.ring(hero + 0.3, T, CYAN, { size: 2 });
            C.badge(spec.move.to, spec.best ? '!!' : '★', spec.best ? '#14b8a0' : '#1f8ad8', hero + 0.3, hero + 2.4);
            C.embers(T, hero, hero + 2.3, { rate: 20, color: [CYAN, '#ffffff'], radius: 1 });
            return { duration: hero + 3.3, drop: hit, track: 'track2' };
        },

        /** 3D разрез: угроза сверху, стеклянная жертва режется пополам, победитель занимает клетку. */
        slash(C) {
            const { A, T, V, attacker: a, victim: v, spec, tx } = C;
            const st = C.st;
            const RED = '#ff3a3a', EMBER = '#ff5a3c';
            st.accent = RED; st.dustColor = [1, 0.5, 0.4];
            const cap = spec.move.capSq || spec.move.to;
            C.focus = V;
            C.cam(0, 1.2, C.shot(A.clone().lerp(V, 0.5), 6.4, 0.3, 0.95, 40, -0.38));
            C.camFn(1.2, 0.5, k => C.shot(A.clone().lerp(V, 0.5), 6.4 - 0.4 * k, 0.3, 0.95, 40, -0.38), E.linear);
            C.fill(cap, RED, 0.3, 1.7, { dots: true, pulse: 5 });
            C.reticle(cap, RED, 0.5, 1.7);
            C.flare(() => a.eye(), RED, 0.45, { from: 0.5, to: 1.7, pulse: 16 });
            const lowPos = C.clearPos(V, 2.9, 0.5, yawOf(V, A) + Math.PI / 2);
            const low = C.from(lowPos, V.clone().setY(0.45), 46, 0);
            C.cut(1.7, low, { flash: 0.45, color: '#ffb0a0' });
            C.rise(1.7);
            C.tl.at(1.7, () => { if (v) { v.base = v.base.map(m => { const c = m.clone(); c.color.set('#cfe8ff'); return c; }); v.mats.forEach(m => { m.transparent = true; m.opacity = 0.45; }); v.glow('#7fd0ff', 0.35); } });
            C.fill(cap, RED, 1.7, 5.4, { alpha: 1, halo: 1.0 });
            C.sky(1.7, 0.5, { uGlow: new THREE.Color(RED), uGlowAmt: 0.7, uGlowDir: V.clone().sub(lowPos).setY(0.1).normalize(), uHorizon: new THREE.Color('#2a0a0c'), uTop: new THREE.Color('#0e0305') });
            C.embers(V, 1.7, 5.6, { rate: 30, color: [EMBER, '#ffb36b'], radius: 1.3 });
            C.smoke(V.clone(), 8, { speed: 0.3, color: '#4a3434', life: 3 });
            C.camFn(1.75, 1.25, k => ({ ...low, yaw: low.yaw + 0.12 * k }), E.sine);
            const cut = 3.0;
            C.flare(() => (v ? v.point(0, 0.55) : V.clone().setY(0.4)), '#ffffff', 0.9, { from: cut - 0.35, to: cut + 0.05, fadeIn: 0.3, peak: 0.45 });
            // атакующий проносится сквозь жертву — видно, кто нанёс удар
            C.tl.at(cut - 0.45, () => { a.pos.copy(V).addScaledVector(C.dir, -1.6); });
            C.move(a, cut - 0.42, 0.5, V.clone().addScaledVector(C.dir, 0.9), { ease: E.inOut });
            C.tl.tween(cut - 0.42, 0.5, () => C.sparks(a.point(0, 0.5), 3, { speed: 0.5, up: 0.1, size: 0.07, life: 0.45, color: [RED, '#ffffff'] }), E.linear);
            if (v) slice(C, v, cut, RED); else impact(C, cut, V, RED);
            C.timeScale(cut + 0.03, 0.1, 0.3);
            C.timeScale(cut + 1.2, 0.4, 1);
            C.camFn(cut, 1.7, k => ({ ...low, yaw: low.yaw + 0.12 - 0.2 * E.sine(k), dist: low.dist * (1 + 0.2 * E.sine(k)) }), E.linear);
            const vname = C.pieceName(v?.code);
            C.caption(vname || tx.capture || '', RED, cut + 0.25, cut + 2.6, { sub: C.value ? `+${C.value}` : '' });
            const arrive = cut + 1.8;
            const wide = C.from(C.clearPos(T, 3.8, 1.3, yawOf(T, A) + 1.1), T.clone().setY(0.4), 50, 0.04);
            C.cam(arrive, 1.0, wide, E.inOut);
            C.move(a, arrive + 0.2, 0.9, T, { arc: 0.3 });
            C.ring(arrive + 1.1, T, RED, { size: 2.6 });
            C.snd('fx-hit', arrive + 1.1, 0.7);
            C.tl.at(arrive + 1.1, () => C.sparks(T.clone().setY(0.1), 50, { speed: 2.5, up: 1.4, color: [EMBER, '#ffffff'] }));
            C.badge(spec.move.to, '★', '#e0203a', arrive + 1.2, arrive + 2.6);
            return { duration: arrive + 3.0, drop: cut, track: 'track2' };
        },

        /** Вилка: фигура ставит удар на две цели — у соперника выбор, что спасать. */
        fork(C) {
            const { A, T, attacker: a, victim: v, spec, tx } = C;
            const st = C.st;
            const TEAL = '#3fe0c5', RED = '#ff3b4a', GOLD = '#ffd25a';
            st.accent = TEAL; st.dustColor = [0.7, 1, 0.95];
            const targets = (spec.threats || []).map(sq => ({ sq, p: st.pieces.get(sq) })).filter(o => o.p).sort((x, y) => pieceValue(y.p) - pieceValue(x.p)).slice(0, 2);
            if (targets.length < 2) return TEMPLATES.brilliant(C);
            const [t1, t2] = targets;
            const P1 = C.P(t1.sq), P2 = C.P(t2.sq);
            const centre = T.clone().add(P1).add(P2).multiplyScalar(1 / 3);
            const spread = Math.max(T.distanceTo(P1), T.distanceTo(P2), P1.distanceTo(P2));
            const yaw = pick([-1, 1]) * rand(0.15, 0.3);
            C.focus = T;
            C.cam(0, 1.3, C.shot(A.clone().lerp(T, 0.3), 7.0, yaw, 1.02, 40, -0.15));
            C.fill(spec.move.from, TEAL, 0.3, 2.9, { pulse: 5 });
            C.badge(spec.move.from, spec.best ? '!!' : '!', spec.best ? '#14b886' : '#2f7fe0', 0.6, 2.8);
            C.hover(a, 1.4, 1.6, T, { lift: 0.75, scale: 1.8, share: 0.38 });
            C.prop(a, 1.4, 0.6, 'tilt', 0.15);
            C.prop(a, 2.85, 0.15, 'tilt', 0);
            C.cam(1.4, 1.6, C.shot(T, 6.4, yaw + 0.3, 1.05, 40, 0.1), E.inOut);
            const land = 3.0;
            if (v) C.shatter(v, land, { power: 3, dirv: C.dir });
            C.ring(land, T, TEAL, { size: 2.2 });
            C.ripple(land, T, 0.18, 1.3);
            C.flash(land, 0.3, TEAL);
            C.snd('fx-hit', land, 0.8);
            C.tl.at(land, () => { C.sparks(T.clone().setY(0.1), 60, { speed: 2.4, up: 2, color: [TEAL, '#ffffff'] }); spec.onImpact?.('heavy'); });
            // две линии удара расходятся одновременно
            const wideShot = C.shot(centre, 5.5 + spread * 0.9, yaw, 1.2, 42, 0);
            C.cam(land + 0.2, 1.3, wideShot, E.inOut);
            for (const [i, t] of [t1, t2].entries()) {
                const t0 = land + 0.5 + i * 0.12;
                C.laser(spec.move.to, t.sq, RED, t0, land + 7.6, { width: 0.32 });
                C.ring(t0, C.P(t.sq), RED, { contract: true, size: 1.3, from: 0.7, dur: 0.35 });
                C.reticle(t.sq, RED, t0, land + 7.6);
                C.badge(t.sq, '?', '#e0203a', t0 + 0.2, land + 2.1);
                C.badge(t.sq, '?', '#e0203a', land + 6.0, land + 8.2);
            }
            C.fill(spec.move.to, TEAL, land, land + 8, { pulse: 4 });
            C.caption(tx.fork || '', RED, land + 0.8, land + 3.4, { sub: tx.forkSub || '' });
            C.snd('fx-shine', land + 0.8, 0.35);
            // выбор: камера перелетает от одной цели к другой, цели «бьются» по очереди
            const close = (P, side) => C.shot(P, 4.4, yaw + 0.45 * side, 1.02, 42, 0.12 * side);
            const d1 = land + 2.2, d2 = land + 4.0;
            C.cam(d1, 1.0, close(P1, -1), E.inOut);
            C.fill(t1.sq, RED, d1 + 0.3, d1 + 1.7, { pulse: 9, alpha: 1, dots: true });
            C.prop(t1.p, d1 + 0.4, 0.2, 'jitter', 0.018);
            C.prop(t1.p, d1 + 1.6, 0.1, 'jitter', 0);
            C.amount((pieceValue(t1.p) >= 100 ? '♚' : `−${pieceValue(t1.p)}`), 'neg', () => P1.clone().setY(0.35).add(new THREE.Vector3(0, 0, -0.5)), d1 + 0.4, d1 + 1.7);
            C.cam(d2, 1.0, close(P2, 1), E.inOut);
            C.fill(t2.sq, RED, d2 + 0.3, d2 + 1.7, { pulse: 9, alpha: 1, dots: true });
            C.prop(t2.p, d2 + 0.4, 0.2, 'jitter', 0.018);
            C.prop(t2.p, d2 + 1.6, 0.1, 'jitter', 0);
            C.amount((pieceValue(t2.p) >= 100 ? '♚' : `−${pieceValue(t2.p)}`), 'neg', () => P2.clone().setY(0.35).add(new THREE.Vector3(0, 0, -0.5)), d2 + 0.4, d2 + 1.7);
            C.snd('fx-hit', d1 + 0.4, 0.4); C.snd('fx-hit', d2 + 0.4, 0.4);
            // финал: широкий план сверху — вилочная фигура и обе цели в кадре, лучи пульсируют
            const fin = land + 5.9;
            const finShot = C.shot(centre, 6.5 + spread * 1.0, yaw - 0.2, 1.0, 44, 0.06);
            C.cam(fin, 1.1, finShot, E.inOut);
            C.camFn(fin + 1.15, 2.2, k => ({ ...finShot, yaw: finShot.yaw + 0.35 * E.sine(k), dist: finShot.dist * (1 - 0.08 * k) }), E.linear);
            for (const [i, t] of [t1, t2].entries()) {
                const ph = fin + 0.5 + i * 0.6;
                C.fill(t.sq, RED, ph, fin + 3.3, { pulse: 6, alpha: 1, dots: true, frame: true });
            }
            C.flare(() => a.point(0, 0.8), TEAL, 0.7, { from: fin + 0.3, to: fin + 3.2, pulse: 5, peak: 0.6 });
            return { duration: fin + 4.2, drop: land, track: 'track1' };
        },

        /** Превращение-«призыв»: одно непрерывное движение — круг, перебор фигур, столб света. */
        summon(C) {
            const { A, T, attacker: a, victim: v, spec, tx } = C;
            const st = C.st;
            const PINK = '#ff7fe0', VIOLET = '#b04cff';
            st.accent = PINK; st.dustColor = [1, 0.7, 1];
            const finalKind = (spec.move.promotion || 'q').toUpperCase();
            const HUE = PIECE_HUE[finalKind];
            C.focus = T;
            C.cam(0, 1.0, C.shot(A.clone().lerp(T, 0.5), 6.6, 0.25, 1.05, 40, -0.15));
            C.move(a, 0.25, 0.45, T, { arc: 0.08 });
            if (v) C.shatter(v, 0.7, { power: 2.4, dirv: C.dir });
            C.fill(spec.move.to, '#8bd45a', 0.7, 1.6);
            const top = C.shot(T, 5.0, 0.25, 1.42, 44, 0.1);
            C.cam(1.0, 1.4, top, E.inOut);
            C.dimOthers(1.0, 0.8, 1, [a]);
            C.post(1.0, 0.8, 'exposure', 0.6);
            C.tl.tween(1.0, 1.2, k => a.glow('#ffffff', 0.25 * k), E.inOut);
            const circ = C.circle(T, VIOLET, 1.3, 8.0, { size: 4.0, spin: 0.5 });
            const orbMat = C.orbiters(T, 8, 1.6, 7.9, { radius: 2.6, color: VIOLET });
            const drop = 2.4;
            C.flash(drop, 0.5, '#ffffff');
            C.post(drop, 0.2, 'exposure', 1);
            C.tl.at(drop, () => { world.boardSolid = false; slab.visible = top_.visible = false; });
            C.sky(drop, 0.25, { uNeb: 0.9, uNebula: new THREE.Color(VIOLET), uStars: 1, uHorizon: new THREE.Color('#2a0f40'), uTop: new THREE.Color('#12061e'), uBottom: new THREE.Color('#12061e') });
            C.flare(T.clone().setY(0.4), PINK, 2.6, { from: drop, to: 5.9, points: 8, spin: -0.35, peak: 0.45 });
            C.snd('fx-drop', drop, 1);
            C.tl.at(drop, () => spec.onImpact?.('heavy'));
            const beat = 0.515;
            for (let i = 1; i <= 2; i++) C.punch(drop + i * beat, 0.03);
            C.camFn(drop, 3.6, k => ({ ...top, yaw: top.yaw + 0.25 * k, dist: 5.0 - 0.7 * k, pitch: 1.42 - 0.12 * k }), E.linear);
            // перебор фигур: слон, конь, ладья, ферзь — дважды, быстрее
            const order = ['B', 'N', 'R', 'Q'];
            const seq = [...order, ...order.filter(k => k !== finalKind), finalKind];
            let t0 = 3.2;
            seq.forEach((kind, i) => {
                const d = i < 4 ? 0.3 : 0.24;
                C.tl.at(t0, () => {
                    a.setKind(kind); a.glow(PIECE_HUE[kind], 0.35);
                    circ.mat.color.set(PIECE_HUE[kind]).multiplyScalar(1.6); orbMat.emissive.set(PIECE_HUE[kind]);
                    skyU.uTop.value.set(PIECE_WORLD[kind]); skyU.uHorizon.value.set(PIECE_WORLD[kind]).multiplyScalar(1.8); skyU.uBottom.value.set(PIECE_WORLD[kind]); skyU.uNebula.value.set(PIECE_HUE[kind]);
                });
                C.flash(t0, 0.3, '#ffffff', 20);
                C.arrows(T, kind, PIECE_HUE[kind], t0, t0 + d);
                C.snd(i % 2 ? 'fx-glitch2' : 'fx-glitch', t0, 0.22, 1 + i * 0.03);
                t0 += d;
            });
            // решение: вспышка, фигура поднимается в столбе света
            const decide = t0;
            C.flash(decide, 0.6, '#ffffff');
            C.tl.at(decide, () => { a.setKind(finalKind); a.stand = 1; a.yaw = yawOf(a.root.position, camera.position); a.glow(HUE, 0.4); });
            C.flare(T.clone().setY(0.5), HUE, 3.5, { from: decide, to: decide + 0.5, points: 8, fadeIn: 0.03, fadeOut: 0.4, peak: 0.8 });
            C.ring(decide, T, HUE, { size: 3.6 });
            C.snd('fx-hit', decide, 0.8);
            C.beam(T.clone().setY(9), T.clone(), HUE, { from: decide + 0.05, to: decide + 2.1, width: 0.16, grow: 0.12 });
            C.move(a, decide + 0.1, 1.6, T.clone().setY(1.2), { ease: E.out });
            C.prop(a, decide + 0.1, 1.9, 'spin', Math.PI * 2, E.inOut);
            C.embers(T, decide + 0.1, decide + 2.0, { rate: 40, color: [HUE, '#ffffff'], radius: 0.5, up: 1.8 });
            const heroPos = C.clearPos(T, 3.6, 1.0, 0.25);
            C.cam(decide + 0.1, 1.8, C.from(heroPos, T.clone().setY(0.95), 46, 0.06), E.inOut);
            circ.size = t => 4.0 * (t < decide ? 1 : 1 + 0.25 * clamp((t - decide) / 0.6));
            // приземление: доска возвращается, круг схлопывается в волну
            const land = decide + 2.2;
            C.move(a, land - 0.35, 0.35, T, { ease: E.in });
            C.flash(land, 0.45, '#ffffff');
            C.tl.at(land, () => { world.boardSolid = true; slab.visible = top_.visible = true; a.glow(HUE, 0.25); });
            circ.size = t => (t < decide ? 4.0 : t < land ? 4.0 * (1 + 0.25 * clamp((t - decide) / 0.6)) : 5.0 * (1 - clamp((t - land) / 0.4)) + 0.01);
            C.post(land, 0.1, 'exposure', 1);
            C.dimOthers(land, 0.6, 0, []);
            C.sky(land, 0.6, { uNeb: 0.4 });
            C.ring(land, T, HUE, { size: 3.4 });
            C.ripple(land, T, 0.25, 1.4);
            C.wave(land, spec.move.to, HUE, { speed: 7 });
            C.snd('fx-drop', land, 0.85);
            C.fill(spec.move.to, HUE, land, land + 2.4, { pulse: 5, halo: 0.9 });
            C.badge(spec.move.to, '♛', '#c040c0', land + 0.2, land + 2.4);
            C.caption(tx.promotion || '', PINK, land + 0.15, land + 2.5, { sub: C.pieceName(spec.move.color + finalKind) });
            C.cam(land + 0.05, 2.4, C.from(heroPos.clone().add(new THREE.Vector3(0, 0.6, 0)), T.clone().setY(0.5), 44, 0.03), E.inOut);
            C.embers(T, land, land + 2.2, { rate: 26, color: [PINK, '#ffffff'], radius: 0.8, up: 1 });
            return { duration: land + 3.1, drop, track: 'track2' };
        },

        /** Превращение на доске: круг на клетке, пешка поднимается и меняет облик в столбах света. */
        crown(C) {
            const { A, T, attacker: a, victim: v, spec, tx } = C;
            const st = C.st;
            const finalKind = (spec.move.promotion || 'q').toUpperCase();
            const GOLD = '#ffd54a';
            st.accent = GOLD; st.dustColor = [1, 0.9, 0.6];
            C.focus = T;
            C.cam(0, 0.8, C.shot(T, 6.2, 0.3, 0.98, 40, -0.2), E.out);
            C.move(a, 0.15, 0.35, T, { arc: 0.1 });
            if (v) C.shatter(v, 0.5, { power: 2.4, dirv: C.dir });
            C.dimOthers(0.5, 0.5, 0.75, [a]);
            C.circle(T, GOLD, 0.6, 5.2, { size: 2.8, spin: 0.7 });
            C.cam(0.6, 1.6, C.shot(T.clone().setY(0.3), 4.6, 0.6, 0.62, 44, -0.1), E.inOut);
            C.flash(0.85, 0.3, GOLD);
            C.rise(0.85);
            C.move(a, 0.9, 1.4, T.clone().setY(0.65), { ease: E.out });
            C.prop(a, 0.9, 1.5, 'spin', Math.PI * 3, E.inOut);
            C.comet(() => a.point(0, 1.05), 1.0, 2.4, { size: 0.25 });
            const seq = ['B', 'N', 'R', 'Q', finalKind];
            let t0 = 2.4;
            seq.forEach((kind, i) => {
                const d = i < 4 ? 0.28 : 0.3;
                C.tl.at(t0, () => { a.setKind(kind); a.glow(PIECE_HUE[kind], 0.5); });
                C.beam(T.clone().setY(9), T.clone(), PIECE_HUE[kind], { from: t0, to: t0 + d, width: 0.2, grow: 0.05 });
                C.arrows(T, kind, PIECE_HUE[kind], t0, t0 + d, { size: 4.2 });
                C.flash(t0, 0.3, PIECE_HUE[kind], 20);
                C.snd('fx-glitch', t0, 0.22, 1 + i * 0.05);
                t0 += d;
            });
            const slam = t0 + 0.05;
            C.punch(slam - 0.05, 0.08);
            C.move(a, slam - 0.18, 0.18, T, { ease: E.in });
            C.flash(slam, 0.5, '#fff3c0');
            C.ring(slam, T, GOLD, { size: 3.4 });
            C.ripple(slam, T, 0.28, 1.4);
            C.wave(slam, spec.move.to, GOLD, { speed: 8 });
            C.tl.at(slam, () => { C.sparks(T.clone().setY(0.1), 110, { speed: 4, up: 3, color: [GOLD, '#ffffff', PIECE_HUE[finalKind]] }); C.smoke(T.clone(), 12, { ring: true, speed: 1.6, color: '#7a6a50' }); });
            C.shake(slam, 0.15);
            C.snd('fx-drop', slam, 1);
            C.tl.at(slam, () => spec.onImpact?.('heavy'));
            C.badge(spec.move.to, '♛', '#d4a017', slam + 0.2, slam + 2.6);
            C.caption(tx.promotion || '', GOLD, slam + 0.15, slam + 2.6, { sub: C.pieceName(spec.move.color + finalKind) });
            C.aura(a, GOLD, slam, slam + 2.4, { arcs: false, rate: 16 });
            const cy = yawOf(T, C.clearPos(T, 4.4, 1.8, 0.6));
            C.camFn(slam, 2.5, k => C.shot(T.clone().setY(0.35), 4.4 + 0.4 * k, cy + 0.3 * E.sine(k), 0.42, 44, -0.06), E.linear);
            C.embers(T, slam, slam + 2.4, { rate: 24, color: [GOLD, '#ffffff'], radius: 1 });
            C.dimOthers(slam + 1.8, 0.5, 0, []);
            return { duration: slam + 3.4, drop: slam, track: 'track1' };
        },

        /** Мат «Суд»: удар, клетки отхода гаснут, молнии, столбы света, король падает, распускается цветок. */
        judgement(C) {
            const { A, T, attacker: a, victim: v, spec, tx } = C;
            const st = C.st;
            const RED = '#ff3040', LIME = '#ccfc7e';
            st.accent = RED; st.dustColor = [1, 0.45, 0.5];
            const king = spec.kingSq ? st.pieces.get(spec.kingSq) : null;
            const K = king ? king.pos.clone() : T.clone();
            const kSq = spec.kingSq || spec.move.to;
            const yaw = pick([-1, 1]) * 0.28;
            C.focus = K;
            C.cam(0, 1.0, C.shot(A, 6.8, yaw, 1.02, 40, -0.2));
            C.fill(spec.move.from, LIME, 0.3, 2.8, { pulse: 6 });
            C.ring(0.4, A, LIME, { contract: true, size: 1.2, from: 0.7, dur: 0.3 });
            C.badge(spec.move.from, spec.best ? '!!' : '!', '#14b886', 0.6, 2.6);
            C.hover(a, 1.0, 1.9, T, { lift: 0.8, scale: 1.7, share: 0.35 });
            C.camFn(1.0, 1.9, k => C.shot(A.clone().lerp(T, E.sine(k)), 6.8 + 1.2 * Math.sin(k * Math.PI), yaw + 0.25 * k, 1.02, 40, -0.2 + 0.2 * k), E.inOut);
            const slam = 2.9;
            if (v) C.shatter(v, slam, { power: 3, dirv: C.dir });
            C.hitstop(slam, 0.1);
            C.flash(slam, 0.5, '#ff6060');
            C.led(slam, 'all', RED, { dur: 1.6, center: kSq, fill: 0.25, radius: 2.6 });
            C.ring(slam, K, RED, { contract: true, size: 1.4, from: 0.75, dur: 0.35 });
            C.ripple(slam, T, 0.3, 1.4);
            C.punch(slam, -0.1);
            C.shake(slam, 0.12);
            C.snd('fx-drop', slam, 1);
            C.tl.at(slam, () => spec.onImpact?.('heavy'));
            C.caption(tx.mate || '#', '#ff2050', slam + 0.1, slam + 3.0, { size: 1.5 });
            C.badge(kSq, '#', '#e0203a', slam + 0.2, slam + 3.1);
            // клетки отхода закрыты: рамки и точки загораются по очереди
            const k0 = yaw + 0.25;
            const lineMid = K.clone().lerp(T, 0.5), lineLen = K.distanceTo(T);
            C.camFn(slam + 0.2, 2.9, k => C.shot(lineMid, 5.8 + lineLen * 0.75 - 0.5 * E.sine(k), k0 + 0.6 * E.sine(k), 1.12, 42, 0.12), E.linear);
            C.around(kSq).forEach((sq, i) => C.fill(sq, RED, slam + 0.7 + i * 0.09, slam + 3.0, { pulse: 6, alpha: 0.55, dots: true, frame: true }));
            C.laser(spec.move.to, kSq, RED, slam + 0.5, slam + 3.0, { width: 0.3 });
            if (king) { C.prop(king, slam + 0.6, 0.3, 'jitter', 0.012); C.prop(king, slam + 3.0, 0.05, 'jitter', 0); }
            // горизонт: король под небом, луна, молнии
            const hz = slam + 3.1;
            const out = K.clone().setY(0);
            if (out.lengthSq() < 0.01) out.set(0, 0, -1);
            out.normalize();
            const camPos = C.clearPos(K, 3.6, 0.25, yawOf(K, K.clone().addScaledVector(out, -1)));
            const look = K.clone().setY(0.5);
            C.cut(hz, C.from(camPos, look, 44, 0), { flash: 0.5 });
            C.rise(hz);
            C.dimOthers(hz, 0.3, 0.6, [king, a].filter(Boolean));
            C.sky(hz, 0.4, { uGlowAmt: 0.7, uGlow: new THREE.Color('#ff2a2a'), uGlowDir: look.clone().sub(camPos).setY(0.12).normalize(), uNeb: 0.6, uHorizon: new THREE.Color('#2a0608'), uTop: new THREE.Color('#0a0204') });
            C.moon(() => look.clone().setY(3.4).sub(camera.position).normalize().add(new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(0.18)).normalize(), hz + 0.2, hz + 13, { size: 15 });
            const fwd = look.clone().sub(camPos).setY(0).normalize();
            const sideV = new THREE.Vector3(-fwd.z, 0, fwd.x);
            C.smoke(K.clone().addScaledVector(fwd, 2.5), 18, { speed: 0.25, size: 2.4, color: '#5a2a2a', life: 4, alpha: [0.25, 0.45] });
            const hy0 = yawOf(look, camPos), hd0 = camPos.distanceTo(look);
            C.camFn(hz + 0.05, 5.2, k => C.shot(look, hd0 * (1 - 0.22 * E.sine(k)), hy0 + 0.5 * E.sine(k), Math.asin(clamp((camPos.y - look.y) / hd0, -1, 1)), 44 - 4 * k, 0), E.linear);
            for (let i = 0; i < 3; i++) {
                const t0 = hz + 0.8 + i * 0.7;
                const p = K.clone().addScaledVector(sideV, (i - 1) * 0.8 + rand(-0.15, 0.15)).addScaledVector(fwd, rand(0.7, 1.5));
                C.lightning(p.clone().setY(9), p, '#ff9090', { from: t0, to: t0 + 0.22, width: 0.03, branches: 3 });
                C.tl.at(t0, () => C.sparks(p.clone().setY(0.05), 40, { speed: 2.2, up: 1.5, color: ['#ffffff', '#ff9090'] }));
                C.flash(t0, 0.28, '#ff9a9a');
                C.snd('fx-hit', t0, 0.35);
            }
            [[-0.9, 1.2], [0.8, 1.6], [-1.6, 2.4], [1.7, 2.6], [0, 3.2]].forEach(([dx, dz], i) => {
                const at = hz + 3.0 + i * 0.25;
                const base = K.clone().addScaledVector(sideV, dx).addScaledVector(fwd, dz).setY(0);
                C.beam(base.clone().setY(10), base, RED, { from: at, to: hz + 9.5, width: 0.06, grow: 0.1 });
                C.glow(base.clone().setY(0.05), RED, 0.8, { from: at + 0.08, to: hz + 9.5, peak: 0.7 });
            });
            C.snd('fx-hit', hz + 3.0, 0.5);
            // король падает
            const fall = hz + 5.4;
            if (king) C.prop(king, fall, 0.9, 'fall', 1, E.in);
            const thud = fall + 0.9;
            C.tl.at(thud, () => { C.smoke(K.clone(), 20, { ring: true, speed: 1.8, color: '#6a3a3a' }); C.sparks(K.clone().setY(0.1), 70, { speed: 2.5, up: 1.5, color: [RED, '#ffb0a0'] }); });
            C.ring(thud, K, RED, { size: 3.6 });
            C.shake(thud, 0.25, 2.5);
            C.snd('fx-drop', thud, 0.9);
            // цветок на месте падения
            const bloomAt = K.clone().addScaledVector(fwd, -1.1).setY(0.02);
            C.flower(bloomAt, thud + 0.4, thud + 6, { size: 0.55 });
            C.cam(thud + 0.2, 3.0, C.from(bloomAt.clone().addScaledVector(fwd, -1.7).setY(0.55), bloomAt.clone().lerp(K, 0.4).setY(0.3), 44, 0), E.inOut);
            C.embers(K, thud, thud + 3.6, { rate: 26, color: [RED, '#ffb0a0'], radius: 2.5, up: 0.7 });
            C.caption(tx.mate || '#', '#ff2050', thud + 0.5, thud + 3.4, { size: 1.3, pos: 'top', sound: false });
            const up = thud + 3.5;
            C.cam(up, 1.6, C.from(bloomAt.clone().addScaledVector(fwd, -2.8).setY(2.4), bloomAt.clone().lerp(K, 0.5).setY(0.2), 44, 0), E.inOut);
            return { duration: up + 2.5, drop: slam, track: 'track2' };
        },

        /** Мат «Затмение»: прыжок над камерой на фоне луны, вид сбоку, удар, разрез короля, цветок. */
        eclipse(C) {
            const { A, T, attacker: a, victim: v, spec, tx } = C;
            const st = C.st;
            const RED = '#ff3040', ICE = '#9fc4ff';
            st.accent = ICE; st.dustColor = [0.75, 0.85, 1];
            const king = spec.kingSq ? st.pieces.get(spec.kingSq) : null;
            const K = king ? king.pos.clone() : T.clone();
            const kSq = spec.kingSq || spec.move.to;
            const sgn = pick([-1, 1]);
            C.focus = A.clone().lerp(T, 0.5);
            C.cam(0, 1.3, C.shot(A, 7.0, 0.2 * sgn, 1.0, 40, -0.22 * sgn));
            C.camFn(1.3, 1.1, k => C.shot(A, 7.0 - 0.6 * k, 0.2 * sgn, 1.0, 40, -0.22 * sgn), E.linear);
            C.fill(spec.move.from, ICE, 0.3, 2.4, { pulse: 5 });
            C.reticle(spec.move.from, ICE, 0.5, 2.4);
            C.ring(1.0, K, RED, { contract: true, size: 1.3, from: 0.75, dur: 0.4 });
            C.fill(kSq, RED, 1.0, 2.4, { pulse: 7 });
            C.embers(A, 0.6, 2.4, { rate: 18, color: [ICE, '#ffffff'], radius: 0.8, up: 1 });
            C.sky(0.8, 1.2, { uTop: new THREE.Color('#02040c'), uHorizon: new THREE.Color('#141c3a'), uNebula: new THREE.Color('#3a4a9a'), uNeb: 0.7, uStars: 1.2 });
            // прыжок: камера на доске под дугой, фигура пролетает на фоне луны
            const leap0 = 2.5, leapDur = 4.2, land = leap0 + leapDur;
            const mid = A.clone().lerp(T, 0.5);
            const under = mid.clone().addScaledVector(C.dir, -1.0).setY(0.12);
            const apex = mid.clone().addScaledVector(C.dir, 0.4).setY(2.6);
            C.cut(leap0 - 0.05, C.from(under, apex, 64, 0), { flash: 0.4, color: '#cfe0ff' });
            C.rise(leap0 - 0.05);
            C.moon(() => apex.clone().add(new THREE.Vector3(0, 0.5, 0)).sub(under).normalize(), leap0, land + 1.2, { size: 26, dist: 70 });
            C.move(a, leap0, leapDur, T, { arc: 2.6, ease: k => 0.5 + 0.5 * Math.sign(k - 0.5) * Math.pow(Math.abs(2 * k - 1), 1.8) });
            C.prop(a, leap0, leapDur, 'spin', Math.PI * 2 * sgn, E.inOut);
            C.glow(() => a.point(0, 0.5), '#dfe8ff', 1.2, { from: leap0, to: land, peak: 0.3 });
            C.tl.tween(leap0, leapDur, () => C.sparks(a.point(0, 0.4), 1, { speed: 0.2, up: 0, size: 0.06, life: 0.8, color: [ICE, '#ffffff'] }), E.linear);
            C.snd('fx-whoosh', leap0, 0.45, 0.6);
            C.camFn(leap0, 2.2, k => C.from(under, apex.clone().lerp(a.root.position, 0.25), 64 - 6 * k, 0.06 * sgn * k), E.linear);
            // вид сбоку: фигура опускается на клетку
            const sideT = 4.75;
            const sidePos = T.clone().addScaledVector(C.side, 3.4 * sgn).addScaledVector(C.dir, -0.8).setY(0.9);
            C.cut(sideT, C.from(sidePos, A.clone().lerp(T, 0.7).setY(1.4), 46, 0), { flash: 0.3, color: '#cfe0ff' });
            C.camFn(sideT + 0.02, land - sideT, k => C.from(sidePos, a.root.position.clone().lerp(T, 0.3).add(new THREE.Vector3(0, 0.3, 0)), 46 - 4 * k, 0), E.linear);
            C.value01(sideT, 0.3, 'speed', 0.5);
            C.value01(land - 0.15, 0.2, 'speed', 0);
            // приземление
            C.hitstop(land, 0.1);
            if (v) C.shatter(v, land, { power: 3.5, dirv: C.dir });
            C.flash(land, 0.55, RED);
            C.shake(land, 0.2);
            C.ripple(land, T, 0.3, 1.6);
            C.ring(land, T, RED, { size: 3.4 });
            C.wave(land, spec.move.to, RED, { speed: 8 });
            C.laser(spec.move.to, kSq, RED, land + 0.3, land + 4.2, { width: 0.28 });
            C.led(land, 'all', RED, { dur: 1.2, center: spec.move.to, fill: 0.2, radius: 2.5 });
            C.tl.at(land, () => { C.sparks(T.clone().setY(0.1), 110, { speed: 4, up: 2.4, color: ['#ffffff', RED, ICE] }); C.smoke(T.clone(), 14, { ring: true, speed: 1.8, color: '#5a5a70' }); spec.onImpact?.('heavy'); });
            C.snd('fx-drop', land, 1);
            C.timeScale(land + 0.12, 0.1, 0.35);
            C.timeScale(land + 1.0, 0.4, 1);
            C.camFn(land + 0.05, 1.4, k => C.from(sidePos.clone().lerp(T.clone().setY(0.7), 0.2 * E.sine(k)), T.clone().setY(0.5), 42, 0), E.linear);
            // король: луч, закрытые клетки, разрез
            const kt = land + 1.5;
            const kPos = C.clearPos(K, 3.3, 0.55, yawOf(K, T) + Math.PI / 2);
            C.cam(kt, 1.1, C.from(kPos, K.clone().setY(0.5), 46, 0.04 * sgn), E.inOut);
            C.beam(() => a.point(0, 0.6), () => (king ? king.point(0, 0.6) : K.clone().setY(0.5)), RED, { from: kt + 1.1, to: kt + 2.7, width: 0.035, grow: 0.2 });
            C.around(kSq).forEach((sq, i) => C.fill(sq, RED, kt + 0.6 + i * 0.08, kt + 3.0, { alpha: 0.5, dots: true, frame: true, pulse: 6 }));
            if (king) { C.prop(king, kt + 0.6, 0.3, 'jitter', 0.014); C.prop(king, kt + 2.6, 0.05, 'jitter', 0); }
            C.caption(tx.mate || '#', '#ff2050', kt + 0.9, kt + 4.6, { size: 1.5 });
            C.sky(kt, 0.8, { uGlow: new THREE.Color(RED), uGlowAmt: 0.8, uGlowDir: K.clone().sub(kPos).setY(0.15).normalize() });
            C.camFn(kt + 1.15, 1.5, k => C.from(kPos.clone().lerp(K.clone().setY(0.5), 0.15 * k), K.clone().setY(0.5), 46 - 4 * k, 0.04 * sgn), E.linear);
            const cut = kt + 2.75;
            C.flare(() => (king ? king.point(0, 0.55) : K.clone().setY(0.5)), '#ffffff', 0.9, { from: cut - 0.4, to: cut + 0.05, fadeIn: 0.35, peak: 0.6 });
            if (king) slice(C, king, cut, RED); else impact(C, cut, K, RED);
            C.timeScale(cut + 0.03, 0.1, 0.3);
            C.timeScale(cut + 1.3, 0.4, 1);
            C.camFn(cut, 1.6, k => C.from(kPos.clone().lerp(K.clone().setY(0.5), 0.15).addScaledVector(new THREE.Vector3(-(K.z - kPos.z), 0, K.x - kPos.x).normalize(), 0.8 * E.sine(k) * sgn), K.clone().setY(0.45), 42, 0.04 * sgn), E.linear);
            // горизонт: столбы света, цветок распускается
            const hz = cut + 1.7;
            const out = K.clone().setY(0);
            if (out.lengthSq() < 0.01) out.set(0, 0, -1);
            out.normalize();
            const hPos = C.clearPos(K, 3.8, 0.22, yawOf(K, K.clone().addScaledVector(out, -1)));
            const look = K.clone().setY(0.45);
            C.cut(hz, C.from(hPos, look, 44, 0), { flash: 0.45 });
            C.sky(hz, 0.5, { uGlowAmt: 0.75, uGlow: new THREE.Color('#ff2a2a'), uGlowDir: look.clone().sub(hPos).setY(0.12).normalize(), uHorizon: new THREE.Color('#2a0608'), uTop: new THREE.Color('#0a0204') });
            const fwd = look.clone().sub(hPos).setY(0).normalize();
            const sideV = new THREE.Vector3(-fwd.z, 0, fwd.x);
            [[-1.0, 1.6], [1.1, 1.9], [-1.9, 2.8], [1.9, 3.0]].forEach(([dx, dz], i) => {
                const at = hz + 0.4 + i * 0.25;
                const base = K.clone().addScaledVector(sideV, dx).addScaledVector(fwd, dz).setY(0);
                C.beam(base.clone().setY(10), base, RED, { from: at, to: hz + 5, width: 0.055, grow: 0.1 });
                C.glow(base.clone().setY(0.05), RED, 0.7, { from: at + 0.08, to: hz + 5, peak: 0.6 });
            });
            C.snd('fx-hit', hz + 0.4, 0.5);
            C.smoke(K.clone().addScaledVector(fwd, 2.4), 16, { speed: 0.25, size: 2.4, color: '#5a2a2a', life: 4, alpha: [0.25, 0.45] });
            const bloomAt = K.clone().addScaledVector(fwd, -1.2).setY(0.02);
            C.flower(bloomAt, hz + 0.9, hz + 5.2, { size: 0.6 });
            C.camFn(hz + 0.05, 3.4, k => C.from(hPos.clone().lerp(bloomAt.clone().setY(0.4), 0.3 * E.sine(k)), bloomAt.clone().lerp(look, 0.5).setY(0.3), 44 - 4 * k, 0), E.linear);
            C.embers(K, hz, hz + 4.5, { rate: 24, color: [RED, '#ffb0a0'], radius: 2.5, up: 0.7 });
            const up = hz + 3.5;
            C.cam(up, 1.6, C.from(bloomAt.clone().addScaledVector(fwd, -2.8).setY(2.4), bloomAt.clone().lerp(K, 0.5).setY(0.2), 44, 0), E.inOut);
            return { duration: up + 2.5, drop: land, track: 'track2' };
        },
    };
    const top_ = top;

    /** Прогрев: шейдеры компилируются заранее, первая сцена не дёргается. */
    function warmup(ctx) {
        try {
            const size = sizeToHost();
            for (const kind of 'KQRBNP') geometry(kind);
            world.orientation = 'w';
            const tmp = ['wK', 'bQ'].map((code, i) => new Piece(world, code, i ? 'e8' : 'e1'));
            for (const list of Object.values(tiles)) list.forEach(m => { m.visible = true; });
            sparks.emit({ pos: new THREE.Vector3(), life: 0.01 });
            setCamera({ target: new THREE.Vector3(), dist: 12, yaw: 0, pitch: 1, roll: 0, fov: 40 });
            camera.aspect = size.w / size.h;
            boardU.map2.value = boardU.map2.value || drawBoard({ margin: 0.4 }, { light: '#888', dark: '#333', frame: '#111' }, null);
            topMat.map = topMat.map || boardU.map2.value;
            renderer.compile(scene, camera);
            composer.render(0);
            for (const list of Object.values(tiles)) list.forEach(m => { m.visible = false; });
            tmp.forEach(p => p.dispose());
        } catch (_) {}
        if (ctx) loadAudio(ctx);
    }

    return {
        play,
        skip,
        warmup,
        loadAudio,
        get playing() { return !!run; },
        templates: Object.keys(TEMPLATES),
        _internals: { topMat, boardU, renderer, bloom, FU, camera, get run() { return run; } },
        /** Для проверки кадров: сцена с spec.manual идёт только по step(). */
        step(dt) { if (run) tick(run, dt); return run ? run.t : -1; },
        dispose() {
            skip();
            renderer.dispose();
            root.remove();
        },
    };
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/** Какой шаблон сыграть и в каком мире: по поводу и ценности фигуры. */
export function chooseTemplate({ capture, best, mate, promo, fork, value = 0 }, last) {
    if (mate) return pick([{ template: 'eclipse', world: 'void' }, { template: 'judgement', world: 'crimson' }]);
    let pool;
    if (promo) pool = [['summon', 'void'], ['crown', 'teal']];
    else if (fork) pool = [['fork', pick(['teal', 'mauve'])]];
    else if (!capture) pool = [['brilliant', pick(['teal', 'bright'])]];
    else if (value <= 1 && !best) pool = [['lockon', 'teal'], ['laser', 'mauve'], ['lockon', 'teal']];
    else if (value >= 9) pool = [['slash', 'teal'], ['storm', 'void'], ['shatter', 'bright'], ['bullet', 'teal']];
    else pool = [['lockon', 'teal'], ['laser', 'mauve'], ['shatter', 'bright'], ['storm', 'void'], ['bullet', 'teal'], ['slash', 'teal']];
    if (best && capture && !promo && !fork) pool = pool.concat([['shatter', 'bright']]);
    const fresh = pool.filter(([t]) => t !== last);
    const [template, world] = pick(fresh.length ? fresh : pool);
    return { template, world };
}

// для проверки звука в тестах
export { Sfx as _Sfx };
