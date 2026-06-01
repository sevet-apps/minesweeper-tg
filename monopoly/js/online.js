/* ============================================================
   online.js
   Bridges the iframe game with the Spark app's socket via
   postMessage. When the URL contains a 'room' param we are
   in online mode: only the active player generates actions,
   all clients apply them identically.
   ============================================================ */

(function (global) {
    'use strict';

    let enabled = false;
    let myIdx = 0;
    let roomCode = null;
    let currentTurnIdx = 0;
    let playerConfigs = []; // [{name, color}, ...]
    const listeners = {};   // event name -> [handlers]

    /**
     * Initialize online mode from URL params.
     * Returns null if not in online mode, otherwise { players, myIdx }.
     */
    function initFromUrl() {
        const p = new URLSearchParams(location.search);
        const room = p.get('room');
        if (!room) return null;

        roomCode = room;
        enabled = true;
        myIdx = parseInt(p.get('myIdx')) || 0;
        const isResume = p.get('resume') === '1';

        try {
            const rawPlayers = JSON.parse(p.get('players') || '[]');
            // Server gives { username, photo_url, ... } per slot.
            // Map to game config { name, color }.
            const COLORS = ['#0a84ff', '#ff2a2a', '#29c463', '#ffd60a'];
            playerConfigs = rawPlayers.map((srv, i) => ({
                name: srv.username || `Игрок ${i + 1}`,
                color: COLORS[i] || '#888',
            }));
        } catch (e) {
            console.error('[online] bad players param:', e);
            playerConfigs = [];
        }

        // Listen for messages from the parent app
        window.addEventListener('message', onParentMessage);

        return { players: playerConfigs, myIdx, roomCode, isResume };
    }

    function onResume(fn) {
        if (!listeners['_resume']) listeners['_resume'] = [];
        listeners['_resume'].push(fn);
    }

    function onParentMessage(e) {
        const data = e.data;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'monopoly_action_in' && data.action) {
            // Apply an action received from another player
            const a = data.action;
            const handlers = listeners[a.type] || [];
            handlers.forEach(fn => { try { fn(a); } catch (err) { console.error(err); } });
        } else if (data.type === 'monopoly_player_left') {
            (listeners['_player_left'] || []).forEach(fn => fn(data));
        } else if (data.type === 'monopoly_resume_snapshot' && data.snapshot) {
            // Resume the game from a server-stored snapshot after a reconnect
            (listeners['_resume'] || []).forEach(fn => {
                try { fn(data.snapshot, { turnEndsAt: data.turnEndsAt }); }
                catch (err) { console.error(err); }
            });
        }
    }

    /**
     * Send an action to other players. Only the active player should call this.
     */
    function send(action) {
        if (!enabled) return;
        try {
            window.parent.postMessage({
                type: 'monopoly_action_out',
                roomCode,
                action,
            }, '*');
        } catch (e) { console.error('[online] send failed:', e); }
    }

    /**
     * Subscribe to an incoming action type.
     * fn(action) is called when another player sends that action.
     */
    function on(type, fn) {
        if (!listeners[type]) listeners[type] = [];
        listeners[type].push(fn);
    }

    function isMyTurn() {
        return !enabled || currentTurnIdx === myIdx;
    }

    function setCurrentTurnIdx(idx) {
        currentTurnIdx = idx;
        // Notify UI to lock/unlock controls
        try {
            document.body.classList.toggle('online-not-my-turn', enabled && idx !== myIdx);
        } catch (_) {}
    }

    global.OnlineMode = {
        initFromUrl,
        send, on, onResume,
        isMyTurn, setCurrentTurnIdx,
        get enabled() { return enabled; },
        get myIdx() { return myIdx; },
        get roomCode() { return roomCode; },
    };
})(window);