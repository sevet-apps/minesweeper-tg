/* ============================================================
   main.js
   Bootstraps the Monopoly page:
     - Initializes Telegram WebApp
     - Creates SceneManager + Dice
     - Wires Roll button and swipe gesture
     - Updates UI (result readout, debug panel)

   In Phase 1, dice outcomes are random (server stub).
   In Phase 5, replace `fakeServerRoll()` with a real socket call.
   ============================================================ */

(function () {
    'use strict';

    // ---- Telegram WebApp init ----
    const tg = window.Telegram?.WebApp;
    if (tg) {
        try {
            tg.ready();
            tg.expand();
            // Lock to dark theme for consistent 3D look regardless of Telegram setting
            document.body.setAttribute('data-theme', 'dark');
        } catch (e) {
            console.warn('Telegram WebApp init failed:', e);
        }
    }

    // ---- Refs ----
    const sceneContainer = document.getElementById('scene-container');
    const rollBtn        = document.getElementById('rollBtn');
    const backBtn        = document.getElementById('backBtn');
    const diceResultEl   = document.getElementById('diceResult');
    const dieAEl         = document.getElementById('dieA');
    const dieBEl         = document.getElementById('dieB');
    const dieSumEl       = document.getElementById('dieSum');
    const swipeHintEl    = document.getElementById('swipeHint');

    const dbgFps     = document.getElementById('dbgFps');
    const dbgDice    = document.getElementById('dbgDice');
    const dbgRetries = document.getElementById('dbgRetries');

    // ---- Scene setup ----
    const sm = new SceneManager(sceneContainer);
    const board = new Board3D(sm);
    const dice = new Dice(sm);
    sm.start();

    // FPS readout @ ~4Hz
    setInterval(() => {
        dbgFps.textContent = sm.currentFps || '—';
    }, 250);

    // ---- Dice result handling ----
    dice.onResult((result) => {
        dieAEl.textContent = result.a;
        dieBEl.textContent = result.b;
        dieSumEl.textContent = result.sum;
        diceResultEl.classList.add('visible');
        diceResultEl.classList.toggle('doubles', result.doubles);

        dbgDice.textContent = `${result.a} + ${result.b} = ${result.sum}` +
                              (result.doubles ? ' 🎯' : '');
        dbgRetries.textContent = result.retries;

        rollBtn.classList.remove('rolling');
        rollBtn.disabled = false;

        // Telegram haptic
        try {
            if (result.doubles) tg?.HapticFeedback?.notificationOccurred('success');
            else                tg?.HapticFeedback?.impactOccurred('medium');
        } catch (_) {}
    });

    // ---- Server stub ----
    // Phase 1: local random. Phase 5: replace with socket.emit('roll') response.
    function fakeServerRoll() {
        return {
            a: 1 + Math.floor(Math.random() * 6),
            b: 1 + Math.floor(Math.random() * 6),
        };
    }

    // ---- Trigger a roll ----
    async function doRoll(throwParams = {}) {
        if (dice.isRolling) return;

        // Hide previous result + swipe hint
        diceResultEl.classList.remove('visible');
        swipeHintEl.classList.add('hidden');

        rollBtn.classList.add('rolling');
        rollBtn.disabled = true;

        // Haptic on roll start
        try { tg?.HapticFeedback?.impactOccurred('light'); } catch (_) {}

        const { a, b } = fakeServerRoll();
        await dice.rollTo(a, b, throwParams);
    }

    // ---- Button handler ----
    rollBtn.addEventListener('click', () => doRoll());

    // ---- Swipe gesture handler on scene container ----
    // Detects upward swipe; direction and speed shape throw params (visual only,
    // outcome is always server-determined).
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

            // Swipe must be mostly vertical, upward, ≥ 40px, ≤ 800ms
            const isUpward = dy < -40;
            const isVerticalDominant = Math.abs(dy) > Math.abs(dx);
            const isFastEnough = dt < 800;

            if (isUpward && isVerticalDominant && isFastEnough) {
                // Normalize: dirHint from -1 (left) to +1 (right)
                const dirHint = Math.max(-1, Math.min(1, dx / 200));
                // strength: from 0.7 to 1.4 based on swipe speed (px/ms)
                const speed = Math.abs(dy) / dt;
                const strength = Math.max(0.7, Math.min(1.4, 0.6 + speed * 2));
                doRoll({ dirHint, strength });
            }
        };

        // Use pointer events for unified touch/mouse on desktop
        sceneContainer.addEventListener('touchstart', onStart, { passive: true });
        sceneContainer.addEventListener('touchend',   onEnd,   { passive: true });
        sceneContainer.addEventListener('mousedown',  onStart);
        sceneContainer.addEventListener('mouseup',    onEnd);
    })();

    // ---- Back button ----
    backBtn.addEventListener('click', () => {
        // In production: navigate back to main app
        try { tg?.HapticFeedback?.impactOccurred('light'); } catch (_) {}
        if (tg?.close) {
            // For standalone testing, just go back in history instead
            if (document.referrer) history.back();
        } else {
            history.back();
        }
    });

    // ---- Surface errors visibly during dev ----
    window.addEventListener('error', (e) => {
        console.error('[monopoly] error:', e.error || e.message);
    });

    console.log('[monopoly] Phase 1 ready. Tap Roll or swipe up to throw dice.');
})();