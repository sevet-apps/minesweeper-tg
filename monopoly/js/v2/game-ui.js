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

    let els = {};
    let timerTick = null, lastPhase = null;

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
        E.on('state', () => {            // после залога/продажи кнопки оживают
            const ph = E.currentPhasePayload && E.currentPhasePayload();
            if (ph && lastPhase && ph.phase === lastPhase.phase) renderBar({ ...lastPhase, ...ph });
        });
        startMatchClock();

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
    function tileCenter(i) {
        const tw = document.querySelector(`.tw[data-i="${i}"] .tile`);
        const r = tw.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    function animateMove({ pid, from, steps }) {
        return new Promise(resolve => {
            const p = E.S.players[pid];
            movingPid = pid;
            renderAll();
            const ghost = document.createElement('div');
            ghost.className = 'chip move-ghost';
            ghost.style.setProperty('--cc', p.color);
            document.body.appendChild(ghost);
            const per = 215;                              // спокойный темп, не зависит от длины пути
            let k = 0;
            const c0 = tileCenter(from);
            ghost.style.left = c0.x + 'px'; ghost.style.top = c0.y + 'px';
            ghost.style.transitionDuration = per + 'ms';
            ghost.style.animationDuration = per + 'ms';
            ghost.style.animationIterationCount = Math.abs(steps);  // ровно по числу шагов
            const dir = steps >= 0 ? 1 : -1;
            const total = Math.abs(steps);
            const hop = () => {
                k++;
                if (k === total) {                        // последний шаг — без подскока
                    ghost.style.animationName = 'none';
                    ghost.style.marginTop = '0px';
                    ghost.style.transitionTimingFunction = 'cubic-bezier(.25,.9,.3,1)';
                }
                const idx = ((from + k * dir) % 40 + 40) % 40;
                const c = tileCenter(idx);
                ghost.style.left = c.x + 'px'; ghost.style.top = c.y + 'px';
                if (k < total) setTimeout(hop, per);
                else setTimeout(() => {
                    ghost.classList.add('land');          // мягкая посадка
                    setTimeout(() => { ghost.remove(); movingPid = null; resolve(); }, 150);
                }, per + 20);
            };
            requestAnimationFrame(() => setTimeout(hop, 30));
        });
    }

    function animateTeleport({ pid, from, to }) {
        return new Promise(resolve => {
            const p = E.S.players[pid];
            movingPid = pid; renderAll();
            const ghost = document.createElement('div');
            ghost.className = 'chip move-ghost fly';
            ghost.style.setProperty('--cc', p.color);
            document.body.appendChild(ghost);
            const c0 = tileCenter(from), c1 = tileCenter(to);
            ghost.animate([
                { left: c0.x + 'px', top: c0.y + 'px', transform: 'translate(-50%,-50%) scale(1)' },
                { transform: 'translate(-50%,-50%) translateY(-46px) scale(1.55)', offset: .5 },
                { left: c1.x + 'px', top: c1.y + 'px', transform: 'translate(-50%,-50%) scale(1)' },
            ], { duration: 950, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' });
            setTimeout(() => { ghost.remove(); movingPid = null; resolve(); }, 1000);
        });
    }

    /* ---------- доска + игроки ---------- */
    function renderAll() {
        const S = E.S;
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

    function renderPlayers() {
        const S = E.S;
        els.col.innerHTML = '';
        for (const id of S.order) {
            const p = S.players[id];
            const active = E.cur().id === id && S.phase !== 'ended';
            const card = document.createElement('div');
            card.className = 'player-card' + (active ? ' active' : '') + (p.alive ? '' : ' rip');
            card.style.setProperty('--pc', p.color);
            card.innerHTML = `
                ${active ? `<div class="turn-badge" id="turnBadge">–</div>` : ''}
                <div class="player-avatar">${avaHtml(p)}</div>
                <div class="player-name">${p.host ? '<span class="host-star">★</span>' : ''}${p.name}</div>
                ${p.alive
                    ? `<div class="player-money"><i class="dsign"></i>${fmt(p.money)}</div>`
                    : `<div class="rip-mark">⚰️ RIP</div>`}`;
            card.addEventListener('click', ev =>
                global.Modals.playerMenu(id, ev.currentTarget.getBoundingClientRect(), ev.currentTarget));
            els.col.appendChild(card);
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
            <button class="gear-btn" id="gearBtn" title="Настройки">⚙</button>
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
        lastPhase = ph;
        const S = E.S;
        const meId = E.me();
        const mine = ph.pid === meId;
        const bar = els.bar;
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
                            <button class="btn btn-primary" id="buyBtn" ${ph.canBuy ? '' : 'disabled'}>Купить за <b>${DS}${fmt(ph.price)}</b></button>
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
                    if (!ph.canPay && ph.enough)
                        hint = `<br><small class="pay-hint">Не хватает наличных — заложите поля или продайте филиалы. Чтобы выплатить всю сумму, придётся отдать ~${ph.percent}% своего имущества.</small>`;
                    if (!ph.enough)
                        hint = `<br><small class="pay-hint danger">Даже заложив всё, вы не соберёте эту сумму.</small>`;
                    html = head('Оплата') +
                        `<div class="service-desc">Вы должны заплатить ${who} <b>${DS}${fmt(ph.amount)}</b>.${hint}</div>
                         <div class="service-actions">
                            <button class="btn btn-primary" id="payBtn" ${ph.canPay ? '' : 'disabled'}>Заплатить <b>${DS}${fmt(ph.amount)}</b></button>
                            ${!ph.enough ? '<button class="btn btn-danger" id="bankruptBtn">Признать банкротство</button>' : ''}
                         </div>`;
                } else { bar.classList.add('compact'); html = head(''); }
                break;
            }
            case 'await-jail':
                if (mine) {
                    html = head('Тюрьма') +
                        `<div class="service-desc">Заплатите штраф или попробуйте выбросить дубль.</div>
                         <div class="service-actions">
                            <button class="btn btn-primary" id="jailPayBtn" ${ph.canPay ? '' : 'disabled'}>Заплатить <b>${DS}${fmt(ph.fine)}</b></button>
                            <button class="btn btn-secondary" id="jailRollBtn">Бросить на дубль</button>
                         </div>`;
                } else { bar.classList.add('compact'); html = head(''); }
                break;
            case 'ended': {
                const w = ph.winner ? S.players[ph.winner] : null;
                html = head('Игра завершена') +
                    `<div class="service-desc">${w ? `Победитель — <b style="color:${w.color}">${w.name}</b>! 🏆` : 'Победителя нет.'}</div>`;
                break;
            }
            default:
                bar.classList.add('compact');
                html = head('');
        }
        bar.innerHTML = html;

        $('#rollBtn')?.addEventListener('click', () => E.roll());
        $('#buyBtn')?.addEventListener('click', () => E.buy(ph.ctx));
        $('#aucBtn')?.addEventListener('click', () => E.toAuction(ph.ctx));
        $('#raiseBtn')?.addEventListener('click', () => E.auctionRaise());
        $('#passBtn')?.addEventListener('click', () => E.auctionPass());
        $('#payBtn')?.addEventListener('click', () => E.pay());
        $('#bankruptBtn')?.addEventListener('click', () => E.declareBankrupt());
        $('#jailPayBtn')?.addEventListener('click', () => E.jailPay());
        $('#jailRollBtn')?.addEventListener('click', () => E.jailRoll());
        $('#gearBtn')?.addEventListener('click', openMatchInfo);
    }

    /* ---------- О матче / Настройки ---------- */
    let hideSpectators = false;
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
                <button class="mi-tab on" data-t="match">🎮 О матче</button>
                <button class="mi-tab" data-t="settings">⚙ Настройки</button>
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
            <label class="mi-set"><span class="switch ${hideSpectators ? 'on' : ''}" id="hideSpec"></span> Скрыть сообщения зрителей</label>`;
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
            ev.target.classList.toggle('on', hideSpectators);
        });
        /* живое обновление времени, пока открыто */
        const upd = setInterval(() => {
            if (!document.body.contains(wrap)) return clearInterval(upd);
            if (wrap.querySelector('.mi-match').classList.contains('on')) fillMatch();
        }, 1000);
    }

    /* ---------- таймер ---------- */
    function startTimer() {
        clearInterval(timerTick);
        timerTick = setInterval(() => {
            const t = Math.max(0, Math.round((E.S.timerEnd - Date.now()) / 1000));
            $('#timerDot')?.classList.toggle('warn', t <= 15);
            const b = $('#turnBadge'); if (b) b.textContent = t;
            if (t <= 0) clearInterval(timerTick);
        }, 250);
    }
    function renderClock() {
        /* общее время матча в «О матче» — на следующем этапе */
    }

    /* ---------- чат ---------- */
    function addLog({ pid, text }) {
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
            <span class="utext">${dmTo ? `<span class="dm-tag">лично для ${E.S.players[dmTo].name}:</span>` : ''}${esc(text)}</span>`;
        els.chat.appendChild(d);
        els.chat.scrollTop = els.chat.scrollHeight;
    }
    function esc(s) { return s.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
    function rerenderChatVisibility() {
        els.chat.querySelectorAll('.usermsg').forEach(m => {
            m.style.display = E.S.ignored[m.dataset.author] ? 'none' : '';
        });
    }

    global.GameUI = { init, addUserMsg };
})(window);
