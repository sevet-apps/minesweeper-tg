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

        const el = document.createElement('div');
        el.className = `money-toast ${amount >= 0 ? 'money-toast-gain' : 'money-toast-loss'}`;
        const sign = amount >= 0 ? '+' : '−';
        el.textContent = `${sign}$${Math.abs(amount)}`;
        // Always centered over the token; nowrap (in CSS) keeps the sign inline.
        el.style.left = `${cx}px`;
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