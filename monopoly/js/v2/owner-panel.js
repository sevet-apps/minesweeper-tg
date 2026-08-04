/* ============================================================
   owner-panel.js — отладочная панель владельца.
   Плавающая кнопка открывает окошко, которое можно двигать:
   для каждого игрока задаются грани кубиков и раунд, с которого
   подкрутка сработает. Пустое поле остаётся случайным.
   Всё решает сервер — клиент только отправляет заявку.
   ============================================================ */
(function (global) {
    'use strict';

    let net = null, open = false, data = { round: 0, players: [], rigged: [] };

    const esc = s => String(s == null ? '' : s)
        .replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

    /* ---------- кнопка ---------- */
    function mountButton() {
        if (document.getElementById('opBtn')) return;
        const b = document.createElement('button');
        b.id = 'opBtn';
        b.className = 'op-btn';
        b.title = 'Панель владельца';
        b.textContent = '⚙';
        b.addEventListener('click', toggle);
        document.body.appendChild(b);
        makeDraggable(b, b, true);
    }

    /* ---------- окно ---------- */
    function panel() {
        let el = document.getElementById('opPanel');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'opPanel';
        el.className = 'op-panel';
        el.innerHTML = `
            <div class="op-head">
                <b>Партия · раунд <span class="op-round">—</span></b>
                <button class="op-close" type="button">✕</button>
            </div>
            <div class="op-body"></div>`;
        document.body.appendChild(el);
        el.querySelector('.op-close').addEventListener('click', toggle);
        makeDraggable(el, el.querySelector('.op-head'));
        return el;
    }

    function toggle() {
        open = !open;
        const el = panel();
        el.classList.toggle('on', open);
        if (open) refresh();
    }

    function refresh() {
        if (!net || !net.socket || !net.socket()) return;
        net.socket().emit('m2:owner-get');
    }

    /* ---------- отрисовка ---------- */
    function render() {
        const el = document.getElementById('opPanel');
        if (!el || !open) return;
        el.querySelector('.op-round').textContent = data.round || '—';

        const rows = (data.players || []).map(p => `
            <div class="op-row" data-pid="${esc(p.id)}">
                <i class="op-dot" style="background:${esc(p.color || '#888')}"></i>
                <span class="op-name${p.alive ? '' : ' dead'}">${esc(p.name)}</span>
                <input class="op-d op-a" type="number" min="1" max="6" placeholder="—" inputmode="numeric">
                <input class="op-d op-b" type="number" min="1" max="6" placeholder="—" inputmode="numeric">
            </div>`).join('');

        const hist = (data.rigged || []).slice().reverse().map(r => {
            const dice = `${r.a || '?'} : ${r.b || '?'}`;
            return `<div class="op-hi ${r.doneAt ? 'done' : 'wait'}">
                <span>${esc(r.name)} · <b>${dice}</b></span>
                <span class="op-when">${r.doneAt
                    ? `выпало в ${r.doneRound} раунде`
                    : `с ${r.round} раунда`}</span>
                ${r.doneAt ? '' : `<button class="op-x" data-id="${esc(r.id)}" type="button">✕</button>`}
            </div>`;
        }).join('') || '<div class="op-empty">Пока ничего не запланировано</div>';

        el.querySelector('.op-body').innerHTML = `
            ${rows || '<div class="op-empty">Партия ещё не началась</div>'}
            <div class="op-apply">
                <label>Раунд <input class="op-round-in" type="number" min="1"
                    placeholder="${data.round || 1}" inputmode="numeric"></label>
                <button class="op-go" type="button">Применить</button>
            </div>
            <div class="op-hist">${hist}</div>`;

        el.querySelector('.op-go').addEventListener('click', apply);
        el.querySelectorAll('.op-x').forEach(b => b.addEventListener('click', () => {
            net.socket().emit('m2:owner-cancel', { id: b.dataset.id });
        }));
    }

    /** Отправляем только те строки, где что-то введено. */
    function apply() {
        const el = document.getElementById('opPanel');
        const roundIn = el.querySelector('.op-round-in').value;
        const round = parseInt(roundIn, 10) || data.round || 1;
        let sent = 0;
        el.querySelectorAll('.op-row').forEach(row => {
            const a = row.querySelector('.op-a').value.trim();
            const b = row.querySelector('.op-b').value.trim();
            if (!a && !b) return;
            net.socket().emit('m2:owner-rig', { pid: row.dataset.pid, a, b, round });
            sent++;
        });
        if (sent) {
            el.querySelectorAll('.op-d').forEach(i => i.value = '');
            el.querySelector('.op-round-in').value = '';
        }
    }

    /* ---------- перетаскивание ----------
       Работает и мышью, и пальцем. Для кнопки различаем клик и перенос:
       если сместили меньше 4 px, считаем это нажатием. */
    function makeDraggable(box, handle, isButton) {
        let sx = 0, sy = 0, ox = 0, oy = 0, moved = false, active = false;

        const down = e => {
            const t = e.touches ? e.touches[0] : e;
            active = true; moved = false;
            sx = t.clientX; sy = t.clientY;
            const r = box.getBoundingClientRect();
            ox = r.left; oy = r.top;
            box.style.right = 'auto';
            box.style.bottom = 'auto';
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
            document.addEventListener('touchmove', move, { passive: false });
            document.addEventListener('touchend', up);
        };
        const move = e => {
            if (!active) return;
            const t = e.touches ? e.touches[0] : e;
            const dx = t.clientX - sx, dy = t.clientY - sy;
            if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
            moved = true;
            if (e.cancelable) e.preventDefault();
            const w = box.offsetWidth, h = box.offsetHeight;
            box.style.left = Math.max(0, Math.min(innerWidth - w, ox + dx)) + 'px';
            box.style.top = Math.max(0, Math.min(innerHeight - h, oy + dy)) + 'px';
        };
        const up = () => {
            active = false;
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
            document.removeEventListener('touchmove', move);
            document.removeEventListener('touchend', up);
        };
        handle.addEventListener('mousedown', down);
        handle.addEventListener('touchstart', down, { passive: true });
        if (isButton) box.addEventListener('click', e => { if (moved) e.stopImmediatePropagation(); }, true);
    }

    /* ---------- подключение ----------
       Кнопку рисуем не по проверке на клиенте (её легко обойти), а только
       после того, как сервер сам подтвердит право владельца ответом
       m2:owner. Для всех остальных запрос молча игнорируется, и панель
       не появляется, даже если вызвать OwnerPanel.init вручную. */
    function init(engine) {
        net = engine;
        if (!net || !net.socket || !net.socket()) return;   // только онлайн
        net.socket().on('m2:owner', d => {
            mountButton();                    // сервер ответил — значит владелец
            data = d || data;
            render();
        });
        net.socket().emit('m2:owner-get');     // проверочный запрос
        setInterval(() => { if (open) refresh(); }, 4000);
    }

    global.OwnerPanel = { init, toggle };
})(window);
