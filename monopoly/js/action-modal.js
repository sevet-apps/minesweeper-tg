/* ============================================================
   action-modal.js
   Modal that appears after a player lands on a tile and an action
   is required: buy property, pay rent, draw card, pay tax, etc.
   ============================================================ */

(function (global) {
    'use strict';

    const { TILES, PROPERTY_DATA } = global.MonopolyData;

    let backdropEl = null;
    let modalEl = null;
    let contentEl = null;
    let pendingResolve = null;

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

    const GROUP_COLORS = {
        brown: '#8B4513', lightblue: '#84d1f1', pink: '#ff5fa2',
        orange: '#ff9b1f', red: '#ff2a2a', yellow: '#ffd60a',
        green: '#29c463', blue: '#1a7df0',
    };

    function init() {
        const wrap = document.createElement('div');
        wrap.innerHTML = `
            <div class="modal-backdrop" id="actionModalBackdrop"></div>
            <div class="action-modal" id="actionModal" role="dialog" aria-modal="true" aria-hidden="true">
                <div class="action-modal-content" id="actionModalContent"></div>
            </div>
        `;
        // Move both children to body (firstElementChild changes after each append)
        while (wrap.firstElementChild) {
            document.body.appendChild(wrap.firstElementChild);
        }
        backdropEl = document.getElementById('actionModalBackdrop');
        modalEl    = document.getElementById('actionModal');
        contentEl  = document.getElementById('actionModalContent');

        backdropEl.addEventListener('click', () => resolve('skip'));
    }

    function close() {
        modalEl.classList.remove('visible');
        backdropEl.classList.remove('visible');
        modalEl.setAttribute('aria-hidden', 'true');
    }

    function resolve(value) {
        close();
        if (pendingResolve) {
            const r = pendingResolve;
            pendingResolve = null;
            r(value);
        }
    }

    /**
     * Show the action modal for a given tile + player context.
     * Returns a promise that resolves to the user's choice:
     *   'buy', 'skip', 'continue' (after info-only modal)
     */
    function showForLanding({ tile, playerId, players, lastDiceSum }) {
        // Skip modal entirely for GO and Free Parking — visual feedback (toast,
        // animation) already conveys what's happening, no decision needed.
        // GO TO JAIL we'll handle later when jail logic exists.
        if (tile.type === 'corner' && (tile.i === 0 || tile.i === 20)) {
            return Promise.resolve('skip');
        }
        return new Promise((resolve) => {
            pendingResolve = resolve;
            renderForLanding({ tile, playerId, players, lastDiceSum });
            modalEl.classList.add('visible');
            backdropEl.classList.add('visible');
            modalEl.setAttribute('aria-hidden', 'false');
            try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); } catch (_) {}
        });
    }

    function renderForLanding({ tile, playerId, players, lastDiceSum }) {
        const player = players.find(p => p.id === playerId);
        const owner = GameState.getOwner(tile.i);
        const ownerPlayer = owner ? players.find(p => p.id === owner) : null;

        // ---- Free purchasable tile ----
        if ((tile.type === 'property' || tile.type === 'railroad' || tile.type === 'utility')
            && !owner) {
            renderBuyOption(tile, player);
            return;
        }

        // ---- Owned by someone else → pay rent ----
        if (ownerPlayer && ownerPlayer.id !== playerId) {
            renderRentDue(tile, player, ownerPlayer, lastDiceSum);
            return;
        }

        // ---- Owned by self → just info ----
        if (ownerPlayer && ownerPlayer.id === playerId) {
            renderOwnedBySelf(tile);
            return;
        }

        // ---- Tax tile ----
        if (tile.type === 'tax') {
            renderTax(tile, player);
            return;
        }

        // ---- Chance / Chest / corners ----
        renderInfoOnly(tile);
    }

    // ---- Per-state renderers ----

    function renderBuyOption(tile, player) {
        const data = PROPERTY_DATA[tile.i] || {};
        const fullName = FULL_NAMES[tile.i] || tile.name;
        const bandColor = GROUP_COLORS[tile.group] || '#2a2a32';
        const canAfford = player.money >= tile.price;

        contentEl.innerHTML = `
            <div class="action-modal-band" style="--prop-band: ${bandColor};"></div>
            <div class="action-modal-body">
                <div class="action-modal-title">${fullName}</div>
                <div class="action-modal-subtitle">Никому не принадлежит</div>

                <div class="action-modal-price-row">
                    <span class="action-modal-price-label">Цена</span>
                    <span class="action-modal-price-value">$${tile.price}</span>
                </div>
                ${data.mortgage ? `
                    <div class="action-modal-meta-row">
                        <span>Залог: $${data.mortgage}</span>
                        ${data.houseCost ? `<span>Дом: $${data.houseCost}</span>` : ''}
                    </div>
                ` : ''}

                <div class="action-modal-balance">
                    Ваш баланс: <strong>$${player.money}</strong>
                </div>

                <div class="action-modal-buttons">
                    <button class="action-btn action-btn-primary" id="actionBuyBtn"
                            ${canAfford ? '' : 'disabled'}>
                        Купить за $${tile.price}
                    </button>
                    <button class="action-btn action-btn-secondary" id="actionSkipBtn">
                        Пропустить
                    </button>
                </div>
            </div>
        `;
        document.getElementById('actionBuyBtn').addEventListener('click', () => resolve('buy'));
        document.getElementById('actionSkipBtn').addEventListener('click', () => resolve('skip'));
    }

    function renderRentDue(tile, player, owner, lastDiceSum) {
        const fullName = FULL_NAMES[tile.i] || tile.name;
        const bandColor = GROUP_COLORS[tile.group] || '#2a2a32';
        const rent = GameState.calcRent(tile.i, lastDiceSum);
        const canPay = player.money >= rent;

        contentEl.innerHTML = `
            <div class="action-modal-band" style="--prop-band: ${bandColor};"></div>
            <div class="action-modal-body">
                <div class="action-modal-title">${fullName}</div>
                <div class="action-modal-subtitle">
                    Принадлежит
                    <span class="action-modal-owner-pill" style="--owner-color: ${owner.color}">
                        <span class="owner-pill-dot"></span>${owner.name}
                    </span>
                </div>

                <div class="action-modal-price-row action-modal-rent">
                    <span class="action-modal-price-label">К оплате</span>
                    <span class="action-modal-price-value action-modal-rent-value">$${rent}</span>
                </div>

                <div class="action-modal-balance">
                    Ваш баланс: <strong>$${player.money}</strong>
                </div>

                <div class="action-modal-buttons">
                    <button class="action-btn action-btn-primary" id="actionPayBtn"
                            ${canPay ? '' : 'disabled'}>
                        ${canPay ? `Заплатить $${rent}` : 'Недостаточно средств'}
                    </button>
                </div>
            </div>
        `;
        document.getElementById('actionPayBtn').addEventListener('click', () => resolve('pay'));
    }

    function renderOwnedBySelf(tile) {
        const fullName = FULL_NAMES[tile.i] || tile.name;
        const bandColor = GROUP_COLORS[tile.group] || '#2a2a32';

        contentEl.innerHTML = `
            <div class="action-modal-band" style="--prop-band: ${bandColor};"></div>
            <div class="action-modal-body">
                <div class="action-modal-title">${fullName}</div>
                <div class="action-modal-subtitle">Это ваша собственность</div>
                <div class="action-modal-buttons">
                    <button class="action-btn action-btn-primary" id="actionContinueBtn">
                        Продолжить
                    </button>
                </div>
            </div>
        `;
        document.getElementById('actionContinueBtn').addEventListener('click', () => resolve('continue'));
    }

    function renderTax(tile, player) {
        const amount = tile.name === 'Income Tax' ? 200 : 100;
        const canPay = player.money >= amount;

        contentEl.innerHTML = `
            <div class="action-modal-band" style="--prop-band: #ff5fa2;"></div>
            <div class="action-modal-body">
                <div class="action-modal-title">${tile.name}</div>
                <div class="action-modal-subtitle">Заплатите налог в банк</div>

                <div class="action-modal-price-row action-modal-rent">
                    <span class="action-modal-price-label">К оплате</span>
                    <span class="action-modal-price-value action-modal-rent-value">$${amount}</span>
                </div>

                <div class="action-modal-balance">
                    Ваш баланс: <strong>$${player.money}</strong>
                </div>

                <div class="action-modal-buttons">
                    <button class="action-btn action-btn-primary" id="actionPayTaxBtn"
                            ${canPay ? '' : 'disabled'}>
                        ${canPay ? `Заплатить $${amount}` : 'Недостаточно средств'}
                    </button>
                </div>
            </div>
        `;
        document.getElementById('actionPayTaxBtn').addEventListener('click',
            () => resolve({ action: 'tax', amount }));
    }

    function renderInfoOnly(tile) {
        let title, subtitle, message;
        if (tile.type === 'chance') {
            title = 'Шанс';
            subtitle = 'Карта шанса';
            message = 'Возьмите карту "Шанс". Эффект будет применён.';
        } else if (tile.type === 'chest') {
            title = 'Общественная казна';
            subtitle = 'Карта казны';
            message = 'Возьмите карту казны. Эффект будет применён.';
        } else {
            title = tile.name + (tile.subname ? ' ' + tile.subname : '');
            subtitle = 'Угловая клетка';
            message = tile.name === 'GO' ? 'Получите $200 при прохождении.'
                    : tile.name === 'JAIL' ? 'Просто в гостях. Тюрьма не страшна.'
                    : tile.name === 'GO TO' ? 'Переход в тюрьму.'
                    : 'Свободная стоянка.';
        }

        contentEl.innerHTML = `
            <div class="action-modal-band" style="--prop-band: #2a2a32;"></div>
            <div class="action-modal-body">
                <div class="action-modal-title">${title}</div>
                <div class="action-modal-subtitle">${subtitle}</div>
                <div class="action-modal-info-text">${message}</div>
                <div class="action-modal-buttons">
                    <button class="action-btn action-btn-primary" id="actionContinueBtn">
                        Продолжить
                    </button>
                </div>
            </div>
        `;
        document.getElementById('actionContinueBtn').addEventListener('click',
            () => resolve('continue'));
    }

    // Programmatically resolve the open modal (used by the turn timer to
    // auto-pick a default when the active player stalls).
    function forceResolve(value) {
        if (pendingResolve) resolve(value);
    }

    global.ActionModal = { init, showForLanding, forceResolve };
})(window);