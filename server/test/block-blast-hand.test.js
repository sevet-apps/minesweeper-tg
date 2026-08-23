'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { advanceSeed, bestPlacement, generateHand } = require('../block-blast-hand');

const emptyGrid = () => Array.from({ length: 8 }, () => Array(8).fill(0));

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
