/* ============================================================
   modals.js (v2) — карточка поля (с блюром фона), меню игрока,
   подтверждение «Сдаться?». Desktop: попап у клетки; узкий
   экран: по центру (регулируется в CSS).
   ============================================================ */
(function (global) {
    'use strict';

    const D = global.MonopolyDataV2;
    const fmt = n => n.toLocaleString('ru-RU');
    const DS = '<i class="dsign"></i>';

    /** PNG-иконка интерфейса (ui-icons.js). Если файл не загрузился —
        подставляем прежний символ, чтобы кнопка не осталась без значка. */
    function ico(name, fallback, cls) {
        const src = (global.MonopolyUIPNG || {})[name];
        if (!src) return `<span class="mi-ico-fb">${fallback || ''}</span>`;
        return `<img class="mi-ico ${cls || ''}" src="${src}" alt="">`;
    }
    function star(kind) {
        const src = (global.MonopolyUIPNG || {})[kind === 'gold' ? 'starGold' : 'starWhite'];
        return src ? `<img class="star-inline" src="${src}" alt="">`
                   : (kind === 'gold' ? '<span class="gold">★</span>' : '★');
    }

    let layer = null;

    function ensureLayer() {
        if (layer) return layer;
        layer = document.createElement('div');
        layer.className = 'modal-layer';
        layer.addEventListener('click', e => { if (e.target === layer) close(); });
        document.body.appendChild(layer);
        return layer;
    }

    function close() {
        if (!layer) return;
        layer.classList.remove('open');
        layer.innerHTML = '';
        document.body.classList.remove('blurred');
    }

    function openAt(html, anchorRect, cls, anchorEl) {
        const l = ensureLayer();
        l.innerHTML = '';
        /* резкая копия того, по чему кликнули — фон блюрится, а она остаётся чёткой */
        if (anchorEl && anchorRect) {
            const ghost = anchorEl.cloneNode(true);
            ghost.classList.add('anchor-ghost');
            ghost.style.cssText = `position:fixed;left:${anchorRect.left}px;top:${anchorRect.top}px;` +
                `width:${anchorRect.width}px;height:${anchorRect.height}px;margin:0;pointer-events:none;z-index:0;`;
            l.appendChild(ghost);
        }
        l.insertAdjacentHTML('beforeend', `<div class="popcard ${cls || ''}">${html}</div>`);
        l.classList.add('open');
        document.body.classList.add('blurred');
        const card = l.querySelector('.popcard');
        // позиционируем рядом с якорем (desktop); на мобиле CSS перебьёт в центр
        if (anchorRect && window.innerWidth > 900) {
            const W = card.offsetWidth || 320, H = card.offsetHeight || 420;
            let x = anchorRect.left + anchorRect.width / 2 - W / 2;
            let y = anchorRect.bottom + 10;
            if (y + H > innerHeight - 8) y = anchorRect.top - H - 10;
            if (y < 8) y = Math.max(8, (innerHeight - H) / 2);
            x = Math.min(Math.max(8, x), innerWidth - W - 8);
            card.style.left = x + 'px';
            card.style.top = y + 'px';
            card.style.position = 'fixed';
        }
        return card;
    }

    /* ---------- карточка поля ---------- */
    function starRow(n, price) {
        const cell = n === 5
            ? star('gold')
            : Array.from({ length: n }, () => star('white')).join('');
        return `<div class="row"><span class="stars-cell">${cell}</span><span>${DS}${fmt(price)}</span></div>`;
    }

    function fieldCard(i, anchorRect, anchorEl) {
        const t = D.TILES[i], pr = D.PROP[i];
        if (!t || t.type !== 'prop') return;
        const g = D.GROUPS[t.group];
        const S = global.Engine ? global.Engine.S : { owners: {}, branches: {}, mortgaged: {} };
        const owner = S.owners[i];
        const me = global.Engine && global.Engine.me();
        const mine = owner && owner === me;

        let body = '';
        if (pr.rent) {
            body += `<p class="hint">Стройте филиалы, чтобы увеличить аренду.</p>`;
            body += `<div class="row"><span>Базовая аренда</span><span>${DS}${fmt(pr.rent[0])}</span></div>`;
            for (let n = 1; n <= 4; n++) body += starRow(n, pr.rent[n]);
            body += starRow(5, pr.rent[5]);
            body += `<div class="sep"></div>`;
        } else if (pr.carRent) {
            body += `<p class="hint">Аренда зависит от количества Автомобилей, которыми вы владеете.</p>`;
            pr.carRent.forEach((r, k) =>
                body += `<div class="row"><span>${k + 1} пол${k === 0 ? 'е' : 'я'}</span><span>${DS}${fmt(r)}</span></div>`);
            body += `<div class="sep"></div>`;
        } else if (pr.diceMult) {
            body += `<p class="hint">Аренда зависит от суммы чисел на кубиках и от количества Разработчиков игр, которыми вы владеете.</p>`;
            body += `<div class="row"><span>1 поле</span><span>🎲 × ${pr.diceMult[0]}</span></div>`;
            body += `<div class="row"><span>2 поля</span><span>🎲 × ${pr.diceMult[1]}</span></div>`;
            body += `<div class="sep"></div>`;
        }
        body += `<div class="row"><span>Покупка поля</span><span>${DS}${fmt(t.price)}</span></div>`;
        body += `<div class="row"><span>Залог поля</span><span>${DS}${fmt(pr.mortgage)}</span></div>`;
        body += `<div class="row"><span>Выкуп поля</span><span>${DS}${fmt(pr.unmortgage)}</span></div>`;
        if (pr.branch) body += `<div class="row"><span>Стоимость филиала</span><span>${DS}${fmt(pr.branch)}</span></div>`;

        /* действия владельца */
        let actions = '';
        if (mine) {
            const E = global.Engine;
            if (S.mortgaged[i] != null)
                actions += `<button class="act unmort">Выкупить поле <b>${DS}${fmt(pr.unmortgage)}</b></button>`;
            else {
                if (pr.branch && E.canBuild(me, i))
                    actions += `<button class="act build">${star('gold')} Построить филиал <b>${DS}${fmt(pr.branch)}</b></button>`;
                if (S.branches[i] > 0)
                    actions += `<button class="act sellb">Продать филиал <b>${DS}${fmt(Math.floor(pr.branch / 2))}</b></button>`;
                if (!(S.branches[i] > 0))
                    actions += `<button class="act mort danger">${ico('lock', '🔒')} Заложить поле <b>${DS}${fmt(pr.mortgage)}</b></button>`;
            }
        }

        const card = openAt(`
            <div class="pc-head" style="background:${g.color}">
                <div class="pc-name">${t.name}</div>
                <div class="pc-group">${g.name}</div>
            </div>
            <div class="pc-body">${body}</div>
            ${actions ? `<div class="pc-actions">${actions}</div>` : ''}`,
            anchorRect, 'field-card', anchorEl);

        card.querySelector('.build')?.addEventListener('click', () => { global.Engine.build(me, i); close(); });
        card.querySelector('.sellb')?.addEventListener('click', () => { global.Engine.sellBranch(me, i); close(); });
        card.querySelector('.mort')?.addEventListener('click', () => { global.Engine.mortgage(me, i); close(); });
        card.querySelector('.unmort')?.addEventListener('click', () => { global.Engine.unmortgage(me, i); close(); });
    }

    /* ---------- меню игрока ---------- */
    function playerMenu(pid, anchorRect, anchorEl) {
        const E = global.Engine, S = E.S;
        const p = S.players[pid];
        const me = E.me();
        const self = pid === me;
        let items = '';
        if (self) {
            /* своя карточка: профиль, сдаться и — в игре с ботами — выход */
            items += `<button class="mi profile">${ico('user', '👤')} Профиль</button>`;
            items += `<button class="mi danger giveup"><span class="mi-ico-fb">✕</span> Сдаться</button>`;
            if (global.MONO_LOCAL) items += `<button class="mi quit">${EXIT_SVG} Выйти</button>`;
        } else {
            /* чужая карточка: только договор и игнор */
            const myTurn = E.canTrade(me);
            items += `<button class="mi trade${myTurn ? '' : ' disabled'}">${ico('contract', '📄')} Договор${
                myTurn ? '' : '<small>только в свой ход</small>'}</button>`;
            items += `<button class="mi ignore">${ico('cross', '🚫')} Игнорировать
                <span class="switch ${S.ignored[pid] ? 'on' : ''}"></span></button>`;
        }
        const card = openAt(`
            <div class="pm-card" style="--pc:${p.color}">
                <div class="pm-ava">${p.avatar
                    ? `<img src="${p.avatar}" alt="">`
                    : `<div class="ava-fallback">${p.initials || (p.name || '?').slice(0,1).toUpperCase()}</div>`}</div>
                <div class="pm-name">${p.name}</div>
                <div class="pm-money"><i class="dsign"></i>${fmt(p.money)}</div>
            </div>
            <div class="pm-menu">${items}</div>`, anchorRect, 'player-menu', anchorEl);

        card.querySelector('.giveup')?.addEventListener('click', () => confirmSurrender());
        card.querySelector('.quit')?.addEventListener('click', () => confirmQuit());
        card.querySelector('.ignore')?.addEventListener('click', ev => {
            S.ignored[pid] = !S.ignored[pid];
            ev.currentTarget.querySelector('.switch').classList.toggle('on', S.ignored[pid]);
            document.body.dispatchEvent(new CustomEvent('ignored-changed'));
        });
        card.querySelector('.trade:not(.disabled)')?.addEventListener('click', () => {
            close();
            document.body.dispatchEvent(new CustomEvent('trade-start', { detail: { withId: pid } }));
        });
    }

    /* стрелка из двери — выход из матча */
    const EXIT_SVG = `<svg class="mi-ico-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8"/><path d="M17 16l4-4-4-4"/><path d="M21 12H10"/></svg>`;

    /* ---------- выйти из матча? ---------- */
    function confirmQuit() {
        const card = openAt(`
            <div class="confirm">
                <div class="c-ico">?</div>
                <div class="c-txt"><b>Выйти из игры?</b><span>Матч с ботами не сохранится.</span></div>
                <div class="c-btns">
                    <button class="btn btn-secondary cancel">Отмена</button>
                    <button class="btn btn-danger ok">Выйти</button>
                </div>
            </div>`, null, 'confirm-card');
        card.querySelector('.cancel').addEventListener('click', close);
        card.querySelector('.ok').addEventListener('click', () => {
            close();
            try { parent.postMessage({ type: 'monopoly_exit' }, '*'); } catch (e) {}
        });
    }

    /* ---------- сдаться? ---------- */
    function confirmSurrender() {
        const card = openAt(`
            <div class="confirm">
                <div class="c-ico">?</div>
                <div class="c-txt"><b>Сдаться?</b><span>Вы уверены, что хотите сдаться?</span></div>
                <div class="c-btns">
                    <button class="btn btn-secondary cancel">Отмена</button>
                    <button class="btn btn-danger ok">Сдаться</button>
                </div>
            </div>`, null, 'confirm-card');
        card.querySelector('.cancel').addEventListener('click', close);
        card.querySelector('.ok').addEventListener('click', () => {
            global.Engine.surrender(global.Engine.me());
            close();
        });
    }

    global.Modals = { fieldCard, playerMenu, confirmSurrender, confirmQuit, close, ico };
})(window);
