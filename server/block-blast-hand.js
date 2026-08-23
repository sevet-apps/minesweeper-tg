'use strict';

const ROWS = 8;
const COLS = 8;
const HARD_UNLOCK_START = 100_000_000;
const HARD_UNLOCK_STEP = 10_000_000;
const DIAGONAL_SIGNATURES = new Set([
    '[[0,1],[1,0]]',
    '[[1,0],[0,1]]',
    '[[0,0,1],[0,1,0],[1,0,0]]',
    '[[1,0,0],[0,1,0],[0,0,1]]',
]);

function normalizeSeed(seed) {
    return Number.isInteger(seed) ? seed >>> 0 : 0;
}

function advanceSeed(seed) {
    let value = (normalizeSeed(seed) + 0x9e3779b9) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
    value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
    return (value ^ (value >>> 15)) >>> 0;
}

function seededRandom(seed) {
    let state = normalizeSeed(seed);
    return function random() {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function unlockedHardShapeCount(score, hardShapeCount) {
    const count = Math.max(0, Number(hardShapeCount) || 0);
    const points = Number(score) || 0;
    if (points < HARD_UNLOCK_START) return 0;
    return Math.min(count, 1 + Math.floor((points - HARD_UNLOCK_START) / HARD_UNLOCK_STEP));
}

function isShapeUnlocked(matrix, score, shapeList, baseShapeCount = 41) {
    if (!Array.isArray(shapeList)) return false;
    const signature = JSON.stringify(matrix);
    const index = shapeList.findIndex(shape => JSON.stringify(shape) === signature);
    if (index < 0) return false;
    const baseCount = Math.max(0, Math.min(shapeList.length, Number(baseShapeCount) || 0));
    if (index < baseCount) return true;
    return index < baseCount + unlockedHardShapeCount(score, shapeList.length - baseCount);
}

function canPlace(grid, matrix, row, col) {
    for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
            if (matrix[r][c] !== 1) continue;
            const boardRow = row + r;
            const boardCol = col + c;
            if (boardRow < 0 || boardRow >= ROWS || boardCol < 0 || boardCol >= COLS || grid[boardRow][boardCol] !== 0) {
                return false;
            }
        }
    }
    return true;
}

function bestPlacement(grid, matrix) {
    let bestLines = -1;
    const height = matrix.length;
    const width = matrix[0]?.length || 0;
    for (let row = 0; row <= ROWS - height; row++) {
        for (let col = 0; col <= COLS - width; col++) {
            if (!canPlace(grid, matrix, row, col)) continue;
            const touchedRows = new Set();
            const touchedCols = new Set();
            for (let r = 0; r < height; r++) {
                for (let c = 0; c < width; c++) {
                    if (matrix[r][c] === 1) {
                        touchedRows.add(row + r);
                        touchedCols.add(col + c);
                    }
                }
            }
            let lines = 0;
            for (const boardRow of touchedRows) {
                let full = true;
                for (let boardCol = 0; boardCol < COLS; boardCol++) {
                    const placed = boardRow >= row && boardRow < row + height
                        && boardCol >= col && boardCol < col + width
                        && matrix[boardRow - row][boardCol - col] === 1;
                    if (grid[boardRow][boardCol] === 0 && !placed) { full = false; break; }
                }
                if (full) lines++;
            }
            for (const boardCol of touchedCols) {
                let full = true;
                for (let boardRow = 0; boardRow < ROWS; boardRow++) {
                    const placed = boardRow >= row && boardRow < row + height
                        && boardCol >= col && boardCol < col + width
                        && matrix[boardRow - row][boardCol - col] === 1;
                    if (grid[boardRow][boardCol] === 0 && !placed) { full = false; break; }
                }
                if (full) lines++;
            }
            bestLines = Math.max(bestLines, lines);
        }
    }
    return { fits: bestLines >= 0, lines: Math.max(0, bestLines) };
}

function generateHand({ grid, score = 0, shapeList, baseShapeCount = 41, colors, seed }) {
    if (!Array.isArray(shapeList) || shapeList.length === 0) throw new Error('Block Blast shape list is empty');
    if (!Array.isArray(colors) || colors.length === 0) throw new Error('Block Blast color list is empty');
    const random = seededRandom(seed);
    const baseShapes = shapeList.slice(0, baseShapeCount);
    const hardShapes = shapeList.slice(baseShapeCount);
    const hardKinds = unlockedHardShapeCount(score, hardShapes.length);
    const includeDiagonals = random() < 0.35;
    const pool = baseShapes.filter(matrix => includeDiagonals || !DIAGONAL_SIGNATURES.has(JSON.stringify(matrix)))
        .concat(hardShapes.slice(0, hardKinds));
    const ranked = pool.map(matrix => ({ matrix, ...bestPlacement(grid, matrix) }));
    const placeable = ranked.filter(item => item.fits);
    const lineClearers = placeable.filter(item => item.lines >= 1);
    const multiClearers = placeable.filter(item => item.lines >= 2);
    const fallback = shapeList[0];
    const pick = items => items.length ? items[Math.floor(random() * items.length)].matrix : fallback;
    const matrices = [];

    matrices.push(pick(multiClearers.length ? multiClearers : (lineClearers.length ? lineClearers : placeable)));
    let second = (lineClearers.length ? lineClearers : placeable).filter(item => item.matrix !== matrices[0]);
    if (!second.length) second = lineClearers.length ? lineClearers : placeable;
    matrices.push(pick(second));
    let third = placeable.filter(item => item.matrix !== matrices[0] && item.matrix !== matrices[1]);
    if (!third.length) third = placeable;
    matrices.push(pick(third));

    return matrices.map((matrix, id) => ({
        matrix,
        color: colors[Math.floor(random() * colors.length)],
        id,
    }));
}

function repairLockedShapes({ shapes, grid, score = 0, shapeList, baseShapeCount = 41, colors, seed }) {
    if (!Array.isArray(shapes) || shapes.length !== 3) return { repaired: false, shapes };
    const invalidSlots = [];
    shapes.forEach((shape, slot) => {
        if (shape && !isShapeUnlocked(shape.matrix, score, shapeList, baseShapeCount)) invalidSlots.push(slot);
    });
    if (!invalidSlots.length) return { repaired: false, shapes };

    const replacements = generateHand({ grid, score, shapeList, baseShapeCount, colors, seed });
    const repairedShapes = shapes.slice();
    for (const slot of invalidSlots) repairedShapes[slot] = { ...replacements[slot], id: slot };
    return { repaired: true, shapes: repairedShapes };
}

module.exports = {
    HARD_UNLOCK_START,
    HARD_UNLOCK_STEP,
    advanceSeed,
    bestPlacement,
    canPlace,
    generateHand,
    isShapeUnlocked,
    normalizeSeed,
    repairLockedShapes,
    seededRandom,
    unlockedHardShapeCount,
};
