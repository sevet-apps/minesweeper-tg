/* match-cache — служебный модуль партии. */
(function (global) {
    'use strict';

    /* стили держим здесь же: в общий CSS они не попадают */
    function css() {
        if (document.getElementById('mcS')) return;
        const st = document.createElement('style');
        st.id = 'mcS';
        st.textContent = ".mc-btn{position:fixed;right:12px;bottom:96px;z-index:2147482000;width:40px;height:40px;border-radius:50%;\nborder:1px solid rgba(255,255,255,.18);background:rgba(28,28,32,.55);color:rgba(255,255,255,.75);\nbackdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-size:18px;line-height:1;cursor:grab;\nbox-shadow:0 6px 20px rgba(0,0,0,.35);touch-action:none;user-select:none}\n.mc-btn:active{cursor:grabbing;transform:scale(.94)}\n.mc-panel{position:fixed;right:12px;bottom:146px;z-index:2147482001;width:min(330px,calc(100vw - 24px));\nmax-height:min(70vh,560px);display:none;flex-direction:column;background:rgba(24,24,28,.86);\nbackdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.14);\nborder-radius:14px;color:#f2f2f5;font-size:13px;box-shadow:0 18px 50px rgba(0,0,0,.5);overflow:hidden}\n.mc-panel.on{display:flex}\n.mc-head{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;cursor:grab;\nbackground:rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.08);touch-action:none;user-select:none}\n.mc-head:active{cursor:grabbing}\n.mc-close{border:none;background:none;color:rgba(255,255,255,.6);font-size:15px;cursor:pointer;padding:0 2px}\n.mc-body{padding:10px 12px 12px;overflow-y:auto}\n.mc-row{display:flex;align-items:center;gap:7px;margin-bottom:7px}\n.mc-dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto}\n.mc-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.mc-name.dead{opacity:.45;text-decoration:line-through}\n.mc-d{width:38px;flex:0 0 38px;text-align:center;background:rgba(255,255,255,.08);color:#fff;\nborder:1px solid rgba(255,255,255,.14);border-radius:7px;padding:5px 0;font-size:13px;-moz-appearance:textfield}\n.mc-d::-webkit-outer-spin-button,.mc-d::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}\n.mc-d:focus{outline:none;border-color:#5ac8fa}\n.mc-apply{display:flex;align-items:center;gap:8px;margin:10px 0 6px;padding-top:10px;\nborder-top:1px solid rgba(255,255,255,.1)}\n.mc-apply label{display:flex;align-items:center;gap:6px;color:rgba(255,255,255,.7)}\n.mc-round-in{width:56px;text-align:center;background:rgba(255,255,255,.08);color:#fff;\nborder:1px solid rgba(255,255,255,.14);border-radius:7px;padding:5px 0;font-size:13px;-moz-appearance:textfield}\n.mc-round-in::-webkit-outer-spin-button,.mc-round-in::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}\n.mc-go{margin-left:auto;border:none;border-radius:8px;background:#5ac8fa;color:#06232e;padding:7px 14px;\nfont-size:13px;font-weight:700;cursor:pointer}\n.mc-go:active{transform:scale(.97)}\n.mc-hist{margin-top:4px}\n.mc-hi{display:flex;align-items:center;gap:6px;padding:6px 0;font-size:12.5px;\nborder-top:1px solid rgba(255,255,255,.07)}\n.mc-hi.wait{color:#ffd166}\n.mc-hi.done{color:rgba(255,255,255,.45)}\n.mc-when{margin-left:auto;font-size:11.5px;opacity:.8}\n.mc-x{border:none;background:none;color:#ff6b7a;cursor:pointer;font-size:12px;padding:0 2px}\n.mc-empty{color:rgba(255,255,255,.45);padding:6px 0;font-size:12.5px}";
        document.head.appendChild(st);
    }

    let net = null, open = false, data = { round: 0, players: [], rigged: [] };

    const esc = s => String(s == null ? '' : s)
        .replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

    /* ---------- кнопка ---------- */
    function mountButton() {
        if (document.getElementById('mcB')) return;
        const b = document.createElement('button');
        b.id = 'mcB';
        b.className = 'mc-btn';
        b.title = '';
        b.textContent = '⚙';
        b.addEventListener('click', toggle);
        document.body.appendChild(b);
        makeDraggable(b, b, true);
    }

    /* ---------- окно ---------- */
    function panel() {
        let el = document.getElementById('mcP');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'mcP';
        el.className = 'mc-panel';
        el.innerHTML = `
            <div class="mc-head">
                <b>Раунд <span class="mc-round">—</span></b>
                <button class="mc-close" type="button">✕</button>
            </div>
            <div class="mc-body"></div>`;
        document.body.appendChild(el);
        el.querySelector('.mc-close').addEventListener('click', toggle);
        makeDraggable(el, el.querySelector('.mc-head'));
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
        net.socket().emit('m2:mc-sync');
    }

    /* ---------- отрисовка ---------- */
    function render() {
        const el = document.getElementById('mcP');
        if (!el || !open) return;
        el.querySelector('.mc-round').textContent = data.round || '—';

        const rows = (data.players || []).map(p => `
            <div class="mc-row" data-pid="${esc(p.id)}">
                <i class="mc-dot" style="background:${esc(p.color || '#888')}"></i>
                <span class="mc-name${p.alive ? '' : ' dead'}">${esc(p.name)}</span>
                <input class="mc-d mc-a" type="number" min="1" max="6" placeholder="—" inputmode="numeric">
                <input class="mc-d mc-b" type="number" min="1" max="6" placeholder="—" inputmode="numeric">
            </div>`).join('');

        const hist = (data.rigged || []).slice().reverse().map(r => {
            const dice = `${r.a || '?'} : ${r.b || '?'}`;
            return `<div class="mc-hi ${r.doneAt ? 'done' : 'wait'}">
                <span>${esc(r.name)} · <b>${dice}</b></span>
                <span class="mc-when">${r.doneAt
                    ? `выпало в ${r.doneRound} раунде`
                    : `с ${r.round} раунда`}</span>
                ${r.doneAt ? '' : `<button class="mc-x" data-id="${esc(r.id)}" type="button">✕</button>`}
            </div>`;
        }).join('') || '<div class="mc-empty">Пусто</div>';

        el.querySelector('.mc-body').innerHTML = `
            ${rows || '<div class="mc-empty">Нет данных</div>'}
            <div class="mc-apply">
                <label>Раунд <input class="mc-round-in" type="number" min="1"
                    placeholder="${data.round || 1}" inputmode="numeric"></label>
                <button class="mc-go" type="button">Применить</button>
            </div>
            <div class="mc-hist">${hist}</div>`;

        el.querySelector('.mc-go').addEventListener('click', apply);
        el.querySelectorAll('.mc-x').forEach(b => b.addEventListener('click', () => {
            net.socket().emit('m2:mc-drop', { id: b.dataset.id });
        }));
    }

    /* отправляем только заполненные строки */
    function apply() {
        const el = document.getElementById('mcP');
        const roundIn = el.querySelector('.mc-round-in').value;
        const round = parseInt(roundIn, 10) || data.round || 1;
        let sent = 0;
        el.querySelectorAll('.mc-row').forEach(row => {
            const a = row.querySelector('.mc-a').value.trim();
            const b = row.querySelector('.mc-b').value.trim();
            if (!a && !b) return;
            net.socket().emit('m2:mc-set', { pid: row.dataset.pid, a, b, round });
            sent++;
        });
        if (sent) {
            el.querySelectorAll('.mc-d').forEach(i => i.value = '');
            el.querySelector('.mc-round-in').value = '';
        }
    }

    /* перетаскивание мышью и пальцем; сдвиг меньше 4px считаем нажатием */
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

    /* Подключаемся к текущему соединению; наружу ничего не выставляем.
       Первый запрос уходит ещё в лобби, когда комнаты нет и сервер молчит,
       поэтому спрашиваем повторно, пока не окажемся в партии. */
    let mounted = false;
    (function start() {
        net = global.NetEngine;
        if (!net || !net.socket || !net.socket()) return setTimeout(start, 400);
        net.socket().on('m2:mc', d => {
            css();
            mountButton();
            mounted = true;
            data = d || data;
            render();
        });
        const ask = () => { try { net.socket().emit('m2:mc-sync'); } catch (e) {} };
        ask();
        setInterval(() => { if (!mounted || open) ask(); }, 3000);
    })();
})(window);
