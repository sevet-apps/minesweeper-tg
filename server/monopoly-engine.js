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
        // The rest are still client-authoritative pending migration. They are
        // accepted here but only sanity-validated; the engine doesn't yet
        // model them. The server's relay path runs in parallel until each is
        // migrated.
        case 'BUILD_HOUSE':
        case 'SELL_HOUSE':
        case 'MORTGAGE':
        case 'UNMORTGAGE':
        case 'AUCTION_BID':
        case 'AUCTION_PASS':
        case 'TRADE_PROPOSE':
        case 'TRADE_RESPONSE':
        case 'JAIL_PAY':
        case 'JAIL_USE_CARD':
        case 'DRAW_CARD':
        case 'SURRENDER':
            return { ok: false, error: 'not_yet_implemented' };
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

function resolveLanding(state, playerIdx) {
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

    // Chance / Chest — placeholder until card system is server-side
    if (tile.type === 'chance' || tile.type === 'chest') {
        events.push({ type: 'CARD_DRAW_NEEDED', playerIdx, deck: tile.type });
        // Phase stays in 'resolving' until card is applied; for now we just
        // advance turn (skip card effects until phase 4).
        state.phase = state.lastRoll.doubles ? 'awaiting_roll' : 'post_roll';
        if (!state.lastRoll.doubles) {
            events.push({ type: 'TURN_READY_TO_END', playerIdx });
        }
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
    // Trigger auction (phase 5 will fill this in; for now the tile just
    // stays free in the server's mind, and the client may run a parallel
    // auction in its own client-authoritative flow until migrated).
    const events = [{ type: 'TILE_DECLINED', playerIdx: senderIdx, tileIdx: dec.tileIdx }];
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
    const to = state.players[toIdx];
    for (const tIdx of from.ownedTiles) {
        if (!to.ownedTiles.includes(tIdx)) to.ownedTiles.push(tIdx);
        if (from.mortgaged.includes(tIdx) && !to.mortgaged.includes(tIdx)) {
            to.mortgaged.push(tIdx);
        }
        if (from.houses[tIdx]) to.houses[tIdx] = from.houses[tIdx];
    }
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

module.exports = {
    createGame,
    applyAction,
    serialize,
    autoEndTurnIfStuck,
    // Exported for tests / debugging
    _TILES: TILES,
    _PROPERTY_DATA: PROPERTY_DATA,
    _GROUPS: GROUPS,
    _calcRent: calcRent,
    _tileOwnerIdx: tileOwnerIdx,
};