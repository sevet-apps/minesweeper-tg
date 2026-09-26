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
    let activeTab = 'progress';
    const TAB_IDS = ['progress', 'cases', 'skins'];
    let filter = 'all';
    let sortMode = 'collection';
    let busy = false;
    let tabProgress = 0;
    let tabDrag = null;
    let panelObserver = null;
    const logoPreloads = new Map();

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
    function preloadLogo(path) {
        const src = asset(path);
        if (!src || typeof global.Image !== 'function') return Promise.resolve();
        if (logoPreloads.has(src)) return logoPreloads.get(src).promise;
        const image = new global.Image();
        image.decoding = 'async';
        image.loading = 'eager';
        const promise = new Promise(resolve => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                resolve();
            };
            image.addEventListener('load', finish, { once:true });
            image.addEventListener('error', finish, { once:true });
            image.src = src;
            if (image.complete) finish();
        });
        /* Keep the Image object alive: WebKit may otherwise cancel speculative
           downloads before the same SVG is requested by the roulette. */
        logoPreloads.set(src, { image, promise });
        return promise;
    }
    function logoHtml(skin, className = '', lazy = false) {
        if (!skin?.asset) return '';
        return `<span class="mc-logo-frame${className ? ' ' + esc(className) : ''}" data-layout="${esc(skin.layout || 'badge')}"><img src="${esc(asset(skin.asset))}" alt="" draggable="false" decoding="async"${lazy ? ' loading="lazy"' : ''}></span>`;
    }
    function selectionHaptic() {
        try { global.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.(); } catch (_) {}
    }
    function resultHaptic() {
        try { global.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('medium'); } catch (_) {}
    }
    function rouletteHaptic() {
        try {
            const feedback = global.Telegram?.WebApp?.HapticFeedback;
            if (typeof feedback?.impactOccurred === 'function') feedback.impactOccurred('light');
            else feedback?.selectionChanged?.();
        } catch (_) {}
    }
    function avatar(user, fallback) {
        const name = user?.first_name || user?.username || fallback?.name || 'Игрок';
        const photo = user?.photo_url || fallback?.avatar;
        return photo ? `<div class="mc-avatar"><img src="${esc(photo)}" alt=""></div>`
            : `<div class="mc-avatar">${esc(name.slice(0, 2).toUpperCase())}</div>`;
    }
    function ownerName(data) {
        const me = global.Lobby?.profile?.();
        return me?.name || [data.user?.first_name, data.user?.last_name].filter(Boolean).join(' ') || data.user?.username || 'Игрок';
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
        if (!current) {
            current = await request('/api/monopoly/collection/me');
        }
        return current;
    }
    function renderLoading() {
        const root = $('#monoCollectionRoot');
        if (root) root.innerHTML = '<div class="mc-spinner"></div>';
    }
    function renderError(error) {
        const root = $('#monoCollectionRoot');
        if (!root) return;
        root.innerHTML = `<div class="mc-page"><div class="mc-head"><button class="mc-back" aria-label="Назад"><span aria-hidden="true"></span></button><div class="mc-head-copy"><h2>Коллекция</h2></div></div>
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
        renderProgressPanel(root);
        renderCasesPanel(root);
        root.dataset.skinsDirty='1';
        if (activeTab==='skins') { renderSkinsPanel(root,{animate:false}); delete root.dataset.skinsDirty; }
        setTab(activeTab, false);
        const account = current.account || {};
        const inventory = current.inventory || [];
        const unique = inventory.length;
        const total = inventory.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
        root.dataset.unique = unique; root.dataset.total = total;
    }
    function buildShell(root) {
        root.innerHTML = `<div class="mc-page" style="--mc-tab-progress:${TAB_IDS.indexOf(activeTab)}">
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
                <button class="mc-tab" data-tab="progress" role="tab">Прогресс</button>
                <button class="mc-tab" data-tab="cases" role="tab">Кейсы</button>
                <button class="mc-tab" data-tab="skins" role="tab">Компании</button>
            </div>
            <div class="mc-tab-viewport">
                <div class="mc-tab-track">
                    <section class="mc-tab-panel" id="mcProgressPanel" role="tabpanel"></section>
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
        root.querySelector('.mc-tabs').addEventListener('keydown', event => {
            if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
            event.preventDefault();
            const index = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (TAB_IDS.indexOf(activeTab) + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
            setTab(TAB_IDS[index], true); root.querySelectorAll('.mc-tab')[index].focus();
        });
        if (!document.body.classList.contains('monopoly-pregame')) bindTabDrag(root);
        panelObserver?.disconnect();
        if (global.ResizeObserver) {
            panelObserver = new global.ResizeObserver(syncViewportHeight);
            root.querySelectorAll('.mc-tab-panel').forEach(panel => panelObserver.observe(panel));
        }
    }
    function updateProfile(root) {
        const account = current.account || {};
        const rating = current.rating || {};
        root.querySelector('[data-mc-cases]').textContent = compact(account.cases_count);
        root.querySelector('[data-mc-coins]').textContent = compact(account.coins);
        root.querySelector('[data-mc-profile]').innerHTML = `<div class="mc-person">${avatar(current.user, global.Lobby?.profile?.())}<div><b>${esc(ownerName(current))}</b><small>${current.user?.username ? '@' + esc(current.user.username) : 'Профиль игрока'}</small></div></div>`;
    }
    function renderProgressPanel(root) {
        const panel = root.querySelector('#mcProgressPanel');
        const rating = current.rating || {};
        const points = Math.max(0, Number(rating.points) || 0);
        const titles = current.catalog?.titles || [];
        const index = titles.reduce((found, rank, i) => points >= rank.from ? i : found, 0);
        const title = titles[index], next = titles[index + 1];
        const progress = title ? (next ? Math.min(1, (points - title.from) / (next.from - title.from)) : 1) : 0;
        const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>';
        const lock = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
        const rankMarks = [
            '<path d="M18 23a6 6 0 1 1 6 6h-9v6h-5v-8l7-7"/><circle cx="23" cy="23" r="1"/>',
            '<path d="M10 37V15h28v22H10ZM17 15v-5h14v5M20 37V26h8v11"/>',
            '<path d="m9 23 15-13 15 13v14H9V23Zm10 14V26h10v11"/><circle cx="34" cy="15" r="4"/>',
            '<path d="m7 23 17-15 17 15M11 21v20h26V21M20 41V29h8v12"/>',
            '<path d="M9 38h30M13 32l8-9 6 5 10-15M30 13h7v7"/>',
            '<path d="M8 39h32M12 39V20h9v19M21 39V10h8v29M29 39V25h8v14M18 15h3M27 16h2"/>',
            '<path d="m6 19 18-10 18 10H6ZM10 22v15M18 22v15M30 22v15M38 22v15M7 40h34"/>',
            '<path d="M8 39h32M11 39V24h7v15M20 39V15h8v24M30 39V20h7v19M23 10h2"/>',
            '<path d="m7 17 9 7 8-14 8 14 9-7-4 21H11L7 17ZM14 42h20"/>',
            '<path d="m24 7 4 10 11 1-8 8 2 11-9-6-9 6 2-11-8-8 11-1 4-10ZM8 39l6 3M40 39l-6 3"/>'
        ];
        const rankPalette = ['#7b9ac4','#7daee8','#66a5f4','#468dff','#6f8ef9','#4278e5','#6e75dd','#4564ce','#4665da','#d4a649'];
        panel.innerHTML = `<section class="mc-experience">
            <div class="mc-xp-heading"><div><small>Ваше звание</small><h3>${esc(title?.name || 'Рейтинг')}</h3></div><b>${compact(points)} <small>очков</small></b></div>
            <div class="mc-xp-bar" role="progressbar" aria-label="Прогресс звания" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress * 100)}"><span style="--xp:${progress}"></span></div>
            <p>${next ? `${esc(next.name)} · ${compact(points)} / ${compact(next.from)}` : title ? 'Максимальный титул' : 'Рейтинг'}</p>
            <div class="mc-stats"><div class="mc-stat"><span>Победы</span><b>${compact(rating.wins)}</b></div><div class="mc-stat"><span>Игры</span><b>${compact(rating.games)}</b></div></div>
        </section>
        <div class="mc-ranks-heading"><h3>Все звания</h3><div><button class="mc-rank-prev" aria-label="Предыдущее звание">${arrow}</button><button class="mc-rank-next" aria-label="Следующее звание">${arrow}</button></div></div>
        <div class="mc-ranks" tabindex="0" aria-label="Все звания">${titles.map((rank, i) => `<article class="mc-rank ${i === index ? 'current' : ''} ${points < rank.from ? 'locked' : ''}" data-rank="${i}">
            <div class="mc-rank-status">${points < rank.from ? lock + '<span>Закрыто</span>' : i === index ? '<span>Текущее звание</span>' : '<span>Получено</span>'}</div>
            <div class="mc-rank-emblem" style="--rank-accent:${rankPalette[i] || '#0a84ff'}"><svg viewBox="0 0 48 48" aria-hidden="true">${rankMarks[i] || rankMarks[0]}</svg><span>${String(i + 1).padStart(2, '0')}</span></div>
            <h4>${esc(rank.name)}</h4><p>${compact(rank.from)} <span>очков</span></p>
            <small>${points < rank.from ? `${compact(rank.from - points)} · <span>до открытия</span>` : '<span>Звание открыто</span>'}</small>
        </article>`).join('')}</div>`;
        const rail = panel.querySelector('.mc-ranks');
        let selected = index;
        const update = () => {
            const width = rail.firstElementChild?.getBoundingClientRect().width || 1;
            selected = Math.max(0, Math.min(titles.length - 1, Math.round(rail.scrollLeft / (width + 12))));
            panel.querySelector('.mc-rank-prev').disabled = selected <= 0;
            panel.querySelector('.mc-rank-next').disabled = rail.scrollLeft >= rail.scrollWidth - rail.clientWidth - 2;
        };
        const navigate = delta => {
            const card = rail.children[Math.max(0, Math.min(titles.length - 1, selected + delta))];
            if (card) { rail.scrollTo({ left:card.offsetLeft - rail.firstElementChild.offsetLeft, behavior:global.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); selectionHaptic(); }
        };
        panel.querySelector('.mc-rank-prev').onclick = () => navigate(-1);
        panel.querySelector('.mc-rank-next').onclick = () => navigate(1);
        rail.addEventListener('scroll', update, { passive:true });
        rail.addEventListener('keydown', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); navigate(event.key === 'ArrowRight' ? 1 : -1); } });
        requestAnimationFrame(() => { const card = rail.children[index]; if (card) rail.scrollLeft = card.offsetLeft - rail.firstElementChild.offsetLeft; update(); syncViewportHeight(); });
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
            <div class="mc-skin-img">${logoHtml(skin,'',true)}</div>
            <b>${esc(skin.name)}</b><small>${RARITY[skin.rarity]?.[0] || skin.rarity}${equipped ? ' · установлена' : ''}</small>
        </button>`;
    }
    function bindCompanies(panel) {
        const order = ['all','cars','web','food','tech','duplicates'];
        panel.querySelectorAll('.mc-filter').forEach(button => button.onclick = () => {
            selectionHaptic();
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
        tabProgress = Math.max(0, Math.min(2, Number(value) || 0));
        const page = $('#monoCollectionRoot .mc-page');
        if (!page) return;
        page.style.setProperty('--mc-tab-progress', tabProgress);
        const panels = page.querySelectorAll('.mc-tab-panel');
        const viewport = page.querySelector('.mc-tab-viewport');
        if (document.body.classList.contains('monopoly-pregame')) {
            const index=Math.round(tabProgress);
            panels.forEach((panel,i)=>panel.classList.toggle('is-active',i===index));
            if (viewport) viewport.style.height=Math.round(panels[index]?.scrollHeight||0)+'px';
            return;
        }
        if (viewport && panels.length === 3) {
            if (viewport.scrollLeft) viewport.scrollLeft = 0;
            const index = Math.min(1, Math.floor(tabProgress)), mix = tabProgress - index;
            viewport.style.height = Math.round(panels[index].scrollHeight * (1 - mix) + panels[index + 1].scrollHeight * mix) + 'px';
        }
    }
    function setTab(tab, animate = true) {
        activeTab = TAB_IDS.includes(tab) ? tab : 'progress';
        const root=$('#monoCollectionRoot');
        if (activeTab==='skins' && root?.dataset.skinsDirty==='1') { renderSkinsPanel(root,{animate:false}); delete root.dataset.skinsDirty; }
        const page = $('#monoCollectionRoot .mc-page');
        if (!page) return;
        page.classList.toggle('mc-no-tab-motion', !animate);
        page.querySelectorAll('.mc-tab').forEach(button => {
            const on = button.dataset.tab === activeTab;
            button.classList.toggle('on', on); button.setAttribute('aria-selected', String(on));
            button.tabIndex = on ? 0 : -1;
            button.id = 'mc-tab-' + button.dataset.tab;
            const panel = page.querySelectorAll('.mc-tab-panel')[TAB_IDS.indexOf(button.dataset.tab)];
            button.setAttribute('aria-controls', panel.id); panel.setAttribute('aria-labelledby', button.id); panel.inert = !on;
        });
        applyTabProgress(TAB_IDS.indexOf(activeTab));
        if (animate) selectionHaptic();
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
            tabDrag = { id:event.pointerId, x:event.clientX, time:performance.now(), start:TAB_IDS.indexOf(activeTab), moved:false };

        });
        tabs.addEventListener('pointermove', event => {
            if (!tabDrag || tabDrag.id !== event.pointerId) return;
            const dx = event.clientX - tabDrag.x;
            if (!tabDrag.moved && Math.abs(dx) < 7) return;
            if (!tabDrag.moved) { tabDrag.moved = true; tabs.setPointerCapture?.(event.pointerId); tabs.classList.add('dragging'); }
            applyTabProgress(tabDrag.start + dx / Math.max(1, tabs.clientWidth / 3));
        });
        const finish = event => {
            if (!tabDrag || tabDrag.id !== event.pointerId) return;
            const elapsed = Math.max(1, performance.now() - tabDrag.time);
            const velocity = (event.clientX - tabDrag.x) / elapsed;
            if (!tabDrag.moved) { tabDrag = null; return; }
            const index = event.type === 'pointercancel' ? tabDrag.start : Math.round(tabProgress + (Math.abs(velocity) > .35 ? Math.sign(velocity) * .35 : 0));
            const next = TAB_IDS[Math.max(0, Math.min(2, index))];
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
        const el = layer(`<div class="mc-sheet mc-sort-sheet"><div class="mc-grabber"></div><div class="mc-sheet-head"><h3>Сортировать по</h3><button class="mc-close" aria-label="Закрыть"></button></div>
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
        if (document.body.classList.contains('monopoly-pregame')) managePregameSheetFocus(el);
        void el.offsetHeight;
        requestAnimationFrame(() => requestAnimationFrame(() => { if (el.isConnected && !el.dataset.closing) el.classList.add('on'); }));
        el.addEventListener('click', event => { if (event.target === el) closeLayer(el); });
        el.querySelector('.mc-close')?.addEventListener('click', () => closeLayer(el));
        bindSheetDrag(el);
        return el;
    }
    function managePregameSheetFocus(el) {
        const sheet = el.querySelector('.mc-sheet');
        if (!sheet) return;
        const opener = document.activeElement;
        const background = [...document.body.children].filter(node => node !== el && !/^(SCRIPT|STYLE|LINK)$/.test(node.tagName)).map(node => [node,node.inert]);
        background.forEach(([node]) => { node.inert = true; });
        sheet.tabIndex = -1;
        sheet.setAttribute('role','dialog'); sheet.setAttribute('aria-modal','true');
        sheet.setAttribute('aria-label',sheet.querySelector('h3')?.textContent || 'Коллекция');
        sheet.focus({preventScroll:true});
        const keydown = event => {
            if (el.inert || el.dataset.closing) return;
            if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeLayer(el); }
            if (event.key !== 'Tab') return;
            const controls = [...sheet.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')].filter(node => node.getClientRects().length);
            const first = controls[0], last = controls[controls.length-1];
            if (!first) { event.preventDefault(); return; }
            if (event.shiftKey && (document.activeElement === sheet || document.activeElement === first)) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && (document.activeElement === sheet || document.activeElement === last)) { event.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown',keydown,true);
        el.restoreSheetFocus = () => {
            document.removeEventListener('keydown',keydown,true);
            background.forEach(([node,inert]) => { node.inert = inert; });
            if (opener?.isConnected && !opener.closest('[inert]')) opener.focus({preventScroll:true});
            el.restoreSheetFocus = null;
        };
    }
    function setSheetDrag(el, offset) {
        const sheet = el.querySelector('.mc-sheet');
        if (!sheet) return;
        const distance = Math.max(0, Number(offset) || 0);
        const progress = Math.min(1, distance / Math.max(280, sheet.offsetHeight * .72));
        sheet.style.setProperty('--mc-sheet-offset', `${distance}px`);
        const pregame = document.body.classList.contains('monopoly-pregame');
        if (pregame) {
            el.style.setProperty('--mc-backdrop-opacity', String(1 - progress));
        } else {
            el.style.backgroundColor = `rgba(0,0,0,${(.54 * (1 - progress)).toFixed(3)})`;
            el.style.backdropFilter = `blur(${(13 * (1 - progress)).toFixed(2)}px)`;
            el.style.webkitBackdropFilter = `blur(${(13 * (1 - progress)).toFixed(2)}px)`;
        }
    }
    function resetSheetDrag(el) {
        const sheet = el.querySelector('.mc-sheet');
        el.classList.remove('mc-dragging');
        sheet?.style.removeProperty('--mc-sheet-offset');
        el.style.removeProperty('background-color');
        el.style.removeProperty('backdrop-filter');
        el.style.removeProperty('-webkit-backdrop-filter');
        el.style.removeProperty('--mc-backdrop-opacity');
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
        sheet.addEventListener('pointercancel', event => { if (event.pointerType === 'mouse') { drag = null; resetSheetDrag(el); } });
    }
    function closeLayer(el) {
        if (!el || el.dataset.closing) return;
        el.dataset.closing = 'true';
        el.restoreSheetFocus?.();
        if (document.body.classList.contains('monopoly-pregame')) el.inert = true;
        el.classList.remove('mc-dragging');
        requestAnimationFrame(() => el.classList.remove('on'));
        setTimeout(() => el.remove(), 540);
    }
    function closeLayers() { [...document.querySelectorAll('.mc-layer,.mc-roulette-layer')].reverse().forEach(el => { el.restoreSheetFocus?.(); el.remove(); }); }

    function loadoutAt(tileId) {
        return (current?.loadout || []).find(item => Number(item.tile_id) === Number(tileId)) || null;
    }
    function boardPreviewHtml(skin, equipped) {
        const D = global.MonopolyDataV2;
        if (!D?.TILES || !global.BoardUI?.placeOf) return '';
        const compatible = new Map(skin.compatibleTiles.map((tile, index) => [Number(tile), index + 1]));
        const cells = D.TILES.map(tile => {
            const pos = global.BoardUI.placeOf(tile.i);
            const candidate = compatible.get(tile.i);
            const selected = Number(equipped?.tile_id) === tile.i;
            const occupied = candidate ? loadoutAt(tile.i) : null;
            const color = tile.group && D.GROUPS?.[tile.group]?.color || '#3b3d46';
            const style = `grid-row:${pos.r};grid-column:${pos.c};--tile-color:${esc(color)}`;
            if (!candidate) return `<i class="mc-board-cell${pos.corner ? ' corner' : ''}" style="${style}"></i>`;
            return `<button type="button" class="mc-board-cell candidate${selected ? ' selected' : ''}${occupied ? ' occupied' : ''}" style="${style}"
                data-equip-tile="${tile.i}" aria-label="${esc(TILE_NAMES[tile.i] || 'Поле ' + tile.i)}${occupied?.skin ? ': ' + esc(occupied.skin.name) : ''}">
                ${occupied?.skin ? logoHtml(occupied.skin, 'mc-board-logo') : `<b>${candidate}</b>`}
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
            <div class="mc-sheet-head"><h3>${duplicate ? 'Повторка' : 'Компания'}</h3><button class="mc-close" aria-label="Закрыть"></button></div>
            <div class="mc-detail-top"><div class="mc-detail-img">${logoHtml(skin)}</div>
                <div class="mc-detail-copy"><b>${RARITY[skin.rarity]?.[0] || skin.rarity}</b><h4>${esc(skin.name)}</h4>
                <p>${duplicate ? `Первый экземпляр уже хранится в коллекции. Этот можно обменять на ${skin.exchangeValue} монет.` : `${esc(skin.groupName)} · +${skin.bonusBps / 100}% ко всем уровням аренды после сбора монополии.`}</p></div></div>
            ${duplicate ? '' : `<div class="mc-section-title"><b>Расположение на карте</b><span>без перехода в игру</span></div>
            ${boardPreviewHtml(skin, equipped)}
            <div class="mc-section-title"><b>Выберите поле</b><span>занятые слоты отмечены</span></div>
            <div class="mc-map">${skin.compatibleTiles.map(tile => {
                const occupied = loadoutAt(tile);
                const selected = Number(equipped?.tile_id) === Number(tile);
                return `<button data-equip-tile="${tile}" class="${selected ? 'on equipped' : ''}${occupied ? ' occupied' : ''}" ${selected ? 'disabled' : ''}>
                    <span class="mc-map-logo">${occupied?.skin ? logoHtml(occupied.skin) : '<i aria-hidden="true"></i>'}</span>
                    <span class="mc-map-copy"><b>${esc(TILE_NAMES[tile] || 'Поле ' + tile)}</b><small>${occupied?.skin ? `${selected ? 'Установлена' : 'Занято'} · ${esc(occupied.skin.name)}` : 'Сейчас оригинал'}</small></span>
                    <span class="mc-map-action">${selected ? '✓' : occupied ? 'Заменить' : 'Выбрать'}</span>
                </button>`;
            }).join('')}</div>`}
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
    function cubicBezierProgress(x1, y1, x2, y2, progress) {
        const sample = (a, b, t) => 3 * a * (1 - t) * (1 - t) * t + 3 * b * (1 - t) * t * t + t * t * t;
        const slope = (a, b, t) => 3 * a * (1 - t) * (1 - 3 * t) + 3 * b * t * (2 - 3 * t) + 3 * t * t;
        let t = Math.max(0, Math.min(1, progress));
        for (let i = 0; i < 5; i++) {
            const dx = sample(x1, x2, t) - progress;
            const d = slope(x1, x2, t);
            if (Math.abs(d) < 1e-5) break;
            t = Math.max(0, Math.min(1, t - dx / d));
        }
        return sample(y1, y2, t);
    }
    const ROULETTE_DURATION = 9200;
    const ROULETTE_EASING = [.08, .74, .14, 1];
    function trackRouletteHaptics(animation, geometry) {
        let frame = 0, previousCell = null, lastPulse = 0;
        const tick = now => {
            if (!animation || animation.playState === 'idle') return;
            const time = Math.max(0, Math.min(geometry.duration, Number(animation.currentTime) || 0));
            const progress = cubicBezierProgress(...ROULETTE_EASING, time / geometry.duration);
            const x = geometry.start + (geometry.destination - geometry.start) * progress;
            const cell = Math.floor((geometry.center - x) / geometry.step);
            /* Telegram haptics crosses a native bridge. Capping the pulse rate keeps
               the reel on the compositor thread even on older iPhones/iPads. */
            if (previousCell != null && cell !== previousCell && now - lastPulse >= 40) {
                rouletteHaptic();
                lastPulse = now;
            }
            previousCell = cell;
            if (time < geometry.duration && animation.playState !== 'finished') frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }
    function playRoulette(overlay, result) {
        const target = 58;
        const items = Array.from({ length: 66 }, weightedSkin);
        items[target] = result.skin;
        items.forEach(skin => preloadLogo(skin.asset));
        overlay.innerHTML = `<div class="mc-roulette-card"><h2>Открываем кейс</h2><div class="mc-reel-window"><div class="mc-reel">${items.map((skin, index) => `<div class="mc-reel-item" data-index="${index}" data-rarity="${skin.rarity}" data-layout="${skin.layout || 'badge'}"><div class="mc-reel-logo">${logoHtml(skin)}</div><span class="mc-reel-name">${esc(skin.name)}</span></div>${index < items.length - 1 ? '<i class="mc-reel-separator" aria-hidden="true"></i>' : ''}`).join('')}</div></div></div>`;
        const reel = overlay.querySelector('.mc-reel');
        const reelWindow = overlay.querySelector('.mc-reel-window');
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const windowRect = overlay.querySelector('.mc-reel-window').getBoundingClientRect();
            const item = reel.querySelector(`[data-index="${target}"]`);
            const itemWidth = item.getBoundingClientRect().width;
            const separatorWidth = reel.querySelector('.mc-reel-separator')?.getBoundingClientRect().width || 0;
            const winningZoneStart = item.offsetLeft - separatorWidth / 2;
            const landingOffset = winningZoneStart + Math.random() * (itemWidth + separatorWidth);
            const destination = windowRect.width / 2 - landingOffset;
            const start = Math.min(70, windowRect.width * .18);
            const duration = ROULETTE_DURATION;
            reelWindow.classList.add('is-spinning');
            const animation = reel.animate([
                { transform:`translate3d(${start}px,0,0)` },
                { transform:`translate3d(${destination}px,0,0)` },
            ], { duration, easing:`cubic-bezier(${ROULETTE_EASING.join(',')})`, fill:'forwards' });
            const stopHaptics = trackRouletteHaptics(animation, {
                duration, start, destination, center:windowRect.width / 2,
                step:itemWidth + separatorWidth,
            });
            animation.onfinish = () => {
                stopHaptics();
                reelWindow.classList.remove('is-spinning');
                resultHaptic();
                setTimeout(() => { overlay.remove(); showWin(result, false); }, 620);
            };
        }));
    }
    function showWin(opening, pending) {
        const skin = opening.skin;
        const id = opening.opening_id || opening.id;
        const overlay = document.createElement('div');
        overlay.className = 'mc-roulette-layer on';
        overlay.innerHTML = `<div class="mc-roulette-card mc-win" data-rarity="${skin.rarity}"><div class="mc-win-art">${logoHtml(skin)}</div>
            <small>${RARITY[skin.rarity]?.[0] || skin.rarity}</small><h2>${esc(skin.name)}</h2><p>${esc(skin.groupName)} · +${skin.bonusBps / 100}% к аренде</p>
            <button class="mc-primary">Принять</button></div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('.mc-primary').onclick = async () => {
            if (!id) return;
            try { await request('/api/monopoly/cases/claim', { method:'POST', body:JSON.stringify({ openingId:id }) }); overlay.remove(); busy = false; activeTab = 'cases'; await refresh(); }
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
        const overlay = layer('<div class="mc-sheet"><div class="mc-grabber"></div><div class="mc-sheet-head"><h3>Профиль игрока</h3><button class="mc-close" aria-label="Закрыть"></button></div><div class="mc-spinner"></div></div>');
        try {
            const data = await request('/api/monopoly/collection/player/' + encodeURIComponent(id));
            const rating = data.rating || {}, inv = data.inventory || [], user = data.user || {};
            const stats = otherStats(user);
            overlay.querySelector('.mc-sheet').innerHTML = `<div class="mc-grabber"></div><div class="mc-sheet-head"><h3>Профиль игрока</h3><button class="mc-close" aria-label="Закрыть"></button></div>
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
