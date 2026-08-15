'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../monopoly-v2');

function gameForTrade() {
    const game = new Game('trade-test', {});
    game.players = {
        from: { id: 'from', alive: true, money: 5000 },
        to: { id: 'to', alive: true, money: 5000 },
    };
    game.order = ['from', 'to'];
    game.turnIdx = 0;
    game.phase = 'await-roll';
    return game;
}

test('Monopoly contracts accept only non-negative integer cash amounts', () => {
    const game = gameForTrade();
    const deal = (giveMoney, takeMoney = 0) => ({
        giveTiles: [], takeTiles: [], giveMoney, takeMoney,
    });

    assert.equal(game.validTrade('from', 'to', deal(1250)), true);
    assert.equal(game.validTrade('from', 'to', deal(12.5)), false);
    assert.equal(game.validTrade('from', 'to', deal('1250')), false);
    assert.equal(game.validTrade('from', 'to', deal(-1)), false);
    assert.equal(game.validTrade('from', 'to', deal(Number.MAX_SAFE_INTEGER + 1)), false);
});
