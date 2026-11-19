/* Spark owner-only dashboard. Data is rendered as text and kept in memory while open. */
(function (root) {
    'use strict';

    const GAMES = {
        bb: ['Block Blast', 'block-blast'], saper: ['Сапёр', 'minesweeper'], tower: ['Башня', 'tower'],
        sudoku: ['Судоку', 'sudoku'], checkers: ['Шашки', 'checkers'], chess: ['Шахматы', 'chess'],
        nardy: ['Нарды', 'nardy'], wordle: ['Wordle', 'wordle'], monopoly: ['Монополия', 'monopoly'],
        ttt: ['Крестики-нолики'], rps: ['КНБ'], sea: ['Морской бой'],
    };
    const LABELS = { overview: 'Обзор', players: 'Игроки', matches: 'Матчи', feed: 'Журнал' };
    const SECTIONS = {
        games: 'Список игр', top: 'Топы', top_game: 'Рейтинг игры', tournaments: 'История турниров',
        profile: 'Профиль', profile_stats: 'Статистика профиля', titles: 'Титулы', settings: 'Настройки',
        language: 'Язык', privacy: 'Конфиденциальность', referrals: 'Реферальная программа', streak: 'Серия дней',
        bb_menu: 'Меню Block Blast', chess_menu: 'Меню шахмат', nardy_menu: 'Меню нард', checkers_menu: 'Меню шашек',
        sudoku_menu: 'Меню судоку', saper_menu: 'Меню сапёра', monopoly_menu: 'Меню «Монополии»',
    };
    const FEED_FILTERS = [['Все', 'all'], ['Разделы', 'sections'], ['Игры', 'games'], ['Матчи', 'matches'], ['Команды', 'inline']];
    const ICONS = {
        back: 'M14 6 8 12l6 6', arrow: 'm9 6 6 6-6 6',
        refresh: 'M5.24 10.19A7 7 0 0 1 17.36 7.50M18.76 13.81A7 7 0 0 1 6.64 16.50',
        chart: 'M5 19v-5m5 5V9m5 10v-7m5 7V5', players: 'M16 20v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1m16 0v-1a4 4 0 0 0-3-3.9M13 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3-2.8a3 3 0 0 1 0 5.6',
        game: 'M7.5 6.3h9c2.2 0 3.6 1.5 4.1 3.8l1.2 5.5c.5 2.7-2.2 4.2-4 2.4l-2.3-2.3h-7L6.2 18c-1.8 1.8-4.5.3-4-2.4l1.2-5.5c.5-2.3 1.9-3.8 4.1-3.8Z',
        list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
        chat: 'M5 18 3 21v-6a7 7 0 0 1 0-9c3-4 13-4 16 0a7 7 0 0 1 0 9c-3 3-8 3-12 2Zm3-8h.01m4 0h.01m4 0h.01',
        bolt: 'm13 2-8 12h6l-1 8 8-12h-6z', clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-5v5l3 2',
        x: 'm7 7 10 10M17 7 7 17', search: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-1.8 4.2L20 20',
        copy: 'M9 8V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3M6 9h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z',
    };
    const EVENT_LABELS = {
        app_open: 'Открыл Spark', app_reconnect: 'Соединение восстановлено', app_hide: 'Свернул приложение', app_resume: 'Вернулся в Spark', app_close: 'Завершил сеанс',
        connection_lost: 'Соединение прервалось', section_enter: 'Открыл раздел', section_leave: 'Вышел из раздела',
        game_enter: 'Открыл игру', game_leave: 'Вышел из игры', game_switch: 'Переключил игру',
        match_start: 'Начал матч', match_end: 'Завершил матч', match_disconnect: 'Потерял связь в матче', match_reconnect: 'Вернулся в матч',
        inline_command: 'Отправил inline-команду',
    };
    const INLINE_LABELS = { invite: 'Отправил приглашение', top: 'Поделился топом', duel_move: 'Отправил ход в дуэли', duel_view: 'Открыл доску в чате' };
    const CHAT_LABELS = { sender: 'Избранное', private: 'Личный чат', group: 'Группа', supergroup: 'Группа', channel: 'Канал', bot: 'Чат со Spark' };
    const RESULTS = { win: 'Победа', loss: 'Поражение', draw: 'Ничья', aborted: 'Матч прерван' };
    const REASONS = { resign: 'Сдача', timeout: 'Вышло время', abandon: 'Игрок не вернулся', inactive: 'Долгая пауза', checkmate: 'Мат', stalemate: 'Пат' };
    const stats = {
        bb: [['bb_best_score', 'Рекорд'], ['bb_total_games', 'Партий']], saper: [['saper_wins', 'Побед'], ['saper_total', 'Партий'],
            ...[6, 8, 10, 15].map(size => [`saper_best_${size}`, `${size}×${size}`, ' с'])],
        tower: [['tower_best', 'Рекорд'], ['tower_combo', 'Макс. комбо']], sudoku: [['sudoku_wins', 'Побед']],
        checkers: [['checkers_wins_pve', 'Побед'], ['checkers_points', 'Очков'], ['checkers_total', 'Партий']], wordle: [['wordle_wins', 'Побед']],
    };
    const RATING_CATEGORIES = { bullet: 'Пуля', blitz: 'Блиц', rapid: 'Рапид', classical: 'Классика', long: 'Длинные', short: 'Короткие' };
    const nfmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
    const shortTime = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const dayFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
    const dateFmt = new Intl.DateTimeFormat('ru-RU', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const relFmt = new Intl.RelativeTimeFormat('ru-RU', { numeric: 'auto' });
    const nf = value => nfmt.format(Math.max(0, Number(value) || 0));
    const gameName = key => GAMES[key]?.[0] || '';
    const sectionName = key => Object.hasOwn(SECTIONS, key) ? SECTIONS[key] : '';
    const placeName = live => gameName(live?.game) || sectionName(live?.section) || 'В Spark';
    const timeLabel = at => at ? shortTime.format(new Date(at)) : '—';
    const dateLabel = at => at ? dateFmt.format(new Date(at)) : '—';
    const dateKey = at => new Date(at).toDateString();
    const uidValid = value => /^[1-9]\d{0,15}$/.test(String(value || ''));
    const el = (tag, cls, content) => {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (content != null) node.textContent = content;
        return node;
    };
    function icon(name) {
        const namespace = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(namespace, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS(namespace, 'path');
        path.setAttribute('d', ICONS[name] || ICONS.bolt);
        svg.append(path);
        if (name === 'refresh') {
            const arrows = document.createElementNS(namespace, 'path');
            arrows.setAttribute('d', 'M19.03 9.49L19.28 5.89L15.45 9.11ZM4.97 14.51L4.72 18.11L8.55 14.89Z');
            arrows.setAttribute('fill', 'currentColor');
            arrows.setAttribute('stroke-width', '.6');
            svg.append(arrows);
            const glyph = el('span', 'refresh-glyph');
            glyph.append(svg);
            return glyph;
        }
        if (name === 'game') {
            svg.classList.add('pa-controller-icon');
            path.setAttribute('fill', 'currentColor');
            path.setAttribute('fill-opacity', '.2');
            const controls = document.createElementNS(namespace, 'path');
            controls.setAttribute('d', 'M8 9.5v4.2m-2.1-2.1h4.2m6.2-2.1h.01m2 2.1h.01m-2 2.1h.01m-2-2.1h.01');
            controls.setAttribute('stroke-width', '2');
            svg.append(controls);
        }
        return svg;
    }
    function btn(label, action, value = '', cls = '', symbol) {
        const node = el('button', cls);
        node.type = 'button';
        node.dataset.paAction = action;
        if (value !== '') node.dataset.paValue = value;
        if (symbol) node.append(icon(symbol));
        if (label) node.append(document.createTextNode(label));
        return node;
    }
    function iconButton(name, label, action, cls = '') {
        const node = btn('', action, '', `pa-icon-button ${cls}`, name);
        node.setAttribute('aria-label', label);
        node.title = label;
        return node;
    }
    function labelOf(person) {
        return person?.display_name || person?.name || (person?.handle ? `@${person.handle}` : person?.uid ? `Игрок ${person.uid}` : person?.bot ? 'Бот' : 'Гость');
    }
    function duration(ms) {
        if (!(Number(ms) > 0)) return '';
        const seconds = Math.floor(ms / 1000);
        if (!seconds) return '<1 с';
        const min = Math.floor(seconds / 60);
        const hours = Math.floor(min / 60);
        return [hours && `${nf(hours)} ч`, min % 60 && `${min % 60} мин`, !hours && seconds % 60 && `${seconds % 60} с`].filter(Boolean).join(' ');
    }
    function recency(at) {
        if (!at) return 'Нет истории';
        const minutes = Math.max(0, Math.floor((Date.now() - new Date(at)) / 60_000));
        if (minutes < 1) return 'Только что';
        if (minutes < 60) return relFmt.format(-minutes, 'minute');
        if (minutes < 1440) return relFmt.format(-Math.floor(minutes / 60), 'hour');
        return relFmt.format(-Math.floor(minutes / 1440), 'day');
    }
    function chatLabel(chat, empty = 'Чат не указан') {
        if (!chat) return empty;
        return [CHAT_LABELS[chat.type] || 'Чат', chat.title || (chat.ref ? `№ ${chat.ref}` : '')].filter(Boolean).join(' · ');
    }
    function avatar(person) {
        const name = labelOf(person);
        const node = el('span', 'pa-avatar', [...name.split(/\s+/).slice(0, 2).map(s => [...s][0] || '')].join('').toUpperCase());
        node.style.setProperty('--pa-hue', (Number(person.uid?.slice(-3)) || 211) % 82 + 178);
        node.setAttribute('aria-hidden', 'true');
        return node;
    }
    function gameIcon(game) {
        const node = el('span', 'pa-game-icon');
        const filename = GAMES[game]?.[1];
        if (filename) {
            const img = el('img');
            img.alt = '';
            img.loading = 'lazy';
            img.src = `assets/game-icons/${filename}.png`;
            node.append(img);
        } else node.append(icon('game'));
        return node;
    }
    function sectionTitle(label, extra) {
        const header = el('div', 'pa-section-head');
        header.append(el('h2', '', label));
        if (extra) header.append(extra);
        return header;
    }
    function liveDot(text, online = true) {
        const badge = el('span', `pa-live${online ? ' is-live' : ''}`, text);
        return badge;
    }

    /** Horizontal drag starts only after a gesture, so taps and scrolling keep their native behavior. */
    function bindScrub(surface, move, finish) {
        let drag = null;
        let clickedAfterDrag = false;
        surface.addEventListener('pointerdown', event => {
            if (event.button !== 0 || !event.isPrimary) return;
            drag = { id: event.pointerId, x: event.clientX, y: event.clientY, active: false };
        });
        surface.addEventListener('pointermove', event => {
            if (!drag || event.pointerId !== drag.id) return;
            if (event.pointerType === 'mouse' && event.buttons === 0) { settle(event); return; }
            const dx = event.clientX - drag.x;
            const dy = event.clientY - drag.y;
            if (!drag.active) {
                if (Math.abs(dy) > 7 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
                if (Math.abs(dx) < 6) return;
                drag.active = true;
                surface.setPointerCapture(event.pointerId);
                surface.classList.add('is-scrubbing');
            }
            move(event, dx);
        });
        function settle(event) {
            if (!drag || event.pointerId !== drag.id) return;
            const active = drag.active;
            drag = null;
            if (!active) return;
            surface.classList.remove('is-scrubbing');
            clickedAfterDrag = true;
            setTimeout(() => { clickedAfterDrag = false; }, 0);
            finish?.(event.type !== 'pointerup');
        }
        surface.addEventListener('pointerup', settle);
        surface.addEventListener('pointercancel', settle);
        surface.addEventListener('click', event => {
            if (clickedAfterDrag) { event.preventDefault(); event.stopPropagation(); }
        }, true);
    }

    function create(screen, opts) {
        let visible = false;
        let tab = 'overview';
        let trail = [];
        let sort = 'recent';
        let filter = 'all';
        let playerFilter = 'all';
        let query = '';
        let data = null;
        let player = null;
        let error = '';
        let controller = null;
        let timer = null;
        let searchTimer = null;
        let closeTimer = null;
        let chartPoint = -1;
        const uid = () => trail.at(-1) || '';

        const header = el('header', 'pa-header');
        const back = iconButton('back', 'Назад', 'back', 'back-btn pa-back');
        const heading = el('h1', 'pa-heading', 'Сводка игроков');
        heading.tabIndex = -1;
        const refresh = iconButton('refresh', 'Обновить', 'refresh');
        const glyph = refresh.firstElementChild;
        const stopSpin = () => refresh.classList.remove('is-spinning');
        glyph.addEventListener('animationiteration', () => { if (!refresh.disabled) stopSpin(); });
        glyph.addEventListener('animationcancel', stopSpin);
        header.append(back, heading, refresh);
        const nav = el('nav', 'pa-nav');
        nav.setAttribute('aria-label', 'Разделы сводки');
        nav.append(el('span', 'pa-nav-glider'));
        const icons = ['chart', 'players', 'game', 'list'];
        const tabs = Object.keys(LABELS);
        Object.entries(LABELS).forEach(([key, label], i) => nav.append(btn(label, 'tab', key, 'pa-nav-item', icons[i])));
        const scroll = el('div', 'pa-scroll');
        const frame = el('div', 'pa-frame');
        const controls = el('div', 'pa-controls');
        const searchBox = el('div', 'pa-search');
        const input = el('input');
        input.type = 'search'; input.maxLength = 80; input.autocomplete = 'off';
        input.placeholder = 'Имя, @имя или Telegram ID';
        input.setAttribute('aria-label', 'Поиск игрока');
        const clear = iconButton('x', 'Очистить поиск', 'clear');
        searchBox.append(icon('search'), input, clear);
        const sortBar = el('div', 'pa-filters');
        sortBar.append(btn('Недавние', 'sort', 'recent'), btn('Новые', 'sort', 'new'), btn('Онлайн', 'sort', 'online'));
        const filterBar = el('div', 'pa-filters');
        filterBar.append(...FEED_FILTERS.map(([label, value]) => btn(label, 'filter', value)));
        controls.append(searchBox, sortBar, filterBar);
        const content = el('div', 'pa-content');
        const announcement = el('div', 'pa-sr');
        announcement.setAttribute('role', 'status');
        frame.append(controls, content);
        scroll.append(frame);
        screen.classList.toggle('pa-ios', root.Telegram?.WebApp?.platform === 'ios');
        screen.replaceChildren(header, nav, scroll, announcement);

        function updateChrome() {
            const detail = !!uid();
            heading.textContent = detail ? 'Игрок' : tab === 'overview' ? 'Сводка игроков' : LABELS[tab];
            heading.removeAttribute('title');
            nav.hidden = detail;
            nav.style.setProperty('--pa-tab', tabs.indexOf(tab));
            for (const node of nav.querySelectorAll('button')) node.setAttribute('aria-pressed', String(node.dataset.paValue === tab));
            searchBox.hidden = detail || tab !== 'players';
            sortBar.hidden = searchBox.hidden;
            filterBar.hidden = detail || tab !== 'feed';
            controls.hidden = searchBox.hidden && filterBar.hidden;
            clear.hidden = !input.value;
            for (const node of sortBar.children) node.setAttribute('aria-pressed', String(node.dataset.paValue === sort));
            for (const node of filterBar.children) node.setAttribute('aria-pressed', String(node.dataset.paValue === filter));
        }

        async function request(route, params, signal) {
            const url = new URL(`${opts.endpoint}/${route}`);
            for (const [key, value] of Object.entries(params || {})) if (value != null && value !== '') url.searchParams.set(key, value);
            const response = await fetch(url.toString(), { headers: opts.auth(), signal, cache: 'no-store' });
            if (!response.ok) throw Object.assign(new Error('request_failed'), { status: response.status });
            return response.json();
        }

        async function load({ more = false, quiet = false } = {}) {
            if (!visible || (more && (controller || data?.next == null))) return;
            controller?.abort();
            const current = new AbortController();
            controller = current;
            const selected = uid();
            refresh.disabled = true;
            if (!quiet && !more) { error = ''; render(true); }
            try {
                let next;
                const cursor = more ? data.next : null;
                if (selected) {
                    const feedReq = request('feed', { uid: selected, kind: playerFilter, ...cursor }, current.signal);
                    if (more || (player?.uid === selected && !quiet)) next = await feedReq;
                    else {
                        const result = await Promise.all([request(`player/${selected}`, null, current.signal), feedReq]);
                        if (current !== controller) return;
                        [player, next] = result;
                    }
                } else if (tab === 'overview') next = await request('overview', null, current.signal);
                else if (tab === 'players') next = await request('list', { sort, q: query, offset: cursor }, current.signal);
                else if (tab === 'matches') next = await request('matches', { offset: cursor }, current.signal);
                else next = await request('feed', { kind: filter, ...cursor }, current.signal);
                if (current !== controller) return;
                if (more) {
                    const known = new Set(data.rows.map(row => row.id || row.uid));
                    next.rows = [...data.rows, ...next.rows.filter(row => !known.has(row.id || row.uid))];
                }
                data = next;
                error = '';
                render(false, !quiet && !more);
            } catch (failure) {
                if (current !== controller || failure.name === 'AbortError') return;
                if ([401, 403].includes(failure.status)) {
                    data = player = null;
                    error = 'Открой Spark заново, чтобы подтвердить доступ.';
                } else if (!quiet || !data) error = failure.status === 404 ? 'Игрок пока не найден.' : 'Сводка временно недоступна.';
                if (error) render();
            } finally {
                if (current === controller) {
                    controller = null;
                    refresh.disabled = false;
                    if (refresh.classList.contains('is-spinning') && getComputedStyle(glyph).animationName === 'none') stopSpin();
                }
            }
        }

        function empty(title, text = '', symbol = 'list') {
            const card = el('div', 'pa-empty pa-card');
            card.append(icon(symbol), el('strong', '', title));
            if (text) card.append(el('p', '', text));
            return card;
        }
        function playerRow(person) {
            const row = btn('', 'player', person.uid, 'pa-player-row');
            const desc = el('span', 'pa-player-text');
            desc.append(el('strong', '', labelOf(person)), el('small', '', person.handle ? `@${person.handle}` : `ID ${person.uid}`));
            const status = el('span', 'pa-player-status');
            if (person.live) {
                status.append(liveDot(placeName(person.live)));
                const liveDuration = duration(Date.now() - person.live.since);
                if (liveDuration) status.append(el('small', '', liveDuration));
            } else status.append(el('small', '', recency(person.last_at)));
            row.append(avatar(person), desc, status, icon('arrow'));
            return row;
        }
        function playersBlock(rows) {
            const block = el('div', 'pa-list pa-card');
            for (const row of rows) block.append(playerRow(row));
            return block;
        }
        function chart(points) {
            const box = el('div', 'pa-card pa-chart');
            const info = el('output', 'pa-chart-info');
            const columns = el('div', 'pa-bars');
            const max = Math.max(1, ...points.map(p => Number(p.count) || 0));
            const selected = points[Math.min(Math.max(chartPoint, 0), points.length - 1)];
            const pointLabel = p => `${timeLabel(p.at)} · ${nf(p.count)}`;
            for (let i = 0; i < points.length; i++) {
                const point = points[i];
                const column = btn('', 'chart', i, 'pa-column');
                column.setAttribute('aria-label', pointLabel(point));
                column.setAttribute('aria-pressed', String(i === chartPoint));
                const bar = el('span');
                bar.style.setProperty('--pa-height', `${100 * (Number(point.count) || 0) / max}%`);
                column.append(bar);
                columns.append(column);
            }
            info.textContent = chartPoint >= 0 ? pointLabel(selected) : 'За 24 часа';
            bindScrub(columns, event => {
                const bounds = columns.getBoundingClientRect();
                const at = Math.floor((event.clientX - bounds.left) * points.length / bounds.width);
                selectPoint(Math.min(points.length - 1, Math.max(0, at)));
            });
            columns.addEventListener('keydown', event => {
                const button = event.target.closest('.pa-column');
                if (!button || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
                const from = Number(button.dataset.paValue);
                const next = Math.max(0, Math.min(points.length - 1, from + (event.key === 'ArrowRight' ? 1 : -1)));
                event.preventDefault();
                selectPoint(next);
                columns.children[next]?.focus();
            });
            const axis = el('div', 'pa-chart-axis');
            axis.append(el('span', '', timeLabel(points[0]?.at)), el('span', '', timeLabel(points[11]?.at)), el('span', '', timeLabel(points.at(-1)?.at)));
            box.append(info, columns, axis);
            return box;
        }
        function renderOverview() {
            const hero = el('div', 'pa-hero');
            const heroMain = el('div', 'pa-hero-main');
            heroMain.append(el('span', 'pa-hero-label', 'Всего игроков'), el('strong', 'pa-total', nf(data.total)));
            const now = btn('', 'online', '', 'pa-hero-live');
            now.append(liveDot('Онлайн', data.online > 0), el('strong', '', nf(data.online)), icon('arrow'));
            const heroFoot = el('div', 'pa-hero-foot', `${nf(data.playing)} в играх · ${nf(data.active_matches)} активных матчей`);
            hero.append(heroMain, now, heroFoot);
            content.append(hero, sectionTitle('Уникальные посетители'));
            const metrics = el('div', 'pa-metrics');
            for (const [label, value, action] of [
                ['За час', data.unique_hour], ['За 24 часа', data.unique_day], ['За 7 дней', data.unique_week], ['За 30 дней', data.unique_month],
                ['Новые за 24 ч', data.new_day, 'new'], ['Команды за 24 ч', data.inline_day, 'commands'],
            ]) {
                const card = action ? btn('', action, '', 'pa-card pa-metric is-action') : el('div', 'pa-card pa-metric');
                const bottom = el('div', 'pa-metric-value');
                bottom.append(el('strong', '', nf(value)));
                if (action) bottom.append(icon('arrow'));
                card.append(el('span', '', label), bottom);
                metrics.append(card);
            }
            content.append(metrics, sectionTitle('Посетители по часам'));
            if (data.hours?.length) content.append(chart(data.hours));
            content.append(sectionTitle('Во что играют', btn('Все онлайн', 'online', '', 'pa-link', 'arrow')));
            const games = Object.entries(data.live_games || {}).sort((a, b) => b[1] - a[1]);
            if (games.length) {
                const block = el('div', 'pa-live-games pa-card');
                for (const [game, count] of games) {
                    const row = el('div', 'pa-live-game');
                    row.append(gameIcon(game), el('strong', '', gameName(game)), el('span', '', nf(count)));
                    block.append(row);
                }
                content.append(block);
            } else content.append(empty('Сейчас никто не играет', '', 'game'));
            if (data.recent_online?.length) content.append(sectionTitle('В приложении'), playersBlock(data.recent_online.map(p => ({ ...p, live: p }))));
            const stamp = el('p', 'pa-updated', `Обновлено в ${timeLabel(data.at)}`);
            stamp.title = dateLabel(data.at);
            content.append(stamp);
        }
        function peopleList(people) {
            const group = el('div', 'pa-people');
            for (const person of people) {
                const name = labelOf(person);
                if (uidValid(person.uid)) group.append(btn(name, 'player', person.uid, 'pa-person-chip'));
                else group.append(el('span', 'pa-person-chip', name));
            }
            return group;
        }
        function matchCards(matches) {
            const block = el('div', 'pa-stack');
            for (const match of matches) {
                const card = el('article', 'pa-card pa-match');
                const title = el('div', 'pa-match-head');
                title.append(gameIcon(match.game), el('strong', '', gameName(match.game)), el('small', '', timeLabel(match.at)));
                card.append(title, peopleList(match.players));
                card.append(el('p', 'pa-meta', match.source === 'inline' ? chatLabel(match.chat, 'Игра в Telegram-чате') : 'Онлайн-партия'));
                block.append(card);
            }
            return block;
        }
        function eventTitle(row) {
            const title = (row.kind === 'inline_command' ? INLINE_LABELS[row.details?.action] : '') || EVENT_LABELS[row.kind] || 'Игровое событие';
            const game = gameName(row.game);
            return row.kind === 'game_switch' && row.details?.previous
                ? `${gameName(row.details.previous)} → ${game}`
                : [title, game || sectionName(row.details?.section)].filter(Boolean).join(' · ');
        }
        function timeline(rows, person = false) {
            const block = el('div', 'pa-timeline');
            let last = '';
            let group;
            for (const row of rows) {
                const day = dateKey(row.at);
                if (day !== last) {
                    group = el('div', 'pa-timeline-day pa-card');
                    group.append(el('h3', '', day === dateKey(Date.now()) ? 'Сегодня' : dayFmt.format(new Date(row.at))));
                    block.append(group);
                    last = day;
                }
                const item = el('article', 'pa-event');
                const when = el('time', 'pa-event-time', timeLabel(row.at)); when.dateTime = row.at;
                const point = el('span', `pa-event-point${row.kind.includes('disconnect') || row.kind === 'connection_lost' ? ' is-away' : ''}`);
                const text = el('div', 'pa-event-copy');
                if (!person) text.append(btn(labelOf({ ...row, display_name: row.name }), 'player', row.uid, 'pa-event-name'));
                text.append(el('strong', '', eventTitle(row)));
                const meta = row.details || {};
                if (meta.peers?.length) text.append(peopleList(meta.peers));
                const time = duration(meta.duration_ms);
                const active = duration(meta.active_ms);
                const appTime = duration(meta.app_duration_ms);
                const matchEvent = row.kind.startsWith('match_');
                const details = [RESULTS[meta.result], REASONS[meta.reason],
                    time && (row.game && !matchEvent ? `На экране игры ${time}` : time),
                    active && `Активно ${active}`, appTime && `В Spark ${appTime}`,
                    (meta.source === 'inline' || row.kind === 'inline_command') ? chatLabel(meta.chat, meta.legacy ? 'Из прежней статистики' : 'Telegram не передал чат') : ''].filter(Boolean);
                if (details.length) text.append(el('small', '', details.join(' · ')));
                item.append(when, point, text);
                group.append(item);
            }
            return block;
        }
        function playerStats(person) {
            const source = person.stats || {};
            const history = new Map((person.history?.games || []).map(row => [row.game, row]));
            const block = el('div', 'pa-card pa-game-stats');
            for (const game of Object.keys(GAMES)) {
                const fields = (stats[game] || []).filter(([key, , unit]) => Number(source[key]) > 0 && !(unit && Number(source[key]) === 9999))
                    .map(([key, label, unit = '']) => `${label} ${nf(source[key])}${unit}`);
                const play = duration(source[`playtime_${game}_ms`]);
                if (play) fields.unshift(`За всё время ${play}`);
                const sessions = history.get(game);
                if (sessions) {
                    const screenTime = duration(sessions.duration_ms);
                    const active = duration(sessions.active_ms);
                    fields.unshift(`Открытий ${nf(sessions.visits)}`,
                        ...(screenTime ? [`На экране ${screenTime}`] : []), ...(active ? [`Активно ${active}`] : []));
                }
                for (const category of person.ratings?.[game] || []) {
                    fields.push(`${RATING_CATEGORIES[category.cat] || 'Рейтинг'} ${nf(category.rating)} · побед ${nf(category.wins)} из ${nf(category.games)}`);
                }
                if (!fields.length) continue;
                const row = el('div', 'pa-game-stat');
                row.append(gameIcon(game), el('strong', '', gameName(game)), el('small', '', fields.join(' · ')));
                block.append(row);
            }
            if (Number(source.referral_count) > 0) block.append(el('div', 'pa-meta pa-referrals', `Приглашено игроков · ${nf(source.referral_count)}`));
            return block;
        }
        function renderVisitStats(history) {
            if (!history || (!history.visits && !history.app_duration_ms && !history.sections?.length)) return;
            const total = el('div', 'pa-card pa-session-total');
            total.append(el('strong', '', `Визитов ${nf(history.visits)}`));
            const appTime = duration(history.app_duration_ms);
            if (appTime) total.append(el('span', '', `В Spark ${appTime}`));
            content.append(sectionTitle('Посещения за 35 дней'), total);
            if (!history.sections?.length) return;
            const sections = el('div', 'pa-card pa-archive');
            for (const item of history.sections) {
                const label = sectionName(item.section);
                if (!label) continue;
                const row = el('div', 'pa-section-stat');
                const time = duration(item.duration_ms);
                row.append(el('strong', '', label),
                    el('small', '', [`Открытий ${nf(item.visits)}`, time].filter(Boolean).join(' · ')));
                sections.append(row);
            }
            if (sections.childElementCount) content.append(sectionTitle('Разделы за 35 дней'), sections);
        }
        function renderPlayer() {
            heading.textContent = labelOf(player);
            heading.title = labelOf(player);
            const card = el('div', 'pa-card pa-identity');
            const name = el('div', 'pa-identity-name');
            name.append(el('h2', '', labelOf(player)), el('span', '', player.handle ? `@${player.handle}` : `ID ${player.uid}`));
            const copy = iconButton('copy', 'Скопировать Telegram ID', 'copy');
            card.append(avatar(player), name, copy);
            const details = el('div', 'pa-identity-data');
            const liveDuration = player.live && duration(Date.now() - player.live.since);
            const status = player.live ? [placeName(player.live), liveDuration].filter(Boolean).join(' · ') : 'Вне приложения';
            details.append(liveDot(status, !!player.live));
            const dates = el('dl', 'pa-dates');
            for (const [label, value] of [['Первый визит', player.first_at], ['Последнее событие', player.last_at]]) {
                const wrap = el('div');
                wrap.append(el('dt', '', label), el('dd', '', dateLabel(value)));
                dates.append(wrap);
            }
            details.append(dates);
            card.append(details);
            content.append(card);
            if (player.active_matches?.length) content.append(sectionTitle('Текущие матчи'), matchCards(player.active_matches));
            renderVisitStats(player.history);
            const rows = playerStats(player);
            if (rows.childElementCount) content.append(sectionTitle('Игровая статистика'), rows);
            const profileFilters = el('div', 'pa-filters');
            for (const [label, value] of FEED_FILTERS) {
                const chip = btn(label, 'filter', value);
                chip.setAttribute('aria-pressed', String(value === playerFilter));
                profileFilters.append(chip);
            }
            content.append(sectionTitle('История за 35 дней'), profileFilters);
            content.append(data.rows.length ? timeline(data.rows, true) : empty('Событий пока нет'));
            if (playerFilter === 'all' && player.chess_archive?.length) {
                const archive = el('details', 'pa-card pa-archive');
                archive.append(el('summary', '', 'Архив шахмат'));
                for (const game of player.chess_archive) {
                    const opp = game.white_uid === player.uid ? { uid: game.black_uid, name: game.black_name } : { uid: game.white_uid, name: game.white_name };
                    const pair = el('div', 'pa-archive-row');
                    pair.append(el('time', '', dateLabel(game.ended_at)), peopleList([opp]));
                    archive.append(pair);
                }
                content.append(archive);
            }
        }
        function render(loading = false, animate = false) {
            content.replaceChildren();
            content.classList.toggle('pa-enter', animate);
            content.setAttribute('aria-busy', String(loading));
            if (loading) {
                const wait = el('div', 'pa-skeleton');
                for (let i = 0; i < 3; i++) wait.append(el('div', 'pa-card'));
                content.append(wait);
                announcement.textContent = 'Загрузка';
                return;
            }
            announcement.textContent = '';
            if (error) {
                const block = empty(error, '', 'bolt');
                block.append(btn('Повторить', 'refresh', '', 'pa-more'));
                content.append(block);
                return;
            }
            if (!data) return;
            if (uid() && player) renderPlayer();
            else if (tab === 'overview') renderOverview();
            else if (tab === 'players') content.append(data.rows.length ? playersBlock(data.rows) : empty(query ? 'Игроков не найдено' : 'Пока никого нет', '', 'players'));
            else if (tab === 'matches') {
                content.append(sectionTitle('Активные матчи', btn('История', 'match-feed', '', 'pa-link', 'arrow')));
                content.append(data.rows.length ? matchCards(data.rows) : empty('Сейчас нет активных матчей', '', 'game'));
            } else content.append(data.rows.length ? timeline(data.rows) : empty('Событий пока нет'));
            if (data.next != null) content.append(btn('Показать ещё', 'more', '', 'pa-more'));
        }

        function navigate() {
            clearTimeout(searchTimer);
            data = null;
            if (!uid() || player?.uid !== uid()) player = null;
            scroll.scrollTop = 0;
            updateChrome();
            void load();
        }
        function select(next, option) {
            if (next === tab && !option && !uid() && data) return;
            tab = next; trail = [];
            if (next === 'players') {
                sort = option || sort;
                if (option) input.value = '';
                query = input.value.trim();
            }
            if (next === 'feed') filter = option || 'all';
            navigate();
        }
        function backAction() {
            if (!trail.length) return close();
            trail.pop();
            playerFilter = 'all';
            navigate();
        }
        function refreshCurrent() {
            refresh.classList.add('is-spinning');
            player = null;
            void load();
        }
        function poll() {
            if (document.hidden || controller || !data || nav.classList.contains('is-scrubbing') || content.querySelector('.is-scrubbing')) return;
            const firstPage = data.rows?.length <= 25 && scroll.scrollTop < 60;
            if ((!uid() && tab === 'overview') || (firstPage && (uid() || tab === 'feed' || tab === 'matches' ||
                (tab === 'players' && sort === 'online' && !query)))) {
                void load({ quiet: true });
            }
        }
        function open() {
            if (visible) return;
            clearTimeout(closeTimer);
            visible = true;
            tab = 'overview'; trail = []; query = ''; input.value = ''; chartPoint = -1;
            screen.hidden = false;
            document.getElementById('view-profile').inert = true;
            requestAnimationFrame(() => { if (visible) { screen.classList.add('visible'); heading.focus({ preventScroll: true }); } });
            timer = setInterval(poll, 20_000);
            navigate();
        }
        function close() {
            visible = false;
            screen.classList.remove('visible');
            clearInterval(timer); clearTimeout(searchTimer);
            controller?.abort(); controller = null;
            refresh.disabled = false;
            stopSpin();
            data = player = null; trail = [];
            content.replaceChildren();
            document.getElementById('view-profile').inert = false;
            closeTimer = setTimeout(() => { if (!visible) screen.hidden = true; }, 380);
            opts.entry.focus({ preventScroll: true });
        }

        input.addEventListener('input', () => {
            clear.hidden = !input.value;
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => { query = input.value.trim(); navigate(); }, 240);
        });
        let swipeTab = 0;
        bindScrub(nav, (_, dx) => {
            swipeTab = Math.min(tabs.length - 1, Math.max(0, tabs.indexOf(tab) + dx / ((nav.clientWidth - 8) / tabs.length)));
            nav.style.setProperty('--pa-tab', swipeTab);
        }, cancelled => {
            const next = cancelled ? tab : tabs[Math.round(swipeTab)];
            if (next === tab) updateChrome();
            else { opts.haptic?.(); select(next); }
        });
        function selectPoint(index) {
            const selected = data?.hours?.[index];
            if (!selected || chartPoint === index) return;
            chartPoint = index;
            content.querySelector('.pa-chart-info').textContent = `${timeLabel(selected.at)} · ${nf(selected.count)}`;
            for (const col of content.querySelectorAll('.pa-column')) col.setAttribute('aria-pressed', String(Number(col.dataset.paValue) === index));
        }
        const actions = {
            back: backAction, refresh: refreshCurrent, tab: value => select(value), online: () => select('players', 'online'),
            new: () => select('players', 'new'), commands: () => select('feed', 'inline'), 'match-feed': () => select('feed', 'matches'),
            sort: value => { sort = value; navigate(); },
            filter: value => { if (uid()) playerFilter = value; else filter = value; navigate(); },
            player: value => { if (uidValid(value) && value !== uid()) { trail.push(value); playerFilter = 'all'; navigate(); } },
            clear: () => { query = input.value = ''; navigate(); input.focus(); },
            more: () => { void load({ more: true }); },
            chart: value => selectPoint(Number(value)),
            copy: () => {
                const value = uid();
                if (!value) return;
                navigator.clipboard?.writeText(value).then(() => { announcement.textContent = `Скопирован ID ${value}`; root.SparkToast?.show('ID скопирован'); }).catch(() => {});
            },
        };
        screen.addEventListener('click', event => {
            const control = event.target.closest('button[data-pa-action]');
            if (!control || control.disabled) return;
            opts.haptic?.();
            actions[control.dataset.paAction]?.(control.dataset.paValue);
        });
        document.addEventListener('keydown', event => {
            if (!visible) return;
            if (event.key === 'Escape') { event.preventDefault(); backAction(); return; }
            if (event.key !== 'Tab') return;
            const focusable = [...screen.querySelectorAll('button:not(:disabled), input, summary')]
                .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
            const first = focusable[0], last = focusable.at(-1);
            if (event.shiftKey && (document.activeElement === first || document.activeElement === heading)) {
                event.preventDefault(); last?.focus();
            } else if (!event.shiftKey && (document.activeElement === last || !screen.contains(document.activeElement))) {
                event.preventDefault(); first?.focus();
            }
        });
        return { open };
    }

    let dashboard = null;
    root.SparkPlayerAdmin = { open(opts) {
        if (!dashboard) dashboard = create(document.getElementById('playerAdminScreen'), opts);
        dashboard.open();
    } };
})(window);
