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
     * Show a notice. Returns a promise that resolves when the user
     * dismisses the modal.
     *
     * opts: { icon, title, body, btnText, accent }
     *   accent: 'red' | 'orange' | 'gold' | undefined
     */
    function show({ icon = 'ℹ️', title, body = '', btnText = 'Принять', accent } = {}) {
        contentEl.innerHTML = `
            <div class="notice-icon">${icon}</div>
            <div class="notice-title ${accent ? 'notice-title-' + accent : ''}">${title}</div>
            ${body ? `<div class="notice-body">${body}</div>` : ''}
            <div class="notice-buttons">
                <button class="action-btn action-btn-primary" id="noticeOkBtn">${btnText}</button>
            </div>
        `;
        document.getElementById('noticeOkBtn').addEventListener('click', close);

        modalEl.classList.add('visible');
        backdropEl.classList.add('visible');
        modalEl.setAttribute('aria-hidden', 'false');
        try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium'); } catch (_) {}

        return new Promise((resolve) => { pendingResolve = resolve; });
    }

    global.NoticeModal = { init, show };
})(window);
