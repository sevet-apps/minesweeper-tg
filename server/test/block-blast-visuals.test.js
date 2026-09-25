const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const visuals = require('../../assets/block-blast/visuals');
const root = path.join(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function extract(name) {
    const start = html.indexOf('function ' + name + '(');
    let depth = 0;
    for (let i = html.indexOf('{', start); i < html.length; i++) {
        if (html[i] === '{') depth++;
        if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
    }
}

test('score grouping uses narrow non-breaking spaces and accepts stored numeric strings', () => {
    for (const [value, expected] of [[0, '0'], [999, '999'], [1000, '1\u202f000'], ['123456789', '123\u202f456\u202f789'], [null, '0'], [NaN, '0'], [-12345, '-12\u202f345']]) {
        assert.equal(visuals.formatNumber(value), expected);
    }
});

test('crossing lines clear their shared cell exactly once', () => {
    assert.equal(visuals.uniqueCells([3], [4]).length, 15);
    assert.equal(visuals.uniqueCells([3, 3], [4, 4]).length, 15);
    assert.equal(visuals.uniqueCells([0,1,2,3,4,5,6,7], [0,1,2,3,4,5,6,7]).length, 64);
});

test('effects have a hard particle budget even for a completely full board', () => {
    assert.equal(visuals.particleBudget(64, false, false), 360);
    assert.equal(visuals.particleBudget(64, false, true), 192);
    assert.equal(visuals.particleBudget(64, true, false), 0);
    assert.equal(visuals.particleBudget(0, false, false), 0);
});

test('a replacement score animation cancels the previous target and cleanup leaves no frame', () => {
    let clock = 0, next = 0, shown = 0;
    const frames = new Map();
    const counter = visuals.createCounter(fn => { frames.set(++next, fn); return next; }, id => frames.delete(id), () => clock);
    const tick = delta => { clock += delta; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(clock)); };
    counter.run(0, 20, n => { shown = n; });
    tick(100);
    counter.run(shown, 1020, n => { shown = n; });
    assert.equal(frames.size, 1);
    tick(450);
    assert.equal(shown, 1020);
    assert.equal(frames.size, 0);
    counter.run(shown, 2000, n => { shown = n; });
    counter.stop();
    assert.equal(frames.size, 0);
    counter.run(shown, 2200, n => { shown = n; }, true);
    assert.equal(shown, 2200);
    assert.equal(frames.size, 0);
});

test('all ten material assets are local, small, static and match their catalog entries', () => {
    assert.equal(visuals.catalog.length, 11);
    let totalBytes = 0;
    for (const theme of visuals.catalog.filter(t => t.id !== 'classic')) {
        const svg = fs.readFileSync(path.join(root, `assets/block-blast/themes/${theme.id}.svg`), 'utf8');
        const meta = JSON.parse(fs.readFileSync(path.join(root, `assets/block-blast/themes/${theme.id}.json`)));
        totalBytes += Buffer.byteLength(svg);
        assert.ok(Buffer.byteLength(svg) < 12000);
        assert.match(svg, /viewBox="0 0 96 96"/);
        assert.doesNotMatch(svg, /<(?:filter|image|script|animate|foreignObject|text)\b|href="https?:/i);
        assert.equal(meta.id, theme.id);
        assert.equal(meta.effect, theme.effect);
        assert.deepEqual(meta.name, theme.name);
    }
    assert.ok(totalBytes < 40000, `all textures total ${totalBytes} bytes`);
});

test('line and all-clear bonuses settle before saving and cannot be lost on immediate exit', () => {
    const grid = Array.from({ length: 8 }, () => Array(8).fill(0));
    grid[4].fill('bb-c-1');
    let savedScore = 0, cleared = 0, awarded = 0, clearColor;
    const context = vm.createContext({
        BB_ROWS: 8, BB_COLS: 8, bbGrid: grid, bbCombo: 0, bbComboBuffer: 0, bbScore: 8,
        BB_SCORING: { COMBO_BUFFER_MOVES: 3 }, vibrationEnabled: false,
        BBVisuals: { uniqueCells: visuals.uniqueCells, clearLines: (rows, cols, getCell, color) => { cleared = visuals.uniqueCells(rows, cols).length; clearColor = color; }, lineScore() {}, combo() {}, allClear: bonus => { awarded = bonus; } },
        getCellFast() {}, bbPlayClear() {}, bbLineScore: () => 20, checkGameOver() {},
        saveBBState() { savedScore = context.bbScore; },
        addScore(points) { context.bbScore += points; },
    });
    vm.runInContext(extract('countFreeCells') + extract('checkAllClear') + extract('checkLines'), context);
    assert.equal(context.checkLines('bb-c-1', [{ r: 4, c: 4 }]), 1);
    assert.equal(cleared, 8);
    assert.equal(clearColor, 'bb-c-1');
    assert.equal(awarded, 500);
    assert.equal(context.bbScore, 528);
    assert.equal(savedScore, 528);
    assert.equal(context.countFreeCells(), 64);
});

test('every crossed-line fragment receives the triggering piece colour instead of the old board colours', () => {
    let snapshots;
    const cells = Array.from({ length: 64 }, (_, i) => ({ className: 'bb-cell filled bb-c-' + (i % 7 + 1), removeAttribute() {} }));
    const gridElement = { getBoundingClientRect: () => ({ width: 350 }), querySelectorAll: () => [], appendChild() {} };
    const document = { createElement: () => ({ className: '', setAttribute() {}, style: { setProperty() {} }, animate: () => ({}) }), querySelector: () => null, currentScript: { src: 'https://example.test/assets/block-blast/visuals.js' }, hidden: false,
        body: { classList: { contains: () => false } }, addEventListener() {}, getElementById: () => gridElement };
    const window = { document, matchMedia: () => ({ matches: false }), BBMaterialMotion: { create: () => ({ clear: (theme, items) => { snapshots = items; } }) } };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/block-blast/visuals.js'), 'utf8'), {
        window, URL, navigator: {}, localStorage: { getItem: () => null }, requestAnimationFrame() {}, cancelAnimationFrame() {},
    });
    window.BBVisuals.clearLines([4], [3], (r, c) => cells[r * 8 + c], 'bb-c-2');
    assert.equal(snapshots.length, 15);
    assert.ok(snapshots.every(cell => cell.color === 1));
    assert.ok(snapshots.every(cell => cell.cell.className === 'bb-cell'));
});

test('touch cancellation never commits a placement and a queued final move is flushed', () => {
    assert.match(extract('onTouchEnd'), /e\?\.type === 'touchcancel'\) dragData\.validPos = null/);
    const end = extract('onTouchEnd');
    assert.ok(end.indexOf('handleMove(__moveX, __moveY)') < end.indexOf('const completedDrag = dragData'));
    assert.match(extract('startDrag'), /logicalCell \* 1\.12/);
    assert.doesNotMatch(extract('startDrag'), /getCellFast.*getBoundingClientRect/);
});

test('an older server reply preserves later optimistic points, and the last reply can correct them', () => {
    let cancellations = 0;
    const context = vm.createContext({
        bbScore: 640, bbDisplayedScore: 620, bbRevision: 1, bbNextHandSeed: 4,
        bbServerCheckpoint: null, bbGameEnded: false, bbShapes: [],
        normalizedBBShapes: () => null, renderBBShapeSlots() {}, updateBBScoreUI() {},
        BBVisuals: { stopCounter() { cancellations++; } },
    });
    vm.runInContext(extract('acceptBBServerMove'), context);
    context.acceptBBServerMove({ revision: 2, server_score: 530, next_hand_seed: 5 }, true);
    assert.equal(context.bbScore, 640);
    assert.equal(context.bbDisplayedScore, 620);
    assert.equal(context.bbNextHandSeed, 4);
    assert.equal(cancellations, 0);
    context.acceptBBServerMove({ revision: 3, server_score: 645, next_hand_seed: 6 }, false);
    assert.equal(context.bbScore, 645);
    assert.equal(context.bbDisplayedScore, 645);
    assert.equal(context.bbNextHandSeed, 6);
    assert.equal(cancellations, 1);
    context.acceptBBServerMove({ revision: 3, server_score: 645 }, false);
    assert.equal(cancellations, 1, 'an accurate animated score is allowed to finish');
});

test('an enlarged drag stays centred on the logical board footprint', () => {
    let placement;
    const context = vm.createContext({
        dragData: { startX: 100, startY: 100, gridRect: { left: 24, top: 204 }, cellSize: 43.25, logicalWidth: 125.75, logicalHeight: 39.25 },
        touchOffsetX: (39.25 * 1.12 * 3 + 8) / 2, touchOffsetY: 39.25 * 1.12 / 2,
        dragGhost: { style: {} }, isDesktop: () => true, DRAG_MULTIPLIER: 1.3, DRAG_LIFT_Y: 150,
        lastPlacementRow: -1, lastPlacementCol: -1, checkPlacement: (r, c) => { placement = [r, c]; },
    });
    vm.runInContext(extract('handleMove'), context);
    context.handleMove(24 + 3 * 43.25 + 125.75 / 2, 204 + 2 * 43.25 + 39.25 / 2);
    assert.deepEqual(placement, [2, 3]);
    assert.match(context.dragGhost.style.transform, /translate3d/);
});

test('cancelled placement motion cleans up without cancelling a newer placement', () => {
    const listeners = new Map(), classes = new Set();
    let name = 'bbJellyPlace', awarded = 0, masks = 0;
    const cell = { style: {}, classList: { add: (...values) => values.forEach(v => classes.add(v)), remove: (...values) => values.forEach(v => classes.delete(v)) },
        addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) };
    const context = vm.createContext({ vibrationEnabled: false, bbPlayPlace() {}, bbGrid: [[0]], getCellFast: () => cell,
        getComputedStyle: () => ({ animationName: name }), BBVisuals: { reduced: () => false, occlude: cells => { masks += cells.length; } }, addScore: points => { awarded += points; } });
    vm.runInContext(extract('placeShape'), context);
    context.placeShape([[1]], 0, 0, 'bb-c-1');
    listeners.get('animationcancel')();
    assert.ok(classes.has('place-pop'), 'a late cancellation must preserve a currently running wobble');
    name = 'none'; listeners.get('animationcancel')();
    assert.ok(!classes.has('place-pop'));
    assert.equal(listeners.size, 0);
    assert.equal(awarded, 1);
    assert.equal(masks, 1);
});


test('touch cancellation returns the held tray piece even while its entrance animation is active', () => {
    const classes = new Set(['bb-shape-preview', 'bb-deal-in', 'is-held']);
    let commits = 0, removed = false;
    const context = vm.createContext({
        dragData: { slotId: 0, validPos: { r: 2, c: 2 } }, __movePending: false,
        lastPlacementRow: 2, lastPlacementCol: 2, BB_ROWS: 0, BB_COLS: 0,
        dragGhost: { remove() { removed = true; } }, bbStopSparks() {},
        document: { removeEventListener() {}, querySelector: () => ({ classList: { remove: c => classes.delete(c) } }) },
        onTouchMove() {}, onMouseMove() {}, placeShape() { commits++; },
    });
    vm.runInContext(extract('onTouchEnd'), context);
    context.onTouchEnd({ type: 'touchcancel' });
    assert.equal(commits, 0); assert.equal(removed, true); assert.equal(context.dragData, null);
    assert.equal(classes.has('is-held'), false); assert.equal(classes.has('bb-deal-in'), true);
});

test('ice preview has independent cell phases and clear feedback respects the saved shake preference', () => {
    for (const shake of ['on', 'off']) {
        const animations = [], rims = [], styles = new Map();
        const grid = { getBoundingClientRect: () => ({ width: 350 }), querySelectorAll: () => [], appendChild: el => rims.push(el) };
        const document = { currentScript: { src: 'https://example.test/assets/block-blast/visuals.js' }, hidden: false,
            body: { classList: { contains: () => false } }, addEventListener() {}, getElementById: () => grid,
            querySelector: () => ({ animate: (frames, timing) => { animations.push({ frames, timing }); return {}; } }),
            createElement: () => ({ setAttribute() {}, style: { setProperty: (k, v) => styles.set(k, v) }, animate: () => ({}) }),
        };
        const window = { document, matchMedia: () => ({ matches: false }), BBMaterialMotion: { create: () => ({ clear() {} }) } };
        vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/block-blast/visuals.js'), 'utf8'), {
            window, URL, navigator: {}, localStorage: { getItem: key => key === 'bb_shake' ? shake : key === 'bb_material' ? 'ice' : null }, requestAnimationFrame() {}, cancelAnimationFrame() {},
        });
        const phases = [], speeds = [];
        for (let c = 0; c < 8; c++) {
            const values = {};
            window.BBVisuals.preparePreClear({ style: { setProperty: (k, v) => { values[k] = v; } } }, 2, c);
            phases.push(values['--ice-phase']); speeds.push(values['--ice-speed']);
        }
        assert.equal(new Set(phases).size, 8); assert.equal(new Set(speeds).size, 8);
        window.BBVisuals.clearLines([2], [], () => ({ removeAttribute() {} }), 'bb-c-1');
        assert.equal(rims.length, 1);
        assert.equal(styles.get('--bb-clear-color'), '#8bd5ed', 'rim follows the visible ice palette');
        assert.equal(animations.length, shake === 'on' ? 1 : 0);
        if (animations.length) assert.equal(animations[0].timing.duration, 260);
    }
});
