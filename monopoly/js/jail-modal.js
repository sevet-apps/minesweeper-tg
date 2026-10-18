/* ============================================================
   jail-modal.js
   Pre-turn modal for players in jail. Shows options:
     - Try to roll doubles (uses a turn)
     - Pay $50 to leave immediately
   After 3 failed attempts, player must pay or go bankrupt.
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
            <div class="modal-backdrop" id="jailBackdrop"></div>
            <div class="jail-modal" id="jailModal" role="dialog" aria-modal="true" aria-hidden="true">
                <div class="jail-modal-content" id="jailContent"></div>
            </div>
        `;
        while (wrap.firstElementChild) {
            document.body.appendChild(wrap.firstElementChild);
        }
        backdropEl = document.getElementById('jailBackdrop');
        modalEl    = document.getElementById('jailModal');
        contentEl  = document.getElementById('jailContent');
    }

    function close(result) {
        modalEl.classList.remove('visible');
        backdropEl.classList.remove('visible');
        modalEl.setAttribute('aria-hidden', 'true');
        if (pendingResolve) {
            const r = pendingResolve;
            pendingResolve = null;
            setTimeout(() => r(result), 300);
        }
    }

    /**
     * Show jail options. Returns:
     *   { action: 'pay' } - player paid $50, will move on next roll
     *   { action: 'roll' } - player tries to roll doubles
     */
    function show(player) {
        const attemptsUsed = GameState.getJailTurns(player.id);
        const attemptsLeft = 3 - attemptsUsed;
        const canPay = GameState.canAfford(player.id, 50);
        const mustPay = attemptsLeft <= 0;

        contentEl.innerHTML = `
            <div class="jail-icon">🔒</div>
            <div class="jail-title">${player.name} в тюрьме</div>
            <div class="jail-subtitle">
                ${mustPay
                    ? 'Три попытки исчерпаны. Нужно заплатить $50 и выйти.'
                    : `Попыток выкинуть дубль: ${attemptsLeft} из 3`}
            </div>

            <div class="jail-buttons">
                <button class="action-btn action-btn-primary" id="jailPayBtn"
                        ${canPay ? '' : 'disabled'}>
                    ${canPay ? 'Заплатить $50' : 'Недостаточно $50'}
                </button>
                ${mustPay ? '' : `
                    <button class="action-btn action-btn-secondary" id="jailRollBtn">
                        Бросить кубики
                    </button>
                `}
            </div>

            ${mustPay && !canPay ? `
                <div class="jail-bankruptcy-hint">
                    У вас недостаточно средств. Игрок будет признан банкротом.
                </div>
            ` : ''}
        `;

        document.getElementById('jailPayBtn').addEventListener('click', () => {
            if (canPay) close({ action: 'pay' });
            else if (mustPay) close({ action: 'cant_pay' });
        });
        const rollBtn = document.getElementById('jailRollBtn');
        if (rollBtn) rollBtn.addEventListener('click', () => close({ action: 'roll' }));

        modalEl.classList.add('visible');
        backdropEl.classList.add('visible');
        modalEl.setAttribute('aria-hidden', 'false');

        return new Promise((resolve) => { pendingResolve = resolve; });
    }

    function forceResolve(result) {
        if (pendingResolve) close(result);
    }

    global.JailModal = { init, show, forceResolve };
})(window);