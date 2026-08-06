/* ============================================================
   monopoly-bots.js — боты для сетевой партии.

   Свободные места в комнате можно занять ботами. Ходят они
   как обычные участники: бросают кубики, покупают поля, торгуются
   на аукционе, строят филиалы, играют в казино, отвечают на договоры
   и участвуют в жеребьёвке очерёдности.

   Модуль ничего не решает сам — он лишь смотрит на объявленную сервером
   фазу и вызывает те же публичные методы игры, что и живой игрок,
   поэтому обойти правила бот не может.
   ============================================================ */
'use strict';

const path = require('path');
require(path.join(__dirname, '..', 'monopoly', 'js', 'board-data-v2.js'));
const D = global.MonopolyDataV2;
const E = D.ECONOMY;

const rnd = n => Math.floor(Math.random() * n);
const pause = (min, spread) => min + rnd(spread);

/** Думает ли бот прямо сейчас — чтобы не отвечать дважды на одну фазу. */
const BUSY = new Set();

function isBot(g, id) {
    const p = g.players[id];
    return !!(p && p.bot);
}

/* ---------- оценка сделок ---------- */
function tileValue(g, i) {
    const t = D.TILES[i], pr = D.PROP[i];
    if (!t || !pr) return 0;
    return (t.price || 0) + (g.branches[i] || 0) * (pr.branch || 0);
}
function groupTiles(group) {
    return D.TILES.filter(t => t.group === group);
}
/** Выгодна ли боту предложенная сделка. */
function evaluate(g, botId, deal) {
    let gain = (deal.giveTiles || []).reduce((a, i) => a + tileValue(g, i), 0)
        + (deal.giveMoney || 0);
    let loss = (deal.takeTiles || []).reduce((a, i) => a + tileValue(g, i), 0)
        + (deal.takeMoney || 0);

    /* поле, замыкающее монополию, для бота дороже */
    (deal.giveTiles || []).forEach(i => {
        const rest = groupTiles(D.TILES[i].group).filter(x => x.i !== i);
        if (rest.length && rest.every(x => g.owners[x.i] === botId))
            gain += (D.TILES[i].price || 0) * 0.6;
    });
    /* из собственной монополии дёшево не отдаёт */
    (deal.takeTiles || []).forEach(i => {
        const tiles = groupTiles(D.TILES[i].group);
        if (tiles.every(x => g.owners[x.i] === botId))
            loss += (D.TILES[i].price || 0);
    });
    /* не остаётся без денег */
    const after = g.players[botId].money + (deal.giveMoney || 0) - (deal.takeMoney || 0);
    if (after < 500) return false;

    return gain >= loss * 0.95;
}

/* ---------- действия по фазам ---------- */
function act(g, ph) {
    if (!g || !ph || !ph.pid || !isBot(g, ph.pid)) return;
    const id = ph.pid;
    const key = g.roomId + ':' + ph.phase + ':' + id;
    if (BUSY.has(key)) return;
    BUSY.add(key);
    const done = () => BUSY.delete(key);

    const later = (ms, fn) => setTimeout(() => { done(); try { fn(); } catch (e) {} }, ms);
    const p = g.players[id];

    switch (ph.phase) {
        case 'await-roll':
            /* перед броском бот достраивает филиалы и иногда предлагает сделку */
            build(g, id);
            return later(pause(900, 700), () => g.roll(id));

        case 'await-buy': {
            const price = D.TILES[ph.tile] ? D.TILES[ph.tile].price : 0;
            /* покупает, если после покупки останется запас */
            const buy = p.money >= price * 1.15;
            return later(pause(900, 800), () => buy ? g.buy(id) : g.toAuction(id));
        }

        case 'auction': {
            const t = D.TILES[ph.tile];
            const limit = (t && t.price ? t.price : 0) * (1.1 + Math.random() * 0.35);
            const raise = ph.next <= limit && p.money >= ph.next * 1.2;
            return later(pause(700, 800), () => raise ? g.aucRaise(id) : g.aucPass(id));
        }

        case 'await-pay':
            /* платит, если может; иначе объявляет банкротство —
               распродажу активов сервер сделает сам */
            return later(pause(800, 600), () =>
                p.money >= ph.amount ? g.pay(id) : g.bankrupt(id));

        case 'await-jail':
            return later(pause(800, 500), () =>
                p.money >= E.jailFine * 3 ? g.jailChoose(id, 'pay') : g.jailChoose(id, 'roll'));

        case 'casino': {
            if (p.money < E.casinoBet * 2 || rnd(4) === 0)
                return later(pause(900, 600), () => g.casinoSkip(id));
            const pool = [1, 2, 3, 4, 5, 6].sort(() => Math.random() - 0.5);
            const nums = pool.slice(0, 1 + rnd(3)).sort();
            return later(pause(1000, 800), () => g.casinoPlay(id, nums, E.casinoBet));
        }

        default:
            done();
    }
}

/** Достройка филиалов: пока хватает запаса наличных. */
function build(g, id) {
    const p = g.players[id];
    let guard = 6;
    while (guard-- > 0 && p.money > 4500) {
        const spot = D.TILES.find(t => t.type === 'prop' && g.canBuild(id, t.i));
        if (!spot) break;
        g.build(id, spot.i);
    }
}

/** Ответ на предложенный договор. */
function onTradeOffer(g, toId, fromId, deal) {
    if (!isBot(g, toId)) return;
    setTimeout(() => {
        try { g.tradeAnswer(toId, evaluate(g, toId, deal)); } catch (e) {}
    }, pause(1400, 1200));
}

/** Бросок в жеребьёвке очерёдности. */
function onOrderTurn(g, id) {
    if (!isBot(g, id)) return;
    setTimeout(() => { try { g.orderDoRoll(id, false); } catch (e) {} }, pause(1100, 900));
}

/** Уборка при закрытии комнаты. */
function forget(roomId) {
    for (const k of [...BUSY]) if (k.startsWith(roomId + ':')) BUSY.delete(k);
}

module.exports = { act, onTradeOffer, onOrderTurn, evaluate, forget, isBot };
