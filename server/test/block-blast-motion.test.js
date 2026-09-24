const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture(lowPower = false) {
    const frames = new Map(), mounted = new Set(), clears = [], draws = [];
    let clock = 0, sequence = 0;
    const context2d = () => new Proxy({
        clearRect(...args) { clears.push(args); },
        drawImage(...args) { draws.push(args); },
        createLinearGradient() { return { addColorStop() {} }; },
    }, { get: (target, name) => target[name] || (() => {}), set: (target, name, value) => { target[name] = value; return true; } });
    const document = { createElement() {
        const context = context2d();
        return { style: {}, dataset: {}, isConnected: false, setAttribute() {}, getContext: () => context,
            remove() { this.isConnected = false; mounted.delete(this); } };
    } };
    const grid = { appendChild(canvas) { canvas.isConnected = true; mounted.add(canvas); } };
    const scope = { window: { Image: class {}, devicePixelRatio: 3 }, module: { exports: {} } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../assets/block-blast/motion.js'), 'utf8'), scope);
    const api = scope.module.exports;
    const renderer = api.create({ document, textureBase: '/', lowPower, now: () => clock,
        schedule(fn) { frames.set(++sequence, fn); return sequence; }, cancel(id) { frames.delete(id); } });
    const theme = { id: 'porcelain', effect: 'porcelain' };
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
    for (const effect of ['paint', 'honey', 'soft', 'porcelain', 'squish']) assert.ok(f.api.duration(effect) >= 1000);
    f.renderer.cleanup();
    assert.equal(f.mounted.size, 0);
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
