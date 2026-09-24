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
    assert.equal(visuals.particleBudget(64, false, false), 24);
    assert.equal(visuals.particleBudget(64, false, true), 10);
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
    tick(300);
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
    let savedScore = 0, cleared = 0, awarded = 0;
    const context = vm.createContext({
        BB_ROWS: 8, BB_COLS: 8, bbGrid: grid, bbCombo: 0, bbComboBuffer: 0, bbScore: 8,
        BB_SCORING: { COMBO_BUFFER_MOVES: 3 }, vibrationEnabled: false,
        BBVisuals: { uniqueCells: visuals.uniqueCells, clearLines: (rows, cols) => { cleared = visuals.uniqueCells(rows, cols).length; }, lineScore() {}, combo() {}, allClear: bonus => { awarded = bonus; } },
        getCellFast() {}, bbPlayClear() {}, bbLineScore: () => 20, checkGameOver() {},
        saveBBState() { savedScore = context.bbScore; },
        addScore(points) { context.bbScore += points; },
    });
    vm.runInContext(extract('countFreeCells') + extract('checkAllClear') + extract('checkLines'), context);
    assert.equal(context.checkLines('bb-c-1', [{ r: 4, c: 4 }]), 1);
    assert.equal(cleared, 8);
    assert.equal(awarded, 500);
    assert.equal(context.bbScore, 528);
    assert.equal(savedScore, 528);
    assert.equal(context.countFreeCells(), 64);
});

test('touch cancellation never commits a placement and a queued final move is flushed', () => {
    assert.match(extract('onTouchEnd'), /e\?\.type === 'touchcancel'\) dragData\.validPos = null/);
    const end = extract('onTouchEnd');
    assert.ok(end.indexOf('handleMove(__moveX, __moveY)') < end.indexOf('const completedDrag = dragData'));
    assert.match(extract('startDrag'), /firstCell\.width/);
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

test('material sheet drag ignores a second finger and resets on cancellation', () => {
    const source = fs.readFileSync(path.join(root, 'assets/block-blast/visuals.js'), 'utf8');
    const start = source.indexOf('        handle.onpointerdown =');
    const end = source.indexOf('        sheet.showModal();', start);
    let closes = 0;
    const panel = { style: {}, getAnimations: () => [], animate() {} };
    const handle = { setPointerCapture() {} };
    const context = vm.createContext({ handle, panel, dragging: null, api: { reduced: () => true }, closePicker: () => { closes++; } });
    vm.runInContext(source.slice(start, end), context);
    handle.onpointerdown({ pointerId: 1, clientY: 100, button: 0, isPrimary: true });
    handle.onpointerdown({ pointerId: 2, clientY: 350, button: 0, isPrimary: false });
    handle.onpointermove({ pointerId: 2, clientY: 500 });
    handle.onpointerup({ pointerId: 2, clientY: 500 });
    assert.equal(closes, 0);
    assert.equal(context.dragging.id, 1);
    handle.onpointermove({ pointerId: 1, clientY: 145 });
    assert.equal(panel.style.transform, 'translateY(45px)');
    handle.onpointercancel({ pointerId: 1 });
    assert.equal(context.dragging, null);
    assert.equal(panel.style.transform, '');
    handle.onpointerdown({ pointerId: 3, clientY: 100, button: 0, isPrimary: true });
    handle.onpointermove({ pointerId: 3, clientY: 200 });
    handle.onpointerup({ pointerId: 3, clientY: 200 });
    assert.equal(closes, 1);
});
