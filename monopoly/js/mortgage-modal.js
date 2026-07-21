/* ============================================================
   mortgage-modal.js
   Player can mortgage owned properties to get cash equal to the
   tile's mortgage value. To get the tile back, they pay back
   mortgage + 10% interest.
   ============================================================ */

(function (global) {
    'use strict';

    const { TILES, PROPERTY_DATA } = global.MonopolyData;

    const FULL_NAMES = {
        1: 'Mediterranean', 3: 'Baltic',
        5: 'Reading RR', 6: 'Oriental', 8: 'Vermont', 9: 'Connecticut',
        11: 'St. Charles', 12: 'Electric Co.', 13: 'States', 14: 'Virginia',
        15: 'Penn. RR', 16: 'St. James', 18: 'Tennessee', 19: 'New York',
        21: 'Kentucky', 23: 'Indiana', 24: 'Illinois', 25: 'B&O RR',
        26: 'Atlantic', 27: 'Ventnor', 28: 'Water Works', 29: 'Marvin',
        31: 'Pacific', 32: 'N. Carolina', 34: 'Pennsylvania',
        35: 'Short Line', 37: 'Park Place', 39: 'Boardwalk',
    };

    const GROUP_COLORS = {
        brown: '#8B4513', lightblue: '#84d1f1', pink: '#ff5fa2',
        orange: '#ff9b1f', red: '#ff2a2a', yellow: '#ffd60a',
        green: '#29c463', blue: '#1a7df0',
    };

    let backdropEl = null;
    let modalEl = null;
    let contentEl = null;
    let currentPlayerId = null;

    function init() {
        const wrap = document.createElement('div');
        wrap.innerHTML = `
            <div class="modal-backdrop" id="mortgageBackdrop"></div>
            <div class="mortgage-modal" id="mortgageModal" role="dialog" aria-modal="true" aria-hidden="true">
                <div class="mortgage-content" id="mortgageContent"></div>
            </div>
        `;
        while (wrap.firstElementChild) {
            document.body.appendChild(wrap.firstElementChild);
        }
        backdropEl = document.getElementById('mortgageBackdrop');
        modalEl    = document.getElementById('mortgageModal');
        contentEl  = document.getElementById('mortgageContent');

        backdropEl.addEventListener('click', close);
    }

    function close() {
        modalEl.classList.remove('visible');
        backdropEl.classList.remove('visible');
        modalEl.setAttribute('aria-hidden', 'true');
    }

    function show(playerId) {
        currentPlayerId = playerId;
        render();
        modalEl.classList.add('visible');
        backdropEl.classList.add('visible');
        modalEl.setAttribute('aria-hidden', 'false');
    }

    function render() {
        const player = Players.PLAYERS.find(p => p.id === currentPlayerId);
        const owned = GameState.getOwnedTiles(currentPlayerId);
        const balance = GameState.getMoney(currentPlayerId);

        const rows = owned.map(idx => {
            const tile = TILES[idx];
            const data = PROPERTY_DATA[idx];
            if (!data) return '';

            const isM = GameState.isMortgaged(idx);
            const canM = GameState.canMortgage(currentPlayerId, idx);
            const canU = GameState.canUnmortgage(currentPlayerId, idx);
            const cost = isM ? GameState.unmortgageCost(idx) : data.mortgage;
            const houses = GameState.getHouses(idx);

            // Group color band (rail/util are grey/silver)
            const bandColor = tile.type === 'property'
                ? (GROUP_COLORS[tile.group] || '#888')
                : (tile.type === 'railroad' ? '#2a2a32' : '#b8b8c4');

            const hint = (!isM && tile.type === 'property' && houses === 0) ?
                  (canM ? '' : 'Уберите дома в группе')
                : '';

            return `
                <div class="mortgage-row ${isM ? 'is-mortgaged' : ''}">
                    <div class="mortgage-row-band" style="background: ${bandColor}"></div>
                    <div class="mortgage-row-info">
                        <div class="mortgage-row-name">
                            ${FULL_NAMES[idx] || tile.name}
                            ${isM ? '<span class="mortgage-tag">ЗАЛОЖЕНО</span>' : ''}
                        </div>
                        <div class="mortgage-row-sub">
                            ${isM
                                ? `Выкуп: <strong>$${cost}</strong> (+10%)`
                                : `Залог: <strong>$${cost}</strong>`}
                            ${hint ? `<span class="mortgage-hint">${hint}</span>` : ''}
                        </div>
                    </div>
                    <button class="mortgage-btn ${isM ? 'mortgage-btn-unmortgage' : 'mortgage-btn-mortgage'}"
                            data-tile="${idx}"
                            ${(isM ? canU : canM) ? '' : 'disabled'}>
                        ${isM ? `+$${cost}` : `+$${cost}`}
                    </button>
                </div>
            `;
        }).filter(Boolean).join('');

        const empty = owned.length === 0
            ? `<div class="mortgage-empty">Нет карточек для залога.</div>` : '';

        contentEl.innerHTML = `
            <div class="mortgage-header">
                <div class="mortgage-title-block">
                    <div class="mortgage-eyebrow">ЗАЛОГ И ВЫКУП</div>
                    <div class="mortgage-title">${player.name}</div>
                </div>
                <button class="panel-close" id="mortgageCloseBtn"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
            </div>

            <div class="mortgage-balance">
                Баланс: <strong>$${balance}</strong>
            </div>

            <div class="mortgage-rows">
                ${empty}
                ${rows}
            </div>

            <div class="mortgage-rules">
                Заложенные карточки не приносят аренды. Перед залогом улицы нужно продать все дома в её группе. Выкуп: залог +10%.
            </div>
        `;

        document.getElementById('mortgageCloseBtn').addEventListener('click', close);
        contentEl.querySelectorAll('.mortgage-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.tile);
                if (btn.disabled) return;
                const online = window.OnlineMode && window.OnlineMode.enabled;
                if (online) {
                    // PHASE 5: server validates and applies; state broadcast
                    // will refresh money/mortgage flags everywhere.
                    const isM = GameState.isMortgaged(idx);
                    window.OnlineMode.sendIntent({ type: isM ? 'UNMORTGAGE' : 'MORTGAGE', tileIdx: idx });
                    setTimeout(render, 350);
                } else {
                    if (GameState.isMortgaged(idx)) {
                        GameState.unmortgage(currentPlayerId, idx);
                    } else {
                        GameState.mortgage(currentPlayerId, idx);
                    }
                    render();
                }
                try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); } catch (_) {}
            });
        });
    }

    global.MortgageModal = { init, show };
})(window);