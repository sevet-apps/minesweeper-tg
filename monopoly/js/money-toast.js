/* ============================================================
   money-toast.js
   Floating "+$200" / "-$50" text that floats up and fades.
   Pinned to current player's token (or HUD if no token reference).
   ============================================================ */

(function (global) {
    'use strict';

    let layerEl = null;

    function init() {
        layerEl = document.createElement('div');
        layerEl.className = 'money-toast-layer';
        document.body.appendChild(layerEl);
    }

    /**
     * Show a "+$200" or "-$50" toast over the given DOM element.
     * @param {Element} anchorEl - element to position over
     * @param {number} amount - positive (gain) or negative (loss)
     */
    function showAt(anchorEl, amount) {
        if (!layerEl || !anchorEl) return;
        const r = anchorEl.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top  + r.height / 2;

        // Decide horizontal anchoring: if the token is on the right half of
        // the screen, anchor the toast to the right edge of the token so the
        // wide "−$320" text grows leftward and stays on-screen. On the left
        // half, anchor to the left edge. Otherwise center.
        const screenW = window.innerWidth;
        const el = document.createElement('div');
        el.className = `money-toast ${amount >= 0 ? 'money-toast-gain' : 'money-toast-loss'}`;
        const sign = amount >= 0 ? '+' : '−';
        el.textContent = `${sign}$${Math.abs(amount)}`;

        if (cx > screenW * 0.62) {
            // Right side: pin right edge to token, grow left
            el.style.left = `${cx}px`;
            el.classList.add('money-toast-right');
        } else if (cx < screenW * 0.38) {
            // Left side: pin left edge to token, grow right
            el.style.left = `${cx}px`;
            el.classList.add('money-toast-left');
        } else {
            // Center
            el.style.left = `${cx}px`;
        }
        el.style.top = `${cy}px`;
        layerEl.appendChild(el);

        setTimeout(() => el.remove(), 1600);
    }

    /**
     * Show toast over a player's token (looked up by id).
     */
    function showOverPlayer(playerId, amount) {
        const tokenEl = document.getElementById(`token-${playerId}`);
        if (tokenEl) showAt(tokenEl, amount);
    }

    global.MoneyToast = { init, showAt, showOverPlayer };
})(window);