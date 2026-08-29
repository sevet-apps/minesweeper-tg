'use strict';

const crypto = require('crypto');

const VERSION = 4;
const ROWS = 8;
const COLS = 8;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 30 * 1000;

function signingKey(secret) {
    if (!secret) return null;
    return crypto.createHmac('sha256', String(secret)).update('spark-bb-checkpoint-v1').digest();
}

function encodeGrid(grid) {
    if (!Array.isArray(grid) || grid.length !== ROWS) throw new Error('Invalid BB grid');
    return grid.map(row => {
        if (!Array.isArray(row) || row.length !== COLS) throw new Error('Invalid BB grid');
        return row.map(cell => cell === 0 ? '0' : '1').join('');
    });
}

function decodeGrid(rows) {
    if (!Array.isArray(rows) || rows.length !== ROWS) return null;
    const grid = [];
    for (const row of rows) {
        if (typeof row !== 'string' || !/^[01]{8}$/.test(row)) return null;
        grid.push([...row].map(cell => cell === '1' ? 1 : 0));
    }
    return grid;
}

function encodeShapes(shapes) {
    if (!Array.isArray(shapes) || shapes.length !== 3) throw new Error('Invalid BB shapes');
    return shapes.map(shape => {
        if (shape === null) return null;
        const matrix = shape && shape.matrix;
        if (!Array.isArray(matrix) || matrix.length < 1 || matrix.length > 5) throw new Error('Invalid BB shape');
        const width = Array.isArray(matrix[0]) ? matrix[0].length : 0;
        if (width < 1 || width > 5 || !matrix.every(row => Array.isArray(row) && row.length === width && row.every(v => v === 0 || v === 1))) {
            throw new Error('Invalid BB shape');
        }
        const color = typeof shape.color === 'string' && /^bb-c-[1-7]$/.test(shape.color) ? shape.color : 'bb-c-1';
        return { m: matrix, c: color };
    });
}

function decodeShapes(shapes) {
    if (!Array.isArray(shapes) || shapes.length !== 3) return null;
    const decoded = [];
    for (let i = 0; i < shapes.length; i++) {
        const shape = shapes[i];
        if (shape === null) { decoded.push(null); continue; }
        const matrix = shape && shape.m;
        if (!Array.isArray(matrix) || matrix.length < 1 || matrix.length > 5) return null;
        const width = Array.isArray(matrix[0]) ? matrix[0].length : 0;
        if (width < 1 || width > 5 || !matrix.every(row => Array.isArray(row) && row.length === width && row.every(v => v === 0 || v === 1))) return null;
        if (typeof shape.c !== 'string' || !/^bb-c-[1-7]$/.test(shape.c)) return null;
        decoded.push({ matrix, color: shape.c, id: i });
    }
    return decoded;
}

function createCheckpoint(session, userId, secret, now = Date.now()) {
    const key = signingKey(secret);
    if (!key) return null;
    const payload = {
        v: VERSION,
        u: String(userId),
        g: encodeGrid(session.bbGrid),
        s: session.bbScore,
        c: session.bbCombo,
        b: session.bbComboBuffer,
        m: session.moveCount,
        r: session.bbRevision || 0,
        h: encodeShapes(session.bbShapes || [null, null, null]),
        n: session.bbNextHandSeed >>> 0,
        x: session.bbMaxCombo || 0,
        l: session.bbMaxLines || 0,
        q: !!session.bbCleanBoard,
        a: session.startTime,
        t: now,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', key).update(body).digest('base64url');
    return `${body}.${signature}`;
}

function readCheckpoint(checkpoint, userId, secret, now = Date.now()) {
    const key = signingKey(secret);
    if (!key || typeof checkpoint !== 'string' || checkpoint.length > 4096) return null;
    const parts = checkpoint.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

    const expected = crypto.createHmac('sha256', key).update(parts[0]).digest();
    let supplied;
    try { supplied = Buffer.from(parts[1], 'base64url'); } catch (_) { return null; }
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;

    let payload;
    try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch (_) { return null; }
    const grid = decodeGrid(payload && payload.g);
    if (!payload || ![1, 2, 3, VERSION].includes(payload.v) || payload.u !== String(userId) || !grid) return null;
    if (!Number.isInteger(payload.s) || payload.s < 0 || payload.s > 1_500_000_000) return null;
    if (!Number.isInteger(payload.c) || payload.c < 0 || payload.c > 1_000_000) return null;
    if (!Number.isInteger(payload.b) || payload.b < 0 || payload.b > 3) return null;
    if (!Number.isInteger(payload.m) || payload.m < 0 || payload.m > 1_000_000) return null;
    const revision = payload.v === 1 ? payload.m : payload.r;
    if (!Number.isInteger(revision) || revision < 0 || revision > 1_000_000) return null;
    const shapes = payload.v === 1 ? null : decodeShapes(payload.h);
    if (payload.v >= 2 && !shapes) return null;
    const nextHandSeed = payload.v >= 3 ? payload.n : null;
    if (payload.v >= 3 && (!Number.isInteger(nextHandSeed) || nextHandSeed < 0 || nextHandSeed > 0xffffffff)) return null;
    const maxCombo = payload.v >= 4 ? payload.x : payload.c;
    const maxLines = payload.v >= 4 ? payload.l : 0;
    const cleanBoard = payload.v >= 4 ? payload.q : false;
    if (!Number.isInteger(maxCombo) || maxCombo < 0 || maxCombo > 1_000_000) return null;
    if (!Number.isInteger(maxLines) || maxLines < 0 || maxLines > 16) return null;
    if (typeof cleanBoard !== 'boolean') return null;
    if (!Number.isFinite(payload.t) || payload.t > now + MAX_FUTURE_SKEW_MS || now - payload.t > MAX_AGE_MS) return null;
    const startTime = Number.isFinite(payload.a)
        && payload.a <= payload.t
        && payload.a <= now + MAX_FUTURE_SKEW_MS
        && now - payload.a <= MAX_AGE_MS
        ? payload.a
        : Math.max(0, payload.t - 5000);

    return {
        bbGrid: grid,
        bbScore: payload.s,
        bbCombo: payload.c,
        bbComboBuffer: payload.b,
        moveCount: payload.m,
        bbRevision: revision,
        bbShapes: shapes,
        bbNextHandSeed: nextHandSeed,
        bbMaxCombo: maxCombo,
        bbMaxLines: maxLines,
        bbCleanBoard: cleanBoard,
        startTime,
        issuedAt: payload.t,
    };
}

module.exports = { createCheckpoint, readCheckpoint, encodeGrid, decodeGrid, encodeShapes, decodeShapes };
