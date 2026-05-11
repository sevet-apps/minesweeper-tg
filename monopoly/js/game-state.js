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
                bankrupt: false,
                inJail: false,
                jailTurns: 0,  // how many turns spent in jail this stint
                houses: {},    // tileIdx -> number of houses (0-5, 5 = hotel)
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
    /**
     * Calculate rent owed for landing on tileIdx.
     * Will be overridden later in this module to account for houses.
     */
    let calcRent = function(tileIdx, lastDiceSum = 0) {
        const tile = TILES[tileIdx];
        const data = PROPERTY_DATA[tileIdx];
        const owner = getOwner(tileIdx);
        if (!owner || !data) return 0;
        if (isMortgaged(tileIdx)) return 0;

        if (tile.type === 'property') {
            const baseRent = data.rent[0];
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
    };

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

    function canAfford(playerId, amount) {
        return getMoney(playerId) >= amount;
    }

    function isBankrupt(playerId) {
        return playerEcon[playerId]?.bankrupt === true;
    }

    /**
     * Declare a player bankrupt. Their properties return to the bank
     * (or transfer to creditor in classic rules - we go simple).
     */
    function declareBankrupt(playerId, creditorId = null) {
        if (!playerEcon[playerId]) return;
        playerEcon[playerId].bankrupt = true;
        const owned = Array.from(playerEcon[playerId].ownedTiles);
        for (const idx of owned) {
            tileEcon[idx].ownedBy = null;
        }
        playerEcon[playerId].ownedTiles.clear();
        playerEcon[playerId].mortgaged.clear();
        playerEcon[playerId].money = 0;
        emit('bankrupt', { playerId, creditorId, returnedTiles: owned });
        emit('moneyChanged', { playerId, money: 0 });
    }

    /**
     * Internal: directly assign tile ownership (used by Auction).
     * Bypasses the base-price check in buyTile since auction price differs.
     * Caller is responsible for charging the buyer.
     */
    function _assignOwnership(playerId, tileIdx) {
        if (!playerEcon[playerId]) return;
        tileEcon[tileIdx].ownedBy = playerId;
        playerEcon[playerId].ownedTiles.add(tileIdx);
        emit('tileBought', { playerId, tileIdx, price: 0 });
    }

    // ---------- Jail ----------
    function isInJail(playerId)   { return playerEcon[playerId]?.inJail === true; }
    function getJailTurns(playerId) { return playerEcon[playerId]?.jailTurns ?? 0; }

    function sendToJail(playerId) {
        if (!playerEcon[playerId]) return;
        playerEcon[playerId].inJail = true;
        playerEcon[playerId].jailTurns = 0;
        emit('jailEntered', { playerId });
    }

    function releaseFromJail(playerId) {
        if (!playerEcon[playerId]) return;
        playerEcon[playerId].inJail = false;
        playerEcon[playerId].jailTurns = 0;
        emit('jailReleased', { playerId });
    }

    function incrementJailTurns(playerId) {
        if (!playerEcon[playerId]) return 0;
        playerEcon[playerId].jailTurns++;
        return playerEcon[playerId].jailTurns;
    }

    // ---------- Houses & hotels ----------
    function getHouses(tileIdx) {
        const owner = getOwner(tileIdx);
        if (!owner) return 0;
        return playerEcon[owner].houses[tileIdx] ?? 0;
    }

    /**
     * Whether player can build a house on this tile.
     * Requires: owns the tile, owns the full color group, group is unmortgaged,
     * current count < 5 (max hotel), and building parity (even distribution).
     */
    function canBuildHouse(playerId, tileIdx) {
        const tile = TILES[tileIdx];
        if (tile.type !== 'property') return false;
        if (getOwner(tileIdx) !== playerId) return false;

        // Must own all tiles of the group
        const groupTiles = TILES.filter(t => t.type === 'property' && t.group === tile.group);
        if (!groupTiles.every(t => getOwner(t.i) === playerId)) return false;
        // No tile in group can be mortgaged
        if (groupTiles.some(t => isMortgaged(t.i))) return false;

        const curHouses = getHouses(tileIdx);
        if (curHouses >= 5) return false; // already hotel

        // Building parity: this tile must have <= min count in group
        const minInGroup = Math.min(...groupTiles.map(t => getHouses(t.i)));
        if (curHouses > minInGroup) return false;

        const cost = PROPERTY_DATA[tileIdx].houseCost;
        if (!canAfford(playerId, cost)) return false;
        return true;
    }

    function buildHouse(playerId, tileIdx) {
        if (!canBuildHouse(playerId, tileIdx)) return false;
        const cost = PROPERTY_DATA[tileIdx].houseCost;
        changeMoney(playerId, -cost, `Дом ${tileIdx}`);
        playerEcon[playerId].houses[tileIdx] = (playerEcon[playerId].houses[tileIdx] ?? 0) + 1;
        emit('houseBuilt', { playerId, tileIdx, count: playerEcon[playerId].houses[tileIdx] });
        return true;
    }

    function canSellHouse(playerId, tileIdx) {
        const tile = TILES[tileIdx];
        if (tile.type !== 'property') return false;
        if (getOwner(tileIdx) !== playerId) return false;
        const curHouses = getHouses(tileIdx);
        if (curHouses === 0) return false;

        // Reverse parity
        const groupTiles = TILES.filter(t => t.type === 'property' && t.group === tile.group);
        const maxInGroup = Math.max(...groupTiles.map(t => getHouses(t.i)));
        if (curHouses < maxInGroup) return false;
        return true;
    }

    function sellHouse(playerId, tileIdx) {
        if (!canSellHouse(playerId, tileIdx)) return false;
        const halfPrice = Math.floor(PROPERTY_DATA[tileIdx].houseCost / 2);
        changeMoney(playerId, halfPrice, `Продан дом ${tileIdx}`);
        playerEcon[playerId].houses[tileIdx]--;
        emit('houseSold', { playerId, tileIdx, count: playerEcon[playerId].houses[tileIdx] });
        return true;
    }

    // Update calcRent to account for houses
    calcRent = function(tileIdx, lastDiceSum = 0) {
        const tile = TILES[tileIdx];
        const data = PROPERTY_DATA[tileIdx];
        const owner = getOwner(tileIdx);
        if (!owner || !data) return 0;
        if (isMortgaged(tileIdx)) return 0;

        if (tile.type === 'property') {
            const houses = getHouses(tileIdx);
            if (houses > 0) {
                return data.rent[houses] ?? data.rent[data.rent.length - 1];
            }
            // No houses: base rent, doubled if owner has all group
            const groupTiles = TILES.filter(t =>
                t.type === 'property' && t.group === tile.group);
            const allOwned = groupTiles.every(t => getOwner(t.i) === owner);
            return allOwned ? data.rent[0] * 2 : data.rent[0];
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
    };

    global.GameState = {
        init,
        on,
        getMoney, changeMoney, canAfford,
        getOwner, isOwned, isPurchasable, getOwnedTiles, isMortgaged,
        buyTile, calcRent: (...args) => calcRent(...args), payRent, payTax, awardGoBonus,
        isBankrupt, declareBankrupt,
        _assignOwnership,
        // jail
        isInJail, getJailTurns, sendToJail, releaseFromJail, incrementJailTurns,
        // houses
        getHouses, canBuildHouse, buildHouse, canSellHouse, sellHouse,
    };
})(window);