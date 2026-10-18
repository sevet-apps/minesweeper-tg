/* ============================================================
   notice-modal.js
   Compact info modal: icon, title, body, single OK button.
   Returns a promise that resolves when the user dismisses it.
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
            <div class="modal-backdrop" id="noticeBackdrop"></div>
            <div class="notice-modal" id="noticeModal" role="dialog" aria-modal="true" aria-hidden="true">
                <div class="notice-content" id="noticeContent"></div>
            </div>
        `;
        while (wrap.firstElementChild) {
            document.body.appendChild(wrap.firstElementChild);
        }
        backdropEl = document.getElementById('noticeBackdrop');
        modalEl    = document.getElementById('noticeModal');
        contentEl  = document.getElementById('noticeContent');
    }

    function close() {
        modalEl.classList.remove('visible');
        backdropEl.classList.remove('visible');
        modalEl.setAttribute('aria-hidden', 'true');
        if (pendingResolve) {
            const r = pendingResolve;
            pendingResolve = null;
            setTimeout(() => r(), 280);
        }
    }

    /**
     * Show a notice. Returns a promise that resolves to true (confirmed)
     * or false (cancelled). If no cancelText is provided, only the primary
     * button is shown and the promise always resolves to true.
     *
     * opts: { icon, title, body, btnText, cancelText, accent }
     *   accent: 'red' | 'orange' | 'gold' | undefined
     */
    function show({ icon = 'ℹ️', title, body = '', btnText = 'Принять', cancelText, accent } = {}) {
        let resolved = false;
        function finish(result) {
            if (resolved) return;
            resolved = true;
            close();
            // pendingResolve was already swapped & resolved by close() — override
            setTimeout(() => { if (savedResolve) savedResolve(result); }, 0);
        }

        const hasCancel = !!cancelText;
        contentEl.innerHTML = `
            <div class="notice-icon">${icon}</div>
            <div class="notice-title ${accent ? 'notice-title-' + accent : ''}">${title}</div>
            ${body ? `<div class="notice-body">${body}</div>` : ''}
            <div class="notice-buttons ${hasCancel ? 'notice-buttons-pair' : ''}">
                ${hasCancel ? `<button class="action-btn action-btn-secondary" id="noticeCancelBtn">${cancelText}</button>` : ''}
                <button class="action-btn action-btn-primary" id="noticeOkBtn">${btnText}</button>
            </div>
        `;

        const okBtn = document.getElementById('noticeOkBtn');
        const cancelBtn = document.getElementById('noticeCancelBtn');
        okBtn.addEventListener('click', () => finish(true));
        if (cancelBtn) cancelBtn.addEventListener('click', () => finish(false));

        modalEl.classList.add('visible');
        backdropEl.classList.add('visible');
        modalEl.setAttribute('aria-hidden', 'false');
        try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium'); } catch (_) {}

        // Save resolve for the click handlers; the close() promise resolution
        // is replaced by our explicit finish() above so we can pass true/false.
        let savedResolve;
        return new Promise((resolve) => {
            savedResolve = resolve;
            pendingResolve = null; // prevent close() from resolving with undefined
        });
    }

    global.NoticeModal = { init, show };
})(window);