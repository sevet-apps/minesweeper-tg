/* ============================================================
   board-ui.js (v2) — отрисовка доски.
   Данные: MonopolyDataV2, логотипы: MonopolyLogos.
   Публичный API:
     BoardUI.build(container)          — построить 40 плиток
     BoardUI.update(state)             — обновить владение/аренду/фишки
     BoardUI.onTileClick(fn)           — клик по плитке
   state = {
     owners:    { [i]: playerId },
     branches:  { [i]: 0..5 },          // 5 = отель
     mortgaged: { [i]: roundsLeft },
     chips:     { [i]: [playerId,...] } // кто стоит на плитке
     players:   { [id]: { color } },
     selected:  { [i]: true },          // подсветка при сборке трейда
   }
   ============================================================ */
(function (global) {
    'use strict';

    const D = global.MonopolyDataV2;
    const Logos = global.MonopolyLogos;

    let rootEl = null;
    let tileEls = [];   // [{ tw, tile, pill, starsEl, lockEl, chipsEl }]
    let clickCb = null;

    /* ---- геометрия: индекс -> сторона + позиция в сетке ---- */
    function place(i) {
        if (i === 0)  return { side: 'top',    corner: true,  r: 1,  c: 1 };
        if (i < 10)   return { side: 'top',    r: 1, c: i + 1 };
        if (i === 10) return { side: 'top',    corner: true,  r: 1,  c: 11 };
        if (i < 20)   return { side: 'right',  r: i - 9, c: 11 };
        if (i === 20) return { side: 'bottom', corner: true,  r: 11, c: 11 };
        if (i < 30)   return { side: 'bottom', r: 11, c: 31 - i };
        if (i === 30) return { side: 'bottom', corner: true,  r: 11, c: 1 };
        return { side: 'left', r: 41 - i, c: 1 };
    }

    const CORNER_EMOJI = { 0: '🚀', 20: '🎰', 30: '👮' };
    const TAX_EMOJI    = { money: '💵', diamond: '💎' };

    // «?» уже вертикален в самом PNG — никаких поворотов
    const QMARK_ROT = {};

    /* PNG-иконка как <img> из встроенных data-URI (или файла assets/icons) */
    function pngIcon(name, cls, side) {
        const holder = document.createElement('div');
        holder.className = 'logo icon-holder';
        const img = document.createElement('img');
        img.className = cls || '';
        img.alt = name; img.draggable = false;
        const embedded = (global.MonopolyIconPNG || {})[name];
        img.src = embedded || `assets/icons/${name}.png`;
        if (side && QMARK_ROT[side] != null)
            img.style.transform = `rotate(${QMARK_ROT[side]}deg)`;
        holder.appendChild(img);
        return holder;
    }

    const DS = '<i class="dsign"></i>';           // значок доллара (маска)
    function fmtMoney(n) {        // ценник: значок (постоянного размера) + число в .pnum
        return DS + '<span class="pnum">' + n + '</span>';
    }

    function build(container) {
        rootEl = container;
        tileEls = [];

        D.TILES.forEach(t => {
            const p = place(t.i);
            const tw = document.createElement('div');
            tw.className = 'tw' + (p.corner ? ' corner' : '');
            tw.dataset.side = p.side;
            tw.dataset.i = t.i;
            tw.style.gridRow = p.r;
            tw.style.gridColumn = p.c;

            let pill = null;
            if (!p.corner) {
                pill = document.createElement('div');
                pill.className = 'price-pill';
                if (t.type !== 'prop') pill.style.visibility = 'hidden';
                else {
                    pill.style.setProperty('--gc', D.GROUPS[t.group].color);
                    /* стык с соседним ценником: тот угол делаем острым.
                       step учитывает направление роста индексов по сторонам доски */
                    const step = (p.side === 'top' || p.side === 'right') ? 1 : -1;
                    const isProp = k => D.TILES[k] && D.TILES[k].type === 'prop';
                    if (isProp(t.i - step)) tw.classList.add('jp');   // сосед «до» (левее/выше)
                    if (isProp(t.i + step)) tw.classList.add('jn');   // сосед «после» (правее/ниже)
                }
                tw.appendChild(pill);
            }

            const tile = document.createElement('div');
            tile.className = 'tile';

            if (t.type === 'prop') {
                tile.appendChild(Logos.logoEl(t.i));
            } else if (t.type === 'chance') {
                tile.classList.add('chance');
                tile.appendChild(pngIcon('chance', 'qmark-img', p.side));
            } else if (t.type === 'tax') {
                const key = t.icon === 'diamond' ? 'diamond' : 'money';
                tile.appendChild(pngIcon(key, 'tax-img'));
            } else if (t.type === 'jail') {
                tile.classList.add('jail-tile');
                const inner = document.createElement('div');
                inner.className = 'jail-inner';
                inner.appendChild(pngIcon('donut', 'donut-img'));
                inner.appendChild(pngIcon('cuffs', 'cuffs-img'));
                tile.appendChild(inner);
            } else if (t.type === 'casino') {
                tile.appendChild(Logos.iconEl('jackpot', '🎰'));
            } else if (t.type === 'gotojail') {
                tile.appendChild(pngIcon('police', 'corner-img'));
            } else if (t.type === 'start') {
                tile.appendChild(pngIcon('rocket', 'corner-img rocket-img'));
            } else {
                tile.innerHTML = `<span class="tile-emoji">${CORNER_EMOJI[t.i] || ''}</span>`;
            }

            /* служебные слои */
            const starsEl = document.createElement('div');
            starsEl.className = 'stars';
            /* звёзды крепятся к .tw, а не к .tile: у плитки overflow:hidden,
               из-за него они не могли лечь поверх центральной панели */

            const chipsEl = document.createElement('div');
            chipsEl.className = 'chips';
            tile.appendChild(chipsEl);

            const lockEl = document.createElement('div');
            lockEl.className = 'lock-badge';
            lockEl.style.display = 'none';
            lockEl.innerHTML = '<i class="lock-ico"></i><span class="lock-num"></span>';

            tile.addEventListener('click', ev => clickCb && clickCb(t.i, t, ev));

            tw.appendChild(tile);
            tw.appendChild(starsEl);
            tw.appendChild(lockEl);
            container.appendChild(tw);
            tileEls[t.i] = { tw, tile, pill, starsEl, lockEl, chipsEl };
        });

        /* размер «?» в пикселях: 62% от короткой стороны обычной клетки —
           одинаков на всех сторонах в любом браузере */
        function sizeQmarks() {
            const probe = tileEls[2] && tileEls[2].tile;   // клетка Сюрприз верхнего ряда
            if (!probe) return;
            const r = probe.getBoundingClientRect();
            const short = Math.min(r.width, r.height);
            container.style.setProperty('--qsize', Math.round(short * 0.93) + 'px');
        }
        sizeQmarks();
        window.addEventListener('resize', sizeQmarks);
    }

    /* ---- динамический ценник плитки ---- */
    function labelFor(t, st) {
        const owner = st.owners && st.owners[t.i];
        const prop  = D.PROP[t.i];
        if (!owner) return fmtMoney(t.price);
        if (st.mortgaged && st.mortgaged[t.i] != null) return DS + '<span class="pnum">0</span>';

        if (prop.diceMult) {
            // разработчики игр: сколько полей группы у владельца
            const n = D.TILES.filter(x => x.group === 'gamedev' && st.owners[x.i] === owner).length;
            return '\u00d7' + prop.diceMult[Math.min(n, 2) - 1];
        }
        if (prop.carRent) {
            const n = D.TILES.filter(x => x.group === 'cars' && st.owners[x.i] === owner).length;
            return fmtMoney(prop.carRent[Math.min(n, 4) - 1]);
        }
        const b = (st.branches && st.branches[t.i]) || 0;
        return fmtMoney(prop.rent[b]);
    }

    function update(st) {
        D.TILES.forEach(t => {
            const el = tileEls[t.i];
            if (!el) return;

            /* Future-режим: участники сделки яркие, остальное приглушено */
            const inDeal = !!(st.highlight && st.highlight[t.i]);
            el.tw.classList.toggle('dimmed', !!st.dimOthers && !inDeal);
            el.tw.classList.toggle('deal-hl', !!st.dimOthers && inDeal);

            /* фишки */
            el.chipsEl.innerHTML = '';
            const here = (st.chips && st.chips[t.i]) || [];
            const SPREAD = [                 // раскладка по количеству фишек
                [[0, 0]],
                [[-9, -7], [9, 7]],
                [[-10, -8], [10, -8], [0, 9]],
                [[-10, -9], [10, -9], [-10, 9], [10, 9]],
                [[-11, -10], [11, -10], [0, 0], [-11, 10], [11, 10]],
            ];
            const pat = SPREAD[Math.min(here.length, 5) - 1] || [];
            here.forEach((pid, k) => {
                const c = document.createElement('div');
                c.className = 'chip';
                c.style.setProperty('--cc', st.players[pid]?.color || '#888');
                const [dx, dy] = pat[k] || [0, 0];
                c.style.transform = `translate(${dx}px, ${dy}px)`;
                el.chipsEl.appendChild(c);
            });

            if (t.type !== 'prop') return;

            const owner = st.owners && st.owners[t.i];
            const mort  = st.mortgaged && st.mortgaged[t.i];

            const label = labelFor(t, st);
            el.pill.innerHTML = '<span class="pill-in">' + label + '</span>';
            /* длинные суммы ужимаем, значок доллара остаётся прежнего размера */
            const digits = (label.match(/\d/g) || []).length;
            el.pill.classList.toggle('len5', digits === 5);
            el.pill.classList.toggle('len6', digits >= 6);

            el.tile.classList.toggle('owned', !!owner && mort == null);
            el.tile.classList.toggle('mortgaged', mort != null);
            if (owner) el.tile.style.setProperty('--oc', st.players[owner]?.color || '#888');
            else el.tile.style.removeProperty('--oc');

            /* цвет ценника: у владельца — цвет игрока, иначе цвет группы */
            el.pill.style.setProperty('--gc',
                owner ? (st.players[owner]?.color || '#888') : D.GROUPS[t.group].color);

            /* звёзды-филиалы */
            const b = (st.branches && st.branches[t.i]) || 0;
            el.starsEl.innerHTML = b === 5
                ? '<span class="hotel">★</span>'
                : '★'.repeat(b).split('').map(s => `<span>★</span>`).join('');

            /* залог */
            if (mort != null) {
                el.lockEl.style.display = 'flex';
                el.lockEl.querySelector('.lock-num').textContent = mort;
            } else el.lockEl.style.display = 'none';

            /* подсветка выбора в трейде */
            el.tile.style.outline = (st.selected && st.selected[t.i])
                ? '3px solid var(--green)' : '';
        });
    }

    global.BoardUI = {
        build, update,
        onTileClick(fn) { clickCb = fn; },
        placeOf: place,
        fmtMoney,
    };
})(window);
