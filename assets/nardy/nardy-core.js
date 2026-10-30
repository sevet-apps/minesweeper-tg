/* Spark: правила нард — общие для браузера и сервера.
   Два вида игры:
   - long  — длинные нарды: 15 шашек на «голове», обе стороны идут в одну
     сторону, бить нельзя, на занятый соперником пункт вставать нельзя,
     с головы — одна шашка за ход (первый ход 6-6, 4-4, 3-3 — две),
     нельзя ставить заграждение из шести пунктов подряд, если впереди него
     нет ни одной шашки соперника;
   - short — короткие нарды (бэкгаммон): классическая расстановка, одиночную
     шашку («блот») можно бить, сбитая уходит на бар и входит в дом соперника.
   Общее: дубль — четыре хода; нужно сыграть столько костей, сколько можно,
   а если можно сыграть только одну из двух — большую; выбрасывать шашки —
   когда все в доме, точной костью или большей с самого дальнего пункта.

   Координаты. Каждый игрок считает пункты по-своему: 24 — откуда идёт,
   1 — последний пункт дома, 25 — бар, 0 — за доской (выброшена). Доска
   хранится в абсолютных индексах 0…23 (как пункты 1…24 у белых):
   pts[i] > 0 — белые шашки, < 0 — чёрные. */
(function (root) {
    'use strict';

    const VARIANTS = Object.freeze(['long', 'short']);
    const CHECKERS = 15;
    const other = c => (c === 'w' ? 'b' : 'w');
    const colorName = c => (c === 'w' ? 'white' : 'black');
    const fromName = name => (name === 'white' ? 'w' : name === 'black' ? 'b' : null);

    /** Пункт p (1…24) игрока color → абсолютный индекс 0…23. */
    function absIndex(variant, color, p) {
        if (color === 'w') return p - 1;
        return variant === 'short' ? 24 - p : (p + 11) % 24;
    }
    /** Абсолютный индекс → пункт игрока color (1…24). */
    function ownPoint(variant, color, idx) {
        if (color === 'w') return idx + 1;
        return variant === 'short' ? 24 - idx : ((idx + 12) % 24) + 1;
    }

    function initialState(variant = 'long') {
        const v = VARIANTS.includes(variant) ? variant : 'long';
        const pts = new Array(24).fill(0);
        const place = (color, p, n) => { pts[absIndex(v, color, p)] += color === 'w' ? n : -n; };
        for (const c of ['w', 'b']) {
            if (v === 'long') place(c, 24, CHECKERS);
            else { place(c, 24, 2); place(c, 13, 5); place(c, 8, 3); place(c, 6, 5); }
        }
        return { variant: v, pts, bar: { w: 0, b: 0 }, off: { w: 0, b: 0 }, opened: { w: false, b: false } };
    }

    function clone(s) {
        return { variant: s.variant, pts: s.pts.slice(), bar: { w: s.bar.w, b: s.bar.b }, off: { w: s.off.w, b: s.off.b }, opened: { w: !!s.opened?.w, b: !!s.opened?.b } };
    }
    const keyOf = s => `${s.pts.join(',')}|${s.bar.w},${s.bar.b}|${s.off.w},${s.off.b}`;

    /** Сколько шашек color стоит на его пункте p. */
    function count(s, color, p) {
        const v = s.pts[absIndex(s.variant, color, p)];
        return color === 'w' ? (v > 0 ? v : 0) : (v < 0 ? -v : 0);
    }
    /** Сколько шашек соперника стоит на пункте p игрока color. */
    function enemy(s, color, p) {
        const v = s.pts[absIndex(s.variant, color, p)];
        return color === 'w' ? (v < 0 ? -v : 0) : (v > 0 ? v : 0);
    }
    function onBoard(s, color) {
        let n = 0;
        for (const v of s.pts) if (color === 'w' ? v > 0 : v < 0) n += Math.abs(v);
        return n;
    }
    /** Все шашки в доме (пункты 1…6) и на баре никого — можно выбрасывать. */
    function allHome(s, color) {
        if (s.bar[color] > 0) return false;
        for (let p = 7; p <= 24; p++) if (count(s, color, p)) return false;
        return true;
    }
    /** Число очков до конца: сумма пунктов всех шашек (бар — 25). */
    function pips(s, color) {
        let total = s.bar[color] * 25;
        for (let p = 1; p <= 24; p++) total += count(s, color, p) * p;
        return total;
    }

    /** Длинные нарды: шесть пунктов подряд без шашки соперника впереди — запрещено. */
    function illegalBlock(s, color) {
        const opp = other(color);
        let lead = 25;   // самая продвинутая шашка соперника (его пункт)
        for (let q = 1; q <= 24; q++) if (count(s, opp, q)) { lead = q; break; }
        let run = 0;
        for (let q = 24; q >= 1; q--) {   // путь соперника: от его 24 к 1
            const v = s.pts[absIndex(s.variant, opp, q)];
            run = (color === 'w' ? v > 0 : v < 0) ? run + 1 : 0;
            if (run >= 6 && !(lead < q)) return true;
        }
        return false;
    }

    function headLimit(ctx) {
        if (!ctx.first) return 1;
        const [a, b] = ctx.roll;
        return a === b && (a === 6 || a === 4 || a === 3) ? 2 : 1;
    }

    function applyStep(s, color, step) {
        const n = clone(s);
        const sign = color === 'w' ? 1 : -1;
        if (step.from === 25) n.bar[color]--;
        else n.pts[absIndex(n.variant, color, step.from)] -= sign;
        if (step.to === 0) n.off[color]++;
        else {
            const i = absIndex(n.variant, color, step.to);
            if (n.variant === 'short' && n.pts[i] === -sign) {   // бьём блот
                n.pts[i] = 0;
                n.bar[other(color)]++;
            }
            n.pts[i] += sign;
        }
        return n;
    }

    /** Ходы одной шашкой на кость die. ctx: { first, roll, headUsed }. */
    function stepsFor(s, color, die, ctx) {
        const out = [];
        const v = s.variant;
        if (v === 'short' && s.bar[color] > 0) {
            const to = 25 - die;
            const opp = enemy(s, color, to);
            if (opp <= 1) out.push(opp ? { from: 25, to, die, hit: true } : { from: 25, to, die });
            return out;
        }
        const home = allHome(s, color);
        let highest = 0;
        if (home) for (let p = 6; p >= 1; p--) if (count(s, color, p)) { highest = p; break; }
        for (let p = 24; p >= 1; p--) {
            if (!count(s, color, p)) continue;
            if (v === 'long' && p === 24 && (ctx?.headUsed || 0) >= headLimit(ctx || {})) continue;
            const to = p - die;
            if (to >= 1) {
                const opp = enemy(s, color, to);
                if (v === 'long' ? opp > 0 : opp >= 2) continue;
                const step = opp ? { from: p, to, die, hit: true } : { from: p, to, die };
                if (v === 'long' && illegalBlock(applyStep(s, color, step), color)) continue;
                out.push(step);
            } else if (home && (to === 0 || p === highest)) {
                out.push({ from: p, to: 0, die });
            }
        }
        return out;
    }

    const diceOf = roll => (roll[0] === roll[1] ? [roll[0], roll[0], roll[0], roll[0]] : [roll[0], roll[1]]);
    function removeDie(list, die) {
        const i = list.indexOf(die);
        return i < 0 ? list.slice() : [...list.slice(0, i), ...list.slice(i + 1)];
    }
    const headStep = (s, step) => (s.variant === 'long' && step.from === 24 ? 1 : 0);

    /** Сколько костей ещё можно сыграть из позиции (перебор с памятью). */
    function maxMoves(s, color, dice, ctx, memo = new Map()) {
        if (!dice.length) return 0;
        const key = `${keyOf(s)}#${dice.join('')}#${ctx.headUsed}`;
        if (memo.has(key)) return memo.get(key);
        let best = 0;
        const tried = new Set();
        for (const d of dice) {
            if (tried.has(d)) continue;
            tried.add(d);
            for (const step of stepsFor(s, color, d, ctx)) {
                const n = 1 + maxMoves(applyStep(s, color, step), color, removeDie(dice, d), { ...ctx, headUsed: ctx.headUsed + headStep(s, step) }, memo);
                if (n > best) best = n;
                if (best === dice.length) break;
            }
            if (best === dice.length) break;
        }
        memo.set(key, best);
        return best;
    }

    /* ---------- ход: бросок и шашки по одной ----------
       Ход — объект { state, color, roll, dice (оставшиеся), used, target,
       headUsed, first, steps }. Шашки двигаются по одной (как пальцем на
       телефоне); разрешён только тот шаг, после которого ещё можно сыграть
       все кости, которые положено сыграть. */
    function startTurn(state, color, roll) {
        const ctx = { first: !state.opened?.[color], roll, headUsed: 0 };
        const dice = diceOf(roll);
        const target = maxMoves(state, color, dice, ctx);
        return { state, start: state, color, roll: [roll[0], roll[1]], dice, used: 0, target, headUsed: 0, first: ctx.first, steps: [] };
    }

    function legalSteps(turn) {
        if (turn.used >= turn.target) return [];
        const ctx = { first: turn.first, roll: turn.roll, headUsed: turn.headUsed };
        const need = turn.target - turn.used;
        const memo = new Map();
        const out = [];
        const tried = new Set();
        for (const d of turn.dice) {
            if (tried.has(d)) continue;
            tried.add(d);
            for (const step of stepsFor(turn.state, turn.color, d, ctx)) {
                const after = applyStep(turn.state, turn.color, step);
                const rest = maxMoves(after, turn.color, removeDie(turn.dice, d), { ...ctx, headUsed: ctx.headUsed + headStep(turn.state, step) }, memo);
                if (1 + rest === need) out.push(step);
            }
        }
        // можно сыграть только одну кость из двух разных — обязательно большую
        if (turn.target === 1 && turn.roll[0] !== turn.roll[1] && turn.used === 0) {
            const big = Math.max(...turn.roll);
            if (out.some(step => step.die === big)) return out.filter(step => step.die === big);
        }
        return out;
    }

    const sameStep = (a, b) => a && b && a.from === b.from && a.to === b.to && a.die === b.die;

    /** Сыграть шаг; null — шаг не по правилам. */
    function playStep(turn, raw) {
        const from = Number(raw?.from), to = Number(raw?.to), die = Number(raw?.die);
        const step = legalSteps(turn).find(s => s.from === from && s.to === to && (!die || s.die === die));
        if (!step) return null;
        const state = applyStep(turn.state, turn.color, step);
        return {
            ...turn,
            state,
            dice: removeDie(turn.dice, step.die),
            used: turn.used + 1,
            headUsed: turn.headUsed + headStep(turn.state, step),
            steps: [...turn.steps, step],
        };
    }
    const turnDone = turn => turn.used >= turn.target;

    /** Закончить ход: позиция для соперника (первый ход сделан). */
    function endTurn(turn) {
        const state = clone(turn.state);
        state.opened[turn.color] = true;
        return state;
    }

    /** Целый ход по списку шагов; null — если хоть один шаг не по правилам или кости не доиграны. */
    function playTurn(state, color, roll, steps) {
        let turn = startTurn(state, color, roll);
        for (const raw of steps || []) {
            turn = playStep(turn, raw);
            if (!turn) return null;
        }
        return turnDone(turn) ? { turn, state: endTurn(turn) } : null;
    }

    /** Все разные итоги хода (для бота): [{ steps, state }]. */
    function allPlays(state, color, roll) {
        const first = !state.opened?.[color];
        const results = new Map();
        const seen = new Set();
        let best = 0;
        function dfs(s, dice, headUsed, steps) {
            const key = `${keyOf(s)}#${dice.join('')}#${headUsed}`;
            if (seen.has(key)) return;
            seen.add(key);
            let moved = false;
            const tried = new Set();
            for (const d of dice) {
                if (tried.has(d)) continue;
                tried.add(d);
                for (const step of stepsFor(s, color, d, { first, roll, headUsed })) {
                    moved = true;
                    dfs(applyStep(s, color, step), removeDie(dice, d), headUsed + headStep(s, step), [...steps, step]);
                }
            }
            if (moved) return;
            if (steps.length > best) { best = steps.length; results.clear(); }
            if (steps.length === best) {
                const k = keyOf(s);
                const prev = results.get(k);
                if (!prev || (steps.length === 1 && steps[0].die > prev.steps[0].die)) results.set(k, { steps, state: s });
            }
        }
        dfs(state, diceOf(roll), 0, []);
        let list = [...results.values()];
        if (best === 1 && roll[0] !== roll[1]) {
            const big = Math.max(...roll);
            if (list.some(p => p.steps[0].die === big)) list = list.filter(p => p.steps[0].die === big);
        }
        return list.map(p => ({ steps: p.steps, state: (() => { const n = clone(p.state); n.opened[color] = true; return n; })() }));
    }

    /* ---------- конец партии ---------- */
    function winner(s) {
        if (s.off.w >= CHECKERS) return 'w';
        if (s.off.b >= CHECKERS) return 'b';
        return null;
    }
    /** Итог: 1 очко — обычная победа (ойн), 2 — марс/гаммон, 3 — бэкгаммон (короткие). */
    function outcomeOf(s, win) {
        const lose = other(win);
        if (s.off[lose] > 0) return { winner: win, points: 1, kind: 'single' };
        if (s.variant === 'short') {
            let deep = s.bar[lose] > 0;
            for (let p = 19; p <= 24 && !deep; p++) if (count(s, lose, p)) deep = true;
            return deep ? { winner: win, points: 3, kind: 'backgammon' } : { winner: win, points: 2, kind: 'gammon' };
        }
        return { winner: win, points: 2, kind: 'mars' };
    }

    /* ---------- кости ---------- */
    function rollDice(random = Math.random) {
        const die = () => 1 + Math.floor(random() * 6);
        return [die(), die()];
    }
    /** Кто ходит первым: каждый бросает по кости, у кого больше. */
    function openingRoll(random = Math.random) {
        for (;;) {
            const [w, b] = rollDice(random);
            if (w !== b) return { w, b, first: w > b ? 'w' : 'b' };
        }
    }

    /* ---------- бот ----------
       Каждый вариант хода оценивается позицией после него (в очках «пипов»).
       Уровни: новичок часто ошибается, любитель — реже, мастер смотрит ещё и
       лучший ответ соперника на каждый из 21 возможных бросков. */
    const BOT_LEVELS = Object.freeze([
        { level: 1, noise: 14, blunder: 0.25 },
        { level: 2, noise: 4, blunder: 0.06 },
        { level: 3, noise: 0, blunder: 0, lookahead: 4 },
    ]);
    const botLevel = level => BOT_LEVELS.find(l => l.level === Number(level)) || BOT_LEVELS[1];
    // сколько бросков из 36 попадают на расстояние d (без учёта преград)
    const SHOT_ROLLS = [0, 11, 12, 14, 15, 15, 17, 6, 6, 5, 3, 2, 3, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1];

    function evalShort(s, c) {
        const o = other(c);
        const myPips = pips(s, c), oppPips = pips(s, o);
        let score = (oppPips - myPips) + (s.off[c] - s.off[o]) * 2;
        // контакт ещё есть? (моя самая задняя шашка позади самой задней шашки соперника)
        let myBack = s.bar[c] ? 25 : 0, oppBack = s.bar[o] ? 25 : 0;
        for (let p = 24; p >= 1; p--) if (count(s, c, p)) { myBack = Math.max(myBack, p); break; }
        for (let p = 24; p >= 1; p--) if (count(s, o, p)) { oppBack = Math.max(oppBack, p); break; }
        const contact = myBack + oppBack > 25;
        if (!contact) return score * 1.2 + s.off[c] * 1.5;
        let run = 0, prime = 0;
        for (let p = 1; p <= 24; p++) {
            const n = count(s, c, p);
            if (n >= 2) {
                run++;
                prime = Math.max(prime, run);
                score += p <= 6 ? 4 + (p >= 4 ? 2 : 0) : p === 7 ? 4 : p <= 9 ? 2 : 0.5;
                if (n > 4) score -= (n - 4) * 1.5;
            } else {
                run = 0;
                if (n === 1) {
                    // блот: шансы, что соперник по нему попадёт, и сколько тогда потеряем
                    let rolls = s.bar[o] && p <= 24 ? SHOT_ROLLS[Math.min(24, p)] || 0 : 0;
                    for (let q = 1; q < p; q++) {
                        // соперник стоит на моём пункте q и идёт к моим большим номерам
                        if (enemy(s, c, q)) rolls += SHOT_ROLLS[p - q] || 0;
                    }
                    const risk = Math.min(36, rolls) / 36;
                    score -= risk * (25 - p + 6) * 0.9;
                }
            }
        }
        score += prime * prime * 1.1;
        score += s.bar[o] * (6 + homePoints(s, c) * 2);
        score -= s.bar[c] * (6 + homePoints(s, o) * 2);
        return score;
    }
    function homePoints(s, c) {
        let n = 0;
        for (let p = 1; p <= 6; p++) if (count(s, c, p) >= 2) n++;
        return n;
    }

    function evalLong(s, c) {
        const o = other(c);
        const myPips = pips(s, c), oppPips = pips(s, o);
        let score = (oppPips - myPips) + (s.off[c] - s.off[o]) * 2.5;
        // голова: пока шашки там, они не работают
        const head = count(s, c, 24);
        if (head > 1) score -= (head - 1) * (s.off[c] ? 0.5 : 2.2);
        // заграждения на пути соперника — пока позади них есть его шашки
        let back = 0;
        for (let q = 24; q >= 1; q--) if (count(s, o, q)) { back = q; break; }
        let run = 0;
        for (let q = 24; q >= 1; q--) {
            const i = absIndex(s.variant, o, q);
            const mine = c === 'w' ? s.pts[i] > 0 : s.pts[i] < 0;
            if (mine) {
                run++;
                if (back > q && run >= 2) score += run * 1.6;
            } else run = 0;
        }
        // занятые пункты и перегруз
        for (let p = 1; p <= 23; p++) {
            const n = count(s, c, p);
            if (!n) continue;
            score += p <= 6 ? 1.2 : p >= 13 && p <= 18 ? 1.6 : 1;
            if (n > 4) score -= (n - 4) * 1.4;
        }
        // соперник зажат: его шашки, которым некуда пойти одной костью
        let stuck = 0;
        for (let q = 1; q <= 24; q++) {
            if (!count(s, o, q)) continue;
            let free = 0;
            for (let d = 1; d <= 6 && !free; d++) { const t = q - d; if (t < 1 || !enemy(s, o, t)) free++; }
            if (!free) stuck += count(s, o, q);
        }
        score += stuck * 2;
        return score;
    }
    const evaluate = (s, c) => (s.variant === 'short' ? evalShort(s, c) : evalLong(s, c)) + (winner(s) === c ? 1000 : 0);

    // 21 разный бросок и сколько из 36 он весит
    const ROLLS21 = [];
    for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) ROLLS21.push({ roll: [a, b], weight: a === b ? 1 : 2 });

    /** Ход бота: список шагов (пустой — ходить нечем). */
    function botPlay(state, color, roll, level = 2, random = Math.random) {
        const plays = allPlays(state, color, roll);
        if (!plays.length) return [];
        if (plays.length === 1) return plays[0].steps;
        const cfg = botLevel(level);
        if (cfg.blunder && random() < cfg.blunder) return plays[Math.floor(random() * plays.length)].steps;
        const scored = plays.map(p => ({ p, score: evaluate(p.state, color) + (cfg.noise ? (random() - 0.5) * cfg.noise : 0) }));
        scored.sort((a, b) => b.score - a.score);
        if (!cfg.lookahead || winner(scored[0].p.state)) return scored[0].p.steps;
        const opp = other(color);
        let best = null, bestScore = -Infinity;
        for (const { p } of scored.slice(0, cfg.lookahead)) {
            let total = 0;
            for (const { roll: r, weight } of ROLLS21) {
                const replies = allPlays(p.state, opp, r);
                let worst = replies.length ? -Infinity : evaluate(p.state, opp);
                for (const reply of replies) worst = Math.max(worst, evaluate(reply.state, opp));
                total -= worst * weight;
            }
            if (total > bestScore) { bestScore = total; best = p; }
        }
        return best.steps;
    }

    /* ---------- рейтинг ---------- */
    const START_RATING = 1200;
    const MIN_RATING = 100;
    function eloK(rating, games) {
        if (games < 20) return 40;
        return rating >= 2000 ? 16 : 24;
    }
    function eloDelta(ratingA, ratingB, score, gamesA = 0) {
        const expected = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
        const delta = Math.round(eloK(ratingA, gamesA) * (score - expected));
        return Math.max(MIN_RATING - ratingA, delta);
    }

    /* ---------- снимок для сети ---------- */
    function serialize(s) {
        return { variant: s.variant, pts: s.pts.slice(), bar: { ...s.bar }, off: { ...s.off }, opened: { ...s.opened } };
    }
    /** Позиция из сети: проверяем всё, на чужие данные не полагаемся. */
    function parseState(raw) {
        if (!raw || !VARIANTS.includes(raw.variant) || !Array.isArray(raw.pts) || raw.pts.length !== 24) return null;
        const pts = raw.pts.map(v => Math.trunc(Number(v)) || 0);
        const n = value => Math.max(0, Math.min(CHECKERS, Math.trunc(Number(value)) || 0));
        const s = { variant: raw.variant, pts, bar: { w: n(raw.bar?.w), b: n(raw.bar?.b) }, off: { w: n(raw.off?.w), b: n(raw.off?.b) }, opened: { w: !!raw.opened?.w, b: !!raw.opened?.b } };
        if (s.variant === 'long' && (s.bar.w || s.bar.b)) return null;
        for (const c of ['w', 'b']) if (onBoard(s, c) + s.bar[c] + s.off[c] !== CHECKERS) return null;
        return s;
    }

    const api = {
        VARIANTS, CHECKERS, BOT_LEVELS, START_RATING, MIN_RATING, ROLLS21,
        other, colorName, fromName, absIndex, ownPoint, initialState, clone, keyOf, count, enemy, allHome, pips,
        illegalBlock, applyStep, stepsFor, startTurn, legalSteps, playStep, turnDone, endTurn, playTurn, allPlays, sameStep,
        winner, outcomeOf, rollDice, openingRoll, botLevel, botPlay, evaluate, eloDelta, serialize, parseState,
    };
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.SparkNardyCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
