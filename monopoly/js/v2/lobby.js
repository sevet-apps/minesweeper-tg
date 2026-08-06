/* ============================================================
   lobby.js — главное меню монополии.
   Режимы: игра с ботами, создать комнату (число игроков, таймер,
   приватность), войти по коду; ниже — список открытых комнат с
   кнопкой ручного обновления.
   ============================================================ */
(function (global) {
    'use strict';

    const $ = s => document.querySelector(s);
    const TG = global.Telegram && global.Telegram.WebApp;
    const QS = new URLSearchParams(location.search);

    /* ---------- профиль игрока ---------- */
    /** Символы, которые Telegram рисует как пустоту: заполнители хангыля,
        нулевой ширины, соединители, вариационные селекторы, пустой Брайль.
        Обычные пробелы сюда не входят — их достаточно схлопнуть и обрезать. */
    const INVISIBLE_CHARS = /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u206a-\u206f\u2800\u3164\ufe00-\ufe0f\ufeff]/g;
    function cleanName(s) {
        return String(s == null ? '' : s).replace(INVISIBLE_CHARS, '').replace(/\s+/g, ' ').trim();
    }

    /** Инициалы для аватарки-заглушки: по имени, иначе по юзернейму. */
    function initials(full, uname) {
        const parts = cleanName(full).split(' ').filter(Boolean);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        const u = cleanName(uname);
        return u ? u.slice(0, 2).toUpperCase() : '??';
    }
    function profile() {
        const u = TG && TG.initDataUnsafe && TG.initDataUnsafe.user;
        if (u) {
            /* имя может состоять из невидимых символов — тогда берём юзернейм */
            const full = cleanName([u.first_name, u.last_name].filter(Boolean).join(' '));
            const uname = cleanName(u.username);
            const name = full || uname || 'Игрок';
            return {
                uid: 'tg' + u.id,
                name: name.slice(0, 24),
                username: uname || null,
                avatar: u.photo_url || null,
                initials: initials(full, uname),
            };
        }
        let uid = localStorage.getItem('mono_uid');
        if (!uid) { uid = 'g' + Math.random().toString(36).slice(2, 10); localStorage.setItem('mono_uid', uid); }
        const name = cleanName(localStorage.getItem('mono_name')) || 'Гость';
        return { uid, name, username: null, avatar: null, initials: initials(name) };
    }
    const ME = profile();

    /* ---------- фон как на главном экране приложения ---------- */
    function applyTheme() {
        const theme = (QS.get('theme') || 'dark').toLowerCase();
        document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
    }

    /* ---------- PNG-иконки интерфейса ---------- */
    function paintIcons(root) {
        const src = global.MonopolyUIPNG || {};
        (root || document).querySelectorAll('img[data-icon]').forEach(img => {
            const url = src[img.dataset.icon];
            if (url) img.src = url;
        });
    }

    /* ---------- разметка аватарки ---------- */
    function ava(p, size) {
        const st = size ? `style="width:${size}px;height:${size}px"` : '';
        return p.avatar
            ? `<div class="lb-ava" ${st}><img src="${p.avatar}" alt="" loading="lazy"></div>`
            : `<div class="lb-ava" ${st}><span>${p.initials || (p.name || '?').slice(0, 1).toUpperCase()}</span></div>`;
    }

    /* ---------- «незнающая уточка» для пустого списка ---------- */
    let duckAnim = null;
    function killDuck() { if (duckAnim) { try { duckAnim.destroy(); } catch (e) {} duckAnim = null; } }
    function mountDuck(box) {
        const holder = box.querySelector('.lb-duck');
        if (!holder || !global.lottie) return;
        try {
            killDuck();
            duckAnim = global.lottie.loadAnimation({
                container: holder,
                renderer: 'svg',
                loop: true,
                autoplay: true,
                path: 'assets/lottie/duck.json',
            });
        } catch (e) { /* без анимации — просто пустое место */ }
    }

    /* ---------- список комнат ---------- */
    let rooms = [];
    function renderRooms() {
        const box = $('#lbRooms');
        if (!rooms.length) {
            box.innerHTML = `<div class="lb-empty">
                <div class="lb-duck"></div>
                <div>Сейчас открытых комнат нет</div>
                <small>Создайте свою — друзья увидят её здесь</small>
            </div>`;
            mountDuck(box);
            return;
        }
        killDuck();
        box.innerHTML = rooms.map(r => {
            const max = r.maxPlayers || 5;
            return `
            <button class="lb-room" data-room="${r.roomId}">
                <div class="lb-room-avas">${r.players.slice(0, 5).map(p => ava(p, 34)).join('')}</div>
                <div class="lb-room-info">
                    <div class="lb-room-names">${r.players.map(p => p.name).join(', ')}</div>
                    <div class="lb-room-meta">Код <b>${r.roomId}</b> · ${r.players.length}/${max}</div>
                </div>
                <div class="lb-room-go">Войти</div>
            </button>`;
        }).join('');
        box.querySelectorAll('.lb-room').forEach(b =>
            b.onclick = () => joinRoom(b.dataset.room));
    }

    /* ---------- переходы ---------- */
    function show(id) {
        document.querySelectorAll('.lb-screen').forEach(s => s.classList.toggle('on', s.id === id));
        syncBackButton();
        /* размеры кнопок известны только когда экран показан */
        if (id === 'lbCreate') requestAnimationFrame(() => SEGS.forEach(moveSeg));
    }
    function currentScreen() {
        const el = document.querySelector('.lb-screen.on');
        return el ? el.id : 'lbMain';
    }
    function toast(text, bad) {
        const t = $('#lbToast');
        t.textContent = text;
        t.className = 'lb-toast show' + (bad ? ' bad' : '');
        clearTimeout(toast._t);
        toast._t = setTimeout(() => t.className = 'lb-toast', 2600);
    }

    /* ---------- служебная кнопка «назад» Telegram ----------
       Игра открыта внутри приложения (iframe), поэтому настоящей кнопкой
       управляет приложение: мы сообщаем ему, показывать её или нет,
       и слушаем нажатие в ответ. */
    let backShown = null;
    function setBackButton(on) {
        if (backShown === on) return;
        backShown = on;
        try { parent.postMessage({ type: 'monopoly_back', show: on }, '*'); } catch (e) {}
        if (TG && TG.BackButton) {                     // если игра открыта напрямую
            try { on ? TG.BackButton.show() : TG.BackButton.hide(); } catch (e) {}
        }
    }
    function syncBackButton() {
        const inGame = $('#game').style.display !== 'none';
        setBackButton(!inGame);          // в лобби — всегда, в матче — нет
    }
    function goBack() {
        const s = currentScreen();
        if (s === 'lbWait') return leaveRoom();
        if (s !== 'lbMain') return show('lbMain');
        exitToApp();                     // с главного экрана — выход из монополии
    }
    function exitToApp() {
        try { net().socket() && net().socket().emit('m2:leave'); } catch (e) {}
        try { parent.postMessage({ type: 'monopoly_exit' }, '*'); } catch (e) {}
    }

    /** Возврат из матча в лобби монополии. Перезагружаем страницу: так
        гарантированно гасятся таймеры движка, боты и 3D-сцена, а сама
        страница локальная и поднимается мгновенно. */
    function exitToLobby() {
        try { net().socket() && net().socket().emit('m2:leave'); } catch (e) {}
        location.reload();
    }
    addEventListener('message', e => {
        const d = e.data;
        if (d && d.type === 'monopoly_back_pressed') goBack();
    });
    if (TG && TG.BackButton && TG.BackButton.onClick) {
        try { TG.BackButton.onClick(goBack); } catch (e) {}
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
        const q = QS.get('server');
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
            /* initData отдаём серверу как есть: он проверит подпись Telegram
               и только по ней решит, показывать ли отладочную панель. */
            const s = net().connect(url, {
                uid: ME.uid,
                initData: (TG && TG.initData) || '',
            });
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
        checkMyGame();
    }

    /* ---------- незавершённая партия ----------
       Если игрок закрыл приложение посреди матча, сервер помнит его место.
       Показываем отдельную плашку с кнопкой «Продолжить»; все проверки
       (существует ли комната, жив ли игрок, не закончилась ли игра) делает
       сервер — клиент только рисует то, что ему прислали. */
    function checkMyGame() {
        if (!connected) return;
        net().socket().emit('m2:my-game', null, g => renderResume(g));
    }
    function renderResume(g) {
        const box = $('#lbResume');
        if (!box) return;
        if (!g) { box.innerHTML = ''; return; }
        box.innerHTML = `
            <div class="lb-resume">
                <div class="lb-resume-top">
                    <div class="lb-resume-txt">
                        <b>Ваша игра продолжается</b>
                        <span>Комната ${g.roomId} · ${g.round} раунд · ${g.players.length} игроков</span>
                    </div>
                </div>
                <div class="lb-resume-avas">${g.players.map(p => ava(p, 32)).join('')}</div>
                <button class="lb-btn" id="lbResumeGo">Продолжить</button>
            </div>`;
        $('#lbResumeGo').onclick = () => resumeGame(g.roomId);
    }
    function resumeGame(rid) {
        const btn = $('#lbResumeGo');
        if (btn) { btn.disabled = true; btn.textContent = 'Подключаемся…'; }
        net().socket().emit('m2:join', { roomId: rid, profile: ME }, res => {
            if (!res || !res.ok) {
                if (btn) { btn.disabled = false; btn.textContent = 'Продолжить'; }
                renderResume(null);
                return toast('Игра уже недоступна', true);
            }
            net().setRoom(res.roomId);
            if (res.started) startGame('online');
            else openWaitRoom(res.roomId, false, false, res.maxPlayers || 5);
        });
    }

    /** Ручное обновление: иконка крутится, пока идёт запрос
        (но не меньше одного оборота — иначе моргает). */
    let spinning = false;
    function manualRefresh() {
        if (spinning) return;
        const btn = $('#lbRefresh');
        spinning = true;
        btn.classList.add('spin');
        const started = Date.now();
        const stop = () => {
            const wait = Math.max(0, 600 - (Date.now() - started));
            setTimeout(() => { btn.classList.remove('spin'); spinning = false; }, wait);
        };
        ensureNet()
            .then(() => new Promise(res => {
                net().socket().emit('m2:rooms', null, list => { rooms = list || []; renderRooms(); res(); });
                setTimeout(res, 4000);
            }))
            .catch(showServerDown)
            .finally(stop);
    }

    function showServerDown() {
        killDuck();
        $('#lbRooms').innerHTML = `<div class="lb-empty">
            <div class="lb-empty-ico">📡</div><div>Сервер недоступен</div>
            <small>Игра с ботами работает без сети</small></div>`;
    }

    /* ---------- настройки новой комнаты ---------- */
    function segValue(id, fallback) {
        const on = document.querySelector('#' + id + ' button.on');
        return on ? parseInt(on.dataset.v, 10) : fallback;
    }
    /** Сегментный переключатель с бегунком: подложка плавно едет к выбранной
        кнопке. Ровный ease без пружины. */
    function moveSeg(id) {
        const box = document.querySelector('#' + id);
        if (!box) return;
        const on = box.querySelector('button.on'), ind = box.querySelector('.lb-seg-ind');
        if (!on || !ind || !box.offsetWidth) return;      // экран ещё скрыт — размеров нет
        ind.style.left = on.offsetLeft + 'px';
        ind.style.width = on.offsetWidth + 'px';
    }
    function bindSeg(id) {
        const box = document.querySelector('#' + id);
        if (!box) return;
        if (!box.querySelector('.lb-seg-ind')) {
            const ind = document.createElement('span');
            ind.className = 'lb-seg-ind';
            box.prepend(ind);
        }
        box.querySelectorAll('button').forEach(b => {
            b.onclick = () => {
                box.querySelectorAll('button').forEach(x => x.classList.remove('on'));
                b.classList.add('on');
                moveSeg(id);
            };
        });
        requestAnimationFrame(() => moveSeg(id));
    }
    const SEGS = ['lbMaxPlayers', 'lbTurnSecs'];
    function timersOn() { return $('#lbTimers .lb-sw').classList.contains('on'); }
    function syncTimerField() {
        $('#lbTurnSecsField').classList.toggle('off', !timersOn());
    }

    async function createRoom() {
        const isPrivate = $('#lbPrivate .lb-sw').classList.contains('on');
        const orderRoll = $('#lbOrderRoll .lb-sw').classList.contains('on');
        const maxPlayers = segValue('lbMaxPlayers', 5);
        const turnSecs = timersOn() ? segValue('lbTurnSecs', 70) : 0;
        try {
            await ensureNet();
            net().socket().emit('m2:create', { profile: ME, isPrivate, maxPlayers, turnSecs, orderRoll }, res => {
                net().setRoom(res.roomId);
                openWaitRoom(res.roomId, true, isPrivate, maxPlayers);
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
                openWaitRoom(res.roomId, false, false, res.maxPlayers || 5);
            });
        } catch (e) { toast(e.message, true); }
    }
    function leaveRoom() {
        try { net().socket().emit('m2:leave'); } catch (e) {}
        show('lbMain');
        refreshRooms();
    }

    /* ---------- комната ожидания ---------- */
    function openWaitRoom(roomId, isHost, isPrivate, maxPlayers) {
        show('lbWait');
        $('#lbWaitCode').textContent = roomId;
        $('#lbWaitPrivate').style.display = isPrivate ? '' : 'none';
        $('#lbStart').style.display = isHost ? '' : 'none';
        $('#lbWaitHint').textContent = isHost
            ? `Начать можно, когда соберётся хотя бы двое · до ${maxPlayers || 5} игроков`
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
        setBackButton(false);
        if (mode === 'bots') {
            global.MONO_LOCAL = true;             // меню игрока показывает «Выйти»
            global.GameUI.init(global.Engine);
            global.Engine.start([
                { id: ME.uid, name: ME.name, color: 'var(--p4)', host: true,
                  avatar: ME.avatar, initials: ME.initials },
                { id: 'b1', name: 'Бот 1', color: 'var(--p1)', bot: true, initials: 'Б1' },
                { id: 'b2', name: 'Бот 2', color: 'var(--p2)', bot: true, initials: 'Б2' },
                { id: 'b3', name: 'Бот 3', color: 'var(--p3)', bot: true, initials: 'Б3' },
            ]);
        } else {
            global.MONO_LOCAL = false;
            global.GameUI.init(global.NetEngine);
        }
    }

    /* ---------- «На весь экран» (только десктоп) ---------- */
    function setupFullscreen() {
        const btn = $('#fsBtn');
        if (!btn) return;
        /* На телефоне мини-приложение и так во весь экран. Ориентируемся на
           платформу Telegram, а не на ширину: окно десктопного клиента узкое,
           и по ширине кнопка ошибочно пропадала. */
        const phone = TG && TG.platform
            ? ['ios', 'android', 'android_x'].indexOf(TG.platform) >= 0
            : innerWidth <= 900;
        if (phone) { btn.remove(); return; }
        document.body.classList.add('has-fs');          // резервируем место под доской
        let on = false;
        btn.onclick = () => {
            on = !on;
            btn.classList.toggle('on', on);
            btn.querySelector('span').textContent = on ? 'Свернуть' : 'На весь экран';
            try { parent.postMessage({ type: 'monopoly_fullscreen', on }, '*'); } catch (e) {}
            try {
                if (on) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
                else if (document.fullscreenElement) document.exitFullscreen && document.exitFullscreen();
            } catch (e) {}
        };
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
        applyTheme();
        applySafeInsets();
        paintIcons();
        setupFullscreen();

        $('#lbMe').innerHTML = ava(ME, 40) + `<div class="lb-me-name">${ME.name}</div>`;
        $('#lbBots').onclick = () => startGame('bots');
        $('#lbCreateGo').onclick = createRoom;
        $('#lbJoinGo').onclick = () => joinRoom();
        $('#lbRefresh').onclick = manualRefresh;

        bindSeg('lbMaxPlayers');
        bindSeg('lbTurnSecs');
        $('#lbTimers').onclick = () => {
            $('#lbTimers .lb-sw').classList.toggle('on');
            syncTimerField();
        };
        syncTimerField();

        $('#lbPrivate').onclick = () => $('#lbPrivate .lb-sw').classList.toggle('on');
        $('#lbOrderRoll').onclick = () => $('#lbOrderRoll .lb-sw').classList.toggle('on');
        document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));
        $('#lbCode').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
        $('#lbCopy').onclick = () => {
            const code = $('#lbWaitCode').textContent;
            navigator.clipboard && navigator.clipboard.writeText(code);
            toast('Код скопирован');
        };
        $('#lbStart').onclick = () => net().socket().emit('m2:start');
        $('#lbLeave').onclick = leaveRoom;

        addEventListener('resize', applySafeInsets);
        addEventListener('orientationchange', () => setTimeout(applySafeInsets, 250));

        renderRooms();                       // сразу показываем уточку
        ensureNet().then(refreshRooms).catch(showServerDown);
        setInterval(refreshRooms, 10000);
        syncBackButton();
    }

    global.Lobby = { init, profile: () => ME, exitToLobby, exitToApp };
})(window);
