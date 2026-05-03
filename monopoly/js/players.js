/* ============================================================
   players.js
   - Player definitions (4 players, color + initial)
   - Token DOM elements positioned over the board grid
   - Animated step-by-step movement around the perimeter
   ============================================================ */

(function (global) {
    'use strict';

    // ---- Player roster ----
    // For local single-device testing all 4 are placeholder users.
    // In multiplayer (Phase 5) these come from the matchmaking server.
    const PLAYERS = [
        { id: 'p1', name: 'Игрок 1', initial: 'И', color: '#0a84ff', money: 1500 },
        { id: 'p2', name: 'Игрок 2', initial: 'Y', color: '#ff2a2a', money: 1500 },
        { id: 'p3', name: 'Игрок 3', initial: 'M', color: '#29c463', money: 1500 },
        { id: 'p4', name: 'Игрок 4', initial: 'A', color: '#ffd60a', money: 1500 },
    ];

    // Mutable runtime state (keyed by player id)
    const STATE = {};
    for (const p of PLAYERS) {
        STATE[p.id] = { position: 0, lap: 0 };
    }

    let currentTurnIndex = 0;

    // ---- Token DOM management ----
    let tokensRoot = null; // <div class="tokens-layer"> overlaid on board

    function init(boardEl) {
        // Build a separate overlay layer inside the board
        tokensRoot = document.createElement('div');
        tokensRoot.className = 'tokens-layer';
        boardEl.appendChild(tokensRoot);

        for (const p of PLAYERS) {
            const el = document.createElement('div');
            el.className = 'player-token';
            el.id = `token-${p.id}`;
            el.style.setProperty('--token-color', p.color);
            el.textContent = p.initial;
            tokensRoot.appendChild(el);
        }

        // Place all tokens on GO at start
        for (const p of PLAYERS) {
            placeTokenOnTile(p.id, 0, /* animate */ false);
        }
    }

    /**
     * Compute the pixel center of a tile inside the board element.
     * Uses getBoundingClientRect of the actual rendered tile <div>.
     */
    function tileCenterPx(tileIdx) {
        const tileEl = document.querySelector(`.tile[data-idx="${tileIdx}"]`);
        const boardEl = document.getElementById('board');
        if (!tileEl || !boardEl) return null;

        const tileRect  = tileEl.getBoundingClientRect();
        const boardRect = boardEl.getBoundingClientRect();

        return {
            x: (tileRect.left + tileRect.right) / 2 - boardRect.left,
            y: (tileRect.top  + tileRect.bottom) / 2 - boardRect.top,
        };
    }

    /**
     * Calculate per-token offset within a tile when multiple tokens stack.
     * 4 tokens arrange in 2x2 mini grid centered on the tile.
     */
    function tokenOffsetForSlot(slot, tokenSize) {
        const half = tokenSize / 2;
        // 2x2 layout: slot 0 = top-left, 1 = top-right, 2 = bottom-left, 3 = bottom-right
        const dx = (slot % 2 === 0 ? -half : half) * 0.5;
        const dy = (slot < 2 ? -half : half) * 0.5;
        return { dx, dy };
    }

    /**
     * Move (or initially place) a player's token to a specific tile.
     * If animate is false, snap instantly.
     */
    function placeTokenOnTile(playerId, tileIdx, animate = true) {
        const tokenEl = document.getElementById(`token-${playerId}`);
        if (!tokenEl) return;

        const center = tileCenterPx(tileIdx);
        if (!center) return;

        // Determine slot among players that share this tile
        const sharers = PLAYERS.filter(p => STATE[p.id].position === tileIdx);
        const slotIdx = sharers.findIndex(p => p.id === playerId);
        const validSlot = slotIdx >= 0 ? slotIdx : 0;

        const tokenSize = tokenEl.offsetWidth || 26;
        const { dx, dy } = tokenOffsetForSlot(validSlot, tokenSize);

        const x = center.x + dx;
        const y = center.y + dy;

        if (!animate) tokenEl.style.transition = 'none';
        else          tokenEl.style.transition = '';

        tokenEl.style.transform =
            `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    }

    /**
     * Move a player N steps forward, hopping tile-by-tile with a bounce.
     * Returns a Promise that resolves once movement is complete.
     */
    async function moveSteps(playerId, steps) {
        const startIdx = STATE[playerId].position;
        const tokenEl = document.getElementById(`token-${playerId}`);
        if (!tokenEl) return;

        for (let s = 1; s <= steps; s++) {
            const newIdx = (startIdx + s) % 40;

            // Track lap counts (for "passed GO" rule later)
            if (newIdx === 0 && s > 0) STATE[playerId].lap++;

            // Update logical position FIRST so other moves see it correctly
            STATE[playerId].position = newIdx;

            // Snap any other tokens that were on the OLD tile to recompute layout
            // (so they fill in vacated slots)
            const oldIdx = (startIdx + s - 1) % 40;
            recomputeTileLayout(oldIdx);

            // Hop animation: small upward bounce while moving
            tokenEl.classList.add('hopping');

            placeTokenOnTile(playerId, newIdx, /* animate */ true);

            await new Promise(r => setTimeout(r, 220));

            tokenEl.classList.remove('hopping');
        }

        // Final layout for destination tile (in case other tokens already there)
        recomputeTileLayout(STATE[playerId].position);

        // Settle bounce
        tokenEl.classList.add('landed');
        await new Promise(r => setTimeout(r, 350));
        tokenEl.classList.remove('landed');
    }

    /**
     * Re-layout all tokens currently on a tile to fill slots 0..N.
     */
    function recomputeTileLayout(tileIdx) {
        const sharers = PLAYERS.filter(p => STATE[p.id].position === tileIdx);
        for (const p of sharers) {
            placeTokenOnTile(p.id, tileIdx, /* animate */ true);
        }
    }

    /**
     * Re-layout EVERY token. Called on resize so tokens stay on tiles.
     */
    function relayoutAll() {
        for (const p of PLAYERS) {
            placeTokenOnTile(p.id, STATE[p.id].position, /* animate */ false);
        }
    }

    // ---- Turn management ----
    function getCurrentPlayer() { return PLAYERS[currentTurnIndex]; }

    function advanceTurn() {
        currentTurnIndex = (currentTurnIndex + 1) % PLAYERS.length;
        return getCurrentPlayer();
    }

    function getPlayerState(playerId) { return STATE[playerId]; }

    global.Players = {
        PLAYERS,
        init,
        moveSteps,
        relayoutAll,
        getCurrentPlayer,
        advanceTurn,
        getPlayerState,
    };
})(window);
