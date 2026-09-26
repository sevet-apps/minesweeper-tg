'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { makeCollection } = require('../monopoly-collection');
const { TITLES, titleFor } = require('../monopoly-rating');
const source = fs.readFileSync(path.join(__dirname, '../../monopoly/js/v2/collection-ui.js'), 'utf8');
const lobbySource = fs.readFileSync(path.join(__dirname, '../../monopoly/js/v2/lobby.js'), 'utf8');

function sheetHarness(scrollTop = 0) {
    const handlers = {}, navigations = [], animations = [];
    const card = { scrollTop, offsetHeight:300, style:{}, getAnimations:() => [],
        animate(frames) { animations.push(frames); }, addEventListener(name, callback) { handlers[name] = callback; } };
    const backdrop = { style:{ opacity:'1' }, getAnimations:() => [], animate() {} };
    const sheet = { querySelector:selector => selector === '.lb-sheet-backdrop' ? backdrop : card };
    const context = vm.createContext({ sheet, performance:{ now:() => 100 }, getComputedStyle:element => ({ opacity:element.style.opacity }), global:{ matchMedia:() => ({matches:false}) }, show:id => navigations.push(id) });
    vm.runInContext(`${lobbySource.slice(lobbySource.indexOf('    function bindLobbySheetDrag('), lobbySource.indexOf('    function setupInteractions('))}\n bindLobbySheetDrag(sheet);`, context);
    const touch = (type, y, interactive = false) => handlers[type]({ touches:[{clientY:y}], target:{closest:() => interactive ? {} : null}, cancelable:true, preventDefault(){} });
    return { touch, handlers, navigations, animations, card };
}

test('touch sheet dismissal survives the browser cancelling its parallel pointer stream', () => {
    const h = sheetHarness();
    h.touch('touchstart', 100);
    h.touch('touchmove', 200);
    assert.equal(h.card.style.transform, 'translateY(100px)');
    h.handlers.pointercancel({pointerType:'touch'});
    h.touch('touchend', 200);
    assert.deepEqual(h.navigations, ['lbMain']);
});

test('scrolling sheet contents and interacting with controls do not dismiss the sheet', () => {
    for (const [scroll, interactive] of [[30,false],[0,true]]) {
        const h = sheetHarness(scroll);
        h.touch('touchstart', 100, interactive);
        h.touch('touchmove', 250);
        h.touch('touchend', 250);
        assert.deepEqual(h.navigations, []);
    }
});

test('cancelled touch drag restores the sheet instead of dismissing it', () => {
    const h = sheetHarness();
    h.touch('touchstart', 100);
    h.touch('touchmove', 130);
    h.touch('touchcancel', 130);
    assert.deepEqual(h.navigations, []);
    assert.equal(h.animations.length, 1);
    assert.equal(h.card.style.transform, '');
});

function tabHarness() {
    const handlers = {}, captures = [], selections = [];
    const tabs = { clientWidth:300, classList:{ add(){}, remove(){} },
        addEventListener(name, callback) { handlers[name] = callback; },
        setPointerCapture(id) { captures.push(id); } };
    const root = { dataset:{}, querySelector() { return tabs; } };
    const context = vm.createContext({ root, captures, selections, performance:{ now:() => 100 }, Date,
        applyTabProgress(value) { context.tabProgress = value; }, setTab(value) { selections.push(value); } });
    vm.runInContext(`var activeTab='cases', tabDrag=null, tabProgress=1, TAB_IDS=['progress','cases','skins'];
        ${source.slice(source.indexOf('    function bindTabDrag('), source.indexOf('    function presentCase('))}
        bindTabDrag(root);`, context);
    const send = (type, x) => handlers[type]({ type, pointerId:7, button:0, clientX:x });
    return { send, captures, selections, root };
}

test('tab taps preserve the button click target and do not initiate a drag', () => {
    const h = tabHarness();
    h.send('pointerdown', 200);
    h.send('pointermove', 202);
    h.send('pointerup', 202);
    assert.deepEqual(h.captures, []);
    assert.deepEqual(h.selections, []);
    assert.equal(h.root.dataset.mcDraggedAt, undefined);
});

test('tab dragging captures only after movement and snaps to the third tab', () => {
    const h = tabHarness();
    h.send('pointerdown', 100);
    assert.equal(h.captures.length, 0);
    h.send('pointermove', 200);
    h.send('pointerup', 200);
    assert.deepEqual(h.captures, [7]);
    assert.deepEqual(h.selections, ['skins']);
    assert.ok(h.root.dataset.mcDraggedAt);
});

test('cancelled tab drag returns to its starting tab', () => {
    const h = tabHarness();
    h.send('pointerdown', 200);
    h.send('pointermove', 100);
    h.send('pointercancel', 100);
    assert.deepEqual(h.selections, ['cases']);
});

test('profile rank catalog uses the exact scoring thresholds, including every unlock boundary', () => {
    const titles = makeCollection({}).catalog().titles;
    assert.deepEqual(titles, TITLES);
    for (let i = 0; i < titles.length; i++) {
        assert.equal(titleFor(titles[i].from).key, titles[i].key);
        if (i) assert.equal(titleFor(titles[i].from - 1).key, titles[i - 1].key);
    }
    assert.equal(titleFor(40000).progress, 1);
    assert.equal(titleFor(0).progress, 0);
});
