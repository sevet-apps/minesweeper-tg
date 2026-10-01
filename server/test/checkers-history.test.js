'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
const historyHandlers = source.slice(
    source.indexOf('function canUseCheckersHistory()'),
    source.indexOf('function renderBoardFromHistory(')
);

function makeHistoryGame() {
    const elements = new Map(['checkersHistoryControls', 'historyPrev', 'historyNext', 'historyIndicator']
        .map(id => [id, { style: {}, disabled: false, innerText: '' }]));
    const rendered = [];
    const context = vm.createContext({
        document: { getElementById: id => elements.get(id) },
        renderBoardFromHistory: state => rendered.push(state),
        tg: { HapticFeedback: { selectionChanged() {} } },
        vibrationEnabled: false,
        forcedPiece: null,
        isOnlineGame: false,
        onlineMyColor: 'white',
        isPvE: true,
        turn: 'black',
        checkersAiPending: false,
        moveHistory: [{ board: 'before' }, { board: 'after' }],
        historyIndex: 1,
        isViewingHistory: false
    });
    vm.runInContext(historyHandlers, context);
    return { context, elements, rendered };
}

test('checkers history stays locked from the bot delay through its calculation', () => {
    const { context, elements, rendered } = makeHistoryGame();
    for (const pending of [false, true]) {
        context.checkersAiPending = pending;
        context.updateHistoryButtons();
        assert.equal(elements.get('historyPrev').disabled, true);
        assert.equal(elements.get('checkersHistoryControls').style.pointerEvents, 'none');
        context.historyStep(-1); // A stale queued click must not bypass disabled controls.
        assert.equal(context.historyIndex, 1);
        assert.equal(context.isViewingHistory, false);
        assert.equal(rendered.length, 0);
    }
});

test('checkers history opens again on the human turn and still works for local two-player games', () => {
    const { context, elements, rendered } = makeHistoryGame();
    context.turn = 'white';
    context.checkersAiPending = false;
    context.updateHistoryButtons();
    assert.equal(elements.get('historyPrev').disabled, false);
    context.historyStep(-1);
    assert.equal(context.historyIndex, 0);
    assert.equal(context.isViewingHistory, true);
    assert.equal(rendered[0].board, 'before');

    context.isPvE = false;
    context.turn = 'black';
    context.historyStep(1);
    assert.equal(context.historyIndex, 1);
    assert.equal(context.isViewingHistory, false);
    assert.equal(rendered[1].board, 'after');
});

test('online history follows the local color even if a prior bot setting is retained', () => {
    const { context, elements } = makeHistoryGame();
    context.isOnlineGame = true;
    context.onlineMyColor = 'black';
    context.turn = 'black';
    context.updateHistoryButtons();
    assert.equal(elements.get('historyPrev').disabled, false);
    context.turn = 'white';
    context.updateHistoryButtons();
    assert.equal(elements.get('historyPrev').disabled, true);
});
