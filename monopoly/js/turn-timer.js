/* ============================================================
   turn-timer.js
   Visible countdown for the active player's turn. When the
   timer hits zero, the active client auto-skips their turn.
   Only runs in online mode.

   API:
     TurnTimer.init()       — once on game start
     TurnTimer.start()      — call when a new turn begins
     TurnTimer.stop()       — cancel current countdown
   ============================================================ */

(function (global) {
    'use strict';

    const TURN_SECONDS = 120;
    const WARN_SECONDS = 30; // last 30s flash red

    let badgeEl   = null;
    let timeEl    = null;
    let intervalId = null;
    let endsAt    = 0;

    function init() {
        if (badgeEl) return;
        const wrap = document.createElement('div');
        wrap.id = 'turnTimer';
        wrap.className = 'turn-timer';
        wrap.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
            </svg>
            <span class="turn-timer-time" id="turnTimerTime">2:00</span>
        `;
        document.body.appendChild(wrap);
        badgeEl = wrap;
        timeEl = document.getElementById('turnTimerTime');
    }

    function show() { if (badgeEl) badgeEl.classList.add('visible'); }
    function hide() { if (badgeEl) badgeEl.classList.remove('visible', 'is-warning'); }

    function format(secs) {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function tick() {
        const remaining = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
        if (timeEl) timeEl.textContent = format(remaining);
        if (badgeEl) badgeEl.classList.toggle('is-warning', remaining <= WARN_SECONDS);
        if (remaining <= 0) {
            stop();
            // Fire timeout callback — only the local active player auto-skips
            if (window.OnlineMode?.enabled && window.OnlineMode.isMyTurn()) {
                try { window.__onTurnTimeout?.(); } catch (_) {}
            }
        }
    }

    function start() {
        if (!window.OnlineMode?.enabled) return; // local game: no timer
        init();
        endsAt = Date.now() + TURN_SECONDS * 1000;
        if (intervalId) clearInterval(intervalId);
        tick();
        intervalId = setInterval(tick, 500);
        show();
    }

    function stop() {
        if (intervalId) { clearInterval(intervalId); intervalId = null; }
        hide();
    }

    global.TurnTimer = { init, start, stop };
})(window);
