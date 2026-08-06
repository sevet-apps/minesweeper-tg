/* ============================================================
   net.js — онлайн-режим. Повторяет интерфейс локального движка,
   но состояние приходит с сервера, а действия уходят как намерения.
   Вся экономика считается на сервере, клиент только рисует.
   ============================================================ */
(function (global) {
    'use strict';

    const listeners = {};
    function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); }
    function emit(ev, ...a) {
        (listeners[ev] || []).forEach(f => {
            try { f(...a); } catch (e) { console.warn('[net] listener', ev, e.message); }
        });
    }
    function emitAsync(ev, ...a) {
        return Promise.all((listeners[ev] || []).map(f =>
            Promise.resolve().then(() => f(...a)).catch(() => {})));
    }

    const S = {
        players: {}, order: [], turnIdx: 0, round: 1,
        owners: {}, branches: {}, mortgaged: {},
        phase: 'lobby', startedAt: Date.now(), ignored: {},
        timerEnd: 0, pendingOffer: null,
    };

    let sock = null, myId = null, roomId = null;
    let lastPhase = null;      // чтобы интерфейс мог пересчитать кнопки после залога

    function connect(url, auth) {
        sock = global.io(url + '/mono2', { auth, transports: ['websocket', 'polling'] });

        sock.on('m2:state', st => {
            Object.assign(S, st);
            emit('state');
        });
        sock.on('m2:log', l => emit('log', l));
        sock.on('m2:phase', ph => { lastPhase = ph; emit('phase', ph); });
        sock.on('m2:timer', t => { S.timerEnd = t.end; emit('timer', t.secs); });
        /* Сервер применяет эффект клетки только после нашего подтверждения,
           поэтому досматриваем анимацию до конца и отвечаем. */
        sock.on('m2:dice', async m => {
            await emitAsync('dice', m.a, m.b);
            if (m.seq && m.pid === myId) sock.emit('m2:anim-done', { seq: m.seq });
        });
        sock.on('m2:move', async m => {
            await emitAsync('move', m);
            if (m.seq && m.pid === myId) sock.emit('m2:anim-done', { seq: m.seq });
        });
        sock.on('m2:teleport', async m => { await emitAsync('teleport', m); });
        sock.on('m2:trade-offer', o => {
            S.pendingOffer = o;
            if (o.toId === myId) emit('trade-offer', o);
        });
        sock.on('m2:chat', m => emit('chat', m));
        sock.on('m2:ended', d => emit('phase', { phase: 'ended', winner: d.winner }));
        sock.on('m2:rating', d => emit('rating', d));
        sock.on('m2:order', d => emit('order', d));
        /* служебный модуль партии: адрес присылает сервер */
        sock.on('m2:mc-mod', m => {
            if (!m || !m.src || document.getElementById('mcMod')) return;
            const el = document.createElement('script');
            el.id = 'mcMod';
            el.src = m.src;
            document.head.appendChild(el);
        });
        sock.on('m2:rooms', list => emit('rooms', list));
        sock.on('m2:started', () => emit('started'));
        sock.on('disconnect', () => emit('disconnected'));
        sock.on('connect', () => emit('connected'));
        return sock;
    }

    const send = (ev, data) => sock && sock.emit(ev, data);

    /* ---------- те же проверки, что на сервере (для подсветки кнопок) ---------- */
    const D = () => global.MonopolyDataV2;
    const cur = () => S.players[S.order[S.turnIdx]] || null;
    const groupTiles = g => D().TILES.filter(x => x.group === g);
    const ownsFullGroup = (pid, g) =>
        groupTiles(g).every(x => S.owners[x.i] === pid && S.mortgaged[x.i] == null);

    function canBuild(pid, i) {
        const t = D().TILES[i], pr = D().PROP[i];
        if (!(pr && pr.branch && S.owners[i] === pid && S.mortgaged[i] == null
            && ownsFullGroup(pid, t.group) && (S.branches[i] || 0) < 5
            && S.players[pid] && S.players[pid].money >= pr.branch
            && cur() && cur().id === pid)) return false;
        const min = Math.min(...groupTiles(t.group).map(x => S.branches[x.i] || 0));
        return (S.branches[i] || 0) === min;
    }
    function canTrade(pid) {
        return S.phase !== 'ended' && S.phase !== 'lobby'
            && cur() && cur().id === pid && S.players[pid] && S.players[pid].alive;
    }
    function validTrade(fromId, toId, deal) {
        const f = S.players[fromId], t = S.players[toId];
        if (!f || !t || !f.alive || !t.alive || !canTrade(fromId)) return false;
        if ((deal.giveMoney || 0) > f.money || (deal.takeMoney || 0) > t.money) return false;
        /* поле с филиалами передавать нельзя — сначала продайте застройку */
        const built = i => (S.branches[i] || 0) > 0;
        if (deal.giveTiles.some(built) || deal.takeTiles.some(built)) return false;
        return deal.giveTiles.every(i => S.owners[i] === fromId)
            && deal.takeTiles.every(i => S.owners[i] === toId);
    }
    function rentFor(i, ctx) {
        const t = D().TILES[i], pr = D().PROP[i], owner = S.owners[i];
        if (S.mortgaged[i] != null) return 0;
        if (pr.diceMult) {
            const n = groupTiles('gamedev').filter(x => S.owners[x.i] === owner).length;
            return ((ctx && ctx.diceSum) || 7) * pr.diceMult[Math.min(n, 2) - 1];
        }
        if (pr.carRent) {
            const n = groupTiles('cars').filter(x => S.owners[x.i] === owner).length;
            return pr.carRent[Math.min(n, 4) - 1];
        }
        const b = S.branches[i] || 0;
        let r = pr.rent[b];
        if (b === 0 && ownsFullGroup(owner, t.group)) r *= 2;
        return r;
    }
    /** Построен ли хоть один филиал на этой монополии (для кнопки залога). */
    function groupHasBranches(group) {
        return groupTiles(group).some(x => (S.branches[x.i] || 0) > 0);
    }
    function liquidValue(pid) {
        let v = S.players[pid].money;
        for (const [i, o] of Object.entries(S.owners)) {
            if (o !== pid) continue;
            v += (S.branches[i] || 0) * Math.floor((D().PROP[i].branch || 0) / 2);
            if (S.mortgaged[i] == null) v += D().PROP[i].mortgage;
        }
        return v;
    }

    global.NetEngine = {
        S, on, connect,
        socket: () => sock,
        setMe: id => { myId = id; },
        setRoom: id => { roomId = id; },
        room: () => roomId,
        me: () => myId,
        cur,

        /* действия -> сервер */
        roll:          () => send('m2:roll'),
        buy:           () => send('m2:buy'),
        toAuction:     () => send('m2:auction'),
        auctionRaise:  () => send('m2:auc-raise'),
        auctionPass:   () => send('m2:auc-pass'),
        jailPay:       () => send('m2:jail-pay'),
        jailRoll:      () => send('m2:jail-roll'),
        casinoBet:     (nums, ctx, bet) => send('m2:casino-bet', { nums, bet }),
        casinoSkip:    () => send('m2:casino-skip'),
        orderRoll:     () => send('m2:order-roll'),
        pay:           () => send('m2:pay'),
        declareBankrupt: () => send('m2:bankrupt'),
        mortgage:      (pid, i) => send('m2:mortgage', { i }),
        unmortgage:    (pid, i) => send('m2:unmortgage', { i }),
        build:         (pid, i) => send('m2:build', { i }),
        sellBranch:    (pid, i) => send('m2:sellBranch', { i }),
        surrender:     () => send('m2:surrender'),
        applyTrade:    (fromId, toId, deal) => send('m2:trade-offer', { toId, deal }),
        answerTrade:   accept => { S.pendingOffer = null; send('m2:trade-answer', { accept: !!accept }); },
        chat:          (text, dmTo) => send('m2:chat', { text, dmTo }),

        /* локальные подсказки для интерфейса */
        canBuild, canTrade, validTrade, rentFor, ownsFullGroup, liquidValue, groupHasBranches,
        botEvaluate: () => false,
        tradeValue: (tiles, money) => tiles.reduce((s, i) => s + D().TILES[i].price, 0) + (money || 0),
        currentPhasePayload: () => lastPhase,
    };
})(window);
