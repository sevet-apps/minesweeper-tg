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
    let sortMode = 'collection';
    let busy = false;
    let tabProgress = 0;
    let tabDrag = null;

    async function request(path, options = {}) {
        const bases = global.Lobby?.serverCandidates?.() || ['https://spark-game-backend.onrender.com'];
        const method = String(options.method || 'GET').toUpperCase();
        const headers = { ...(global.Lobby?.authHeaders?.() || {}), ...(options.headers || {}) };
        const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
        if (options.body != null && !isFormData && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }
        let networkError = null;
        for (const base of bases) {
            try {
                const response = await fetch(base + path, {
                    ...options,
                    headers,
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
        if (!root.querySelector('.mc-page')) buildShell(root);
        updateProfile(root);
        renderCasesPanel(root);
        renderSkinsPanel(root, { animate: false });
        setTab(activeTab, false);
        const account = current.account || {};
        const inventory = current.inventory || [];
        const unique = inventory.length;
        const total = inventory.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
        root.dataset.unique = unique; root.dataset.total = total;
    }
    function buildShell(root) {
        root.innerHTML = `<div class="mc-page" style="--mc-tab-progress:${activeTab === 'skins' ? 1 : 0}">
            <div class="mc-head">
                <button class="mc-back" aria-label="Назад"><span aria-hidden="true"></span></button>
                <div class="mc-head-copy"><h2>Профиль</h2><p>Монополия</p></div>
                <div class="mc-balance">
                    <div class="mc-chip"><img src="assets/skins/case.svg" alt=""><b data-mc-cases>0</b><span>кейсов</span></div>
                    <div class="mc-chip"><img src="assets/skins/coin.svg" alt=""><b data-mc-coins>0</b></div>
                </div>
            </div>
            <section class="mc-hero" data-mc-profile></section>
            <div class="mc-tabs" role="tablist" aria-label="Раздел профиля">
                <button class="mc-tab" data-tab="cases" role="tab">Кейсы</button>
                <button class="mc-tab" data-tab="skins" role="tab">Компании</button>
            </div>
            <div class="mc-tab-viewport">
                <div class="mc-tab-track">
                    <section class="mc-tab-panel" id="mcCasesPanel" role="tabpanel"></section>
                    <section class="mc-tab-panel" id="mcSkinsPanel" role="tabpanel"></section>
                </div>
            </div>
        </div>`;
        root.querySelector('.mc-back').onclick = back;
        root.querySelectorAll('.mc-tab').forEach(button => button.onclick = event => {
            if (Date.now() - Number(root.dataset.mcDraggedAt || 0) < 250) return;
            setTab(button.dataset.tab, true);
        });
        bindTabDrag(root);
    }
    function updateProfile(root) {
        const account = current.account || {};
        const rating = current.rating || {};
        root.querySelector('[data-mc-cases]').textContent = compact(account.cases_count);
        root.querySelector('[data-mc-coins]').textContent = compact(account.coins);
        root.querySelector('[data-mc-profile]').innerHTML = `<div class="mc-person">${avatar(current.user, global.Lobby?.profile?.())}<div><b>${esc(ownerName(current))}</b><small>${current.user?.username ? '@' + esc(current.user.username) : 'Профиль игрока'}</small></div></div>
            <div class="mc-stats"><div class="mc-stat"><span>Рейтинг</span><b>${compact(rating.points)}</b></div>
            <div class="mc-stat"><span>Победы</span><b>${compact(rating.wins)}</b></div>
            <div class="mc-stat"><span>Игры</span><b>${compact(rating.games)}</b></div></div>`;
    }
    function renderCasesPanel(root) {
        const panel = root.querySelector('#mcCasesPanel');
        if (!panel) return;
        panel.innerHTML = casesHtml();
        panel.querySelectorAll('.mc-case-item').forEach(card => card.onclick = () => presentCase());
        panel.querySelector('.mc-pending-case')?.addEventListener('click', () => showWin(current.pendingOpenings[0], true));
        syncViewportHeight();
    }
    function casesHtml() {
        const account = current.account || {};
        const pending = current.pendingOpenings?.[0];
        const count = Math.max(0, Number(account.cases_count) || 0);
        const visible = Math.min(count, 30);
        const cards = Array.from({ length: Math.max(visible, count ? 0 : 1) }, (_, index) => `<button class="mc-case-item" ${count ? '' : 'disabled'} aria-label="${count ? `Открыть кейс ${index + 1}` : 'Нет доступных кейсов'}">
            <span class="mc-case-glow"></span><img src="assets/skins/case.svg" alt=""><b>Универсальный кейс</b><small>${count ? `Кейс ${index + 1} из ${count}` : 'Следующий — за 50 рейтинга'}</small></button>`).join('');
        return `<div class="mc-section-title"><b>Ваши кейсы</b><span>${count} в профиле</span></div>
            ${pending ? `<button class="mc-pending-case"><span>Открытая компания ждёт вас</span><b>Забрать находку</b></button>` : ''}
            <div class="mc-case-carousel" aria-label="Доступные кейсы">${cards}${count > visible ? `<div class="mc-case-more"><b>+${count - visible}</b><span>ещё кейсов</span></div>` : ''}</div>
            <div class="mc-case-hint"><b>Одна компания внутри</b><span>Кейсы начисляются за каждые 50 очков рейтинга Монополии.</span></div>
            <div class="mc-odds"><span><i data-rarity="common"></i>Обычная <b>70%</b></span><span><i data-rarity="rare"></i>Редкая <b>22%</b></span><span><i data-rarity="epic"></i>Эпическая <b>7%</b></span><span><i data-rarity="mythic"></i>Мифическая <b>1%</b></span></div>`;
    }
    function companyInstances(inventory = current?.inventory || []) {
        return inventory.flatMap(row => Array.from({ length: Math.max(0, Number(row.quantity) || 0) }, (_, copyIndex) => ({ row, copyIndex, duplicate: copyIndex > 0 })));
    }
    function visibleCompanies() {
        const inventory = current.inventory || [];
        let rows = companyInstances(inventory).filter(item => filter === 'all' || (filter === 'duplicates' ? item.duplicate : item.row.skin?.groupId === filter));
        const rarityRank = { common: 0, rare: 1, epic: 2, mythic: 3 };
        if (sortMode === 'rarity') rows.sort((a, b) => (rarityRank[b.row.skin?.rarity] || 0) - (rarityRank[a.row.skin?.rarity] || 0));
        else if (sortMode === 'newest') rows.sort((a, b) => String(b.row.first_acquired_at || '').localeCompare(String(a.row.first_acquired_at || '')) || b.copyIndex - a.copyIndex);
        else if (sortMode === 'duplicates') rows.sort((a, b) => Number(b.duplicate) - Number(a.duplicate));
        else rows.sort((a, b) => String(a.row.skin?.groupId || '').localeCompare(String(b.row.skin?.groupId || '')) || String(a.row.skin?.name || '').localeCompare(String(b.row.skin?.name || ''), 'ru'));
        return rows;
    }
    function renderSkinsPanel(root, options = {}) {
        const panel = root.querySelector('#mcSkinsPanel');
        if (!panel) return;
        const groups = [['all', 'Все'], ['cars', 'Авто'], ['web', 'Веб'], ['food', 'Рестораны'], ['tech', 'Электроника'], ['duplicates', 'Повторки']];
        const rows = visibleCompanies();
        const inventory = current.inventory || [];
        const total = companyInstances(inventory).length;
        const direction = Number(options.direction || 1);
        if (!panel.querySelector('.mc-companies-shell')) {
            panel.innerHTML = `<div class="mc-companies-shell"><div class="mc-section-title mc-company-title"><div><b>Компании</b><span data-company-count></span></div><button class="mc-sort" aria-label="Сортировать"><i></i>Сортировка</button></div>
                <div class="mc-filter-row">${groups.map(([id, title]) => `<button class="mc-filter${filter === id ? ' on' : ''}" data-filter="${id}">${title}</button>`).join('')}</div>
                <div class="mc-company-results"></div></div>`;
            bindCompanies(panel);
        }
        panel.querySelector('[data-company-count]').textContent = `${inventory.length} из ${current.catalog?.skins?.length || 0} уникальных · ${total} всего`;
        panel.querySelectorAll('.mc-filter').forEach(button => button.classList.toggle('on', button.dataset.filter === filter));
        const results = panel.querySelector('.mc-company-results');
        results.innerHTML = rows.length ? `<div class="mc-grid">${rows.map(item => skinCard(item)).join('')}</div>` : '<div class="mc-empty"><b>Здесь пока пусто</b>Откройте кейс — полученная компания появится в коллекции.</div>';
        bindCompanyCards(results);
        if (options.animate && results.querySelector('.mc-grid')) results.querySelector('.mc-grid').animate([
            { opacity: .35, transform: `translate3d(${direction * 22}px,0,0)` },
            { opacity: 1, transform: 'translate3d(0,0,0)' },
        ], { duration: 360, easing: 'cubic-bezier(.2,.8,.25,1)' });
        requestAnimationFrame(() => {
            const rail = panel.querySelector('.mc-filter-row');
            const selected = rail?.querySelector('.mc-filter.on');
            if (!rail || !selected) return;
            alignFilterAtStart(rail, selected, options.animate);
        });
        syncViewportHeight();
    }
    function skinCard(value, loadout = current?.loadout || []) {
        const row = value?.row || value;
        const copyIndex = Number(value?.copyIndex || 0);
        const duplicate = Boolean(value?.duplicate || copyIndex > 0);
        const skin = row.skin;
        if (!skin) return '';
        const equipped = !duplicate && loadout.some(item => item.skin_id === skin.id);
        return `<button class="mc-skin${duplicate ? ' is-duplicate' : ''}" data-skin="${esc(skin.id)}" data-copy="${copyIndex}" data-rarity="${skin.rarity}" data-layout="${skin.layout}">
            ${duplicate ? '<span class="mc-duplicate-badge">Повторка</span>' : ''}
            <div class="mc-skin-img"><img src="${esc(asset(skin.asset))}" alt=""></div>
            <b>${esc(skin.name)}</b><small>${RARITY[skin.rarity]?.[0] || skin.rarity}${equipped ? ' · установлена' : ''}</small>
        </button>`;
    }
    function bindCompanies(panel) {
        const order = ['all','cars','web','food','tech','duplicates'];
        panel.querySelectorAll('.mc-filter').forEach(button => button.onclick = () => {
            if (button.dataset.filter === filter) return;
            const oldIndex = order.indexOf(filter), nextIndex = order.indexOf(button.dataset.filter);
            filter = button.dataset.filter;
            panel.querySelectorAll('.mc-filter').forEach(item => item.classList.toggle('on', item === button));
            const rail = button.closest('.mc-filter-row');
            requestAnimationFrame(() => alignFilterAtStart(rail, button, true));
            renderSkinsPanel($('#monoCollectionRoot'), { animate:true, direction:nextIndex >= oldIndex ? 1 : -1 });
        });
        panel.querySelector('.mc-sort')?.addEventListener('click', openSortSheet);
    }
    function alignFilterAtStart(rail, button, smooth) {
        if (!rail || !button) return;
        const railRect = rail.getBoundingClientRect();
        const buttonRect = button.getBoundingClientRect();
        const localLeft = buttonRect.left - railRect.left + rail.scrollLeft;
        rail.scrollTo({ left:Math.max(0, localLeft - 2), behavior:smooth ? 'smooth' : 'auto' });
    }
    function bindCompanyCards(root) {
        root.querySelectorAll('.mc-skin').forEach(button => button.onclick = () => openSkin(button.dataset.skin, Number(button.dataset.copy || 0)));
    }
    function applyTabProgress(value) {
        tabProgress = Math.max(0, Math.min(1, Number(value) || 0));
        const page = $('#monoCollectionRoot .mc-page');
        if (!page) return;
        page.style.setProperty('--mc-tab-progress', tabProgress);
        const panels = page.querySelectorAll('.mc-tab-panel');
        const viewport = page.querySelector('.mc-tab-viewport');
        if (viewport && panels.length === 2) {
            if (viewport.scrollLeft) viewport.scrollLeft = 0;
            viewport.style.height = `${Math.round(panels[0].scrollHeight * (1 - tabProgress) + panels[1].scrollHeight * tabProgress)}px`;
        }
    }
    function setTab(tab, animate = true) {
        activeTab = tab === 'skins' ? 'skins' : 'cases';
        const page = $('#monoCollectionRoot .mc-page');
        if (!page) return;
        page.classList.toggle('mc-no-tab-motion', !animate);
        page.querySelectorAll('.mc-tab').forEach(button => {
            const on = button.dataset.tab === activeTab;
            button.classList.toggle('on', on); button.setAttribute('aria-selected', String(on));
        });
        applyTabProgress(activeTab === 'skins' ? 1 : 0);
        if (activeTab === 'skins') {
            const alignActive = () => {
                const rail = page.querySelector('.mc-filter-row');
                alignFilterAtStart(rail, rail?.querySelector('.mc-filter.on'), animate);
            };
            requestAnimationFrame(alignActive);
            setTimeout(alignActive, 80);
        }
        requestAnimationFrame(() => page.classList.remove('mc-no-tab-motion'));
    }
    function syncViewportHeight() { requestAnimationFrame(() => applyTabProgress(tabProgress)); }
    function bindTabDrag(root) {
        const tabs = root.querySelector('.mc-tabs');
        tabs.addEventListener('pointerdown', event => {
            if (event.button != null && event.button !== 0) return;
            tabDrag = { id:event.pointerId, x:event.clientX, time:performance.now(), start:activeTab === 'skins' ? 1 : 0, moved:false };
            tabs.setPointerCapture?.(event.pointerId); tabs.classList.add('dragging');
        });
        tabs.addEventListener('pointermove', event => {
            if (!tabDrag || tabDrag.id !== event.pointerId) return;
            const dx = event.clientX - tabDrag.x;
            if (Math.abs(dx) > 3) tabDrag.moved = true;
            applyTabProgress(tabDrag.start + dx / Math.max(1, tabs.clientWidth * .72));
        });
        const finish = event => {
            if (!tabDrag || tabDrag.id !== event.pointerId) return;
            const elapsed = Math.max(1, performance.now() - tabDrag.time);
            const velocity = (event.clientX - tabDrag.x) / elapsed;
            const next = velocity > .35 ? 'skins' : velocity < -.35 ? 'cases' : tabProgress >= .5 ? 'skins' : 'cases';
            if (tabDrag.moved) root.dataset.mcDraggedAt = Date.now();
            tabDrag = null; tabs.classList.remove('dragging'); setTab(next, true);
        };
        tabs.addEventListener('pointerup', finish); tabs.addEventListener('pointercancel', finish);
    }
    function presentCase() {
        if (Number(current.account?.cases_count || 0) < 1) return;
        const el = layer(`<div class="mc-sheet mc-case-sheet"><div class="mc-grabber"></div><div class="mc-case-sheet-art"><span></span><img src="assets/skins/case.svg" alt=""></div>
            <h3>Универсальный кейс</h3><p>Внутри одна компания. Редкость определяется честной серверной выборкой в момент открытия.</p>
            <div class="mc-sheet-actions"><button class="mc-secondary mc-close-btn">Не сейчас</button><button class="mc-primary mc-open-confirm">Открыть</button></div></div>`);
        el.querySelector('.mc-close-btn').onclick = () => closeLayer(el);
        el.querySelector('.mc-open-confirm').onclick = () => { closeLayer(el); setTimeout(openCase, 520); };
    }
    function openSortSheet() {
        const options = [['collection','По коллекциям'],['rarity','По редкости'],['newest','Сначала новые'],['duplicates','Сначала повторки']];
        const el = layer(`<div class="mc-sheet mc-sort-sheet"><div class="mc-grabber"></div><div class="mc-sheet-head"><h3>Сортировать по</h3><button class="mc-close">×</button></div>
            <div class="mc-sort-options">${options.map(([id,title]) => `<button data-sort="${id}" class="${sortMode === id ? 'on' : ''}"><span>${title}</span><i></i></button>`).join('')}</div></div>`);
        el.querySelectorAll('[data-sort]').forEach(button => button.onclick = () => {
            sortMode = button.dataset.sort; closeLayer(el); renderSkinsPanel($('#monoCollectionRoot'), { animate:true, direction:1 });
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
        bindSheetDrag(el);
        return el;
    }
    function setSheetDrag(el, offset) {
        const sheet = el.querySelector('.mc-sheet');
        if (!sheet) return;
        const distance = Math.max(0, Number(offset) || 0);
        const progress = Math.min(1, distance / Math.max(280, sheet.offsetHeight * .72));
        sheet.style.setProperty('--mc-sheet-offset', `${distance}px`);
        el.style.backgroundColor = `rgba(0,0,0,${(.54 * (1 - progress)).toFixed(3)})`;
        el.style.backdropFilter = `blur(${(13 * (1 - progress)).toFixed(2)}px)`;
        el.style.webkitBackdropFilter = `blur(${(13 * (1 - progress)).toFixed(2)}px)`;
    }
    function resetSheetDrag(el) {
        const sheet = el.querySelector('.mc-sheet');
        el.classList.remove('mc-dragging');
        sheet?.style.removeProperty('--mc-sheet-offset');
        el.style.removeProperty('background-color');
        el.style.removeProperty('backdrop-filter');
        el.style.removeProperty('-webkit-backdrop-filter');
    }
    function bindSheetDrag(el) {
        const sheet = el.querySelector('.mc-sheet');
        if (!sheet) return;
        let drag = null;
        const interactive = target => target.closest('button,a,input,select,textarea,[data-no-drag]');
        const begin = (y, target) => {
            if (interactive(target)) return false;
            drag = { startY:y, lastY:y, lastAt:performance.now(), velocity:0, active:false };
            return true;
        };
        const move = (y, event) => {
            if (!drag) return;
            const distance = y - drag.startY;
            if (!drag.active) {
                if (distance < 7) return;
                if (sheet.scrollTop > 0 || distance <= 0) { drag = null; return; }
                drag.active = true;
                el.classList.add('mc-dragging');
            }
            if (event?.cancelable) event.preventDefault();
            const now = performance.now();
            drag.velocity = (y - drag.lastY) / Math.max(1, now - drag.lastAt);
            drag.lastY = y; drag.lastAt = now;
            setSheetDrag(el, Math.max(0, distance));
        };
        const finish = y => {
            if (!drag) return;
            const distance = Math.max(0, y - drag.startY);
            const dismiss = drag.active && (distance > Math.min(150, sheet.offsetHeight * .24) || drag.velocity > .7);
            drag = null;
            if (dismiss) closeLayer(el);
            else resetSheetDrag(el);
        };
        sheet.addEventListener('touchstart', event => {
            if (event.touches.length === 1) begin(event.touches[0].clientY, event.target);
        }, { passive:true });
        sheet.addEventListener('touchmove', event => {
            if (event.touches.length === 1) move(event.touches[0].clientY, event);
        }, { passive:false });
        sheet.addEventListener('touchend', event => finish(event.changedTouches[0]?.clientY ?? drag?.lastY ?? 0));
        sheet.addEventListener('touchcancel', () => { drag = null; resetSheetDrag(el); });
        sheet.addEventListener('pointerdown', event => {
            if (event.pointerType === 'mouse' && event.button === 0 && begin(event.clientY, event.target)) sheet.setPointerCapture(event.pointerId);
        });
        sheet.addEventListener('pointermove', event => { if (event.pointerType === 'mouse') move(event.clientY, event); });
        sheet.addEventListener('pointerup', event => { if (event.pointerType === 'mouse') finish(event.clientY); });
        sheet.addEventListener('pointercancel', () => { drag = null; resetSheetDrag(el); });
    }
    function closeLayer(el) {
        if (!el) return;
        resetSheetDrag(el);
        requestAnimationFrame(() => el.classList.remove('on'));
        setTimeout(() => el.remove(), 540);
    }
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

    function openSkin(id, copyIndex = 0) {
        const row = current.inventory.find(item => item.skin_id === id);
        if (!row?.skin) return;
        const skin = row.skin;
        const duplicate = Number(copyIndex) > 0;
        const equipped = current.loadout.find(item => item.skin_id === id);
        const html = `<div class="mc-sheet mc-detail" data-rarity="${skin.rarity}"><div class="mc-grabber"></div>
            <div class="mc-sheet-head"><h3>${duplicate ? 'Повторка' : 'Компания'}</h3><button class="mc-close">×</button></div>
            <div class="mc-detail-top"><div class="mc-detail-img"><img src="${esc(asset(skin.asset))}" alt=""></div>
                <div class="mc-detail-copy"><b>${RARITY[skin.rarity]?.[0] || skin.rarity}</b><h4>${esc(skin.name)}</h4>
                <p>${duplicate ? `Первый экземпляр уже хранится в коллекции. Этот можно обменять на ${skin.exchangeValue} монет.` : `${esc(skin.groupName)} · +${skin.bonusBps / 100}% ко всем уровням аренды после сбора монополии.`}</p></div></div>
            ${duplicate ? '' : `<div class="mc-section-title"><b>Расположение на карте</b><span>без перехода в игру</span></div>
            ${boardPreviewHtml(skin, equipped)}
            <div class="mc-section-title"><b>Выберите поле</b><span>в той же тематике</span></div>
            <div class="mc-map">${skin.compatibleTiles.map(tile => `<button data-equip-tile="${tile}" class="${equipped?.tile_id === tile ? 'on equipped' : ''}">${esc(TILE_NAMES[tile] || 'Поле ' + tile)}</button>`).join('')}</div>`}
            <div class="mc-sheet-actions">
                ${!duplicate && equipped ? '<button class="mc-secondary mc-original">Вернуть оригинал</button>' : ''}
                ${duplicate ? `<button class="mc-primary mc-exchange">Обменять на ${skin.exchangeValue} монет</button>` : ''}
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
        const el = layer(`<div class="mc-sheet mc-exchange-sheet"><div class="mc-grabber"></div><div class="mc-confirm"><img src="assets/skins/coin.svg" alt="">
            <h3>Обменять повторку?</h3><p>Один лишний экземпляр «${esc(skin.name)}» исчезнет. Вы получите ${skin.exchangeValue} монет. Первый экземпляр останется навсегда.</p>
            <div class="mc-sheet-actions"><button class="mc-secondary mc-close-btn">Отмена</button><button class="mc-primary mc-confirm-btn">Обменять</button></div></div></div>`);
        el.querySelector('.mc-close-btn').onclick = () => closeLayer(el);
        el.querySelector('.mc-confirm-btn').onclick = async () => {
            if (busy) return; busy = true;
            const button = el.querySelector('.mc-confirm-btn');
            button.disabled = true; button.textContent = 'Обмениваем…';
            try { await request('/api/monopoly/skins/exchange', { method:'POST', body:JSON.stringify({ skinId:skin.id }) }); closeLayer(el); global.Lobby?.toast?.(`Получено ${skin.exchangeValue} монет`); await refresh(); }
            catch (error) {
                button.disabled = false;
                button.textContent = 'Обменять';
                global.Lobby?.toast?.(humanError(error), true);
            } finally { busy = false; }
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
        const target = 48;
        const items = Array.from({ length: 56 }, weightedSkin);
        items[target] = result.skin;
        overlay.innerHTML = `<div class="mc-roulette-card"><h2>Открываем кейс</h2><div class="mc-reel-window"><div class="mc-reel">${items.map(skin => `<div class="mc-reel-item" data-rarity="${skin.rarity}" data-layout="${skin.layout || 'badge'}"><img src="${esc(asset(skin.asset))}" alt=""><span>${esc(skin.name)}</span></div>`).join('')}</div></div></div>`;
        const reel = overlay.querySelector('.mc-reel');
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const windowRect = overlay.querySelector('.mc-reel-window').getBoundingClientRect();
            const item = reel.children[target];
            const itemWidth = item.getBoundingClientRect().width;
            const gap = parseFloat(getComputedStyle(reel).columnGap) || 0;
            const landingFraction = .04 + Math.random() * .92;
            const destination = windowRect.width / 2 - (target * (itemWidth + gap) + itemWidth * landingFraction);
            const start = Math.min(70, windowRect.width * .18);
            const at = part => start + (destination - start) * part;
            reel.animate([
                { transform:`translate3d(${start}px,0,0)`, offset:0 },
                { transform:`translate3d(${at(.52)}px,0,0)`, offset:.12 },
                { transform:`translate3d(${at(.79)}px,0,0)`, offset:.31 },
                { transform:`translate3d(${at(.93)}px,0,0)`, offset:.57 },
                { transform:`translate3d(${at(.985)}px,0,0)`, offset:.81 },
                { transform:`translate3d(${destination}px,0,0)`, offset:1 },
            ], { duration:7600, easing:'cubic-bezier(.12,.58,.18,1)', fill:'forwards' })
                .onfinish = () => setTimeout(() => { overlay.remove(); showWin(result, false); }, 520);
        }));
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
