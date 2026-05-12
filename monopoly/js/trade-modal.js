/* ============================================================
   trade-modal.js
   Two-step UI:
     Step 1: choose partner (other non-bankrupt players)
     Step 2: build trade — pick cards you give, pick cards you get,
             pick cash amount in either direction. Confirm.
   On the same device, partner immediately confirms (or rejects) via
   a follow-up modal.
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
    let step = 1;            // 1 = pick partner, 2 = build trade
    let initiatorId = null;
    let partnerId = null;
    let giveTiles = new Set();
    let getTiles = new Set();
    let cashOffer = 0;       // positive = initiator gives cash, negative = receives

    function init() {
        const wrap = document.createElement('div');
        wrap.innerHTML = `
            <div class="modal-backdrop" id="tradeBackdrop"></div>
            <div class="trade-modal" id="tradeModal" role="dialog" aria-modal="true" aria-hidden="true">
                <div class="trade-content" id="tradeContent"></div>
            </div>
        `;
        while (wrap.firstElementChild) {
            document.body.appendChild(wrap.firstElementChild);
        }
        backdropEl = document.getElementById('tradeBackdrop');
        modalEl    = document.getElementById('tradeModal');
        contentEl  = document.getElementById('tradeContent');

        backdropEl.addEventListener('click', close);
    }

    function close() {
        modalEl.classList.remove('visible');
        backdropEl.classList.remove('visible');
        modalEl.setAttribute('aria-hidden', 'true');
        // Reset state
        step = 1;
        partnerId = null;
        giveTiles = new Set();
        getTiles = new Set();
        cashOffer = 0;
    }

    function show(playerId) {
        initiatorId = playerId;
        step = 1;
        partnerId = null;
        giveTiles = new Set();
        getTiles = new Set();
        cashOffer = 0;
        render();
        modalEl.classList.add('visible');
        backdropEl.classList.add('visible');
        modalEl.setAttribute('aria-hidden', 'false');
    }

    function render() {
        if (step === 1) renderPickPartner();
        else renderBuildTrade();
    }

    // ---- Step 1: pick partner ----
    function renderPickPartner() {
        const me = Players.PLAYERS.find(p => p.id === initiatorId);
        const others = Players.PLAYERS.filter(p =>
            p.id !== initiatorId && !GameState.isBankrupt(p.id));

        const optionsHtml = others.length === 0
            ? '<div class="trade-empty">Нет доступных партнёров для обмена.</div>'
            : others.map(p => `
                <button class="trade-partner-btn" data-pid="${p.id}"
                        style="--p-color: ${p.color}">
                    <div class="trade-partner-avatar">${p.initial}</div>
                    <div class="trade-partner-info">
                        <div class="trade-partner-name">${p.name}</div>
                        <div class="trade-partner-money">$${GameState.getMoney(p.id)} · ${GameState.getOwnedTiles(p.id).length} карточек</div>
                    </div>
                </button>
            `).join('');

        contentEl.innerHTML = `
            <div class="trade-header">
                <div class="trade-title-block">
                    <div class="trade-eyebrow">ОБМЕН</div>
                    <div class="trade-title">${me.name}, выберите партнёра</div>
                </div>
                <button class="panel-close" id="tradeCloseBtn"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
            </div>

            <div class="trade-partners">
                ${optionsHtml}
            </div>
        `;

        document.getElementById('tradeCloseBtn').addEventListener('click', close);
        contentEl.querySelectorAll('.trade-partner-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                partnerId = btn.dataset.pid;
                step = 2;
                render();
                try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light'); } catch (_) {}
            });
        });
    }

    // ---- Step 2: build trade ----
    function renderBuildTrade() {
        const me = Players.PLAYERS.find(p => p.id === initiatorId);
        const partner = Players.PLAYERS.find(p => p.id === partnerId);
        const myMoney = GameState.getMoney(initiatorId);
        const partnerMoney = GameState.getMoney(partnerId);

        // Only tradeable: no houses on any tile in property's group
        function canTrade(idx) {
            const tile = TILES[idx];
            if (tile.type !== 'property') return true; // rails/utils always tradeable
            const groupTiles = TILES.filter(t =>
                t.type === 'property' && t.group === tile.group);
            return !groupTiles.some(t => GameState.getHouses(t.i) > 0);
        }

        const myTiles = GameState.getOwnedTiles(initiatorId);
        const partnerTiles = GameState.getOwnedTiles(partnerId);

        function tileCheckbox(idx, side) {
            const tile = TILES[idx];
            const isM = GameState.isMortgaged(idx);
            const tradable = canTrade(idx);
            const set = side === 'give' ? giveTiles : getTiles;
            const checked = set.has(idx);
            const bandColor = tile.type === 'property'
                ? (GROUP_COLORS[tile.group] || '#888')
                : (tile.type === 'railroad' ? '#2a2a32' : '#b8b8c4');
            return `
                <label class="trade-tile-row ${checked ? 'is-checked' : ''} ${!tradable ? 'is-disabled' : ''}">
                    <input type="checkbox" data-tile="${idx}" data-side="${side}"
                           ${checked ? 'checked' : ''} ${!tradable ? 'disabled' : ''}/>
                    <span class="trade-tile-band" style="background: ${bandColor}"></span>
                    <span class="trade-tile-name">
                        ${FULL_NAMES[idx] || tile.name}
                        ${isM ? '<span class="mortgage-tag">ЗАЛОЖЕНО</span>' : ''}
                    </span>
                </label>
            `;
        }

        const myList = myTiles.length === 0
            ? '<div class="trade-empty-mini">Нет карточек</div>'
            : myTiles.map(idx => tileCheckbox(idx, 'give')).join('');
        const partnerList = partnerTiles.length === 0
            ? '<div class="trade-empty-mini">Нет карточек</div>'
            : partnerTiles.map(idx => tileCheckbox(idx, 'get')).join('');

        // Cash direction:
        //   cashOffer > 0 → initiator pays cash to partner
        //   cashOffer < 0 → initiator receives cash from partner
        const cashGivesFromMe = cashOffer > 0 ? cashOffer : 0;
        const cashGivesFromPartner = cashOffer < 0 ? -cashOffer : 0;

        // Validation
        const valid =
            (giveTiles.size + getTiles.size + cashGivesFromMe + cashGivesFromPartner > 0) &&
            cashGivesFromMe <= myMoney &&
            cashGivesFromPartner <= partnerMoney;

        contentEl.innerHTML = `
            <div class="trade-header">
                <div class="trade-title-block">
                    <div class="trade-eyebrow">ОБМЕН</div>
                    <div class="trade-title">${me.name} ⇄ ${partner.name}</div>
                </div>
                <button class="panel-close" id="tradeCloseBtn"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
            </div>

            <div class="trade-two-cols">
                <div class="trade-col">
                    <div class="trade-col-header" style="--p-color: ${me.color}">
                        <div class="trade-col-avatar">${me.initial}</div>
                        <div>
                            <div class="trade-col-name">${me.name} отдаёт</div>
                            <div class="trade-col-sub">$${myMoney}</div>
                        </div>
                    </div>
                    <div class="trade-tiles">
                        ${myList}
                    </div>
                </div>

                <div class="trade-col">
                    <div class="trade-col-header" style="--p-color: ${partner.color}">
                        <div class="trade-col-avatar">${partner.initial}</div>
                        <div>
                            <div class="trade-col-name">${partner.name} отдаёт</div>
                            <div class="trade-col-sub">$${partnerMoney}</div>
                        </div>
                    </div>
                    <div class="trade-tiles">
                        ${partnerList}
                    </div>
                </div>
            </div>

            <div class="trade-cash">
                <div class="trade-cash-label">Доплата</div>
                <div class="trade-cash-row">
                    <button class="trade-cash-side ${cashOffer > 0 ? 'is-active' : ''}"
                            data-dir="give">${me.name} платит</button>
                    <input type="number" class="trade-cash-input" id="tradeCashInput"
                           value="${Math.abs(cashOffer)}" min="0"
                           max="${Math.max(myMoney, partnerMoney)}" step="10"/>
                    <button class="trade-cash-side ${cashOffer < 0 ? 'is-active' : ''}"
                            data-dir="get">${partner.name} платит</button>
                </div>
            </div>

            <div class="trade-buttons">
                <button class="action-btn action-btn-secondary" id="tradeBackBtn">Назад</button>
                <button class="action-btn action-btn-primary" id="tradeSendBtn" ${valid ? '' : 'disabled'}>
                    Отправить предложение
                </button>
            </div>
        `;

        // Wire events
        document.getElementById('tradeCloseBtn').addEventListener('click', close);
        document.getElementById('tradeBackBtn').addEventListener('click', () => {
            step = 1;
            partnerId = null;
            giveTiles = new Set();
            getTiles = new Set();
            cashOffer = 0;
            render();
        });

        contentEl.querySelectorAll('input[type="checkbox"][data-tile]').forEach(inp => {
            inp.addEventListener('change', () => {
                const idx = parseInt(inp.dataset.tile);
                const set = inp.dataset.side === 'give' ? giveTiles : getTiles;
                if (inp.checked) set.add(idx);
                else set.delete(idx);
                render();
            });
        });

        const cashInput = document.getElementById('tradeCashInput');
        cashInput.addEventListener('input', () => {
            const v = Math.max(0, parseInt(cashInput.value) || 0);
            // Preserve direction
            if (cashOffer < 0) cashOffer = -v;
            else cashOffer = v;
            // Don't re-render to avoid losing focus
            document.getElementById('tradeSendBtn').disabled = !computeValid();
        });

        contentEl.querySelectorAll('.trade-cash-side').forEach(btn => {
            btn.addEventListener('click', () => {
                const dir = btn.dataset.dir;
                const v = Math.abs(cashOffer) || 0;
                cashOffer = dir === 'give' ? v : -v;
                render();
            });
        });

        document.getElementById('tradeSendBtn').addEventListener('click', () => {
            if (!computeValid()) return;
            sendOffer();
        });

        function computeValid() {
            const give = cashOffer > 0 ? cashOffer : 0;
            const recv = cashOffer < 0 ? -cashOffer : 0;
            return (giveTiles.size + getTiles.size + give + recv > 0) &&
                   give <= myMoney && recv <= partnerMoney;
        }
    }

    // ---- Send offer to partner for acceptance ----
    async function sendOffer() {
        // Snapshot all trade params BEFORE close() resets them
        const fromId = initiatorId;
        const toId = partnerId;
        const me = Players.PLAYERS.find(p => p.id === fromId);
        const partner = Players.PLAYERS.find(p => p.id === toId);
        const give = Array.from(giveTiles);
        const get  = Array.from(getTiles);
        const cash = cashOffer;

        close();

        // Show accept/reject modal for partner
        const accepted = await showAcceptModal(me, partner, give, get, cash);
        if (!accepted) return;

        // Execute trade using snapshot, not live state
        executeTrade(fromId, toId, give, get, cash);

        try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success'); } catch (_) {}
    }

    function showAcceptModal(initiator, partner, give, get, cash) {
        return new Promise((resolve) => {
            const wrap = document.createElement('div');
            // Note: NO backdrop here - we want to keep the board visible
            wrap.innerHTML = `
                <div class="trade-accept-modal visible" id="tradeAcceptModal">
                    <div class="trade-accept-content">
                        <div class="trade-accept-eyebrow">ПРЕДЛОЖЕНИЕ ОБМЕНА</div>
                        <div class="trade-accept-title">
                            ${partner.name}, рассмотрите предложение от <span style="color: ${initiator.color}">${initiator.name}</span>
                        </div>

                        <div class="trade-accept-cols">
                            <div class="trade-accept-col">
                                <div class="trade-accept-col-title" style="color: ${initiator.color}">Вы получите:</div>
                                ${give.map(idx => `<div class="trade-accept-line">${FULL_NAMES[idx] || TILES[idx].name}</div>`).join('') || '<div class="trade-accept-line muted">—</div>'}
                                ${cash > 0 ? `<div class="trade-accept-line trade-accept-cash">+$${cash}</div>` : ''}
                            </div>
                            <div class="trade-accept-col">
                                <div class="trade-accept-col-title" style="color: ${partner.color}">Вы отдадите:</div>
                                ${get.map(idx => `<div class="trade-accept-line">${FULL_NAMES[idx] || TILES[idx].name}</div>`).join('') || '<div class="trade-accept-line muted">—</div>'}
                                ${cash < 0 ? `<div class="trade-accept-line trade-accept-cash">−$${-cash}</div>` : ''}
                            </div>
                        </div>

                        <button class="trade-accept-show-btn" id="tradeShowBtn">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="3"/><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            </svg>
                            Показать карточки на поле
                        </button>

                        <div class="trade-accept-buttons">
                            <button class="action-btn action-btn-secondary" id="tradeRejectBtn">Отклонить</button>
                            <button class="action-btn action-btn-primary" id="tradeAcceptBtn">Принять</button>
                        </div>
                    </div>
                </div>
            `;
            while (wrap.firstElementChild) {
                document.body.appendChild(wrap.firstElementChild);
            }

            // Highlight tiles on board with colored outlines
            const allTiles = [...give, ...get];
            function highlightTiles(on) {
                for (const idx of give) {
                    const el = document.querySelector(`.tile[data-idx="${idx}"]`);
                    if (el) el.classList.toggle('tile-trade-give', on);
                }
                for (const idx of get) {
                    const el = document.querySelector(`.tile[data-idx="${idx}"]`);
                    if (el) el.classList.toggle('tile-trade-get', on);
                }
            }

            let isHighlighted = false;
            const showBtn = document.getElementById('tradeShowBtn');
            const modalDiv = document.getElementById('tradeAcceptModal');
            showBtn.addEventListener('click', () => {
                isHighlighted = !isHighlighted;
                highlightTiles(isHighlighted);
                showBtn.classList.toggle('is-active', isHighlighted);
                modalDiv.classList.toggle('is-minimized', isHighlighted);
            });

            function cleanup(result) {
                highlightTiles(false);
                document.getElementById('tradeAcceptModal')?.remove();
                resolve(result);
            }
            document.getElementById('tradeAcceptBtn').addEventListener('click', () => cleanup(true));
            document.getElementById('tradeRejectBtn').addEventListener('click', () => cleanup(false));
        });
    }

    function executeTrade(fromId, toId, give, get, cash) {
        // Transfer tiles from initiator to partner
        for (const idx of give) {
            GameState._transferTile(fromId, toId, idx);
        }
        // Transfer tiles partner → initiator
        for (const idx of get) {
            GameState._transferTile(toId, fromId, idx);
        }
        // Cash transfer
        if (cash > 0) {
            GameState.changeMoney(fromId, -cash, 'Обмен');
            GameState.changeMoney(toId, cash, 'Обмен');
        } else if (cash < 0) {
            GameState.changeMoney(toId, cash, 'Обмен');     // toId loses
            GameState.changeMoney(fromId, -cash, 'Обмен');  // fromId gains
        }
    }

    global.TradeModal = { init, show };
})(window);