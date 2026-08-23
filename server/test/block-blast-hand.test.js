'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
    HARD_UNLOCK_START,
    HARD_UNLOCK_STEP,
    advanceSeed,
    bestPlacement,
    generateHand,
    isShapeUnlocked,
    repairLockedShapes,
    unlockedHardShapeCount,
} = require('../block-blast-hand');

const emptyGrid = () => Array.from({ length: 8 }, () => Array(8).fill(0));

function extractArray(source, marker) {
    const markerIndex = source.indexOf(marker);
    assert.notEqual(markerIndex, -1, `${marker} must exist`);
    const start = source.indexOf('[', markerIndex + marker.length - 1);
    let depth = 0;
    for (let i = start; i < source.length; i++) {
        if (source[i] === '[') depth++;
        if (source[i] === ']' && --depth === 0) {
            return vm.runInNewContext(`(${source.slice(start, i + 1)})`);
        }
    }
    throw new Error(`${marker} array is not balanced`);
}

function extractFunction(source, name) {
    const start = source.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `function ${name} must exist`);
    const bodyStart = source.indexOf('{', start);
    let depth = 0;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
    }
    throw new Error(`function ${name} is not balanced`);
}

test('Block Blast hands are deterministic and their seed advances deterministically', () => {
    const shapes = [[[1]], [[1, 1]], [[1], [1]], [[1, 1], [1, 1]]];
    const input = { grid: emptyGrid(), score: 0, shapeList: shapes, baseShapeCount: shapes.length, colors: ['bb-c-1', 'bb-c-2'], seed: 0x12345678 };
    assert.deepEqual(generateHand(input), generateHand(input));
    assert.equal(advanceSeed(0x12345678), advanceSeed(0x12345678));
    assert.notEqual(advanceSeed(0x12345678), 0x12345678);
});

test('Block Blast puts a line-closing shape in the first slot whenever one exists', () => {
    const grid = emptyGrid();
    for (let col = 0; col < 6; col++) grid[0][col] = 1;
    const single = [[1]];
    const horizontalPair = [[1, 1]];
    const hand = generateHand({
        grid,
        score: 0,
        shapeList: [single, horizontalPair],
        baseShapeCount: 2,
        colors: ['bb-c-1'],
        seed: 7,
    });
    assert.deepEqual(hand[0].matrix, horizontalPair);
    assert.equal(bestPlacement(grid, hand[0].matrix).lines, 1);
    for (const shape of hand) assert.equal(bestPlacement(grid, shape.matrix).fits, true);
});

test('Block Blast hard shapes unlock only from 100 million, one kind per 10 million', () => {
    assert.equal(HARD_UNLOCK_START, 100_000_000);
    assert.equal(HARD_UNLOCK_STEP, 10_000_000);
    assert.equal(unlockedHardShapeCount(0, 15), 0);
    assert.equal(unlockedHardShapeCount(99_999_999, 15), 0);
    assert.equal(unlockedHardShapeCount(100_000_000, 15), 1);
    assert.equal(unlockedHardShapeCount(109_999_999, 15), 1);
    assert.equal(unlockedHardShapeCount(110_000_000, 15), 2);
    assert.equal(unlockedHardShapeCount(240_000_000, 15), 15);
    assert.equal(unlockedHardShapeCount(1_000_000_000, 15), 15);

    const base = [[[1]], [[1, 1]], [[1], [1]]];
    const hard = [
        [[1, 0, 1], [1, 1, 1]],
        [[1, 1], [1, 0], [1, 1]],
    ];
    const catalog = base.concat(hard);
    assert.equal(isShapeUnlocked(hard[0], 99_999_999, catalog, base.length), false);
    assert.equal(isShapeUnlocked(hard[0], 100_000_000, catalog, base.length), true);
    assert.equal(isShapeUnlocked(hard[1], 109_999_999, catalog, base.length), false);
    assert.equal(isShapeUnlocked(hard[1], 110_000_000, catalog, base.length), true);

    for (let seed = 0; seed < 500; seed++) {
        const hand = generateHand({
            grid: emptyGrid(),
            score: 99_999_999,
            shapeList: catalog,
            baseShapeCount: base.length,
            colors: ['bb-c-1'],
            seed,
        });
        for (const offered of hand) {
            assert.equal(hard.some(shape => shape === offered.matrix), false,
                `seed ${seed} offered a hard shape before 100 million`);
        }
    }
});

test('legacy Block Blast hands replace early hard shapes without restoring consumed slots', () => {
    const base = [[[1]], [[1, 1]], [[1], [1]]];
    const earlyHard = [[1, 0, 1], [1, 1, 1]];
    const shapes = [null, { matrix: earlyHard, color: 'bb-c-7', id: 1 }, null];
    const result = repairLockedShapes({
        shapes,
        grid: emptyGrid(),
        score: 50_000,
        shapeList: base.concat([earlyHard]),
        baseShapeCount: base.length,
        colors: ['bb-c-1'],
        seed: 123,
    });
    assert.equal(result.repaired, true);
    assert.equal(result.shapes[0], null);
    assert.equal(result.shapes[2], null);
    assert.equal(result.shapes[1].id, 1);
    assert.equal(base.includes(result.shapes[1].matrix), true,
        'a legacy 10,000-point hard shape must be replaced by the original base catalog');
});

test('client and server use the same original 41 shapes and the same 15 hard shapes', () => {
    const root = path.join(__dirname, '..', '..');
    const clientSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const serverSource = fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf8');
    const clientBase = extractArray(clientSource, 'const SHAPES = [');
    const clientHard = extractArray(clientSource, 'const HARD_SHAPES = [');
    const serverCatalog = extractArray(serverSource, 'const SHAPES = [');

    assert.equal(clientBase.length, 41);
    assert.equal(clientHard.length, 15);
    assert.equal(serverCatalog.length, 56);
    assert.deepEqual(JSON.parse(JSON.stringify(serverCatalog.slice(0, 41))), JSON.parse(JSON.stringify(clientBase)));
    assert.deepEqual(JSON.parse(JSON.stringify(serverCatalog.slice(41))), JSON.parse(JSON.stringify(clientHard)));
});

test('client prediction and authoritative server generate identical Block Blast hands', () => {
    const root = path.join(__dirname, '..', '..');
    const clientSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const SHAPES = extractArray(clientSource, 'const SHAPES = [');
    const HARD_SHAPES = extractArray(clientSource, 'const HARD_SHAPES = [');
    const DIAGONAL_SHAPES = extractArray(clientSource, 'const DIAGONAL_SHAPES = [');
    const COLORS = ['bb-c-1', 'bb-c-2', 'bb-c-3', 'bb-c-4', 'bb-c-5', 'bb-c-6', 'bb-c-7'];
    const context = {
        BB_ROWS: 8,
        BB_COLS: 8,
        SHAPES,
        HARD_SHAPES,
        DIAGONAL_SHAPES,
        COLORS,
        HARD_UNLOCK_START,
        HARD_UNLOCK_STEP,
        bbScore: 0,
        bbGrid: emptyGrid(),
        Math,
    };
    vm.createContext(context);
    for (const name of [
        'normalizeBBHandSeed', 'seededBBRandom', 'canPlace', 'isDiagonalShape',
        'bestPlacementResult', 'unlockedHardShapes', 'generateSeededBBHand'
    ]) vm.runInContext(extractFunction(clientSource, name), context);

    const grids = [emptyGrid(), emptyGrid(), emptyGrid()];
    for (let c = 0; c < 6; c++) grids[1][0][c] = 1;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r * 3 + c * 5) % 4 === 0) grids[2][r][c] = 1;
        }
    }
    const catalog = SHAPES.concat(HARD_SHAPES);
    for (const score of [0, 99_999_999, 100_000_000, 130_000_000, 240_000_000]) {
        for (const grid of grids) {
            context.bbGrid = grid;
            context.bbScore = score;
            for (const seed of [0, 1, 7, 0x12345678, 0xffffffff]) {
                const predicted = context.generateSeededBBHand(seed, score);
                const authoritative = generateHand({
                    grid,
                    score,
                    shapeList: catalog,
                    baseShapeCount: SHAPES.length,
                    colors: COLORS,
                    seed,
                });
                assert.deepEqual(
                    JSON.parse(JSON.stringify(predicted)),
                    JSON.parse(JSON.stringify(authoritative)),
                    `client/server hand mismatch at score=${score}, seed=${seed}`
                );
            }
        }
    }
});
