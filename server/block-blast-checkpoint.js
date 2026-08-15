'use strict';

const crypto = require('crypto');

const VERSION = 1;
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
    if (!payload || payload.v !== VERSION || payload.u !== String(userId) || !grid) return null;
    if (!Number.isInteger(payload.s) || payload.s < 0 || payload.s > 1_500_000_000) return null;
    if (!Number.isInteger(payload.c) || payload.c < 0 || payload.c > 1_000_000) return null;
    if (!Number.isInteger(payload.b) || payload.b < 0 || payload.b > 3) return null;
    if (!Number.isInteger(payload.m) || payload.m < 0 || payload.m > 1_000_000) return null;
    if (!Number.isFinite(payload.t) || payload.t > now + MAX_FUTURE_SKEW_MS || now - payload.t > MAX_AGE_MS) return null;

    return {
        bbGrid: grid,
        bbScore: payload.s,
        bbCombo: payload.c,
        bbComboBuffer: payload.b,
        moveCount: payload.m,
        issuedAt: payload.t,
    };
}

module.exports = { createCheckpoint, readCheckpoint, encodeGrid, decodeGrid };
