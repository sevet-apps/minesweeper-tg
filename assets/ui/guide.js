/* Spark: гайды по играм — кнопка «i» в шторке игры открывает обучение.
   Карточки как в знакомстве: сверху живая сцена (мини-доска, палец с
   касаниями и удержанием, «камера» плавно приближает и отдаляет), ниже
   заголовок, текст, точки и кнопка «Дальше», которая наполняется, пока
   читаешь. Сцены — HTML и CSS, а не видео: чёткие на любом экране, лёгкие
   и переводимые. Стили — assets/ui/guide.css. */
(function () {
    'use strict';
    if (window.SparkGuide) return;
    const BASE = new URL('.', document.currentScript?.src || location.href).href;
    const REDUCED = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const calm = () => REDUCED || document.body.classList.contains('lite-mode');
    const tg = window.Telegram?.WebApp;
    const haptic = kind => { try { if (localStorage.getItem('vibration') === 'false') return; const h = tg?.HapticFeedback; if (kind === 'select') h?.selectionChanged(); else h?.impactOccurred(kind || 'light'); } catch (_) {} };
    const lang = () => { try { return currentLang || 'ru'; } catch (_) { return 'ru'; } };   // eslint-disable-line no-undef
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const UI = {
        ru: { next: 'Дальше', play: 'Играть', close: 'Закрыть', guide: 'Как играть' },
        en: { next: 'Next', play: 'Play', close: 'Close', guide: 'How to play' },
    };
    const ui = key => (UI[lang()] || UI.en)[key];

    /* ---------- сценарий сцены ----------
       Сцена получает api: wait, tap, hold, drag, zoom, hide. Сценарий крутится
       по кругу, пока карточка открыта; уход с карточки его прерывает.

       Касание — как в промо-роликах Telegram (замерено покадрово по образцу и
       ускорено в 1,2 раза): «обруч» из матового стекла рождается на кнопке,
       дорастает до большого, коротко целится и резко сжимается вокруг кнопки —
       это нажатие, кнопка в этот миг подсвечивается и срабатывает. Обруч
       держится сжатым, пока интерфейс отвечает, и тает, расширяясь. Толщина
       ободка постоянная — сужается только радиус. Размер на экране всегда один
       (это палец, а не кнопка), между касаниями ничего не ездит. */
    const SPEED = 1.2;                                                   // всё в гайде на 20 % живее
    const TOUCH = { aim: 235, press: 50, after: 75, total: 605 };       // мс, уже с ускорением
    function touchRing(art, el, kind) {
        const a = art.getBoundingClientRect(), r = el.getBoundingClientRect();
        const ring = document.createElement('i');
        ring.className = `gd-touch is-${kind}`;
        ring.style.left = `${r.left - a.left + r.width / 2}px`;
        ring.style.top = `${r.top - a.top + r.height / 2}px`;
        ring.innerHTML = '<b class="gd-touch-arc"></b>';
        art.appendChild(ring);
        return ring;
    }
    function makeApi(art, token) {
        const cam = art.querySelector('.gd-cam');
        const finger = art.querySelector('.gd-finger');
        const alive = () => token.alive;
        const raw = ms => new Promise(resolve => setTimeout(resolve, calm() ? Math.min(ms, 60) : ms));
        const center = el => {
            const a = art.getBoundingClientRect(), r = el.getBoundingClientRect();
            return { x: r.left - a.left + r.width / 2, y: r.top - a.top + r.height / 2 };
        };
        const press = el => { el.classList.remove('gd-pressed'); void el.offsetWidth; el.classList.add('gd-pressed'); };
        const exact = async ms => { await raw(ms); if (!alive()) throw token; };
        const api = {
            alive,
            /** Паузы сценария идут на 20 % быстрее. */
            async wait(ms) { await exact(ms / SPEED); },
            /** Касание: обруч целится, резко сжимается — кнопка срабатывает — тает. */
            async tap(el) {
                if (calm()) { press(el); await exact(100); return; }
                const ring = touchRing(art, el, 'tap');
                setTimeout(() => ring.remove(), TOUCH.total + 40);
                await exact(TOUCH.aim + TOUCH.press);
                press(el);
                await exact(TOUCH.after);
            },
            /** Удержание: обруч сжимается и держится, по ободку бежит светлая дуга. */
            async hold(el, ms = 650) {
                const ring = touchRing(art, el, 'hold');
                ring.style.setProperty('--hold', `${Math.round(ms / SPEED)}ms`);
                await exact(TOUCH.aim + TOUCH.press);
                press(el);
                ring.classList.add('is-holding');
                await api.wait(ms);
                ring.classList.add('is-out');
                setTimeout(() => ring.remove(), 200);
            },
            /** Перетаскивание: сжатый обруч ведёт палец — только здесь он едет. */
            async drag(from, to, { ms = 650, carry = null } = {}) {
                const a = center(from), b = center(to);
                const dur = Math.round(ms / SPEED);
                finger.style.transitionDuration = '0ms';
                finger.style.transform = `translate(${a.x}px, ${a.y}px)`;
                finger.classList.remove('is-out');
                finger.classList.add('is-on');
                await exact(TOUCH.aim + TOUCH.press);
                finger.style.transitionDuration = `${calm() ? 0 : dur}ms`;
                finger.style.transform = `translate(${b.x}px, ${b.y}px)`;
                if (carry) { carry.style.transition = `transform ${dur}ms cubic-bezier(.45, 0, .25, 1)`; carry.style.transform = `translate(${b.x - a.x}px, ${b.y - a.y}px)`; }
                await exact(dur + 50);
                finger.classList.add('is-out');
                await exact(150);
                finger.classList.remove('is-on', 'is-out');
            },
            hide() { finger.classList.remove('is-on', 'is-out'); },
            /** «Камера» как в роликах: быстрый плавный переезд (крупно / общий план). */
            async zoom(el, scale = 1.8, ms = 560) {
                const dur = Math.round(ms / SPEED);
                cam.style.transitionDuration = `${calm() ? 0 : dur}ms`;
                art.classList.toggle('is-zoomed', !!el);   // подпись уходит, пока камера близко
                if (!el) { cam.style.transform = ''; await exact(dur); return; }
                const a = art.getBoundingClientRect(), r = el.getBoundingClientRect();
                const cx = r.left - a.left + r.width / 2, cy = r.top - a.top + r.height / 2;
                cam.style.transformOrigin = `${cx}px ${cy}px`;
                cam.style.transform = `translate(${a.width / 2 - cx}px, ${a.height / 2 - cy}px) scale(${scale})`;
                await exact(dur);
            },
        };
        return api;
    }

    /* ---------- сапёр ---------- */
    // поле 6×6: m — мина; цифры считаются сами
    const SAPER_MINES = ['0,4', '1,1', '3,5', '4,2', '5,5'];
    function saperBoard(stage, { open = [], flags = [] } = {}) {
        const n = 6, mines = new Set(SAPER_MINES);
        const count = (r, c) => { let k = 0; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && mines.has(`${r + dr},${c + dc}`)) k++; return k; };
        let html = '<div class="gd-saper">';
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
            const k = count(r, c), key = `${r},${c}`;
            html += `<i class="gd-cell${open.includes(key) ? ' is-open' : ''}${flags.includes(key) ? ' is-flag' : ''}" data-rc="${key}" data-n="${mines.has(key) ? 'm' : k}"><b>${mines.has(key) ? '' : k || ''}</b></i>`;
        }
        stage.innerHTML = html + '</div>';
        return {
            cell: (r, c) => stage.querySelector(`[data-rc="${r},${c}"]`),
            /** Открыть «волной» от клетки, как настоящий сапёр открывает пустые области. */
            async flood(api, r0, c0) {
                const seen = new Set([`${r0},${c0}`]), queue = [[r0, c0, 0]], order = [];
                while (queue.length) {
                    const [r, c, d] = queue.shift();
                    order.push([r, c, d]);
                    if (count(r, c) !== 0) continue;
                    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
                        const rr = r + dr, cc = c + dc, key = `${rr},${cc}`;
                        if (rr < 0 || cc < 0 || rr >= n || cc >= n || seen.has(key) || mines.has(key)) continue;
                        seen.add(key); queue.push([rr, cc, d + 1]);
                    }
                }
                for (const [r, c, d] of order) setTimeout(() => stage.querySelector(`[data-rc="${r},${c}"]`)?.classList.add('is-open'), d * 58);
                await api.wait(order.reduce((m, o) => Math.max(m, o[2]), 0) * 70 + 300);
            },
        };
    }
    // флажок и мина — те же, что в игре (ICON_FLAG, ICON_MINE в index.html)
    const FLAG = '<svg class="gd-flag" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>';
    const MINE = '<svg class="gd-mine" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2zm0 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm0-13a5 5 0 1 1 0 10 5 5 0 0 1 0-10z"/></svg>';
    /** Флажок поверх клетки, не трогая кольцо касания внутри неё. */
    const setFlag = cell => { cell.querySelector('b')?.remove(); cell.insertAdjacentHTML('afterbegin', FLAG); };
    const SAPER_OPEN = ['0,0', '1,0', '2,0', '3,0', '4,0', '5,0', '0,1', '2,1', '3,1', '4,1', '5,1', '0,2', '1,2', '2,2', '3,2', '5,2', '0,3', '1,3', '2,3', '3,3', '4,3', '5,3', '1,4', '2,4', '3,4', '4,4', '5,4', '0,5', '1,5', '2,5', '4,5'];

    const GUIDES = {
        saper: {
            theme: 'saper', play: () => { try { openGameModal('saper'); } catch (_) {} },   // eslint-disable-line no-undef
            pages: {
                ru: [
                    { label: 'Открывай', title: 'Открывай клетки', text: 'Нажми на клетку — она откроется. Первый ход всегда безопасный: мины расставляются после него.',
                      async scene(stage, api) {
                          const b = saperBoard(stage);
                          await api.wait(500);
                          await api.tap(b.cell(5, 0));
                          await b.flood(api, 5, 0);
                          api.hide();
                          await api.wait(1600);
                      } },
                    { label: 'Цифры', title: 'Цифры подсказывают', text: 'Цифра — сколько мин среди восьми соседних клеток. Если рядом с «1» закрыта всего одна клетка, мина — в ней.',
                      async scene(stage, api) {
                          const b = saperBoard(stage, { open: SAPER_OPEN.filter(k => k !== '0,4') });
                          await api.wait(500);
                          const one = b.cell(1, 4);
                          await api.zoom(one, 1.9);
                          one.classList.add('is-focus');
                          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) b.cell(1 + dr, 4 + dc)?.classList.add('is-near');
                          await api.wait(900);
                          b.cell(0, 4).classList.add('is-mine-guess');
                          b.cell(0, 4).insertAdjacentHTML('beforeend', MINE);
                          await api.wait(1500);
                          await api.zoom(null);
                          await api.wait(600);
                      } },
                    { label: 'Флажки', title: 'Отмечай мины флажком', text: 'Переключись на «Флаг» и нажми на клетку — или просто зажми её. Флажок не даст открыть мину случайно.',
                      async scene(stage, api) {
                          const b = saperBoard(stage, { open: SAPER_OPEN });
                          stage.insertAdjacentHTML('beforeend', `<div class="gd-toggle"><i class="gd-glider"></i><span>Копать</span><span>Флаг</span></div>`);
                          const toggle = stage.querySelector('.gd-toggle');
                          await api.wait(500);
                          await api.tap(toggle.children[2]);
                          toggle.classList.add('is-flag');
                          await api.wait(350);
                          await api.tap(b.cell(0, 4));
                          b.cell(0, 4).classList.add('is-flag');
                          setFlag(b.cell(0, 4));
                          await api.wait(600);
                          await api.tap(toggle.children[1]);
                          toggle.classList.remove('is-flag');
                          await api.wait(300);
                          await api.hold(b.cell(1, 1), 750);
                          b.cell(1, 1).classList.add('is-flag');
                          setFlag(b.cell(1, 1));
                          api.hide();
                          await api.wait(1500);
                      } },
                    { label: 'Победа', title: 'Открой всё — без мин', text: 'Открыты все безопасные клетки — победа. Таймер идёт с первого хода, лучшее время попадает в топ.',
                      async scene(stage, api) {
                          const b = saperBoard(stage, { open: SAPER_OPEN.filter(k => k !== '4,5'), flags: ['0,4', '1,1'] });
                          stage.insertAdjacentHTML('beforeend', '<div class="gd-timer"><b>00.000</b> c</div>');
                          ['0,4', '1,1'].forEach(k => { stage.querySelector(`[data-rc="${k}"]`).innerHTML = FLAG; });
                          const timer = stage.querySelector('.gd-timer b');
                          const t0 = performance.now();
                          let running = true;
                          const tick = () => { if (!running || !api.alive()) return; timer.textContent = ((performance.now() - t0) / 1000 + 36.2).toFixed(3); requestAnimationFrame(tick); };
                          tick();
                          await api.wait(700);
                          await api.tap(b.cell(4, 5));
                          b.cell(4, 5).classList.add('is-open');
                          running = false;
                          stage.querySelector('.gd-saper').classList.add('is-won');
                          stage.querySelector('.gd-timer').classList.add('is-done');
                          api.hide();
                          await api.wait(2400);
                      } },
                    { label: 'Поля', title: 'Выбирай размер поля', text: '6×6, 8×8, 10×10 или 15×15: чем больше поле, тем больше мин. Рекорды и топы — отдельно для каждого размера.',
                      async scene(stage, api) {
                          stage.innerHTML = `<div class="gd-sizes">${[['6×6', 5], ['8×8', 10], ['10×10', 15], ['15×15', 30]].map(([s, m], i) => `<button type="button" style="--i:${i}"><b>${s}</b><small>${m} мин</small></button>`).join('')}</div>`;
                          const items = stage.querySelectorAll('.gd-sizes button');
                          await api.wait(900);
                          for (const i of [1, 2, 3]) { await api.tap(items[i]); items.forEach((el, k) => el.classList.toggle('is-on', k === i)); await api.wait(500); }
                          api.hide();
                          await api.wait(1200);
                      } },
                ],
            },
        },
    };
    // английский текст сапёра — тот же сценарий
    GUIDES.saper.pages.en = GUIDES.saper.pages.ru.map((page, i) => ({ ...page, ...[
        { label: 'Open', title: 'Open the cells', text: 'Tap a cell to open it. The first move is always safe: mines are placed after it.' },
        { label: 'Numbers', title: 'Numbers are hints', text: 'A number tells how many mines touch that cell. If a “1” has only one closed neighbour, the mine is there.' },
        { label: 'Flags', title: 'Flag the mines', text: 'Switch to “Flag” and tap a cell — or just press and hold it. A flag keeps you from opening a mine by accident.' },
        { label: 'Win', title: 'Open every safe cell', text: 'Open all safe cells to win. The clock starts with your first move; your best time goes to the leaderboard.' },
        { label: 'Boards', title: 'Pick a board size', text: '6×6, 8×8, 10×10 or 15×15: bigger boards hide more mines. Records and tops are kept for each size.' },
    ][i] }));

    /* ---------- шторка ---------- */
    let el = null, index = 0, token = null, game = null, fillTimer = 0;
    const pagesOf = g => GUIDES[g].pages[lang()] || GUIDES[g].pages.ru;
    function close() {
        if (!el) return;
        if (token) token.alive = false;
        clearTimeout(fillTimer);
        const node = el;
        el = null;
        node.classList.remove('show');
        setTimeout(() => node.remove(), calm() ? 0 : 420);
    }
    function runScene(i) {
        if (token) token.alive = false;
        const card = el.querySelectorAll('.gd-card')[i];
        const art = card.querySelector('.gd-art');
        const stage = art.querySelector('.gd-stage');
        const my = token = { alive: true };
        const page = pagesOf(game)[i];
        const api = makeApi(art, my);
        (async () => {
            while (my.alive) {
                art.querySelector('.gd-cam').style.transform = '';
                art.classList.remove('is-zoomed');
                stage.classList.remove('is-drifting'); void stage.offsetWidth; stage.classList.add('is-drifting');
                api.hide();
                try { await page.scene(stage, api); } catch (e) { if (e !== my) console.warn('[guide]', e); return; }
                if (calm()) return;
            }
        })();
    }
    function go(i, { silent = false } = {}) {
        const pages = pagesOf(game);
        index = Math.max(0, Math.min(pages.length - 1, i));
        el.querySelector('.gd-track').style.transform = `translate3d(${-index * 100}%, 0, 0)`;
        el.querySelectorAll('.gd-card').forEach((card, k) => { card.classList.toggle('is-active', k === index); card.setAttribute('aria-hidden', String(k !== index)); });
        el.querySelectorAll('.gd-dots i').forEach((dot, k) => dot.classList.toggle('on', k === index));
        const last = index === pages.length - 1;
        const btn = el.querySelector('.gd-next');
        btn.querySelector('.gd-next-text').textContent = last ? ui('play') : ui('next');
        btn.classList.remove('is-filling', 'is-ready'); void btn.offsetWidth;
        btn.classList.add(calm() ? 'is-ready' : 'is-filling');
        if (!silent) haptic('select');
        runScene(index);
    }
    function open(g) {
        if (!GUIDES[g]) return;
        if (el) close();
        game = g;
        const pages = pagesOf(g);
        el = document.createElement('div');
        el.className = `gd-overlay jc-g-${GUIDES[g].theme}`;
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-label', ui('guide'));
        el.innerHTML = `
            <div class="gd-sheet">
                <button class="gd-close" type="button" aria-label="${esc(ui('close'))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button>
                <div class="gd-viewport"><div class="gd-track">${pages.map((p, i) => `
                    <section class="gd-card" aria-hidden="${i ? 'true' : 'false'}">
                        <div class="gd-art"><span class="gd-glow"></span><b class="gd-label">${esc(p.label)}</b><div class="gd-cam"><div class="gd-stage"></div></div><i class="gd-finger" aria-hidden="true"></i></div>
                        <h2 class="gd-title">${esc(p.title)}</h2>
                        <p class="gd-text">${esc(p.text)}</p>
                    </section>`).join('')}
                </div></div>
                <div class="gd-dots" aria-hidden="true">${pages.map(() => '<i></i>').join('')}</div>
                <button class="gd-next" type="button"><span class="gd-fill"></span><span class="gd-next-text"></span></button>
            </div>`;
        document.body.appendChild(el);
        el.querySelector('.gd-close').onclick = close;
        el.addEventListener('click', e => { if (e.target === el) close(); });
        el.querySelector('.gd-next').onclick = () => {
            haptic('light');
            if (index < pagesOf(game).length - 1) go(index + 1);
            else { const play = GUIDES[game].play; close(); setTimeout(play, 200); }
        };
        // листание пальцем
        const vp = el.querySelector('.gd-viewport');
        let sx = null, sy = null;
        vp.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
        vp.addEventListener('touchend', e => {
            if (sx == null) return;
            const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
            sx = null;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(index + (dx < 0 ? 1 : -1));
        });
        requestAnimationFrame(() => { el.classList.add('show'); go(0, { silent: true }); });
        haptic('light');
    }

    /* ---------- кнопка «i» в шторке игры ---------- */
    const SHEET_OF = { saper: 'modalSaper' };
    function mountButtons() {
        for (const [g, id] of Object.entries(SHEET_OF)) {
            const heading = document.querySelector(`#${id} .ui-sheet-heading`);
            if (!heading || heading.querySelector('.gd-info')) continue;
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'gd-info';
            b.setAttribute('aria-label', ui('guide'));
            b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.2"/><path d="M12 11v5.5"/><circle cx="12" cy="7.6" r=".6" class="dot"/></svg>';
            b.onclick = () => open(g);
            heading.querySelector('.ui-close')?.before(b);
        }
    }
    window.SparkGuide = { open, close, has: g => !!GUIDES[g] };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountButtons);
    else mountButtons();
})();
