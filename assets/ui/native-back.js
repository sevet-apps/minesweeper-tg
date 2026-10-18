/* Route Telegram's service BackButton to the visible app screen. */
(function (root) {
    'use strict';

    function createNativeBackRouter(doc, backButton, onMonopolyBack, closeTopSheet) {
        let monopolyWantsBack = false;
        let activeControl = null;
        let originalVisibility = '';
        let shown = false;
        let started = false;
        let observer = null;

        function restoreControl() {
            if (activeControl) activeControl.style.visibility = originalVisibility;
            activeControl = null;
        }

        function isVisible(id) {
            return doc.getElementById(id)?.classList.contains('visible');
        }

        function route() {
            // The Monopoly iframe owns its internal navigation and explicitly
            // tells the host when the service button should be visible.
            if (isVisible('monopoly-game')) return monopolyWantsBack ? 'monopoly' : null;

            const spectator = doc.getElementById('bbSpectatorOverlay');
            if (spectator?.classList.contains('visible')) return spectator.querySelector('.back-btn');

            const games = [...doc.querySelectorAll('.game-overlay.visible')];
            const game = games.at(-1);
            if (game) {
                if (game.id === 'monopoly-lobby') {
                    const subScreen = [...game.querySelectorAll('.mono-screen')]
                        .find(el => el.style.display !== 'none' && el.querySelector('.mono-sub-back'));
                    if (subScreen) return subScreen.querySelector('.mono-sub-back');
                }
                return game.querySelector('.back-btn');
            }

            const screens = [...doc.querySelectorAll('.screen.active')]
                .filter(el => el.querySelector('.back-btn'));
            screens.sort((a, b) => (parseInt(a.style.zIndex, 10) || 1) - (parseInt(b.style.zIndex, 10) || 1));
            return screens.at(-1)?.querySelector('.back-btn') || null;
        }

        function sync() {
            if (!backButton || !started) return;
            const next = route();
            if (next === activeControl && shown) return;
            if (next === 'monopoly' && shown && !activeControl) return;
            restoreControl();
            if (!next) {
                if (shown) { try { backButton.hide(); } catch (_) {} }
                shown = false;
                return;
            }
            try {
                if (!shown) backButton.show();
                shown = true;
                if (next !== 'monopoly') {
                    activeControl = next;
                    originalVisibility = next.style.visibility;
                    next.style.visibility = 'hidden';
                }
            } catch (_) {
                restoreControl();
                shown = false;
            }
        }

        function handleBack() {
            // A sheet over a game should close first, rather than exit the game
            // beneath it. Unmanaged dialogs retain their own explicit actions.
            if (closeTopSheet?.()) return;
            const dialog = doc.querySelector('.modal-overlay.visible, .bottom-sheet-overlay.visible');
            if (dialog) {
                const dismiss = dialog.querySelector('.ui-close, [data-i18n="cancel"]');
                if (dismiss) dismiss.click();
                else if (dialog.getAttribute?.('onclick')) dialog.click();
                return;
            }
            const current = route();
            if (current === 'monopoly') onMonopolyBack();
            else if (current && current === activeControl) current.click();
        }

        function start() {
            if (started || !backButton?.onClick || !backButton?.show || !backButton?.hide) return;
            started = true;
            backButton.onClick(handleBack);
            if (root.MutationObserver) {
                observer = new root.MutationObserver(sync);
                doc.querySelectorAll('.screen,.game-overlay,.bb-spectator-overlay,.mono-screen')
                    .forEach(el => observer.observe(el, { attributes: true, attributeFilter: ['class', 'style'] }));
            }
            sync();
        }

        function setMonopolyBackButton(show) {
            monopolyWantsBack = !!show;
            sync();
        }

        function stop() {
            observer?.disconnect();
            restoreControl();
            if (started) {
                try { backButton.hide(); backButton.offClick?.(handleBack); } catch (_) {}
            }
            shown = false;
            started = false;
        }

        return { start, stop, sync, setMonopolyBackButton };
    }

    root.SparkNativeBack = { createNativeBackRouter };
    if (typeof module !== 'undefined') module.exports = { createNativeBackRouter };
})(typeof window !== 'undefined' ? window : globalThis);
