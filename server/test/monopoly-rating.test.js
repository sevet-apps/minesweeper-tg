'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeRating } = require('../monopoly-rating');

function fakeLegacySupabase(seed) {
    const rows = new Map(Object.entries(seed).map(([uid, row]) => [uid, { uid, ...row }]));
    let legacyFallbacks = 0;
    return {
        rows,
        get legacyFallbacks() { return legacyFallbacks; },
        from(table) {
            assert.equal(table, 'monopoly_rating');
            return {
                select() {
                    let uid = '';
                    const query = {
                        eq(field, value) { assert.equal(field, 'uid'); uid = String(value); return query; },
                        async maybeSingle() {
                            await new Promise(resolve => setTimeout(resolve, 2));
                            const row = rows.get(uid);
                            return { data: row ? structuredClone(row) : null, error: null };
                        },
                    };
                    return query;
                },
                async upsert(row) {
                    if (Object.hasOwn(row, 'unfair_count')) {
                        legacyFallbacks++;
                        return { error: { code: 'PGRST204', message: "Column 'unfair_count' was not found" } };
                    }
                    rows.set(String(row.uid), structuredClone(row));
                    return { error: null };
                },
            };
        },
    };
}

test('Monopoly rating preserves points across concurrent matches and old schemas', async () => {
    const db = fakeLegacySupabase({
        winner: { points: 50, games: 0, wins: 0, bankrupted: 0, streak: 0,
            banned: false, checked: 0, history: [] },
        loser: { points: 10, games: 0, wins: 0, bankrupted: 0, streak: 0,
            banned: false, checked: 0, history: [] },
    });
    const rating = makeRating({ supabase: db, log() {} });
    const match = {
        rounds: 20,
        durationMs: 20 * 60 * 1000,
        withBots: false,
        teamMode: false,
        players: [
            { uid: 'winner', name: 'Winner', winner: true, bankruptedCount: 0 },
            { uid: 'loser', name: 'Loser', winner: false, bankruptedCount: 0 },
        ],
    };

    await Promise.all([rating.applyMatch(match), rating.applyMatch(match)]);

    const winner = await rating.get('winner');
    const loser = await rating.get('loser');
    assert.equal(winner.points, 62, 'both six-point wins must be retained');
    assert.equal(winner.games, 2);
    assert.equal(winner.wins, 2);
    assert.equal(loser.points, 10);
    assert.equal(loser.games, 2);
    assert.ok(db.legacyFallbacks >= 4, 'every rejected new-schema write must retry without the missing column');
    assert.equal(db.rows.get('winner').points, 62, 'the durable row must contain the final accumulated score');
});

test('Monopoly rating migrates live-room tg ids to the shared profile id', async () => {
    const db = fakeLegacySupabase({
        tg42: { points: 21, games: 3, wins: 2, bankrupted: 1, streak: 1,
            banned: false, checked: 0, history: [] },
    });
    const rating = makeRating({ supabase: db, log() {} });
    const player = await rating.get('tg42');
    assert.equal(player.uid, '42');
    assert.equal(player.points, 21);

    await rating.setBanned('tg42', false);
    assert.equal(db.rows.get('42').points, 21, 'the next write must use the canonical profile id');
});
