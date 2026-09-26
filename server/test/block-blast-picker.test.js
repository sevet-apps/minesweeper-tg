const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../assets/block-blast/picker.js'), 'utf8');

// Only the DOM surface used by the picker: actual production callbacks run unchanged.
class Events {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(callback); }
    removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
    emit(type, fields = {}) {
        const event = { type, target: this, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; }, ...fields };
        for (const callback of [...this.listeners.get(type) || []]) callback(event);
        return event;
    }
}
class Element extends Events {
    constructor(doc, tag) {
        super();
        this.doc = doc; this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.dataset = {};
        this.style = { setProperty(name, value) { this[name] = value; } };
        this.inert = false; this.hidden = false; this.animations = []; this.captures = new Set();
        this.classList = {
            add: name => { this.className = [...new Set([...this.className.split(' '), name])].join(' ').trim(); },
            remove: name => { this.className = this.className.split(' ').filter(item => item !== name).join(' '); },
            toggle: (name, force) => { if (force) this.classList.add(name); else this.classList.remove(name); },
            contains: name => this.className.split(' ').includes(name),
        };
    }
    get className() { return this.attrs.class || ''; }
    set className(value) { this.attrs.class = value; }
    get isConnected() { return this === this.doc.body || !!this.parent?.isConnected; }
    appendChild(child) { child.parent = this; this.children.push(child); return child; }
    setAttribute(name, value) {
        this.attrs[name] = String(value);
        if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
    }
    getAttribute(name) { return Object.hasOwn(this.attrs, name) ? this.attrs[name] : null; }
    removeAttribute(name) { delete this.attrs[name]; }
    set innerHTML(html) {
        this.children = [];
        const stack = [this];
        for (const match of html.matchAll(/<(\/?)([a-z][\w-]*)([^>]*)>/gi)) {
            const [, closing, tag, attributes] = match;
            if (closing) { if (stack.at(-1).tagName === tag.toUpperCase()) stack.pop(); continue; }
            const element = this.doc.createElement(tag);
            for (const attr of attributes.matchAll(/([\w-]+)="([^"]*)"/g)) element.setAttribute(attr[1], attr[2]);
            stack.at(-1).appendChild(element);
            if (!attributes.endsWith('/') && !/^(input|img|br|hr)$/i.test(tag)) stack.push(element);
        }
    }
    matches(selector) {
        if (selector.endsWith(':not(:disabled)')) return !this.disabled && this.matches(selector.replace(':not(:disabled)', ''));
        if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
        if (selector === '[data-material-choice]') return this.dataset.materialChoice !== undefined;
        const attribute = selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
        if (attribute) return this.getAttribute(attribute[1]) !== null && (attribute[2] === undefined || this.getAttribute(attribute[1]) === attribute[2]);
        if (selector === '[tabindex="0"]') return this.getAttribute('tabindex') === '0';
        return this.tagName === selector.toUpperCase();
    }
    querySelectorAll(selector) {
        const matches = [];
        const visit = parent => { for (const child of parent.children) { if (selector.split(',').some(item => child.matches(item))) matches.push(child); visit(child); } };
        visit(this); return matches;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector) || null; }
    contains(element) { return this === element || this.children.some(child => child.contains(element)); }
    getClientRects() { for (let parent = this; parent; parent = parent.parent) if (parent.hidden) return []; return [{}]; }
    getBoundingClientRect() { return { height: 500, width: 390 }; }
    focus(options) { this.focusOptions = options; this.doc.activeElement = this; this.doc.emit('focusin', { target: this }); }
    setPointerCapture(id) { this.captures.add(id); }
    hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) { this.captures.delete(id); this.emit('lostpointercapture', { pointerId: id }); }
    animate(frames, options) {
        const animation = { frames, options, inlineAtStart: { ...this.style }, cancelled: false, cancel() { this.cancelled = true; }, finish() { if (!this.cancelled) this.onfinish?.(); } };
        this.animations.push(animation); return animation;
    }
    getAnimations() { return this.animations.filter(animation => !animation.cancelled); }
}
function fixture({ reduced = false, desktop = false } = {}) {
    const doc = new Events();
    doc.createElement = tag => new Element(doc, tag);
    doc.body = doc.createElement('body');
    if (desktop) doc.body.classList.add('desktop');
    const background = doc.body.appendChild(doc.createElement('main'));
    background.setAttribute('aria-hidden', 'false');
    const trigger = background.appendChild(doc.createElement('button'));
    const alreadyInert = doc.body.appendChild(doc.createElement('aside'));
    alreadyInert.inert = true;
    const script = doc.body.appendChild(doc.createElement('script'));
    trigger.focus({ preventScroll: true });
    const window = {
        document: doc,
        getComputedStyle(element) {
            const translation = element.style.transform?.match(/translate3d\(0,([\d.]+)px,0\)/);
            return { transform: element.computedTransform || `matrix(1, 0, 0, 1, 0, ${translation ? translation[1] : 0})`, opacity: element.computedOpacity || element.style.opacity || '1' };
        },
    };
    vm.runInNewContext(source, { window });
    let theme = 'jelly', calm = false, shake = true, volume = 100, language = 'ru';
    const catalog = ['classic', 'jelly', 'porcelain'].map(id => ({ id, name: { ru: id, en: id, zh: id } }));
    const picker = window.BBMaterialPicker.create({ catalog, textureBase: '/themes/', getTheme: () => ({ id: theme }), isCalm: () => calm, isShake: () => shake, getVolume: () => volume, setVolume: value => { volume = value; }, setShake: value => { shake = value; }, setCalm: value => { calm = value; }, selectTheme: id => { theme = id; }, reduced: () => reduced || calm, lang: () => language });
    const get = selector => doc.body.querySelector(selector);
    const pointer = (type, fields = {}) => get('.bb-picker-header').emit(type, { pointerId: 1, clientY: 100, isPrimary: true, button: 0, timeStamp: 0, ...fields });
    return { doc, picker, get, pointer, background, trigger, alreadyInert, script, getVolume: () => volume, setLanguage: value => { language = value; } };
}

test('opening has an offscreen first frame before animation, and reopening reuses a single sheet', () => {
    const f = fixture();
    f.picker.open();
    const panel = f.get('.bb-picker-panel'), overlay = f.get('.bb-picker-overlay');
    const opening = panel.animations[0];
    assert.equal(overlay.hidden, false);
    assert.equal(opening.inlineAtStart.transform, 'translate3d(0,100%,0)');
    assert.equal(opening.frames[0].transform, 'translate3d(0,100%,0)');
    assert.equal(opening.frames.at(-1).transform, 'translate3d(0,0,0)');
    assert.equal(opening.options.duration, 580);
    assert.equal(opening.options.delay, 32);
    assert.equal(opening.options.fill, 'both');
    assert.equal(f.get('.bb-picker-backdrop').animations[0].inlineAtStart.opacity, '0');
    assert.equal(panel.getAttribute('role'), 'dialog');
    assert.equal(panel.getAttribute('aria-modal'), 'true');
    f.picker.open();
    assert.equal(panel.animations.length, 1, 'repeated open does not restart the animation');
    f.picker.close(true);
    f.picker.open();
    assert.equal(f.doc.body.querySelectorAll('.bb-picker-overlay').length, 1);
    assert.equal(f.doc.listeners.get('keydown').size, 1);
    assert.equal(panel.animations.at(-1).inlineAtStart.transform, 'translate3d(0,100%,0)');
    f.picker.close(true);
});

test('only the primary pointer can drag, and cancellation or capture loss restores the sheet', () => {
    const f = fixture(); f.picker.open();
    const panel = f.get('.bb-picker-panel'), header = f.get('.bb-picker-header');
    f.pointer('pointerdown', { isPrimary: false, pointerId: 2 });
    f.pointer('pointerdown', { button: 2 });
    f.pointer('pointerdown', { target: f.get('.bb-picker-close') });
    assert.equal(header.captures.size, 0, 'secondary buttons and the close button do not start a drag');
    f.pointer('pointerdown');
    f.pointer('pointermove', { clientY: 145, timeStamp: 200 });
    assert.equal(panel.style.transform, 'translate3d(0,45px,0)');
    f.pointer('pointerdown', { pointerId: 2, clientY: 300, isPrimary: false });
    f.pointer('pointermove', { pointerId: 2, clientY: 600 });
    f.pointer('pointerup', { pointerId: 2, clientY: 600 });
    assert.equal(panel.style.transform, 'translate3d(0,45px,0)');
    assert.equal(header.hasPointerCapture(1), true);
    f.pointer('pointercancel', { clientY: 300 });
    assert.equal(panel.style.transform, 'translate3d(0,0,0)');
    assert.equal(f.get('.bb-picker-backdrop').style.opacity, '1');
    assert.equal(header.captures.size, 0);
    assert.equal(f.get('.bb-picker-overlay').hidden, false);
    f.pointer('pointerdown', { pointerId: 3 });
    f.pointer('pointermove', { pointerId: 3, clientY: 260 });
    header.releasePointerCapture(3);
    assert.equal(panel.style.transform, 'translate3d(0,0,0)');
    assert.equal(header.classList.contains('is-dragging'), false);
    assert.equal(f.get('.bb-picker-overlay').hidden, false);
    f.picker.close(true);
});

test('a long swipe closes from its actual dragged position and keeps the background inert until completion', () => {
    const f = fixture(); f.picker.open();
    f.pointer('pointerdown');
    f.pointer('pointermove', { clientY: 230, timeStamp: 600 });
    f.pointer('pointerup', { clientY: 230, timeStamp: 700 });
    const closing = f.get('.bb-picker-panel').animations.at(-1);
    assert.equal(closing.frames[0].transform, 'matrix(1, 0, 0, 1, 0, 130)');
    assert.equal(closing.frames.at(-1).transform, 'translate3d(0,100%,0)');
    assert.equal(closing.options.duration, 300);
    assert.equal(f.background.inert, true);
    assert.equal(f.get('.bb-picker-overlay').hidden, false);
    closing.finish();
    assert.equal(f.get('.bb-picker-overlay').hidden, true);
    assert.equal(f.background.inert, false);
    assert.equal(f.background.getAttribute('aria-hidden'), 'false');
    assert.equal(f.alreadyInert.inert, true, 'existing inert state is not cleared');
    assert.equal(f.alreadyInert.getAttribute('aria-hidden'), null);
    assert.equal(f.script.inert, false);
    assert.equal(f.doc.activeElement, f.trigger);
    assert.equal(f.trigger.focusOptions.preventScroll, true);
    assert.equal(f.doc.listeners.get('keydown').size, 0);
    assert.equal(f.doc.listeners.get('focusin').size, 0);
    assert.equal(f.get('.bb-picker-panel').getAnimations().length, 0);
});

test('short slow swipes settle, while a short fast swipe closes even without a final pointermove', () => {
    const f = fixture(); f.picker.open();
    f.pointer('pointerdown');
    f.pointer('pointermove', { clientY: 140, timeStamp: 350 });
    f.pointer('pointerup', { clientY: 140, timeStamp: 400 });
    assert.equal(f.get('.bb-picker-panel').animations.at(-1).options.duration, 330);
    assert.equal(f.get('.bb-picker-overlay').hidden, false);
    f.pointer('pointerdown', { pointerId: 2, timeStamp: 500 });
    f.pointer('pointerup', { pointerId: 2, clientY: 140, timeStamp: 545 });
    const closing = f.get('.bb-picker-panel').animations.at(-1);
    assert.equal(closing.options.duration, 300);
    closing.finish();
    assert.equal(f.get('.bb-picker-overlay').hidden, true);
});

test('interrupting an opening animation picks up its current visual position without a jump', () => {
    const f = fixture(); f.picker.open();
    const panel = f.get('.bb-picker-panel');
    panel.computedTransform = 'matrix(1, 0, 0, 1, 0, 180)';
    f.get('.bb-picker-backdrop').computedOpacity = '.4';
    f.pointer('pointerdown');
    assert.equal(panel.style.transform, 'translate3d(0,180px,0)');
    assert.equal(panel.animations[0].cancelled, true);
    f.pointer('pointermove', { clientY: 120 });
    assert.equal(panel.style.transform, 'translate3d(0,200px,0)');
    f.pointer('pointercancel');
    assert.equal(panel.animations.at(-1).frames[0].transform, 'translate3d(0,200px,0)');
    f.picker.close(true);
});

test('keyboard focus stays in the sheet, Escape closes it, and a subsequent backdrop click also closes', () => {
    const f = fixture(); f.picker.open();
    const close = f.get('.bb-picker-close'), input = f.get('.bb-shake-input');
    assert.equal(f.doc.activeElement, close);
    const backwards = f.doc.emit('keydown', { key: 'Tab', shiftKey: true });
    assert.equal(backwards.defaultPrevented, true);
    assert.equal(f.doc.activeElement, f.get('.bb-volume-input'));
    f.doc.emit('keydown', { key: 'Tab', shiftKey: false });
    assert.equal(f.doc.activeElement, close);
    f.trigger.focus();
    assert.equal(f.doc.activeElement, close, 'programmatic focus cannot escape either');
    const escape = f.doc.emit('keydown', { key: 'Escape' });
    assert.equal(escape.defaultPrevented, true);
    assert.equal(escape.propagationStopped, true);
    f.get('.bb-picker-panel').animations.at(-1).finish();
    assert.equal(f.doc.activeElement, f.trigger);
    assert.equal(f.doc.emit('keydown', { key: 'Escape' }).defaultPrevented, undefined);
    f.picker.open();
    f.get('.bb-picker-backdrop').emit('click');
    f.get('.bb-picker-panel').animations.at(-1).finish();
    assert.equal(f.get('.bb-picker-overlay').hidden, true);
});

test('selection, language refresh and calm mode use the provided application callbacks', () => {
    const f = fixture(); f.picker.open();
    const buttons = f.get('.bb-picker-choices').children;
    assert.equal(buttons[1].getAttribute('aria-pressed'), 'true');
    buttons[2].emit('click');
    assert.equal(buttons[2].getAttribute('aria-pressed'), 'true');
    assert.equal(buttons[1].getAttribute('aria-pressed'), 'false');
    f.setLanguage('en'); f.picker.refresh();
    assert.equal(f.get('.bb-picker-title').textContent, 'Block Blast');
    assert.equal(buttons[2].getAttribute('aria-pressed'), 'true');
    const input = f.get('input'); input.checked = true; input.emit('change');
    f.picker.close();
    assert.equal(f.get('.bb-picker-overlay').hidden, true, 'calm mode closes immediately');
    f.picker.open();
    assert.equal(input.checked, true);
    assert.equal(f.get('.bb-picker-panel').getAnimations().length, 0, 'calm mode never starts sheet motion');
    f.picker.close(true);
});

test('immediate cleanup during a close cancels animations and restores background focus once', () => {
    const f = fixture(); f.picker.open(); f.picker.close();
    const stale = f.get('.bb-picker-panel').animations.at(-1);
    f.picker.close(true);
    assert.equal(stale.cancelled, true);
    assert.equal(f.get('.bb-picker-overlay').hidden, true);
    assert.equal(f.background.inert, false);
    assert.equal(f.doc.activeElement, f.trigger);
    f.picker.open();
    stale.finish();
    assert.equal(f.get('.bb-picker-overlay').hidden, false, 'an old completion cannot close a reopened sheet');
    assert.equal(f.background.inert, true);
    f.picker.close(true);
});


test('shake preference survives reopening and gentle effects disable it without losing the preference', () => {
    const f = fixture(); f.picker.open();
    const shake = f.get('.bb-shake-input'), calm = f.get('.bb-calm-input');
    assert.equal(shake.checked, true);
    shake.checked = false; shake.emit('change');
    f.picker.close(true); f.picker.open();
    assert.equal(shake.checked, false);
    shake.checked = true; shake.emit('change');
    calm.checked = true; calm.emit('change');
    assert.equal(shake.disabled, true);
    assert.equal(shake.checked, true);
    calm.checked = false; calm.emit('change');
    assert.equal(shake.disabled, false);
    assert.equal(shake.checked, true);
    f.picker.close(true);
    const desktop = fixture({ desktop: true }); desktop.picker.open();
    assert.equal(desktop.get('.bb-picker-panel').animations[0].options.duration, 420);
    desktop.picker.close(true);
});

test('three tabs switch content while volume updates and survives reopening', () => {
    const f = fixture(); f.picker.open();
    const settings = f.get('[data-bb-page="settings"]');
    const skins = f.get('[data-bb-page="skins"]');
    const progress = f.get('[data-bb-page="progress"]');
    const volume = f.get('.bb-volume-input');
    assert.equal(settings.hidden, false);
    assert.equal(skins.hidden, true);
    assert.equal(progress.hidden, true);
    assert.equal(volume.value, '100');
    volume.value = '37'; volume.emit('input');
    assert.equal(f.getVolume(), 37);
    assert.equal(f.get('.bb-picker-volume-value').textContent, '37%');
    f.get('[data-bb-tab="skins"]').emit('click');
    assert.equal(settings.hidden, true);
    assert.equal(skins.hidden, false);
    assert.equal(f.get('[data-bb-tab="skins"]').getAttribute('aria-selected'), 'true');
    f.get('.bb-picker-tabs').emit('keydown', { key: 'ArrowRight' });
    assert.equal(f.doc.activeElement, f.get('[data-bb-tab="progress"]'));
    assert.equal(progress.hidden, false);
    f.get('[data-bb-tab="progress"]').emit('click');
    assert.equal(progress.hidden, false);
    assert.equal(f.get('.bb-picker-progress-title').textContent, 'Бонусы к очкам');
    f.picker.close(true); f.picker.open();
    assert.equal(progress.hidden, false);
    f.get('[data-bb-tab="settings"]').emit('click');
    assert.equal(volume.value, '37');
    f.picker.close(true);
});
