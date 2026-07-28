/* ============================================================
   player-hud.js
   Two UI components:
   1. Top mini-bar showing all 4 players' avatars and balances
   2. Bottom-sheet detailed profile panel (open on tap)
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
        5: 'Reading RR', 15: 'Pennsylvania RR',
        25: 'B & O RR', 35: 'Short Line RR',
        12: 'Electric Co', 28: 'Water Works',
    };

    const GROUP_COLORS = {
        brown: '#8B4513', lightblue: '#84d1f1', pink: '#ff5fa2',
        orange: '#ff9b1f', red: '#ff2a2a', yellow: '#ffd60a',
        green: '#29c463', blue: '#1a7df0',
    };

    const GROUP_LABELS = {
        brown: 'Коричневые', lightblue: 'Голубые', pink: 'Розовые',
        orange: 'Оранжевые', red: 'Красные', yellow: 'Жёлтые',
        green: 'Зелёные', blue: 'Синие',
        railroads: 'Железные дороги', utilities: 'Коммунальные',
    };

    let players = [];
    let hudEl = null;
    let panelEl = null;
    let panelBackdropEl = null;
    let currentPanelPlayer = null;
    let currentTurnPlayerId = null;

    function init(playersList) {
        players = playersList;
        currentTurnPlayerId = playersList[0]?.id;
        buildHud();
        buildPanel();
        renderHud();

        GameState.on('moneyChanged', () => renderHud());
        GameState.on('snapshotApplied', () => renderHud());
        GameState.on('tileBought',   () => {
            renderHud();
            if (currentPanelPlayer) renderPanel(currentPanelPlayer);
        });
        GameState.on('rentPaid',     () => renderHud());
        GameState.on('goBonus',      () => renderHud());
        GameState.on('houseBuilt',   () => {
            if (currentPanelPlayer) renderPanel(currentPanelPlayer);
        });
        GameState.on('houseSold',    () => {
            if (currentPanelPlayer) renderPanel(currentPanelPlayer);
        });
    }

    function setCurrentTurn(playerId) {
        currentTurnPlayerId = playerId;
        applyTurnHighlight();
    }

    function applyTurnHighlight() {
        if (!hudEl) return;
        hudEl.querySelectorAll('.hud-player').forEach(el => {
            el.classList.toggle('current', el.dataset.playerId === currentTurnPlayerId);
        });
    }

    function buildHud() {
        hudEl = document.createElement('div');
        hudEl.className = 'player-hud';
        document.body.appendChild(hudEl);
    }

    function renderHud() {
        hudEl.innerHTML = players.map(p => `
            <button class="hud-player" data-player-id="${p.id}"
                    style="--p-color: ${p.color}">
                <div class="hud-player-avatar">${p.initial}</div>
                <div class="hud-player-info">
                    <div class="hud-player-name">${p.name}</div>
                    <div class="hud-player-money">$${GameState.getMoney(p.id)}</div>
                </div>
            </button>
        `).join('');

        hudEl.querySelectorAll('.hud-player').forEach(btn => {
            btn.addEventListener('click', () => {
                const pid = btn.dataset.playerId;
                openPanel(pid);
            });
        });

        // Re-apply current turn highlight after each render
        applyTurnHighlight();
    }

    function buildPanel() {
        const wrap = document.createElement('div');
        wrap.innerHTML = `
            <div class="modal-backdrop" id="hudPanelBackdrop"></div>
            <div class="player-panel" id="hudPanel" role="dialog" aria-modal="true" aria-hidden="true">
                <div class="player-panel-content" id="hudPanelContent"></div>
            </div>
        `;
        while (wrap.firstElementChild) {
            document.body.appendChild(wrap.firstElementChild);
        }
        panelBackdropEl = document.getElementById('hudPanelBackdrop');
        panelEl         = document.getElementById('hudPanel');

        panelBackdropEl.addEventListener('click', closePanel);
    }

    function openPanel(playerId) {
        currentPanelPlayer = playerId;
        renderPanel(playerId);
        panelEl.classList.add('visible');
        panelBackdropEl.classList.add('visible');
        panelEl.setAttribute('aria-hidden', 'false');
        try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); } catch (_) {}
    }

    function closePanel() {
        currentPanelPlayer = null;
        panelEl.classList.remove('visible');
        panelBackdropEl.classList.remove('visible');
        panelEl.setAttribute('aria-hidden', 'true');
    }

    function renderPanel(playerId) {
        const p = players.find(pl => pl.id === playerId);
        if (!p) return;

        // Bankrupt player → simplified panel
        if (GameState.isBankrupt(playerId)) {
            document.getElementById('hudPanelContent').innerHTML = `
                <div class="panel-header">
                    <div class="panel-avatar panel-avatar-bankrupt" style="--p-color: ${p.color}">${p.initial}</div>
                    <div class="panel-name-block">
                        <div class="panel-name">${p.name}</div>
                        <div class="panel-bankrupt-label">БАНКРОТ</div>
                    </div>
                    <button class="panel-close" id="hudPanelCloseBtn"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
                </div>

                <div class="panel-bankrupt-message">
                    <div class="panel-bankrupt-icon">💸</div>
                    <div class="panel-bankrupt-text">
                        Этот игрок выбыл из игры.<br>
                        Все его карточки возвращены банку.
                    </div>
                </div>
            `;
            document.getElementById('hudPanelCloseBtn').addEventListener('click', closePanel);
            return;
        }

        const owned = GameState.getOwnedTiles(playerId);

        // Group owned tiles
        const propertyByGroup = {};
        const railroads = [];
        const utilities = [];

        for (const idx of owned) {
            const tile = TILES[idx];
            if (tile.type === 'property') {
                (propertyByGroup[tile.group] = propertyByGroup[tile.group] || []).push(tile);
            } else if (tile.type === 'railroad') {
                railroads.push(tile);
            } else if (tile.type === 'utility') {
                utilities.push(tile);
            }
        }

        // Total assets (sum of mortgage values for now)
        const totalAssets = owned.reduce((sum, idx) => {
            const data = PROPERTY_DATA[idx];
            return sum + (data?.mortgage ?? 0);
        }, 0);

        const groupSections = Object.entries(propertyByGroup).map(([group, tiles]) => {
            const groupTotal = TILES.filter(t => t.type === 'property' && t.group === group).length;
            const isComplete = tiles.length === groupTotal;
            return `
                <div class="panel-group ${isComplete ? 'panel-group-complete' : ''}">
                    <div class="panel-group-header">
                        <div class="panel-group-band" style="--g-color: ${GROUP_COLORS[group]}"></div>
                        <span class="panel-group-name">${GROUP_LABELS[group]}</span>
                        <span class="panel-group-count">${tiles.length}/${groupTotal}</span>
                        ${isComplete ? '<span class="panel-group-badge">МОНОПОЛИЯ</span>' : ''}
                    </div>
                    <div class="panel-group-tiles">
                        ${tiles.map(t => renderOwnedTileChip(t)).join('')}
                    </div>
                    ${isComplete ? `
                        <button class="panel-build-btn" data-group="${group}">
                            Строить дома
                        </button>
                    ` : ''}
                </div>
            `;
        }).join('');

        const railSection = railroads.length ? `
            <div class="panel-group">
                <div class="panel-group-header">
                    <div class="panel-group-band" style="--g-color: #2a2a32"></div>
                    <span class="panel-group-name">${GROUP_LABELS.railroads}</span>
                    <span class="panel-group-count">${railroads.length}/4</span>
                </div>
                <div class="panel-group-tiles">
                    ${railroads.map(t => renderOwnedTileChip(t)).join('')}
                </div>
            </div>
        ` : '';

        const utilSection = utilities.length ? `
            <div class="panel-group">
                <div class="panel-group-header">
                    <div class="panel-group-band" style="--g-color: #b8b8c4"></div>
                    <span class="panel-group-name">${GROUP_LABELS.utilities}</span>
                    <span class="panel-group-count">${utilities.length}/2</span>
                </div>
                <div class="panel-group-tiles">
                    ${utilities.map(t => renderOwnedTileChip(t)).join('')}
                </div>
            </div>
        ` : '';

        document.getElementById('hudPanelContent').innerHTML = `
            <div class="panel-header">
                <div class="panel-avatar" style="--p-color: ${p.color}">${p.initial}</div>
                <div class="panel-name-block">
                    <div class="panel-name">${p.name}</div>
                    <div class="panel-money">$${GameState.getMoney(playerId)}</div>
                </div>
                <button class="panel-close" id="hudPanelCloseBtn"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
            </div>

            <div class="panel-stats">
                <div class="panel-stat">
                    <div class="panel-stat-label">Карточек</div>
                    <div class="panel-stat-value">${owned.length}</div>
                </div>
                <div class="panel-stat">
                    <div class="panel-stat-label">Активы</div>
                    <div class="panel-stat-value">$${totalAssets}</div>
                </div>
                <div class="panel-stat">
                    <div class="panel-stat-label">Всего</div>
                    <div class="panel-stat-value">$${GameState.getMoney(playerId) + totalAssets}</div>
                </div>
            </div>

            ${owned.length === 0 ? `
                <div class="panel-empty">
                    Пока нет ни одной карточки.<br>
                    Покупайте недвижимость, чтобы развивать империю.
                </div>
            ` : groupSections + railSection + utilSection}
        `;

        document.getElementById('hudPanelCloseBtn').addEventListener('click', closePanel);

        // Wire "Строить дома" buttons
        document.querySelectorAll('.panel-build-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const group = btn.dataset.group;
                if (window.BuildModal) {
                    BuildModal.show(currentPanelPlayer, group);
                }
            });
        });
    }

    function renderOwnedTileChip(tile) {
        const houses = window.GameState?.getHouses?.(tile.i) ?? 0;
        const isMortgaged = GameState.isMortgaged(tile.i);
        let houseLabel = '';
        if (houses === 5) houseLabel = '🏨';
        else if (houses > 0) houseLabel = '🏠'.repeat(houses);
        return `
            <div class="panel-tile ${isMortgaged ? 'panel-tile-mortgaged' : ''}">
                <div class="panel-tile-num">#${tile.i}</div>
                <div class="panel-tile-name">${FULL_NAMES[tile.i] || tile.name}</div>
                ${houseLabel ? `<div class="panel-tile-houses">${houseLabel}</div>` : ''}
                <div class="panel-tile-price">$${tile.price}</div>
            </div>
        `;
    }

    global.PlayerHUD = { init, openPanel, closePanel, setCurrentTurn };
})(window);