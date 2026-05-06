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
    if (tg) {
        try {
            tg.ready();
            tg.expand();
            document.body.setAttribute('data-theme', 'dark');
        } catch (e) {
            console.warn('Telegram WebApp init failed:', e);
        }
    }

    // ---- Bootstrap ----
    PropertyModal.init();
    ActionModal.init();
    MoneyToast.init();

    BoardUI.renderBoard((tile) => PropertyModal.open(tile));

    const boardEl = document.getElementById('board');

    Players.init(boardEl);
    GameState.init(Players.PLAYERS);
    PlayerHUD.init(Players.PLAYERS);

    // Wire money-change events to floating toasts
    GameState.on('moneyChange', ({ playerId, delta }) => {
        if (delta !== 0) MoneyToast.showOverPlayer(playerId, delta);
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

    const dbgFps     = document.getElementById('dbgFps');
    const dbgDice    = document.getElementById('dbgDice');
    const dbgRetries = document.getElementById('dbgRetries');

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

    // ---- Resolve landing on a tile ----
    async function handleLanding(player, tile, lastDiceSum) {
        const pAsObj = { ...player, money: GameState.getMoney(player.id) };

        const choice = await ActionModal.showForLanding({
            tile,
            playerId: player.id,
            players: Players.PLAYERS.map(p => ({
                ...p, money: GameState.getMoney(p.id)
            })),
            lastDiceSum,
        });

        if (choice === 'buy') {
            GameState.buyTile(player.id, tile.i);
        } else if (choice === 'pay') {
            GameState.payRent(player.id, tile.i, lastDiceSum);
        } else if (choice && choice.action === 'tax') {
            GameState.payTax(player.id, choice.amount, tile.name);
        }
        // 'skip' / 'continue' → no transaction
    }

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

        // Move with GO callback
        await Players.moveSteps(player.id, result.sum, (pid) => {
            GameState.awardGoBonus(pid);
            try { tg?.HapticFeedback?.notificationOccurred('success'); } catch (_) {}
        });

        // Resolve landing
        const landedIdx = Players.getPlayerState(player.id).position;
        const landedTile = window.MonopolyData.TILES[landedIdx];
        await handleLanding(player, landedTile, result.sum);

        // Advance turn (unless doubles)
        if (!result.doubles) {
            Players.advanceTurn();
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
        diceResultEl.classList.remove('visible');
        swipeHintEl.classList.add('hidden');
        rollBtn.classList.add('rolling');
        rollBtn.disabled = true;

        try { tg?.HapticFeedback?.impactOccurred('light'); } catch (_) {}

        const { a, b } = fakeServerRoll();
        await dice.rollTo(a, b, throwParams);
    }

    rollBtn.addEventListener('click', () => doRoll());

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
        try { tg?.HapticFeedback?.impactOccurred('light'); } catch (_) {}
        history.back();
    });

    window.addEventListener('error', (e) => {
        console.error('[monopoly] error:', e.error || e.message);
    });

    console.log('[monopoly] Phase 3 ready: economy + actions + HUD.');
})();