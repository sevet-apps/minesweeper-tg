/* ============================================================
   rating-ui.js — окно начисления рейтинга в конце матча.
   Аватарка победителя с наклонённой короной, очки перелетают
   частицами в шкалу титула, шкала плавно наполняется.
   ============================================================ */
(function (global) {
    'use strict';

    const TITLES = ['Новичок', 'Арендатор', 'Риелтор', 'Домовладелец', 'Инвестор',
                    'Застройщик', 'Банкир', 'Магнат', 'Монополист', 'Легенда'];

    /** Корона над аватаркой победителя (PNG из ui-icons.js). */
    function crown() {
        const src = (global.MonopolyUIPNG || {}).crown;
        return src ? `<img class="rw-crown" src="${src}" alt="">` : '';
    }

    const fmt = n => (n | 0).toLocaleString('ru-RU');
    const DS = '<i class="dsign"></i>';
    const esc = s => String(s == null ? '' : s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

    function avatar(p) {
        if (p && p.avatar) return `<img src="${p.avatar}" alt="">`;
        const ini = (p && (p.initials || (p.name || '?').slice(0, 1))) || '?';
        return `<span>${esc(ini).toUpperCase()}</span>`;
    }

    /** Показывает окно. data — ответ сервера (m2:rating), S — состояние партии.
        Победитель видит себя с короной, проигравший — свою карточку с итогом
        и кнопкой вернуться к доске: очки у каждого свои. */
    function show(data, S, meId, onExit, onWatch) {
        close();
        const list = data.players || [];
        const me = list.find(p => p.uid === meId) || null;
        const winner = list.find(p => p.winner) || null;
        const iWon = !!(me && me.winner);
        /* карточка всегда про себя; если меня в матче нет (зритель) — про победителя */
        const hero = me || winner;
        const heroP = hero && S.players ? S.players[hero.uid] : null;
        const place = me && !iWon ? (me.place || placeOf(list, me)) : null;

        const t0 = me ? me.titleBefore : null;
        const t1 = me ? me.titleAfter : null;
        const promoted = t0 && t1 && t1.index > t0.index;

        const skip = me && !me.counted ? me.skipReason : null;
        const skipText = {
            short: `Партия короче ${data.minMinutes} минут или ${data.minRounds} раундов — очки не начислены`,
            tainted: 'Очки не начислены: в матче участвовал игрок на проверке',
            banned: 'Очки вам не начисляются',
            /* формулировка намеренно общая: подробности подсказали бы,
               как обходить проверку */
            unfair: 'Очки не начислены: нечестная игра — невыгодные сделки',
            bots: 'Очки не начисляются: в партии играли боты',
        }[skip];

        const wrap = document.createElement('div');
        wrap.className = 'rw-back';
        wrap.innerHTML = `
            <div class="rw-card${iWon ? '' : ' lose'}">
                <div class="rw-win">
                    <div class="rw-ava">${iWon ? crown() : ''}<div class="rw-ava-in">${avatar(heroP || {})}</div></div>
                    <div class="rw-name">${esc(hero ? hero.name : '—')}</div>
                    <div class="rw-sub">${
                        iWon ? 'Вы победили!'
                             : me ? `Вы выбыли${place ? ` · ${place} место` : ''}${
                                    winner ? ` · победил ${esc(winner.name)}` : ''}`
                                  : 'Победитель матча'}</div>
                </div>

                ${me && me.peak ? `<div class="rw-peak">Пиковая стоимость активов
                    <b>${DS}${fmt(me.peak)}</b></div>` : ''}

                ${me ? `
                <div class="rw-gain"><span class="rw-plus">+${fmt(me.gained)}</span> очков</div>
                <div class="rw-reasons">${(me.reasons || [])
                    .map(r => `<div class="rw-reason"><span>${esc(r.label)}</span><b>+${fmt(r.points)}</b></div>`)
                    .join('') || (skipText ? `<div class="rw-skip">${esc(skipText)}</div>` : '')}</div>

                <div class="rw-title">
                    <div class="rw-title-row">
                        <b class="rw-tname">${esc(t1.name)}</b>
                        <span class="rw-tpts"><i>${fmt(me.pointsBefore)}</i>${t1.nextAt ? ' / ' + fmt(t1.nextAt) : ''}</span>
                    </div>
                    <div class="rw-bar"><div class="rw-fill"></div><div class="rw-spark"></div></div>
                    <div class="rw-next">${t1.nextName
                        ? `До титула «${esc(t1.nextName)}» — <b class="rw-left">${fmt(Math.max(0, t1.nextAt - me.pointsBefore))}</b>`
                        : 'Максимальный титул'}</div>
                </div>` : ''}

                <div class="rw-btns">
                    ${!iWon ? '<button class="rw-watch">Смотреть игру</button>' : ''}
                    <button class="rw-exit">Выйти в лобби</button>
                </div>
            </div>`;
        document.body.appendChild(wrap);
        requestAnimationFrame(() => wrap.classList.add('on'));

        wrap.querySelector('.rw-exit').addEventListener('click', () => {
            close();
            if (onExit) onExit();
        });
        /* «Смотреть игру» просто убирает окно — доска остаётся под ним,
           выйти потом можно через меню своей карточки */
        wrap.querySelector('.rw-watch')?.addEventListener('click', () => {
            close();
            if (onWatch) onWatch();
        });

        if (me) runAnimation(wrap, me, promoted);
        return wrap;
    }

    /** Шкала наполняется, очки летят частицами, число тикает. */
    function runAnimation(wrap, me, promoted) {
        const fill = wrap.querySelector('.rw-fill');
        const t0 = me.titleBefore, t1 = me.titleAfter;

        fill.style.width = (t0.progress * 100).toFixed(2) + '%';

        if (!me.gained) return;

        setTimeout(() => {
            flyParticles(wrap, Math.min(18, Math.max(6, me.gained)));
            setTimeout(() => {
                /* если титул сменился, шкала сначала добегает до конца */
                if (promoted) {
                    fill.style.width = '100%';
                    setTimeout(() => {
                        wrap.querySelector('.rw-card').classList.add('promo');
                        fill.classList.add('nofx');
                        fill.style.width = '0%';
                        requestAnimationFrame(() => {
                            fill.classList.remove('nofx');
                            fill.style.width = (t1.progress * 100).toFixed(2) + '%';
                        });
                    }, 520);
                } else {
                    fill.style.width = (t1.progress * 100).toFixed(2) + '%';
                }
                countUp(wrap, me);
            }, 420);
        }, 620);
    }

    function countUp(wrap, me) {
        const el = wrap.querySelector('.rw-tpts i');
        const left = wrap.querySelector('.rw-left');
        const t1 = me.titleAfter;
        const from = me.pointsBefore, to = me.pointsAfter, t0 = performance.now(), dur = 900;
        const tick = now => {
            const k = Math.min(1, (now - t0) / dur);
            const e = 1 - Math.pow(1 - k, 3);
            const v = Math.round(from + (to - from) * e);
            el.textContent = fmt(v);
            if (left && t1.nextAt != null) left.textContent = fmt(Math.max(0, t1.nextAt - v));
            if (k < 1) requestAnimationFrame(tick);
            else {
                el.textContent = fmt(to);
                wrap.querySelector('.rw-tname').textContent = t1.name;
                const row = wrap.querySelector('.rw-tpts');
                if (t1.nextAt) row.innerHTML = `<i>${fmt(to)}</i> / ${fmt(t1.nextAt)}`;
            }
        };
        requestAnimationFrame(tick);
    }

    /** Частицы летят от плашки с очками к шкале. */
    function flyParticles(wrap, count) {
        const card = wrap.querySelector('.rw-card');
        const src = wrap.querySelector('.rw-plus');
        const dst = wrap.querySelector('.rw-bar');
        if (!src || !dst || !card) return;
        const cb = card.getBoundingClientRect();
        const a = src.getBoundingClientRect(), b = dst.getBoundingClientRect();
        const x0 = a.left + a.width / 2 - cb.left, y0 = a.top + a.height / 2 - cb.top;

        for (let i = 0; i < count; i++) {
            const dot = document.createElement('i');
            dot.className = 'rw-dot';
            const x1 = b.left + b.width * (0.1 + 0.8 * Math.random()) - cb.left;
            const y1 = b.top + b.height / 2 - cb.top;
            dot.style.left = x0 + 'px';
            dot.style.top = y0 + 'px';
            card.appendChild(dot);
            const dx = x1 - x0, dy = y1 - y0;
            const lift = 40 + Math.random() * 50;
            dot.animate([
                { transform: 'translate(0,0) scale(1)', opacity: 1 },
                { transform: `translate(${dx * .5 + (Math.random() * 40 - 20)}px, ${dy * .4 - lift}px) scale(1.25)`,
                  opacity: 1, offset: .55 },
                { transform: `translate(${dx}px, ${dy}px) scale(.35)`, opacity: 0 },
            ], {
                duration: 620 + Math.random() * 260,
                delay: i * 34,
                easing: 'cubic-bezier(.35,.05,.35,1)',
                fill: 'forwards',
            }).onfinish = () => dot.remove();
        }
    }

    /** Запасной расчёт места, если сервер его не прислал. */
    function placeOf(list, me) {
        const order = [...list].sort((a, b) =>
            (b.winner - a.winner) || (b.pointsAfter - a.pointsAfter));
        const idx = order.findIndex(p => p.uid === me.uid);
        return idx >= 0 ? idx + 1 : null;
    }

    function close() {
        const el = document.querySelector('.rw-back');
        if (el) el.remove();
    }

    global.RatingUI = { show, close, TITLES };
})(window);
