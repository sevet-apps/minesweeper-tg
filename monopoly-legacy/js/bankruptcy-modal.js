/* ============================================================
   bankruptcy-modal.js
   Shown when a player owes money but can't pay (balance + assets
   insufficient). In this MVP version we just declare them bankrupt
   and remove from active play.

   Phase 4 will add: sell back to bank, mortgage properties.
   ============================================================ */

(function (global) {
    'use strict';

    let backdropEl = null;
    let modalEl = null;
    let contentEl = null;
    let pendingResolve = null;

    function init() {
        const wrap = document.createElement('div');
        wrap.innerHTML = `
            <div class="modal-backdrop" id="bankruptcyBackdrop"></div>
            <div class="bankruptcy-modal" id="bankruptcyModal" role="dialog" aria-modal="true" aria-hidden="true">
                <div class="bankruptcy-modal-content" id="bankruptcyContent"></div>
            </div>
        `;
        while (wrap.firstElementChild) {
            document.body.appendChild(wrap.firstElementChild);
        }
        backdropEl = document.getElementById('bankruptcyBackdrop');
        modalEl    = document.getElementById('bankruptcyModal');
        contentEl  = document.getElementById('bankruptcyContent');
    }

    function close() {
        modalEl.classList.remove('visible');
        backdropEl.classList.remove('visible');
        modalEl.setAttribute('aria-hidden', 'true');
        if (pendingResolve) {
            const r = pendingResolve;
            pendingResolve = null;
            setTimeout(() => r(), 300);
        }
    }

    /**
     * Show bankruptcy notice. Returns a promise that resolves when
     * the user taps "ОК".
     */
    function show({ player, owedTo, owedAmount, reason }) {
        const owedTitle = owedTo
            ? `платежу <strong style="color: ${owedTo.color}">${owedTo.name}</strong>`
            : 'банку';

        contentEl.innerHTML = `
            <div class="bankruptcy-icon">💸</div>
            <div class="bankruptcy-title">Банкротство</div>
            <div class="bankruptcy-subtitle">
                <strong style="color: ${player.color}">${player.name}</strong> не может ${owedTitle}.
            </div>
            <div class="bankruptcy-amount">
                Сумма к оплате: <strong>$${owedAmount}</strong>
            </div>
            <div class="bankruptcy-balance">
                На счёте: <strong>$${GameState.getMoney(player.id)}</strong>
            </div>
            <div class="bankruptcy-reason">${reason || 'Игрок выбывает из игры.'}</div>
            <div class="action-modal-buttons">
                <button class="action-btn action-btn-primary" id="bankruptcyOkBtn">
                    Принять
                </button>
            </div>
        `;
        document.getElementById('bankruptcyOkBtn').addEventListener('click', close);

        modalEl.classList.add('visible');
        backdropEl.classList.add('visible');
        modalEl.setAttribute('aria-hidden', 'false');
        try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error'); } catch (_) {}

        return new Promise((resolve) => { pendingResolve = resolve; });
    }

    global.BankruptcyModal = { init, show };
})(window);
