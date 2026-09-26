'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ai = require('../../assets/checkers/ai.js');

const board = (...pieces) => {
    const cells = Array(64).fill(0);
    for (const [row, column, value] of pieces) cells[row * 8 + column] = value;
    return cells;
};

test('bot follows local checkers movement, captures backwards and continues chains', () => {
    const cells = board([2,1,-1],[3,2,1],[5,4,1]);
    const first = ai.legalMoves(cells,-1).find(move => move.isCapture);
    assert.deepEqual([first.fromR,first.fromC,first.toR,first.toC,first.midR,first.midC], [2,1,4,3,3,2]);
    const next = ai.apply(cells,first,-1);
    assert.equal(next.side,-1);
    assert.equal(next.forced,4*8+3);
    assert.deepEqual(ai.legalMoves(next.board,-1,next.forced).map(move=>[move.toR,move.toC]), [[6,5]]);
    assert.equal(next.board[3*8+2],0);
    assert.equal(cells[3*8+2],1,'search never mutates the live board');
    const backward = board([4,3,-1],[3,4,1]);
    assert.ok(ai.legalMoves(backward,-1).some(move=>move.isCapture && move.toR===2 && move.toC===5));
});

test('flying kings get unequal landing choices beyond a captured piece', () => {
    const moves = ai.legalMoves(board([2,1,-2],[4,3,1]),-1).filter(move=>move.isCapture);
    assert.deepEqual(moves.map(move=>[move.toR,move.toC]),[[5,4],[6,5],[7,6]]);
});

test('worker legal moves match the live board rules for men and kings', () => {
    const source = fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
    const rules = source.slice(source.indexOf('function getValidMoves('),source.indexOf('function executeMove('));
    const context = vm.createContext({forcedPiece:null});
    vm.runInContext(rules,context);
    for (const cells of [
        board([2,1,-1],[3,2,1],[5,4,1]),
        board([2,1,-2],[4,3,1]),
        board([4,3,-1],[3,4,1]),
    ]) {
        const live=Array.from({length:8},(_,r)=>Array.from({length:8},(_,c)=>({piece:cells[r*8+c] ? {color:cells[r*8+c]<0?'black':'white',isKing:Math.abs(cells[r*8+c])===2} : null})));
        const actual=[];
        for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(cells[r*8+c]<0)actual.push(...context.getValidMoves(r,c,live));
        assert.deepEqual(JSON.parse(JSON.stringify(ai.legalMoves(cells,-1))),JSON.parse(JSON.stringify(actual)));
    }
});

test('medium and hard bot find a forced tactical win within a bounded search', () => {
    const cells = board([2,1,-1],[3,2,1],[5,4,1]);
    for (const level of ['medium','hard']) {
        const result = ai.chooseMove(cells,level);
        assert.equal(result.move.isCapture,true);
        assert.equal(result.move.toR,4);
        assert.ok(result.nodes <= (level === 'hard' ? 120001 : 18001));
    }
});

test('worker runs the local engine without a remote service', () => {
    const worker = fs.readFileSync(path.join(__dirname,'../../assets/checkers/ai-worker.js'),'utf8');
    assert.match(worker,/importScripts\('ai\.js'\)/);
    assert.doesNotMatch(worker,/fetch\(|XMLHttpRequest|https?:\/\//);
});
