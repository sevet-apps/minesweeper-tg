/* Game and foreground changes share the authenticated game socket. */
(function (root) {
    'use strict';
    const overlays = [
        ['privacy', 'privacyScreen'], ['language', 'languageSheet'], ['settings', 'settingsSheet'],
        ['titles', 'titleLibraryOverlay'], ['referrals', 'referralConditionsSheet'], ['streak', 'streakSheet'],
        ['chess_menu', 'modalChess'], ['nardy_menu', 'modalNardy'], ['checkers_menu', 'modalCheckers'],
        ['sudoku_menu', 'modalSudokuResume'], ['sudoku_menu', 'modalSudoku'], ['saper_menu', 'modalSaper'],
        ['monopoly_menu', 'monopoly-lobby'],
    ];
    const pages = [
        ['tournaments', 'view-tournament-history-detail'], ['tournaments', 'view-tournament-history'],
        ['top_game', 'view-leaderboard-detail'], ['bb_menu', 'view-bb-mode'],
        ['profile', 'view-profile'], ['top', 'view-leaderboard'], ['games', 'view-games'],
    ];
    function create(socket, doc = document, getPlaytime = () => ({})) {
        const miniApp = root.Telegram?.WebApp;
        let game = null;
        let monopolyMenu = false;
        let interval = null;
        let scheduled = false;
        let pageAway = false;
        let lastSent;
        const visible = () => !doc.hidden && !pageAway && miniApp?.isActive !== false;
        function section() {
            const overlay = overlays.find(([, id]) => doc.getElementById(id)?.classList.contains('visible'));
            if (overlay) return overlay[0];
            if (monopolyMenu) return 'monopoly_menu';
            if (game) return null;
            const page = pages.find(([, id]) => doc.getElementById(id)?.classList.contains('active'))?.[0] || null;
            return page === 'profile' && doc.getElementById('profileStatsPanel')?.hidden === false ? 'profile_stats' : page;
        }
        function emit(isVisible, heartbeat = false, force = false) {
            if (!socket.connected) return;
            const current = section();
            if (!force && !heartbeat && lastSent?.game === game && lastSent.section === current && lastSent.visible === isVisible) return;
            const channel = heartbeat && socket.volatile ? socket.volatile : socket;
            lastSent = { game, visible: isVisible, section: current };
            channel.emit('player_presence', { ...lastSent, playtime: getPlaytime() });
        }
        function schedule() {
            if (scheduled) return;
            scheduled = true;
            queueMicrotask(() => { scheduled = false; if (visible()) emit(true); });
        }
        function sync() {
            clearInterval(interval);
            interval = null;
            if (!socket.connected) return;
            emit(visible(), false, true);
            if (visible()) interval = setInterval(() => { if (visible()) emit(true, true); }, 30_000);
        }
        function watch() {
            const observer = new root.MutationObserver(schedule);
            for (const id of [...overlays.map(([, id]) => id), ...pages.map(([, id]) => id), 'profileStatsPanel']) {
                const node = doc.getElementById(id);
                if (node) observer.observe(node, { attributes: true, attributeFilter: ['class', 'hidden'] });
            }
            schedule();
        }
        if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', watch, { once: true });
        else watch();
        socket.on('connect', sync);
        socket.on('disconnect', () => { clearInterval(interval); interval = null; });
        doc.addEventListener('visibilitychange', sync);
        miniApp?.onEvent?.('activated', sync);
        miniApp?.onEvent?.('deactivated', sync);
        root.addEventListener('pagehide', () => {
            pageAway = true; clearInterval(interval); interval = null; emit(false);
        });
        root.addEventListener('pageshow', () => { if (pageAway) { pageAway = false; sync(); } });
        return {
            setGame(next) {
                if (game === next) return;
                game = next;
                schedule();
            },
            setMonopolyMenu(open) {
                if (monopolyMenu === open) return;
                monopolyMenu = open;
                schedule();
            },
        };
    }
    root.SparkPlayerPresence = { create };
})(window);
