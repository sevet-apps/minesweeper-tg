/* ============================================================
   property-modal.js
   Detailed property card overlay shown when a tile is tapped.
   Displays: name, owner (placeholder), price, mortgage,
   house cost, full rent table for properties.
   ============================================================ */

(function (global) {
    'use strict';

    const { TILES, PROPERTY_DATA } = global.MonopolyData;

    const FULL_NAMES = {
        1: 'Mediterranean Avenue', 3: 'Baltic Avenue',
        6: 'Oriental Avenue', 8: 'Vermont Avenue', 9: 'Connecticut Avenue',
        11: 'St. Charles Place', 13: 'States Avenue', 14: 'Virginia Avenue',
        16: 'St. James Place', 18: 'Tennessee Avenue', 19: 'New York Avenue',
        21: 'Kentucky Avenue', 23: 'Indiana Avenue', 24: 'Illinois Avenue',
        26: 'Atlantic Avenue', 27: 'Ventnor Avenue', 29: 'Marvin Gardens',
        31: 'Pacific Avenue', 32: 'North Carolina Avenue', 34: 'Pennsylvania Avenue',
        37: 'Park Place', 39: 'Boardwalk',
        5: 'Reading Railroad', 15: 'Pennsylvania Railroad',
        25: 'B & O Railroad', 35: 'Short Line Railroad',
        12: 'Electric Company', 28: 'Water Works',
    };

    const TYPE_LABELS = {
        property: 'Улица',
        railroad: 'Железная дорога',
        utility:  'Коммунальное предприятие',
        chance:   'Шанс',
        chest:    'Общественная казна',
        tax:      'Налог',
        corner:   'Угловая клетка',
    };

    const GROUP_COLORS = {
        brown: '#8B4513', lightblue: '#84d1f1', pink: '#ff5fa2',
        orange: '#ff9b1f', red: '#ff2a2a', yellow: '#ffd60a',
        green: '#29c463', blue: '#1a7df0',
    };

    let backdropEl = null;
    let modalEl = null;
    let contentEl = null;

    function init() {
        backdropEl = document.getElementById('propModalBackdrop');
        modalEl    = document.getElementById('propModal');
        contentEl  = document.getElementById('propModalContent');

        backdropEl.addEventListener('click', close);
    }

    function close() {
        if (!modalEl) return;
        modalEl.classList.remove('visible');
        backdropEl.classList.remove('visible');
        modalEl.setAttribute('aria-hidden', 'true');
    }

    function renderProperty(tile, data) {
        const fullName = FULL_NAMES[tile.i] || tile.name;
        const bandColor = GROUP_COLORS[tile.group] || '#888';

        // Rent table — base / 1h / 2h / 3h / 4h / hotel
        const rentRows = data.rent.map((r, idx) => {
            const labels = ['Базовая аренда', '1 дом', '2 дома', '3 дома', '4 дома', 'Отель'];
            return `
                <div class="prop-price-row">
                    <span class="prop-price-label">${labels[idx]}</span>
                    <span class="prop-price-value">$${r}</span>
                </div>
            `;
        }).join('');

        return `
            <div class="prop-modal-band" style="--prop-band: ${bandColor};">
                <div class="prop-modal-num">#${tile.i}</div>
                <button class="prop-modal-close" id="propModalCloseBtn" aria-label="Close">×</button>
            </div>
            <div class="prop-modal-body">
                <div class="prop-modal-name">${fullName}</div>
                <div class="prop-modal-type">${TYPE_LABELS[tile.type]}</div>

                <div class="prop-modal-owner">
                    <span class="prop-modal-owner-label">Владелец</span>
                    <span class="prop-modal-owner-value">— Банк —</span>
                </div>

                <div class="prop-modal-prices">
                    <div class="prop-price-row">
                        <span class="prop-price-label">Цена</span>
                        <span class="prop-price-value accent">$${tile.price}</span>
                    </div>
                    <div class="prop-price-row">
                        <span class="prop-price-label">Залог</span>
                        <span class="prop-price-value">$${data.mortgage}</span>
                    </div>
                    ${data.houseCost ? `
                        <div class="prop-price-row">
                            <span class="prop-price-label">Стоимость дома</span>
                            <span class="prop-price-value">$${data.houseCost}</span>
                        </div>
                    ` : ''}
                </div>

                <div class="prop-modal-section-title">Аренда</div>
                <div class="prop-modal-prices">
                    ${rentRows}
                </div>
            </div>
        `;
    }

    function renderRailroad(tile, data) {
        const fullName = FULL_NAMES[tile.i] || tile.name;
        const labels = ['1 ж/д', '2 ж/д', '3 ж/д', 'Все 4'];
        const rentRows = data.rent.map((r, idx) => `
            <div class="prop-price-row">
                <span class="prop-price-label">${labels[idx]}</span>
                <span class="prop-price-value">$${r}</span>
            </div>
        `).join('');

        return `
            <div class="prop-modal-band" style="--prop-band: #2a2a32;">
                <div class="prop-modal-num">#${tile.i}</div>
                <button class="prop-modal-close" id="propModalCloseBtn" aria-label="Close">×</button>
            </div>
            <div class="prop-modal-body">
                <div class="prop-modal-name">${fullName}</div>
                <div class="prop-modal-type">${TYPE_LABELS.railroad}</div>

                <div class="prop-modal-owner">
                    <span class="prop-modal-owner-label">Владелец</span>
                    <span class="prop-modal-owner-value">— Банк —</span>
                </div>

                <div class="prop-modal-prices">
                    <div class="prop-price-row">
                        <span class="prop-price-label">Цена</span>
                        <span class="prop-price-value accent">$${tile.price}</span>
                    </div>
                    <div class="prop-price-row">
                        <span class="prop-price-label">Залог</span>
                        <span class="prop-price-value">$${data.mortgage}</span>
                    </div>
                </div>

                <div class="prop-modal-section-title">Аренда</div>
                <div class="prop-modal-prices">
                    ${rentRows}
                </div>
            </div>
        `;
    }

    function renderUtility(tile, data) {
        const fullName = FULL_NAMES[tile.i] || tile.name;
        return `
            <div class="prop-modal-band" style="--prop-band: #b8b8c4;">
                <div class="prop-modal-num">#${tile.i}</div>
                <button class="prop-modal-close" id="propModalCloseBtn" aria-label="Close">×</button>
            </div>
            <div class="prop-modal-body">
                <div class="prop-modal-name">${fullName}</div>
                <div class="prop-modal-type">${TYPE_LABELS.utility}</div>

                <div class="prop-modal-owner">
                    <span class="prop-modal-owner-label">Владелец</span>
                    <span class="prop-modal-owner-value">— Банк —</span>
                </div>

                <div class="prop-modal-prices">
                    <div class="prop-price-row">
                        <span class="prop-price-label">Цена</span>
                        <span class="prop-price-value accent">$${tile.price}</span>
                    </div>
                    <div class="prop-price-row">
                        <span class="prop-price-label">Залог</span>
                        <span class="prop-price-value">$${data.mortgage}</span>
                    </div>
                </div>

                <div class="prop-modal-section-title">Аренда</div>
                <div class="prop-modal-prices">
                    <div class="prop-price-row">
                        <span class="prop-price-label">Владеет 1</span>
                        <span class="prop-price-value">4× выпавшие очки</span>
                    </div>
                    <div class="prop-price-row">
                        <span class="prop-price-label">Владеет 2</span>
                        <span class="prop-price-value">10× выпавшие очки</span>
                    </div>
                </div>
            </div>
        `;
    }

    function renderSpecial(tile) {
        const messages = {
            chance: 'Возьмите карту "Шанс". Следуйте инструкциям на карте.',
            chest:  'Возьмите карту "Общественная казна". Следуйте инструкциям на карте.',
            tax:    tile.subname || 'Уплатите налог в банк.',
            corner: tile.name === 'GO' ? 'При прохождении получаете $200.'
                  : tile.name === 'JAIL' ? 'Тюрьма / просто в гостях.'
                  : tile.name === 'GO TO' ? 'Переход прямо в тюрьму.'
                  : 'Свободная стоянка.',
        };

        return `
            <div class="prop-modal-band" style="--prop-band: #1a1d28;">
                <div class="prop-modal-num">#${tile.i}</div>
                <button class="prop-modal-close" id="propModalCloseBtn" aria-label="Close">×</button>
            </div>
            <div class="prop-modal-body">
                <div class="prop-modal-name">${tile.name}${tile.subname ? ' ' + tile.subname : ''}</div>
                <div class="prop-modal-type">${TYPE_LABELS[tile.type]}</div>
                <div style="font-size: 14px; line-height: 1.5; color: rgba(255,255,255,0.8); margin-top: 8px;">
                    ${messages[tile.type] || ''}
                </div>
            </div>
        `;
    }

    function open(tile) {
        if (!modalEl) init();

        const data = PROPERTY_DATA[tile.i];
        let html;

        if (tile.type === 'property' && data) {
            html = renderProperty(tile, data);
        } else if (tile.type === 'railroad' && data) {
            html = renderRailroad(tile, data);
        } else if (tile.type === 'utility' && data) {
            html = renderUtility(tile, data);
        } else {
            html = renderSpecial(tile);
        }

        contentEl.innerHTML = html;

        // Wire close button
        const closeBtn = document.getElementById('propModalCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', close);

        modalEl.classList.add('visible');
        backdropEl.classList.add('visible');
        modalEl.setAttribute('aria-hidden', 'false');

        // Haptic
        try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); } catch (_) {}
    }

    global.PropertyModal = { init, open, close };
})(window);
