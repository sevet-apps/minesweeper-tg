/* ============================================================
   main.js  (Phase 3)
   Full game loop:
     1. Render board, init players, GameState, HUD, modals
     2. Roll dice → move current player → resolve landing
     3. Show appropriate ActionModal (buy / pay rent / pay tax / info)
     4. Update balances, ownership, HUD
     5. Advance turn (unless doubles)
   ============================================================ */

(function () {
    'use strict';

    const tg = window.Telegram?.WebApp;

    // Are we embedded in the Spark Games app (inside an iframe)?
    const inIframe = (() => {
        try { return window.self !== window.top; } catch (_) { return true; }
    })();

    // The Spark app passes the real top/bottom insets (space taken by
    // Telegram's UI buttons) as URL params. Apply them as CSS variables so
    // the top bar / HUD clear the system buttons. env(safe-area-inset-*)
    // returns 0 inside an iframe, so we rely on these instead.
    (function applyInsetsFromUrl() {
        try {
            const p = new URLSearchParams(location.search);
            const top = parseInt(p.get('safeTop'));
            const bottom = parseInt(p.get('safeBottom'));
            const root = document.documentElement;
            if (!isNaN(top))    root.style.setProperty('--safe-top', top + 'px');
            if (!isNaN(bottom)) root.style.setProperty('--safe-bottom', bottom + 'px');
        } catch (_) {}
    })();

    // Only init the Telegram WebApp directly when running standalone.
    // Inside the Spark app the parent already called ready()/expand().
    if (tg && !inIframe) {
        try {
            tg.ready();
            tg.expand();
            document.body.setAttribute('data-theme', 'dark');
        } catch (e) {
            console.warn('Telegram WebApp init failed:', e);
        }
    } else {
        document.body.setAttribute('data-theme', 'dark');
    }

    /**
     * Exit the game back to the Spark Games menu.
     * When embedded, ask the parent app to close the iframe overlay.
     * When standalone, fall back to history.back().
     */
    function exitToMenu() {
        try { tg?.HapticFeedback?.impactOccurred('light'); } catch (_) {}
        if (inIframe) {
            try { window.parent.postMessage({ type: 'monopoly_exit' }, '*'); } catch (_) {}
        } else {
            history.back();
        }
    }
    // Expose for setup screen and any other module
    window.MonopolyExit = exitToMenu;

    // ---- Bootstrap modals (safe to do up front) ----
    PropertyModal.init();
    ActionModal.init();
    CardModal.init();
    Auction.init();
    BankruptcyModal.init();
    JailModal.init();
    BuildModal.init();
    SellAssetsModal.init();
    MortgageModal.init();
    TradeModal.init();
    GameOverModal.init();
    NoticeModal.init();
    MenuModal.init();
    MoneyToast.init();
    Cards.init();

    BoardUI.renderBoard((tile) => PropertyModal.open(tile));

    const boardEl = document.getElementById('board');

    // Show setup screen first; start the game once the player confirms.
    SetupScreen.show((configs) => {
        Players.configure(configs);
        startGame();
    });

    function startGame() {
        Players.init(boardEl);
        GameState.init(Players.PLAYERS);
        PlayerHUD.init(Players.PLAYERS);
        wireGame();
    }

    function wireGame() {
    GameState.on('moneyChange', ({ playerId, delta }) => {
        if (delta !== 0) MoneyToast.showOverPlayer(playerId, delta);
    });

    // Tint owned tiles with their owner's color
    GameState.on('tileBought', ({ playerId, tileIdx }) => {
        const tileEl = document.querySelector(`.tile[data-idx="${tileIdx}"]`);
        const player = Players.PLAYERS.find(p => p.id === playerId);
        if (tileEl && player) {
            tileEl.classList.add('tile-owned');
            tileEl.style.setProperty('--owner-color', player.color);
        }
    });

    // On bankruptcy: hide player's token, un-tint their tiles, mark HUD card
    GameState.on('bankrupt', ({ playerId, returnedTiles }) => {
        const tokenEl = document.getElementById(`token-${playerId}`);
        if (tokenEl) tokenEl.classList.add('player-token-bankrupt');

        for (const idx of returnedTiles) {
            const tileEl = document.querySelector(`.tile[data-idx="${idx}"]`);
            if (tileEl) {
                tileEl.classList.remove('tile-owned');
                tileEl.style.removeProperty('--owner-color');
                renderHouseMarkers(idx, 0);
            }
        }

        const hudCard = document.querySelector(`.hud-player[data-player-id="${playerId}"]`);
        if (hudCard) hudCard.classList.add('hud-player-bankrupt');

        // Check for game over: only one non-bankrupt left
        const survivors = Players.PLAYERS.filter(p => !GameState.isBankrupt(p.id));
        if (survivors.length === 1) {
            // Slight delay so the bankrupt animation has time to play
            setTimeout(() => {
                GameOverModal.show(survivors[0]);
            }, 1000);
        }
    });

    // ---- Render house/hotel markers on tile ----
    function renderHouseMarkers(tileIdx, count) {
        const tileEl = document.querySelector(`.tile[data-idx="${tileIdx}"]`);
        if (!tileEl) return;
        let layer = tileEl.querySelector('.house-marker-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.className = 'house-marker-layer';
            tileEl.appendChild(layer);
        }
        layer.innerHTML = '';
        if (count === 0) return;
        if (count === 5) {
            const hotel = document.createElement('div');
            hotel.className = 'house-marker house-marker-hotel';
            layer.appendChild(hotel);
        } else {
            for (let i = 0; i < count; i++) {
                const h = document.createElement('div');
                h.className = 'house-marker';
                layer.appendChild(h);
            }
        }
    }

    GameState.on('houseBuilt', ({ tileIdx, count }) => {
        renderHouseMarkers(tileIdx, count);
    });
    GameState.on('houseSold', ({ tileIdx, count }) => {
        renderHouseMarkers(tileIdx, count);
    });

    GameState.on('tileMortgaged', ({ tileIdx }) => {
        const tileEl = document.querySelector(`.tile[data-idx="${tileIdx}"]`);
        if (tileEl) tileEl.classList.add('tile-mortgaged');
    });
    GameState.on('tileUnmortgaged', ({ tileIdx }) => {
        const tileEl = document.querySelector(`.tile[data-idx="${tileIdx}"]`);
        if (tileEl) tileEl.classList.remove('tile-mortgaged');
    });

    // Re-layout tokens on resize
    window.addEventListener('resize', () => {
        requestAnimationFrame(() => Players.relayoutAll());
    });
    window.addEventListener('orientationchange', () => {
        setTimeout(() => Players.relayoutAll(), 100);
    });

    // ---- DOM refs ----
    const diceCanvasContainer = document.getElementById('dice-canvas-container');
    const rollBtn        = document.getElementById('rollBtn');
    const backBtn        = document.getElementById('backBtn');
    const diceResultEl   = document.getElementById('diceResult');
    const dieAEl         = document.getElementById('dieA');
    const dieBEl         = document.getElementById('dieB');
    const dieSumEl       = document.getElementById('dieSum');
    const swipeHintEl    = document.getElementById('swipeHint');
    const centerBrandEl  = document.getElementById('centerBrand');

    // Debug panel removed for production; keep no-op stubs so existing
    // assignments below don't throw.
    const noop = { set textContent(_v) {} };
    const dbgFps     = noop;
    const dbgDice    = noop;
    const dbgRetries = noop;

    // ---- Turn indicator: highlight current player in HUD ----
    function refreshTurnIndicator() {
        const cur = Players.getCurrentPlayer();
        PlayerHUD.setCurrentTurn(cur.id);
    }
    refreshTurnIndicator();

    // ---- Scene + dice ----
    const sm = new SceneManager(diceCanvasContainer);
    const dice = new Dice(sm);
    sm.start();

    setInterval(() => {
        dbgFps.textContent = sm.currentFps || '—';
    }, 250);

    // ---- Helper: pay or go bankrupt ----
    async function payOrBust(playerId, amount, reason, creditorId) {
        if (GameState.canAfford(playerId, amount)) {
            GameState.changeMoney(playerId, -amount, reason);
            if (creditorId) GameState.changeMoney(creditorId, amount, 'Получено');
            return true;
        }

        // Not enough cash. Check if player can sell assets to cover.
        const totalCash    = GameState.getMoney(playerId);
        const sellableValue = calculateSellableValue(playerId);
        const totalAssets  = totalCash + sellableValue;

        if (totalAssets < amount) {
            // Truly bankrupt
            const player   = Players.PLAYERS.find(p => p.id === playerId);
            const creditor = creditorId ? Players.PLAYERS.find(p => p.id === creditorId) : null;
            await BankruptcyModal.show({
                player,
                owedTo: creditor,
                owedAmount: amount,
                reason: 'Все имущества возвращены в банк. Игрок выбывает.',
            });
            const remaining = GameState.getMoney(playerId);
            if (creditorId && remaining > 0) {
                GameState.changeMoney(playerId, -remaining, 'Передано кредитору');
                GameState.changeMoney(creditorId, remaining, 'От банкрота');
            }
            GameState.declareBankrupt(playerId, creditorId);
            return false;
        }

        // Player has enough total assets - let them sell to cover
        await SellAssetsModal.show({
            playerId,
            amountOwed: amount,
            reason,
        });

        // After sell-assets modal closes, recheck
        if (GameState.canAfford(playerId, amount)) {
            GameState.changeMoney(playerId, -amount, reason);
            if (creditorId) GameState.changeMoney(creditorId, amount, 'Получено');
            return true;
        }

        // User didn't sell enough → still bankrupt
        const player = Players.PLAYERS.find(p => p.id === playerId);
        const creditor = creditorId ? Players.PLAYERS.find(p => p.id === creditorId) : null;
        await BankruptcyModal.show({
            player,
            owedTo: creditor,
            owedAmount: amount,
            reason: 'Не удалось собрать нужную сумму. Игрок выбывает.',
        });
        const remaining = GameState.getMoney(playerId);
        if (creditorId && remaining > 0) {
            GameState.changeMoney(playerId, -remaining, 'Передано кредитору');
            GameState.changeMoney(creditorId, remaining, 'От банкрота');
        }
        GameState.declareBankrupt(playerId, creditorId);
        return false;
    }

    function calculateSellableValue(playerId) {
        // Sum of (half house cost × current houses) across all owned properties
        const owned = GameState.getOwnedTiles(playerId);
        let total = 0;
        for (const idx of owned) {
            const data = window.MonopolyData.PROPERTY_DATA[idx];
            if (!data) continue;
            const houses = GameState.getHouses(idx);
            if (houses > 0 && data.houseCost) {
                total += Math.floor(data.houseCost / 2) * houses;
            }
        }
        return total;
    }

    // ---- Card draw + apply ----
    async function drawAndApplyCard(playerId, type) {
        const card = type === 'chance' ? Cards.drawChance() : Cards.drawChest();
        await CardModal.show(type, card);

        const ctx = {
            playerId,
            players: Players.PLAYERS,
            lastDiceSum: 0,
            movePlayerTo: async (idx, awardGo) => {
                await Players.movePlayerTo(playerId, idx, awardGo, (pid) => {
                    GameState.awardGoBonus(pid);
                });
                // Re-resolve landing on the new tile (excluding card tiles to avoid loop)
                const newTile = window.MonopolyData.TILES[idx];
                if (newTile.type !== 'chance' && newTile.type !== 'chest') {
                    const curPlayer = Players.PLAYERS.find(p => p.id === playerId);
                    await handleLanding(curPlayer, newTile, 0, /* skipCards */ true);
                }
            },
        };
        await card.effect(ctx);
    }

    // ---- Resolve landing on a tile ----
    async function handleLanding(player, tile, lastDiceSum, skipCards = false) {
        // Chance / Chest → draw card
        if (!skipCards && (tile.type === 'chance' || tile.type === 'chest')) {
            await drawAndApplyCard(player.id, tile.type);
            return;
        }

        // GO TO JAIL → fly to JAIL tile and set in-jail state
        if (tile.type === 'corner' && tile.i === 30) {
            await Players.movePlayerTo(player.id, 10, /*awardGo*/ false);
            GameState.sendToJail(player.id);
            return;
        }

        // For chuжая property → pay rent or bankrupt
        const ownerId = GameState.getOwner(tile.i);
        if (ownerId && ownerId !== player.id) {
            const rent = GameState.calcRent(tile.i, lastDiceSum);
            if (rent > 0) {
                // Show rent modal first (informational)
                const choice = await ActionModal.showForLanding({
                    tile,
                    playerId: player.id,
                    players: Players.PLAYERS.map(p => ({ ...p, money: GameState.getMoney(p.id) })),
                    lastDiceSum,
                });
                // Regardless of choice (user can't really decline), settle the rent
                await payOrBust(player.id, rent, `Аренда ${tile.name}`, ownerId);
            }
            return;
        }

        // Tax tile → must pay
        if (tile.type === 'tax') {
            const amount = tile.name === 'Income Tax' ? 200 : 100;
            const choice = await ActionModal.showForLanding({
                tile,
                playerId: player.id,
                players: Players.PLAYERS.map(p => ({ ...p, money: GameState.getMoney(p.id) })),
                lastDiceSum,
            });
            await payOrBust(player.id, amount, tile.name);
            return;
        }

        // Free purchasable tile → buy or auction
        if ((tile.type === 'property' || tile.type === 'railroad' || tile.type === 'utility')
            && !ownerId) {
            const choice = await ActionModal.showForLanding({
                tile,
                playerId: player.id,
                players: Players.PLAYERS.map(p => ({ ...p, money: GameState.getMoney(p.id) })),
                lastDiceSum,
            });

            if (choice === 'buy') {
                GameState.buyTile(player.id, tile.i);
            } else {
                // Skipped → auction among other players
                const eligible = Players.PLAYERS.filter(p =>
                    p.id !== player.id && !GameState.isBankrupt(p.id)
                );
                if (eligible.length > 0) {
                    const result = await Auction.start(tile, eligible);
                    if (result.winnerId && result.price > 0) {
                        // Charge winner, transfer ownership
                        GameState.changeMoney(result.winnerId, -result.price, 'Выиграл аукцион');
                        // Manually flip ownership (buyTile assumes base price)
                        const tileEconRef = window.MonopolyData.TILES[tile.i];
                        // Use buyTile-style state mutation: re-emit tileBought
                        const winner = Players.PLAYERS.find(p => p.id === result.winnerId);
                        // Mark owned by manipulating game state directly via the buy event chain
                        directAssignOwnership(result.winnerId, tile.i, result.price);
                    }
                }
            }
            return;
        }

        // Owned by self → show informational modal
        if (ownerId && ownerId === player.id) {
            await ActionModal.showForLanding({
                tile,
                playerId: player.id,
                players: Players.PLAYERS.map(p => ({ ...p, money: GameState.getMoney(p.id) })),
                lastDiceSum,
            });
            return;
        }
    }

    // Direct ownership assignment (used by auction - bypasses base-price check)
    function directAssignOwnership(playerId, tileIdx, price) {
        const tileEl = document.querySelector(`.tile[data-idx="${tileIdx}"]`);
        const player = Players.PLAYERS.find(p => p.id === playerId);
        if (tileEl && player) {
            tileEl.classList.add('tile-owned');
            tileEl.style.setProperty('--owner-color', player.color);
        }
        // Trigger an event so HUD updates - we hack it by emitting tileBought
        // through the existing flow. Since GameState's buyTile would require
        // base price, we mutate ownership records via a direct path.
        // Simplest: temporarily set the player's money high, call buyTile,
        // then refund the difference. But cleaner is just to assign and emit.
        // We rely on internal getter shape:
        // (Done in GameState below via a setter we'll expose.)
        GameState._assignOwnership(playerId, tileIdx);
    }

    let consecutiveDoubles = 0;

    // ---- Dice settle handler ----
    dice.onResult(async (result) => {
        dieAEl.textContent = result.a;
        dieBEl.textContent = result.b;
        dieSumEl.textContent = result.sum;
        diceResultEl.classList.add('visible');
        diceResultEl.classList.toggle('doubles', result.doubles);
        centerBrandEl.classList.add('faded');

        dbgDice.textContent = `${result.a} + ${result.b} = ${result.sum}` +
                              (result.doubles ? ' 🎯' : '');
        dbgRetries.textContent = result.retries;

        try {
            if (result.doubles) tg?.HapticFeedback?.notificationOccurred('success');
            else                tg?.HapticFeedback?.impactOccurred('medium');
        } catch (_) {}

        const player = Players.getCurrentPlayer();

        // Jail roll: trying to escape via doubles
        if (GameState.isInJail(player.id)) {
            if (result.doubles) {
                // Released — move normally
                GameState.releaseFromJail(player.id);
                // Fall through to normal move below
            } else {
                // Failed attempt
                const attempts = GameState.incrementJailTurns(player.id);
                if (attempts >= 3) {
                    // 3 failed attempts: must pay $50 and move
                    await payOrBust(player.id, 50, 'Принудительный выход');
                    if (GameState.isBankrupt(player.id)) {
                        advanceTurnSkippingBankrupt();
                        return;
                    }
                    GameState.releaseFromJail(player.id);
                    // Fall through to move
                } else {
                    // Stay in jail, turn ends
                    advanceTurnSkippingBankrupt();
                    return;
                }
            }
        }

        // Move with GO callback
        await Players.moveSteps(player.id, result.sum, (pid) => {
            GameState.awardGoBonus(pid);
            try { tg?.HapticFeedback?.notificationOccurred('success'); } catch (_) {}
        });

        // Resolve landing
        const landedIdx = Players.getPlayerState(player.id).position;
        const landedTile = window.MonopolyData.TILES[landedIdx];
        await handleLanding(player, landedTile, result.sum);

        // Advance turn (unless doubles), skipping bankrupt players
        if (!result.doubles) {
            consecutiveDoubles = 0;
            let next = Players.advanceTurn();
            let safety = 0;
            while (GameState.isBankrupt(next.id) && safety++ < 4) {
                next = Players.advanceTurn();
            }
            refreshTurnIndicator();
        } else {
            consecutiveDoubles++;
            if (consecutiveDoubles >= 3) {
                // Three doubles in a row → notice, then jail
                consecutiveDoubles = 0;
                await NoticeModal.show({
                    icon: '🚓',
                    title: `${player.name} едет в тюрьму!`,
                    body: 'Три дубля подряд — полиция уже здесь. Ход переходит к следующему игроку.',
                    btnText: 'В тюрьму',
                    accent: 'orange',
                });
                await Players.movePlayerTo(player.id, 10, /*awardGo*/ false);
                GameState.sendToJail(player.id);
                let next = Players.advanceTurn();
                let safety = 0;
                while (GameState.isBankrupt(next.id) && safety++ < 4) {
                    next = Players.advanceTurn();
                }
                refreshTurnIndicator();
            } else {
                const curEl = document.querySelector('.hud-player.current');
                if (curEl) {
                    curEl.animate(
                        [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }],
                        { duration: 350, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
                    );
                }
            }
        }

        rollBtn.classList.remove('rolling');
        rollBtn.disabled = false;
    });

    // ---- Server stub ----
    function fakeServerRoll() {
        return {
            a: 1 + Math.floor(Math.random() * 6),
            b: 1 + Math.floor(Math.random() * 6),
        };
    }

    async function doRoll(throwParams = {}) {
        if (dice.isRolling) return;

        // Jail check: if current player is in jail, show jail modal first
        const cur = Players.getCurrentPlayer();
        if (GameState.isInJail(cur.id)) {
            const result = await JailModal.show(cur);
            if (result.action === 'pay') {
                // Pay $50 fine and exit jail
                await payOrBust(cur.id, 50, 'Выход из тюрьмы');
                if (GameState.isBankrupt(cur.id)) {
                    advanceTurnSkippingBankrupt();
                    return;
                }
                GameState.releaseFromJail(cur.id);
                // Fall through to normal roll
            } else if (result.action === 'cant_pay') {
                // Forced bankruptcy
                await payOrBust(cur.id, 50, 'Выход из тюрьмы');
                advanceTurnSkippingBankrupt();
                return;
            }
            // For 'roll' just continue to dice roll. After roll, we'll check
            // if it was doubles in the result handler.
        }

        diceResultEl.classList.remove('visible');
        swipeHintEl.classList.add('hidden');
        rollBtn.classList.add('rolling');
        rollBtn.disabled = true;

        try { tg?.HapticFeedback?.impactOccurred('light'); } catch (_) {}

        const { a, b } = fakeServerRoll();
        await dice.rollTo(a, b, throwParams);
    }

    function advanceTurnSkippingBankrupt() {
        let next = Players.advanceTurn();
        let safety = 0;
        while (GameState.isBankrupt(next.id) && safety++ < 4) {
            next = Players.advanceTurn();
        }
        refreshTurnIndicator();
        rollBtn.classList.remove('rolling');
        rollBtn.disabled = false;
    }
    // Expose so other modules (menu/surrender) can advance turn
    window.advanceTurnSkippingBankrupt = advanceTurnSkippingBankrupt;

    rollBtn.addEventListener('click', () => doRoll());

    // Dock action buttons: open current player's profile / placeholder for future
    const dockMyCardsBtn = document.getElementById('dockMyCardsBtn');
    const dockTradeBtn   = document.getElementById('dockTradeBtn');
    const dockMortgageBtn = document.getElementById('dockMortgageBtn');
    const dockMenuBtn    = document.getElementById('dockMenuBtn');

    if (dockMyCardsBtn) dockMyCardsBtn.addEventListener('click', () => {
        const cur = Players.getCurrentPlayer();
        PlayerHUD.openPanel(cur.id);
    });

    // Placeholders for future phases
    if (dockTradeBtn) dockTradeBtn.addEventListener('click', () => {
        const cur = Players.getCurrentPlayer();
        TradeModal.show(cur.id);
    });
    if (dockMortgageBtn) dockMortgageBtn.addEventListener('click', () => {
        const cur = Players.getCurrentPlayer();
        MortgageModal.show(cur.id);
    });
    if (dockMenuBtn) dockMenuBtn.addEventListener('click', () => {
        MenuModal.show();
    });

    function showComingSoon(text) {
        // Lightweight toast for placeholder buttons
        const el = document.createElement('div');
        el.className = 'coming-soon-toast';
        el.textContent = text;
        document.body.appendChild(el);
        setTimeout(() => el.classList.add('visible'), 10);
        setTimeout(() => {
            el.classList.remove('visible');
            setTimeout(() => el.remove(), 300);
        }, 2200);
    }

    // ---- Swipe gesture ----
    (function installSwipe() {
        let touching = false;
        let startX = 0, startY = 0, startT = 0;

        const onStart = (e) => {
            if (dice.isRolling) return;
            const t = e.touches ? e.touches[0] : e;
            touching = true;
            startX = t.clientX;
            startY = t.clientY;
            startT = performance.now();
        };

        const onEnd = (e) => {
            if (!touching) return;
            touching = false;
            const t = e.changedTouches ? e.changedTouches[0] : e;
            const dx = t.clientX - startX;
            const dy = t.clientY - startY;
            const dt = performance.now() - startT;

            const isUpward = dy < -40;
            const isVerticalDominant = Math.abs(dy) > Math.abs(dx);
            const isFastEnough = dt < 800;

            if (isUpward && isVerticalDominant && isFastEnough) {
                const dirHint = Math.max(-1, Math.min(1, dx / 200));
                const speed = Math.abs(dy) / dt;
                const strength = Math.max(0.7, Math.min(1.4, 0.6 + speed * 2));
                doRoll({ dirHint, strength });
            }
        };

        diceCanvasContainer.addEventListener('touchstart', onStart, { passive: true });
        diceCanvasContainer.addEventListener('touchend',   onEnd,   { passive: true });
        diceCanvasContainer.addEventListener('mousedown',  onStart);
        diceCanvasContainer.addEventListener('mouseup',    onEnd);
    })();

    backBtn.addEventListener('click', () => {
        exitToMenu();
    });

    window.addEventListener('error', (e) => {
        console.error('[monopoly] error:', e.error || e.message);
    });

    console.log('[monopoly] Phase 3 ready: economy + actions + HUD.');
    } // end wireGame
})();