/* Game and foreground changes share the authenticated game socket. */
(function (root) {
    'use strict';
    function create(socket, doc = document) {
        let game = null;
        let interval = null;
        let scheduled = false;
        function emit(visible, heartbeat = false) {
            if (!socket.connected) return;
            const channel = heartbeat && socket.volatile ? socket.volatile : socket;
            channel.emit('player_presence', { game, visible });
        }
        function sync() {
            clearInterval(interval);
            interval = null;
            if (!socket.connected) return;
            emit(!doc.hidden);
            if (!doc.hidden) interval = setInterval(() => { if (!doc.hidden) emit(true, true); }, 45_000);
        }
        socket.on('connect', sync);
        socket.on('disconnect', () => { clearInterval(interval); interval = null; });
        doc.addEventListener('visibilitychange', sync);
        root.addEventListener('pagehide', () => { clearInterval(interval); interval = null; emit(false); });
        root.addEventListener('pageshow', event => { if (event.persisted) sync(); });
        return {
            setGame(next) {
                if (game === next) return;
                game = next;
                if (scheduled) return;
                scheduled = true;
                Promise.resolve().then(() => { scheduled = false; if (!doc.hidden) emit(true); });
            },
        };
    }
    root.SparkPlayerPresence = { create };
})(window);
