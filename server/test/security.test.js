'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { verifyTelegramInitData, socketIdentity } = require('../telegram-init-data');
const { createCheckpoint, readCheckpoint } = require('../block-blast-checkpoint');

function signedInitData(user, botToken, authDate) {
    const params = new URLSearchParams({
        auth_date: String(authDate),
        query_id: 'test-query',
        user: JSON.stringify(user),
    });
    const check = Array.from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    params.set('hash', crypto.createHmac('sha256', secret).update(check).digest('hex'));
    return params.toString();
}

test('Telegram identity is derived from signed initData', () => {
    const now = 1_800_000_000;
    const token = '123:test-token';
    const initData = signedInitData({ id: 42, first_name: 'Alice' }, token, now);
    assert.equal(verifyTelegramInitData(initData, token, { nowSeconds: now }).id, 42);
    assert.deepEqual(
        socketIdentity(initData, token, 'socket-1', { nowSeconds: now }),
        { uid: 'tg42', user: { id: 42, first_name: 'Alice' }, authenticated: true }
    );
});

test('tampered and expired Telegram initData are rejected', () => {
    const now = 1_800_000_000;
    const token = '123:test-token';
    const valid = signedInitData({ id: 42 }, token, now);
    assert.equal(verifyTelegramInitData(valid.replace('%3A42', '%3A43'), token, { nowSeconds: now }), null);
    const expired = signedInitData({ id: 42 }, token, now - 86_401);
    assert.equal(verifyTelegramInitData(expired, token, { nowSeconds: now }), null);
    assert.deepEqual(socketIdentity('', token, 'socket-1'), {
        uid: 'guest:socket-1', user: null, authenticated: false
    });
});

test('Block Blast checkpoint restores only server-signed state', () => {
    const now = 1_800_000_000_000;
    const secret = 'checkpoint-secret';
    const session = {
        bbGrid: Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => r === c ? 1 : 0)),
        bbScore: 1234,
        bbCombo: 4,
        bbComboBuffer: 2,
        bbRevision: 17,
        bbShapes: [
            { matrix: [[1, 1]], color: 'bb-c-2', id: 0 },
            null,
            { matrix: [[1], [1]], color: 'bb-c-5', id: 2 },
        ],
        bbNextHandSeed: 0x12345678,
        bbMaxCombo: 37,
        bbMaxLines: 6,
        bbCleanBoard: true,
        moveCount: 17,
        startTime: now - 60_000,
    };
    const checkpoint = createCheckpoint(session, '42', secret, now);
    const restored = readCheckpoint(checkpoint, '42', secret, now + 1000);
    assert.equal(restored.bbScore, 1234);
    assert.equal(restored.moveCount, 17);
    assert.equal(restored.startTime, session.startTime);
    assert.equal(restored.bbRevision, 17);
    assert.deepEqual(restored.bbShapes, session.bbShapes);
    assert.equal(restored.bbNextHandSeed, session.bbNextHandSeed);
    assert.equal(restored.bbMaxCombo, session.bbMaxCombo);
    assert.equal(restored.bbMaxLines, session.bbMaxLines);
    assert.equal(restored.bbCleanBoard, session.bbCleanBoard);
    assert.deepEqual(restored.bbGrid, session.bbGrid);
    assert.equal(readCheckpoint(checkpoint, '43', secret, now + 1000), null);
});

test('Block Blast checkpoint rejects score injection, bad signature and expiry', () => {
    const now = 1_800_000_000_000;
    const secret = 'checkpoint-secret';
    const session = {
        bbGrid: Array.from({ length: 8 }, () => Array(8).fill(0)),
        bbScore: 50,
        bbCombo: 0,
        bbComboBuffer: 0,
        bbRevision: 3,
        bbShapes: [
            { matrix: [[1]], color: 'bb-c-1', id: 0 },
            { matrix: [[1, 1]], color: 'bb-c-2', id: 1 },
            { matrix: [[1], [1]], color: 'bb-c-3', id: 2 },
        ],
        bbNextHandSeed: 123,
        moveCount: 3,
    };
    const checkpoint = createCheckpoint(session, '42', secret, now);
    const [body, signature] = checkpoint.split('.');
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    payload.s = 999_999_999;
    const tamperedBody = Buffer.from(JSON.stringify(payload)).toString('base64url');
    assert.equal(readCheckpoint(`${tamperedBody}.${signature}`, '42', secret, now), null);
    const badSignature = `${body}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
    assert.equal(readCheckpoint(badSignature, '42', secret, now), null);
    assert.equal(readCheckpoint(checkpoint, '42', secret, now + 24 * 60 * 60 * 1000 + 1), null);
});
