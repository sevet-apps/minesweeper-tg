/* ============================================================
   build-modal.js
   Player can open this from their profile when they own a full
   color group. Shows tiles in the group with current house count
   and +/- buttons to build or sell.
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

    const GROUP_COLORS = {
        brown: '#8B4513', lightblue: '#84d1f1', pink: '#ff5fa2',
        orange: '#ff9b1f', red: '#ff2a2a', yellow: '#ffd60a',
        green: '#29c463', blue: '#1a7df0',
    };

    const GROUP_LABELS = {
        brown: 'Коричневые', lightblue: 'Голубые', pink: 'Розовые',
        orange: 'Оранжевые', red: 'Красные', yellow: 'Жёлтые',
        green: 'Зелёные', blue: 'Синие',
    };

    let backdropEl = null;
    let modalEl = null;
    let contentEl = null;
    let currentPlayerId = null;
    let currentGroup = null;

    function init() {
        const wrap = document.createElement('div');
        wrap.innerHTML = `
            <div class="modal-backdrop" id="buildBackdrop"></div>
            <div class="build-modal" id="buildModal" role="dialog" aria-modal="true" aria-hidden="true">
                <div class="build-modal-content" id="buildContent"></div>
            </div>
        `;
        while (wrap.firstElementChild) {
            document.body.appendChild(wrap.firstElementChild);
        }
        backdropEl = document.getElementById('buildBackdrop');
        modalEl    = document.getElementById('buildModal');
        contentEl  = document.getElementById('buildContent');

        backdropEl.addEventListener('click', close);
    }

    function close() {
        modalEl.classList.remove('visible');
        backdropEl.classList.remove('visible');
        modalEl.setAttribute('aria-hidden', 'true');
    }

    function show(playerId, group) {
        currentPlayerId = playerId;
        currentGroup = group;
        render();
        modalEl.classList.add('visible');
        backdropEl.classList.add('visible');
        modalEl.setAttribute('aria-hidden', 'false');
    }

    function render() {
        const player = Players.PLAYERS.find(p => p.id === currentPlayerId);
        const groupTiles = TILES.filter(t =>
            t.type === 'property' && t.group === currentGroup);
        const houseCost = PROPERTY_DATA[groupTiles[0].i].houseCost;
        const balance = GameState.getMoney(currentPlayerId);

        const tilesHtml = groupTiles.map(t => {
            const houses = GameState.getHouses(t.i);
            const canBuild = GameState.canBuildHouse(currentPlayerId, t.i);
            const canSell  = GameState.canSellHouse(currentPlayerId, t.i);
            const isHotel  = houses === 5;

            return `
                <div class="build-row">
                    <div class="build-row-info">
                        <div class="build-row-num">#${t.i}</div>
                        <div class="build-row-name">${FULL_NAMES[t.i] || t.name}</div>
                    </div>
                    <div class="build-row-houses">
                        ${isHotel
                            ? '<span class="build-hotel">🏨 ОТЕЛЬ</span>'
                            : `<div class="build-house-icons">
                                ${'🏠'.repeat(houses)}${'⬜'.repeat(4 - houses)}
                               </div>`
                        }
                    </div>
                    <div class="build-row-actions">
                        <button class="build-btn build-btn-sell" data-tile="${t.i}" data-action="sell"
                                ${canSell ? '' : 'disabled'} aria-label="Продать">
                            <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="6" width="10" height="2" rx="1" fill="currentColor"/></svg>
                        </button>
                        <button class="build-btn build-btn-buy" data-tile="${t.i}" data-action="build"
                                ${canBuild ? '' : 'disabled'} aria-label="Купить">
                            <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="6" width="10" height="2" rx="1" fill="currentColor"/><rect x="6" y="2" width="2" height="10" rx="1" fill="currentColor"/></svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        contentEl.innerHTML = `
            <div class="build-header">
                <div class="build-band" style="background: ${GROUP_COLORS[currentGroup]}"></div>
                <div class="build-title-block">
                    <div class="build-eyebrow">СТРОИТЕЛЬСТВО</div>
                    <div class="build-title">${GROUP_LABELS[currentGroup]}</div>
                </div>
                <button class="panel-close" id="buildCloseBtn"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
            </div>

            <div class="build-info-row">
                <div>Стоимость дома: <strong>$${houseCost}</strong></div>
                <div>Баланс: <strong>$${balance}</strong></div>
            </div>

            <div class="build-tiles">
                ${tilesHtml}
            </div>

            <div class="build-rules">
                Строить можно только равномерно (разница не больше 1 дома между улицами).
                После 4 домов — отель.
            </div>
        `;

        document.getElementById('buildCloseBtn').addEventListener('click', close);
        contentEl.querySelectorAll('.build-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tileIdx = parseInt(btn.dataset.tile);
                const action = btn.dataset.action;
                if (btn.disabled) return;
                if (action === 'build') GameState.buildHouse(currentPlayerId, tileIdx);
                else if (action === 'sell') GameState.sellHouse(currentPlayerId, tileIdx);
                render(); // re-render to update buttons
                try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); } catch (_) {}
            });
        });
    }

    global.BuildModal = { init, show };
})(window);