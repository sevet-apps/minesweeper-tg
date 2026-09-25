'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { shouldDismiss } = require('../../assets/ui/sheets');
const source = fs.readFileSync(path.join(__dirname,'../../assets/ui/sheets.js'),'utf8');

function harness({scroll=0,interactive=false,offset=0,fromHeader=false}={}) {
    const handlers={},classes=new Set(),captures=[];
    let closes=0,time=100;
    const panel={scrollTop:scroll,offsetHeight:400,style:{},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},contains:el=>el===target||el===panel,
        addEventListener:(type,fn)=>handlers[type]=fn,hasPointerCapture:()=>captures.length>0,setPointerCapture:id=>captures.push(id)};
    const target={scrollTop:0,parentElement:panel,closest:selector=>(interactive||fromHeader&&selector.includes('.ui-sheet-topbar'))?{}:null};
    const window={getComputedStyle:()=>({transform:offset?'matrix(1,0,0,1,0,40)':'none'}),DOMMatrixReadOnly:class {constructor(){this.m42=offset}}};
    const context=vm.createContext({window,performance:{now:()=>time},console});
    vm.runInContext(source,context);
    window.SparkSheets.bindDrag(panel,()=>closes++);
    const touch=(type,x,y)=>{time+=30;handlers[type]({touches:[{clientX:x,clientY:y}],target,cancelable:true,preventDefault(){}})};
    const pointer=(type,x,y,pointerType='mouse')=>{time+=30;handlers[type]({clientX:x,clientY:y,pointerType,pointerId:5,button:0,target,cancelable:true,preventDefault(){}})};
    return {panel,touch,pointer,captures,classes,closes:()=>closes};
}
test('sheets require distance or a recent deliberate flick, and cancellation always returns home',()=>{
    assert.equal(shouldDismiss(110,0,500,400,false),true);
    assert.equal(shouldDismiss(30,1,20,400,false),true);
    assert.equal(shouldDismiss(3,2,20,400,false),false);
    assert.equal(shouldDismiss(30,1,150,400,false),false);
    assert.equal(shouldDismiss(200,2,20,400,true),false);
});
test('touch dismissal survives cancellation of the parallel pointer stream',()=>{
    const h=harness();h.touch('touchstart',100,100);h.touch('touchmove',101,240);h.pointer('pointercancel',101,240,'touch');h.touch('touchend',101,240);
    assert.equal(h.closes(),1);assert.equal(h.panel.style.transform,'');assert.equal(h.classes.size,0);
});
test('touch cancellation returns a dragged sheet without closing',()=>{
    const h=harness();h.touch('touchstart',100,100);h.touch('touchmove',100,300);h.touch('touchcancel',100,300);
    assert.equal(h.closes(),0);assert.equal(h.panel.style.transform,'');
});
test('controls and scrolled contents never initiate a sheet dismissal',()=>{
    for(const options of [{scroll:20},{interactive:true}]){
        const h=harness(options);h.touch('touchstart',100,100);h.touch('touchmove',100,300);h.touch('touchend',100,300);
        assert.equal(h.closes(),0);assert.equal(h.classes.size,0);
    }
});
test('horizontal gestures are not mistaken for closing a sheet',()=>{
    const h=harness();h.touch('touchstart',100,100);h.touch('touchmove',240,120);h.touch('touchmove',240,340);h.touch('touchend',240,340);
    assert.equal(h.closes(),0);
});
test('the pinned header can dismiss a sheet even when its content is scrolled',()=>{
    const h=harness({scroll:40,fromHeader:true});h.touch('touchstart',100,100);h.touch('touchmove',100,300);h.touch('touchend',100,300);
    assert.equal(h.closes(),1);
});
test('desktop taps preserve their click target; pointer capture starts after a real drag',()=>{
    const h=harness();h.pointer('pointerdown',100,100);h.pointer('pointermove',102,102);h.pointer('pointerup',102,102);
    assert.deepEqual(h.captures,[]);assert.equal(h.closes(),0);
    h.pointer('pointerdown',100,100);h.pointer('pointermove',100,250);h.pointer('pointerup',100,250);
    assert.deepEqual(h.captures,[5]);assert.equal(h.closes(),1);
});
test('grabbing a sheet during entrance starts at its currently rendered position',()=>{
    const h=harness({offset:40});h.touch('touchstart',100,100);h.touch('touchmove',100,130);
    assert.equal(h.panel.style.transform,'translate3d(0,70px,0)');
});
test('binding a sheet twice never duplicates gesture listeners',()=>{
    const handlers={},panel={addEventListener:(type,fn)=>(handlers[type]??=[]).push(fn)};
    const window={};vm.runInNewContext(source,{window});window.SparkSheets.bindDrag(panel,()=>{});window.SparkSheets.bindDrag(panel,()=>{});
    assert.ok(Object.values(handlers).every(list=>list.length===1));
});
