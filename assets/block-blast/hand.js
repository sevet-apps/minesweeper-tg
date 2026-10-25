/* Block Blast hand generator, shared by the server (require) and the client (<script>), so the hand the
   client predicts is always the one the server signs. Deterministic for a given grid, score and seed. */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.BBHand = api;
    else if (root && !root.BBHand) root.BBHand = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const ROWS = 8;
    const COLS = 8;
    const HARD_UNLOCK_START = 100_000_000;
    const HARD_UNLOCK_STEP = 10_000_000;
    // All-clear assist: offered on nearly empty boards, never twice in a row.
    const ASSIST_MAX_FILLED = 16;
    const ASSIST_RATE = 0.4;
    const ASSIST_NODE_LIMIT = 40000;
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

    // The seed for the next hand carries one bit of history: whether this hand was an assist hand.
    // It travels everywhere the seed already does (session, signed checkpoint, client state).
    function nextSeed(seed, hand) {
        return ((advanceSeed(seed) & ~1) | (hand && hand.assist ? 1 : 0)) >>> 0;
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

    // Plays placements with the real rules: every full row and column clears the moment it is full,
    // so a crossing cell can drop out of a line that is not finished yet. Returns the final grid, or null.
    function simulateClears(grid, placements) {
        const board = grid.map(row => row.map(value => (value ? 1 : 0)));
        for (const { matrix, r, c } of placements) {
            if (!canPlace(board, matrix, r, c)) return null;
            matrix.forEach((line, i) => line.forEach((value, j) => { if (value === 1) board[r + i][c + j] = 1; }));
            const rows = [], cols = [];
            for (let row = 0; row < ROWS; row++) if (board[row].every(Boolean)) rows.push(row);
            for (let col = 0; col < COLS; col++) if (board.every(line => line[col])) cols.push(col);
            rows.forEach(row => board[row].fill(0));
            cols.forEach(col => board.forEach(line => { line[col] = 0; }));
        }
        return board;
    }

    function permutations(items) {
        if (items.length <= 1) return [items];
        const out = [];
        items.forEach((item, index) => {
            for (const rest of permutations(items.filter((_, other) => other !== index))) out.push([item, ...rest]);
        });
        return out;
    }

    // Looks for at most three pieces from `pool` (and placements) that leave the board empty.
    // 1. choose rows/columns that cover every filled cell; 2. tile the empty cells of those lines exactly,
    // backtracking from the first empty cell; 3. confirm with the real clear rules in some order.
    function findClearingHand(grid, pool, random) {
        const filled = [];
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c]) filled.push([r, c]);
        if (!filled.length || filled.length > ASSIST_MAX_FILLED || !pool.length) return null;
        const shapes = pool.map(matrix => {
            const cells = [];
            matrix.forEach((line, r) => line.forEach((value, c) => { if (value === 1) cells.push([r, c]); }));
            return { matrix, cells };
        });
        const maxArea = Math.max(...shapes.map(shape => shape.cells.length));
        const filledRows = [...new Set(filled.map(([r]) => r))];
        const candidates = [];
        for (let mask = 0; mask < (1 << filledRows.length); mask++) {
            const rows = filledRows.filter((_, i) => mask & (1 << i));
            const cols = [...new Set(filled.filter(([r]) => !rows.includes(r)).map(([, c]) => c))].sort((a, b) => a - b);
            const target = new Set();
            for (const r of rows) for (let c = 0; c < COLS; c++) if (!grid[r][c]) target.add(r * COLS + c);
            for (const c of cols) for (let r = 0; r < ROWS; r++) if (!grid[r][c]) target.add(r * COLS + c);
            if (!target.size || target.size > maxArea * 3) continue;
            candidates.push({ rows, cols, target, tie: random() });
        }
        // Fewest cells first; equal options keep a seeded order, so assist hands vary between games.
        candidates.sort((a, b) => a.target.size - b.target.size || a.tie - b.tie);
        const order = shapes.map(shape => ({ shape, key: random() })).sort((a, b) => a.key - b.key).map(item => item.shape);
        let nodes = 0;
        for (const candidate of candidates) {
            const remaining = new Set(candidate.target);
            const chosen = [];
            const solve = () => {
                if (++nodes > ASSIST_NODE_LIMIT) return false;
                if (!remaining.size) return true;
                if (chosen.length === 3 || remaining.size > maxArea * (3 - chosen.length)) return false;
                // Every cell before `first` is covered, so a piece covering it must start there.
                const first = Math.min(...remaining), fr = Math.floor(first / COLS), fc = first % COLS;
                for (const shape of order) {
                    const r0 = fr - shape.cells[0][0], c0 = fc - shape.cells[0][1], keys = [];
                    let fits = true;
                    for (const [dr, dc] of shape.cells) {
                        const r = r0 + dr, c = c0 + dc, key = r * COLS + c;
                        if (r < 0 || r >= ROWS || c < 0 || c >= COLS || !remaining.has(key)) { fits = false; break; }
                        keys.push(key);
                    }
                    if (!fits) continue;
                    keys.forEach(key => remaining.delete(key));
                    chosen.push({ matrix: shape.matrix, r: r0, c: c0 });
                    if (solve()) return true;
                    chosen.pop();
                    keys.forEach(key => remaining.add(key));
                }
                return false;
            };
            if (!solve()) {
                if (nodes > ASSIST_NODE_LIMIT) return null;
                continue;
            }
            for (const placements of permutations(chosen)) {
                const end = simulateClears(grid, placements);
                if (end && end.every(line => line.every(value => !value))) return { pieces: placements, rows: candidate.rows, cols: candidate.cols };
            }
        }
        return null;
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

        const hand = matrices.map((matrix, id) => ({
            matrix,
            color: colors[Math.floor(random() * colors.length)],
            id,
        }));

        // All-clear assist: on a nearly empty board, sometimes deal pieces that can empty it. There is
        // no hint; the player still has to find where and in which order to place them.
        const filledCount = grid.reduce((n, line) => n + line.filter(Boolean).length, 0);
        const previousWasAssist = (normalizeSeed(seed) & 1) === 1;
        if (filledCount > 0 && filledCount <= ASSIST_MAX_FILLED && !previousWasAssist && random() < ASSIST_RATE) {
            const found = findClearingHand(grid, pool, random);
            if (found) {
                const slots = [0, 1, 2].map(slot => ({ slot, key: random() })).sort((a, b) => a.key - b.key).map(item => item.slot);
                found.pieces.forEach(({ matrix }, index) => {
                    const slot = slots[index];
                    hand[slot] = { matrix, color: hand[slot].color, id: slot };
                });
                Object.defineProperty(hand, 'assist', { value: true, enumerable: false });
            }
        }
        return hand;
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

    return {
        ASSIST_MAX_FILLED,
        ASSIST_RATE,
        HARD_UNLOCK_START,
        HARD_UNLOCK_STEP,
        advanceSeed,
        bestPlacement,
        canPlace,
        findClearingHand,
        generateHand,
        isShapeUnlocked,
        nextSeed,
        normalizeSeed,
        repairLockedShapes,
        seededRandom,
        simulateClears,
        unlockedHardShapeCount,
    };
});
