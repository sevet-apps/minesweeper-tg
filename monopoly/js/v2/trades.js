/* ============================================================
   trades.js (v2) — договоры.
   Составление: клик по своим полям = «отдаю», по полям контрагента
   = «получаю»; деньги — в форме. Future-переключатель показывает
   доску так, как она будет выглядеть после принятия сделки.
   ============================================================ */
(function (global) {
    'use strict';

    const D = global.MonopolyDataV2;
    const fmt = n => n.toLocaleString('ru-RU');
    const DS = '<i class="dsign"></i>';
    const $ = s => document.querySelector(s);

    const T = {
        composing: null,   // {withId, give:Set, take:Set}
        incoming: null,    // {fromId, deal, timerId}
        future: false,
    };

    /* ---------- панель поверх чата ---------- */
    function panel() {
        let el = $('#tradePanel');
        if (!el) {
            el = document.createElement('div');
            el.id = 'tradePanel';
            document.querySelector('.center-panel').prepend(el);
        }
        return el;
    }
    function closePanel() {
        const el = $('#tradePanel'); if (el) el.remove();
        setFuture(false);
        refreshBoard();
    }

    /* ---------- Future-превью ---------- */
    function setFuture(v) { T.future = !!v; refreshBoard(); }
    function futureState(base) {
        const deal = T.composing ? composeDeal() : (T.incoming && T.incoming.deal);
        const a = T.composing ? global.Engine.me() : (T.incoming && T.incoming.deal && T.incoming.toId);
        if (!deal) return base;
        const from = T.composing ? global.Engine.me() : T.incoming.fromId;
        const to = T.composing ? T.composing.withId : global.Engine.me();
        const owners = { ...base.owners };
        deal.giveTiles.forEach(i => owners[i] = to);
        deal.takeTiles.forEach(i => owners[i] = from === global.Engine.me() && T.incoming ? to : from);
        // корректно: giveTiles идут от from к to, takeTiles от to к from
        deal.giveTiles.forEach(i => owners[i] = to);
        deal.takeTiles.forEach(i => owners[i] = from);
        void a;
        const highlight = {};
        deal.giveTiles.forEach(i => highlight[i] = true);
        deal.takeTiles.forEach(i => highlight[i] = true);
        return { ...base, owners, highlight, dimOthers: true };
    }
    function refreshBoard() { document.body.dispatchEvent(new CustomEvent('board-refresh')); }

    function selection() {
        const sel = {};
        if (T.composing) {
            T.composing.give.forEach(i => sel[i] = true);
            T.composing.take.forEach(i => sel[i] = true);
        }
        return sel;
    }

    /* ---------- составление ---------- */
    function startCompose(withId) {
        const E = global.Engine;
        T.composing = { withId, give: new Set(), take: new Set() };
        renderCompose();
        refreshBoard();
        void E;
    }
    function composeDeal() {
        const c = T.composing;
        return {
            giveTiles: [...c.give], takeTiles: [...c.take],
            giveMoney: +($('#tpGiveMoney')?.value || 0) || 0,
            takeMoney: +($('#tpTakeMoney')?.value || 0) || 0,
        };
    }
    function handleTileClick(i) {
        if (!T.composing) return false;
        const E = global.Engine, S = E.S;
        const me = E.me(), other = T.composing.withId;
        if (S.owners[i] === me) toggle(T.composing.give, i);
        else if (S.owners[i] === other) toggle(T.composing.take, i);
        renderCompose();
        refreshBoard();
        return true;
    }
    function toggle(set, i) { set.has(i) ? set.delete(i) : set.add(i); }

    function listHtml(tiles) {
        if (!tiles.length) return '<div class="tp-empty">Выберите поля кликом по доске</div>';
        const byGroup = {};
        tiles.forEach(i => {
            const t = D.TILES[i];
            (byGroup[t.group] = byGroup[t.group] || []).push(t);
        });
        return Object.entries(byGroup).map(([g, ts]) => `
            <div class="tp-group">
                <div class="tp-gname"><span class="dot" style="background:${D.GROUPS[g].color}"></span>${D.GROUPS[g].name}</div>
                ${ts.map(t => `<div class="tp-row"><span>${t.name}</span><span class="dots"></span><span>${DS}${fmt(t.price)}</span></div>`).join('')}
            </div>`).join('');
    }
    function total(tiles, money) {
        return tiles.reduce((s, i) => s + D.TILES[i].price, 0) + (money || 0);
    }

    function renderCompose() {
        const E = global.Engine, S = E.S;
        const c = T.composing; if (!c) return;
        const me = S.players[E.me()], other = S.players[c.withId];
        const deal = composeDeal();
        panel().innerHTML = `
          <div class="tp-card">
            <div class="tp-head">
                <span class="tp-title">Договор</span>
            </div>
            <div class="tp-cols">
                <div class="tp-col">
                    <div class="tp-who"><span class="pname" style="color:${me.color}">Вы</span> предлагаете</div>
                    ${listHtml([...c.give])}
                    <label class="tp-money">Наличные
                        <input id="tpGiveMoney" type="number" min="0" max="${me.money}" step="100" value="${deal.giveMoney || ''}" placeholder="0">
                    </label>
                    <div class="tp-total">Общая стоимость <span class="dots"></span> ${DS}${fmt(total([...c.give], deal.giveMoney))}</div>
                </div>
                <div class="tp-col">
                    <div class="tp-who"><span class="pname" style="color:${other.color}">${other.name}</span> отдаст</div>
                    ${listHtml([...c.take])}
                    <label class="tp-money">Наличные
                        <input id="tpTakeMoney" type="number" min="0" max="${other.money}" step="100" value="${deal.takeMoney || ''}" placeholder="0">
                    </label>
                    <div class="tp-total">Общая стоимость <span class="dots"></span> ${DS}${fmt(total([...c.take], deal.takeMoney))}</div>
                </div>
            </div>
            <div class="tp-actions">
                <button class="btn btn-primary" id="tpSend">Отправить</button>
                <button class="btn btn-secondary" id="tpCancel">Отменить</button>
                <label class="future-toggle"><span class="switch ${T.future ? 'on' : ''}" id="tpFuture"></span> Future</label>
            </div>
          </div>`;
        $('#tpSend').onclick = send;
        $('#tpCancel').onclick = () => { T.composing = null; closePanel(); };
        $('#tpFuture').onclick = ev => { setFuture(!T.future); ev.target.classList.toggle('on', T.future); };
        $('#tpGiveMoney').oninput = () => { renderTotalsOnly(); if (T.future) refreshBoard(); };
        $('#tpTakeMoney').oninput = () => { renderTotalsOnly(); if (T.future) refreshBoard(); };
    }
    function renderTotalsOnly() {
        const c = T.composing; if (!c) return;
        const deal = composeDeal();
        const tots = document.querySelectorAll('.tp-total');
        if (tots[0]) tots[0].innerHTML = `Общая стоимость <span class="dots"></span> ${DS}${fmt(total([...c.give], deal.giveMoney))}`;
        if (tots[1]) tots[1].innerHTML = `Общая стоимость <span class="dots"></span> ${DS}${fmt(total([...c.take], deal.takeMoney))}`;
    }

    function send() {
        const E = global.Engine;
        const c = T.composing; if (!c) return;
        const deal = composeDeal();
        if (!deal.giveTiles.length && !deal.takeTiles.length && !deal.giveMoney && !deal.takeMoney) return;
        const me = E.me(), other = c.withId;
        if (!E.canTrade(me)) { logLine(me, `договор можно предложить только в свой ход`); return; }
        if (!E.validTrade(me, other, deal)) return;
        T.composing = null;
        closePanel();

        /* Онлайн: предложение уходит на сервер, он разошлёт его адресату и
           сам напишет строку в лог. Раньше здесь безусловно работала ветка
           для ботов — botEvaluate у сетевого движка всегда false, поэтому
           договор до соперника не доходил и тут же «отклонялся». */
        if (global.NetEngine && E === global.NetEngine) {
            E.applyTrade(me, other, deal);
            return;
        }

        logLine(me, `предлагает игроку @${E.S.players[other].name} подписать договор`);
        setTimeout(() => {
            if (E.botEvaluate(other, deal) && E.validTrade(me, other, deal)) {
                E.applyTrade(me, other, deal);
            } else {
                logLine(other, `отклоняет договор`);
            }
        }, 900 + Math.floor(Math.random() * 900));
    }
    function logLine(pid, text) {
        // проксируем в чат через engine-событие
        const E = global.Engine;
        (E.S.players[pid]) && document.body.dispatchEvent(new CustomEvent('trade-log', { detail: { pid, text } }));
    }

    /* ---------- входящее предложение ---------- */
    function showIncoming(fromId, deal) {
        const E = global.Engine, S = E.S;
        T.incoming = { fromId, deal };
        const from = S.players[fromId];
        const secs = D.ECONOMY.turnSeconds;
        panel().innerHTML = `
          <div class="tp-card">
            <div class="tp-head"><span class="tp-title">Договор</span><span class="tp-timer" id="tpTimer">${secs}</span></div>
            <div class="tp-cols">
                <div class="tp-col">
                    <div class="tp-who"><span class="pname" style="color:${from.color}">${from.name}</span> предлагает</div>
                    ${listHtml(deal.giveTiles)}
                    ${deal.giveMoney ? `<div class="tp-row"><span>Наличные</span><span class="dots"></span><span>${DS}${fmt(deal.giveMoney)}</span></div>` : ''}
                    <div class="tp-total">Общая стоимость <span class="dots"></span> ${DS}${fmt(total(deal.giveTiles, deal.giveMoney))}</div>
                </div>
                <div class="tp-col">
                    <div class="tp-who">Вы отдадите</div>
                    ${listHtml(deal.takeTiles)}
                    ${deal.takeMoney ? `<div class="tp-row"><span>Наличные</span><span class="dots"></span><span>${DS}${fmt(deal.takeMoney)}</span></div>` : ''}
                    <div class="tp-total">Общая стоимость <span class="dots"></span> ${DS}${fmt(total(deal.takeTiles, deal.takeMoney))}</div>
                </div>
            </div>
            <div class="tp-actions">
                <button class="btn btn-primary" id="tpAccept">Принять</button>
                <button class="btn btn-danger" id="tpDecline">Отклонить</button>
                <label class="future-toggle"><span class="switch" id="tpFuture"></span> Future</label>
            </div>
          </div>`;
        let left = secs;
        const tick = setInterval(() => {
            left--; const el = $('#tpTimer'); if (el) el.textContent = left;
            if (left <= 0) { clearInterval(tick); decline(true); }
        }, 1000);
        T.incoming.timerId = tick;
        $('#tpAccept').onclick = accept;
        $('#tpDecline').onclick = () => decline(false);
        $('#tpFuture').onclick = ev => { setFuture(!T.future); ev.target.classList.toggle('on', T.future); };

        function accept() {
            clearInterval(tick);
            T.incoming = null; closePanel();
            global.Engine.answerTrade(true);
        }
        function decline(timeout) {
            clearInterval(tick);
            T.incoming = null; closePanel();
            global.Engine.answerTrade(false, timeout);
        }
    }

    global.Trades = {
        T, startCompose, handleTileClick, showIncoming,
        selection, futureState,
        active: () => !!T.composing,
        futureOn: () => T.future,
    };
})(window);
