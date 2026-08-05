/* ============================================================
   game-ui.js (v2) — связывает Engine с DOM:
   служебная плашка (все состояния), колонка игроков, чат,
   таймер, фишки, клики по клеткам и игрокам.
   ============================================================ */
(function (global) {
    'use strict';

    const D = global.MonopolyDataV2;
    let E = global.Engine;          // подменяется в init(): локальный движок или сетевой
    const fmt = n => n.toLocaleString('ru-RU');
    const DS = '<i class="dsign"></i>';
    const $ = s => document.querySelector(s);
    /* PNG-иконки интерфейса (общий помощник живёт в modals.js) */
    const ico = (n, fb, cls) => (global.Modals && global.Modals.ico)
        ? global.Modals.ico(n, fb, cls)
        : `<span class="mi-ico-fb">${fb || ''}</span>`;

    let els = {};
    let timerTick = null, lastPhase = null;
    let casinoPick = [];          // выбранные числа в казино
    let casinoBet = null;         // введённая ставка (null = ещё не трогали)
    let casinoTick = null;        // «прокрутка» кубика после ставки

    /* грань кубика 3×3: точки на нужных позициях */
    const DIE_PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8],
                       5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
    function dieFace(n, selected, dim) {
        /* Точки рисуем внутри SVG: у него собственные пропорции, и грань
           не схлопывается на узких экранах (грид с aspect-ratio там давал
           нулевую высоту — кнопка была видна, а точки нет). */
        /* Сетка 3×3 в поле 64: центры точек по 16 / 32 / 48, поля по краям
           одинаковые. Раньше шаг был 24, и третьи столбец и ряд уезжали
           за границу viewBox — грань выглядела смещённой вправо вниз. */
        const pips = DIE_PIPS[n] || [];
        const dots = pips.map(k => {
            const cx = 16 + (k % 3) * 16, cy = 16 + Math.floor(k / 3) * 16;
            return `<circle cx="${cx}" cy="${cy}" r="7.5"/>`;
        }).join('');
        return `<button type="button" class="die${selected ? ' on' : ''}${dim ? ' dim' : ''}" data-n="${n}">
            <svg viewBox="0 0 64 64" aria-hidden="true">${dots}</svg></button>`;
    }
    function casinoWin(bet) {
        return casinoPick.length ? Math.round(bet * 6 / casinoPick.length) : 0;
    }
    /** Ставка: своя, если ввели, иначе предложенная сервером (1000).
        Ограничена наличными игрока и минимальной суммой. */
    const CASINO_MIN = 100;
    function betValue(ph, money) {
        const base = casinoBet == null ? ph.bet : casinoBet;
        const n = parseInt(base, 10);
        if (!n || n < CASINO_MIN) return 0;
        const stake = Math.min(n, money);
        /* если денег меньше минимальной ставки, играть нельзя вовсе */
        return stake >= CASINO_MIN ? stake : 0;
    }

    function init(engine) {
        E = engine || global.Engine;
        global.Engine = E;          // модалки и договоры берут актуальный движок отсюда
        els = {
            board: $('#board'), col: $('#playersCol'), chat: $('#chatLog'),
            bar: $('#serviceBar'), input: $('#chatInput'), dice: $('#diceDock'),
        };
        global.BoardUI.build(els.board);
        global.BoardUI.onTileClick((i, t, ev) => {
            if (global.Trades && global.Trades.handleTileClick(i)) return;   // режим договора
            if (t.type !== 'prop') return;
            const tw = ev && ev.target && ev.target.closest('.tw');
            global.Modals.fieldCard(i, tw && tw.getBoundingClientRect(), tw);
        });
        global.DiceDock.mount(els.dice);

        E.on('state', renderAll);
        E.on('log', addLog);
        E.on('phase', renderBar);
        E.on('timer', startTimer);
        E.on('dice', (a, b) => global.DiceDock.roll(a, b));
        E.on('move', animateMove);
        E.on('teleport', animateTeleport);
        /* итоги матча: окно с начислением рейтинга поверх затемнённого поля */
        E.on('rating', data => {
            setTimeout(() => global.RatingUI.show(
                data, E.S, E.me(),
                () => global.Lobby.exitToLobby(),   // «Выйти в лобби»
                () => {}                            // «Смотреть игру» — просто закрыть окно
            ), 900);
        });
        E.on('state', () => {            // после залога/продажи кнопки оживают
            const ph = E.currentPhasePayload && E.currentPhasePayload();
            if (ph && lastPhase && ph.phase === lastPhase.phase) renderBar({ ...lastPhase, ...ph });
        });
        startMatchClock();

        /* Показываем то, что уже пришло. При возврате в начатую партию
           снапшот прилетает раньше, чем создаётся интерфейс, и без этого
           доска оставалась пустой до следующего действия игрока. */
        renderAll();
        const ph0 = E.currentPhasePayload && E.currentPhasePayload();
        if (ph0) renderBar(ph0);

        /* кнопка эмодзи прямо в строке ввода */
        if (global.Emoji) global.Emoji.mount(els.input.parentElement, els.input);
        keepInputVisible(els.input);

        els.input.addEventListener('keydown', e => {
            if (e.key !== 'Enter') return;
            const v = e.target.value.trim(); if (!v) return;
            const me = E.me();
            if (E.chat) E.chat(v);            // онлайн: сообщение придёт обратно от сервера
            else addUserMsg(me, v, null);
            e.target.value = '';
        });
        document.body.addEventListener('ignored-changed', rerenderChatVisibility);
        if (E.on) E.on('chat', m => addUserMsg(m.pid, m.text, m.dmTo));
        document.body.addEventListener('board-refresh', renderAll);
        document.body.addEventListener('trade-start', e => global.Trades.startCompose(e.detail.withId));
        document.body.addEventListener('trade-log', e => addLog(e.detail));
        E.on('trade-offer', ({ fromId, toId, deal }) => {
            if (toId === E.me()) global.Trades.showIncoming(fromId, deal);
        });
    }

    /** аватар: фото из Telegram, иначе инициалы */
    function avaHtml(p) {
        if (p.avatar) return `<img src="${p.avatar}" alt="">`;
        const ini = p.initials || (p.name || '?').trim().slice(0, 1).toUpperCase();
        return `<div class="ava-fallback">${ini}</div>`;
    }

    /* ---------- анимация фишки ---------- */
    let movingPid = null;
    const STEP_MS = 215;                 // темп шага фишки (сервер ориентируется на него)

    function tileCenter(i) {
        const tw = document.querySelector(`.tw[data-i="${i}"] .tile`);
        if (!tw) return null;
        const r = tw.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    /** Общий финал для обеих анимаций.
        Пока фишка летит, её убирают с доски и рисуют призрак. В онлайне
        состояние с сервера приходит раньше, чем призрак долетает, поэтому
        по окончании обязательно перерисовываем доску — иначе фишка так и
        останется скрытой до следующего события. Страховочный таймер и
        проверки на null не дают movingPid залипнуть, если клетки не нашлось
        или вкладка была свёрнута. */
    function moveEnder(ghost, resolve, pid, to) {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            clearTimeout(finish.guard);
            /* Ставим фишку на конечную клетку сами. Снапшот с сервера может
               прийти позже анимации, и без этого фишка на миг появлялась
               на старом поле, а уже потом перескакивала на новое. */
            const p = E.S.players[pid];
            if (p && to != null) p.pos = to;
            movingPid = null;
            /* удаление призрака и отрисовка фишки — в одном синхронном блоке:
               браузер рисует только итог, промежуточного кадра не будет */
            if (ghost && ghost.parentNode) ghost.remove();
            renderAll();
            resolve();
        };
        finish.guard = setTimeout(finish, 8000);
        return finish;
    }

    function animateMove({ pid, from, steps, to }) {
        return new Promise(resolve => {
            const p = E.S.players[pid];
            if (!p) return resolve();
            movingPid = pid;
            renderAll();
            const ghost = document.createElement('div');
            ghost.className = 'chip move-ghost';
            ghost.style.setProperty('--cc', p.color);
            document.body.appendChild(ghost);
            const dest = to != null ? to : ((from + steps) % 40 + 40) % 40;
            const finish = moveEnder(ghost, resolve, pid, dest);

            const per = STEP_MS;                          // спокойный темп, не зависит от длины пути
            let k = 0;
            const c0 = tileCenter(from);
            if (!c0) return finish();
            ghost.style.left = c0.x + 'px'; ghost.style.top = c0.y + 'px';
            ghost.style.transitionDuration = per + 'ms';
            ghost.style.animationDuration = per + 'ms';
            ghost.style.animationIterationCount = Math.abs(steps);  // ровно по числу шагов
            const dir = steps >= 0 ? 1 : -1;
            const total = Math.abs(steps);
            const hop = () => {
                k++;
                if (global.SFX) global.SFX.step(k - 1, total);   // тик на каждую клетку
                if (k === total) {                        // последний шаг — без подскока
                    ghost.style.animationName = 'none';
                    ghost.style.marginTop = '0px';
                    ghost.style.transitionTimingFunction = 'cubic-bezier(.25,.9,.3,1)';
                }
                const idx = ((from + k * dir) % 40 + 40) % 40;
                const c = tileCenter(idx);
                if (!c) return finish();
                ghost.style.left = c.x + 'px'; ghost.style.top = c.y + 'px';
                if (k < total) setTimeout(hop, per);
                else setTimeout(() => {
                    ghost.classList.add('land');          // мягкая посадка
                    if (global.SFX) global.SFX.land();
                    setTimeout(finish, 150);
                }, per + 20);
            };
            if (!total) return finish();
            requestAnimationFrame(() => setTimeout(hop, 30));
        });
    }

    function animateTeleport({ pid, from, to }) {
        return new Promise(resolve => {
            const p = E.S.players[pid];
            if (!p) return resolve();
            movingPid = pid; renderAll();
            const ghost = document.createElement('div');
            ghost.className = 'chip move-ghost fly';
            ghost.style.setProperty('--cc', p.color);
            document.body.appendChild(ghost);
            const finish = moveEnder(ghost, resolve, pid, to);
            const c0 = tileCenter(from), c1 = tileCenter(to);
            if (!c0 || !c1) return finish();
            ghost.animate([
                { left: c0.x + 'px', top: c0.y + 'px', transform: 'translate(-50%,-50%) scale(1)' },
                { transform: 'translate(-50%,-50%) translateY(-46px) scale(1.55)', offset: .5 },
                { left: c1.x + 'px', top: c1.y + 'px', transform: 'translate(-50%,-50%) scale(1)' },
            ], { duration: 950, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' });
            setTimeout(finish, 1000);
        });
    }

    /* ---------- доска + игроки ---------- */
    function renderAll() {
        const S = E.S;
        if (!S || !S.order || !S.order.length) return;   // партия ещё не заполнена
        const chips = {};
        for (const id of S.order) {
            const p = S.players[id];
            if (!p.alive || id === movingPid) continue;
            (chips[p.pos] = chips[p.pos] || []).push(id);
        }
        let view = {
            players: S.players, owners: S.owners,
            branches: S.branches, mortgaged: S.mortgaged, chips,
            selected: global.Trades ? global.Trades.selection() : {},
        };
        if (global.Trades && global.Trades.futureOn()) view = global.Trades.futureState(view);
        global.BoardUI.update(view);
        renderPlayers();
        renderClock();
    }

    /* Сумма не переставляется рывком, а быстро добегает до новой:
       ~420 мс с замедлением в конце. Если во время отсчёта прилетает
       ещё одно изменение, счёт продолжается с той цифры, что видна
       сейчас, — поэтому подряд идущие платежи не дёргаются. */
    const MONEY_MS = 420;
    let moneyAnim = {};
    function setMoney(box, id, value, instant) {
        const val = box.querySelector('.pm-val');
        const st = moneyAnim[id] || (moneyAnim[id] = { shown: value, raf: 0 });
        if (st.raf) cancelAnimationFrame(st.raf);
        st.raf = 0;

        if (instant || st.shown === value || !box.isConnected) {
            st.shown = value;
            val.textContent = fmt(value);
            box.classList.remove('up', 'down');
            return;
        }
        const from = st.shown;
        box.classList.toggle('up', value > from);
        box.classList.toggle('down', value < from);
        const t0 = performance.now();
        const tick = now => {
            const k = Math.min(1, (now - t0) / MONEY_MS);
            const e = 1 - Math.pow(1 - k, 3);          // резво стартует, мягко тормозит
            st.shown = Math.round(from + (value - from) * e);
            val.textContent = fmt(st.shown);
            if (k < 1) { st.raf = requestAnimationFrame(tick); return; }
            st.raf = 0; st.shown = value;
            val.textContent = fmt(value);
            box.classList.remove('up', 'down');
        };
        st.raf = requestAnimationFrame(tick);
    }

    /* Карточки игроков собираем один раз и дальше только правим текст и
       классы. Раньше колонка пересоздавалась на каждом изменении денег —
       браузер заново подхватывал <img> аватарок, и они заметно мигали. */
    let cardEls = {}, rosterSig = '';
    function renderPlayers() {
        const S = E.S;
        const roster = S.order.map(id => {
            const p = S.players[id] || {};
            return [id, p.name, p.color, p.avatar || '', p.initials || '', p.host ? 1 : 0].join('~');
        }).join('|');

        const rebuilt = roster !== rosterSig;
        if (rebuilt) {                               // состав или профили сменились
            rosterSig = roster;
            cardEls = {};
            moneyAnim = {};
            els.col.innerHTML = '';
            for (const id of S.order) {
                const p = S.players[id];
                const card = document.createElement('div');
                card.className = 'player-card';
                card.style.setProperty('--pc', p.color);
                card.innerHTML = `
                    <div class="turn-badge">–</div>
                    <div class="player-avatar">${avaHtml(p)}</div>
                    <div class="player-name">${p.host ? '<span class="host-star">★</span>' : ''}${p.name}</div>
                    <div class="player-money"><i class="dsign"></i><span class="pm-val"></span></div>
                    <div class="rip-mark">⚰️ RIP</div>`;
                card.addEventListener('click', ev =>
                    global.Modals.playerMenu(id, ev.currentTarget.getBoundingClientRect(), ev.currentTarget));
                els.col.appendChild(card);
                cardEls[id] = card;
            }
        }

        const curId = E.cur() && E.cur().id;
        for (const id of S.order) {
            const p = S.players[id], card = cardEls[id];
            if (!p || !card) continue;
            const active = curId === id && S.phase !== 'ended';
            card.classList.toggle('active', active);
            card.classList.toggle('rip', !p.alive);
            setMoney(card.querySelector('.player-money'), id, p.money, rebuilt);
            card.querySelector('.player-money').style.display = p.alive ? '' : 'none';
            card.querySelector('.rip-mark').style.display = p.alive ? 'none' : '';
            card.querySelector('.turn-badge').style.display = active ? '' : 'none';
        }
    }

    /* ---------- служебная плашка ---------- */
    function head(title) {
        const S = E.S;
        return `<div class="service-head">
            <div class="timer-pill" id="timerPill">
                <span class="timer-dot" id="timerDot"></span>
                <span id="timerText">${matchClock()}</span>
                <span class="round-pill">${S.round} раунд</span>
            </div>
            <div class="service-title">${title || ''}</div>
            <button class="gear-btn" id="gearBtn" title="Настройки">${ico('gear', '⚙')}</button>
        </div>`;
    }
    function clock(t) { return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }
    function matchClock() {
        const s = Math.max(0, Math.floor((Date.now() - E.S.startedAt) / 1000));
        const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
        return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
                 : `${m}:${String(sec).padStart(2, '0')}`;
    }
    function startMatchClock() {
        setInterval(() => {
            const el = $('#timerText'); if (el) el.textContent = matchClock();
        }, 1000);
    }

    function renderBar(ph) {
        const prev = lastPhase;
        lastPhase = ph;
        clearInterval(casinoTick);
        if (ph.phase === 'casino' && (!prev || prev.phase !== 'casino')) {
            casinoPick = []; casinoBet = null;
        }
        const S = E.S;
        const meId = E.me();
        const mine = ph.pid === meId;
        const bar = els.bar;
        /* Наличные берём из актуального состояния: игрок мог заложить поля
           или продать филиалы уже после того, как фаза была объявлена. */
        const myMoney = (S.players[meId] && S.players[meId].money) || 0;
        const afford = sum => myMoney >= sum;
        bar.classList.remove('compact');
        let html = '';

        switch (ph.phase) {
            case 'await-roll':
                if (mine) {
                    html = head('Ваш ход!') +
                        `<div class="service-actions"><button class="btn btn-primary" id="rollBtn">Бросить кубики</button></div>`;
                } else {
                    bar.classList.add('compact');
                    html = head('');
                }
                break;
            case 'rolling':
                bar.classList.add('compact');
                html = head('');
                break;
            case 'await-buy': {
                const t = D.TILES[ph.tile];
                if (mine) {
                    html = head('Покупаем?') +
                        `<div class="service-desc">Вы попали на ${t.name}, и у вас есть право его купить.<br>
                         Если вы откажетесь от покупки, то поле будет выставлено на аукцион.</div>
                         <div class="service-actions">
                            <button class="btn btn-primary" id="buyBtn" ${afford(ph.price) ? '' : 'disabled'}>Купить за <b>${DS}${fmt(ph.price)}</b></button>
                            <button class="btn btn-secondary" id="aucBtn">Выставить на аукцион</button>
                         </div>`;
                } else { bar.classList.add('compact'); html = head(''); }
                break;
            }
            case 'auction': {
                const t = D.TILES[ph.tile];
                if (mine) {
                    const can = E.S.players[meId].money >= ph.next;
                    html = head('Аукцион') +
                        `<div class="service-desc">${t.name} находится на аукционе.</div>
                         <div class="service-actions">
                            <button class="btn btn-primary" id="raiseBtn" ${can ? '' : 'disabled'}>Поднять до <b>${DS}${fmt(ph.next)}</b></button>
                            <button class="btn btn-secondary" id="passBtn">Отказаться</button>
                         </div>`;
                } else {
                    html = head('Аукцион') +
                        `<div class="service-desc">${t.name} на аукционе: ставка ${DS}${fmt(ph.price)}, ходит @${S.players[ph.pid]?.name || ''}.</div>`;
                }
                break;
            }
            case 'await-pay': {
                if (mine) {
                    const who = ph.toName
                        ? `игроку <b>${ph.toName}</b>` : 'Банку';
                    let hint = '';
                    if (!afford(ph.amount) && ph.enough)
                        hint = `<br><small class="pay-hint">Не хватает наличных — заложите поля или продайте филиалы. Чтобы выплатить всю сумму, придётся отдать ~${ph.percent}% своего имущества.</small>`;
                    if (!ph.enough)
                        hint = `<br><small class="pay-hint danger">Даже заложив всё, вы не соберёте эту сумму.</small>`;
                    html = head('Оплата') +
                        `<div class="service-desc">Вы должны заплатить ${who} <b>${DS}${fmt(ph.amount)}</b>.${hint}</div>
                         <div class="service-actions">
                            <button class="btn btn-primary" id="payBtn" ${afford(ph.amount) ? '' : 'disabled'}>Заплатить <b>${DS}${fmt(ph.amount)}</b></button>
                            ${!ph.enough ? '<button class="btn btn-danger" id="bankruptBtn">Признать банкротство</button>' : ''}
                         </div>`;
                } else { bar.classList.add('compact'); html = head(''); }
                break;
            }
            case 'casino': {
                if (mine) {
                    const bet = betValue(ph, myMoney);
                    html = head('Джекпот') +
                        `<div class="service-desc">Выберите от 1 до 3 чисел и бросьте кубик.
                            Если вы угадаете выпавшее число, то получите выигрыш.</div>
                         <div class="service-desc">Сделав ставку, вы получаете шанс 1/6 сорвать
                            суперприз в размере ${DS}${fmt(ph.jackpot)}, даже если не угадаете число на кубике.</div>
                         <div class="casino-row">
                            <div class="dice-pick">${[1, 2, 3, 4, 5, 6]
                                .map(n => dieFace(n, casinoPick.indexOf(n) >= 0)).join('')}</div>
                            <div class="casino-win"><small>Выигрыш</small>
                                <b>${DS}${fmt(casinoWin(bet))}</b></div>
                         </div>
                         <div class="casino-bet">
                            <label for="betInput">Ставка</label>
                            <div class="casino-bet-in"><i class="dsign"></i>
                                <input id="betInput" type="number" inputmode="numeric"
                                       min="${CASINO_MIN}" max="${myMoney}" step="100"
                                       value="${bet || ''}" placeholder="${ph.bet}"></div>
                            <button class="casino-max" id="betMax" type="button">Всё</button>
                         </div>
                         <div class="service-actions">
                            <button class="btn btn-primary" id="betBtn" ${casinoPick.length && bet ? '' : 'disabled'}>Поставить <b>${DS}${fmt(bet || ph.bet)}</b></button>
                            <button class="btn btn-secondary" id="casinoSkipBtn">Отказаться</button>
                         </div>`;
                } else { bar.classList.add('compact'); html = head(''); }
                break;
            }
            case 'casino-roll': {
                if (mine) {
                    html = head('Джекпот') +
                        `<div class="service-desc">Кубик брошен…</div>
                         <div class="casino-row">
                            <div class="dice-pick rolling">${[1, 2, 3, 4, 5, 6]
                                .map(n => dieFace(n, ph.picked.indexOf(n) >= 0, true)).join('')}</div>
                            <div class="casino-win"><small>Ставка</small>
                                <b>${DS}${fmt(ph.bet)}</b></div>
                         </div>`;
                } else { bar.classList.add('compact'); html = head(''); }
                break;
            }
            case 'await-jail':
                if (mine) {
                    html = head('Тюрьма') +
                        `<div class="service-desc">Заплатите штраф или попробуйте выбросить дубль.</div>
                         <div class="service-actions">
                            <button class="btn btn-primary" id="jailPayBtn" ${afford(ph.fine) ? '' : 'disabled'}>Заплатить <b>${DS}${fmt(ph.fine)}</b></button>
                            <button class="btn btn-secondary" id="jailRollBtn">Бросить на дубль</button>
                         </div>`;
                } else { bar.classList.add('compact'); html = head(''); }
                break;
            case 'ended': {
                const w = ph.winner ? S.players[ph.winner] : null;
                html = head('Игра завершена') +
                    `<div class="service-desc">${w ? `Победитель — <b style="color:${w.color}">${w.name}</b>! 🏆` : 'Победителя нет.'}</div>
                     <div class="service-actions">
                        <button class="btn btn-primary" id="endExitBtn">Выйти в лобби</button>
                     </div>`;
                break;
            }
            default:
                bar.classList.add('compact');
                html = head('');
        }
        bar.innerHTML = html;
        /* В казино текста и кнопок больше, чем помещается в центр доски.
           На телефоне разрешаем плашке выйти за поле — иначе низ обрезается
           и до ставки просто не добраться. */
        bar.classList.toggle('overlay',
            mine && (ph.phase === 'casino' || ph.phase === 'casino-roll'));

        $('#rollBtn')?.addEventListener('click', () => E.roll());
        $('#buyBtn')?.addEventListener('click', () => E.buy(ph.ctx));
        $('#aucBtn')?.addEventListener('click', () => E.toAuction(ph.ctx));
        $('#raiseBtn')?.addEventListener('click', () => E.auctionRaise());
        $('#passBtn')?.addEventListener('click', () => E.auctionPass());
        $('#payBtn')?.addEventListener('click', () => E.pay());
        $('#bankruptBtn')?.addEventListener('click', () => E.declareBankrupt());
        bar.querySelectorAll('.dice-pick:not(.rolling) .die').forEach(d => {
            d.addEventListener('click', () => {
                const n = +d.dataset.n;
                const at = casinoPick.indexOf(n);
                if (at >= 0) casinoPick.splice(at, 1);
                else if (casinoPick.length < 3) casinoPick.push(n);
                else return;                       // больше трёх чисел не ставим
                casinoPick.sort((a, b) => a - b);
                renderBar(lastPhase);
            });
        });
        const betIn = $('#betInput');
        if (betIn) {
            betIn.addEventListener('input', () => {
                casinoBet = betIn.value.trim();
                /* пересчитываем выигрыш и кнопку, не трогая само поле */
                const b = betValue(ph, myMoney);
                const winEl = els.bar.querySelector('.casino-win b');
                if (winEl) winEl.innerHTML = DS + fmt(casinoWin(b));
                const go = $('#betBtn');
                if (go) {
                    go.disabled = !(casinoPick.length && b);
                    go.innerHTML = 'Поставить <b>' + DS + fmt(b || ph.bet) + '</b>';
                }
            });
        }
        $('#betMax')?.addEventListener('click', () => {
            casinoBet = String(myMoney);
            renderBar(lastPhase);
        });
        $('#betBtn')?.addEventListener('click', () =>
            E.casinoBet(casinoPick.slice(), ph.ctx, betValue(ph, myMoney)));
        $('#casinoSkipBtn')?.addEventListener('click', () => E.casinoSkip(ph.ctx));
        if (ph.phase === 'casino-roll' && mine) runCasinoRoll(ph);
        $('#endExitBtn')?.addEventListener('click', () => global.Lobby.exitToLobby());
        $('#jailPayBtn')?.addEventListener('click', () => E.jailPay());
        $('#jailRollBtn')?.addEventListener('click', () => E.jailRoll());
        $('#gearBtn')?.addEventListener('click', openMatchInfo);
    }

    /** Кубик «прокручивается» по граням и останавливается на выпавшей:
        зелёная рамка — попадание, красная — мимо. */
    function runCasinoRoll(ph) {
        const dice = [...els.bar.querySelectorAll('.die')];
        if (dice.length !== 6) return;
        let step = 0;
        casinoTick = setInterval(() => {
            dice.forEach(d => d.classList.remove('flash'));
            if (++step > 12) {
                clearInterval(casinoTick);
                const hit = ph.picked.indexOf(ph.rolled) >= 0;
                dice[ph.rolled - 1].classList.remove('dim');
                dice[ph.rolled - 1].classList.add(hit ? 'hit' : 'miss');
                return;
            }
            dice[Math.floor(Math.random() * 6)].classList.add('flash');
        }, 90);
    }

    /* ---------- О матче / Настройки ---------- */
    let hideSpectators = false;
    let hideSystem = false;         // служебные строки чата (ходы, покупки, аренда)
    function assetsOf(pid) {
        const S = E.S;
        let v = S.players[pid].money;
        for (const [i, o] of Object.entries(S.owners)) {
            if (o !== pid) continue;
            v += S.mortgaged[i] != null ? D.PROP[i].mortgage : D.TILES[i].price;
            v += (S.branches[i] || 0) * (D.PROP[i].branch || 0);
        }
        return v;
    }
    function openMatchInfo() {
        if (document.querySelector('.match-info')) return;
        const S = E.S;
        const bar = els.bar.querySelector('.timer-pill') || els.bar;
        const r0 = bar.getBoundingClientRect();

        const wrap = document.createElement('div');
        wrap.className = 'match-info';
        wrap.innerHTML = `
            <div class="mi-tabs">
                <div class="mi-knob"></div>
                <button class="mi-tab on" data-t="match">${ico('gamepad', '🎮')} О матче</button>
                <button class="mi-tab" data-t="settings">${ico('gear', '⚙')} Настройки</button>
                <button class="mi-close">✕</button>
            </div>
            <div class="mi-views">
                <div class="mi-view mi-match on"></div>
                <div class="mi-view mi-settings"></div>
            </div>`;

        const l = document.createElement('div');
        l.className = 'modal-layer open miolay';
        l.appendChild(wrap);
        l.addEventListener('click', e => { if (e.target === l) closeMi(); });

        /* контент вкладок */
        function fillMatch() {
            const secs = Math.floor((Date.now() - S.startedAt) / 1000);
            const mt = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
            const rows = S.order
                .map(id => ({ p: S.players[id], a: assetsOf(id) }))
                .sort((x, y) => y.a - x.a)
                .map(r => `<div class="mi-row">
                    <span class="mi-name" style="color:${r.p.color}">${r.p.name}</span>
                    <span>${r.p.alive ? '<i class="dsign"></i>' + fmt(r.a) : '⚰️'}</span></div>`)
                .join('');
            wrap.querySelector('.mi-match').innerHTML = `
                <div class="mi-kind"><span class="dot"></span> Обычная игра</div>
                <div class="mi-stats">
                    <div><small>Время матча</small><b>${mt}</b></div>
                    <div><small>Раунд</small><b>${S.round}</b></div>
                    <div><small>Круговой доход</small><b class="green"><i class="dsign"></i>${fmt(D.ECONOMY.lapBonus)}</b></div>
                </div>
                <div class="mi-table">
                    <div class="mi-row mi-head"><span>Игрок</span><span>Активы</span></div>
                    ${rows}
                </div>`;
        }
        wrap.querySelector('.mi-settings').innerHTML = `
            <label class="mi-set"><span>Скрыть сообщения зрителей</span><span class="switch ${hideSpectators ? 'on' : ''}" id="hideSpec"></span></label>
            <label class="mi-set"><span>Очистить служебные сообщения</span><span class="switch ${hideSystem ? 'on' : ''}" id="hideSys"></span></label>
            <label class="mi-set"><span>Звуки игры</span><span class="switch ${global.SFX && !global.SFX.isMuted() ? 'on' : ''}" id="sndOn"></span></label>`;
        fillMatch();

        /* слайдер-«кнопка» под активной вкладкой */
        const knob = wrap.querySelector('.mi-knob');
        const views = wrap.querySelector('.mi-views');
        function moveKnob(btn) {
            knob.style.left = btn.offsetLeft + 'px';
            knob.style.width = btn.offsetWidth + 'px';
        }
        function setView(name) {
            wrap.querySelectorAll('.mi-tab').forEach(b => b.classList.toggle('on', b.dataset.t === name));
            moveKnob(wrap.querySelector(`.mi-tab[data-t="${name}"]`));
            const target = wrap.querySelector(name === 'match' ? '.mi-match' : '.mi-settings');
            const current = wrap.querySelector('.mi-view.on');
            if (target === current) return;
            views.style.height = current.offsetHeight + 'px';   // фиксируем текущую высоту
            current.classList.remove('on');
            target.classList.add('on');
            requestAnimationFrame(() => { views.style.height = target.scrollHeight + 'px'; });
            views.addEventListener('transitionend', function te() {
                views.style.height = ''; views.removeEventListener('transitionend', te);
            });
        }
        wrap.querySelectorAll('.mi-tab').forEach(b => b.onclick = () => setView(b.dataset.t));

        /* FLIP-морф: окно вырастает прямо из ВЕРХНЕЙ МОДАЛКИ (служебной плашки)
           и разворачивается по центру панели с чатом */
        const barEl = els.bar;                       // «Бросить кубики» / «Покупаем?» / «Аукцион»
        const rb = barEl.getBoundingClientRect();
        const panel = document.querySelector('.center-panel');
        const rp = panel.getBoundingClientRect();

        wrap.style.visibility = 'hidden';
        document.body.appendChild(l);
        const W = Math.round(Math.min(400, rp.width - 16));
        wrap.style.width = W + 'px';
        wrap.style.padding = '10px 14px 14px';
        const H = wrap.offsetHeight;
        const fl = Math.round(rp.left + (rp.width - W) / 2);          // по центру чата
        const ft = Math.round(Math.max(rp.top + 6, Math.min(rb.top, rp.bottom - H - 10)));

        /* точные параметры плашки, чтобы форма совпадала кадр в кадр */
        const cs = getComputedStyle(barEl);
        const BAR = { radius: cs.borderRadius, shadow: cs.boxShadow, padding: cs.padding };
        const WIN = { radius: '18px', shadow: '0 20px 60px rgba(0,0,0,.55)', padding: '10px 14px 14px' };

        barEl.style.transition = 'none';              // мгновенно: окно уже накрыло плашку
        barEl.style.opacity = '0';
        barEl.style.pointerEvents = 'none';
        Object.assign(wrap.style, {
            transform: 'none',                 /* базовый translate(-50%) увёл бы окно влево */
            left: rb.left + 'px', top: rb.top + 'px',
            width: rb.width + 'px', height: Math.max(36, rb.height) + 'px',
            borderRadius: BAR.radius, boxShadow: BAR.shadow, padding: BAR.padding,
            overflow: 'hidden', visibility: 'visible',
        });
        wrap.querySelector('.mi-tabs').style.opacity = '0';
        views.style.opacity = '0';
        void wrap.offsetWidth;
        wrap.classList.add('mi-anim');
        Object.assign(wrap.style, {
            left: fl + 'px', top: ft + 'px', width: W + 'px', height: H + 'px',
            borderRadius: WIN.radius, boxShadow: WIN.shadow, padding: WIN.padding,
        });
        setTimeout(() => {
            wrap.querySelector('.mi-tabs').style.opacity = '1';
            views.style.opacity = '1';
            moveKnob(wrap.querySelector('.mi-tab.on'));
            wrap.style.height = '';
        }, 190);

        function closeMi() {
            /* Зеркало открытия: окно ОСТАЁТСЯ непрозрачным и стягивается точно
               в плашку. Плашку возвращаем в самом конце — пока она скрыта за
               окном, поэтому нет ни дубля, ни тёмного просвета. */
            wrap.style.height = wrap.offsetHeight + 'px';
            void wrap.offsetWidth;
            wrap.querySelector('.mi-tabs').style.opacity = '0';
            views.style.opacity = '0';
            Object.assign(wrap.style, {
                left: rb.left + 'px', top: rb.top + 'px',
                width: rb.width + 'px', height: Math.max(36, rb.height) + 'px',
                borderRadius: BAR.radius, boxShadow: BAR.shadow, padding: BAR.padding,
            });
            setTimeout(() => {                 // окно уже точно накрыло плашку
                barEl.style.transition = 'none';
                barEl.style.opacity = '';
                barEl.style.pointerEvents = '';
                void barEl.offsetWidth;
                barEl.style.transition = '';
                l.remove();                    // снимаем окно в том же кадре
            }, 300);
        }
        wrap.querySelector('.mi-close').onclick = closeMi;
        wrap.querySelector('#hideSpec')?.addEventListener('click', ev => {
            hideSpectators = !hideSpectators;
            ev.currentTarget.classList.toggle('on', hideSpectators);
        });
        wrap.querySelector('#sndOn')?.addEventListener('click', ev => {
            if (!global.SFX) return;
            const on = global.SFX.isMuted();          // было выключено — включаем
            global.SFX.setMuted(!on);
            ev.currentTarget.classList.toggle('on', on);
            if (on) global.SFX.tap();                 // сразу слышно, что включилось
        });
        wrap.querySelector('#hideSys')?.addEventListener('click', ev => {
            hideSystem = !hideSystem;
            ev.currentTarget.classList.toggle('on', hideSystem);
            applySystemFilter();
        });
        /* живое обновление времени, пока открыто */
        const upd = setInterval(() => {
            if (!document.body.contains(wrap)) return clearInterval(upd);
            if (wrap.querySelector('.mi-match').classList.contains('on')) fillMatch();
        }, 1000);
    }

    /* ---------- таймер ---------- */
    /** Комната может быть создана без таймеров — тогда сервер присылает
        timerEnd = 0, и обратный отсчёт на карточке игрока просто не рисуем. */
    const turnBadge = () => els.col.querySelector('.player-card.active .turn-badge');
    function startTimer() {
        clearInterval(timerTick);
        if (!E.S.timerEnd) {
            const b = turnBadge(); if (b) b.textContent = '–';
            $('#timerDot') && $('#timerDot').classList.remove('warn');
            return;
        }
        timerTick = setInterval(() => {
            const t = Math.max(0, Math.round((E.S.timerEnd - Date.now()) / 1000));
            $('#timerDot')?.classList.toggle('warn', t <= 15);
            const b = turnBadge(); if (b) b.textContent = t;
            if (t <= 0) clearInterval(timerTick);
        }, 250);
    }
    function renderClock() {
        /* общее время матча в «О матче» — на следующем этапе */
    }

    /* ---------- чат ---------- */
    function addLog({ pid, text }) {
        sfxForLog(text);
        const d = document.createElement('div');
        d.className = 'msg';
        d.innerHTML = text
            .replace(/\*\*(.+?)\*\*/g, '<span class="prop">$1</span>')
            .replace(/@(\S+)/g, (m, n) => nameSpan(n))
            .replace(/\$\s?([\d\s\u00a0]+)/g, '<span class="money"><i class="dsign"></i>$1</span>');
        if (pid && E.S.players[pid]) d.innerHTML = nameSpan(E.S.players[pid].name) + ' ' + d.innerHTML;
        els.chat.appendChild(d);
        els.chat.scrollTop = els.chat.scrollHeight;
    }
    /** Клавиатура на телефоне закрывает нижнюю часть экрана. Страница
        зафиксирована, поэтому сдвигаем саму игру ровно настолько, чтобы поле
        ввода осталось видно, и возвращаем всё назад при потере фокуса.
        Заодно гасим любые попытки системы прокрутить документ. */
    function keepInputVisible(input) {
        if (!input) return;
        const vv = global.visualViewport;
        const app = document.querySelector('.app');
        let focused = false;

        const unscroll = () => {
            if (global.scrollY || global.scrollX) global.scrollTo(0, 0);
            const se = document.scrollingElement;
            if (se && se.scrollTop) se.scrollTop = 0;
        };
        const adjust = () => {
            unscroll();
            if (!app) return;
            if (!focused || !vv) { app.style.marginTop = ''; return; }
            const r = input.getBoundingClientRect();
            const over = r.bottom - vv.height + 12;      // насколько поле ушло под клавиатуру
            /* сдвигаем отступом, а не transform: transform сделал бы .app
               точкой отсчёта для вложенных fixed-элементов (панель договора
               на телефоне), и они бы поехали вместе с игрой */
            if (over > 0) {
                const cur = parseFloat(app.style.marginTop) || 0;
                app.style.marginTop = Math.max(-320, cur - over) + 'px';
            }
        };

        input.addEventListener('focus', () => {
            focused = true;
            [0, 120, 300, 550].forEach(t => setTimeout(adjust, t));   // клавиатура выезжает не сразу
        });
        input.addEventListener('blur', () => {
            focused = false;
            [0, 120, 300].forEach(t => setTimeout(adjust, t));
        });
        global.addEventListener('scroll', unscroll, { passive: true });
        if (vv) {
            vv.addEventListener('resize', adjust);
            vv.addEventListener('scroll', adjust);
        }
    }

    /** Звук по событию в логе: покупка, аренда, тюрьма, победа.
        Так его слышат все игроки, а не только тот, кто нажал кнопку. */
    function sfxForLog(text) {
        if (!global.SFX || !text) return;
        const t = String(text);
        if (/покупает|побеждает в аукционе/.test(t)) return global.SFX.buy();
        if (/заплатил|платит|получает \$/.test(t)) return global.SFX.coin();
        if (/банкрот|отправляется в тюрьму|попадает в тюрьму/.test(t)) return global.SFX.bad();
        if (/выигрывает|побеждает|суперприз/.test(t)) return global.SFX.win();
    }

    function nameSpan(n) {
        const p = Object.values(E.S.players).find(x => x.name === n);
        return `<span class="pname" style="color:${p ? p.color : '#ccc'}">${n}</span>`;
    }
    function addUserMsg(pid, text, dmTo) {
        const p = E.S.players[pid];
        const d = document.createElement('div');
        d.className = 'msg usermsg';
        d.dataset.author = pid;
        d.innerHTML = `<span class="nick-pill" style="--nc:${p.color}">${p.name}</span>
            <span class="utext">${dmTo ? `<span class="dm-tag">лично для ${E.S.players[dmTo].name}:</span>` : ''}${emo(esc(text))}</span>`;
        els.chat.appendChild(d);
        els.chat.scrollTop = els.chat.scrollHeight;
    }
    function esc(s) { return s.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
    /** Эмодзи в сообщениях — картинками, чтобы вид был одинаковым везде.
        Вызывается только после esc(), поэтому чужую разметку не пропустит. */
    function emo(html) { return global.Emoji ? global.Emoji.render(html) : html; }
    /** Служебные строки остаются в разметке — переключатель только прячет их,
        поэтому обратно они возвращаются мгновенно, без перезагрузки истории. */
    function applySystemFilter() {
        els.chat.classList.toggle('no-sys', hideSystem);
        els.chat.scrollTop = els.chat.scrollHeight;
    }
    function rerenderChatVisibility() {
        els.chat.querySelectorAll('.usermsg').forEach(m => {
            m.style.display = E.S.ignored[m.dataset.author] ? 'none' : '';
        });
    }

    global.GameUI = { init, addUserMsg };
})(window);
