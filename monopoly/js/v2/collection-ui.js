/* Профиль Монополии: кейсы, коллекция компаний и оформление доски. */
(function (global) {
    'use strict';

    const $ = s => document.querySelector(s);
    const esc = value => String(value == null ? '' : value).replace(/[<>&"']/g, ch => ({
        '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;',
    })[ch]);
    const RARITY = {
        common: ['Обычная', 'обычный'], rare: ['Редкая', 'редкий'],
        epic: ['Эпическая', 'эпический'], mythic: ['Мифическая', 'мифический'],
    };
    const TILE_NAMES = {};
    (global.MonopolyDataV2?.TILES || []).forEach(tile => { TILE_NAMES[tile.i] = tile.name; });

    let current = null;
    let activeTab = 'cases';
    let filter = 'all';
    let busy = false;

    async function request(path, options = {}) {
        const bases = global.Lobby?.serverCandidates?.() || ['https://spark-game-backend.onrender.com'];
        const method = String(options.method || 'GET').toUpperCase();
        let networkError = null;
        for (const base of bases) {
            try {
                const response = await fetch(base + path, {
                    ...options,
                    headers: { ...(global.Lobby?.authHeaders?.() || {}), ...(options.headers || {}) },
                });
                const body = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(body.error || 'network_error');
                return body;
            } catch (error) {
                /* Ошибка API является окончательным ответом сервера. На следующий
                   адрес переходим только при сетевом сбое — иначе один и тот же
                   кейс или обмен мог бы быть отправлен повторно. */
                if (error instanceof TypeError && (method === 'GET' || method === 'HEAD')) {
                    networkError = error;
                    continue;
                }
                throw error;
            }
        }
        throw networkError || new Error('network_error');
    }
    function asset(path) { return path ? String(path).replace(/^\//, '') : ''; }
    function avatar(user, fallback) {
        const name = user?.first_name || user?.username || fallback?.name || 'Игрок';
        const photo = user?.photo_url || fallback?.avatar;
        return photo ? `<div class="mc-avatar"><img src="${esc(photo)}" alt=""></div>`
            : `<div class="mc-avatar">${esc(name.slice(0, 2).toUpperCase())}</div>`;
    }
    function ownerName(data) {
        const me = global.Lobby?.profile?.();
        return data.user?.first_name || data.user?.username || me?.name || 'Игрок';
    }
    function compact(value) { return Number(value || 0).toLocaleString('ru-RU'); }

    async function openSelf() {
        global.Lobby?.show?.('lbCollection');
        renderLoading();
        try {
            current = await request('/api/monopoly/collection/me');
            render();
        } catch (error) { renderError(error); }
    }
    async function refresh() {
        current = await request('/api/monopoly/collection/me');
        render();
    }
    async function loadSelf() {
        if (!current) current = await request('/api/monopoly/collection/me');
        return current;
    }
    function renderLoading() {
        const root = $('#monoCollectionRoot');
        if (root) root.innerHTML = '<div class="mc-spinner"></div>';
    }
    function renderError(error) {
        const root = $('#monoCollectionRoot');
        if (!root) return;
        root.innerHTML = `<div class="mc-page"><div class="mc-head"><button class="mc-back">‹</button><div class="mc-head-copy"><h2>Коллекция</h2></div></div>
            <div class="mc-empty"><b>Не удалось открыть профиль</b><span>${esc(error.message)}</span><br><br><button class="mc-primary mc-retry">Повторить</button></div></div>`;
        root.querySelector('.mc-back').onclick = back;
        root.querySelector('.mc-retry').onclick = openSelf;
    }
    function back() { closeLayers(); global.Lobby?.show?.('lbMain'); }

    function render() {
        const root = $('#monoCollectionRoot');
        if (!root || !current) return;
        const account = current.account || {};
        const rating = current.rating || {};
        const inventory = current.inventory || [];
        const unique = inventory.length;
        const total = inventory.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
        root.innerHTML = `<div class="mc-page">
            <div class="mc-head">
                <button class="mc-back" aria-label="Назад">‹</button>
                <div class="mc-head-copy"><h2>Профиль</h2><p>Монополия</p></div>
                <div class="mc-balance">
                    <div class="mc-chip"><img src="assets/skins/case.svg" alt=""><b>${compact(account.cases_count)}</b><span>кейсов</span></div>
                    <div class="mc-chip"><img src="assets/skins/coin.svg" alt=""><b>${compact(account.coins)}</b></div>
                </div>
            </div>
            <section class="mc-hero">
                <div class="mc-person">${avatar(current.user, global.Lobby?.profile?.())}<div><b>${esc(ownerName(current))}</b><small>${current.user?.username ? '@' + esc(current.user.username) : 'Профиль игрока'}</small></div></div>
                <div class="mc-stats">
                    <div class="mc-stat"><span>Рейтинг</span><b>${compact(rating.points)}</b></div>
                    <div class="mc-stat"><span>Победы</span><b>${compact(rating.wins)}</b></div>
                    <div class="mc-stat"><span>Игры</span><b>${compact(rating.games)}</b></div>
                </div>
            </section>
            <div class="mc-tabs" data-tab="${activeTab}">
                <button class="mc-tab${activeTab === 'cases' ? ' on' : ''}" data-tab="cases">Кейсы</button>
                <button class="mc-tab${activeTab === 'skins' ? ' on' : ''}" data-tab="skins">Компании</button>
            </div>
            <div id="mcTabBody">${activeTab === 'cases' ? casesHtml() : skinsHtml()}</div>
        </div>`;
        root.querySelector('.mc-back').onclick = back;
        root.querySelectorAll('.mc-tab').forEach(button => button.onclick = () => {
            activeTab = button.dataset.tab; render();
        });
        bindBody(root);
        root.dataset.unique = unique; root.dataset.total = total;
    }

    function casesHtml() {
        const account = current.account || {};
        const pending = current.pendingOpenings?.[0];
        return `<div class="mc-section-title"><b>Универсальный кейс</b><span>за каждые 50 рейтинга</span></div>
            <div class="mc-case-card">
                <div class="mc-case-art"><img src="assets/skins/case.svg" alt="Кейс"></div>
                <div class="mc-case-copy"><b>${pending ? 'Находка ждёт вас' : 'Новая компания'}</b>
                    <span>${pending ? 'Открытый кейс сохранён — заберите выпавшую компанию.' : 'Внутри одна уникальная компания одной из четырёх редкостей.'}</span>
                    <button class="mc-primary mc-open" ${!pending && Number(account.cases_count) < 1 ? 'disabled' : ''}>${pending ? 'Забрать' : 'Открыть кейс'}</button>
                </div>
            </div>
            <div class="mc-section-title"><b>Шансы выпадения</b><span>без скрытых корректировок</span></div>
            <div class="mc-stats">
                <div class="mc-stat"><span>Обычная</span><b>70%</b></div>
                <div class="mc-stat"><span>Редкая</span><b>22%</b></div>
                <div class="mc-stat"><span>Эпическая</span><b>7%</b></div>
            </div>
            <div class="mc-stat" style="margin-top:8px"><span>Мифическая</span><b style="color:var(--mc-mythic)">1%</b></div>`;
    }
    function skinsHtml() {
        const inventory = current.inventory || [];
        const groups = [['all', 'Все'], ['cars', 'Авто'], ['web', 'Веб'], ['food', 'Рестораны'], ['tech', 'Электроника'], ['duplicates', 'Повторки']];
        const rows = inventory.filter(row => filter === 'all' || (filter === 'duplicates' ? Number(row.quantity) > 1 : row.skin?.groupId === filter));
        return `<div class="mc-section-title"><b>Коллекция</b><span>${inventory.length} из ${current.catalog?.skins?.length || 0}</span></div>
            <div class="mc-filter-row">${groups.map(([id, title]) => `<button class="mc-filter${filter === id ? ' on' : ''}" data-filter="${id}">${title}</button>`).join('')}</div>
            ${rows.length ? `<div class="mc-grid">${rows.map(row => skinCard(row)).join('')}</div>` : '<div class="mc-empty"><b>Здесь пока пусто</b>Откройте кейс — полученная компания появится в коллекции.</div>'}`;
    }
    function skinCard(row, loadout = current?.loadout || []) {
        const skin = row.skin;
        if (!skin) return '';
        const equipped = loadout.some(item => item.skin_id === skin.id);
        return `<button class="mc-skin" data-skin="${esc(skin.id)}" data-rarity="${skin.rarity}" data-layout="${skin.layout}">
            ${Number(row.quantity) > 1 ? `<span class="mc-qty">×${Number(row.quantity)}</span>` : ''}
            <div class="mc-skin-img"><img src="${esc(asset(skin.asset))}" alt=""><i class="mc-rarity-strip"></i></div>
            <b>${esc(skin.name)}</b><small>${RARITY[skin.rarity]?.[0] || skin.rarity}${equipped ? ' · установлена' : ''}</small>
        </button>`;
    }
    function bindBody(root) {
        root.querySelectorAll('.mc-filter').forEach(button => button.onclick = () => { filter = button.dataset.filter; render(); });
        root.querySelectorAll('.mc-skin').forEach(button => button.onclick = () => openSkin(button.dataset.skin));
        root.querySelector('.mc-open')?.addEventListener('click', () => {
            const pending = current.pendingOpenings?.[0];
            if (pending) showWin(pending, true);
            else openCase();
        });
    }

    function layer(html, cls = '') {
        const el = document.createElement('div');
        el.className = `mc-layer ${cls}`;
        el.innerHTML = html;
        document.body.appendChild(el);
        requestAnimationFrame(() => el.classList.add('on'));
        el.addEventListener('click', event => { if (event.target === el) closeLayer(el); });
        el.querySelector('.mc-close')?.addEventListener('click', () => closeLayer(el));
        return el;
    }
    function closeLayer(el) { if (!el) return; el.classList.remove('on'); setTimeout(() => el.remove(), 300); }
    function closeLayers() { document.querySelectorAll('.mc-layer,.mc-roulette-layer').forEach(el => el.remove()); }

    function boardPreviewHtml(skin, equipped) {
        const D = global.MonopolyDataV2;
        if (!D?.TILES || !global.BoardUI?.placeOf) return '';
        const compatible = new Map(skin.compatibleTiles.map((tile, index) => [Number(tile), index + 1]));
        const cells = D.TILES.map(tile => {
            const pos = global.BoardUI.placeOf(tile.i);
            const candidate = compatible.get(tile.i);
            const selected = Number(equipped?.tile_id) === tile.i;
            const color = tile.group && D.GROUPS?.[tile.group]?.color || '#3b3d46';
            const style = `grid-row:${pos.r};grid-column:${pos.c};--tile-color:${esc(color)}`;
            if (!candidate) return `<i class="mc-board-cell${pos.corner ? ' corner' : ''}" style="${style}"></i>`;
            return `<button type="button" class="mc-board-cell candidate${selected ? ' selected' : ''}" style="${style}"
                data-equip-tile="${tile.i}" aria-label="${esc(TILE_NAMES[tile.i] || 'Поле ' + tile.i)}">
                ${selected ? `<img src="${esc(asset(skin.asset))}" alt="">` : `<b>${candidate}</b>`}
            </button>`;
        }).join('');
        return `<div class="mc-board-preview" aria-label="Расположение полей на карте">
            ${cells}<div class="mc-board-center"><b>Карта</b><span>Поля этой тематики отмечены цифрами</span></div>
        </div>`;
    }

    function openSkin(id) {
        const row = current.inventory.find(item => item.skin_id === id);
        if (!row?.skin) return;
        const skin = row.skin;
        const equipped = current.loadout.find(item => item.skin_id === id);
        const html = `<div class="mc-sheet mc-detail" data-rarity="${skin.rarity}"><div class="mc-grabber"></div>
            <div class="mc-sheet-head"><h3>Компания</h3><button class="mc-close">×</button></div>
            <div class="mc-detail-top"><div class="mc-detail-img"><img src="${esc(asset(skin.asset))}" alt=""></div>
                <div class="mc-detail-copy"><b>${RARITY[skin.rarity]?.[0] || skin.rarity}</b><h4>${esc(skin.name)}</h4>
                <p>${esc(skin.groupName)} · +${skin.bonusBps / 100}% ко всем уровням аренды после сбора монополии.</p></div></div>
            <div class="mc-section-title"><b>Расположение на карте</b><span>без перехода в игру</span></div>
            ${boardPreviewHtml(skin, equipped)}
            <div class="mc-section-title"><b>Выберите поле</b><span>в той же тематике</span></div>
            <div class="mc-map">${skin.compatibleTiles.map(tile => `<button data-equip-tile="${tile}" class="${equipped?.tile_id === tile ? 'on equipped' : ''}">${esc(TILE_NAMES[tile] || 'Поле ' + tile)}</button>`).join('')}</div>
            <div class="mc-sheet-actions">
                ${equipped ? '<button class="mc-secondary mc-original">Вернуть оригинал</button>' : ''}
                ${Number(row.quantity) > 1 ? `<button class="mc-secondary mc-exchange">Обменять дубль · ${skin.exchangeValue}</button>` : ''}
            </div></div>`;
        const el = layer(html);
        el.querySelectorAll('[data-equip-tile]').forEach(button => button.onclick = async () => {
            if (busy) return; busy = true; button.classList.add('on');
            try {
                await request('/api/monopoly/skins/equip', { method: 'POST', body: JSON.stringify({ skinId: id, tileId: Number(button.dataset.equipTile) }) });
                closeLayer(el); global.Lobby?.toast?.(`${skin.name} установлена`); await refresh();
            } catch (error) { global.Lobby?.toast?.(humanError(error), true); }
            finally { busy = false; }
        });
        el.querySelector('.mc-original')?.addEventListener('click', async () => {
            if (busy) return; busy = true;
            try { await request('/api/monopoly/skins/unequip', { method:'POST', body:JSON.stringify({ tileId: equipped.tile_id }) }); closeLayer(el); await refresh(); }
            catch (error) { global.Lobby?.toast?.(humanError(error), true); } finally { busy = false; }
        });
        el.querySelector('.mc-exchange')?.addEventListener('click', () => confirmExchange(el, row));
    }
    function confirmExchange(parentLayer, row) {
        closeLayer(parentLayer);
        const skin = row.skin;
        const el = layer(`<div class="mc-sheet"><div class="mc-grabber"></div><div class="mc-confirm"><img src="assets/skins/coin.svg" alt="">
            <h3>Обменять повторку?</h3><p>Один лишний экземпляр «${esc(skin.name)}» исчезнет. Вы получите ${skin.exchangeValue} монет. Первый экземпляр останется навсегда.</p>
            <div class="mc-sheet-actions"><button class="mc-secondary mc-close-btn">Отмена</button><button class="mc-primary mc-confirm-btn">Обменять</button></div></div></div>`);
        el.querySelector('.mc-close-btn').onclick = () => closeLayer(el);
        el.querySelector('.mc-confirm-btn').onclick = async () => {
            if (busy) return; busy = true;
            try { await request('/api/monopoly/skins/exchange', { method:'POST', body:JSON.stringify({ skinId:skin.id }) }); closeLayer(el); global.Lobby?.toast?.(`Получено ${skin.exchangeValue} монет`); await refresh(); }
            catch (error) { global.Lobby?.toast?.(humanError(error), true); } finally { busy = false; }
        };
    }

    async function openCase() {
        if (busy) return; busy = true;
        const overlay = document.createElement('div');
        overlay.className = 'mc-roulette-layer';
        overlay.innerHTML = '<div class="mc-roulette-card"><h2>Открываем кейс</h2><div class="mc-spinner"></div></div>';
        document.body.appendChild(overlay); requestAnimationFrame(() => overlay.classList.add('on'));
        try {
            const result = await request('/api/monopoly/cases/open', { method:'POST', body:'{}' });
            playRoulette(overlay, result);
        } catch (error) { overlay.remove(); global.Lobby?.toast?.(humanError(error), true); busy = false; }
    }
    function weightedSkin() {
        const roll = Math.random() * 100;
        const rarity = roll < 70 ? 'common' : roll < 92 ? 'rare' : roll < 99 ? 'epic' : 'mythic';
        const pool = current.catalog.skins.filter(skin => skin.rarity === rarity);
        return pool[Math.floor(Math.random() * pool.length)] || current.catalog.skins[0];
    }
    function playRoulette(overlay, result) {
        const target = 22;
        const items = Array.from({ length: 28 }, weightedSkin);
        items[target] = result.skin;
        overlay.innerHTML = `<div class="mc-roulette-card"><h2>Открываем кейс</h2><div class="mc-reel-window"><div class="mc-reel">${items.map(skin => `<div class="mc-reel-item" data-rarity="${skin.rarity}"><img src="${esc(asset(skin.asset))}" alt=""></div>`).join('')}</div></div></div>`;
        const reel = overlay.querySelector('.mc-reel');
        const destination = -(target * 134 + 62) + (Math.random() * 32 - 16);
        reel.animate([{ transform:'translateX(0)' }, { transform:`translateX(${destination}px)` }], {
            duration: 5800, easing:'cubic-bezier(.08,.72,.12,1)', fill:'forwards',
        }).onfinish = () => setTimeout(() => { overlay.remove(); showWin(result, false); }, 450);
    }
    function showWin(opening, pending) {
        const skin = opening.skin;
        const id = opening.opening_id || opening.id;
        const overlay = document.createElement('div');
        overlay.className = 'mc-roulette-layer on';
        overlay.innerHTML = `<div class="mc-roulette-card mc-win" data-rarity="${skin.rarity}"><div class="mc-win-art"><img src="${esc(asset(skin.asset))}" alt=""></div>
            <small>${RARITY[skin.rarity]?.[0] || skin.rarity}</small><h2>${esc(skin.name)}</h2><p>${esc(skin.groupName)} · +${skin.bonusBps / 100}% к аренде</p>
            <button class="mc-primary">Принять</button></div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('.mc-primary').onclick = async () => {
            if (!id) return;
            try { await request('/api/monopoly/cases/claim', { method:'POST', body:JSON.stringify({ openingId:id }) }); overlay.remove(); busy = false; activeTab = 'skins'; await refresh(); }
            catch (error) { global.Lobby?.toast?.(humanError(error), true); }
        };
        if (pending) busy = false;
    }
    function humanError(error) {
        return ({ no_cases:'Нет доступных кейсов', no_duplicate:'Можно обменять только лишний экземпляр',
            pending_opening:'Сначала заберите уже открытую компанию',
            incompatible_skin:'Эта компания не подходит полю', skin_already_equipped:'Компания уже установлена',
            unauthenticated:'Откройте игру через Telegram' })[error.message] || 'Не удалось выполнить действие';
    }

    async function openPlayer(id) {
        const overlay = layer('<div class="mc-sheet"><div class="mc-grabber"></div><div class="mc-sheet-head"><h3>Профиль игрока</h3><button class="mc-close">×</button></div><div class="mc-spinner"></div></div>');
        try {
            const data = await request('/api/monopoly/collection/player/' + encodeURIComponent(id));
            const rating = data.rating || {}, inv = data.inventory || [], user = data.user || {};
            const stats = otherStats(user);
            overlay.querySelector('.mc-sheet').innerHTML = `<div class="mc-grabber"></div><div class="mc-sheet-head"><h3>Профиль игрока</h3><button class="mc-close">×</button></div>
                <section class="mc-hero"><div class="mc-person">${avatar(user,{name:'Игрок'})}<div><b>${esc(user.first_name || user.username || 'Игрок')}</b><small>${user.username ? '@'+esc(user.username) : ''}</small></div></div>
                <div class="mc-stats"><div class="mc-stat"><span>Рейтинг</span><b>${compact(rating.points)}</b></div><div class="mc-stat"><span>Победы</span><b>${compact(rating.wins)}</b></div><div class="mc-stat"><span>Игры</span><b>${compact(rating.games)}</b></div></div></section>
                ${stats ? `<div class="mc-section-title"><b>Все игры</b><span>статистика Spark</span></div><div class="mc-stats">${stats}</div>` : ''}
                <div class="mc-section-title"><b>Коллекция</b><span>${inv.length} компаний</span></div>${inv.length ? `<div class="mc-grid">${inv.map(row => skinCard(row, data.loadout || [])).join('')}</div>` : '<div class="mc-empty">Коллекция пока пуста</div>'}`;
            overlay.querySelector('.mc-close').onclick = () => closeLayer(overlay);
        } catch (error) { overlay.querySelector('.mc-spinner').outerHTML = '<div class="mc-empty">Профиль недоступен</div>'; }
    }
    function otherStats(user) {
        const rows = [
            ['Сапёр', user.saper_wins, user.saper_total, 'побед / игр'],
            ['Шашки', user.checkers_wins_pve, user.checkers_total, 'побед / игр'],
            ['Блок Бласт', user.bb_total_games, null, 'игр'],
            ['Судоку', user.sudoku_wins, null, 'очков'],
            ['Вордли', user.wordle_wins, null, 'побед'],
            ['Башня', user.tower_best, null, 'этажей'],
        ].filter(row => Number(row[1]) > 0 || Number(row[2]) > 0);
        return rows.map(([name,primary,secondary,label]) => `<div class="mc-stat"><span>${name}</span><b>${secondary == null
            ? compact(primary) + ' ' + label : compact(primary) + ' / ' + compact(secondary)}</b></div>`).join('');
    }

    global.CollectionUI = { openSelf, openPlayer, refresh, loadSelf };
})(window);
