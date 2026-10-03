'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { botLang, botText, botGameName, botAliases } = require('../bot-copy');

const locales = ['es', 'pt', 'id', 'fr', 'ja', 'de', 'ko', 'tr', 'vi'];
const gameColumns = {
    bb_best_score: 'blockBlast',
    saper_wins: 'minesweeper',
    tower_best: 'tower',
    sudoku_wins: 'sudoku',
    checkers_wins_pve: 'checkers',
    wordle_wins: 'wordle',
};
const normalize = value => String(value).normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

test('every advertised localized bot command remains searchable', () => {
    for (const lang of locales) {
        const pack = require(path.join(__dirname, '..', '..', 'locales', `${lang}.json`));
        for (const [label, kind] of [['ticTacToe', 'ttt'], ['checkers', 'checkers']]) {
            assert.ok(botAliases(lang, kind).some(alias => normalize(alias) === normalize(pack.botStart[label])),
                `${lang}: ${pack.botStart[label]} must find the ${kind} inline game`);
        }
        for (const [column, label] of Object.entries(gameColumns)) {
            assert.ok(botAliases(lang, column).some(alias => normalize(alias) === normalize(pack.app[label])),
                `${lang}: ${pack.app[label]} must find ${column} via /top`);
        }
    }
});

test('bot messages use the requested language and fill dynamic values', () => {
    assert.equal(botLang('pt-BR'), 'pt');
    assert.equal(botLang('in-ID'), 'id');
    assert.equal(botLang('unknown'), 'en');
    assert.equal(botGameName('es', 'saper_wins'), 'Buscaminas');
    assert.match(botText('ja', 'inviteTtt', { name: 'Akira' }), /Akira/);
    assert.doesNotMatch(botText('ja', 'inviteTtt', { name: 'Akira' }), /\{name\}/);
    assert.match(botText('de', 'displacedRank', { game: 'Minesweeper', oldRank: 2, newRank: 3 }), /Minesweeper/);
});
