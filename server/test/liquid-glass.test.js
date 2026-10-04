'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../assets/ui/liquid-glass.js'), 'utf8');
const {normalize, read, KEY, DEFAULTS} = require('../../assets/ui/liquid-glass');

class Style {
    constructor() { this.properties = new Map(); }
    setProperty(name, value) { this.properties.set(name, String(value)); }
    getPropertyValue(name) { return this.properties.get(name) || ''; }
    removeProperty(name) { this.properties.delete(name); delete this[name]; }
}
class Element {
    constructor(tag, options={}) {
        this.nodeType = 1; this.tag = tag; this.id = options.id || ''; this.parentElement = null;
        this.classes = new Set(options.classes || []); this.attributes = {...options.attributes};
        this.dataset = {...options.dataset}; this.style = new Style(); this.listeners = {};
        this.children = []; this.offsetWidth = 100; this.isConnected = true; this.animations = [];
        this.classList = {
            contains: name => this.classes.has(name),
            add: (...names) => names.forEach(name => this.classes.add(name)),
            remove: (...names) => names.forEach(name => this.classes.delete(name)),
            toggle: (name, force) => { const enabled = force === undefined ? !this.classes.has(name) : force; enabled ? this.classes.add(name) : this.classes.delete(name); return enabled; },
        };
    }
    append(el) { el.parentElement = this; this.children.push(el); return el; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    matches(selector) {
        return selector.split(',').some(part => {
            part = part.trim();
            if (!part) return false;
            if (part.includes(' > ')) { const [parent, child] = part.split(' > '); return this.matches(child) && this.parentElement?.matches(parent); }
            if (part.includes(' ')) { const at = part.lastIndexOf(' '); return this.matches(part.slice(at+1)) && !!this.parentElement?.closest(part.slice(0, at)); }
            const not = part.match(/:not\(([^)]+)\)/);
            if (not && this.matches(not[1])) return false;
            part = part.replace(/:not\([^)]+\)/g, '');
            if (part.includes(':disabled') && !this.disabled) return false;
            const tag = part.match(/^[a-z]+/i)?.[0];
            if (tag && tag !== this.tag) return false;
            const classes = [...part.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
            if (classes.some(name => !this.classes.has(name))) return false;
            for (const match of part.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
                const name = match[1], value = name === 'inert' ? (this.inert ? '' : null) : name.startsWith('data-') ? this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] : this.getAttribute(name);
                if (value == null || match[2] !== undefined && value !== match[2]) return false;
            }
            return true;
        });
    }
    closest(selector) { for (let el=this; el; el=el.parentElement) if (el.matches(selector)) return el; return null; }
    querySelectorAll(selector) { return this.children.flatMap(el => [...(el.matches(selector) ? [el] : []), ...el.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    addEventListener(type, handler, options) { (this.listeners[type] ||= []).push({handler, options}); }
    emit(type, event={}) { for (const {handler} of this.listeners[type] || []) handler({target:this, ...event}); }
    animate(frames, options) {
        const animation = {frames, options, cancelled:false, cancel() { this.cancelled=true; this.oncancel?.(); }};
        this.animations.push(animation); return animation;
    }
}
function harness({saved, lite=false, reduced=false, individualTransforms=true, blockedStorage=false, available=true}={}) {
    const storage = new Map();
    if (saved !== undefined) storage.set(KEY, typeof saved === 'string' ? saved : JSON.stringify(saved));
    if (lite) storage.set('lite_mode', 'true');
    const writes=[], frames=new Map(), observers=[];
    let frameId=0;
    const html=new Element('html'); html.lang='en';
    html.dataset.liquidGlassAvailable = String(available);
    const body=html.append(new Element('body'));
    const doc={nodeType:9, documentElement:html, body, readyState:'complete', hidden:false, listeners:{},
        getElementById: id => [html, ...html.querySelectorAll('*')].find(el => el.id === id),
        querySelectorAll: selector => html.querySelectorAll(selector),
        addEventListener: Element.prototype.addEventListener, emit: Element.prototype.emit};
    // The fixtures are real interactive roles used by Spark, with existing transforms.
    const toggle=body.append(new Element('button',{id:'liquidGlassToggle',classes:['theme-switch'],attributes:{role:'switch'}}));
    const details=body.append(new Element('div',{id:'liquidGlassDetails'}));
    const fieldset=details.append(new Element('fieldset',{id:'liquidGlassControls'}));
    const modes=fieldset.append(new Element('div',{id:'liquidGlassModes',classes:['spark-glass-modes']}));
    const clear=modes.append(new Element('button',{dataset:{glassMode:'clear'}}));
    const tinted=modes.append(new Element('button',{dataset:{glassMode:'tinted'}}));
    const slider=fieldset.append(new Element('input',{id:'liquidGlassIntensity'})); slider.value=55;
    const output=fieldset.append(new Element('output',{id:'liquidGlassValue'}));
    const button=body.append(new Element('button',{classes:['btn-main']})); button.style.transform='translateY(-50%)';
    const track=body.append(new Element('div',{classes:['segment-control']}));
    const thumb=track.append(new Element('div',{classes:['segment-glider']})); thumb.style.transform='translateX(100%)';
    const segment=track.append(new Element('button',{classes:['segment-item']}));
    const dig=track.append(new Element('div',{classes:['segment-item']}));
    const cell=body.append(new Element('div',{classes:['cell']}));
    const miniMapCell=body.append(new Element('button',{classes:['mc-board-cell']}));
    const wordleKey=body.append(new Element('div',{classes:['wordle-key']}));
    const switchRow=body.append(new Element('label',{classes:['bb-picker-motion']}));
    const switchInput=switchRow.append(new Element('input',{attributes:{role:'switch'}}));
    const switchTrack=switchRow.append(new Element('i'));
    const media={matches:reduced,listeners:{},addEventListener:Element.prototype.addEventListener,emit:Element.prototype.emit};
    const window={document:doc,localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>{storage.set(key,String(value));writes.push([key,String(value)]);}},
        matchMedia:()=>media,CSS:{supports:()=>individualTransforms},listeners:{},
        addEventListener:Element.prototype.addEventListener,emit:Element.prototype.emit,
        requestAnimationFrame:callback=>{frames.set(++frameId,callback);return frameId;},cancelAnimationFrame:id=>frames.delete(id)};
    if (blockedStorage) Object.defineProperty(window,'localStorage',{get(){throw new Error('storage blocked');}});
    class MutationObserver {
        constructor(callback) { this.callback=callback; observers.push(this); }
        observe(target, options) { this.target=target; this.options=options; this.connected=true; }
        disconnect() { this.connected=false; }
    }
    vm.runInNewContext(source,{window, MutationObserver, Intl, console});
    const flush=()=>{ const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback()); };
    const pointer=(type, target=button, options={})=>doc.emit(type,{target,pointerId:1,isPrimary:true,button:0,pointerType:'mouse',clientX:100,clientY:100,...options});
    const addControl=el=>{body.append(el);observers.filter(observer=>observer.connected&&observer.options.childList).forEach(observer=>observer.callback([{addedNodes:[el]}]));};
    return {window,doc,html,body,toggle,details,fieldset,modes,clear,tinted,slider,output,button,track,thumb,segment,dig,cell,miniMapCell,wordleKey,switchRow,switchInput,switchTrack,media,storage,writes,frames,observers,flush,pointer,addControl};
}

test('paused release ignores saved enabled glass without erasing preferences or starting work',()=>{
    const saved={enabled:true,mode:'tinted',intensity:85};
    const h=harness({saved,available:false});
    assert.equal(h.html.dataset.liquidGlass,'off');
    assert.equal(h.window.SparkGlass,undefined);
    assert.deepEqual(JSON.parse(h.storage.get(KEY)),saved);
    assert.equal(h.writes.length,0);
    assert.equal(h.observers.length,0);
    assert.equal(Object.keys(h.doc.listeners).length,0);
    h.toggle.emit('click');h.pointer('pointerdown');
    assert.equal(h.html.dataset.liquidGlass,'off');
    assert.equal(h.button.style.scale,undefined);
    assert.equal(h.frames.size,0);
});

test('glass is opt-in, corrupt settings recover safely, and unsafe values are normalized',()=>{
    assert.deepEqual(normalize(null), {...DEFAULTS});
    assert.deepEqual(normalize({enabled:'true',mode:'unsupported',intensity:'90'}), {...DEFAULTS});
    assert.deepEqual(normalize({enabled:true,mode:'tinted',intensity:200}),{enabled:true,mode:'tinted',intensity:100});
    assert.equal(normalize({intensity:-5}).intensity,0);
    assert.equal(normalize({intensity:Infinity}).intensity,DEFAULTS.intensity);
    assert.deepEqual(read({getItem(){throw new Error('storage blocked');}}),{...DEFAULTS});
    const blocked=harness({blockedStorage:true});
    blocked.toggle.emit('click');
    assert.equal(blocked.html.dataset.liquidGlass,'on');
    assert.equal(blocked.writes.length,0);
    for (const saved of [undefined,'{invalid']) {
        const h=harness({saved});
        assert.equal(h.html.dataset.liquidGlass,'off');
        assert.equal(h.toggle.getAttribute('aria-checked'),'false');
        assert.equal(h.fieldset.disabled,true);
        assert.equal(h.details.inert,true);
        assert.equal(h.button.classList.contains('spark-glass-control'),false);
        assert.equal(h.writes.length,0);
        h.pointer('pointerdown'); assert.equal(h.button.style.scale,undefined);assert.equal(h.frames.size,0);
    }
});

test('enabling restores controls and marks dynamic content without touching gameplay cells',()=>{
    const h=harness();h.toggle.emit('click');
    assert.equal(h.html.dataset.liquidGlass,'on');
    assert.equal(h.toggle.getAttribute('aria-checked'),'true');
    assert.equal(h.fieldset.disabled,false);assert.equal(h.details.inert,false);
    assert.equal(h.button.classList.contains('spark-glass-accent'),true);
    assert.equal(h.track.classList.contains('spark-glass-track'),true);
    assert.equal(h.thumb.classList.contains('spark-glass-thumb'),true);
    assert.equal(h.segment.classList.contains('spark-glass-segment'),true);
    assert.equal(h.dig.classList.contains('spark-glass-segment'),true);
    assert.equal(h.wordleKey.classList.contains('spark-glass-control'),true);
    assert.equal(h.cell.classList.contains('spark-glass-control'),false);
    assert.equal(h.miniMapCell.classList.contains('spark-glass-control'),false);
    const dynamic=new Element('button');h.addControl(dynamic);
    assert.equal(dynamic.classList.contains('spark-glass-control'),true);
    assert.equal(h.writes.length,1);
    assert.equal(JSON.parse(h.storage.get(KEY)).enabled,true);
    h.toggle.emit('click');
    assert.equal(h.html.dataset.liquidGlass,'off');
    assert.equal(h.observers.some(observer=>observer.connected&&observer.options.childList),false);
});

test('the density slider updates live once per frame and commits its final value',()=>{
    const h=harness({saved:{enabled:true,mode:'clear',intensity:55}});
    const before=h.html.style.getPropertyValue('--sg-opacity');
    h.slider.value='10';h.slider.emit('input');h.slider.value='85';h.slider.emit('input');
    assert.equal(h.frames.size,1);assert.equal(h.writes.length,0);
    h.flush();
    assert.equal(h.window.SparkGlass.getSettings().intensity,85);
    assert.notEqual(h.html.style.getPropertyValue('--sg-opacity'),before);
    assert.equal(h.slider.style.getPropertyValue('--sg-range'),'85%');
    assert.equal(h.output.textContent,'85%');assert.equal(h.writes.length,0);
    h.slider.value='90';h.slider.emit('input');h.slider.emit('change');
    assert.equal(h.frames.size,0);assert.equal(JSON.parse(h.storage.get(KEY)).intensity,90);
    const restored=harness({saved:h.storage.get(KEY)});
    assert.equal(restored.slider.value,90);assert.equal(restored.html.dataset.liquidGlass,'on');
    h.tinted.emit('click');
    assert.equal(h.html.dataset.glassMode,'tinted');assert.equal(h.tinted.getAttribute('aria-pressed'),'true');
    assert.equal(h.clear.getAttribute('aria-pressed'),'false');
});

test('same-origin frame storage updates apply appearance and lightweight behavior without echo writes',()=>{
    const h=harness();
    h.storage.set(KEY,JSON.stringify({enabled:true,mode:'tinted',intensity:77}));h.window.emit('storage',{key:KEY});
    assert.equal(h.html.dataset.liquidGlass,'on');assert.equal(h.html.dataset.glassMode,'tinted');
    assert.equal(h.slider.value,77);assert.equal(h.writes.length,0);
    h.pointer('pointerdown');assert.ok(h.button.style.scale);
    h.storage.set('lite_mode','true');h.window.emit('storage',{key:'lite_mode'});
    assert.equal(h.html.dataset.glassLite,'true');assert.equal(h.button.style.scale,undefined);
    h.pointer('pointerdown');assert.equal(h.button.style.scale,undefined);
    h.storage.delete(KEY);h.window.emit('storage',{key:null});
    assert.equal(h.html.dataset.liquidGlass,'off');assert.equal(h.writes.length,0);
});

test('drag stretch and release springs preserve existing transforms and original pointer behavior',()=>{
    const h=harness({saved:{enabled:true,mode:'clear',intensity:55}});
    let prevented=0,captured=0;
    h.button.setPointerCapture=()=>captured++;
    const event={preventDefault:()=>prevented++};
    h.pointer('pointerdown',h.button,event);
    h.pointer('pointermove',h.button,{...event,clientX:126});h.flush();
    assert.ok(Number(h.button.style.scale.split(' ')[0])>1);assert.notEqual(h.button.style.translate,'0px 0px');
    assert.equal(h.button.style.transform,'translateY(-50%)');
    h.pointer('pointerup',h.button,event);
    assert.equal(h.button.animations.length,1);assert.equal(h.button.style.scale,undefined);
    assert.equal(h.button.animations[0].frames.at(-1).scale,'1 1');
    assert.equal(h.button.style.transform,'translateY(-50%)');assert.equal(h.thumb.style.transform,'translateX(100%)');
    assert.equal(prevented,0);assert.equal(captured,0);
    for(const type of ['pointerdown','pointermove','pointerup','pointercancel']) assert.ok(h.doc.listeners[type].every(({options})=>options.passive));
    h.window.SparkGlass.update({enabled:false});assert.equal(h.button.animations[0].cancelled,true);
});

test('cancel, native touch scrolling, hidden pages and disabled controls never leave deformation behind',()=>{
    const h=harness({saved:{enabled:true,mode:'clear',intensity:55}});
    h.pointer('pointerdown');h.pointer('pointermove',h.button,{clientX:120});
    h.pointer('pointercancel');h.flush();
    assert.equal(h.button.style.scale,undefined);assert.equal(h.button.style.translate,undefined);assert.equal(h.button.animations.length,0);
    h.pointer('pointerdown',h.button,{pointerType:'touch'});h.pointer('pointermove',h.button,{pointerType:'touch',clientY:120});
    assert.equal(h.button.style.scale,undefined);assert.equal(h.frames.size,0);
    h.button.disabled=true;h.pointer('pointerdown');assert.equal(h.button.style.scale,undefined);
    h.button.disabled=false;h.pointer('pointerdown');h.doc.hidden=true;h.doc.emit('visibilitychange');
    assert.equal(h.button.style.scale,undefined);assert.equal(h.frames.size,0);
    h.doc.hidden=false;h.pointer('pointerdown');h.window.emit('blur');assert.equal(h.button.style.scale,undefined);
});

test('switch-row interactions animate the visible track without moving the hidden input or label',()=>{
    const h=harness({saved:{enabled:true,mode:'clear',intensity:55}});
    h.pointer('pointerdown',h.switchInput);
    assert.ok(h.switchTrack.style.scale);
    assert.equal(h.switchInput.style.scale,undefined);assert.equal(h.switchRow.style.scale,undefined);
    h.pointer('pointercancel',h.switchInput);
    assert.equal(h.switchTrack.style.scale,undefined);
});

test('reduced motion, lightweight mode and older transform support keep controls functional without jelly',()=>{
    for(const options of [{reduced:true},{lite:true},{individualTransforms:false}]) {
        const h=harness({...options,saved:{enabled:true,mode:'clear',intensity:55}});
        h.pointer('pointerdown');h.pointer('pointermove',h.button,{clientX:125});h.pointer('pointerup');h.flush();
        assert.equal(h.html.dataset.liquidGlass,'on');assert.equal(h.button.style.scale,undefined);assert.equal(h.button.animations.length,0);assert.equal(h.frames.size,0);
        h.tinted.emit('click');assert.equal(h.window.SparkGlass.getSettings().mode,'tinted');
    }
    const h=harness({saved:{enabled:true,mode:'clear',intensity:55}});
    h.pointer('pointerdown');h.media.matches=true;h.media.emit('change');
    assert.equal(h.button.style.scale,undefined);
});
