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

    let pendingResumePayload = null;

    function onResume(fn) {
        if (!listeners['_resume']) listeners['_resume'] = [];
        listeners['_resume'].push(fn);
        // If the resume snapshot already arrived before this subscription
        // (race between the parent's push and our init), replay it now so
        // it isn't lost.
        if (pendingResumePayload) {
            const p = pendingResumePayload;
            pendingResumePayload = null;
            try { fn(p.snapshot, p.meta); } catch (err) { console.error(err); }
        }
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
        } else if (data.type === 'monopoly_resume_snapshot' && (data.snapshot || data.engineSnapshot)) {
            // Resume the game from a server-stored snapshot after a reconnect.
            console.log('[online] resume snapshot received; engineSnapshot=',
                data.engineSnapshot ? 'yes' : 'null',
                'listeners=', (listeners['_resume'] || []).length);
            const meta = { turnEndsAt: data.turnEndsAt, engineSnapshot: data.engineSnapshot };
            const fns = listeners['_resume'] || [];
            if (fns.length === 0) {
                // Game not initialized yet — buffer for replay in onResume()
                pendingResumePayload = { snapshot: data.snapshot, meta };
                console.log('[online] resume snapshot buffered (game not ready yet)');
            } else {
                fns.forEach(fn => {
                    try { fn(data.snapshot, meta); }
                    catch (err) { console.error(err); }
                });
            }
        } else if (data.type === 'monopoly_engine_event_in') {
            // Server-authoritative event burst from the engine. Apply state
            // snapshot first (so handlers see updated turnIdx/money), then
            // dispatch each typed event.
            const payload = data.payload || {};
            if (payload.state) {
                (listeners['_engine_state'] || []).forEach(fn => {
                    try { fn(payload.state); } catch (e) { console.error(e); }
                });
            }
            const events = Array.isArray(payload.events) ? payload.events : [];
            for (const ev of events) {
                const key = '_engine_' + ev.type;
                (listeners[key] || []).forEach(fn => {
                    try { fn(ev); } catch (e) { console.error(e); }
                });
            }
        } else if (data.type === 'monopoly_engine_reject_in') {
            (listeners['_engine_reject'] || []).forEach(fn => {
                try { fn(data.payload || {}); } catch (e) { console.error(e); }
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

    /**
     * Send a server-authoritative intent. The server validates with its
     * engine and broadcasts canonical events that everyone (including us)
     * applies. Used for actions migrated to Phase 2+ (dice, buy, etc).
     */
    function sendIntent(intent) {
        if (!enabled) return;
        try {
            window.parent.postMessage({
                type: 'monopoly_intent_out',
                roomCode,
                intent,
            }, '*');
        } catch (e) { console.error('[online] sendIntent failed:', e); }
    }

    /**
     * Subscribe to a server engine event type (e.g. 'DICE_ROLLED').
     */
    function onEngineEvent(type, fn) {
        const key = '_engine_' + type;
        if (!listeners[key]) listeners[key] = [];
        listeners[key].push(fn);
    }

    /**
     * Subscribe to engine rejections (server said no to our intent).
     */
    function onEngineReject(fn) {
        if (!listeners['_engine_reject']) listeners['_engine_reject'] = [];
        listeners['_engine_reject'].push(fn);
    }

    /**
     * Subscribe to the latest authoritative state slice that arrives with
     * every engine event burst. fn(state).
     */
    function onEngineState(fn) {
        if (!listeners['_engine_state']) listeners['_engine_state'] = [];
        listeners['_engine_state'].push(fn);
    }

    /**
     * Ask the parent app to (re)send the resume snapshot. Called by the game
     * once it has fully initialized and subscribed via onResume — this
     * pull-based handshake removes the race where the parent's early push
     * arrives before our listeners exist.
     */
    function requestResume() {
        if (!enabled) return;
        try {
            console.log('[online] sending monopoly_resume_request to parent');
            window.parent.postMessage({ type: 'monopoly_resume_request', roomCode }, '*');
        } catch (e) { console.error('[online] requestResume failed:', e); }
    }

    global.OnlineMode = {
        initFromUrl,
        send, on, onResume, requestResume,
        sendIntent, onEngineEvent, onEngineState, onEngineReject,
        isMyTurn, setCurrentTurnIdx,
        get enabled() { return enabled; },
        get myIdx() { return myIdx; },
        get roomCode() { return roomCode; },
    };
})(window);