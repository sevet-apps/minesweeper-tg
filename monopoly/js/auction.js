/* ============================================================
   auction.js
   When a player declines to buy a property, it goes to auction
   between all remaining players. Bidding rules:
   - Start at $10
   - Each bid raises by $10 minimum
   - Player can pass (no longer participates this round)
   - Last remaining bidder wins at their bid price
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
    }

    /**
     * Start an auction for the given tile.
     * Returns a promise resolving to { winnerId, price } or { winnerId: null }
     * if everyone passed.
     */
    function start(auctionTile, allPlayers) {
        tile = auctionTile;
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

        return new Promise((resolve) => {
            pendingResolve = resolve;
            render();
            modalEl.classList.add('visible');
            backdropEl.classList.add('visible');
            modalEl.setAttribute('aria-hidden', 'false');
        });
    }

    function close(result) {
        modalEl.classList.remove('visible');
        backdropEl.classList.remove('visible');
        modalEl.setAttribute('aria-hidden', 'true');
        if (pendingResolve) {
            const r = pendingResolve;
            pendingResolve = null;
            // Small delay so close animation plays
            setTimeout(() => r(result), 300);
        }
    }

    function render() {
        // Auction ends if only one bidder left and they have current bid
        if (participants.length === 1 && currentBidder === participants[0].id) {
            close({ winnerId: currentBidder, price: currentBid });
            return;
        }
        if (participants.length === 0) {
            close({ winnerId: null, price: 0 });
            return;
        }

        // Whose turn is it?
        if (bidderIndex >= participants.length) bidderIndex = 0;
        const bidder = participants[bidderIndex];
        const playerMoney = GameState.getMoney(bidder.id);
        const minBid = currentBid + 10;
        const canBid = playerMoney >= minBid;

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
                Ходит <strong>${bidder.name}</strong> — баланс $${playerMoney}
            </div>

            <div class="auction-buttons">
                <button class="action-btn action-btn-primary" id="auctionBidBtn"
                        ${canBid ? '' : 'disabled'}>
                    ${canBid ? `Поднять до $${minBid}` : 'Недостаточно средств'}
                </button>
                <button class="action-btn action-btn-secondary" id="auctionPassBtn">
                    Пропустить
                </button>
            </div>
        `;

        document.getElementById('auctionBidBtn').addEventListener('click', () => {
            if (!canBid) return;
            currentBid = minBid;
            currentBidder = bidder.id;
            bidderIndex++;
            try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium'); } catch (_) {}
            render();
        });

        document.getElementById('auctionPassBtn').addEventListener('click', () => {
            // Remove from participants
            participants.splice(bidderIndex, 1);
            // Don't increment bidderIndex - next player slides into this slot
            try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); } catch (_) {}
            render();
        });
    }

    global.Auction = { init, start };
})(window);
