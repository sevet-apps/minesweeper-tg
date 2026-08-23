'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../monopoly-v2');

function bankruptcyGame() {
    const game = new Game('bankruptcy-test', {});
    game.players = {
        debtor: { id: 'debtor', name: 'Debtor', alive: true, money: 2150 },
        creditor: { id: 'creditor', name: 'Creditor', alive: true, money: 1000 },
        third: { id: 'third', name: 'Third', alive: true, money: 1000 },
    };
    game.order = ['debtor', 'creditor', 'third'];
    game.turnIdx = 1;
    game.phase = 'await-pay';
    game.send = () => {};
    game.pushState = () => {};
    game.checkWin = () => false;
    return game;
}

test('bankruptcy pays no more than the outstanding debt to the creditor', () => {
    const game = bankruptcyGame();

    game.eliminate('debtor', 'creditor', 260);

    assert.equal(game.players.creditor.money, 1260);
    assert.equal(game.players.debtor.money, 0);
    assert.equal(game.players.debtor.alive, false);
});

test('inactive draw is terminal and cannot appear as a resumable game', () => {
    const game = bankruptcyGame();
    game.phase = 'await-roll';
    game.send = (event, payload) => {
        if (event === 'm2:ended') game.endedPayload = payload;
    };

    assert.equal(game.endInactiveDraw(), true);
    assert.equal(game.phase, 'ended');
    assert.deepEqual(game.endedPayload, {
        winner: null, winners: [], draw: true, reason: 'inactive',
    });
    assert.equal(game.endInactiveDraw(), false);
});
