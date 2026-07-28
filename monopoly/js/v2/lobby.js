/* ============================================================
   lobby.js — главное меню монополии.
   Режимы: игра с ботами, создать комнату (можно приватную),
   войти по коду; ниже — живой список открытых комнат с
   аватарками ожидающих игроков.
   ============================================================ */
(function (global) {
    'use strict';

    const $ = s => document.querySelector(s);
    const TG = global.Telegram && global.Telegram.WebApp;

    /* ---------- профиль игрока ---------- */
    function initials(first, last, uname) {
        const a = (first || '').trim(), b = (last || '').trim();
        if (a && b) return (a[0] + b[0]).toUpperCase();
        if (a) return a.slice(0, 2).toUpperCase();
        if (uname) return uname.slice(0, 2).toUpperCase();
        return '??';
    }
    function profile() {
        const u = TG && TG.initDataUnsafe && TG.initDataUnsafe.user;
        if (u) {
            const name = [u.first_name, u.last_name].filter(Boolean).join(' ')
                || u.username || 'Игрок';
            return {
                uid: 'tg' + u.id,
                name: name.slice(0, 24),
                avatar: u.photo_url || null,
                initials: initials(u.first_name, u.last_name, u.username),
            };
        }
        let uid = localStorage.getItem('mono_uid');
        if (!uid) { uid = 'g' + Math.random().toString(36).slice(2, 10); localStorage.setItem('mono_uid', uid); }
        const name = localStorage.getItem('mono_name') || 'Гость';
        return { uid, name, avatar: null, initials: initials(name) };
    }
    const ME = profile();

    /* ---------- разметка аватарки ---------- */
    function ava(p, size) {
        const st = size ? `style="width:${size}px;height:${size}px"` : '';
        return p.avatar
            ? `<div class="lb-ava" ${st}><img src="${p.avatar}" alt="" loading="lazy"></div>`
            : `<div class="lb-ava" ${st}><span>${p.initials || (p.name || '?').slice(0, 1).toUpperCase()}</span></div>`;
    }

    /* ---------- список комнат ---------- */
    let rooms = [];
    function renderRooms() {
        const box = $('#lbRooms');
        if (!rooms.length) {
            box.innerHTML = `<div class="lb-empty">
                <div class="lb-empty-ico">🎲</div>
                <div>Сейчас открытых комнат нет</div>
                <small>Создайте свою — друзья увидят её здесь</small>
            </div>`;
            return;
        }
        box.innerHTML = rooms.map(r => `
            <button class="lb-room" data-room="${r.roomId}">
                <div class="lb-room-avas">${r.players.slice(0, 5).map(p => ava(p, 34)).join('')}</div>
                <div class="lb-room-info">
                    <div class="lb-room-names">${r.players.map(p => p.name).join(', ')}</div>
                    <div class="lb-room-meta">Код <b>${r.roomId}</b> · ${r.players.length}/5</div>
                </div>
                <div class="lb-room-go">Войти</div>
            </button>`).join('');
        box.querySelectorAll('.lb-room').forEach(b =>
            b.onclick = () => joinRoom(b.dataset.room));
    }

    /* ---------- переходы ---------- */
    function show(id) {
        document.querySelectorAll('.lb-screen').forEach(s => s.classList.toggle('on', s.id === id));
    }
    function toast(text, bad) {
        const t = $('#lbToast');
        t.textContent = text;
        t.className = 'lb-toast show' + (bad ? ' bad' : '');
        clearTimeout(toast._t);
        toast._t = setTimeout(() => t.className = 'lb-toast', 2600);
    }

    /* ---------- сеть ---------- */
    let connected = false;
    function net() { return global.NetEngine; }

    /** Адрес бэкенда. Игра открывается внутри приложения (iframe),
        поэтому берём тот же адрес, что использует основное приложение. */
    const FALLBACK_SERVER = 'https://spark-game-backend.onrender.com';

    /** Возможные адреса бэкенда по убыванию надёжности.
        Пробуем по очереди: статика фронта сокеты не обслуживает,
        поэтому одного «угаданного» адреса мало. */
    function serverCandidates() {
        const list = [];
        if (global.MONO_SERVER) list.push(global.MONO_SERVER);
        const q = new URLSearchParams(location.search).get('server');
        if (q) list.push(decodeURIComponent(q));
        try {
            const up = global.parent && global.parent !== global && global.parent.API_BASE_URL;
            if (up) list.push(up);
        } catch (e) { /* другой origin — пропускаем */ }
        list.push(FALLBACK_SERVER);
        if (/^https?:$/.test(location.protocol)) list.push(location.origin);
        return [...new Set(list.filter(Boolean).map(u => String(u).replace(/\/+$/, '')))];
    }
    let connecting = null;
    function ensureNet() {
        if (connected) return Promise.resolve();
        if (connecting) return connecting;
        if (!global.io) return Promise.reject(new Error('Библиотека соединения не загрузилась'));

        const urls = serverCandidates();
        connecting = (async () => {
            for (const url of urls) {
                try {
                    await tryConnect(url);
                    console.info('[lobby] сервер:', url);
                    connected = true;
                    net().on('rooms', list => { rooms = list; renderRooms(); });
                    return;
                } catch (e) {
                    console.warn('[lobby] не отвечает:', url, '-', e.message);
                }
            }
            connecting = null;
            throw new Error('Сервер недоступен');
        })();
        return connecting;
    }
    function tryConnect(url) {
        return new Promise((resolve, reject) => {
            const s = net().connect(url, { uid: ME.uid });
            net().setMe(ME.uid);
            const done = ok => {
                clearTimeout(t);
                s.off('connect', onOk); s.off('connect_error', onErr);
                ok ? resolve() : (s.close && s.close(), reject(new Error('нет ответа')));
            };
            const onOk = () => done(true);
            const onErr = e => { clearTimeout(t); s.off('connect', onOk); if (s.close) s.close();
                                 reject(new Error((e && e.message) || 'ошибка соединения')); };
            const t = setTimeout(() => done(false), 7000);
            s.on('connect', onOk);
            s.on('connect_error', onErr);
        });
    }
    function refreshRooms() {
        if (!connected) return;
        net().socket().emit('m2:rooms', null, list => { rooms = list || []; renderRooms(); });
    }

    async function createRoom() {
        const isPrivate = $('#lbPrivate .lb-sw').classList.contains('on');
        try {
            await ensureNet();
            net().socket().emit('m2:create', { profile: ME, isPrivate }, res => {
                net().setRoom(res.roomId);
                openWaitRoom(res.roomId, true, isPrivate);
            });
        } catch (e) { toast(e.message, true); }
    }
    async function joinRoom(code) {
        const rid = String(code || $('#lbCode').value || '').trim().toUpperCase();
        if (rid.length < 4) return toast('Введите код комнаты', true);
        try {
            await ensureNet();
            net().socket().emit('m2:join', { roomId: rid, profile: ME }, res => {
                if (!res || !res.ok) {
                    const msg = { 'no-room': 'Комната не найдена', started: 'Игра уже началась', full: 'В комнате нет мест' };
                    return toast(msg[res && res.error] || 'Не удалось войти', true);
                }
                net().setRoom(res.roomId);
                openWaitRoom(res.roomId, false, false);
            });
        } catch (e) { toast(e.message, true); }
    }

    /* ---------- комната ожидания ---------- */
    function openWaitRoom(roomId, isHost, isPrivate) {
        show('lbWait');
        $('#lbWaitCode').textContent = roomId;
        $('#lbWaitPrivate').style.display = isPrivate ? '' : 'none';
        $('#lbStart').style.display = isHost ? '' : 'none';
        $('#lbWaitHint').textContent = isHost
            ? 'Начать можно, когда соберётся хотя бы двое'
            : 'Ждём, пока хост начнёт игру';
        const paint = () => {
            const S = net().S;
            $('#lbWaitPlayers').innerHTML = (S.order || []).map(id => {
                const p = S.players[id];
                return `<div class="lb-wp">${ava(p, 48)}<span>${p.name}</span>${
                    p.host ? '<i class="lb-host">хост</i>' : ''}</div>`;
            }).join('');
            $('#lbStart').disabled = (S.order || []).length < 2;
        };
        net().on('state', paint); paint();
        net().on('started', () => startGame('online'));
    }

    /* ---------- запуск игры ---------- */
    function startGame(mode) {
        $('#lobby').style.display = 'none';
        $('#game').style.display = '';
        if (mode === 'bots') {
            global.GameUI.init(global.Engine);
            global.Engine.start([
                { id: ME.uid, name: ME.name, color: 'var(--p4)', host: true,
                  avatar: ME.avatar, initials: ME.initials },
                { id: 'b1', name: 'Сёма',   color: 'var(--p1)', bot: true, initials: 'СЁ' },
                { id: 'b2', name: 'Никита', color: 'var(--p2)', bot: true, initials: 'НИ' },
                { id: 'b3', name: 'Jordan', color: 'var(--p3)', bot: true, initials: 'JO' },
            ]);
        } else {
            global.GameUI.init(global.NetEngine);
        }
    }

    /** Внутри приложения WebApp не отдаёт отступы в iframe,
        поэтому приложение передаёт их параметрами safeTop/safeBottom. */
    function applySafeInsets() {
        const q = new URLSearchParams(location.search);
        const root = document.documentElement;
        const isPhone = innerWidth <= 900;      // тот же порог, что и в стилях

        let top = parseInt(q.get('safeTop'), 10);
        let bottom = parseInt(q.get('safeBottom'), 10);

        if (isNaN(top) && global.Telegram && Telegram.WebApp) {
            const w = Telegram.WebApp;
            const csa = (w.contentSafeAreaInset || {}).top || 0;
            const sa = (w.safeAreaInset || {}).top || 0;
            top = Math.max(csa, sa);
        }
        if (isNaN(top)) top = 0;
        if (isNaN(bottom)) bottom = 0;

        /* На телефоне сверху висят кнопки Telegram — держим гарантированный
           отступ, даже если приложение прислало маленькое значение. */
        if (isPhone) {
            top = Math.max(top, 72) + 8;
            bottom = Math.max(bottom, 8);
        }

        root.style.setProperty('--safe-top', top + 'px');
        root.style.setProperty('--safe-bottom', bottom + 'px');
    }

    /* ---------- инициализация ---------- */
    function init() {
        applySafeInsets();
        $('#lbMe').innerHTML = ava(ME, 40) + `<div class="lb-me-name">${ME.name}</div>`;
        $('#lbBots').onclick = () => startGame('bots');
        $('#lbCreateGo').onclick = createRoom;
        $('#lbJoinGo').onclick = () => joinRoom();
        $('#lbPrivate').onclick = () => $('#lbPrivate .lb-sw').classList.toggle('on');
        document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));
        $('#lbCode').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
        $('#lbCopy').onclick = () => {
            const code = $('#lbWaitCode').textContent;
            navigator.clipboard?.writeText(code);
            toast('Код скопирован');
        };
        $('#lbStart').onclick = () => net().socket().emit('m2:start');
        $('#lbLeave').onclick = () => { net().socket().emit('m2:leave'); show('lbMain'); refreshRooms(); };

        addEventListener('resize', applySafeInsets);
        addEventListener('orientationchange', () => setTimeout(applySafeInsets, 250));

        ensureNet().then(refreshRooms).catch(() => {
            $('#lbRooms').innerHTML = `<div class="lb-empty">
                <div class="lb-empty-ico">📡</div><div>Сервер недоступен</div>
                <small>Игра с ботами работает без сети</small></div>`;
        });
        setInterval(refreshRooms, 10000);
    }

    global.Lobby = { init, profile: () => ME };
})(window);