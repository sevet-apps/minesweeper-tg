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

    // Check for online mode (room param in URL). If yes, skip setup and use
    // the player list provided by the server.
    const onlineInit = OnlineMode.initFromUrl();
    if (onlineInit) {
        Players.configure(onlineInit.players);
        startGame();
        // If we're reconnecting (resume=1 in URL), apply the snapshot the
        // parent app will push via postMessage soon.
        if (onlineInit.isResume) {
            let resumeApplied = false;
            OnlineMode.onResume((payload, meta) => {
                if (resumeApplied) return; // idempotent — apply once
                resumeApplied = true;
                try {
                    const eng = meta?.engineSnapshot;
                    if (eng && Array.isArray(eng.players)) {
                        // PHASE 3 authoritative resume: apply money/ownership via
                        // the engine-state path, and positions instantly (no
                        // walk animation across the board).
                        applyEngineState(eng);
                        const posMap = {};
                        for (const sp of eng.players) {
                            const lp = Players.PLAYERS[sp.idx];
                            if (!lp) continue;
                            posMap[lp.id] = { position: sp.position, lap: sp.lap || 0 };
                        }
                        Players.applyPositions(posMap);
                        if (typeof eng.turnIdx === 'number') {
                            Players.setTurnIndex(eng.turnIdx);
                        }
                        if (typeof window.refreshTurnIndicator === 'function') {
                            window.refreshTurnIndicator();
                        }
                        console.log('[resume] engine snapshot applied, turnIdx=', eng.turnIdx);
                    } else {
                        // Legacy resume fallback
                        if (payload && payload.snapshot) GameState.applySnapshot(payload.snapshot);
                        if (payload && payload.positions) Players.applyPositions(payload.positions);
                        if (payload && payload.turnIdx != null) Players.setTurnIndex(payload.turnIdx);
                        if (typeof window.refreshTurnIndicator === 'function') {
                            window.refreshTurnIndicator();
                        }
                        console.log('[resume] legacy snapshot applied');
                    }
                    // Turn timer sync
                    if (meta?.turnEndsAt && meta.turnEndsAt > Date.now()) {
                        try { TurnTimer.start(meta.turnEndsAt); } catch (_) {}
                    } else if (!OnlineMode.isMyTurn()) {
                        try { TurnTimer.stop(); } catch (_) {}
                    }
                } catch (e) {
                    console.error('[resume] failed to apply snapshot:', e);
                    resumeApplied = false; // allow retry to reapply
                }
            });
            // PULL: actively request the snapshot from the parent now that our
            // listener is registered. Retry a few times in case the parent is
            // still waiting for the server's rejoin_ok round trip.
            let attempts = 0;
            const askResume = () => {
                if (resumeApplied || attempts >= 5) return;
                attempts++;
                OnlineMode.requestResume();
                setTimeout(askResume, 700);
            };
            askResume();
        }
    } else {
        // Local mode: show setup screen first.
        SetupScreen.show((configs) => {
            Players.configure(configs);
            startGame();
        });
    }

    function startGame() {
        document.body.classList.add('game-active');
        Players.init(boardEl);
        GameState.init(Players.PLAYERS);
        PlayerHUD.init(Players.PLAYERS);
        wireGame();
    }

    function wireGame() {
    GameState.on('moneyChange', ({ playerId, delta }) => {
        if (delta !== 0) MoneyToast.showOverPlayer(playerId, delta);
    });

    // ---- Online: fully redraw board + HUD from a freshly applied snapshot ----
    GameState.on('snapshotApplied', () => {
        for (const t of window.MonopolyData.TILES) {
            const tileEl = document.querySelector(`.tile[data-idx="${t.i}"]`);
            if (!tileEl) continue;
            const ownerId = GameState.getOwner(t.i);
            if (ownerId) {
                const owner = Players.PLAYERS.find(p => p.id === ownerId);
                tileEl.classList.add('tile-owned');
                if (owner) tileEl.style.setProperty('--owner-color', owner.color);
            } else {
                tileEl.classList.remove('tile-owned');
                tileEl.style.removeProperty('--owner-color');
            }
            // Mortgage state
            tileEl.classList.toggle('tile-mortgaged', GameState.isMortgaged(t.i));
            // Houses
            renderHouseMarkers(t.i, GameState.getHouses(t.i));
        }
        // Refresh HUD bankrupt flags (HUD balances refresh via its own
        // 'snapshotApplied' listener -> renderHud)
        for (const p of Players.PLAYERS) {
            if (GameState.isBankrupt(p.id)) {
                const hudCard = document.querySelector(`.hud-player[data-player-id="${p.id}"]`);
                if (hudCard) hudCard.classList.add('hud-player-bankrupt');
                const tokenEl = document.getElementById(`token-${p.id}`);
                if (tokenEl) tokenEl.classList.add('player-token-bankrupt');
            }
        }
        // Game over check — a snapshot can carry the moment of victory
        // (e.g. opponent surrendered). Show the win screen exactly once.
        const survivors = Players.PLAYERS.filter(p => !GameState.isBankrupt(p.id));
        if (survivors.length === 1 && !window.__gameOverShown) {
            window.__gameOverShown = true;
            setTimeout(() => GameOverModal.show(survivors[0]), 600);
        }
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
        if (survivors.length === 1 && !window.__gameOverShown) {
            window.__gameOverShown = true;
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

    // ---- Online: between-turn state changes (build / sell / mortgage / unmortgage)
    // Only the active player initiates these (UI blocks others). Push an
    // interim snapshot so the other clients see houses, mortgage state and
    // balances update immediately instead of waiting for turn end.
    function pushInterimSnapshot() {
        if (!OnlineMode.enabled) return;
        if (!OnlineMode.isMyTurn()) return;
        OnlineMode.send({
            type: 'interim_snapshot',
            snapshot: GameState.serialize(),
            positions: Players.serializePositions(),
        });
    }
    GameState.on('houseBuilt',     pushInterimSnapshot);
    GameState.on('houseSold',      pushInterimSnapshot);
    GameState.on('tileMortgaged',  pushInterimSnapshot);
    GameState.on('tileUnmortgaged', pushInterimSnapshot);

    // Passive clients apply interim snapshots without changing whose turn it is
    OnlineMode.on('interim_snapshot', ({ snapshot, positions }) => {
        GameState.applySnapshot(snapshot);
        Players.applyPositions(positions);
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
        // Online: kick off the 2-min countdown for the new active turn
        if (window.OnlineMode?.enabled) {
            // Only the active player decides the endsAt and broadcasts it,
            // so every client's countdown is in lockstep. Passive clients
            // will receive `turn_timer_started` and start their own ticker
            // with the same target time.
            if (OnlineMode.isMyTurn()) {
                const endsAt = Date.now() + TurnTimer.DURATION_MS;
                OnlineMode.send({ type: 'turn_timer_started', endsAt });
                try { TurnTimer.start(endsAt); } catch (_) {}
            } else {
                // Passive — TurnTimer will be started via the broadcast handler
                // below. Stop any stale one in the meantime.
                try { TurnTimer.stop(); } catch (_) {}
            }
        }
    }
    window.refreshTurnIndicator = refreshTurnIndicator;
    refreshTurnIndicator();

    // Passives sync their timer to the active player's endsAt
    OnlineMode.on('turn_timer_started', ({ endsAt }) => {
        try { TurnTimer.start(endsAt); } catch (_) {}
    });
    // The active player broadcasts a stop when they roll dice (turn-time
    // expense ends; further thinking inside modals isn't penalized).
    OnlineMode.on('turn_timer_stopped', () => {
        try { TurnTimer.stop(); } catch (_) {}
    });

    // When the local player's clock runs out:
    //   - If the buy/landing modal is open, auto-pick 'skip' (so the tile
    //     goes to auction instead of being silently lost) or 'continue' for
    //     informational modals like tax/rent.
    //   - If no modal is open, just advance the turn.
    // Aim is: never let one player stall the whole table by sitting in a
    // modal indefinitely.
    window.__onTurnTimeout = function () {
        if (!OnlineMode.isMyTurn()) return;
        try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('warning'); } catch (_) {}

        // Try to close any open action modal with a sensible default. The
        // post-roll dice.onResult flow will then continue and naturally call
        // finishTurnOnline. If no modal is open, advance the turn ourselves.
        const actionVisible = document.getElementById('actionModal')?.classList.contains('visible');
        const jailVisible = document.getElementById('jailModal')?.classList.contains('visible');
        if (actionVisible && typeof ActionModal.forceResolve === 'function') {
            // 'skip' is the safest default — for purchasable tiles it triggers
            // an auction; for rent/tax modals (which only accept 'continue')
            // the open await ignores unknown values and proceeds.
            ActionModal.forceResolve('skip');
            return;
        }
        if (jailVisible && typeof JailModal.forceResolve === 'function') {
            // Default: roll dice (least costly, doesn't drain money)
            JailModal.forceResolve({ action: 'roll' });
            return;
        }
        advanceTurnSkippingBankrupt();
        finishTurnOnline(false);
    };

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
        // Sum of: (half house cost × houses) + mortgage value of unmortgaged tiles.
        const owned = GameState.getOwnedTiles(playerId);
        let total = 0;
        for (const idx of owned) {
            const data = window.MonopolyData.PROPERTY_DATA[idx];
            if (!data) continue;
            const houses = GameState.getHouses(idx);
            if (houses > 0 && data.houseCost) {
                total += Math.floor(data.houseCost / 2) * houses;
            }
            // Unmortgaged tile can be mortgaged for cash
            if (!GameState.isMortgaged(idx)) {
                total += data.mortgage || 0;
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
                await Players.movePlayerToSync(playerId, idx, awardGo, (pid) => {
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
        const online = OnlineMode.enabled;

        // Chance / Chest → draw card.
        // PHASE 3: cards are temporarily disabled online (they return in
        // Phase 4 as server-side draws) to avoid client/server balance
        // divergence. Offline still draws normally.
        if (!skipCards && (tile.type === 'chance' || tile.type === 'chest')) {
            if (online) return; // server treats card tiles as no-op for now
            await drawAndApplyCard(player.id, tile.type);
            return;
        }

        // GO TO JAIL → fly to JAIL tile and set in-jail state.
        // Online: the server already set jail state; we just animate + sync
        // via the engine snapshot. Move the token visually.
        if (tile.type === 'corner' && tile.i === 30) {
            await Players.movePlayerToSync(player.id, 10, /*awardGo*/ false);
            if (!online) GameState.sendToJail(player.id);
            return;
        }

        // Someone else's property → pay rent.
        // Online: the SERVER already deducted rent during ROLL_DICE; we only
        // show the informational modal and let the engine snapshot update the
        // balances. We must NOT call payOrBust again (double charge).
        const ownerId = GameState.getOwner(tile.i);
        if (ownerId && ownerId !== player.id) {
            const rent = GameState.calcRent(tile.i, lastDiceSum);
            if (rent > 0) {
                const choice = await ActionModal.showForLanding({
                    tile,
                    playerId: player.id,
                    players: Players.PLAYERS.map(p => ({ ...p, money: GameState.getMoney(p.id) })),
                    lastDiceSum,
                });
                if (!online) {
                    await payOrBust(player.id, rent, `Аренда ${tile.name}`, ownerId);
                }
            }
            return;
        }

        // Tax tile → must pay.
        // Online: server already deducted; just show the modal.
        if (tile.type === 'tax') {
            const amount = tile.name === 'Income Tax' ? 200 : 100;
            await ActionModal.showForLanding({
                tile,
                playerId: player.id,
                players: Players.PLAYERS.map(p => ({ ...p, money: GameState.getMoney(p.id) })),
                lastDiceSum,
            });
            if (!online) {
                await payOrBust(player.id, amount, tile.name);
            }
            return;
        }

        // Free purchasable tile → buy or skip.
        if ((tile.type === 'property' || tile.type === 'railroad' || tile.type === 'utility')
            && !ownerId) {
            // In online mode, only the active player sees the buy modal.
            if (online && !OnlineMode.isMyTurn()) return;

            const choice = await ActionModal.showForLanding({
                tile,
                playerId: player.id,
                players: Players.PLAYERS.map(p => ({ ...p, money: GameState.getMoney(p.id) })),
                lastDiceSum,
            });

            if (online) {
                // PHASE 3: send the intent — the server validates funds,
                // deducts money, assigns ownership and broadcasts the new
                // state. We do NOT mutate locally.
                if (choice === 'buy') {
                    OnlineMode.sendIntent({ type: 'BUY' });
                } else {
                    OnlineMode.sendIntent({ type: 'DECLINE' });
                    // PHASE 5: the server starts the auction and broadcasts
                    // AUCTION_STARTED to everyone (including us). The UI opens
                    // from that event — no local auction flow.
                }
                return;
            }

            // OFFLINE path
            if (choice === 'buy') {
                GameState.buyTile(player.id, tile.i);
            } else {
                await runDeclineAuction(player, tile);
            }
            return;
        }

        // Owned by self → show informational modal (no money change)
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

    // Auction helper extracted so both online-decline and offline-decline can
    // reuse it. (Phase 5 will move the auction money flow to the server too.)
    async function runDeclineAuction(player, tile) {
        const eligible = Players.PLAYERS.filter(p =>
            p.id !== player.id && !GameState.isBankrupt(p.id)
        );
        if (eligible.length === 0) return;
        const result = await Auction.start(tile, eligible, {
            online: OnlineMode.enabled,
            initiator: true,
            myPlayerId: OnlineMode.enabled
                ? Players.PLAYERS[OnlineMode.myIdx]?.id
                : null,
        });
        if (result.winnerId && result.price > 0) {
            GameState.changeMoney(result.winnerId, -result.price, 'Выиграл аукцион');
            directAssignOwnership(result.winnerId, tile.i, result.price);
            if (OnlineMode.enabled) {
                OnlineMode.send({
                    type: 'interim_snapshot',
                    snapshot: GameState.serialize(),
                    positions: Players.serializePositions(),
                });
            }
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

        // Determine who actually rolled. In online mode we use the player
        // id carried inside the broadcast (set in the dice_rolled handler);
        // this is the source of truth and avoids race conditions with
        // turn_complete arriving mid-animation. Fallback: local pointer.
        let player;
        if (OnlineMode.enabled && !OnlineMode.isMyTurn() && window.__remoteRollingPlayerId) {
            player = Players.PLAYERS.find(p => p.id === window.__remoteRollingPlayerId)
                     || Players.getCurrentPlayer();
        } else {
            player = Players.getCurrentPlayer();
        }

        // ============================================================
        // ONLINE / PASSIVE PLAYER PATH
        // Passives never run jail logic, landing, payOrBust or modal
        // prompts (those belong to the active player). To still look
        // alive on their screen, animate the token movement when the
        // active player is NOT in jail (movement is deterministic from
        // the dice). Then exit and wait for the snapshot.
        // ============================================================
        if (OnlineMode.enabled && !OnlineMode.isMyTurn()) {
            // Animate the token move if:
            //   - the active player is not in jail (normal roll), OR
            //   - they ARE in jail but rolled doubles (escape → move)
            // Otherwise (jail + non-doubles) the token stays put.
            const activeInJail = GameState.isInJail(player.id);
            const willMove = !activeInJail || result.doubles;
            if (willMove) {
                try {
                    await Players.moveSteps(player.id, result.sum, () => {});
                } catch (_) {}
            }
            window.__remoteRollingPlayerId = null;
            rollBtn.classList.remove('rolling');
            rollBtn.disabled = false;
            return;
        }

        // ============================================================
        // ACTIVE PLAYER PATH
        // ============================================================

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
                        finishTurnOnline(false);
                        return;
                    }
                    GameState.releaseFromJail(player.id);
                    // Fall through to move
                } else {
                    // Stay in jail, turn ends — pass control to the next player
                    advanceTurnSkippingBankrupt();
                    finishTurnOnline(false);
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

        // Advance turn (unless doubles), skipping bankrupt players.
        // PHASE 3 ONLINE: we do NOT advance the turn locally — the server's
        // engine owns the turn pointer and will broadcast the new turnIdx via
        // publicState after our END_TURN intent. We only send the intent here.
        const online = OnlineMode.enabled;
        if (!result.doubles) {
            consecutiveDoubles = 0;
            if (online) {
                finishTurnOnline(false); // sends END_TURN + advisory snapshot
            } else {
                let next = Players.advanceTurn();
                let safety = 0;
                while (GameState.isBankrupt(next.id) && safety++ < 4) {
                    next = Players.advanceTurn();
                }
                refreshTurnIndicator();
            }
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
                await Players.movePlayerToSync(player.id, 10, /*awardGo*/ false);
                if (!online) GameState.sendToJail(player.id);
                if (online) {
                    // Server already jailed + advanced on its side during the
                    // 3rd ROLL_DICE; just sync positions, the turnIdx comes
                    // from publicState.
                    finishTurnOnline(false);
                } else {
                    let next = Players.advanceTurn();
                    let safety = 0;
                    while (GameState.isBankrupt(next.id) && safety++ < 4) {
                        next = Players.advanceTurn();
                    }
                    refreshTurnIndicator();
                }
            } else {
                const curEl = document.querySelector('.hud-player.current');
                if (curEl) {
                    curEl.animate(
                        [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }],
                        { duration: 350, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
                    );
                }
                // Doubles: same player goes again. Broadcast positions so peers
                // see this sub-move; keep the turn (no END_TURN).
                finishTurnOnline(true);
            }
        }

        rollBtn.classList.remove('rolling');
        rollBtn.disabled = false;
    });

    /**
     * Active player only: broadcast the full game state + whose turn it is
     * so passive clients sync. `sameTurn` true means the active player keeps
     * the turn (jail stay / doubles).
     */
    function finishTurnOnline(sameTurn) {
        if (!OnlineMode.enabled) return;
        // PHASE 3: the engine owns money/ownership. We still send positions +
        // turn pointer through the legacy channel so passives sync token
        // placement and whose-turn, but the snapshot is no longer the source
        // of truth for balances (the engine state overrides it). We also send
        // END_TURN to the engine so the server advances its authoritative
        // turn pointer.
        if (!sameTurn) {
            OnlineMode.sendIntent({ type: 'END_TURN' });
        }
        OnlineMode.send({
            type: 'turn_complete',
            snapshot: GameState.serialize(),
            positions: Players.serializePositions(),
            turnIdx: getCurrentTurnIdx(),
            phase3: true, // marker: snapshot is advisory, engine is authoritative
        });
    }

    function getCurrentTurnIdx() {
        // Derive current turn index from Players
        const cur = Players.getCurrentPlayer();
        return Players.PLAYERS.findIndex(p => p.id === cur.id);
    }

    // Passive clients: apply the active player's end-of-turn snapshot.
    // In Phase 3 the engine state (applied via onEngineState) is authoritative
    // for money/ownership; this snapshot still syncs positions and turn, and
    // its money values are immediately corrected by the next engine burst.
    OnlineMode.on('turn_complete', ({ snapshot, positions, turnIdx }) => {
        GameState.applySnapshot(snapshot);
        Players.applyPositions(positions);
        Players.setTurnIndex(turnIdx);
        refreshTurnIndicator();
        rollBtn.classList.remove('rolling');
        rollBtn.disabled = false;
        // Re-apply the latest engine state on top so any stale/tampered
        // snapshot money is overwritten by the server's truth.
        if (window.__lastEngineState) {
            try { applyEngineState(window.__lastEngineState); } catch (_) {}
        }
    });

    // Passives replay token animations triggered by the active player's
    // card effects, jail dispatch, etc.
    OnlineMode.on('token_animate', async (action) => {
        try {
            if (action.kind === 'flyTo') {
                await Players.movePlayerTo(action.playerId, action.targetIdx, action.awardGo);
            } else if (action.kind === 'steps') {
                await Players.moveSteps(action.playerId, action.steps, null);
            }
        } catch (_) {}
    });

    // ---- Server stub ----
    function fakeServerRoll() {
        return {
            a: 1 + Math.floor(Math.random() * 6),
            b: 1 + Math.floor(Math.random() * 6),
        };
    }

    /**
     * Apply a specific dice roll. Called by both the local "I roll" path
     * (with locally generated a/b) and the remote "received from peer" path.
     * In online mode, jail logic + dice animation are kept identical on
     * every client so all state mutations stay in sync.
     */
    async function applyRoll(a, b, throwParams = {}) {
        if (dice.isRolling) return;

        diceResultEl.classList.remove('visible');
        swipeHintEl.classList.add('hidden');
        rollBtn.classList.add('rolling');
        rollBtn.disabled = true;

        try { tg?.HapticFeedback?.impactOccurred('light'); } catch (_) {}

        await dice.rollTo(a, b, throwParams);
    }

    async function doRoll(throwParams = {}) {
        if (dice.isRolling) return;

        // Online: only the active player can roll
        if (OnlineMode.enabled && !OnlineMode.isMyTurn()) return;

        // Jail check: if current player is in jail, show jail modal first.
        // In online mode the jail UI is local (only the active player sees it);
        // its outcome is folded into the roll/turn flow.
        const cur = Players.getCurrentPlayer();
        let releasedFromJail = false;
        if (GameState.isInJail(cur.id)) {
            const result = await JailModal.show(cur);
            if (result.action === 'pay') {
                if (OnlineMode.enabled) {
                    // PHASE 6: server takes the $50 and releases; the state
                    // broadcast updates money/jail flags. We optimistically
                    // continue to the roll — the server rejects the roll if
                    // the payment didn't go through (e.g. not enough money).
                    OnlineMode.sendIntent({ type: 'JAIL_PAY' });
                    releasedFromJail = true;
                } else {
                    await payOrBust(cur.id, 50, 'Выход из тюрьмы');
                    if (GameState.isBankrupt(cur.id)) {
                        advanceTurnSkippingBankrupt();
                        finishTurnOnline(false);
                        return;
                    }
                    GameState.releaseFromJail(cur.id);
                    releasedFromJail = true;
                }
            } else if (result.action === 'cant_pay') {
                if (OnlineMode.enabled) {
                    // Server-side surrender of the turn: without money the
                    // engine will keep them jailed; just end the attempt.
                    OnlineMode.sendIntent({ type: 'SURRENDER' });
                    return;
                }
                await payOrBust(cur.id, 50, 'Выход из тюрьмы');
                advanceTurnSkippingBankrupt();
                finishTurnOnline(false);
                return;
            }
        }

        const rollingPlayerId = cur.id;

        // Start the post-roll countdown immediately for all clients (server
        // hasn't yet taken over the timer; that lives in phase 6).
        const postRollEndsAt = Date.now() + TurnTimer.DURATION_MS;
        OnlineMode.send({ type: 'turn_timer_started', endsAt: postRollEndsAt });
        try { TurnTimer.start(postRollEndsAt); } catch (_) {}

        if (OnlineMode.enabled) {
            // SERVER-AUTHORITATIVE roll. The server generates a, b and
            // broadcasts DICE_ROLLED to everyone. The handler below
            // (OnlineMode.onEngineEvent('DICE_ROLLED', ...)) runs applyRoll
            // for every client — including us — so we don't roll locally.
            //
            // NO FALLBACK: if the server doesn't respond, we surface a
            // connection error instead of generating a local roll. Letting
            // the client roll locally on timeout would be a cheat vector —
            // an attacker could pretend the server didn't respond and
            // submit arbitrary values. Bad UX > cheating.
            if (releasedFromJail) {
                window.__remoteRollingPlayerId = rollingPlayerId;
            }
            // Remember the swipe params for MY roll so the engine-event
            // handler can apply the directional throw animation. Cleared
            // once consumed.
            window.__myThrowParams = throwParams || {};
            window.__diceServerResponded = false;
            window.__diceTimeoutTimer = setTimeout(() => {
                if (window.__diceServerResponded) return;
                console.warn('[dice] no response from server after 6s');
                rollBtn.classList.remove('rolling');
                rollBtn.disabled = false;
                try { showServerOfflineToast(); } catch (_) {}
            }, 6000);
            OnlineMode.sendIntent({ type: 'ROLL_DICE' });
        } else {
            // OFFLINE: legacy local roll
            const { a, b } = fakeServerRoll();
            OnlineMode.send({ type: 'dice_rolled', a, b, releasedFromJail, playerId: rollingPlayerId });
            await applyRoll(a, b, throwParams);
        }
    }

    function showServerOfflineToast() {
        if (document.getElementById('serverOfflineToast')) return;
        const t = document.createElement('div');
        t.id = 'serverOfflineToast';
        t.className = 'server-offline-toast';
        t.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/></svg>
            <span>Нет ответа от сервера. Попробуйте ещё раз.</span>
        `;
        document.body.appendChild(t);
        setTimeout(() => { t.classList.add('is-leaving'); setTimeout(() => t.remove(), 300); }, 3500);
    }

    // Apply rolls coming in from other players (legacy client-authoritative).
    // Kept for the OFFLINE path only — in online mode this listener also
    // fires because the bridge still relays old-style dice_rolled events
    // from the engine path (when phase 2 hadn't switched the canonical path
    // over), but the if(dice.isRolling) guard prevents double animation.
    OnlineMode.on('dice_rolled', ({ a, b, releasedFromJail, playerId }) => {
        if (dice.isRolling) return;
        if (releasedFromJail && playerId) {
            if (GameState.isInJail(playerId)) {
                GameState.releaseFromJail(playerId);
            }
        }
        window.__remoteRollingPlayerId = playerId || null;
        applyRoll(a, b);
    });

    // ---------- SERVER-AUTHORITATIVE ENGINE EVENTS (Phase 2+) ----------

    // PHASE 3: the server's engine is authoritative for money, ownership,
    // mortgages, houses, jail and bankruptcy. On every engine burst we apply
    // the server's state on top of whatever the client computed locally —
    // this silently corrects any client-side tampering. Convert the engine's
    // slot-indexed state into the client's player-id-keyed snapshot format.
    let __lastEngineState = null;
    function applyEngineState(state, applyPositionsToo) {
        if (!state || !Array.isArray(state.players)) return;
        __lastEngineState = state;
        window.__lastEngineState = state;
        const snap = { players: {}, tiles: {} };
        for (const sp of state.players) {
            const localPlayer = Players.PLAYERS[sp.idx];
            if (!localPlayer) continue;
            const pid = localPlayer.id;
            snap.players[pid] = {
                money: sp.money,
                ownedTiles: sp.ownedTiles || [],
                mortgaged: sp.mortgaged || [],
                bankrupt: sp.bankrupt,
                inJail: sp.inJail,
                jailTurns: sp.jailTurns,
                houses: sp.houses || {},
            };
            for (const tIdx of (sp.ownedTiles || [])) {
                snap.tiles[tIdx] = { ownedBy: pid };
            }
        }
        GameState.applySnapshot(snap);

        // On resume we also snap tokens to their server positions instantly
        // (no walk animation). During live play we skip this — positions are
        // animated by moveSteps and would jump if we forced them here.
        if (applyPositionsToo) {
            const posMap = {};
            for (const sp of state.players) {
                const lp = Players.PLAYERS[sp.idx];
                if (!lp) continue;
                posMap[lp.id] = { position: sp.position, lap: sp.lap || 0 };
            }
            try { Players.applyPositions(posMap); } catch (_) {}
        }

        // TURN POINTER is server-authoritative in Phase 3. Apply the server's
        // turnIdx so the client never drives the turn on its own.
        if (typeof state.turnIdx === 'number') {
            const curIdx = Players.PLAYERS.findIndex(p => p.id === Players.getCurrentPlayer().id);
            if (curIdx !== state.turnIdx || applyPositionsToo) {
                Players.setTurnIndex(state.turnIdx);
                try { refreshTurnIndicator(); } catch (_) {}
                rollBtn.classList.remove('rolling');
                rollBtn.disabled = false;
            }
        }
    }
    OnlineMode.onEngineState((state) => {
        applyEngineState(state, false);
    });

    // Server pushes this shortly after a reconnect through the live channel.
    // It carries the full authoritative state; apply positions too so the
    // board fully restores even if the postMessage resume path was missed.
    OnlineMode.onEngineEvent('RESUME_SYNC', (ev) => {
        console.log('[resume] RESUME_SYNC received via live channel, turnIdx=', ev.turnIdx);
        if (window.__lastEngineState) {
            applyEngineState(window.__lastEngineState, true);
        }
    });

    // ---- PHASE 4: server-drawn cards ----
    // The server draws the card, applies its effect to the authoritative
    // state, and tells us what happened. We only present it.
    OnlineMode.onEngineEvent('CARD_DRAWN', async (ev) => {
        try {
            await CardModal.show(ev.deck, { title: ev.card.title, description: ev.card.description });
        } catch (_) {}
    });
    OnlineMode.onEngineEvent('MOVED_BY_CARD', async (ev) => {
        // Animate the token to the server-decided position (no local GO
        // bonus — money comes from the engine state).
        const lp = Players.PLAYERS[ev.playerIdx];
        if (!lp) return;
        try { await Players.movePlayerToSync(lp.id, ev.to, false); } catch (_) {}
        // Money/jail changes already arrived in the same burst's state.
        if (window.__lastEngineState) applyEngineState(window.__lastEngineState, false);
    });
    OnlineMode.onEngineEvent('JAIL_PAID', (ev) => {
        // Money change arrives with the state snapshot; nothing extra to do.
    });

    // ---- PHASE 5: server-run auction ----
    OnlineMode.onEngineEvent('AUCTION_STARTED', (ev) => {
        try { Auction.openServer(ev); } catch (e) { console.error(e); }
    });
    OnlineMode.onEngineEvent('AUCTION_TURN', (ev) => { try { Auction.serverApply(ev); } catch (_) {} });
    OnlineMode.onEngineEvent('AUCTION_BID_MADE', (ev) => { try { Auction.serverApply(ev); } catch (_) {} });
    OnlineMode.onEngineEvent('AUCTION_PASSED', (ev) => { try { Auction.serverApply(ev); } catch (_) {} });
    OnlineMode.onEngineEvent('AUCTION_ENDED', (ev) => {
        try { Auction.serverEnd(ev); } catch (_) {}
        // Money/ownership arrive in the same burst's state snapshot.
    });

    // ---- PHASE 5: server-validated trade ----
    OnlineMode.onEngineEvent('TRADE_PROPOSED', (ev) => {
        // Show the incoming offer to its target only
        if (ev.toIdx !== OnlineMode.myIdx) return;
        try { TradeModal.showIncomingServer(ev); } catch (e) { console.error(e); }
    });
    OnlineMode.onEngineEvent('TRADE_RESULT', (ev) => {
        try { TradeModal.closeAllServer(ev); } catch (_) {}
    });

    OnlineMode.onEngineEvent('DICE_ROLLED', (ev) => {
        window.__diceServerResponded = true;
        if (window.__diceTimeoutTimer) {
            clearTimeout(window.__diceTimeoutTimer);
            window.__diceTimeoutTimer = null;
        }
        const p = Players.PLAYERS[ev.playerIdx];
        window.__remoteRollingPlayerId = p ? p.id : null;
        // If this is MY roll, use the swipe throw params I stashed so the
        // directional throw animation matches my gesture. Others get default.
        const isMine = OnlineMode.enabled && ev.playerIdx === OnlineMode.myIdx;
        const tp = isMine ? (window.__myThrowParams || {}) : {};
        window.__myThrowParams = null;
        applyRoll(ev.a, ev.b, tp);
    });

    OnlineMode.onEngineReject((rej) => {
        console.warn('[engine] rejected', rej.intent, '→', rej.error);
        // Server explicitly refused our intent — release the dice UI but
        // do NOT fall back to a local roll (that would let an attacker
        // force a local-only outcome by spoofing rejections).
        if (rej.intent === 'ROLL_DICE') {
            window.__diceServerResponded = true;
            if (window.__diceTimeoutTimer) {
                clearTimeout(window.__diceTimeoutTimer);
                window.__diceTimeoutTimer = null;
            }
            rollBtn.classList.remove('rolling');
            rollBtn.disabled = false;
            try {
                const t = document.createElement('div');
                t.className = 'server-offline-toast';
                t.innerHTML = `<span>Сервер отклонил действие${rej.error ? ': ' + rej.error : ''}</span>`;
                document.body.appendChild(t);
                setTimeout(() => { t.classList.add('is-leaving'); setTimeout(() => t.remove(), 300); }, 3500);
            } catch (_) {}
        }
    });

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

    if (backBtn) backBtn.addEventListener('click', () => {
        exitToMenu();
    });

    window.addEventListener('error', (e) => {
        console.error('[monopoly] error:', e.error || e.message);
    });

    console.log('[monopoly] Phase 3 ready: economy + actions + HUD.');
    } // end wireGame
})();