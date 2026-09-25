const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture(lowPower = false, theme = { id: 'porcelain', effect: 'porcelain' }) {
    const frames = new Map(), mounted = new Set(), clears = [], draws = [];
    let clock = 0, sequence = 0;
    const context2d = () => new Proxy({
        clearRect(...args) { clears.push(args); },
        drawImage(...args) { draws.push(args); },
        createLinearGradient() { return { addColorStop() {} }; },
    }, { get: (target, name) => target[name] || (() => {}), set: (target, name, value) => { target[name] = value; return true; } });
    const document = { createElement() {
        const context = context2d(), calls = [];
        const recordDraw = context.drawImage;
        context.drawImage = (...args) => { args.alpha = context.globalAlpha; calls.push(args); recordDraw(...args); };
        return { style: {}, dataset: {}, calls, isConnected: false, setAttribute() {}, getContext: () => context,
            remove() { this.isConnected = false; mounted.delete(this); } };
    } };
    const grid = { appendChild(canvas) { canvas.isConnected = true; mounted.add(canvas); } };
    const scope = { window: { Image: class {}, devicePixelRatio: 3 }, module: { exports: {} } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../assets/block-blast/motion.js'), 'utf8'), scope);
    const api = scope.module.exports;
    const renderer = api.create({ document, textureBase: '/', lowPower, now: () => clock,
        schedule(fn) { frames.set(++sequence, fn); return sequence; }, cancel(id) { frames.delete(id); } });
    const cells = Array.from({ length: 64 }, (_, i) => ({ r: Math.floor(i / 8), c: i % 8, color: i % 7, x: 4 + i % 8 * 43.25, y: 4 + Math.floor(i / 8) * 43.25, w: 39.25 }));
    function tick(ms) { clock += ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(clock)); }
    return { api, renderer, mounted, frames, clears, draws, cells, tick,
        clear(items = cells) { renderer.clear(theme, items, [0], [], grid, 350); },
        canvas() { return [...mounted][0]; } };
}

test('rich effects keep readable timing, one canvas and a bounded budget during overlapping clears', () => {
    const f = fixture();
    for (let i = 0; i < 20; i++) {
        f.clear(); f.tick(16);
        assert.equal(f.mounted.size, 1);
        assert.equal(f.frames.size, 1);
        assert.ok(Number(f.canvas().dataset.particles) <= 360);
        assert.ok(Number(f.canvas().dataset.bursts) <= 3);
        f.tick(114);
    }
    f.tick(2000);
    assert.equal(f.canvas().dataset.particles, '0');
    assert.equal(f.canvas().dataset.bursts, '0');
    assert.equal(f.frames.size, 0, 'no idle rendering loop');
    for (const effect of ['paint', 'honey', 'soft', 'porcelain', 'squish']) assert.ok(f.api.duration(effect) >= 700 && f.api.duration(effect) <= 1150);
    f.renderer.cleanup();
    assert.equal(f.mounted.size, 0);
});

test('the release frame already contains fragments, with no intact-cell draw or fade-in delay', () => {
    for (const theme of [{ id: 'porcelain', effect: 'porcelain' }, { id: 'jelly', effect: 'squish' }, { id: 'honey', effect: 'honey' }]) {
        const f = fixture(false, theme);
        f.clear(f.cells.slice(0, 8));
        assert.ok(f.canvas().calls.length > 0, theme.id + ' draws before waiting for RAF');
        assert.ok(f.canvas().calls.every(call => call[1] >= 96 && call[3] === 40), 'only fragment atlas regions are drawn');
        assert.ok(f.canvas().calls.every(call => call.alpha === 1), 'fragments are visible at the instant of release');
        f.renderer.cleanup();
    }
});

test('a second clear gets visible fragments immediately even when the first used the full budget', () => {
    const f = fixture(); f.clear(f.cells.map(cell => ({ ...cell, color: 0 })));
    f.canvas().calls.length = 0;
    f.clear(f.cells.slice(0, 8).map(cell => ({ ...cell, color: 6 })));
    assert.ok(f.canvas().calls.filter(call => call[2] === 6 * 96).length >= 8);
    assert.ok(Number(f.canvas().dataset.particles) <= 360);
    f.renderer.cleanup();
});

test('paint starts as an even full-width stroke and erases from an advancing bristled edge', () => {
    const f = fixture(false, { id: 'paint', effect: 'paint' });
    f.clear(f.cells.slice(0, 8).map(cell => ({ ...cell, color: 4 })));
    const first = f.canvas().calls;
    assert.equal(first.length, 10);
    assert.ok(first.every(call => call[1] === 0 && call[3] === 640 && call[7] === 342));
    assert.equal(new Set(first.map(call => call[8])).size, 1, 'every bristle lane has equal thickness');
    f.canvas().calls.length = 0; f.tick(100);
    assert.ok(f.canvas().calls.every(call => call[1] > 0 && call[7] < 342), 'wipe begins immediately across the uniform band');
    f.tick(650);
    assert.equal(f.canvas().dataset.bursts, '0');
    assert.equal(f.frames.size, 0);
    f.renderer.cleanup();
});

test('limited devices reduce fragment and backing-store costs without accelerating effects', () => {
    const f = fixture(true);
    f.clear(); f.tick(16);
    assert.ok(Number(f.canvas().dataset.particles) <= 192);
    assert.equal(f.canvas().width, Math.round((350 + 128) * 1.25));
    f.tick(600);
    assert.equal(f.canvas().dataset.bursts, '1');
    f.renderer.cleanup();
    assert.equal(f.frames.size, 0);
});

test('new placements mask old fragments but a subsequent clear can animate that cell again', () => {
    const f = fixture();
    f.clear(f.cells.slice(0, 8)); f.tick(16);
    f.renderer.occlude([{ r: 0, c: 0 }]);
    f.clears.length = 0; f.tick(16);
    assert.ok(f.clears.some(args => args[2] === 39.25), 'live new cell is kept clear of old effects');
    f.clear(f.cells.slice(0, 8));
    f.clears.length = 0; f.tick(16);
    assert.ok(!f.clears.some(args => args[2] === 39.25), 'an older burst cannot erase the new clear');
    f.renderer.cleanup();
});

test('slow-frame adaptation bounds the entire overlapping scene and retains duration', () => {
    const f = fixture(); f.clear();
    for (let i = 0; i < 10; i++) f.tick(30);
    assert.ok(Number(f.canvas().dataset.particles) <= 192);
    assert.equal(f.canvas().dataset.bursts, '1');
    f.renderer.cleanup();
});
