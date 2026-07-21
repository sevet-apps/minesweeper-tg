/* ============================================================
   monopoly-engine.js
   Server-authoritative Monopoly game engine.

   Mirrors classic Monopoly rules on the server. Every state
   mutation goes through serverApplyAction(). Clients send only
   intents — they never mutate state, they only render whatever
   the server broadcasts.

   This module is currently being migrated to incrementally. Some
   actions are still passed through to the client snapshot model;
   each release moves more rules under the server's authority.

   API:
     Engine.createGame(playerSlots)        → state
     Engine.applyAction(state, sender, action) → { ok, error, events }
     Engine.serialize(state)               → safe snapshot for a client
     Engine.publicView(state, viewerPlayerId) → state with private data hidden
   ============================================================ */

'use strict';

// ---------- Board static data (mirror of monopoly/js/board-data.js) ----------
const TILES = [
    { i: 0,  type: 'corner',   name: 'GO' },
    { i: 1,  type: 'property', name: 'Mediterranean', group: 'brown',     price: 60 },
    { i: 2,  type: 'chest',    name: 'Community' },
    { i: 3,  type: 'property', name: 'Baltic',        group: 'brown',     price: 60 },
    { i: 4,  type: 'tax',      name: 'Income Tax',    amount: 200 },
    { i: 5,  type: 'railroad', name: 'Reading',                            price: 200 },
    { i: 6,  type: 'property', name: 'Oriental',      group: 'lightblue', price: 100 },
    { i: 7,  type: 'chance',   name: 'Chance' },
    { i: 8,  type: 'property', name: 'Vermont',       group: 'lightblue', price: 100 },
    { i: 9,  type: 'property', name: 'Connecticut',   group: 'lightblue', price: 120 },
    { i: 10, type: 'corner',   name: 'JAIL' },
    { i: 11, type: 'property', name: 'St. Charles',   group: 'pink',      price: 140 },
    { i: 12, type: 'utility',  name: 'Electric Co',   price: 150 },
    { i: 13, type: 'property', name: 'States',        group: 'pink',      price: 140 },
    { i: 14, type: 'property', name: 'Virginia',      group: 'pink',      price: 160 },
    { i: 15, type: 'railroad', name: 'Pennsylvania',  price: 200 },
    { i: 16, type: 'property', name: 'St. James',     group: 'orange',    price: 180 },
    { i: 17, type: 'chest',    name: 'Community' },
    { i: 18, type: 'property', name: 'Tennessee',     group: 'orange',    price: 180 },
    { i: 19, type: 'property', name: 'New York',      group: 'orange',    price: 200 },
    { i: 20, type: 'corner',   name: 'FREE PARKING' },
    { i: 21, type: 'property', name: 'Kentucky',      group: 'red',       price: 220 },
    { i: 22, type: 'chance',   name: 'Chance' },
    { i: 23, type: 'property', name: 'Indiana',       group: 'red',       price: 220 },
    { i: 24, type: 'property', name: 'Illinois',      group: 'red',       price: 240 },
    { i: 25, type: 'railroad', name: 'B & O',                              price: 200 },
    { i: 26, type: 'property', name: 'Atlantic',      group: 'yellow',    price: 260 },
    { i: 27, type: 'property', name: 'Ventnor',       group: 'yellow',    price: 260 },
    { i: 28, type: 'utility',  name: 'Water Works',   price: 150 },
    { i: 29, type: 'property', name: 'Marvin',        group: 'yellow',    price: 280 },
    { i: 30, type: 'corner',   name: 'GO TO JAIL' },
    { i: 31, type: 'property', name: 'Pacific',       group: 'green',     price: 300 },
    { i: 32, type: 'property', name: 'N. Carolina',   group: 'green',     price: 300 },
    { i: 33, type: 'chest',    name: 'Community' },
    { i: 34, type: 'property', name: 'Pennsylvania',  group: 'green',     price: 320 },
    { i: 35, type: 'railroad', name: 'Short Line',    price: 200 },
    { i: 36, type: 'chance',   name: 'Chance' },
    { i: 37, type: 'property', name: 'Park Place',    group: 'blue',      price: 350 },
    { i: 38, type: 'tax',      name: 'Luxury Tax',    amount: 100 },
    { i: 39, type: 'property', name: 'Boardwalk',     group: 'blue',      price: 400 },
];

const PROPERTY_DATA = {
    1:  { houseCost: 50,  mortgage: 30,  rent: [2,  10, 30,  90,  160, 250] },
    3:  { houseCost: 50,  mortgage: 30,  rent: [4,  20, 60,  180, 320, 450] },
    6:  { houseCost: 50,  mortgage: 50,  rent: [6,  30, 90,  270, 400, 550] },
    8:  { houseCost: 50,  mortgage: 50,  rent: [6,  30, 90,  270, 400, 550] },
    9:  { houseCost: 50,  mortgage: 60,  rent: [8,  40, 100, 300, 450, 600] },
    11: { houseCost: 100, mortgage: 70,  rent: [10, 50, 150, 450, 625, 750] },
    13: { houseCost: 100, mortgage: 70,  rent: [10, 50, 150, 450, 625, 750] },
    14: { houseCost: 100, mortgage: 80,  rent: [12, 60, 180, 500, 700, 900] },
    16: { houseCost: 100, mortgage: 90,  rent: [14, 70, 200, 550, 750, 950] },
    18: { houseCost: 100, mortgage: 90,  rent: [14, 70, 200, 550, 750, 950] },
    19: { houseCost: 100, mortgage: 100, rent: [16, 80, 220, 600, 800, 1000] },
    21: { houseCost: 150, mortgage: 110, rent: [18, 90, 250, 700, 875, 1050] },
    23: { houseCost: 150, mortgage: 110, rent: [18, 90, 250, 700, 875, 1050] },
    24: { houseCost: 150, mortgage: 120, rent: [20, 100,300, 750, 925, 1100] },
    26: { houseCost: 150, mortgage: 130, rent: [22, 110,330, 800, 975, 1150] },
    27: { houseCost: 150, mortgage: 130, rent: [22, 110,330, 800, 975, 1150] },
    29: { houseCost: 150, mortgage: 140, rent: [24, 120,360, 850, 1025,1200] },
    31: { houseCost: 200, mortgage: 150, rent: [26, 130,390, 900, 1100,1275] },
    32: { houseCost: 200, mortgage: 150, rent: [26, 130,390, 900, 1100,1275] },
    34: { houseCost: 200, mortgage: 160, rent: [28, 150,450, 1000,1200,1400] },
    37: { houseCost: 200, mortgage: 175, rent: [35, 175,500, 1100,1300,1500] },
    39: { houseCost: 200, mortgage: 200, rent: [50, 200,600, 1400,1700,2000] },
    5:  { mortgage: 100, rent: [25, 50, 100, 200] },
    15: { mortgage: 100, rent: [25, 50, 100, 200] },
    25: { mortgage: 100, rent: [25, 50, 100, 200] },
    35: { mortgage: 100, rent: [25, 50, 100, 200] },
    12: { mortgage: 75 },
    28: { mortgage: 75 },
};

// Pre-compute which group each property belongs to and group sizes (for rent
// doubling on monopoly), and which tiles each group contains.
const GROUPS = {};
for (const t of TILES) {
    if (t.type === 'property' && t.group) {
        if (!GROUPS[t.group]) GROUPS[t.group] = [];
        GROUPS[t.group].push(t.i);
    }
}

// ---------- State factory ----------
function createGame(playerSlots) {
    // playerSlots: [{ oderId, username }, ...]
    const players = playerSlots.map((s, i) => ({
        idx: i,
        oderId: s.oderId,
        username: s.username,
        photo_url: s.photo_url || '',
        money: 1500,
        position: 0,
        lap: 0,
        inJail: false,
        jailTurns: 0,
        bankrupt: false,
        ownedTiles: [],     // tile indices
        mortgaged: [],      // subset of ownedTiles
        houses: {},         // tileIdx -> 0..5  (5 = hotel)
    }));

    return {
        players,
        turnIdx: 0,
        phase: 'awaiting_roll',     // awaiting_roll | resolving | post_roll | game_over
        lastRoll: null,             // { a, b, doubles, sum }
        consecutiveDoubles: 0,
        currentDecision: null,      // { type: 'buy'|'auction'|'rent_due'|..., tileIdx, amount, ... }
        pendingAuction: null,
        pendingTrade: null,
        // Shuffled card decks (indices into CHANCE_CARDS / CHEST_CARDS)
        chanceOrder: shuffledIdx(CHANCE_CARDS.length),
        chestOrder: shuffledIdx(CHEST_CARDS.length),
        chancePtr: 0,
        chestPtr: 0,
        log: [],                    // recent events for the activity feed
        createdAt: Date.now(),
        finishedAt: null,
        winnerIdx: null,
    };
}

// ---------- Pure helpers ----------
function tileOwnerIdx(state, tileIdx) {
    for (const p of state.players) {
        if (p.ownedTiles.includes(tileIdx)) return p.idx;
    }
    return -1;
}

function isMortgaged(state, tileIdx) {
    const ownerIdx = tileOwnerIdx(state, tileIdx);
    if (ownerIdx === -1) return false;
    return state.players[ownerIdx].mortgaged.includes(tileIdx);
}

function calcRent(state, tileIdx, diceSum) {
    const tile = TILES[tileIdx];
    const data = PROPERTY_DATA[tileIdx];
    if (!data) return 0;
    if (isMortgaged(state, tileIdx)) return 0;
    const ownerIdx = tileOwnerIdx(state, tileIdx);
    if (ownerIdx === -1) return 0;
    const owner = state.players[ownerIdx];

    if (tile.type === 'property') {
        const houses = owner.houses[tileIdx] || 0;
        if (houses > 0) return data.rent[houses];
        // Base rent: doubled if owner has the whole color group
        const groupTiles = GROUPS[tile.group] || [];
        const ownsAll = groupTiles.every(t => owner.ownedTiles.includes(t));
        return ownsAll ? data.rent[0] * 2 : data.rent[0];
    }
    if (tile.type === 'railroad') {
        const owned = [5, 15, 25, 35].filter(t => owner.ownedTiles.includes(t)).length;
        return data.rent[owned - 1] || 0;
    }
    if (tile.type === 'utility') {
        const owned = [12, 28].filter(t => owner.ownedTiles.includes(t)).length;
        const multiplier = (owned === 2) ? 10 : 4;
        return (diceSum || 0) * multiplier;
    }
    return 0;
}

// ---------- Card decks (server-side, mirrors client texts) ----------
// fx: m=money delta, go={t:tile,a:awardGo}, back=N steps, jail=1, bday=1
const CHANCE_CARDS = [
    { id:'c1',  title:'Идите на СТАРТ', description:'Получите $200 при прохождении.', fx:{ go:{t:0,a:1} } },
    { id:'c2',  title:'Банковский дивиденд', description:'Банк выплачивает вам $50. Не транжирьте.', fx:{ m:50 } },
    { id:'c3',  title:'Штраф от полиции', description:'Превысили скорость в жилой зоне. $15 в казну.', fx:{ m:-15 } },
    { id:'c4',  title:'Ремонт улиц', description:'Город ремонтирует ваши улицы. Заплатите $40 муниципалитету.', fx:{ m:-40 } },
    { id:'c5',  title:'Идите на Boardwalk', description:'Свежий воздух у моря не повредит.', fx:{ go:{t:39,a:0} } },
    { id:'c6',  title:'Идите на St. Charles Place', description:'Если пройдёте СТАРТ — получите $200.', fx:{ go:{t:11,a:1} } },
    { id:'c7',  title:'Премия за красоту', description:'Вас выбрали мисс/мистер Монополия. Получите $10.', fx:{ m:10 } },
    { id:'c8',  title:'Назад на 3 клетки', description:'Передумали? Возвращайтесь.', fx:{ back:3 } },
    { id:'c9',  title:'Выигрыш в лотерею', description:'Вы случайно нашли в кармане билет. Получите $100.', fx:{ m:100 } },
    { id:'c10', title:'Идите в тюрьму', description:'Не проходите СТАРТ, не получайте $200.', fx:{ jail:1 } },
    { id:'c11', title:'Налог на роскошь', description:'Соседи завидуют вашему BMW. Заплатите $75.', fx:{ m:-75 } },
    { id:'c12', title:'Идите на Reading Railroad', description:'Если пройдёте СТАРТ — получите $200.', fx:{ go:{t:5,a:1} } },
    { id:'c13', title:'Инвестиции в стартап', description:'Ваш племянник занял $50 «на будущее».', fx:{ m:-50 } },
    { id:'c14', title:'Возврат акций', description:'Брокер вернул депозит. $150 ваши.', fx:{ m:150 } },
];
const CHEST_CARDS = [
    { id:'b1',  title:'Идите на СТАРТ', description:'Получите $200 при прохождении.', fx:{ go:{t:0,a:1} } },
    { id:'b2',  title:'Возврат от банка', description:'Ошибка в вашу пользу. Получите $200.', fx:{ m:200 } },
    { id:'b3',  title:'Доктор', description:'Простуда на пустом месте. Оплатите визит $50.', fx:{ m:-50 } },
    { id:'b4',  title:'Дивиденды от акций', description:'Старые бумаги принесли $50.', fx:{ m:50 } },
    { id:'b5',  title:'Возврат налога', description:'Бухгалтерия удивила. Получите $20.', fx:{ m:20 } },
    { id:'b6',  title:'День рождения!', description:'Каждый игрок дарит вам $10.', fx:{ bday:1 } },
    { id:'b7',  title:'Страховая выплата', description:'Соседский кот разбил вашу вазу. $100 от страховой.', fx:{ m:100 } },
    { id:'b8',  title:'Школьный сбор', description:'На ремонт классов. $50 школе.', fx:{ m:-50 } },
    { id:'b9',  title:'Наследство', description:'Дальний родственник вспомнил о вас. $100 ваши.', fx:{ m:100 } },
    { id:'b10', title:'Алименты', description:'Бывшая в курсе ваших успехов. Заплатите $100.', fx:{ m:-100 } },
    { id:'b11', title:'В тюрьму', description:'Соседи донесли. Не проходите СТАРТ.', fx:{ jail:1 } },
    { id:'b12', title:'Книжный гонорар', description:'Мемуары неожиданно популярны. $25.', fx:{ m:25 } },
    { id:'b13', title:'Победа в покере', description:'Партия с приятелями оказалась прибыльной. $50.', fx:{ m:50 } },
    { id:'b14', title:'Услуги сантехника', description:'Снова прорыв в подвале. $40 мастеру.', fx:{ m:-40 } },
];

function shuffledIdx(n) {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ---------- Action dispatcher ----------
// Returns { ok: true, events: [...] } or { ok: false, error: 'message' }.
// Events are { type, ...payload } objects that the server will broadcast
// to all clients in the room.
function applyAction(state, senderIdx, action) {
    if (!state || state.phase === 'game_over') {
        return { ok: false, error: 'game_over' };
    }
    if (!action || typeof action.type !== 'string') {
        return { ok: false, error: 'malformed_action' };
    }

    const active = state.players[state.turnIdx];
    if (!active) return { ok: false, error: 'no_active_player' };

    switch (action.type) {
        case 'ROLL_DICE':       return handleRollDice(state, senderIdx);
        case 'BUY':             return handleBuy(state, senderIdx);
        case 'DECLINE':         return handleDecline(state, senderIdx);
        case 'END_TURN':        return handleEndTurn(state, senderIdx);
        case 'BUILD_HOUSE':     return handleBuildHouse(state, senderIdx, action);
        case 'SELL_HOUSE':      return handleSellHouse(state, senderIdx, action);
        case 'MORTGAGE':        return handleMortgage(state, senderIdx, action);
        case 'UNMORTGAGE':      return handleUnmortgage(state, senderIdx, action);
        case 'JAIL_PAY':        return handleJailPay(state, senderIdx);
        case 'SURRENDER':       return handleSurrender(state, senderIdx);
        case 'AUCTION_BID':     return handleAuctionBid(state, senderIdx);
        case 'AUCTION_PASS':    return handleAuctionPass(state, senderIdx);
        case 'TRADE_PROPOSE':   return handleTradePropose(state, senderIdx, action);
        case 'TRADE_RESPONSE':  return handleTradeResponse(state, senderIdx, action);
        default:
            return { ok: false, error: 'unknown_action' };
    }
}

function ensureSendersTurn(state, senderIdx) {
    if (senderIdx !== state.turnIdx) {
        return { ok: false, error: 'not_your_turn' };
    }
    const p = state.players[senderIdx];
    if (p.bankrupt) return { ok: false, error: 'bankrupt' };
    return { ok: true };
}

function handleRollDice(state, senderIdx) {
    const turn = ensureSendersTurn(state, senderIdx);
    if (!turn.ok) return turn;
    if (state.phase !== 'awaiting_roll') {
        return { ok: false, error: 'not_in_roll_phase' };
    }
    const a = 1 + Math.floor(Math.random() * 6);
    const b = 1 + Math.floor(Math.random() * 6);
    const doubles = a === b;
    state.lastRoll = { a, b, doubles, sum: a + b };

    const player = state.players[senderIdx];
    const events = [{ type: 'DICE_ROLLED', playerIdx: senderIdx, a, b }];

    // Jail handling (escape via doubles only)
    if (player.inJail) {
        if (doubles) {
            player.inJail = false;
            player.jailTurns = 0;
            events.push({ type: 'JAIL_RELEASED', playerIdx: senderIdx, reason: 'doubles' });
            // Continue to move
        } else {
            player.jailTurns += 1;
            if (player.jailTurns >= 3) {
                // Forced exit, pay $50 (or bankrupt — handled as a follow-up
                // decision later; for now we deduct unconditionally)
                player.money -= 50;
                player.inJail = false;
                player.jailTurns = 0;
                events.push({ type: 'JAIL_FORCED_OUT', playerIdx: senderIdx, paid: 50 });
                // Move below
            } else {
                events.push({ type: 'JAIL_STAY', playerIdx: senderIdx, attempts: player.jailTurns });
                // Pass turn
                advanceTurn(state);
                state.phase = 'awaiting_roll';
                events.push({ type: 'TURN_ENDED', nextIdx: state.turnIdx });
                return { ok: true, events };
            }
        }
    }

    // Doubles counter outside jail
    if (doubles && !player.inJail) {
        state.consecutiveDoubles += 1;
        if (state.consecutiveDoubles >= 3) {
            // Three doubles = jail
            state.consecutiveDoubles = 0;
            sendToJail(player);
            events.push({ type: 'JAILED_THREE_DOUBLES', playerIdx: senderIdx });
            advanceTurn(state);
            state.phase = 'awaiting_roll';
            events.push({ type: 'TURN_ENDED', nextIdx: state.turnIdx });
            return { ok: true, events };
        }
    } else {
        state.consecutiveDoubles = 0;
    }

    // Move
    const oldPos = player.position;
    const newPos = (oldPos + state.lastRoll.sum) % 40;
    if (newPos < oldPos) {
        // Passed GO
        player.money += 200;
        player.lap += 1;
        events.push({ type: 'GO_BONUS', playerIdx: senderIdx });
    }
    player.position = newPos;
    events.push({ type: 'MOVED', playerIdx: senderIdx, from: oldPos, to: newPos, sum: state.lastRoll.sum });

    // Resolve landing
    const resolvedEvents = resolveLanding(state, senderIdx);
    events.push(...resolvedEvents);

    return { ok: true, events };
}

function resolveLanding(state, playerIdx, depth = 0) {
    const player = state.players[playerIdx];
    const tile = TILES[player.position];
    const events = [];

    // GO TO JAIL corner
    if (tile.type === 'corner' && tile.i === 30) {
        sendToJail(player);
        events.push({ type: 'JAILED', playerIdx, reason: 'go_to_jail_tile' });
        advanceTurn(state);
        state.phase = 'awaiting_roll';
        events.push({ type: 'TURN_ENDED', nextIdx: state.turnIdx });
        return events;
    }

    // Tax
    if (tile.type === 'tax') {
        const amount = tile.amount || 100;
        if (player.money >= amount) {
            player.money -= amount;
            events.push({ type: 'TAX_PAID', playerIdx, tileIdx: tile.i, amount });
            state.phase = state.lastRoll.doubles ? 'awaiting_roll' : 'post_roll';
            if (!state.lastRoll.doubles) {
                events.push({ type: 'TURN_READY_TO_END', playerIdx });
            }
        } else {
            // Insufficient funds — client should trigger sell/mortgage flow,
            // but for now we just bankrupt the player.
            bankrupt(state, playerIdx);
            events.push({ type: 'BANKRUPT', playerIdx, reason: 'tax' });
            advanceTurn(state);
            state.phase = 'awaiting_roll';
            events.push({ type: 'TURN_ENDED', nextIdx: state.turnIdx });
        }
        return events;
    }

    // Chance / Chest — server draws a card and applies its effect
    if (tile.type === 'chance' || tile.type === 'chest') {
        events.push(...drawAndApplyCard(state, playerIdx, tile.type, depth));
        return events;
    }

    // Purchasable
    if (tile.type === 'property' || tile.type === 'railroad' || tile.type === 'utility') {
        const ownerIdx = tileOwnerIdx(state, tile.i);
        if (ownerIdx === -1) {
            // Free — present buy decision to player
            const tilePrice = tile.price;
            state.currentDecision = { type: 'buy_or_decline', tileIdx: tile.i, price: tilePrice };
            state.phase = 'awaiting_buy_decision';
            events.push({ type: 'BUY_OFFERED', playerIdx, tileIdx: tile.i, price: tilePrice });
            return events;
        }
        if (ownerIdx === playerIdx) {
            // Own tile: nothing
            state.phase = state.lastRoll.doubles ? 'awaiting_roll' : 'post_roll';
            if (!state.lastRoll.doubles) {
                events.push({ type: 'TURN_READY_TO_END', playerIdx });
            }
            return events;
        }
        // Owned by someone else — rent unless mortgaged
        if (isMortgaged(state, tile.i)) {
            state.phase = state.lastRoll.doubles ? 'awaiting_roll' : 'post_roll';
            if (!state.lastRoll.doubles) {
                events.push({ type: 'TURN_READY_TO_END', playerIdx });
            }
            return events;
        }
        const rent = calcRent(state, tile.i, state.lastRoll.sum);
        if (rent <= 0) {
            state.phase = state.lastRoll.doubles ? 'awaiting_roll' : 'post_roll';
            return events;
        }
        const owner = state.players[ownerIdx];
        if (player.money >= rent) {
            player.money -= rent;
            owner.money += rent;
            events.push({ type: 'RENT_PAID', playerIdx, ownerIdx, tileIdx: tile.i, amount: rent });
            state.phase = state.lastRoll.doubles ? 'awaiting_roll' : 'post_roll';
            if (!state.lastRoll.doubles) {
                events.push({ type: 'TURN_READY_TO_END', playerIdx });
            }
        } else {
            // Not enough — bankruptcy (until sell/mortgage UI flows are
            // server-driven, this is the safe default)
            const cash = Math.max(0, player.money);
            owner.money += cash;
            player.money = 0;
            // Transfer all owned to creditor
            transferAllOwned(state, playerIdx, ownerIdx);
            bankrupt(state, playerIdx);
            events.push({ type: 'BANKRUPT', playerIdx, creditorIdx: ownerIdx, reason: 'rent' });
            advanceTurn(state);
            state.phase = 'awaiting_roll';
            events.push({ type: 'TURN_ENDED', nextIdx: state.turnIdx });
            checkGameOver(state, events);
        }
        return events;
    }

    // Corner free parking / just visiting / GO → nothing
    state.phase = state.lastRoll.doubles ? 'awaiting_roll' : 'post_roll';
    if (!state.lastRoll.doubles) {
        events.push({ type: 'TURN_READY_TO_END', playerIdx });
    }
    return events;
}

// ---------- Card drawing (Phase 4) ----------
function drawAndApplyCard(state, playerIdx, deck, depth) {
    const events = [];
    const player = state.players[playerIdx];
    const cards = deck === 'chance' ? CHANCE_CARDS : CHEST_CARDS;
    const orderKey = deck === 'chance' ? 'chanceOrder' : 'chestOrder';
    const ptrKey = deck === 'chance' ? 'chancePtr' : 'chestPtr';
    if (!state[orderKey]) { state[orderKey] = shuffledIdx(cards.length); state[ptrKey] = 0; }
    const idx = state[orderKey][state[ptrKey] % state[orderKey].length];
    state[ptrKey] = (state[ptrKey] + 1) % state[orderKey].length;
    if (state[ptrKey] === 0) state[orderKey] = shuffledIdx(cards.length);
    const card = cards[idx];

    events.push({ type: 'CARD_DRAWN', playerIdx, deck, card: { id: card.id, title: card.title, description: card.description } });

    const fx = card.fx || {};
    const finishNormally = () => {
        state.phase = state.lastRoll?.doubles ? 'awaiting_roll' : 'post_roll';
        if (!state.lastRoll?.doubles) events.push({ type: 'TURN_READY_TO_END', playerIdx });
    };

    if (fx.jail) {
        sendToJail(player);
        events.push({ type: 'JAILED', playerIdx, reason: 'card' });
        advanceTurn(state);
        state.phase = 'awaiting_roll';
        events.push({ type: 'TURN_ENDED', nextIdx: state.turnIdx });
        return events;
    }
    if (typeof fx.m === 'number') {
        if (fx.m >= 0) {
            player.money += fx.m;
            events.push({ type: 'CARD_MONEY', playerIdx, amount: fx.m });
        } else {
            const cost = -fx.m;
            if (player.money >= cost) {
                player.money -= cost;
                events.push({ type: 'CARD_MONEY', playerIdx, amount: fx.m });
            } else {
                player.money = 0;
                transferAllOwned(state, playerIdx, -1);
                bankrupt(state, playerIdx);
                events.push({ type: 'BANKRUPT', playerIdx, reason: 'card' });
                advanceTurn(state);
                state.phase = 'awaiting_roll';
                events.push({ type: 'TURN_ENDED', nextIdx: state.turnIdx });
                checkGameOver(state, events);
                return events;
            }
        }
        finishNormally();
        return events;
    }
    if (fx.bday) {
        let total = 0;
        for (const p of state.players) {
            if (p.idx !== playerIdx && !p.bankrupt) {
                const give = Math.min(10, Math.max(0, p.money));
                p.money -= give;
                total += give;
            }
        }
        player.money += total;
        events.push({ type: 'CARD_BIRTHDAY', playerIdx, total });
        finishNormally();
        return events;
    }
    if (fx.go) {
        const from = player.position;
        const to = fx.go.t;
        if (fx.go.a && to <= from) { player.money += 200; player.lap += 1; events.push({ type: 'GO_BONUS', playerIdx }); }
        player.position = to;
        events.push({ type: 'MOVED_BY_CARD', playerIdx, from, to });
        if (depth < 1) {
            events.push(...resolveLanding(state, playerIdx, depth + 1));
        } else {
            finishNormally();
        }
        return events;
    }
    if (fx.back) {
        const from = player.position;
        const to = (from - fx.back + 40) % 40;
        player.position = to;
        events.push({ type: 'MOVED_BY_CARD', playerIdx, from, to, back: true });
        if (depth < 1) {
            events.push(...resolveLanding(state, playerIdx, depth + 1));
        } else {
            finishNormally();
        }
        return events;
    }
    finishNormally();
    return events;
}

// ---------- Build / Mortgage (Phase 5) ----------
function playerOwnsWholeGroup(state, playerIdx, tileIdx) {
    const tile = TILES[tileIdx];
    if (!tile || tile.type !== 'property') return false;
    const group = GROUPS[tile.group] || [];
    const p = state.players[playerIdx];
    return group.every(t => p.ownedTiles.includes(t));
}

function handleBuildHouse(state, senderIdx, action) {
    const p = state.players[senderIdx];
    if (!p || p.bankrupt) return { ok: false, error: 'bankrupt' };
    const tileIdx = action.tileIdx;
    const data = PROPERTY_DATA[tileIdx];
    if (!data || !data.houseCost) return { ok: false, error: 'not_buildable' };
    if (!p.ownedTiles.includes(tileIdx)) return { ok: false, error: 'not_owner' };
    if (p.mortgaged.includes(tileIdx)) return { ok: false, error: 'mortgaged' };
    if (!playerOwnsWholeGroup(state, senderIdx, tileIdx)) return { ok: false, error: 'need_full_group' };
    const cur = p.houses[tileIdx] || 0;
    if (cur >= 5) return { ok: false, error: 'max_houses' };
    if (p.money < data.houseCost) return { ok: false, error: 'not_enough_money' };
    p.money -= data.houseCost;
    p.houses[tileIdx] = cur + 1;
    return { ok: true, events: [{ type: 'HOUSE_BUILT', playerIdx: senderIdx, tileIdx, houses: p.houses[tileIdx], cost: data.houseCost }] };
}

function handleSellHouse(state, senderIdx, action) {
    const p = state.players[senderIdx];
    if (!p || p.bankrupt) return { ok: false, error: 'bankrupt' };
    const tileIdx = action.tileIdx;
    const data = PROPERTY_DATA[tileIdx];
    if (!data || !data.houseCost) return { ok: false, error: 'not_buildable' };
    const cur = p.houses[tileIdx] || 0;
    if (!p.ownedTiles.includes(tileIdx) || cur <= 0) return { ok: false, error: 'no_houses' };
    const refund = Math.floor(data.houseCost / 2);
    p.money += refund;
    p.houses[tileIdx] = cur - 1;
    if (p.houses[tileIdx] === 0) delete p.houses[tileIdx];
    return { ok: true, events: [{ type: 'HOUSE_SOLD', playerIdx: senderIdx, tileIdx, houses: p.houses[tileIdx] || 0, refund }] };
}

function handleMortgage(state, senderIdx, action) {
    const p = state.players[senderIdx];
    if (!p || p.bankrupt) return { ok: false, error: 'bankrupt' };
    const tileIdx = action.tileIdx;
    const data = PROPERTY_DATA[tileIdx];
    if (!data || !data.mortgage) return { ok: false, error: 'not_mortgageable' };
    if (!p.ownedTiles.includes(tileIdx)) return { ok: false, error: 'not_owner' };
    if (p.mortgaged.includes(tileIdx)) return { ok: false, error: 'already_mortgaged' };
    if ((p.houses[tileIdx] || 0) > 0) return { ok: false, error: 'has_houses' };
    p.mortgaged.push(tileIdx);
    p.money += data.mortgage;
    return { ok: true, events: [{ type: 'MORTGAGED', playerIdx: senderIdx, tileIdx, amount: data.mortgage }] };
}

function handleUnmortgage(state, senderIdx, action) {
    const p = state.players[senderIdx];
    if (!p || p.bankrupt) return { ok: false, error: 'bankrupt' };
    const tileIdx = action.tileIdx;
    const data = PROPERTY_DATA[tileIdx];
    if (!data || !data.mortgage) return { ok: false, error: 'not_mortgageable' };
    if (!p.mortgaged.includes(tileIdx)) return { ok: false, error: 'not_mortgaged' };
    const cost = Math.ceil(data.mortgage * 1.1);
    if (p.money < cost) return { ok: false, error: 'not_enough_money' };
    p.money -= cost;
    p.mortgaged = p.mortgaged.filter(t => t !== tileIdx);
    return { ok: true, events: [{ type: 'UNMORTGAGED', playerIdx: senderIdx, tileIdx, cost }] };
}

// ---------- Jail pay / Surrender (Phase 6) ----------
function handleJailPay(state, senderIdx) {
    const turn = ensureSendersTurn(state, senderIdx);
    if (!turn.ok) return turn;
    const p = state.players[senderIdx];
    if (!p.inJail) return { ok: false, error: 'not_in_jail' };
    if (state.phase !== 'awaiting_roll') return { ok: false, error: 'wrong_phase' };
    if (p.money < 50) return { ok: false, error: 'not_enough_money' };
    p.money -= 50;
    p.inJail = false;
    p.jailTurns = 0;
    return { ok: true, events: [{ type: 'JAIL_PAID', playerIdx: senderIdx }] };
}

function handleSurrender(state, senderIdx) {
    const p = state.players[senderIdx];
    if (!p || p.bankrupt) return { ok: false, error: 'bankrupt' };
    p.money = 0;
    transferAllOwned(state, senderIdx, -1);
    bankrupt(state, senderIdx);
    const events = [{ type: 'SURRENDERED', playerIdx: senderIdx }];
    if (state.turnIdx === senderIdx && state.phase !== 'game_over') {
        advanceTurn(state);
        state.phase = 'awaiting_roll';
        events.push({ type: 'TURN_ENDED', nextIdx: state.turnIdx });
    }
    checkGameOver(state, events);
    return { ok: true, events };
}

// ---------- Auction (Phase 5) ----------
const AUCTION_STEP = 10;
function startAuction(state, tileIdx, declinerIdx, events) {
    const participants = state.players
        .filter(p => !p.bankrupt && p.idx !== declinerIdx)
        .map(p => p.idx);
    if (participants.length === 0) return;
    state.pendingAuction = {
        tileIdx,
        participants,
        curPos: 0,
        bid: 0,
        bidderIdx: -1,
    };
    events.push({
        type: 'AUCTION_STARTED',
        tileIdx,
        participants: participants.slice(),
        curIdx: participants[0],
        bid: 0,
    });
}

function endAuction(state, events) {
    const a = state.pendingAuction;
    if (!a) return;
    if (a.bidderIdx >= 0 && a.bid > 0) {
        const winner = state.players[a.bidderIdx];
        if (winner.money >= a.bid) {
            winner.money -= a.bid;
            winner.ownedTiles.push(a.tileIdx);
        }
        events.push({ type: 'AUCTION_ENDED', tileIdx: a.tileIdx, winnerIdx: a.bidderIdx, price: a.bid });
    } else {
        events.push({ type: 'AUCTION_ENDED', tileIdx: a.tileIdx, winnerIdx: -1, price: 0 });
    }
    state.pendingAuction = null;
}

function auctionAdvance(state, events) {
    const a = state.pendingAuction;
    if (!a) return;
    if (a.participants.length === 0) { endAuction(state, events); return; }
    if (a.participants.length === 1 && a.participants[0] === a.bidderIdx) {
        endAuction(state, events); return;
    }
    a.curPos = a.curPos % a.participants.length;
    events.push({ type: 'AUCTION_TURN', curIdx: a.participants[a.curPos], bid: a.bid, bidderIdx: a.bidderIdx, tileIdx: a.tileIdx });
}

function handleAuctionBid(state, senderIdx) {
    const a = state.pendingAuction;
    if (!a) return { ok: false, error: 'no_auction' };
    if (a.participants[a.curPos] !== senderIdx) return { ok: false, error: 'not_your_bid_turn' };
    const p = state.players[senderIdx];
    const newBid = a.bid + AUCTION_STEP;
    if (p.money < newBid) return { ok: false, error: 'not_enough_money' };
    a.bid = newBid;
    a.bidderIdx = senderIdx;
    a.curPos = (a.curPos + 1) % a.participants.length;
    const events = [{ type: 'AUCTION_BID_MADE', byIdx: senderIdx, bid: a.bid }];
    auctionAdvance(state, events);
    return { ok: true, events };
}

function handleAuctionPass(state, senderIdx) {
    const a = state.pendingAuction;
    if (!a) return { ok: false, error: 'no_auction' };
    if (a.participants[a.curPos] !== senderIdx) return { ok: false, error: 'not_your_bid_turn' };
    const pos = a.participants.indexOf(senderIdx);
    a.participants.splice(pos, 1);
    if (a.curPos >= a.participants.length) a.curPos = 0;
    const events = [{ type: 'AUCTION_PASSED', byIdx: senderIdx }];
    if (a.participants.length === 0) {
        endAuction(state, events);
    } else if (a.participants.length === 1 && a.participants[0] === a.bidderIdx) {
        endAuction(state, events);
    } else {
        auctionAdvance(state, events);
    }
    return { ok: true, events };
}

// ---------- Trade (Phase 5) ----------
function handleTradePropose(state, senderIdx, action) {
    if (state.pendingTrade) return { ok: false, error: 'trade_in_progress' };
    const toIdx = action.toIdx;
    const target = state.players[toIdx];
    const me = state.players[senderIdx];
    if (!target || target.bankrupt || toIdx === senderIdx) return { ok: false, error: 'bad_target' };
    const giveTiles = Array.isArray(action.giveTiles) ? action.giveTiles.filter(t => Number.isInteger(t)) : [];
    const getTiles = Array.isArray(action.getTiles) ? action.getTiles.filter(t => Number.isInteger(t)) : [];
    const cash = Number.isInteger(action.cash) ? action.cash : 0;
    for (const t of giveTiles) {
        if (!me.ownedTiles.includes(t)) return { ok: false, error: 'give_not_owned' };
        if ((me.houses[t] || 0) > 0) return { ok: false, error: 'give_has_houses' };
    }
    for (const t of getTiles) {
        if (!target.ownedTiles.includes(t)) return { ok: false, error: 'get_not_owned' };
        if ((target.houses[t] || 0) > 0) return { ok: false, error: 'get_has_houses' };
    }
    if (cash > 0 && me.money < cash) return { ok: false, error: 'not_enough_money' };
    if (cash < 0 && target.money < -cash) return { ok: false, error: 'partner_cant_pay' };
    state.pendingTrade = { fromIdx: senderIdx, toIdx, giveTiles, getTiles, cash };
    return { ok: true, events: [{ type: 'TRADE_PROPOSED', fromIdx: senderIdx, toIdx, giveTiles, getTiles, cash }] };
}

function handleTradeResponse(state, senderIdx, action) {
    const tr = state.pendingTrade;
    if (!tr) return { ok: false, error: 'no_trade' };
    if (senderIdx !== tr.toIdx) return { ok: false, error: 'not_trade_target' };
    const accepted = !!action.accepted;
    const events = [];
    if (accepted) {
        const from = state.players[tr.fromIdx];
        const to = state.players[tr.toIdx];
        const stillValid =
            tr.giveTiles.every(t => from.ownedTiles.includes(t) && !(from.houses[t] > 0)) &&
            tr.getTiles.every(t => to.ownedTiles.includes(t) && !(to.houses[t] > 0)) &&
            (tr.cash <= 0 || from.money >= tr.cash) &&
            (tr.cash >= 0 || to.money >= -tr.cash);
        if (!stillValid) {
            state.pendingTrade = null;
            return { ok: false, error: 'trade_invalidated' };
        }
        const moveTile = (owner, receiver, t) => {
            owner.ownedTiles = owner.ownedTiles.filter(x => x !== t);
            receiver.ownedTiles.push(t);
            if (owner.mortgaged.includes(t)) {
                owner.mortgaged = owner.mortgaged.filter(x => x !== t);
                receiver.mortgaged.push(t);
            }
        };
        for (const t of tr.giveTiles) moveTile(from, to, t);
        for (const t of tr.getTiles) moveTile(to, from, t);
        if (tr.cash > 0) { from.money -= tr.cash; to.money += tr.cash; }
        if (tr.cash < 0) { to.money += tr.cash; from.money += -tr.cash; }
        events.push({ type: 'TRADE_RESULT', accepted: true, fromIdx: tr.fromIdx, toIdx: tr.toIdx, giveTiles: tr.giveTiles, getTiles: tr.getTiles, cash: tr.cash });
    } else {
        events.push({ type: 'TRADE_RESULT', accepted: false, fromIdx: tr.fromIdx, toIdx: tr.toIdx });
    }
    state.pendingTrade = null;
    return { ok: true, events };
}

function handleBuy(state, senderIdx) {
    const turn = ensureSendersTurn(state, senderIdx);
    if (!turn.ok) return turn;
    if (state.phase !== 'awaiting_buy_decision') {
        return { ok: false, error: 'no_buy_pending' };
    }
    const dec = state.currentDecision;
    if (!dec || dec.type !== 'buy_or_decline') {
        return { ok: false, error: 'no_buy_pending' };
    }
    const player = state.players[senderIdx];
    if (player.money < dec.price) {
        return { ok: false, error: 'not_enough_money' };
    }
    player.money -= dec.price;
    player.ownedTiles.push(dec.tileIdx);
    const events = [{ type: 'TILE_BOUGHT', playerIdx: senderIdx, tileIdx: dec.tileIdx, price: dec.price }];

    state.currentDecision = null;
    state.phase = state.lastRoll?.doubles ? 'awaiting_roll' : 'post_roll';
    if (!state.lastRoll?.doubles) {
        events.push({ type: 'TURN_READY_TO_END', playerIdx: senderIdx });
    }
    return { ok: true, events };
}

function handleDecline(state, senderIdx) {
    const turn = ensureSendersTurn(state, senderIdx);
    if (!turn.ok) return turn;
    if (state.phase !== 'awaiting_buy_decision') {
        return { ok: false, error: 'no_buy_pending' };
    }
    const dec = state.currentDecision;
    state.currentDecision = null;
    const events = [{ type: 'TILE_DECLINED', playerIdx: senderIdx, tileIdx: dec.tileIdx }];
    // Phase 5: the server runs the auction among the other players.
    startAuction(state, dec.tileIdx, senderIdx, events);
    state.phase = state.lastRoll?.doubles ? 'awaiting_roll' : 'post_roll';
    if (!state.lastRoll?.doubles) {
        events.push({ type: 'TURN_READY_TO_END', playerIdx: senderIdx });
    }
    return { ok: true, events };
}

function handleEndTurn(state, senderIdx) {
    const turn = ensureSendersTurn(state, senderIdx);
    if (!turn.ok) return turn;
    if (state.phase !== 'post_roll') {
        return { ok: false, error: 'cannot_end_now' };
    }
    advanceTurn(state);
    state.phase = 'awaiting_roll';
    return { ok: true, events: [{ type: 'TURN_ENDED', nextIdx: state.turnIdx }] };
}

/**
 * Phase 2 helper: until the client sends END_TURN intents, the server
 * auto-advances the turn pointer whenever the engine is sitting in
 * post_roll. This keeps the engine ready to validate the NEXT player's
 * ROLL_DICE without blocking on a missing END_TURN.
 *
 * Once Phase 3+ migrates buy/decline/build flows, this auto-advance is
 * still safe because those phases pause the engine in dedicated phases
 * (awaiting_buy_decision, awaiting_house_choice, etc.) and only return
 * to post_roll once the player has fully resolved them.
 */
function autoEndTurnIfStuck(state) {
    if (!state) return null;
    // If the engine is parked waiting for a buy decision (Phase 3 territory),
    // clear it without affecting state — the client will run its own buy
    // flow in parallel until that gets migrated.
    if (state.phase === 'awaiting_buy_decision') {
        state.currentDecision = null;
        state.phase = state.lastRoll?.doubles ? 'awaiting_roll' : 'post_roll';
    }
    if (state.phase !== 'post_roll') return null;
    advanceTurn(state);
    state.phase = 'awaiting_roll';
    return { type: 'TURN_ENDED', nextIdx: state.turnIdx };
}

// ---------- Mutation helpers ----------
function sendToJail(player) {
    player.position = 10;
    player.inJail = true;
    player.jailTurns = 0;
}

function bankrupt(state, playerIdx) {
    const p = state.players[playerIdx];
    p.bankrupt = true;
    // Return all owned tiles to the bank (or to the creditor — that case
    // is handled separately in the rent flow before calling bankrupt).
    // Here we just clear what's left (creditor transfer already happened).
    p.ownedTiles = [];
    p.mortgaged = [];
    p.houses = {};
}

function transferAllOwned(state, fromIdx, toIdx) {
    const from = state.players[fromIdx];
    const to = toIdx >= 0 ? state.players[toIdx] : null;
    if (to) {
        for (const tIdx of from.ownedTiles) {
            if (!to.ownedTiles.includes(tIdx)) to.ownedTiles.push(tIdx);
            if (from.mortgaged.includes(tIdx) && !to.mortgaged.includes(tIdx)) {
                to.mortgaged.push(tIdx);
            }
            if (from.houses[tIdx]) to.houses[tIdx] = from.houses[tIdx];
        }
    }
    // toIdx < 0 → assets return to the bank (simply cleared)
    from.ownedTiles = [];
    from.mortgaged = [];
    from.houses = {};
}

function advanceTurn(state) {
    const n = state.players.length;
    let next = state.turnIdx;
    for (let i = 0; i < n; i++) {
        next = (next + 1) % n;
        if (!state.players[next].bankrupt) {
            state.turnIdx = next;
            state.consecutiveDoubles = 0;
            state.lastRoll = null;
            return;
        }
    }
    // No non-bankrupt player found — should be caught by game over check
}

function checkGameOver(state, events) {
    const alive = state.players.filter(p => !p.bankrupt);
    if (alive.length <= 1) {
        state.phase = 'game_over';
        state.finishedAt = Date.now();
        state.winnerIdx = alive.length === 1 ? alive[0].idx : -1;
        events.push({ type: 'GAME_OVER', winnerIdx: state.winnerIdx });
    }
}

// ---------- Public serialization ----------
// Strip nothing for now — the basic game state has no secrets, every player
// can see every owned tile + balance. Card hand secrecy will be added when
// cards become server-side in phase 4.
function serialize(state) {
    return JSON.parse(JSON.stringify(state));
}

/**
 * Compact state snapshot the clients apply on every event burst. Contains
 * everything the UI needs to render: balances, positions, ownership,
 * mortgages, houses, jail, bankruptcy, whose turn, current phase/decision.
 */
function publicState(state) {
    return {
        turnIdx: state.turnIdx,
        phase: state.phase,
        consecutiveDoubles: state.consecutiveDoubles,
        currentDecision: state.currentDecision,
        lastRoll: state.lastRoll,
        winnerIdx: state.winnerIdx,
        players: state.players.map(p => ({
            idx: p.idx,
            oderId: p.oderId,
            username: p.username,
            money: p.money,
            position: p.position,
            lap: p.lap,
            inJail: p.inJail,
            jailTurns: p.jailTurns,
            bankrupt: p.bankrupt,
            ownedTiles: p.ownedTiles.slice(),
            mortgaged: p.mortgaged.slice(),
            houses: { ...p.houses },
        })),
    };
}

module.exports = {
    createGame,
    applyAction,
    serialize,
    publicState,
    autoEndTurnIfStuck,
    // Exported for tests / debugging
    _TILES: TILES,
    _PROPERTY_DATA: PROPERTY_DATA,
    _GROUPS: GROUPS,
    _calcRent: calcRent,
    _tileOwnerIdx: tileOwnerIdx,
};