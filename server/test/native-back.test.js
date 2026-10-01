'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createNativeBackRouter } = require('../../assets/ui/native-back.js');

function node(classes = [], id = '') {
    const children = new Map();
    return {
        id, style: { visibility: '', zIndex: '' }, classList: { contains: value => classes.includes(value) },
        querySelector: selector => children.get(selector) || null,
        querySelectorAll: selector => children.get(selector) || [],
        set(selector, child) { children.set(selector, child); return this; },
        clicks: 0, click() { this.clicks++; }
    };
}

function fixture() {
    const modeBack = node();
    const mode = node(['screen', 'active']).set('.back-btn', modeBack);
    mode.style.zIndex = '220';
    const gameBack = node();
    const game = node(['game-overlay', 'visible'], 'bb-screen').set('.back-btn', gameBack);
    const iframe = node([], 'monopoly-game');
    const elements = { 'monopoly-game': iframe, bbSpectatorOverlay: node() };
    const doc = {
        getElementById: id => elements[id] || null,
        querySelectorAll(selector) {
            if (selector === '.game-overlay.visible') return game.classList.contains('visible') ? [game] : [];
            if (selector === '.screen.active') return [mode];
            if (selector === '.screen,.game-overlay,.bb-spectator-overlay,.mono-screen') return [mode, game, iframe];
            return [];
        },
        querySelector: () => null
    };
    const button = { shows: 0, hides: 0, handler: null,
        onClick(fn) { this.handler = fn; }, offClick(fn) { if (this.handler === fn) this.handler = null; },
        show() { this.shows++; }, hide() { this.hides++; } };
    return { doc, button, modeBack, gameBack, game, iframe };
}

test('native BackButton follows the top game and restores its DOM fallback', () => {
    const f = fixture();
    const router = createNativeBackRouter(f.doc, f.button, () => {});
    router.start();
    assert.equal(f.gameBack.style.visibility, 'hidden');
    assert.equal(f.modeBack.style.visibility, '');
    f.button.handler();
    assert.equal(f.gameBack.clicks, 1);
    f.game.classList.contains = value => value === 'game-overlay';
    router.sync();
    assert.equal(f.gameBack.style.visibility, '');
    assert.equal(f.modeBack.style.visibility, 'hidden');
    f.button.handler();
    assert.equal(f.modeBack.clicks, 1);
    router.stop();
    assert.equal(f.modeBack.style.visibility, '');
    assert.equal(f.button.handler, null);
});

test('Monopoly iframe has sole priority; a sheet closes before its underlying game', () => {
    const f = fixture();
    let monopolyClicks = 0;
    let sheetCloses = 0;
    const router = createNativeBackRouter(f.doc, f.button,
        () => monopolyClicks++, () => { sheetCloses++; return true; });
    router.start();
    f.button.handler();
    assert.equal(sheetCloses, 1);
    assert.equal(f.gameBack.clicks, 0);
    f.iframe.classList.contains = value => value === 'visible';
    router.setMonopolyBackButton(true);
    assert.equal(f.gameBack.style.visibility, '');
    const iframeRouter = createNativeBackRouter(f.doc, f.button, () => monopolyClicks++);
    router.stop();
    iframeRouter.start();
    iframeRouter.setMonopolyBackButton(true);
    f.button.handler();
    assert.equal(monopolyClicks, 1);
    iframeRouter.setMonopolyBackButton(false);
    assert.ok(f.button.hides >= 1);
    iframeRouter.stop();
});

test('without Telegram BackButton the on-screen back control remains usable', () => {
    const f = fixture();
    const router = createNativeBackRouter(f.doc, null, () => {});
    router.start();
    assert.equal(f.gameBack.style.visibility, '');
    router.stop();
});

test('an open confirmation dialog consumes Back without leaving the game', () => {
    const f = fixture();
    const cancel = node();
    const dialog = node(['modal-overlay', 'visible'])
        .set('.ui-close, [data-i18n="cancel"]', cancel);
    f.doc.querySelector = () => dialog;
    const router = createNativeBackRouter(f.doc, f.button, () => {});
    router.start();
    f.button.handler();
    assert.equal(cancel.clicks, 1);
    assert.equal(f.gameBack.clicks, 0);
    router.stop();
});
