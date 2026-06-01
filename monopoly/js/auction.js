/* ============================================================
   auction.js
   When a player declines to buy a property, it goes to auction
   between all remaining players. Bidding rules:
   - Start at $10
   - Each bid raises by $10 minimum
   - Player can pass (no longer participates this round)
   - Last remaining bidder wins at their bid price

   ONLINE MODE
   - Same modal opens on every client
   - Only the player whose turn it is to bid has active buttons
   - Bid / Pass actions are broadcast as `auction_bid` / `auction_pass`
   - All clients advance the state machine deterministically
   ============================================================ */

(function (global) {
    'use strict';

    let backdropEl = null;
    let modalEl = null;
    let contentEl = null;
    let pendingResolve = null;

    // Auction state
    let participants = [];   // [{id, name, color, initial}] - still bidding
    let currentBid = 0;
    let currentBidder = null; // playerId of leading bidder
    let bidderIndex = 0;     // whose turn to bid/pass
    let tile = null;
    let isOnline = false;
    let myPlayerId = null;   // local player's id (online only)

    function init() {
        const wrap = document.createElement('div');
        wrap.innerHTML = `
            <div class="modal-backdrop" id="auctionBackdrop"></div>
            <div class="auction-modal" id="auctionModal" role="dialog" aria-modal="true" aria-hidden="true">
                <div class="auction-modal-content" id="auctionContent"></div>
            </div>
        `;
        while (wrap.firstElementChild) {
            document.body.appendChild(wrap.firstElementChild);
        }
        backdropEl = document.getElementById('auctionBackdrop');
        modalEl    = document.getElementById('auctionModal');
        contentEl  = document.getElementById('auctionContent');

        // Online listeners — bids/passes from other clients
        if (global.OnlineMode) {
            OnlineMode.on('auction_bid', (action) => applyBid(action.byId));
            OnlineMode.on('auction_pass', (action) => applyPass(action.byId));
            OnlineMode.on('auction_start', (action) => {
                // Other clients (non-initiator) open the auction modal
                openFromRemote(action.tileIdx);
            });
            OnlineMode.on('auction_end', (action) => {
                // Local close happens via state-machine convergence; this is a
                // safety net if some clients drift.
                close({ winnerId: action.winnerId, price: action.price }, /*broadcast*/false);
            });
        }
    }

    /**
     * Start an auction for the given tile.
     * Returns a promise resolving to { winnerId, price } or { winnerId: null }
     * if everyone passed.
     */
    function start(auctionTile, allPlayers, opts = {}) {
        tile = auctionTile;
        isOnline = !!(opts.online && global.OnlineMode?.enabled);
        myPlayerId = opts.myPlayerId || null;
        isInitiator = !!opts.initiator;

        // Snapshot players that have enough to start bidding ($10 minimum)
        participants = allPlayers
            .filter(p => GameState.getMoney(p.id) >= 10)
            .map(p => ({ ...p }));
        currentBid = 0;
        currentBidder = null;
        bidderIndex = 0;

        if (participants.length === 0) {
            return Promise.resolve({ winnerId: null, price: 0 });
        }

        // In online mode, the initiator tells everyone else to open up
        if (isOnline && opts.initiator) {
            OnlineMode.send({ type: 'auction_start', tileIdx: tile.i });
        }

        return new Promise((resolve) => {
            pendingResolve = resolve;
            render();
            modalEl.classList.add('visible');
            backdropEl.classList.add('visible');
            modalEl.setAttribute('aria-hidden', 'false');
        });
    }

    /**
     * Open the auction modal on a non-initiator client when receiving an
     * auction_start broadcast.
     */
    function openFromRemote(tileIdx) {
        // Already open?
        if (modalEl.classList.contains('visible')) return;
        const allTiles = window.MonopolyData?.TILES || [];
        const remoteTile = allTiles[tileIdx];
        if (!remoteTile) return;

        // Eligible = everyone with >= $10 EXCEPT the player who declined.
        // The initiator broadcast came from the active player; we exclude them.
        const currentPlayer = global.Players.getCurrentPlayer();
        const eligible = global.Players.PLAYERS.filter(p =>
            p.id !== currentPlayer.id && !GameState.isBankrupt(p.id)
        );

        tile = remoteTile;
        isOnline = true;
        isInitiator = false;
        myPlayerId = OnlineMode.enabled
            ? global.Players.PLAYERS[OnlineMode.myIdx]?.id
            : null;
        participants = eligible
            .filter(p => GameState.getMoney(p.id) >= 10)
            .map(p => ({ ...p }));
        currentBid = 0;
        currentBidder = null;
        bidderIndex = 0;

        if (participants.length === 0) return;

        return new Promise((resolve) => {
            pendingResolve = resolve;
            render();
            modalEl.classList.add('visible');
            backdropEl.classList.add('visible');
            modalEl.setAttribute('aria-hidden', 'false');
        });
    }

    let isInitiator = false;

    function close(result, broadcast = true) {
        modalEl.classList.remove('visible');
        backdropEl.classList.remove('visible');
        modalEl.setAttribute('aria-hidden', 'true');
        // Only the initiator broadcasts auction_end (state has already
        // converged on every client, but this is a safety net).
        if (isOnline && broadcast && isInitiator) {
            OnlineMode.send({
                type: 'auction_end',
                winnerId: result.winnerId,
                price: result.price,
            });
        }
        if (pendingResolve) {
            const r = pendingResolve;
            pendingResolve = null;
            // Small delay so close animation plays
            setTimeout(() => r(result), 300);
        }
        isOnline = false;
        isInitiator = false;
    }

    // ---------- State-machine helpers (used by both local and remote actions)
    function applyBid(byId) {
        // Find the bidder in current participants
        const idx = participants.findIndex(p => p.id === byId);
        if (idx === -1) return;
        currentBid = currentBid + 10;
        currentBidder = byId;
        // Advance to next bidder
        bidderIndex = (idx + 1) % participants.length;
        try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium'); } catch (_) {}
        render();
    }

    function applyPass(byId) {
        const idx = participants.findIndex(p => p.id === byId);
        if (idx === -1) return;
        participants.splice(idx, 1);
        // Next player slides into this slot — don't increment.
        if (bidderIndex >= participants.length) bidderIndex = 0;
        try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); } catch (_) {}
        render();
    }

    let auctionTimerInterval = null;
    let auctionTimerEndsAt = 0;
    const AUCTION_TURN_MS = 30_000;

    function clearAuctionTimer() {
        if (auctionTimerInterval) {
            clearInterval(auctionTimerInterval);
            auctionTimerInterval = null;
        }
    }

    function startAuctionTimer(bidder) {
        clearAuctionTimer();
        auctionTimerEndsAt = Date.now() + AUCTION_TURN_MS;
        const tickAuc = () => {
            const remaining = Math.max(0, Math.round((auctionTimerEndsAt - Date.now()) / 1000));
            const el = document.getElementById('auctionTimerTime');
            if (el) el.textContent = `0:${remaining.toString().padStart(2, '0')}`;
            const wrap = document.getElementById('auctionTimer');
            if (wrap) wrap.classList.toggle('is-warning', remaining <= 10);
            if (remaining <= 0) {
                clearAuctionTimer();
                // Only the local player whose turn it is auto-passes (sends
                // the broadcast); other clients converge via the same event.
                const myPid = isOnline
                    ? Players.PLAYERS[OnlineMode.myIdx]?.id
                    : null;
                if (!isOnline || (myPid && bidder && bidder.id === myPid)) {
                    if (isOnline) OnlineMode.send({ type: 'auction_pass', byId: bidder.id });
                    applyPass(bidder.id);
                }
            }
        };
        tickAuc();
        auctionTimerInterval = setInterval(tickAuc, 500);
    }

    function render() {
        // Auction ends if only one bidder left and they have current bid
        if (participants.length === 1 && currentBidder === participants[0].id) {
            clearAuctionTimer();
            close({ winnerId: currentBidder, price: currentBid });
            return;
        }
        if (participants.length === 0) {
            clearAuctionTimer();
            close({ winnerId: null, price: 0 });
            return;
        }

        // Whose turn is it?
        if (bidderIndex >= participants.length) bidderIndex = 0;
        const bidder = participants[bidderIndex];
        const playerMoney = GameState.getMoney(bidder.id);
        const minBid = currentBid + 10;
        const canBid = playerMoney >= minBid;

        // Online: only the player whose turn it is can press buttons,
        // and only if they're the local player.
        const isLocalsBidTurn = !isOnline || (myPlayerId && bidder.id === myPlayerId);

        // Build participant list
        const participantsList = participants.map(p => {
            const isLeader = p.id === currentBidder;
            const isCurrent = p.id === bidder.id;
            return `
                <div class="auction-participant ${isCurrent ? 'is-current' : ''} ${isLeader ? 'is-leader' : ''}"
                     style="--p-color: ${p.color}">
                    <div class="auction-participant-avatar">${p.initial}</div>
                    <div class="auction-participant-name">${p.name}</div>
                    ${isLeader ? `<div class="auction-leader-badge">$${currentBid}</div>` : ''}
                </div>
            `;
        }).join('');

        const leaderText = currentBidder
            ? (() => {
                const lp = participants.find(p => p.id === currentBidder)
                       || global.Players.PLAYERS.find(p => p.id === currentBidder);
                return `Текущая ставка: <strong>$${currentBid}</strong> (${lp.name})`;
            })()
            : `Стартовая ставка: <strong>$10</strong>`;

        const turnLine = isLocalsBidTurn
            ? `<strong>Ваш ход</strong> — баланс $${playerMoney}`
            : `Ходит <strong>${bidder.name}</strong> — баланс $${playerMoney}`;

        contentEl.innerHTML = `
            <div class="auction-header">
                <div class="auction-eyebrow">АУКЦИОН</div>
                <div class="auction-title">${tile.name}</div>
                <div class="auction-subtitle">Базовая цена: $${tile.price}</div>
            </div>

            <div class="auction-state">
                ${leaderText}
            </div>

            <div class="auction-participants">
                ${participantsList}
            </div>

            <div class="auction-current-turn">
                ${turnLine}
            </div>

            ${isOnline ? `
                <div class="auction-timer" id="auctionTimer">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                    </svg>
                    <span id="auctionTimerTime">0:30</span>
                </div>
            ` : ''}

            <div class="auction-buttons">
                <button class="action-btn action-btn-primary" id="auctionBidBtn"
                        ${(canBid && isLocalsBidTurn) ? '' : 'disabled'}>
                    ${isLocalsBidTurn
                        ? (canBid ? `Поднять до $${minBid}` : 'Недостаточно средств')
                        : 'Ожидание соперника…'}
                </button>
                <button class="action-btn action-btn-secondary" id="auctionPassBtn"
                        ${isLocalsBidTurn ? '' : 'disabled'}>
                    Пропустить
                </button>
            </div>
        `;

        document.getElementById('auctionBidBtn').addEventListener('click', () => {
            if (!canBid || !isLocalsBidTurn) return;
            // Broadcast first so peers apply the same state in lockstep
            if (isOnline) OnlineMode.send({ type: 'auction_bid', byId: bidder.id });
            applyBid(bidder.id);
        });

        document.getElementById('auctionPassBtn').addEventListener('click', () => {
            if (!isLocalsBidTurn) return;
            if (isOnline) OnlineMode.send({ type: 'auction_pass', byId: bidder.id });
            applyPass(bidder.id);
        });

        // Restart the 30s bid timer at the bottom of every render. The timer
        // is purely visual on observer clients; the player whose turn it is
        // auto-passes on expiry.
        if (isOnline) startAuctionTimer(bidder);
    }

    global.Auction = { init, start };
})(window);