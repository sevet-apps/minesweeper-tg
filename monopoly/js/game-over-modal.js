/* ============================================================
   game-over-modal.js
   Celebrates the winner — the last non-bankrupt player standing.
   Shows their portrait, total net worth, and an "Начать заново"
   button which reloads the page.
   ============================================================ */

(function (global) {
    'use strict';

    const { TILES, PROPERTY_DATA } = global.MonopolyData;

    let backdropEl = null;
    let modalEl = null;
    let contentEl = null;
    let confettiTimer = null;

    function init() {
        const wrap = document.createElement('div');
        wrap.innerHTML = `
            <div class="modal-backdrop" id="gameOverBackdrop"></div>
            <div class="game-over-modal" id="gameOverModal" role="dialog" aria-modal="true" aria-hidden="true">
                <div class="game-over-confetti" id="gameOverConfetti"></div>
                <div class="game-over-content" id="gameOverContent"></div>
            </div>
        `;
        while (wrap.firstElementChild) {
            document.body.appendChild(wrap.firstElementChild);
        }
        backdropEl = document.getElementById('gameOverBackdrop');
        modalEl    = document.getElementById('gameOverModal');
        contentEl  = document.getElementById('gameOverContent');
    }

    function calcNetWorth(playerId) {
        let total = GameState.getMoney(playerId);
        const owned = GameState.getOwnedTiles(playerId);
        for (const idx of owned) {
            const data = PROPERTY_DATA[idx];
            const tile = TILES[idx];
            if (!data) continue;
            // Mortgaged: only mortgage value
            if (GameState.isMortgaged(idx)) {
                total += data.mortgage;
            } else {
                total += tile.price;
            }
            // Houses
            const houses = GameState.getHouses(idx);
            if (houses > 0 && data.houseCost) {
                total += houses * data.houseCost;
            }
        }
        return total;
    }

    function show(winner) {
        const netWorth = calcNetWorth(winner.id);
        const cards = GameState.getOwnedTiles(winner.id).length;

        // Rank all players by net worth for the leaderboard
        const standings = Players.PLAYERS.map(p => ({
            ...p,
            isBankrupt: GameState.isBankrupt(p.id),
            netWorth: GameState.isBankrupt(p.id) ? 0 : calcNetWorth(p.id),
        })).sort((a, b) => b.netWorth - a.netWorth);

        const standingsHtml = standings.map((p, i) => `
            <div class="game-over-standing ${p.id === winner.id ? 'is-winner' : ''}"
                 style="--p-color: ${p.color}">
                <div class="game-over-standing-rank">${i + 1}</div>
                <div class="game-over-standing-avatar">${p.initial}</div>
                <div class="game-over-standing-name">${p.name}</div>
                <div class="game-over-standing-money">$${p.netWorth}</div>
                ${p.isBankrupt ? '<div class="game-over-bankrupt-tag">БАНКРОТ</div>' : ''}
            </div>
        `).join('');

        const isOnline = !!window.OnlineMode?.enabled;
        const btnLabel = isOnline ? 'Список комнат' : 'Начать заново';

        contentEl.innerHTML = `
            <div class="game-over-trophy">🏆</div>
            <div class="game-over-eyebrow">ПОБЕДИТЕЛЬ</div>
            <div class="game-over-winner-row">
                <div class="game-over-avatar" style="background: ${winner.color}">${winner.initial}</div>
                <div>
                    <div class="game-over-winner-name">${winner.name}</div>
                    <div class="game-over-winner-stats">
                        Состояние: <strong>$${netWorth}</strong> · ${cards} карточек
                    </div>
                </div>
            </div>

            <div class="game-over-section-title">Итоги</div>
            <div class="game-over-standings">
                ${standingsHtml}
            </div>

            <div class="game-over-buttons">
                <button class="action-btn action-btn-primary" id="gameOverRestartBtn">
                    ${btnLabel}
                </button>
            </div>
        `;

        document.getElementById('gameOverRestartBtn').addEventListener('click', () => {
            if (isOnline) {
                // Ask the parent app to close the iframe and open the
                // room browser in the lobby instead of reloading.
                try {
                    window.parent.postMessage({ type: 'monopoly_exit_to_browse' }, '*');
                } catch (_) {
                    // Fallback if parent messaging fails
                    window.parent.postMessage({ type: 'monopoly_exit' }, '*');
                }
            } else {
                window.location.reload();
            }
        });

        modalEl.classList.add('visible');
        backdropEl.classList.add('visible');
        modalEl.setAttribute('aria-hidden', 'false');

        startConfetti();
        try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success'); } catch (_) {}
    }

    function startConfetti() {
        const el = document.getElementById('gameOverConfetti');
        if (!el) return;
        el.innerHTML = '';
        const colors = ['#ff5fa2', '#ffd700', '#5ac8fa', '#29c463', '#ff9b1f', '#0a84ff'];
        for (let i = 0; i < 40; i++) {
            const piece = document.createElement('span');
            piece.className = 'confetti-piece';
            piece.style.left = (Math.random() * 100) + '%';
            piece.style.background = colors[Math.floor(Math.random() * colors.length)];
            piece.style.animationDelay = (Math.random() * 1.5) + 's';
            piece.style.animationDuration = (2 + Math.random() * 2) + 's';
            el.appendChild(piece);
        }
    }

    global.GameOverModal = { init, show };
})(window);