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
    const ALL_PLAYERS = [
        { id: 'p1', name: 'Игрок 1', initial: 'И', color: '#0a84ff', money: 1500 },
        { id: 'p2', name: 'Игрок 2', initial: 'Y', color: '#ff2a2a', money: 1500 },
        { id: 'p3', name: 'Игрок 3', initial: 'M', color: '#29c463', money: 1500 },
        { id: 'p4', name: 'Игрок 4', initial: 'A', color: '#ffd60a', money: 1500 },
    ];

    // Active player set — mutated by configure() before init().
    const PLAYERS = ALL_PLAYERS.slice();

    /**
     * Configure the active players before the game starts.
     * @param {Array<{name, color}>} configs - one entry per player (2-4)
     */
    function configure(configs) {
        PLAYERS.length = 0;
        configs.forEach((cfg, i) => {
            const name = (cfg.name || `Игрок ${i + 1}`).trim() || `Игрок ${i + 1}`;
            PLAYERS.push({
                id: `p${i + 1}`,
                name,
                initial: name.charAt(0).toUpperCase(),
                color: cfg.color,
                money: 1500,
            });
        });
        // Rebuild STATE for the new set
        for (const k of Object.keys(STATE)) delete STATE[k];
        for (const p of PLAYERS) STATE[p.id] = { position: 0, lap: 0 };
        currentTurnIndex = 0;
    }

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

        // Defer first placement until after layout settles - getBoundingClientRect
        // can return wrong values if called too early. Two RAFs is reliable.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                for (const p of PLAYERS) {
                    placeTokenOnTile(p.id, 0, /* animate */ false);
                }
            });
        });
    }

    /**
     * Compute the pixel center of a tile relative to the tokens layer.
     * The tokens layer is the actual coordinate system tokens live in,
     * and it's inside the board's content box (after padding/border).
     */
    function tileCenterPx(tileIdx) {
        const tileEl = document.querySelector(`.tile[data-idx="${tileIdx}"]`);
        if (!tileEl || !tokensRoot) return null;

        const tileRect = tileEl.getBoundingClientRect();
        const layerRect = tokensRoot.getBoundingClientRect();

        return {
            x: (tileRect.left + tileRect.right) / 2 - layerRect.left,
            y: (tileRect.top  + tileRect.bottom) / 2 - layerRect.top,
            w: tileRect.width,
            h: tileRect.height,
        };
    }

    /**
     * Calculate per-token offset for a group of N tokens on the same tile.
     * The group is centered as a unit, then each token is offset from the
     * group's center by its slot number.
     *
     * Layouts:
     *  - 1 token  → exactly center
     *  - 2 tokens → side-by-side along tile's long axis
     *  - 3 tokens → one center + one each side
     *  - 4 tokens → 2x2 grid
     *
     * Spacing is `tokenSize + gap` so circles touch but don't overlap;
     * if the tile is too small the spacing tightens but is never less
     * than tokenSize (no overlap).
     */
    function tokenOffsetForSlot(slot, totalCount, tileW, tileH, tokenSize) {
        if (totalCount <= 1) return { dx: 0, dy: 0 };

        const isCorner = Math.abs(tileW - tileH) < 8;
        const isHorizontalTile = tileW > tileH;

        // Corners with 3 or 4 tokens: 2x2 grid
        // (3 tokens = L-shape, since slot 3 stays empty - looks better than a line)
        if (isCorner && totalCount >= 3) {
            const desired = tokenSize * 0.55;
            const maxOff  = Math.max(0, (Math.min(tileW, tileH) - tokenSize) / 2 - 2);
            const off = Math.min(desired, maxOff);
            const dx = (slot % 2 === 0 ? -off : off);
            const dy = (slot < 2 ? -off : off);
            return { dx, dy };
        }

        // Linear arrangement (2 tokens, or non-corner tiles with 2-4 tokens)
        const axisLength = isHorizontalTile ? tileW : tileH;
        const desiredSpacing = tokenSize + 2;
        const maxSpacing = Math.max(
            tokenSize,
            (axisLength - tokenSize - 4) / Math.max(1, totalCount - 1)
        );
        const spacing = Math.min(desiredSpacing, maxSpacing);

        // Center the group
        const offset = (slot - (totalCount - 1) / 2) * spacing;

        return isHorizontalTile
            ? { dx: offset, dy: 0 }
            : { dx: 0,      dy: offset };
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

        const tokenSize = tokenEl.offsetWidth || 24;
        const { dx, dy } = tokenOffsetForSlot(
            validSlot, sharers.length, center.w, center.h, tokenSize
        );

        const x = center.x + dx;
        const y = center.y + dy;

        if (!animate) tokenEl.style.transition = 'none';
        else          tokenEl.style.transition = '';

        tokenEl.style.transform =
            `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    }

    /**
     * Move a player N steps. Positive = forward, negative = backward.
     * Forward movement crosses GO and triggers passedGoCallback.
     * Backward movement never awards GO.
     * Returns a Promise that resolves once movement is complete.
     */
    async function moveSteps(playerId, steps, passedGoCallback) {
        const startIdx = STATE[playerId].position;
        const tokenEl = document.getElementById(`token-${playerId}`);
        if (!tokenEl) return;

        const direction = steps >= 0 ? 1 : -1;
        const absSteps = Math.abs(steps);

        for (let s = 1; s <= absSteps; s++) {
            const newIdx = (startIdx + direction * s + 40 * absSteps) % 40;

            // GO bonus only on forward crossing
            if (direction === 1 && newIdx === 0 && s > 0) {
                STATE[playerId].lap++;
                if (passedGoCallback) passedGoCallback(playerId);
            }

            STATE[playerId].position = newIdx;

            const oldIdx = (startIdx + direction * (s - 1) + 40 * absSteps) % 40;
            recomputeTileLayout(oldIdx);

            tokenEl.classList.add('hopping');
            placeTokenOnTile(playerId, newIdx, /* animate */ true);
            await new Promise(r => setTimeout(r, 220));
            tokenEl.classList.remove('hopping');
        }

        recomputeTileLayout(STATE[playerId].position);

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
        // Reset per-turn building counters for the OUTGOING player
        const outgoing = PLAYERS[currentTurnIndex];
        if (outgoing && window.GameState?.resetTurnCounters) {
            window.GameState.resetTurnCounters(outgoing.id);
        }
        currentTurnIndex = (currentTurnIndex + 1) % PLAYERS.length;
        return getCurrentPlayer();
    }

    /**
     * Fly a player directly to a specific tile in one smooth animation.
     * Used by Chance/Chest cards (long jumps, GO TO JAIL, etc).
     * Token lifts up, flies in an arc, lands at destination.
     *
     * If awardGo is true, awards $200 if the trip crosses GO going forward.
     */
    /**
     * Fly a player to a target tile by moving CLOCKWISE around the board.
     * Unlike step-by-step movement, this is an actual flight: the token
     * lifts up (scales up), traverses corner waypoints in the air, then
     * descends to the destination.
     *
     * Awards GO ($200) automatically if the path crosses tile 0 and awardGo=true.
     */
    async function flyTo(playerId, targetIdx, awardGo, passedGoCallback) {
        const tokenEl = document.getElementById(`token-${playerId}`);
        if (!tokenEl) return;

        const fromIdx = STATE[playerId].position;
        const forwardDist = (targetIdx - fromIdx + 40) % 40;
        if (forwardDist === 0) return;

        // Determine if we cross GO (tile 0)
        const crossesGo = awardGo && (fromIdx + forwardDist >= 40);
        if (crossesGo) {
            STATE[playerId].lap++;
            if (passedGoCallback) passedGoCallback(playerId);
        }

        // Build waypoint list: corners (0/10/20/30) that lie strictly between
        // fromIdx and targetIdx on the clockwise path. The token will fly to
        // each in turn, then descend on the final waypoint (the target).
        const corners = [0, 10, 20, 30];
        const waypoints = [];
        for (let s = 1; s < forwardDist; s++) {
            const idx = (fromIdx + s) % 40;
            if (corners.includes(idx)) waypoints.push(idx);
        }
        waypoints.push(targetIdx);

        // Logical position update happens up front (so other moves see it)
        STATE[playerId].position = targetIdx;
        recomputeTileLayout(fromIdx);

        const tokenSize = tokenEl.offsetWidth || 24;

        // Begin flight: lift the token (scale up + class for shadow)
        tokenEl.classList.add('flying');
        tokenEl.style.zIndex = 60;

        // First leg: rise quickly to "flight altitude" while moving toward
        // first waypoint. Use a single transform with scale baked in.
        const firstWaypoint = waypoints[0];
        const fromCenter = tileCenterPx(fromIdx);
        if (!fromCenter) return;

        // Total flight duration scales with distance, but each leg is a
        // smooth bezier — no per-tile steps.
        const totalMs = Math.max(800, Math.min(2200, forwardDist * 50));
        const perLegMs = totalMs / waypoints.length;

        for (let i = 0; i < waypoints.length; i++) {
            const idx = waypoints[i];
            const center = tileCenterPx(idx);
            if (!center) continue;

            const isLast = i === waypoints.length - 1;

            // On the last leg, center on slot. Intermediate: just tile center
            // with a slight inward offset so the token isn't on the edge of
            // the board.
            let dx = 0, dy = 0;
            if (isLast) {
                const sharers = PLAYERS.filter(p => STATE[p.id].position === targetIdx);
                const slotIdx = sharers.findIndex(p => p.id === playerId);
                const offs = tokenOffsetForSlot(slotIdx, sharers.length, center.w, center.h, tokenSize);
                dx = offs.dx;
                dy = offs.dy;
            }

            const targetX = center.x + dx;
            const targetY = center.y + dy;

            // Mid-flight scale = 1.6 (large, "up high"); landing scale = 1.0
            const scale = isLast ? 1.0 : 1.6;

            // Easing: first leg slow start, intermediates smooth, last decelerates
            let easing;
            if (i === 0)         easing = 'cubic-bezier(0.45, 0, 0.55, 1)';
            else if (isLast)     easing = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
            else                 easing = 'cubic-bezier(0.4, 0, 0.4, 1)';

            tokenEl.style.transition = `transform ${perLegMs}ms ${easing}`;
            tokenEl.style.transform =
                `translate(-50%, -50%) translate(${targetX}px, ${targetY}px) scale(${scale})`;

            await new Promise(r => setTimeout(r, perLegMs));
        }

        tokenEl.classList.remove('flying');
        tokenEl.style.transition = '';
        tokenEl.style.zIndex = '';

        recomputeTileLayout(targetIdx);
        tokenEl.classList.add('landed');
        await new Promise(r => setTimeout(r, 350));
        tokenEl.classList.remove('landed');
    }

    function getPlayerState(playerId) { return STATE[playerId]; }

    /**
     * Move a player directly to a specific tile (used by Chance/Chest cards).
     * Uses smooth flight animation, not step-by-step.
     */
    async function movePlayerTo(playerId, targetIdx, awardGo, passedGoCallback) {
        if (STATE[playerId].position === targetIdx) return;
        await flyTo(playerId, targetIdx, awardGo, passedGoCallback);
    }

    global.Players = {
        PLAYERS,
        configure,
        init,
        moveSteps,
        movePlayerTo,
        relayoutAll,
        getCurrentPlayer,
        advanceTurn,
        getPlayerState,
    };
})(window);