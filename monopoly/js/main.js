/* ============================================================
   main.js
   Bootstraps the page:
     1. Renders the CSS Monopoly board
     2. Initializes 4 players + tokens on GO
     3. Creates 3D dice scene
     4. Roll button → roll → move current player → advance turn
   ============================================================ */

(function () {
    'use strict';

    // ---- Telegram WebApp init ----
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

    // ---- Render the static board first ----
    PropertyModal.init();
    BoardUI.renderBoard((tile) => {
        PropertyModal.open(tile);
    });

    const boardEl = document.getElementById('board');

    // ---- Initialize players ----
    Players.init(boardEl);

    // Re-layout tokens on resize so they stick to tiles
    window.addEventListener('resize', () => {
        // Allow CSS grid to recompute first
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
    const turnAvatarEl   = document.getElementById('turnAvatar');
    const turnNameEl     = document.getElementById('turnName');

    const dbgFps     = document.getElementById('dbgFps');
    const dbgDice    = document.getElementById('dbgDice');
    const dbgRetries = document.getElementById('dbgRetries');

    // ---- Render turn indicator for current player ----
    function refreshTurnIndicator() {
        const p = Players.getCurrentPlayer();
        turnAvatarEl.textContent = p.initial;
        turnAvatarEl.style.setProperty('--turn-color', p.color);
        turnNameEl.textContent = p.name;
    }
    refreshTurnIndicator();

    // ---- Scene setup (3D dice) ----
    const sm = new SceneManager(diceCanvasContainer);
    const dice = new Dice(sm);
    sm.start();

    setInterval(() => {
        dbgFps.textContent = sm.currentFps || '—';
    }, 250);

    // ---- Dice result handling ----
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

        // ---- Move the current player ----
        const player = Players.getCurrentPlayer();
        await Players.moveSteps(player.id, result.sum);

        // ---- Advance turn (unless doubles - doubles roll again, classic rule) ----
        if (!result.doubles) {
            Players.advanceTurn();
            refreshTurnIndicator();
        } else {
            // brief flash on the current avatar to signal "you go again"
            turnAvatarEl.animate(
                [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }],
                { duration: 350, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
            );
        }

        rollBtn.classList.remove('rolling');
        rollBtn.disabled = false;
    });

    // ---- Server stub (Phase 5: replace with socket.emit) ----
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

    // ---- Swipe gesture on dice canvas container ----
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
        if (tg?.close && document.referrer) history.back();
        else history.back();
    });

    window.addEventListener('error', (e) => {
        console.error('[monopoly] error:', e.error || e.message);
    });

    console.log('[monopoly] Phase 2.3 ready: 4 players + token movement.');
})();