/* ============================================================
   sell-assets-modal.js
   Shown when a player owes more than they have cash but their
   total assets (cash + house value) could cover. They can sell
   houses one-by-one until they have enough cash to pay.
   ============================================================ */

(function (global) {
    'use strict';

    const { TILES, PROPERTY_DATA } = global.MonopolyData;

    const FULL_NAMES = {
        1: 'Mediterranean', 3: 'Baltic',
        6: 'Oriental', 8: 'Vermont', 9: 'Connecticut',
        11: 'St. Charles', 13: 'States', 14: 'Virginia',
        16: 'St. James', 18: 'Tennessee', 19: 'New York',
        21: 'Kentucky', 23: 'Indiana', 24: 'Illinois',
        26: 'Atlantic', 27: 'Ventnor', 29: 'Marvin',
        31: 'Pacific', 32: 'N. Carolina', 34: 'Pennsylvania',
        37: 'Park Place', 39: 'Boardwalk',
    };

    let backdropEl = null;
    let modalEl = null;
    let contentEl = null;
    let currentPlayerId = null;
    let amountOwed = 0;
    let reason = '';
    let pendingResolve = null;

    function init() {
        const wrap = document.createElement('div');
        wrap.innerHTML = `
            <div class="modal-backdrop" id="sellAssetsBackdrop"></div>
            <div class="sell-assets-modal" id="sellAssetsModal" role="dialog" aria-modal="true" aria-hidden="true">
                <div class="sell-assets-content" id="sellAssetsContent"></div>
            </div>
        `;
        while (wrap.firstElementChild) {
            document.body.appendChild(wrap.firstElementChild);
        }
        backdropEl = document.getElementById('sellAssetsBackdrop');
        modalEl    = document.getElementById('sellAssetsModal');
        contentEl  = document.getElementById('sellAssetsContent');
    }

    function close() {
        modalEl.classList.remove('visible');
        backdropEl.classList.remove('visible');
        modalEl.setAttribute('aria-hidden', 'true');
        if (pendingResolve) {
            const r = pendingResolve;
            pendingResolve = null;
            setTimeout(() => r(), 300);
        }
    }

    function show({ playerId, amountOwed: owed, reason: rsn }) {
        currentPlayerId = playerId;
        amountOwed = owed;
        reason = rsn || '';
        render();
        modalEl.classList.add('visible');
        backdropEl.classList.add('visible');
        modalEl.setAttribute('aria-hidden', 'false');
        return new Promise((resolve) => { pendingResolve = resolve; });
    }

    function render() {
        const player = Players.PLAYERS.find(p => p.id === currentPlayerId);
        const cash = GameState.getMoney(currentPlayerId);
        const need = amountOwed - cash;
        const hasEnough = need <= 0;

        // Build list of properties with houses
        const owned = GameState.getOwnedTiles(currentPlayerId);
        const housedTiles = owned.map(idx => {
            const houses = GameState.getHouses(idx);
            const data = PROPERTY_DATA[idx];
            const tile = TILES[idx];
            return { idx, houses, data, tile };
        }).filter(t => t.houses > 0);

        const tilesHtml = housedTiles.length === 0 ? `
            <div class="sell-assets-empty">
                Нет домов для продажи.
            </div>
        ` : housedTiles.map(t => {
            const sellPrice = Math.floor(t.data.houseCost / 2);
            const canSell   = GameState.canSellHouse(currentPlayerId, t.idx);
            const isHotel   = t.houses === 5;
            return `
                <div class="sell-row">
                    <div class="sell-row-info">
                        <div class="sell-row-name">${FULL_NAMES[t.idx] || t.tile.name}</div>
                        <div class="sell-row-sub">
                            ${isHotel ? '🏨 Отель' : `🏠 × ${t.houses}`}
                            · продать за $${sellPrice}
                        </div>
                    </div>
                    <button class="sell-btn" data-tile="${t.idx}"
                            ${canSell ? '' : 'disabled'}>
                        −$${sellPrice}
                    </button>
                </div>
            `;
        }).join('');

        contentEl.innerHTML = `
            <div class="sell-header">
                <div class="sell-eyebrow">НУЖНО СОБРАТЬ ДЕНЬГИ</div>
                <div class="sell-title">${player.name}</div>
                ${reason ? `<div class="sell-reason">${reason}</div>` : ''}
            </div>

            <div class="sell-summary">
                <div class="sell-summary-row">
                    <span>К оплате</span>
                    <strong style="color: #ff5f5f">$${amountOwed}</strong>
                </div>
                <div class="sell-summary-row">
                    <span>На счёте</span>
                    <strong>$${cash}</strong>
                </div>
                <div class="sell-summary-row sell-summary-need ${hasEnough ? 'is-ok' : ''}">
                    <span>${hasEnough ? 'Достаточно' : 'Не хватает'}</span>
                    <strong>${hasEnough ? '✓' : '$' + need}</strong>
                </div>
            </div>

            <div class="sell-tiles">
                ${tilesHtml}
            </div>

            <div class="sell-buttons">
                <button class="action-btn ${hasEnough ? 'action-btn-primary' : 'action-btn-secondary'}"
                        id="sellConfirmBtn">
                    ${hasEnough ? `Заплатить $${amountOwed}` : 'Сдаться (банкротство)'}
                </button>
            </div>
        `;

        document.getElementById('sellConfirmBtn').addEventListener('click', close);
        contentEl.querySelectorAll('.sell-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.tile);
                if (btn.disabled) return;
                GameState.sellHouse(currentPlayerId, idx);
                render();
                try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); } catch (_) {}
            });
        });
    }

    global.SellAssetsModal = { init, show };
})(window);
