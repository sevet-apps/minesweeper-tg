/* ============================================================
   engine.js (v2) — клиентский игровой движок (демо-режим с ботами).
   Правила из MonopolyDataV2. Архитектура события/фазы, чтобы позже
   те же экшены гонять через socket.io на server/monopoly-engine.js.
   ============================================================ */
(function (global) {
    'use strict';

    const D = global.MonopolyDataV2, E = D.ECONOMY;
    const rnd = n => Math.floor(Math.random() * n);

    /* ---------- состояние ---------- */
    const S = {
        players: {}, order: [], turnIdx: 0, round: 1,
        owners: {}, branches: {}, mortgaged: {},
        phase: 'idle',           // await-roll | rolling | await-buy | auction | await-jail | ended
        doubles: 0,
        auction: null,           // {tile, price, queue:[ids], idx, starter}
        bankruptedBy: {},        // кто кого разорил
        casino: null,            // {picked:[1..6], rolled}
        pendingBuy: null,        // tile idx
        timerEnd: 0, timerId: null,
        startedAt: Date.now(),
        chance: [], chanceIdx: 0,
        winner: null,
        ignored: {},             // id -> true (мои игноры)
    };

    const listeners = {};
    function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); }
    function emit(ev, ...a) { (listeners[ev] || []).forEach(f => f(...a)); }

    const cur = () => S.players[S.order[S.turnIdx]];
    const alive = () => S.order.filter(id => S.players[id].alive);
    const fmt = n => n.toLocaleString('ru-RU');

    /* ---------- лог ---------- */
    function log(pid, text) { emit('log', { pid, text }); }

    /* ---------- таймер 70с на действие ---------- */
    function armTimer(onExpire, secs = E.turnSeconds) {
        clearTimeout(S.timerId);
        S.timerEnd = Date.now() + secs * 1000;
        emit('timer', secs);
        S.timerId = setTimeout(() => onExpire && onExpire(), secs * 1000);
    }

    /* ---------- запуск ---------- */
    function start(playersCfg) {
        S.chance = D.CHANCE.slice().sort(() => Math.random() - .5);
        playersCfg.forEach((p, i) => {
            S.players[p.id] = {
                ...p, money: E.startingCash, pos: 0,
                alive: true, jailed: false, jailTries: 0, lapsRound: 0,
            };
            S.order.push(p.id);
        });
        emit('state');
        beginTurn();
    }

    function beginTurn() {
        const p = cur();
        if (!p.alive) return nextTurn();
        S.doubles = 0;
        S.builtGroups = {};                 // лимит: 1 филиал на монополию за ход
        S.phase = 'await-roll';
        emit('state');
        if (p.jailed) return jailPrompt();
        armTimer(() => doRoll());               // авто-бросок по таймауту
        emit('phase', { phase: 'await-roll', pid: p.id });
        if (p.bot) {
            botBuild(p);
            botConsiderTrade(p);                        // бот достраивает филиалы перед броском
            setTimeout(doRoll, 900 + rnd(700));
        }
    }

    function botBuild(p) {
        let guard = 8;
        while (guard-- > 0 && p.money > 4500) {
            const spot = D.TILES.find(t => t.type === 'prop' && canBuild(p.id, t.i));
            if (!spot) break;
            build(p.id, spot.i);
        }
    }

    /* ---------- бросок ---------- */
    async function doRoll() {
        if (S.phase !== 'await-roll') return;
        if (S.pendingOffer) return;      // ждём ответа на договор — ходить нельзя
        const p = cur();
        clearTimeout(S.timerId);
        S.phase = 'rolling';
        const a = 1 + rnd(6), b = 1 + rnd(6);   // потом: значения придут с сервера
        emit('phase', { phase: 'rolling', pid: p.id });
        await emitAsync('dice', a, b);          // ждём анимацию кубиков
        const dbl = a === b;
        if (dbl) S.doubles++;
        if (S.doubles >= 3) {
            log(p.id, `выбрасывает ${a}:${b} третий дубль подряд и отправляется в тюрьму`);
            return sendToJail(p);
        }
        log(p.id, `выбрасывает ${a}:${b}` + (dbl ? ' и получает ещё один ход, так как выпал дубль' : ''));
        moveBy(p, a + b, { diceSum: a + b, wasDouble: dbl });
    }
    function emitAsync(ev, ...a) {
        const fns = listeners[ev] || [];
        // ошибка анимации никогда не должна останавливать игру
        return Promise.all(fns.map(f =>
            Promise.resolve().then(() => f(...a)).catch(err =>
                console.warn(`[engine] слушатель "${ev}" упал:`, err && err.message))));
    }

    /* ---------- перемещение ---------- */
    async function moveBy(p, steps, ctx) {
        const from = p.pos;
        const to = ((p.pos + steps) % 40 + 40) % 40;
        await emitAsync('move', { pid: p.id, from, steps, to });   // UI гоняет фишку
        p.pos = to;
        if (steps > 0 && to < from) {           // прошёл Старт
            p.money += E.lapBonus;
            log(p.id, `проходит очередной круг и получает $${fmt(E.lapBonus)}`);
        }
        emit('state');
        landOn(p, ctx || {});
    }

    async function flyTo(p, idx, ctx) {
        const from = p.pos;
        await emitAsync('teleport', { pid: p.id, from, to: idx });
        p.pos = idx;
        if (idx <= from) {                   // перелетели через Старт
            p.money += E.lapBonus;
            log(p.id, `проходит очередной круг и получает $${fmt(E.lapBonus)}`);
        }
        emit('state');
        landOn(p, ctx || {});
    }

    function moveTo(p, idx, ctx) {
        const steps = ((idx - p.pos) % 40 + 40) % 40;
        moveBy(p, steps || 40, ctx || {});
    }

    /* ---------- обработка клетки ---------- */
    function landOn(p, ctx) {
        const t = D.TILES[p.pos];
        switch (t.type) {
            case 'start':
                p.money += E.landOnStartBonus;
                log(p.id, `останавливается на поле «Старт» и получает бонус в размере $${fmt(E.landOnStartBonus)}`);
                emit('state'); return endStep(ctx);
            case 'jail':
                log(p.id, `заглядывает в тюрьму как посетитель`);
                return endStep(ctx);
            case 'gotojail':
                log(p.id, `арестован полицией и отправляется в тюрьму`);
                return sendToJail(p);
            case 'casino':
                return openCasino(p, ctx);
            case 'tax': {
                let amount = t.taxKind === 'branches'
                    ? E.incomeTaxPerBranch * myBranchCount(p.id)
                    : E.luxuryTax;
                if (t.taxKind === 'branches' && amount === 0) {
                    log(p.id, `попадает на поле «Налог» — филиалов нет, платить нечего`);
                    return endStep(ctx);
                }
                log(p.id, `попадает на поле «${t.name}» и должен заплатить Банку $${fmt(amount)}`);
                return charge(p, amount, null, () => { log(p.id, 'оплачивает расходы'); endStep(ctx); });
            }
            case 'chance':
                return drawChance(p, ctx);
            case 'prop':
                return landOnProp(p, t, ctx);
        }
    }

    /* ---------- казино ----------
       Игрок выбирает от одного до трёх чисел и бросает один кубик.
       Угадал — забирает ставку, умноженную на 6 и делённую на число ставок
       (1 число → ×6, 2 → ×3, 3 → ×2). Независимо от исхода есть шанс 1/6
       сорвать суперприз. */
    function numsText(a) {
        return a.length === 1 ? String(a[0])
             : a.slice(0, -1).join(', ') + ' и ' + a[a.length - 1];
    }
    function casinoPayout(n) { return Math.round(E.casinoBet * 6 / n); }

    function openCasino(p, ctx) {
        log(p.id, `попадает на поле «Казино»`);
        S.phase = 'casino';
        S.casino = null;
        emit('phase', {
            phase: 'casino', pid: p.id,
            bet: E.casinoBet, jackpot: E.casinoJackpot,
            canBet: p.money >= E.casinoBet, ctx,
        });
        armTimer(() => casinoSkip(ctx));
        if (p.bot) setTimeout(() => botCasino(p, ctx), 1100 + rnd(900));
    }

    function casinoSkip(ctx) {
        if (S.phase !== 'casino') return;
        clearTimeout(S.timerId);
        const p = cur();
        S.casino = null;
        log(p.id, `отказывается от игры в казино`);
        endStep(ctx);
    }

    async function casinoPlay(nums, ctx, bet) {
        if (S.phase !== 'casino') return;
        const p = cur();
        const picked = [...new Set((nums || []).map(Number))]
            .filter(n => n >= 1 && n <= 6).slice(0, 3);
        /* ставку выбирает игрок: не меньше 100 и не больше наличных */
        const stake = Math.min(Math.max(parseInt(bet, 10) || E.casinoBet, 100), p.money);
        if (!picked.length || p.money < 100) return casinoSkip(ctx);

        clearTimeout(S.timerId);
        S.phase = 'casino-roll';
        p.money -= stake;
        const rolled = 1 + rnd(6);
        S.casino = { picked, rolled };
        log(p.id, `ставит $${fmt(stake)} на ${picked.length > 1 ? 'числа' : 'число'} ${numsText(picked)} и бросает кубик...`);
        emit('state');
        emit('phase', { phase: 'casino-roll', pid: p.id, picked, rolled, bet: stake, ctx });

        await emitAsync('dice', rolled, null);        // один настоящий кубик

        const win = picked.includes(rolled) ? Math.round(stake * 6 / picked.length) : 0;
        if (win) {
            p.money += win;
            log(p.id, `выбрасывает ${rolled} и выигрывает $${fmt(win)}!`);
        } else {
            log(p.id, `выбрасывает ${rolled} и теряет ставку`);
        }
        if (rnd(6) === 0) {
            p.money += E.casinoJackpot;
            log(p.id, `выигрывает суперприз и получает $${fmt(E.casinoJackpot)}!`);
        }
        S.casino = null;
        emit('state');
        endStep(ctx);
    }

    /** Бот: чаще ставит на два-три числа, иногда проходит мимо. */
    function botCasino(p, ctx) {
        if (S.phase !== 'casino') return;
        if (p.money < E.casinoBet * 2 || rnd(4) === 0) return casinoSkip(ctx);
        const pool = [1, 2, 3, 4, 5, 6].sort(() => Math.random() - .5);
        casinoPlay(pool.slice(0, 1 + rnd(3)).sort(), ctx, E.casinoBet);
    }

    function myBranchCount(pid) {
        return Object.entries(S.branches)
            .filter(([i]) => S.owners[i] === pid)
            .reduce((s, [, b]) => s + b, 0);
    }

    /* ---------- собственность ---------- */
    function groupTiles(g) { return D.TILES.filter(x => x.group === g); }
    function ownsFullGroup(pid, g) {
        return groupTiles(g).every(x => S.owners[x.i] === pid && S.mortgaged[x.i] == null);
    }
    function rentFor(i, ctx) {
        const t = D.TILES[i], pr = D.PROP[i], owner = S.owners[i];
        if (S.mortgaged[i] != null) return 0;
        if (pr.diceMult) {
            const n = groupTiles('gamedev').filter(x => S.owners[x.i] === owner).length;
            return (ctx.diceSum || 7) * pr.diceMult[Math.min(n, 2) - 1];
        }
        if (pr.carRent) {
            const n = groupTiles('cars').filter(x => S.owners[x.i] === owner).length;
            return pr.carRent[Math.min(n, 4) - 1];
        }
        const b = S.branches[i] || 0;
        let r = pr.rent[b];
        if (b === 0 && ownsFullGroup(owner, t.group)) r *= 2;  // монополия без филиалов ×2
        return r;
    }

    function landOnProp(p, t, ctx) {
        const owner = S.owners[t.i];
        if (!owner) {
            log(p.id, `попадает на **${t.name}** и задумывается о покупке`);
            S.phase = 'await-buy'; S.pendingBuy = t.i;
            emit('phase', { phase: 'await-buy', pid: p.id, tile: t.i, price: t.price, canBuy: p.money >= t.price, ctx });
            armTimer(() => resolveBuy(false, ctx));      // таймаут -> аукцион
            if (p.bot) setTimeout(() => resolveBuy(p.money >= t.price * 1.15, ctx), 900 + rnd(900));
            return;
        }
        if (owner === p.id || S.mortgaged[t.i] != null) return endStep(ctx);
        const rent = rentFor(t.i, ctx);
        log(p.id, `попадает на **${t.name}** и должен заплатить игроку @${S.players[owner].name} аренду в размере $${fmt(rent)}`);
        charge(p, rent, owner, () => {
            log(p.id, `заплатил $${fmt(rent)} аренды`);
            endStep(ctx);
        });
    }

    function resolveBuy(buy, ctx) {
        if (S.phase !== 'await-buy') return;
        const p = cur(), i = S.pendingBuy, t = D.TILES[i];
        clearTimeout(S.timerId);
        S.pendingBuy = null;
        if (buy && p.money >= t.price) {
            p.money -= t.price;
            S.owners[i] = p.id;
            log(p.id, `покупает **${t.name}** за $${fmt(t.price)}`);
            emit('state');
            return endStep(ctx);
        }
        log(p.id, `выставляет **${t.name}** на аукцион. Стартовая цена $${fmt(t.price)}`);
        startAuction(i, ctx);
    }

    /* ---------- аукцион ---------- */
    function startAuction(i, ctx) {
        const others = alive().filter(id => id !== cur().id && S.players[id].money >= D.TILES[i].price + 100);
        S.auction = { tile: i, price: D.TILES[i].price, queue: alive().slice(), idx: 0, ctx, active: {} };
        S.auction.queue.forEach(id => S.auction.active[id] = true);
        S.phase = 'auction';
        void others;
        auctionNext(true);
    }
    function auctionNext(first) {
        const A = S.auction;
        const act = A.queue.filter(id => A.active[id]);
        if (act.length === 1 && A.leader) return auctionFinish(A.leader);
        if (act.length === 0) return auctionFinish(null);
        do { A.idx = (A.idx + 1) % A.queue.length; } while (!A.active[A.queue[A.idx]]);
        const pid = A.queue[A.idx];
        if (pid === A.leader) return auctionFinish(pid);       // круг завершён
        const p = S.players[pid];
        emit('phase', { phase: 'auction', pid, tile: A.tile, price: A.price, next: A.price + 100 });
        armTimer(() => auctionPass(pid), 20);
        if (p.bot) {
            const want = D.TILES[A.tile].price * (1.1 + rnd(25) / 100);
            setTimeout(() => (A.price + 100 <= Math.min(want, p.money) ? auctionRaise(pid) : auctionPass(pid)), 800 + rnd(900));
        }
        void first;
    }
    function auctionRaise(pid) {
        const A = S.auction; if (!A || S.phase !== 'auction') return;
        clearTimeout(S.timerId);
        A.price += 100; A.leader = pid;
        log(pid, `поднимает цену до $${fmt(A.price)}`);
        auctionNext();
    }
    function auctionPass(pid) {
        const A = S.auction; if (!A || S.phase !== 'auction') return;
        clearTimeout(S.timerId);
        A.active[pid] = false;
        log(pid, `отказывается от участия в аукционе`);
        auctionNext();
    }
    function auctionFinish(winner) {
        const A = S.auction, t = D.TILES[A.tile];
        S.auction = null;
        if (winner) {
            const p = S.players[winner];
            p.money -= A.price;
            S.owners[A.tile] = winner;
            log(winner, `побеждает в аукционе и покупает **${t.name}** за $${fmt(A.price)}`);
        } else {
            log(null, `**${t.name}** никого не заинтересовал — остаётся у Банка`);
        }
        emit('state');
        endStep(A.ctx || {});
    }

    /* ---------- тюрьма ---------- */
    async function sendToJail(p) {
        await emitAsync('teleport', { pid: p.id, from: p.pos, to: 10 });
        p.pos = 10; p.jailed = true; p.jailTries = 0; S.doubles = 0;
        emit('state');
        nextTurn();
    }
    function jailPrompt() {
        const p = cur();
        S.phase = 'await-jail';
        emit('phase', { phase: 'await-jail', pid: p.id, fine: E.jailFine, canPay: p.money >= E.jailFine });
        armTimer(() => jailChoose(p.money >= E.jailFine ? 'pay' : 'roll'));
        if (p.bot) setTimeout(() => jailChoose(p.money >= E.jailFine * 3 ? 'pay' : 'roll'), 900);
    }
    async function jailChoose(mode) {
        if (S.phase !== 'await-jail') return;
        const p = cur();
        clearTimeout(S.timerId);
        if (mode === 'pay' && p.money >= E.jailFine) {
            p.money -= E.jailFine; p.jailed = false;
            log(p.id, `заплатил $${fmt(E.jailFine)} и вышел из тюрьмы`);
            emit('state');
            S.phase = 'await-roll';
            return doRoll();                // сразу бросаем, без лишнего клика
        }
        // попытка выбросить дубль
        S.phase = 'rolling';
        const a = 1 + rnd(6), b = 1 + rnd(6);
        await emitAsync('dice', a, b);
        if (a === b) {
            p.jailed = false;
            log(p.id, `выбрасывает ${a}:${b} — дубль! Выходит из тюрьмы`);
            return moveBy(p, a + b, { diceSum: a + b });
        }
        p.jailTries++;
        /* третья неудача — срок отбыт, выходим обязательно */
        if (p.jailTries >= 3) {
            p.jailed = false; p.jailTries = 0;
            log(p.id, `выбрасывает ${a}:${b} — третья неудача, платит $${fmt(E.jailFine)} и выходит`);
            if (p.money >= E.jailFine) {
                p.money -= E.jailFine;              // денег хватает — списываем сразу
                emit('state');
                return moveBy(p, a + b, { diceSum: a + b });
            }
            emit('state');
            return charge(p, E.jailFine, null, () => moveBy(p, a + b, { diceSum: a + b }));
        }
        log(p.id, `выбрасывает ${a}:${b} — не смог выбросить дубль и остаётся в тюрьме`);
        nextTurn();
    }

    /* ---------- сюрприз ---------- */
    function drawChance(p, ctx) {
        const card = S.chance[S.chanceIdx++ % S.chance.length];
        log(p.id, `тянет карточку «Сюрприз»: ${card.text}`);
        const ef = card.effect;
        if (ef.money > 0) { p.money += ef.money; emit('state'); return endStep(ctx); }
        if (ef.money < 0) return charge(p, -ef.money, null, () => endStep(ctx));
        if (ef.jail) return sendToJail(p);
        if (ef.moveTo != null) return flyTo(p, ef.moveTo, ctx);
        if (ef.moveBy) return moveBy(p, ef.moveBy, ctx);
        if (ef.perBranch) {
            const amt = -ef.perBranch * myBranchCount(p.id);
            if (!amt) return endStep(ctx);
            return charge(p, amt, null, () => endStep(ctx));
        }
        if (ef.fromEach) {
            alive().filter(id => id !== p.id).forEach(id => {
                const q = S.players[id];
                const pay = Math.min(ef.fromEach, q.money);
                q.money -= pay; p.money += pay;
            });
            emit('state'); return endStep(ctx);
        }
        endStep(ctx);
    }

    /* ---------- платежи и банкротство ---------- */
    /** ликвидационная стоимость: деньги + залог свободных полей + полцены филиалов */
    function liquidValue(pid) {
        let v = S.players[pid].money;
        for (const [i, o] of Object.entries(S.owners)) {
            if (o !== pid) continue;
            v += (S.branches[i] || 0) * Math.floor((D.PROP[i].branch || 0) / 2);
            if (S.mortgaged[i] == null) v += D.PROP[i].mortgage;
        }
        return v;
    }
    function payPayload() {
        const pp = S.pendingPay; if (!pp) return null;
        const p = S.players[pp.pid];
        const liq = liquidValue(pp.pid);
        return {
            phase: 'await-pay', pid: pp.pid,
            amount: pp.amount, toId: pp.toId,
            toName: pp.toId ? S.players[pp.toId].name : null,
            canPay: p.money >= pp.amount,
            enough: liq >= pp.amount,
            percent: Math.min(100, Math.round(pp.amount / Math.max(1, liq) * 100)),
        };
    }
    function charge(p, amount, toId, done) {
        if (p.bot) return autoCharge(p, amount, toId, done);
        S.phase = 'await-pay';
        S.pendingPay = { pid: p.id, amount, toId, done };
        emit('phase', payPayload());
        armTimer(() => forceResolvePay());
    }
    function pay() {
        const pp = S.pendingPay;
        if (!pp || S.phase !== 'await-pay') return false;
        const p = S.players[pp.pid];
        if (p.money < pp.amount) return false;
        clearTimeout(S.timerId);
        p.money -= pp.amount;
        if (pp.toId) S.players[pp.toId].money += pp.amount;
        S.pendingPay = null;
        emit('state');
        pp.done();
        return true;
    }
    function declareBankrupt() {
        const pp = S.pendingPay;
        if (!pp || S.phase !== 'await-pay') return;
        clearTimeout(S.timerId);
        const p = S.players[pp.pid];
        if (pp.toId) S.players[pp.toId].money += Math.max(0, p.money);
        p.money = 0;
        S.pendingPay = null;
        eliminate(pp.pid, pp.toId);
    }
    function forceResolvePay() {          // таймаут: закладываем всё и платим, иначе банкрот
        const pp = S.pendingPay; if (!pp) return;
        const p = S.players[pp.pid];
        for (const i of Object.keys(S.owners)) {
            if (p.money >= pp.amount) break;
            if (S.owners[i] === pp.pid && (S.branches[i] > 0)) {
                while (S.branches[i] > 0 && p.money < pp.amount) sellBranch(pp.pid, +i);
            }
        }
        for (const i of Object.keys(S.owners)) {
            if (p.money >= pp.amount) break;
            if (S.owners[i] === pp.pid && S.mortgaged[i] == null && !(S.branches[i] > 0))
                doMortgage(pp.pid, +i, true, true);   // вынужденно
        }
        if (p.money >= pp.amount) return pay();
        declareBankrupt();
    }
    function autoCharge(p, amount, toId, done) {
        if (p.money < amount) {
            for (const i of Object.keys(S.owners)) {
                if (p.money >= amount) break;
                if (S.owners[i] === p.id && S.mortgaged[i] == null && !(S.branches[i] > 0))
                    doMortgage(p.id, +i, true, true);
            }
        }
        if (p.money >= amount) {
            p.money -= amount;
            if (toId) S.players[toId].money += amount;
            emit('state');
            return done();
        }
        if (toId) S.players[toId].money += Math.max(0, p.money);
        p.money = 0;
        eliminate(p.id, toId);
    }
    /** актуальный payload текущей фазы — для перерисовки кнопок после залогов */
    function currentPhasePayload() {
        if (S.phase === 'await-pay') return payPayload();
        if (S.phase === 'await-buy' && S.pendingBuy != null) {
            const p = cur(), t = D.TILES[S.pendingBuy];
            return { phase: 'await-buy', pid: p.id, tile: t.i, price: t.price, canBuy: p.money >= t.price };
        }
        if (S.phase === 'auction' && S.auction) {
            const A = S.auction, pid = A.queue[A.idx];
            return { phase: 'auction', pid, tile: A.tile, price: A.price, next: A.price + 100 };
        }
        return null;
    }

    /** Имущество банкрота уходит Банку, а вырученные деньги — кредитору. */
    function eliminate(pid, toId) {
        const p = S.players[pid];
        if (!p || !p.alive) return;
        p.alive = false;

        let payout = Math.max(0, p.money);
        p.money = 0;
        Object.keys(S.owners).forEach(i => {
            if (S.owners[i] !== pid) return;
            const pr = D.PROP[i];
            if (pr) {
                payout += (S.branches[i] || 0) * Math.floor((pr.branch || 0) / 2);
                if (S.mortgaged[i] == null) payout += pr.mortgage;
            }
            delete S.owners[i]; delete S.branches[i]; delete S.mortgaged[i];
        });

        if (toId && S.players[toId] && payout > 0) {
            S.players[toId].money += payout;
            log(pid, `банкрот — имущество уходит Банку, @${S.players[toId].name} получает $${fmt(payout)}`);
        } else {
            log(pid, `банкрот — имущество возвращается Банку`);
        }
        if (toId) S.bankruptedBy[pid] = toId;
        emit('state');
        checkWin() || (cur().id === pid ? nextTurn() : null);
    }

    function surrender(pid) {
        const p = S.players[pid];
        if (!p || !p.alive) return;
        log(pid, `сдаётся`);
        p.alive = false;
        Object.keys(S.owners).forEach(i => {
            if (S.owners[i] === pid) { delete S.owners[i]; delete S.branches[i]; delete S.mortgaged[i]; }
        });
        emit('state');
        if (!checkWin() && cur().id === pid) { clearTimeout(S.timerId); nextTurn(); }
    }

    function checkWin() {
        const a = alive();
        if (a.length <= 1) {
            S.phase = 'ended'; S.winner = a[0] || null;
            clearTimeout(S.timerId);
            log(null, 'Игра завершена.');
            emit('phase', { phase: 'ended', winner: S.winner });
            emit('state');
            return true;
        }
        return false;
    }

    /* ---------- залог / выкуп / филиалы ---------- */
    /** Построен ли хоть один филиал на этой монополии. */
    function groupHasBranches(group) {
        return groupTiles(group).some(x => (S.branches[x.i] || 0) > 0);
    }
    function doMortgage(pid, i, silent, force) {
        const pr = D.PROP[i];
        if (S.owners[i] !== pid || S.mortgaged[i] != null || (S.branches[i] > 0)) return false;
        /* пока на монополии кто-то стоит, закладывать её нельзя;
           при вынужденной распродаже долга ограничение не действует */
        if (!force && groupOccupied(D.TILES[i].group)) return false;
        S.players[pid].money += pr.mortgage;
        S.mortgaged[i] = E.mortgageRounds;
        if (!silent) log(pid, `закладывает **${D.TILES[i].name}**`);
        else log(pid, `закладывает **${D.TILES[i].name}**`);
        emit('state');
        return true;
    }
    function doUnmortgage(pid, i) {
        const pr = D.PROP[i];
        if (S.owners[i] !== pid || S.mortgaged[i] == null || S.players[pid].money < pr.unmortgage) return false;
        S.players[pid].money -= pr.unmortgage;
        delete S.mortgaged[i];
        log(pid, `выкупает **${D.TILES[i].name}** из залога`);
        emit('state');
        return true;
    }
    function canBuild(pid, i) {
        const t = D.TILES[i], pr = D.PROP[i];
        if (!(pr && pr.branch && S.owners[i] === pid && S.mortgaged[i] == null
            && ownsFullGroup(pid, t.group) && (S.branches[i] || 0) < 5
            && S.players[pid].money >= pr.branch
            && cur().id === pid)) return false;
        if (S.builtGroups && S.builtGroups[t.group]) return false;      // 1 на группу за ход
        const min = Math.min(...groupTiles(t.group).map(x => S.branches[x.i] || 0));
        return (S.branches[i] || 0) === min;                            // равномерная застройка
    }
    function build(pid, i) {
        if (!canBuild(pid, i)) return false;
        S.players[pid].money -= D.PROP[i].branch;
        S.branches[i] = (S.branches[i] || 0) + 1;
        (S.builtGroups = S.builtGroups || {})[D.TILES[i].group] = true;
        log(pid, `строит филиал компании **${D.TILES[i].name}**. Аренда возрастает`);
        emit('state');
        return true;
    }
    function sellBranch(pid, i) {
        if (S.owners[i] !== pid || !(S.branches[i] > 0)) return false;
        S.players[pid].money += Math.floor(D.PROP[i].branch / 2);
        S.branches[i]--;
        log(pid, `продаёт филиал **${D.TILES[i].name}** за половину стоимости`);
        emit('state');
        return true;
    }

    /* ---------- конец шага / хода ---------- */
    function endStep(ctx) {
        if (S.phase === 'ended') return;
        if (ctx && ctx.wasDouble && cur().alive && !cur().jailed) {
            S.builtGroups = {};             // дубль — новый ход, лимит на постройку снимается
            S.phase = 'await-roll';
            emit('phase', { phase: 'await-roll', pid: cur().id });
            armTimer(() => doRoll());
            if (cur().bot) setTimeout(doRoll, 900 + rnd(500));
            return;
        }
        nextTurn();
    }

    function nextTurn() {
        if (S.phase === 'ended') return;
        clearTimeout(S.timerId);
        const prevIdx = S.turnIdx;
        do { S.turnIdx = (S.turnIdx + 1) % S.order.length; } while (!cur().alive);
        if (S.turnIdx <= prevIdx) {           // новый раунд
            S.round++;
            tickMortgages();
        }
        emit('state');
        beginTurn();
    }

    function tickMortgages() {
        for (const i of Object.keys(S.mortgaged)) {
            if (--S.mortgaged[i] <= 0) {
                log(S.owners[i], `залог **${D.TILES[i].name}** истёк — поле возвращается Банку`);
                delete S.mortgaged[i]; delete S.owners[i]; delete S.branches[i];
            }
        }
        emit('state');
    }

    /* ---------- договоры ---------- */
    function tradeValue(tiles, money) {
        return tiles.reduce((s, i) => s + D.TILES[i].price, 0) + (money || 0);
    }
    /** договор можно предлагать только в свой ход */
    function canTrade(pid) {
        return S.phase !== 'ended' && S.phase !== 'lobby'
            && cur() && cur().id === pid && S.players[pid] && S.players[pid].alive;
    }
    function validTrade(fromId, toId, deal) {
        const f = S.players[fromId], t = S.players[toId];
        if (!f || !t || !f.alive || !t.alive) return false;
        if (!canTrade(fromId)) return false;
        if ((deal.giveMoney || 0) > f.money || (deal.takeMoney || 0) > t.money) return false;
        return deal.giveTiles.every(i => S.owners[i] === fromId)
            && deal.takeTiles.every(i => S.owners[i] === toId);
    }
    function applyTrade(fromId, toId, deal) {
        if (!validTrade(fromId, toId, deal)) return false;
        deal.giveTiles.forEach(i => S.owners[i] = toId);
        deal.takeTiles.forEach(i => S.owners[i] = fromId);
        S.players[fromId].money += (deal.takeMoney || 0) - (deal.giveMoney || 0);
        S.players[toId].money   += (deal.giveMoney || 0) - (deal.takeMoney || 0);
        log(toId, `принимает договор игрока @${S.players[fromId].name}`);
        emit('state');
        return true;
    }
    /** бот оценивает входящее предложение */
    function botEvaluate(botId, deal) {
        // бот отдаёт takeTiles/takeMoney, получает giveTiles/giveMoney
        let gain = tradeValue(deal.giveTiles, deal.giveMoney);
        let loss = tradeValue(deal.takeTiles, deal.takeMoney);
        // поле, завершающее боту группу, ценнее в 1.6 раза
        deal.giveTiles.forEach(i => {
            const g = D.TILES[i].group;
            const rest = groupTiles(g).filter(x => x.i !== i);
            if (rest.every(x => S.owners[x.i] === botId)) gain += D.TILES[i].price * .6;
        });
        // не отдаёт поле из своей монополии дёшево
        deal.takeTiles.forEach(i => {
            if (ownsFullGroup(botId, D.TILES[i].group)) loss += D.TILES[i].price;
        });
        return gain >= loss * 0.95;
    }
    /** бот сам предлагает игроку сделку (шанс в начале хода) */
    function botConsiderTrade(bot) {
        if (rnd(100) > 22) return false;                 // не каждый ход
        for (const g of Object.keys(D.GROUPS)) {
            const tiles = groupTiles(g);
            const mine = tiles.filter(x => S.owners[x.i] === bot.id);
            const missing = tiles.filter(x => S.owners[x.i] && S.owners[x.i] !== bot.id);
            if (mine.length !== tiles.length - 1 || missing.length !== 1) continue;
            const target = missing[0], ownerId = S.owners[target.i];
            const owner = S.players[ownerId];
            if (!owner.alive || owner.bot) continue;     // предлагаем только человеку
            const offer = Math.round(target.price * 1.5 / 100) * 100;
            if (bot.money < offer) continue;
            const deal = { giveTiles: [], takeTiles: [target.i], giveMoney: offer, takeMoney: 0 };
            log(bot.id, `предлагает игроку @${owner.name} подписать договор`);
            S.pendingOffer = { fromId: bot.id, toId: ownerId, deal };
            emit('trade-offer', { fromId: bot.id, toId: ownerId, deal });
            armTimer(() => answerTrade(false, true));     // не ответили — идём дальше
            return true;
        }
        return false;
    }

    /** ответ человека на предложение бота; после него бот продолжает ход */
    function answerTrade(accept, byTimeout) {
        const off = S.pendingOffer;
        if (!off) return;
        S.pendingOffer = null;
        clearTimeout(S.timerId);
        if (accept) applyTrade(off.fromId, off.toId, off.deal);
        else log(off.toId, byTimeout ? `не успевает ответить на предложение` : `отклоняет договор`);
        const p = S.players[off.fromId];
        if (p && p.bot && cur().id === off.fromId && S.phase === 'await-roll')
            setTimeout(doRoll, 700);                      // бот дожидался — теперь ходит
    }

    /* ---------- публичное API ---------- */
    global.Engine = {
        S, on, start,
        roll: doRoll,
        buy: ctx => resolveBuy(true, ctx),
        toAuction: ctx => resolveBuy(false, ctx),
        auctionRaise: () => auctionRaise(S.auction && S.auction.queue[S.auction.idx]),
        auctionPass: () => auctionPass(S.auction && S.auction.queue[S.auction.idx]),
        jailPay: () => jailChoose('pay'),
        jailRoll: () => jailChoose('roll'),
        casinoBet: (nums, ctx, bet) => casinoPlay(nums, ctx, bet),
        casinoSkip: ctx => casinoSkip(ctx),
        mortgage: doMortgage, unmortgage: doUnmortgage,
        pay, declareBankrupt, currentPhasePayload, liquidValue,
        canBuild, groupHasBranches, build, sellBranch,
        surrender,
        applyTrade, validTrade, botEvaluate, tradeValue, answerTrade, canTrade,
        rentFor, ownsFullGroup,
        cur: () => cur(),
        me: () => S.order.find(id => !S.players[id].bot),
    };
})(window);
