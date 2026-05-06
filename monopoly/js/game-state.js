/* ============================================================
   game-state.js
   Centralized economic state: player balances, tile ownership,
   mortgage flags. All financial transactions go through here.
   Emits events so UI modules can react.
   ============================================================ */

(function (global) {
    'use strict';

    const { TILES, PROPERTY_DATA } = global.MonopolyData;

    // Listeners by event name
    const listeners = {};
    function emit(event, payload) {
        (listeners[event] || []).forEach(fn => fn(payload));
    }
    function on(event, fn) {
        (listeners[event] || (listeners[event] = [])).push(fn);
    }

    // --- Per-player state (keyed by player id) ---
    // money:      current balance
    // ownedTiles: Set of tile indices this player owns
    // mortgaged:  Set of tile indices this player has mortgaged
    const playerEcon = {};

    // --- Per-tile state (keyed by tile index) ---
    // ownedBy:    player id or null
    const tileEcon = {};

    function init(players) {
        for (const p of players) {
            playerEcon[p.id] = {
                money: 1500,
                ownedTiles: new Set(),
                mortgaged: new Set(),
            };
        }
        for (const t of TILES) {
            tileEcon[t.i] = { ownedBy: null };
        }
    }

    // ---------- Player money ----------
    function getMoney(playerId) {
        return playerEcon[playerId]?.money ?? 0;
    }
    function setMoney(playerId, amount) {
        if (!playerEcon[playerId]) return;
        playerEcon[playerId].money = amount;
        emit('moneyChanged', { playerId, money: amount });
    }
    function changeMoney(playerId, delta, reason = '') {
        const cur = getMoney(playerId);
        setMoney(playerId, cur + delta);
        emit('moneyChange', { playerId, delta, reason, newBalance: cur + delta });
    }

    // ---------- Tile ownership ----------
    function getOwner(tileIdx) {
        return tileEcon[tileIdx]?.ownedBy ?? null;
    }
    function isOwned(tileIdx) {
        return getOwner(tileIdx) !== null;
    }
    function isPurchasable(tileIdx) {
        const tile = TILES[tileIdx];
        return tile && (tile.type === 'property' ||
                        tile.type === 'railroad' ||
                        tile.type === 'utility');
    }
    function getOwnedTiles(playerId) {
        return Array.from(playerEcon[playerId]?.ownedTiles ?? []);
    }
    function isMortgaged(tileIdx) {
        const owner = getOwner(tileIdx);
        if (!owner) return false;
        return playerEcon[owner].mortgaged.has(tileIdx);
    }

    // ---------- Transactions ----------
    function buyTile(playerId, tileIdx) {
        const tile = TILES[tileIdx];
        if (!isPurchasable(tileIdx)) return false;
        if (isOwned(tileIdx)) return false;
        if (getMoney(playerId) < tile.price) return false;

        changeMoney(playerId, -tile.price, `Купили ${tileIdx}`);
        tileEcon[tileIdx].ownedBy = playerId;
        playerEcon[playerId].ownedTiles.add(tileIdx);
        emit('tileBought', { playerId, tileIdx, price: tile.price });
        return true;
    }

    /**
     * Calculate rent owed for landing on tileIdx.
     * Property: base rent, doubled if owner has full color group.
     * Railroad: 25 / 50 / 100 / 200 based on # railroads owned.
     * Utility:  4× or 10× last dice roll based on # utilities owned.
     */
    function calcRent(tileIdx, lastDiceSum = 0) {
        const tile = TILES[tileIdx];
        const data = PROPERTY_DATA[tileIdx];
        const owner = getOwner(tileIdx);
        if (!owner || !data) return 0;
        if (isMortgaged(tileIdx)) return 0;

        if (tile.type === 'property') {
            const baseRent = data.rent[0];
            // Doubled if owner has all tiles in the color group, no houses yet
            const groupTiles = TILES.filter(t =>
                t.type === 'property' && t.group === tile.group);
            const allOwned = groupTiles.every(t => getOwner(t.i) === owner);
            return allOwned ? baseRent * 2 : baseRent;
        }

        if (tile.type === 'railroad') {
            const ownedRails = TILES.filter(t =>
                t.type === 'railroad' && getOwner(t.i) === owner).length;
            return data.rent[ownedRails - 1] ?? 0;
        }

        if (tile.type === 'utility') {
            const ownedUtils = TILES.filter(t =>
                t.type === 'utility' && getOwner(t.i) === owner).length;
            const multiplier = ownedUtils === 1 ? 4 : 10;
            return lastDiceSum * multiplier;
        }

        return 0;
    }

    function payRent(payerId, tileIdx, lastDiceSum) {
        const owner = getOwner(tileIdx);
        if (!owner || owner === payerId) return 0;
        const rent = calcRent(tileIdx, lastDiceSum);
        if (rent <= 0) return 0;

        changeMoney(payerId, -rent, `Аренда ${tileIdx}`);
        changeMoney(owner,   rent, `Получили аренду`);
        emit('rentPaid', { payerId, ownerId: owner, tileIdx, amount: rent });
        return rent;
    }

    function payTax(playerId, amount, reason = 'Налог') {
        changeMoney(playerId, -amount, reason);
        emit('taxPaid', { playerId, amount, reason });
    }

    /**
     * Award $200 for passing GO. Called when a player crosses or lands on
     * tile 0 during forward movement.
     */
    function awardGoBonus(playerId) {
        changeMoney(playerId, 200, 'Прошли СТАРТ');
        emit('goBonus', { playerId, amount: 200 });
    }

    global.GameState = {
        init,
        on,
        // money
        getMoney, changeMoney,
        // ownership
        getOwner, isOwned, isPurchasable, getOwnedTiles, isMortgaged,
        // transactions
        buyTile, calcRent, payRent, payTax, awardGoBonus,
    };
})(window);
