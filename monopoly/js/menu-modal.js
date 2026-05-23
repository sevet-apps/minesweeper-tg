/* ============================================================
   menu-modal.js
   Main game menu: rules, stats, surrender, new game.
   ============================================================ */

(function (global) {
    'use strict';

    const { TILES, PROPERTY_DATA } = global.MonopolyData;

    let backdropEl = null;
    let modalEl = null;
    let contentEl = null;
    let view = 'main';  // 'main' | 'rules' | 'stats'

    function init() {
        const wrap = document.createElement('div');
        wrap.innerHTML = `
            <div class="modal-backdrop" id="menuBackdrop"></div>
            <div class="menu-modal" id="menuModal" role="dialog" aria-modal="true" aria-hidden="true">
                <div class="menu-content" id="menuContent"></div>
            </div>
        `;
        while (wrap.firstElementChild) {
            document.body.appendChild(wrap.firstElementChild);
        }
        backdropEl = document.getElementById('menuBackdrop');
        modalEl    = document.getElementById('menuModal');
        contentEl  = document.getElementById('menuContent');
        backdropEl.addEventListener('click', close);
    }

    function close() {
        modalEl.classList.remove('visible');
        backdropEl.classList.remove('visible');
        modalEl.setAttribute('aria-hidden', 'true');
        view = 'main';
    }

    function show() {
        view = 'main';
        render();
        modalEl.classList.add('visible');
        backdropEl.classList.add('visible');
        modalEl.setAttribute('aria-hidden', 'false');
    }

    function render() {
        if (view === 'rules')      renderRules();
        else if (view === 'stats') renderStats();
        else                       renderMain();
    }

    // ---- Main menu ----
    function renderMain() {
        const cur = Players.getCurrentPlayer();
        contentEl.innerHTML = `
            <div class="menu-header">
                <div class="menu-title">Меню</div>
                <button class="panel-close" id="menuCloseBtn">
                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                        <path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>

            <div class="menu-items">
                <button class="menu-item" data-action="rules">
                    <div class="menu-item-icon" style="background: rgba(10, 132, 255, 0.18)">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5ac8fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                        </svg>
                    </div>
                    <div class="menu-item-info">
                        <div class="menu-item-title">Правила</div>
                        <div class="menu-item-sub">Краткое описание правил игры</div>
                    </div>
                    <div class="menu-item-arrow">›</div>
                </button>

                <button class="menu-item" data-action="stats">
                    <div class="menu-item-icon" style="background: rgba(41, 196, 99, 0.18)">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#29c463" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 3v18h18"/>
                            <path d="M7 14l4-4 4 4 5-5"/>
                        </svg>
                    </div>
                    <div class="menu-item-info">
                        <div class="menu-item-title">Статистика</div>
                        <div class="menu-item-sub">Текущая партия и игроки</div>
                    </div>
                    <div class="menu-item-arrow">›</div>
                </button>

                <button class="menu-item menu-item-warn" data-action="surrender">
                    <div class="menu-item-icon" style="background: rgba(255, 155, 31, 0.18)">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff9b1f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M4 22V4"/>
                            <path d="M4 4h13l-2 4 2 4H4"/>
                        </svg>
                    </div>
                    <div class="menu-item-info">
                        <div class="menu-item-title">Сдаться</div>
                        <div class="menu-item-sub">${cur.name} выходит из игры</div>
                    </div>
                    <div class="menu-item-arrow">›</div>
                </button>

                <button class="menu-item menu-item-danger" data-action="newgame">
                    <div class="menu-item-icon" style="background: rgba(255, 95, 95, 0.18)">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff5f5f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M1 4v6h6"/>
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                        </svg>
                    </div>
                    <div class="menu-item-info">
                        <div class="menu-item-title">Новая игра</div>
                        <div class="menu-item-sub">Сбросить и начать заново</div>
                    </div>
                    <div class="menu-item-arrow">›</div>
                </button>
            </div>
        `;

        document.getElementById('menuCloseBtn').addEventListener('click', close);
        contentEl.querySelectorAll('.menu-item').forEach(btn => {
            btn.addEventListener('click', () => onAction(btn.dataset.action));
        });
    }

    function onAction(action) {
        try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); } catch (_) {}
        if (action === 'rules')   { view = 'rules'; render(); }
        else if (action === 'stats') { view = 'stats'; render(); }
        else if (action === 'surrender') { surrenderCurrent(); }
        else if (action === 'newgame') { confirmNewGame(); }
    }

    // ---- Rules ----
    function renderRules() {
        contentEl.innerHTML = `
            <div class="menu-header">
                <button class="menu-back" id="menuBackBtn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg><span>Назад</span></button>
                <div class="menu-title">Правила</div>
                <button class="panel-close" id="menuCloseBtn">
                    <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                </button>
            </div>

            <div class="menu-text">
                <p><strong>Цель.</strong> Стать единственным не-банкротом. Когда у одного игрока остаётся имущество, а остальные обанкротились — он побеждает.</p>

                <p><strong>Ходы.</strong> Игроки по очереди бросают два кубика и идут по часовой стрелке на число выпавших очков. Дубль даёт ещё один ход, три дубля подряд — тюрьма.</p>

                <p><strong>Покупка.</strong> На свободной улице/ж.д./коммунальной можно купить тайл по базовой цене или отказаться — тогда он уходит на аукцион между остальными.</p>

                <p><strong>Аренда.</strong> Если игрок встал на чужой тайл, владелец получает аренду. На жд и коммуналках сумма зависит от количества таких тайлов у владельца. На улице с полной монополией базовая аренда удваивается, а можно ещё и строить дома.</p>

                <p><strong>Дома и отели.</strong> Если игрок владеет всеми тайлами одной цветной группы, в свой ход он может построить по одному дому на каждую такую группу. После 4 домов — отель. Каждый дом увеличивает аренду по шкале на карточке.</p>

                <p><strong>Тюрьма.</strong> Чтобы выйти: бросить дубль (3 попытки) или заплатить $50. После трёх неудач — обязательно платите.</p>

                <p><strong>Залог.</strong> Любую свою карточку можно заложить банку и получить за неё mortgage value. С заложенной аренду не платят. Выкуп: залог + 10%. Перед закладом улицы нужно продать дома в её группе.</p>

                <p><strong>Обмен.</strong> Игроки могут предлагать друг другу обмены: карточки + деньги в любом сочетании.</p>

                <p><strong>Шанс и Казна.</strong> Карточки случая дают бонусы, штрафы, перемещения и неожиданности.</p>

                <p><strong>Старт.</strong> При прохождении стартового поля каждый круг — $200.</p>

                <p><strong>Банкротство.</strong> Если игрок должен больше, чем стоит всё его имущество — он выбывает. Если он может покрыть долг продажей домов или залогом, ему дают такой шанс.</p>
            </div>
        `;
        document.getElementById('menuBackBtn').addEventListener('click', () => { view = 'main'; render(); });
        document.getElementById('menuCloseBtn').addEventListener('click', close);
    }

    // ---- Stats ----
    function renderStats() {
        const standings = Players.PLAYERS.map(p => {
            const isB = GameState.isBankrupt(p.id);
            return {
                ...p,
                isBankrupt: isB,
                cash: GameState.getMoney(p.id),
                cards: GameState.getOwnedTiles(p.id).length,
                houses: GameState.getOwnedTiles(p.id).reduce((sum, idx) => {
                    const h = GameState.getHouses(idx);
                    return sum + (h === 5 ? 0 : h);
                }, 0),
                hotels: GameState.getOwnedTiles(p.id).reduce((sum, idx) => {
                    const h = GameState.getHouses(idx);
                    return sum + (h === 5 ? 1 : 0);
                }, 0),
                inJail: GameState.isInJail(p.id),
                netWorth: isB ? 0 : calcNetWorth(p.id),
            };
        });

        const rows = standings.map(p => `
            <div class="stats-row ${p.isBankrupt ? 'is-bankrupt' : ''}" style="--p-color: ${p.color}">
                <div class="stats-row-avatar">${p.initial}</div>
                <div class="stats-row-info">
                    <div class="stats-row-name">
                        ${p.name}
                        ${p.isBankrupt ? '<span class="stats-tag stats-tag-bankrupt">БАНКРОТ</span>' : ''}
                        ${p.inJail ? '<span class="stats-tag stats-tag-jail">В ТЮРЬМЕ</span>' : ''}
                    </div>
                    <div class="stats-row-stats">
                        $${p.cash} · ${p.cards} карточек · ${p.houses} 🏠 · ${p.hotels} 🏨
                    </div>
                </div>
                <div class="stats-row-net">
                    <div class="stats-row-net-label">Капитал</div>
                    <div class="stats-row-net-value">$${p.netWorth}</div>
                </div>
            </div>
        `).join('');

        contentEl.innerHTML = `
            <div class="menu-header">
                <button class="menu-back" id="menuBackBtn"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg><span>Назад</span></button>
                <div class="menu-title">Статистика</div>
                <button class="panel-close" id="menuCloseBtn">
                    <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                </button>
            </div>

            <div class="stats-rows">
                ${rows}
            </div>
        `;
        document.getElementById('menuBackBtn').addEventListener('click', () => { view = 'main'; render(); });
        document.getElementById('menuCloseBtn').addEventListener('click', close);
    }

    function calcNetWorth(playerId) {
        let total = GameState.getMoney(playerId);
        const owned = GameState.getOwnedTiles(playerId);
        for (const idx of owned) {
            const data = PROPERTY_DATA[idx];
            const tile = TILES[idx];
            if (!data) continue;
            total += GameState.isMortgaged(idx) ? data.mortgage : tile.price;
            const houses = GameState.getHouses(idx);
            if (houses > 0 && data.houseCost) total += houses * data.houseCost;
        }
        return total;
    }

    // ---- Surrender ----
    async function surrenderCurrent() {
        const cur = Players.getCurrentPlayer();
        close();
        const confirmed = await NoticeModal.show({
            icon: '🏳️',
            title: `${cur.name}, сдаться?`,
            body: 'Все ваши карточки и деньги передадутся банку. Вернуться в игру будет нельзя.',
            btnText: 'Подтвердить',
            cancelText: 'Отменить',
            accent: 'orange',
        });
        if (!confirmed) return;
        GameState.declareBankrupt(cur.id, null);
        // Pass turn to the next non-bankrupt player
        if (typeof window.advanceTurnSkippingBankrupt === 'function') {
            window.advanceTurnSkippingBankrupt();
        }
    }

    // ---- New game ----
    async function confirmNewGame() {
        close();
        const confirmed = await NoticeModal.show({
            icon: '🔄',
            title: 'Начать новую игру?',
            body: 'Текущая партия будет сброшена.',
            btnText: 'Начать заново',
            cancelText: 'Отменить',
            accent: 'red',
        });
        if (!confirmed) return;
        window.location.reload();
    }

    global.MenuModal = { init, show };
})(window);