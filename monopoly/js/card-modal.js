/* ============================================================
   card-modal.js
   Shows a drawn Chance or Community Chest card with flip animation
   and an OK button to apply the effect.
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
            <div class="modal-backdrop" id="cardModalBackdrop"></div>
            <div class="card-modal" id="cardModal" role="dialog" aria-modal="true" aria-hidden="true">
                <div class="card-modal-content" id="cardModalContent"></div>
            </div>
        `;
        while (wrap.firstElementChild) {
            document.body.appendChild(wrap.firstElementChild);
        }
        backdropEl = document.getElementById('cardModalBackdrop');
        modalEl    = document.getElementById('cardModal');
        contentEl  = document.getElementById('cardModalContent');
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
     * Show a card. `type` = 'chance' | 'chest'. Returns a promise that
     * resolves when the user taps OK.
     */
    function show(type, card) {
        const isChance = type === 'chance';
        const bgGradient = isChance
            ? 'linear-gradient(135deg, #ff9b1f, #ff7a00)'
            : 'linear-gradient(135deg, #4ab8ff, #1a7df0)';
        const label = isChance ? 'ШАНС' : 'ОБЩЕСТВЕННАЯ КАЗНА';
        const icon  = isChance ? '?' : '$';

        contentEl.innerHTML = `
            <div class="card-modal-card" style="background: ${bgGradient};">
                <div class="card-modal-card-icon">${icon}</div>
                <div class="card-modal-card-label">${label}</div>
                <div class="card-modal-card-title">${card.title}</div>
                <div class="card-modal-card-desc">${card.description}</div>
            </div>

            <div class="action-modal-buttons">
                <button class="action-btn action-btn-primary" id="cardOkBtn">
                    Принять
                </button>
            </div>
        `;
        document.getElementById('cardOkBtn').addEventListener('click', close);

        modalEl.classList.add('visible');
        backdropEl.classList.add('visible');
        modalEl.setAttribute('aria-hidden', 'false');
        try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('warning'); } catch (_) {}

        return new Promise((resolve) => { pendingResolve = resolve; });
    }

    global.CardModal = { init, show };
})(window);
