const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const gameUiSource = fs.readFileSync(path.join(root, 'monopoly', 'js', 'v2', 'game-ui.js'), 'utf8');
const monopolyCss = fs.readFileSync(path.join(root, 'monopoly', 'css', 'v2.css'), 'utf8');

function extractFunction(source, name) {
    const start = source.indexOf(`function ${name}`);
    assert.notEqual(start, -1, `function ${name} must exist`);
    const bodyStart = source.indexOf('{', start);
    let depth = 0;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
    }
    throw new Error(`function ${name} is not balanced`);
}

test('Block Blast resume preserves occupied-cell colors and the saved hand', () => {
    const context = {
        BB_COLS: 8,
        COLORS: ['bb-c-1', 'bb-c-2', 'bb-c-3', 'bb-c-4', 'bb-c-5', 'bb-c-6', 'bb-c-7']
    };
    vm.createContext(context);
    vm.runInContext(extractFunction(indexSource, 'mergeBBServerGrid'), context);

    const merged = context.mergeBBServerGrid(
        [[1, 1, 0]],
        [['bb-c-5', 0, 'bb-c-7']]
    );
    assert.deepEqual(JSON.parse(JSON.stringify(merged)), [['bb-c-5', 'bb-c-2', 0]]);

    const syncStart = indexSource.indexOf('async function syncBBSession');
    const syncEnd = indexSource.indexOf('function resetBBToCurrentSession', syncStart);
    const syncBody = indexSource.slice(syncStart, syncEnd);
    assert.match(syncBody, /renderBBShapeSlots\(\)/);
    assert.doesNotMatch(syncBody, /spawnShapes\(\)/);
    assert.match(indexSource, /pendingMoves:\s*bbMoveQueue\.map/);
    assert.ok(indexSource.indexOf('bbMoveQueue.shift();') < indexSource.indexOf('if (!bbGameEnded) saveBBState();'));
});

test('Monopoly chat only follows new messages when already near the bottom', () => {
    const chat = {
        scrollHeight: 500,
        scrollTop: 100,
        clientHeight: 200,
        appendChild() { this.scrollHeight += 50; }
    };
    const context = { els: { chat } };
    vm.createContext(context);
    vm.runInContext(extractFunction(gameUiSource, 'chatIsNearBottom'), context);
    vm.runInContext(extractFunction(gameUiSource, 'appendChatMessage'), context);

    context.appendChatMessage({});
    assert.equal(chat.scrollTop, 100, 'reading position must stay unchanged');

    chat.scrollHeight = 500;
    chat.scrollTop = 280;
    context.appendChatMessage({});
    assert.equal(chat.scrollTop, 550, 'chat should follow messages from the bottom');
});

test('Monopoly casino raises the complete center stacking context', () => {
    assert.match(gameUiSource, /els\.board\.classList\.toggle\('casino-overlay-active'/);
    assert.match(monopolyCss,
        /\.board\.casino-overlay-active \.board-center\s*\{[^}]*z-index:\s*80/s);
});

test('Tower perfect streak uses the requested growth schedule and one-side cap', () => {
    const context = { TW_BASE_SIZE: 130 };
    vm.createContext(context);
    vm.runInContext(extractFunction(indexSource, 'twPerfectGrowthRate'), context);
    vm.runInContext(extractFunction(indexSource, 'twApplyPerfectGrowth'), context);

    assert.deepEqual(
        [4, 5, 6, 7, 8, 9].map(context.twPerfectGrowthRate),
        [0, 0.10, 0.12, 0.15, 0.18, 0.21]
    );

    const block = { x: 10, z: 0, w: 100, d: 120 };
    context.twApplyPerfectGrowth(block, 5);
    assert.equal(block.w, 113);
    assert.equal(block.x, 3.5, 'growth must extend toward the most heavily cut side');
    assert.equal(block.d, 120, 'only one side/axis may grow per perfect placement');

    const capped = { x: 0, z: 0, w: 129, d: 130 };
    context.twApplyPerfectGrowth(capped, 20);
    assert.ok(capped.w > 129 && capped.w <= 130,
        'a bonus may restore one side but can never exceed the original block size');
    assert.equal(capped.d, 130);

    const gameOverStart = indexSource.indexOf('async function twGameOver');
    const gameOverEnd = indexSource.indexOf('function twTowerBounds', gameOverStart);
    const gameOver = indexSource.slice(gameOverStart, gameOverEnd);
    assert.ok(gameOver.indexOf('const recordSave =') < gameOver.indexOf('await revealDelay;'),
        'record saving must run concurrently with the camera delay');
    assert.doesNotMatch(gameOver, /await recordSave/,
        'a slow score request must not delay the result modal');
});

test('Referral terms and Wordle card keep touch-safe UI behavior', () => {
    const referralStart = indexSource.indexOf('function showReferralConditions');
    const referralEnd = indexSource.indexOf('async function checkAndRegisterReferral', referralStart);
    const referral = indexSource.slice(referralStart, referralEnd);
    assert.match(referral, /bindReferralSheetGesture\(sheet\)/);
    assert.match(referral, /!isReferralSheetControl\(e\.target\)/);
    assert.doesNotMatch(referral, /referralConditionsHandle[^\n]*addEventListener/);
    assert.match(indexSource, /transform 0\.42s cubic-bezier\(0\.16, 1, 0\.3, 1\)/);

    assert.match(indexSource, /game-card--wordle" onclick="startWordle\(\)" oncontextmenu="return false"/);
    assert.match(indexSource, /#view-games \.game-beta-ribbon[\s\S]*?pointer-events: none/);
    assert.match(indexSource, /#view-games \.game-card[\s\S]*?-webkit-touch-callout: none/);
});

test('Chinese flag and Block Blast counters use the refreshed visual treatment', () => {
    const zhButtonStart = indexSource.indexOf('data-lang="zh"');
    const zhButtonEnd = indexSource.indexOf('</button>', zhButtonStart);
    const zhButton = indexSource.slice(zhButtonStart, zhButtonEnd);
    assert.match(zhButton, /<circle cx="30" cy="30" r="30" fill="#DE2910"/);
    assert.equal((zhButton.match(/<use href="#zhStar"/g) || []).length, 5,
        'the Chinese flag must contain one large and four small stars');

    assert.match(indexSource, /\.bb-line-score\s*\{[\s\S]*?linear-gradient\(100deg,[\s\S]*?background-clip:\s*text/s);
    assert.match(indexSource, /@keyframes bbLineScoreIn\s*\{[\s\S]*?scale\(\.78\)[\s\S]*?scale\(1\)/s);
    assert.match(indexSource, /\.bb-best,[\s\S]*?#bbScoreNum\s*\{[\s\S]*?SF Pro Display/s);
});

test('Tower debris uses bounded 3D rigid-body physics and waves expose only visible edges', () => {
    const context = { TW_BLOCK_HEIGHT: 35, Math };
    vm.createContext(context);
    vm.runInContext(extractFunction(indexSource, 'twStepDebris'), context);
    vm.runInContext(extractFunction(indexSource, 'twRotateVector'), context);

    const debris = {
        x: 0, y: 200, z: 0,
        vx: 120, vy: 0, vz: -60,
        rx: 0, ry: 0, rz: 0,
        avx: 2, avy: 1, avz: -1,
        age: 0, restTime: 0, life: 5, alpha: 1
    };
    context.twStepDebris(debris, 16.67);
    assert.ok(debris.x > 0 && debris.z < 0, 'detached piece must keep its outward impulse');
    assert.ok(debris.y < 200, 'gravity must pull the detached piece down');
    assert.notEqual(debris.rx, 0, 'the cuboid must tumble on a real 3D axis');

    const rotated = context.twRotateVector({ x: 3, y: 4, z: 5 }, .3, .6, .9);
    const length = Math.hypot(rotated.x, rotated.y, rotated.z);
    assert.ok(Math.abs(length - Math.sqrt(50)) < 1e-9, 'rotation must preserve cuboid geometry');

    const addDebris = extractFunction(indexSource, 'twAddDebris');
    assert.match(addDebris, /twDebris\.length > 16/,
        'debris pool must stay bounded for mobile performance');
    const waves = extractFunction(indexSource, 'twDrawPerfectWaves');
    assert.match(waves, /const delay = 165/);
    assert.match(waves, /const cap = 0\.14/);
    assert.doesNotMatch(waves, /twCtx\.closePath\(\)/,
        'rear wave edges must not be drawn through the tower');
});
