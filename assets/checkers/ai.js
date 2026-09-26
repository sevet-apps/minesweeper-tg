/* Offline draughts search. The board uses -2/-1 for black and 1/2 for white. */
(function (scope) {
    'use strict';
    const directions = [[-1,-1],[-1,1],[1,-1],[1,1]];
    const inside = (r,c) => r >= 0 && r < 8 && c >= 0 && c < 8;
    const at = (r,c) => r*8+c;
    function movesFrom(board,r,c,forced=false) {
        const piece = board[at(r,c)];
        if (!piece) return [];
        const side = Math.sign(piece), king = Math.abs(piece) === 2, moves = [];
        for (const [dr,dc] of directions) {
            for (let distance=1; distance<8; distance++) {
                const nr=r+dr*distance,nc=c+dc*distance;
                if (!inside(nr,nc)) break;
                const occupant=board[at(nr,nc)];
                if (!occupant) {
                    if (!forced && (king || (distance===1 && dr===-side))) {
                        moves.push({fromR:r,fromC:c,toR:nr,toC:nc,isCapture:false});
                    }
                    if (!king) break;
                    continue;
                }
                if (Math.sign(occupant) === side) break;
                const jr=nr+dr,jc=nc+dc;
                if (inside(jr,jc) && !board[at(jr,jc)]) {
                    if (king) {
                        for (let step=1;inside(nr+dr*step,nc+dc*step) && !board[at(nr+dr*step,nc+dc*step)];step++) {
                            moves.push({fromR:r,fromC:c,toR:nr+dr*step,toC:nc+dc*step,isCapture:true,midR:nr,midC:nc});
                        }
                    } else moves.push({fromR:r,fromC:c,toR:jr,toC:jc,isCapture:true,midR:nr,midC:nc});
                }
                break;
            }
        }
        return forced ? moves.filter(move=>move.isCapture) : moves;
    }
    function legalMoves(board,side,forced=null) {
        if (forced !== null && forced !== undefined) {
            const r=Math.floor(forced/8),c=forced%8;
            return board[forced] && Math.sign(board[forced])===side ? movesFrom(board,r,c,true) : [];
        }
        const moves=[];
        for (let i=0;i<64;i++) if (board[i] && Math.sign(board[i])===side) {
            moves.push(...movesFrom(board,Math.floor(i/8),i%8));
        }
        return moves;
    }
    function apply(board,move,side) {
        const next=Int8Array.from(board), from=at(move.fromR,move.fromC), to=at(move.toR,move.toC);
        let piece=next[from]; next[from]=0;
        if (move.isCapture) next[at(move.midR,move.midC)]=0;
        const promoted=Math.abs(piece)===1 && (side===-1 ? move.toR===7 : move.toR===0);
        if (promoted) piece=side*2;
        next[to]=piece;
        const follow=move.isCapture && !promoted && movesFrom(next,move.toR,move.toC,true).length>0;
        return {board:next,side:follow?side:-side,forced:follow?to:null};
    }
    function evaluate(board) {
        let score=0;
        for (let i=0;i<64;i++) {
            const p=board[i]; if (!p) continue;
            const row=Math.floor(i/8),col=i%8,side=-Math.sign(p),king=Math.abs(p)===2;
            const advance=p<0?row:7-row;
            const centre=3.5-Math.abs(col-3.5);
            score+=side*(king?270+centre*6:100+advance*5+centre*3);
        }
        return score;
    }
    function movePriority(board,move) {
        const captured=move.isCapture?Math.abs(board[at(move.midR,move.midC)])*90:0;
        const piece=board[at(move.fromR,move.fromC)];
        const crown=Math.abs(piece)===1 && move.toR===(piece<0?7:0) ? 80:0;
        return captured+crown+(3.5-Math.abs(move.toC-3.5))*2;
    }
    function chooseMove(input,level='medium',options={}) {
        const board=Int8Array.from(input),forced=options.forced ?? null;
        const rootMoves=legalMoves(board,-1,forced);
        if (!rootMoves.length) return {move:null,depth:0,nodes:0};
        const budgets={easy:{depth:1,ms:12,nodes:1200},medium:{depth:5,ms:85,nodes:18000},hard:{depth:11,ms:320,nodes:120000}};
        const config=budgets[level]||budgets.medium;
        const maxDepth=options.maxDepth||config.depth;
        const deadline=(typeof performance!=='undefined'?performance.now():Date.now())+(options.timeMs??config.ms);
        const maxNodes=options.maxNodes??config.nodes;
        const table=new Map(); let nodes=0,best=rootMoves[0],bestScore=-Infinity,completed=0;
        const tick=()=>{ if (++nodes > maxNodes || (nodes&255)===0 && (typeof performance!=='undefined'?performance.now():Date.now())>deadline) throw new Error('search budget'); };
        function search(position,side,forcedCell,depth,alpha,beta,qdepth=0) {
            tick();
            let moves=legalMoves(position,side,forcedCell);
            if (!moves.length) return side===-1?-90000-depth:90000+depth;
            if (depth<=0) {
                if (qdepth>=4) return evaluate(position);
                moves=moves.filter(move=>move.isCapture);
                if (!moves.length) return evaluate(position);
            }
            const quiescent=depth<=0;
            if (quiescent) {
                let value=forcedCell===null?evaluate(position):(side===-1?-Infinity:Infinity);
                if (side===-1) alpha=Math.max(alpha,value);
                else beta=Math.min(beta,value);
                if (alpha>=beta) return value;
                moves.sort((a,b)=>movePriority(position,b)-movePriority(position,a));
                for (const move of moves) {
                    const next=apply(position,move,side);
                    const score=search(next.board,next.side,next.forced,0,alpha,beta,qdepth+1);
                    if (side===-1) {value=Math.max(value,score);alpha=Math.max(alpha,value);}
                    else {value=Math.min(value,score);beta=Math.min(beta,value);}
                    if (alpha>=beta) break;
                }
                return value;
            }
            const key=Array.from(position,p=>String.fromCharCode(p+67)).join('')+side+','+forcedCell;
            const cached=table.get(key);
            if (cached && cached.depth>=depth) return cached.value;
            moves.sort((a,b)=>movePriority(position,b)-movePriority(position,a));
            let value=side===-1?-Infinity:Infinity,cut=false;
            for (const move of moves) {
                const next=apply(position,move,side);
                const score=search(next.board,next.side,next.forced,depth-(next.side===side?0:1),alpha,beta);
                if (side===-1) {value=Math.max(value,score);alpha=Math.max(alpha,value);}
                else {value=Math.min(value,score);beta=Math.min(beta,value);}
                if (alpha>=beta) {cut=true;break;}
            }
            if (!cut && table.size<12000) table.set(key,{depth,value});
            return value;
        }
        rootMoves.sort((a,b)=>movePriority(board,b)-movePriority(board,a));
        for (let depth=1;depth<=maxDepth;depth++) {
            let roundBest=best,roundScore=-Infinity,alpha=-Infinity;
            const ordered=[best,...rootMoves.filter(m=>m!==best)];
            try {
                for (const move of ordered) {
                    const next=apply(board,move,-1);
                    const score=search(next.board,next.side,next.forced,depth-(next.side===-1?0:1),alpha,Infinity);
                    if (score>roundScore) {roundScore=score;roundBest=move;}
                    alpha=Math.max(alpha,score);
                }
            } catch (_) { break; }
            best=roundBest;bestScore=roundScore;completed=depth;
            if (Math.abs(bestScore)>88000) break;
        }
        if (level==='easy' && rootMoves.length>1) {
            const candidates=rootMoves.filter(move=>movePriority(board,move)>=movePriority(board,best)-95);
            best=candidates[Math.floor(Math.random()*candidates.length)]||best;
        }
        return {move:best,depth:completed,nodes,score:bestScore};
    }
    const api={chooseMove,legalMoves,movesFrom,apply,evaluate};
    if (typeof module!=='undefined' && module.exports) module.exports=api;
    scope.CheckersAI=api;
})(typeof self!=='undefined'?self:globalThis);
