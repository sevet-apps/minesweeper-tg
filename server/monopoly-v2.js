/* ============================================================
   monopoly-v2.js — серверный движок новой монополии.
   Авторитетная модель: ВСЯ экономика и все решения — здесь.
   Клиент только шлёт намерения и рисует state/события.

   Подключение в server/index.js:
       const MonopolyV2 = require('./monopoly-v2');
       MonopolyV2.attach(io);         // namespace /mono2

   Протокол (клиент -> сервер):
       m2:create {name}                -> ack {roomId}
       m2:join   {roomId, name}       -> ack {ok, state}
       m2:start                        (хост)
       m2:roll | m2:buy | m2:auction  (выставить на аукцион)
       m2:auc-raise | m2:auc-pass
       m2:jail-pay | m2:jail-roll
       m2:casino-bet {nums:[1..6]} | m2:casino-skip
       m2:build {i} | m2:sellBranch {i}
       m2:mortgage {i} | m2:unmortgage {i}
       m2:trade-offer {toId, deal} | m2:trade-answer {accept}
       m2:surrender
       m2:chat {text, dmTo?}

   Сервер -> клиент:
       m2:state  (полный снапшот)     m2:log {pid,text}
       m2:phase  {...}                m2:dice {a,b,pid}
       m2:move   {pid,from,steps,to}  m2:trade-offer {fromId,toId,deal}
       m2:chat   {pid,text,dmTo}      m2:ended {winner}
   ============================================================ */
'use strict';

const path = require('path');
const Rating = require('./monopoly-rating');

/* Владелец проекта: только ему доступна отладочная панель партии.
   ВАЖНО: uid из рукопожатия присылает клиент, подделать его тривиально,
   поэтому право владельца подтверждается подписью Telegram initData —
   её невозможно подделать, не зная токена бота. */
const crypto = require('crypto');
const OWNER_TG_ID = 1482228376;
const BOT_TOKEN = process.env.BOT_TOKEN;
/* Путь к служебному модулю партии. В разметку он не подключён и в других
   файлах не упоминается: адрес уходит по сокету только проверенному
   владельцу, поэтому в исходниках фронтенда следов модуля нет. */
const OWNER_MODULE = process.env.MONO_OWNER_MODULE || 'js/v2/board-cache-7731.js';

/** Проверяет подпись initData и возвращает id пользователя Telegram. */
function verifiedTelegramId(initData) {
    if (!initData || !BOT_TOKEN) return null;
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        if (!hash) return null;
        params.delete('hash');
        const check = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join('\n');
        const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
        const calc = crypto.createHmac('sha256', secret).update(check).digest('hex');
        /* сравнение постоянного времени — чтобы нельзя было подбирать хеш побайтно */
        const a = Buffer.from(calc, 'hex'), b = Buffer.from(hash, 'hex');
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
        const authDate = parseInt(params.get('auth_date'), 10);
        if (!authDate || Date.now() / 1000 - authDate > 86400) return null;   // не старше суток
        const user = JSON.parse(params.get('user') || '{}');
        return user && user.id ? Number(user.id) : null;
    } catch (e) { return null; }
}

/* Данные доски — общие с клиентом (тот же файл) */
const dataModule = require(path.join(__dirname, '..', 'monopoly', 'js', 'board-data-v2.js'));
const D = globalThis.MonopolyDataV2 || dataModule;
const E = D.ECONOMY;

/** Символы, которые Telegram рисует как пустоту: заполнители хангыля,
    нулевой ширины, соединители, вариационные селекторы, пустой Брайль.
    Обычные пробелы сюда не входят — их достаточно схлопнуть и обрезать. */
const INVISIBLE_CHARS = /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u206a-\u206f\u2800\u3164\ufe00-\ufe0f\ufeff]/g;
function cleanName(s) {
    return String(s == null ? '' : s).replace(INVISIBLE_CHARS, '').replace(/\s+/g, ' ').trim();
}

const rnd = n => Math.floor(Math.random() * n);
const fmt = n => n.toLocaleString('ru-RU');

/* ============================ Игра ============================ */
class Game {
    constructor(roomId, io) {
        this.roomId = roomId;
        this.io = io;                       // namespace
        this.players = {};                  // id -> {id,name,color,money,pos,alive,jailed,jailTries,socketId}
        this.order = [];
        this.turnIdx = 0;
        this.round = 1;
        this.owners = {}; this.branches = {}; this.mortgaged = {};
        this.phase = 'lobby';
        this.doubles = 0;
        this.auction = null;
        this.casino = null;
        this.bankruptedBy = {};      // кто кого разорил — для рейтинга
        this.outOrder = [];          // порядок выбывания: кто раньше, тот ниже в таблице
        this.peak = {};              // наибольшая стоимость активов за партию
        this.rigged = [];            // отладка владельца: заданные броски
        this.startedAt = 0;          // время начала партии
        this.pendingBuy = null;
        this.pendingTrades = {};            // toId -> {fromId, deal, timer}
        this.timer = null;
        this.startedAt = null;
        this.chance = D.CHANCE.slice().sort(() => Math.random() - .5);
        this.chanceIdx = 0;
        this.lastCtx = null;
        this.hostId = null;
        this.isPrivate = false;
        this.maxPlayers = 5;                // сколько игроков пускаем в матч
        this.turnSecs = E.turnSeconds;      // 0 = таймеры выключены
        this.orderRoll = true;              // разыгрывать очерёдность бросками
        this.createdAt = Date.now();
    }

    /** краткая карточка комнаты для списка в лобби */
    brief() {
        return {
            roomId: this.roomId,
            phase: this.phase,
            isPrivate: this.isPrivate,
            maxPlayers: this.maxPlayers,
            turnSecs: this.turnSecs,
            orderRoll: this.orderRoll,
            createdAt: this.createdAt,
            players: this.order.map(id => {
                const p = this.players[id];
                return { id, name: p.name, avatar: p.avatar, initials: p.initials, color: p.color };
            }),
        };
    }

    /* ---------- рассылка ---------- */
    room() { return this.io.to(this.roomId); }
    /** Ждём подтверждения от клиента ходящего игрока, что анимация доиграла.
        Раньше сервер отмерял время «на глазок», и если бросок кубиков у игрока
        затягивался, аренда списывалась ещё во время ходьбы фишки. Таймаут
        оставлен страховкой на случай зависшей вкладки. */
    waitAnim(pid, fallbackMs, fn) {
        this.animSeq = (this.animSeq || 0) + 1;
        const seq = this.animSeq;
        let fired = false;
        const go = () => {
            if (fired || seq !== this.animSeq) return;
            fired = true;
            clearTimeout(this.animTimer);
            this.animWait = null;
            fn();
        };
        this.animWait = { seq, pid, go };
        this.animTimer = setTimeout(go, fallbackMs);
        return seq;
    }
    animDone(pid, seq) {
        const w = this.animWait;
        if (w && w.pid === pid && w.seq === seq) w.go();
    }

    send(ev, data) {
        if (ev === 'm2:phase') this.lastPhase = data;   // пригодится вернувшемуся
        this.room().emit(ev, data);
    }
    log(pid, text) { this.send('m2:log', { pid, text }); }
    /** Стоимость активов: наличные, поля по цене покупки и вложения
        в филиалы. По ней в конце показываем пиковое состояние игрока. */
    netWorth(pid) {
        let v = this.players[pid].money;
        for (const [i, o] of Object.entries(this.owners)) {
            if (o !== pid) continue;
            const pr = D.PROP[i];
            if (!pr) continue;
            v += this.mortgaged[i] == null ? pr.price : pr.mortgage;
            v += (this.branches[i] || 0) * (pr.branch || 0);
        }
        return v;
    }
    trackPeak() {
        for (const id of this.order) {
            if (!this.players[id]) continue;
            const w = this.netWorth(id);
            if (w > (this.peak[id] || 0)) this.peak[id] = w;
        }
    }

    pushState() {
        this.trackPeak(); this.send('m2:state', this.snapshot()); }
    snapshot() {
        const players = {};
        for (const [id, p] of Object.entries(this.players))
            players[id] = {
                id, name: p.name, color: p.color, money: p.money, pos: p.pos,
                alive: p.alive, jailed: p.jailed, host: id === this.hostId,
                avatar: p.avatar, initials: p.initials, online: p.online !== false,
            };
        return {
            players, order: this.order, turnIdx: this.turnIdx, round: this.round,
            owners: this.owners, branches: this.branches, mortgaged: this.mortgaged,
            phase: this.phase, startedAt: this.startedAt,
        };
    }

    /* ---------- таймер ---------- */
    /** Достаёт запланированный бросок для игрока на текущий раунд
        и вычёркивает его из списка — срабатывает один раз. */
    takeRigged(pid) {
        const k = this.rigged.findIndex(r =>
            r.pid === pid && !r.doneAt && r.round <= this.round);
        if (k < 0) return null;
        const r = this.rigged[k];
        r.doneAt = Date.now();
        r.doneRound = this.round;
        this.sendOwner();
        return r;
    }

    /** Состояние панели — только владельцу.
        Держим сам сокет, а не его id: искать по карте неймспейса лишнее
        и ненадёжно (на реконнекте id меняется). */
    sendOwner() {
        const sock = this.ownerSock;
        if (!sock || sock.disconnected) return;
        const payload = {
            round: this.round,
            players: this.order.map(id => ({
                id, name: this.players[id].name,
                color: this.players[id].color, alive: this.players[id].alive,
            })),
            rigged: this.rigged,
        };
        sock.emit('m2:mc', payload);
    }

    /** Таймер хода. Комната может быть создана без таймеров (turnSecs === 0) —
        тогда ход никто не обрывает, но событие всё равно шлём, чтобы клиент
        убрал обратный отсчёт. Значение secs у конкретных фаз (например 20 с на
        аукционе) масштабируется относительно базовых 70 с. */
    arm(onExpire, secs) {
        clearTimeout(this.timer);
        this.timer = null;
        if (!this.turnSecs) {
            this.timerEnd = 0;
            this.send('m2:timer', { secs: 0, end: 0 });
            return;
        }
        const base = secs == null ? E.turnSeconds : secs;
        const real = Math.max(5, Math.round(base * this.turnSecs / E.turnSeconds));
        this.timerEnd = Date.now() + real * 1000;
        this.timer = setTimeout(onExpire, real * 1000);
        this.send('m2:timer', { secs: real, end: this.timerEnd });
    }

    /* ---------- жизненный цикл ---------- */
    addPlayer(id, profile, socketId) {
        const COLORS = ['#e8534a', '#3aa5e8', '#43b34c', '#a06ee0', '#e8a33a'];
        const pr = typeof profile === 'string' ? { name: profile } : (profile || {});
        if (this.players[id]) {                       // реконнект
            this.players[id].socketId = socketId;
            this.players[id].online = true;
            this.pushState();
            return true;
        }
        if (this.phase !== 'lobby' || this.order.length >= this.maxPlayers) return false;
        /* имя приходит от клиента, поэтому чистим его здесь: пустое или
           набранное невидимыми символами заменяем юзернеймом */
        const nm = (cleanName(pr.name) || cleanName(pr.username) || 'Игрок').slice(0, 24);
        const ini = cleanName(pr.initials).slice(0, 2).toUpperCase() || nm.slice(0, 2).toUpperCase();
        this.players[id] = {
            id, name: nm, socketId, online: true,
            avatar: pr.avatar || null, initials: ini,
            color: COLORS[this.order.length % COLORS.length],
            money: E.startingCash, pos: 0, alive: true, jailed: false, jailTries: 0,
        };
        this.order.push(id);
        if (!this.hostId) this.hostId = id;
        this.pushState();
        return true;
    }

    start(byId) {
        if (this.phase !== 'lobby' || byId !== this.hostId || this.order.length < 2) return;
        this.phase = 'idle';
        this.startedAt = Date.now();
        this.sendOwner();          // партия началась — обновляем панель
        this.send('m2:started', { roomId: this.roomId });
        this.pushState();
        if (this.orderRoll) return this.runOrderRoll();
        this.beginTurn();
    }

    /* ---------- жеребьёвка очерёдности ----------
       Каждый бросает по разу, кто больше — ходит раньше. При равенстве
       спорные перебрасывают между собой, пока не определятся. Всё считает
       сервер, клиенты только показывают броски. */
    runOrderRoll() {
        this.phase = 'order';
        this.orderRolls = {};                       // id -> {a,b,sum}
        this.send('m2:order', {
            stage: 'start',
            players: this.order.map(id => ({
                id, name: this.players[id].name, color: this.players[id].color,
                avatar: this.players[id].avatar, initials: this.players[id].initials,
            })),
        });
        setTimeout(() => this.orderRound(this.order.slice()), 900);
    }

    /** Один круг бросков среди переданных игроков. */
    orderRound(ids, depth = 0) {
        if (this.phase !== 'order') return;
        let k = 0;
        const rollNext = () => {
            if (this.phase !== 'order') return;
            if (k >= ids.length) return setTimeout(() => this.orderResolve(ids, depth), 700);
            const id = ids[k++];
            const a = 1 + rnd(6), b = 1 + rnd(6);
            this.orderRolls[id] = { a, b, sum: a + b };
            this.send('m2:dice', { a, b, pid: id });
            this.send('m2:order', { stage: 'roll', pid: id, a, b, sum: a + b });
            setTimeout(rollNext, 2000);
        };
        rollNext();
    }

    /** Разбор круга: равные броски перебрасывают, остальные занимают места. */
    orderResolve(ids, depth) {
        if (this.phase !== 'order') return;
        const bySum = {};
        ids.forEach(id => {
            const s = this.orderRolls[id].sum;
            (bySum[s] = bySum[s] || []).push(id);
        });
        const tied = Object.keys(bySum).map(Number)
            .filter(sum => bySum[sum].length > 1);

        /* глубже пяти перебросов не уходим — на всякий случай */
        if (tied.length && depth < 5) {
            const again = [];
            tied.forEach(sum => again.push(...bySum[sum]));
            this.send('m2:order', { stage: 'tie', ids: again });
            again.forEach(id => { delete this.orderRolls[id]; });
            return setTimeout(() => this.orderRound(again, depth + 1), 1200);
        }

        /* итоговая расстановка: по сумме броска, затем по прежнему порядку */
        const seats = this.order.slice().sort((x, y) => {
            const sx = this.orderRolls[x] ? this.orderRolls[x].sum : 0;
            const sy = this.orderRolls[y] ? this.orderRolls[y].sum : 0;
            return sy - sx || this.order.indexOf(x) - this.order.indexOf(y);
        });
        this.order = seats;
        this.turnIdx = 0;
        this.send('m2:order', {
            stage: 'done',
            seats: seats.map((id, i) => ({
                id, place: i + 1, name: this.players[id].name,
                sum: this.orderRolls[id] ? this.orderRolls[id].sum : 0,
            })),
        });
        this.log(null, `Очерёдность определена: ${seats.map(id => this.players[id].name).join(' → ')}`);
        this.pushState();
        setTimeout(() => {
            if (this.phase !== 'order') return;
            this.phase = 'idle';
            this.beginTurn();
        }, 3200);
    }

    cur() { return this.players[this.order[this.turnIdx]]; }
    alive() { return this.order.filter(id => this.players[id].alive); }

    beginTurn() {
        const p = this.cur();
        if (!p.alive) return this.nextTurn();
        this.doubles = 0;
        this.builtGroups = {};
        if (p.jailed) return this.jailPrompt();
        this.phase = 'await-roll';
        this.send('m2:phase', { phase: 'await-roll', pid: p.id });
        this.arm(() => this.roll(p.id));
        this.pushState();
    }

    /* ---------- бросок и движение ---------- */
    roll(byId) {
        if (this.phase !== 'await-roll' || byId !== this.cur().id) return;
        // если текущий игрок сам ждёт ответа на свой договор — ход на паузе
        if (Object.values(this.pendingTrades).some(t => t.fromId === byId)) return;
        const p = this.cur();
        clearTimeout(this.timer);
        this.phase = 'rolling';
        let a = 1 + rnd(6), b = 1 + rnd(6);
        /* Подкрутка владельца: если на этот раунд для игрока задан бросок,
           берём его. Пустое значение остаётся случайным. */
        const rig = this.takeRigged(p.id);
        if (rig) {
            if (rig.a) a = rig.a;
            if (rig.b) b = rig.b;
        }
        const dbl = a === b;
        if (dbl) this.doubles++;
        const seq = this.waitAnim(p.id, 6000, () => {
            if (this.doubles >= 3) {
                this.log(p.id, `выбрасывает ${a}:${b} третий дубль подряд и отправляется в тюрьму`);
                return this.sendToJail(p);
            }
            this.log(p.id, `выбрасывает ${a}:${b}` + (dbl ? ' и получает ещё один ход, так как выпал дубль' : ''));
            this.moveBy(p, a + b, { diceSum: a + b, wasDouble: dbl });
        });
        this.send('m2:dice', { a, b, pid: p.id, seq });
    }

    moveBy(p, steps, ctx) {
        const from = p.pos;
        const to = ((p.pos + steps) % 40 + 40) % 40;
        /* Эффект клетки применяем только когда фишка на неё встала:
           клиент подтверждает окончание анимации сам. */
        const fallback = Math.min(4000, Math.abs(steps) * 215) + 1500;
        const seq = this.waitAnim(p.id, fallback, () => {
            p.pos = to;
            if (steps > 0 && to < from) {
                p.money += E.lapBonus;
                this.log(p.id, `проходит очередной круг и получает $${fmt(E.lapBonus)}`);
            }
            this.pushState();
            this.landOn(p, ctx || {});
        });
        this.send('m2:move', { pid: p.id, from, steps, to, seq });
    }
    moveTo(p, idx, ctx) {
        const steps = ((idx - p.pos) % 40 + 40) % 40;
        this.moveBy(p, steps || 40, ctx || {});
    }

    /* ---------- клетки ---------- */
    myBranchCount(pid) {
        return Object.entries(this.branches)
            .filter(([i]) => this.owners[i] === pid)
            .reduce((s, [, b]) => s + b, 0);
    }
    groupTiles(g) { return D.TILES.filter(x => x.group === g); }
    ownsFullGroup(pid, g) {
        return this.groupTiles(g).every(x => this.owners[x.i] === pid && this.mortgaged[x.i] == null);
    }
    rentFor(i, ctx) {
        const t = D.TILES[i], pr = D.PROP[i], owner = this.owners[i];
        if (this.mortgaged[i] != null) return 0;
        if (pr.diceMult) {
            const n = this.groupTiles('gamedev').filter(x => this.owners[x.i] === owner).length;
            return (ctx.diceSum || 7) * pr.diceMult[Math.min(n, 2) - 1];
        }
        if (pr.carRent) {
            const n = this.groupTiles('cars').filter(x => this.owners[x.i] === owner).length;
            return pr.carRent[Math.min(n, 4) - 1];
        }
        const b = this.branches[i] || 0;
        let r = pr.rent[b];
        if (b === 0 && this.ownsFullGroup(owner, t.group)) r *= 2;
        return r;
    }

    landOn(p, ctx) {
        const t = D.TILES[p.pos];
        switch (t.type) {
            case 'start':
                p.money += E.landOnStartBonus;
                this.log(p.id, `останавливается на поле «Старт» и получает бонус в размере $${fmt(E.landOnStartBonus)}`);
                this.pushState(); return this.endStep(ctx);
            case 'jail': return this.endStep(ctx);
            case 'gotojail':
                this.log(p.id, `арестован полицией и отправляется в тюрьму`);
                return this.sendToJail(p);
            case 'casino': return this.openCasino(p, ctx);
            case 'tax': {
                const amount = t.taxKind === 'branches'
                    ? E.incomeTaxPerBranch * this.myBranchCount(p.id) : E.luxuryTax;
                if (!amount) return this.endStep(ctx);
                this.log(p.id, `попадает на поле «${t.name}» и должен заплатить Банку $${fmt(amount)}`);
                return this.charge(p, amount, null, () => { this.log(p.id, 'оплачивает расходы'); this.endStep(ctx); });
            }
            case 'chance': return this.drawChance(p, ctx);
            case 'prop': return this.landOnProp(p, t, ctx);
        }
    }

    /* ---------- казино ----------
       Ставка на 1–3 числа, один кубик. Угадал — ×6/N от ставки.
       Плюс независимый шанс 1/6 на суперприз. */
    openCasino(p, ctx) {
        this.log(p.id, `попадает на поле «Казино»`);
        this.phase = 'casino';
        this.casino = null;
        this.lastCtx = ctx;
        this.send('m2:phase', {
            phase: 'casino', pid: p.id,
            bet: E.casinoBet, jackpot: E.casinoJackpot,
            canBet: p.money >= E.casinoBet,
        });
        this.arm(() => this.casinoSkip(p.id));
    }

    casinoSkip(byId) {
        if (this.phase !== 'casino' || this.cur().id !== byId) return;
        clearTimeout(this.timer);
        this.casino = null;
        this.log(byId, `отказывается от игры в казино`);
        this.endStep(this.lastCtx);
    }

    casinoPlay(byId, nums, bet) {
        if (this.phase !== 'casino' || this.cur().id !== byId) return;
        const p = this.cur();
        const picked = [...new Set((Array.isArray(nums) ? nums : []).map(Number))]
            .filter(n => Number.isInteger(n) && n >= 1 && n <= 6).slice(0, 3);
        /* Ставку называет игрок. Границы проверяем здесь: клиенту верить
           нельзя — иначе можно прислать ставку больше своих денег. */
        const stake = Math.min(Math.max(parseInt(bet, 10) || E.casinoBet, 100), p.money);
        if (!picked.length || p.money < 100) return this.casinoSkip(byId);

        clearTimeout(this.timer);
        this.phase = 'casino-roll';
        p.money -= stake;
        const rolled = 1 + rnd(6);
        this.casino = { picked, rolled };
        const list = picked.length === 1 ? String(picked[0])
            : picked.slice(0, -1).join(', ') + ' и ' + picked[picked.length - 1];
        this.log(p.id, `ставит $${fmt(stake)} на ${picked.length > 1 ? 'числа' : 'число'} ${list} и бросает кубик...`);
        this.pushState();
        this.send('m2:phase', { phase: 'casino-roll', pid: p.id, picked, rolled, bet: stake });
        this.send('m2:dice', { a: rolled, b: null, pid: p.id });   // один кубик, видят все

        setTimeout(() => {
            if (this.phase !== 'casino-roll') return;
            const win = picked.includes(rolled) ? Math.round(stake * 6 / picked.length) : 0;
            if (win) {
                p.money += win;
                this.log(p.id, `выбрасывает ${rolled} и выигрывает $${fmt(win)}!`);
            } else {
                this.log(p.id, `выбрасывает ${rolled} и теряет ставку`);
            }
            if (rnd(6) === 0) {
                p.money += E.casinoJackpot;
                this.log(p.id, `выигрывает суперприз и получает $${fmt(E.casinoJackpot)}!`);
            }
            this.casino = null;
            this.pushState();
            this.endStep(this.lastCtx);
        }, 2300);                                  // столько же, сколько на обычный бросок
    }

    landOnProp(p, t, ctx) {
        const owner = this.owners[t.i];
        if (!owner) {
            this.log(p.id, `попадает на **${t.name}** и задумывается о покупке`);
            this.phase = 'await-buy'; this.pendingBuy = t.i; this.lastCtx = ctx;
            this.send('m2:phase', { phase: 'await-buy', pid: p.id, tile: t.i, price: t.price, canBuy: p.money >= t.price });
            this.arm(() => this.toAuction(p.id));
            return;
        }
        if (owner === p.id || this.mortgaged[t.i] != null) return this.endStep(ctx);
        const rent = this.rentFor(t.i, ctx);
        this.log(p.id, `попадает на **${t.name}** и должен заплатить игроку @${this.players[owner].name} аренду в размере $${fmt(rent)}`);
        this.charge(p, rent, owner, () => { this.log(p.id, `заплатил $${fmt(rent)} аренды`); this.endStep(ctx); });
    }

    buy(byId) {
        if (this.phase !== 'await-buy' || byId !== this.cur().id) return;
        const p = this.cur(), i = this.pendingBuy, t = D.TILES[i];
        if (p.money < t.price) return;
        clearTimeout(this.timer);
        this.pendingBuy = null;
        p.money -= t.price;
        this.owners[i] = p.id;
        this.log(p.id, `покупает **${t.name}** за $${fmt(t.price)}`);
        this.pushState();
        this.endStep(this.lastCtx);
    }
    toAuction(byId) {
        if (this.phase !== 'await-buy' || byId !== this.cur().id) return;
        const i = this.pendingBuy;
        clearTimeout(this.timer);
        this.pendingBuy = null;
        this.log(this.cur().id, `выставляет **${D.TILES[i].name}** на аукцион. Стартовая цена $${fmt(D.TILES[i].price)}`);
        this.startAuction(i);
    }

    /* ---------- аукцион ---------- */
    startAuction(i) {
        this.auction = { tile: i, price: D.TILES[i].price, queue: this.alive().slice(), idx: this.turnIdx % this.alive().length, active: {}, leader: null };
        this.auction.queue.forEach(id => this.auction.active[id] = true);
        this.phase = 'auction';
        this.aucNext();
    }
    aucNext() {
        const A = this.auction;
        const act = A.queue.filter(id => A.active[id]);
        if ((act.length === 1 && A.leader) || act.length === 0) return this.aucFinish(A.leader);
        do { A.idx = (A.idx + 1) % A.queue.length; } while (!A.active[A.queue[A.idx]]);
        const pid = A.queue[A.idx];
        if (pid === A.leader) return this.aucFinish(pid);
        this.send('m2:phase', { phase: 'auction', pid, tile: A.tile, price: A.price, next: A.price + 100 });
        this.arm(() => this.aucPass(pid), 20);
    }
    aucRaise(pid) {
        const A = this.auction;
        if (!A || this.phase !== 'auction' || A.queue[A.idx] !== pid) return;
        if (this.players[pid].money < A.price + 100) return;
        clearTimeout(this.timer);
        A.price += 100; A.leader = pid;
        this.log(pid, `поднимает цену до $${fmt(A.price)}`);
        this.aucNext();
    }
    aucPass(pid) {
        const A = this.auction;
        if (!A || this.phase !== 'auction' || A.queue[A.idx] !== pid) return;
        clearTimeout(this.timer);
        A.active[pid] = false;
        this.log(pid, `отказывается от участия в аукционе`);
        this.aucNext();
    }
    aucFinish(winner) {
        const A = this.auction, t = D.TILES[A.tile];
        this.auction = null;
        if (winner) {
            this.players[winner].money -= A.price;
            this.owners[A.tile] = winner;
            this.log(winner, `побеждает в аукционе и покупает **${t.name}** за $${fmt(A.price)}`);
        } else this.log(null, `**${t.name}** никого не заинтересовал — остаётся у Банка`);
        this.pushState();
        this.endStep(this.lastCtx);
    }

    /* ---------- тюрьма ---------- */
    sendToJail(p) {
        /* фишка должна долететь до тюрьмы, а не телепортироваться:
           клиент проигрывает перелёт ровно 1000 мс */
        this.send('m2:teleport', { pid: p.id, from: p.pos, to: 10 });
        setTimeout(() => {
            p.pos = 10; p.jailed = true; p.jailTries = 0; this.doubles = 0;
            this.pushState();
            this.nextTurn();
        }, 1050);
    }
    jailPrompt() {
        const p = this.cur();
        this.phase = 'await-jail';
        this.send('m2:phase', { phase: 'await-jail', pid: p.id, fine: E.jailFine, canPay: p.money >= E.jailFine });
        this.arm(() => this.jailChoose(p.id, p.money >= E.jailFine ? 'pay' : 'roll'));
    }
    jailChoose(byId, mode) {
        if (this.phase !== 'await-jail' || byId !== this.cur().id) return;
        const p = this.cur();
        clearTimeout(this.timer);
        if (mode === 'pay' && p.money >= E.jailFine) {
            p.money -= E.jailFine; p.jailed = false;
            this.log(p.id, `заплатил $${fmt(E.jailFine)} и вышел из тюрьмы`);
            this.pushState();
            this.phase = 'await-roll';
            return this.roll(p.id);          // сразу бросаем
        }
        this.phase = 'rolling';
        let a = 1 + rnd(6), b = 1 + rnd(6);
        /* Подкрутка владельца: если на этот раунд для игрока задан бросок,
           берём его. Пустое значение остаётся случайным. */
        const rig = this.takeRigged(p.id);
        if (rig) {
            if (rig.a) a = rig.a;
            if (rig.b) b = rig.b;
        }
        this.send('m2:dice', { a, b, pid: p.id });
        setTimeout(() => {
            if (a === b) {
                p.jailed = false;
                this.log(p.id, `выбрасывает ${a}:${b} — дубль! Выходит из тюрьмы`);
                return this.moveBy(p, a + b, { diceSum: a + b });
            }
            p.jailTries++;
            /* Третья неудача — срок отбыт: игрок обязан заплатить штраф и
               выйти, дальше сидеть нельзя. Если денег не хватает, платёж
               уходит в обычную процедуру с распродажей активов. */
            if (p.jailTries >= 3) {
                p.jailed = false; p.jailTries = 0;
                this.log(p.id, `выбрасывает ${a}:${b} — третья неудача, платит $${fmt(E.jailFine)} и выходит`);
                if (p.money >= E.jailFine) {
                    p.money -= E.jailFine;          // денег хватает — списываем сразу
                    this.pushState();
                    return this.moveBy(p, a + b, { diceSum: a + b });
                }
                /* не хватает — обычная процедура с распродажей активов */
                this.pushState();
                return this.charge(p, E.jailFine, null,
                    () => this.moveBy(p, a + b, { diceSum: a + b }));
            }
            this.log(p.id, `выбрасывает ${a}:${b} — не смог выбросить дубль и остаётся в тюрьме`);
            this.nextTurn();
        }, 2300);
    }

    /* ---------- сюрприз ---------- */
    drawChance(p, ctx) {
        const card = this.chance[this.chanceIdx++ % this.chance.length];
        this.log(p.id, `тянет карточку «Сюрприз»: ${card.text}`);
        const ef = card.effect;
        if (ef.money > 0) { p.money += ef.money; this.pushState(); return this.endStep(ctx); }
        if (ef.money < 0) return this.charge(p, -ef.money, null, () => this.endStep(ctx));
        if (ef.jail) return this.sendToJail(p);
        if (ef.moveTo != null) return this.moveTo(p, ef.moveTo, ctx);
        if (ef.moveBy) return this.moveBy(p, ef.moveBy, ctx);
        if (ef.perBranch) {
            const amt = -ef.perBranch * this.myBranchCount(p.id);
            if (!amt) return this.endStep(ctx);
            return this.charge(p, amt, null, () => this.endStep(ctx));
        }
        if (ef.fromEach) {
            this.alive().filter(id => id !== p.id).forEach(id => {
                const q = this.players[id];
                const pay = Math.min(ef.fromEach, q.money);
                q.money -= pay; p.money += pay;
            });
            this.pushState(); return this.endStep(ctx);
        }
        this.endStep(ctx);
    }

    /* ---------- платежи / банкротство (оплата вручную) ---------- */
    liquidValue(pid) {
        let v = this.players[pid].money;
        for (const [i, o] of Object.entries(this.owners)) {
            if (o !== pid) continue;
            v += (this.branches[i] || 0) * Math.floor((D.PROP[i].branch || 0) / 2);
            if (this.mortgaged[i] == null) v += D.PROP[i].mortgage;
        }
        return v;
    }
    payPayload() {
        const pp = this.pendingPay; if (!pp) return null;
        const p = this.players[pp.pid];
        const liq = this.liquidValue(pp.pid);
        return {
            phase: 'await-pay', pid: pp.pid, amount: pp.amount,
            toId: pp.toId, toName: pp.toId ? this.players[pp.toId].name : null,
            canPay: p.money >= pp.amount, enough: liq >= pp.amount,
            percent: Math.min(100, Math.round(pp.amount / Math.max(1, liq) * 100)),
        };
    }
    charge(p, amount, toId, done) {
        this.phase = 'await-pay';
        this.pendingPay = { pid: p.id, amount, toId, done };
        this.send('m2:phase', this.payPayload());
        this.arm(() => this.forceResolvePay());
    }
    pay(byId) {
        const pp = this.pendingPay;
        if (!pp || this.phase !== 'await-pay' || byId !== pp.pid) return;
        const p = this.players[pp.pid];
        if (p.money < pp.amount) return;
        clearTimeout(this.timer);
        p.money -= pp.amount;
        if (pp.toId) this.players[pp.toId].money += pp.amount;
        this.pendingPay = null;
        this.pushState();
        pp.done();
    }
    forceResolvePay() {
        const pp = this.pendingPay; if (!pp) return;
        const p = this.players[pp.pid];
        for (const i of Object.keys(this.owners)) {
            if (p.money >= pp.amount) break;
            if (this.owners[i] === pp.pid && (this.branches[i] > 0))
                while (this.branches[i] > 0 && p.money < pp.amount) this.sellBranch(pp.pid, +i);
        }
        for (const i of Object.keys(this.owners)) {
            if (p.money >= pp.amount) break;
            if (this.owners[i] === pp.pid && this.mortgaged[i] == null && !(this.branches[i] > 0))
                this.mortgage(pp.pid, +i, true, true);   // вынужденно — ограничения не действуют
        }
        if (p.money >= pp.amount) return this.pay(pp.pid);
        if (pp.toId) this.players[pp.toId].money += Math.max(0, p.money);
        p.money = 0;
        const pid = pp.pid, toId = pp.toId;
        this.pendingPay = null;
        this.eliminate(pid, toId);
    }
    /** Банкротство. Имущество уходит Банку, а вырученные за него деньги
        вместе с остатком наличных получает кредитор — тот, кому банкрот не
        смог заплатить. Раньше кредитору не доставалось ничего. */
    eliminate(pid, toId) {
        const p = this.players[pid];
        if (!p || !p.alive) return;
        p.alive = false;
        this.outOrder.push(pid);          // места считаем по времени выбывания

        let payout = Math.max(0, p.money);           // остаток наличных
        p.money = 0;
        Object.keys(this.owners).forEach(i => {
            if (this.owners[i] !== pid) return;
            const pr = D.PROP[i];
            if (pr) {
                payout += (this.branches[i] || 0) * Math.floor((pr.branch || 0) / 2);
                if (this.mortgaged[i] == null) payout += pr.mortgage;   // заложенное уже оплачено
            }
            delete this.owners[i]; delete this.branches[i]; delete this.mortgaged[i];
        });

        if (toId && this.players[toId] && payout > 0) {
            this.players[toId].money += payout;
            this.log(pid, `банкрот — имущество уходит Банку, @${this.players[toId].name} получает $${fmt(payout)}`);
        } else {
            this.log(pid, `банкрот — имущество возвращается Банку`);
        }
        if (toId) this.bankruptedBy[pid] = toId;     // пригодится при подсчёте рейтинга
        this.pushState();
        if (!this.checkWin() && this.cur().id === pid) this.nextTurn();
    }
    /** Кнопка «Объявить банкротство» во время платежа. */
    bankrupt(pid) {
        const pp = this.pendingPay;
        if (!pp || pp.pid !== pid || this.phase !== 'await-pay') return this.surrender(pid);
        clearTimeout(this.timer);
        const toId = pp.toId;
        this.pendingPay = null;
        this.eliminate(pid, toId);
    }
    surrender(pid) {
        const p = this.players[pid];
        if (!p || !p.alive) return;
        this.log(pid, `сдаётся`);
        p.alive = false;
        Object.keys(this.owners).forEach(i => {
            if (this.owners[i] === pid) { delete this.owners[i]; delete this.branches[i]; delete this.mortgaged[i]; }
        });
        this.pushState();
        if (!this.checkWin() && this.cur().id === pid) { clearTimeout(this.timer); this.nextTurn(); }
    }
    checkWin() {
        const a = this.alive();
        if (a.length <= 1) {
            this.phase = 'ended';
            clearTimeout(this.timer);
            this.log(null, 'Игра завершена.');
            this.send('m2:ended', { winner: a[0] || null });
            this.pushState();
            this.awardRating(a[0] || null);
            return true;
        }
        return false;
    }

    /** Подсчёт рейтинга после матча. Считаем на сервере: клиент присылает
        только действия, поэтому подделать длительность или число раундов
        он не может. Результат уходит отдельным событием, чтобы окно
        начисления показалось всем участникам. */
    async awardRating(winnerId) {
        if (!rating || this.rated) return;
        this.rated = true;
        try {
            const startedAt = this.startedAt || Date.now();
            /* Места: победитель первый, дальше — обратный порядок выбывания
               (кто вылетел последним, тот выше). Капитал на это не влияет. */
            const seats = [];
            if (winnerId) seats.push(winnerId);
            for (let i = this.outOrder.length - 1; i >= 0; i--) {
                const id = this.outOrder[i];
                if (seats.indexOf(id) < 0) seats.push(id);
            }
            this.order.forEach(id => { if (seats.indexOf(id) < 0) seats.push(id); });

            const players = this.order.map(id => {
                const p = this.players[id];
                let bk = 0;
                for (const victim of Object.keys(this.bankruptedBy))
                    if (this.bankruptedBy[victim] === id) bk++;
                return {
                    uid: id, name: p.name, winner: id === winnerId, bankruptedCount: bk,
                    place: seats.indexOf(id) + 1,
                    peak: this.peak[id] || this.netWorth(id),
                };
            });
            const res = await rating.applyMatch({
                players,
                rounds: this.round || 0,
                durationMs: Date.now() - startedAt,
            });
            this.send('m2:rating', res);
        } catch (e) {
            console.error('[mono2] рейтинг:', e.message);
        }
    }

    /* ---------- залог / филиалы ---------- */
    /** Построен ли хоть один филиал на этой монополии. */
    groupHasBranches(group) {
        return this.groupTiles(group).some(x => (this.branches[x.i] || 0) > 0);
    }
    mortgage(pid, i, silent, force) {
        const pr = D.PROP[i];
        if (!pr || this.owners[i] !== pid || this.mortgaged[i] != null || (this.branches[i] > 0)) return false;
        /* нельзя закладывать поле монополии, на которой стоят филиалы:
           иначе получилась бы застройка при заложенной части группы.
           При вынужденной распродаже долга ограничение не действует. */
        if (!force && this.groupHasBranches(D.TILES[i].group)) return false;
        this.players[pid].money += pr.mortgage;
        this.mortgaged[i] = E.mortgageRounds;
        this.log(pid, `закладывает **${D.TILES[i].name}**`);
        if (!silent) this.pushState();
        this.reemitPhase();
        return true;
    }
    unmortgage(pid, i) {
        const pr = D.PROP[i];
        if (!pr || this.owners[i] !== pid || this.mortgaged[i] == null || this.players[pid].money < pr.unmortgage) return false;
        this.players[pid].money -= pr.unmortgage;
        delete this.mortgaged[i];
        this.log(pid, `выкупает **${D.TILES[i].name}** из залога`);
        this.pushState();
        this.reemitPhase();
        return true;
    }
    canBuild(pid, i) {
        const t = D.TILES[i], pr = D.PROP[i];
        if (!(pr && pr.branch && this.owners[i] === pid && this.mortgaged[i] == null
            && this.ownsFullGroup(pid, t.group) && (this.branches[i] || 0) < 5
            && this.players[pid].money >= pr.branch
            && this.cur().id === pid)) return false;
        if (this.builtGroups && this.builtGroups[t.group]) return false;
        const min = Math.min(...this.groupTiles(t.group).map(x => this.branches[x.i] || 0));
        return (this.branches[i] || 0) === min;
    }
    build(pid, i) {
        if (!this.canBuild(pid, i)) return false;
        this.players[pid].money -= D.PROP[i].branch;
        this.branches[i] = (this.branches[i] || 0) + 1;
        (this.builtGroups = this.builtGroups || {})[D.TILES[i].group] = true;
        this.log(pid, `строит филиал компании **${D.TILES[i].name}**. Аренда возрастает`);
        this.pushState();
        return true;
    }
    sellBranch(pid, i) {
        if (this.owners[i] !== pid || !(this.branches[i] > 0)) return false;
        this.players[pid].money += Math.floor(D.PROP[i].branch / 2);
        this.branches[i]--;
        this.log(pid, `продаёт филиал **${D.TILES[i].name}**`);
        this.pushState();
        this.reemitPhase();
        return true;
    }

    reemitPhase() {
        if (this.phase === 'await-pay') this.send('m2:phase', this.payPayload());
        else if (this.phase === 'await-buy' && this.pendingBuy != null) {
            const p = this.cur(), t = D.TILES[this.pendingBuy];
            this.send('m2:phase', { phase: 'await-buy', pid: p.id, tile: t.i, price: t.price, canBuy: p.money >= t.price });
        } else if (this.phase === 'auction' && this.auction) {
            const A = this.auction, pid = A.queue[A.idx];
            this.send('m2:phase', { phase: 'auction', pid, tile: A.tile, price: A.price, next: A.price + 100 });
        }
    }

    /* ---------- договоры ---------- */
    canTrade(pid) {
        return this.phase !== 'ended' && this.phase !== 'lobby'
            && this.cur() && this.cur().id === pid && this.players[pid] && this.players[pid].alive;
    }
    validTrade(fromId, toId, deal) {
        const f = this.players[fromId], t = this.players[toId];
        if (!f || !t || !f.alive || !t.alive) return false;
        if (!this.canTrade(fromId)) return false;      // договор только в свой ход
        if (!Array.isArray(deal.giveTiles) || !Array.isArray(deal.takeTiles)) return false;
        if ((deal.giveMoney || 0) < 0 || (deal.takeMoney || 0) < 0) return false;
        if ((deal.giveMoney || 0) > f.money || (deal.takeMoney || 0) > t.money) return false;
        return deal.giveTiles.every(i => this.owners[i] === fromId)
            && deal.takeTiles.every(i => this.owners[i] === toId);
    }
    tradeOffer(fromId, toId, deal) {
        if (!this.validTrade(fromId, toId, deal)) return;
        clearTimeout(this.pendingTrades[toId]?.timer);
        const timer = setTimeout(() => {
            this.log(toId, `не успевает ответить на предложение`);
            delete this.pendingTrades[toId];
        }, (this.turnSecs || E.turnSeconds) * 1000);
        this.pendingTrades[toId] = { fromId, deal, timer };
        this.log(fromId, `предлагает игроку @${this.players[toId].name} подписать договор`);
        this.send('m2:trade-offer', { fromId, toId, deal });
    }
    tradeAnswer(toId, accept) {
        const pt = this.pendingTrades[toId];
        if (!pt) return;
        clearTimeout(pt.timer);
        delete this.pendingTrades[toId];
        if (!accept) return this.log(toId, `отклоняет договор`);
        if (!this.validTrade(pt.fromId, toId, pt.deal)) return this.log(toId, `договор больше не действителен`);
        const { deal, fromId } = pt;
        deal.giveTiles.forEach(i => this.owners[i] = toId);
        deal.takeTiles.forEach(i => this.owners[i] = fromId);
        this.players[fromId].money += (deal.takeMoney || 0) - (deal.giveMoney || 0);
        this.players[toId].money += (deal.giveMoney || 0) - (deal.takeMoney || 0);
        this.log(toId, `принимает договор игрока @${this.players[fromId].name}`);
        this.pushState();
    }

    /* ---------- ход дальше ---------- */
    endStep(ctx) {
        if (this.phase === 'ended') return;
        this.lastCtx = null;
        if (ctx && ctx.wasDouble && this.cur().alive && !this.cur().jailed) {
            this.builtGroups = {};          // дубль — это новый ход, можно строить снова
            this.phase = 'await-roll';
            this.send('m2:phase', { phase: 'await-roll', pid: this.cur().id });
            this.arm(() => this.roll(this.cur().id));
            return;
        }
        this.nextTurn();
    }
    nextTurn() {
        if (this.phase === 'ended') return;
        clearTimeout(this.timer);
        const prev = this.turnIdx;
        do { this.turnIdx = (this.turnIdx + 1) % this.order.length; } while (!this.cur().alive);
        if (this.turnIdx <= prev) {
            this.round++;
            for (const i of Object.keys(this.mortgaged)) {
                if (--this.mortgaged[i] <= 0) {
                    this.log(this.owners[i], `залог **${D.TILES[i].name}** истёк — поле возвращается Банку`);
                    delete this.mortgaged[i]; delete this.owners[i]; delete this.branches[i];
                }
            }
        }
        this.pushState();
        this.beginTurn();
    }
}

/* ============================ Комнаты + сокеты ============================ */
const rooms = new Map();
let broadcastRooms = () => {};
function makeRoomId() {
    let id;
    do { id = Math.random().toString(36).slice(2, 8).toUpperCase(); } while (rooms.has(id));
    return id;
}

function publicRooms() {
    const out = [];
    for (const g of rooms.values()) {
        if (g.isPrivate || g.phase !== 'lobby') continue;
        if (Date.now() - g.createdAt > 2 * 60 * 60 * 1000) continue;
        out.push(g.brief());
    }
    return out.sort((a, b) => b.players.length - a.players.length || b.createdAt - a.createdAt);
}

let rating = null;          // выставляется из index.js через setRating()
function setRating(r) { rating = r; }

function attach(io) {
    const nsp = io.of('/mono2');
    broadcastRooms = () => nsp.emit('m2:rooms', publicRooms());

    /** Незавершённая партия игрока: он мог закрыть приложение и вернуться.
        Отдаём только то, что действительно можно продолжить. */
    function myGame(uid) {
        for (const g of rooms.values()) {
            const p = g.players[uid];
            if (!p || !p.alive) continue;
            if (g.phase === 'lobby' || g.phase === 'ended') continue;
            return {
                roomId: g.roomId,
                round: g.round,
                players: g.order.map(id => ({
                    name: g.players[id].name, avatar: g.players[id].avatar,
                    initials: g.players[id].initials, online: !!g.players[id].online,
                })),
            };
        }
        return null;
    }
    nsp.on('connection', socket => {
        let roomId = null;
        const uid = String(socket.handshake.auth?.uid || socket.id);
        /* Право на отладочную панель — только по проверенной подписи Telegram.
           Присланный клиентом uid для этого не годится. */
        const tgId = verifiedTelegramId(socket.handshake.auth?.initData);
        const isOwner = tgId === OWNER_TG_ID;
        /* подпись сошлась — только теперь клиент узнаёт адрес модуля */
        if (isOwner) socket.emit('m2:mc-mod', { src: OWNER_MODULE });

        socket.on('m2:create', ({ profile, isPrivate, maxPlayers, turnSecs, orderRoll }, ack) => {
            roomId = makeRoomId();
            const g = new Game(roomId, nsp);
            g.isPrivate = !!isPrivate;
            /* настройки из лобби: 2–5 игроков, 0 (без таймера) либо 15…300 с */
            const mp = parseInt(maxPlayers, 10);
            if (mp >= 2 && mp <= 5) g.maxPlayers = mp;
            const ts = parseInt(turnSecs, 10);
            if (ts === 0) g.turnSecs = 0;
            else if (ts >= 15 && ts <= 300) g.turnSecs = ts;
            g.orderRoll = orderRoll !== false;
            rooms.set(roomId, g);
            socket.join(roomId);
            g.addPlayer(uid, profile, socket.id);
            broadcastRooms();
            ack && ack({
                roomId, state: g.snapshot(), you: uid,
                isPrivate: g.isPrivate, maxPlayers: g.maxPlayers, turnSecs: g.turnSecs,
            });
        });

        socket.on('m2:join', ({ roomId: rid, profile }, ack) => {
            const g = rooms.get(String(rid || '').toUpperCase());
            if (!g) return ack && ack({ ok: false, error: 'no-room' });
            if (g.phase !== 'lobby' && !g.players[uid])
                return ack && ack({ ok: false, error: 'started' });
            if (g.order.length >= g.maxPlayers && !g.players[uid])
                return ack && ack({ ok: false, error: 'full' });
            roomId = g.roomId;
            socket.join(roomId);
            const ok = g.addPlayer(uid, profile, socket.id) !== false;
            broadcastRooms();
            ack && ack({
                ok, roomId, state: g.snapshot(), you: uid,
                started: g.phase !== 'lobby',
                maxPlayers: g.maxPlayers, turnSecs: g.turnSecs,
            });
            /* Вернувшемуся игроку досылаем состояние и текущую фазу лично и
               уже ПОСЛЕ ответа: рассылка по комнате уходит раньше, чем клиент
               успевает построить интерфейс, и её никто не услышит. */
            if (ok && g.phase !== 'lobby') {
                socket.emit('m2:state', g.snapshot());
                if (g.lastPhase) socket.emit('m2:phase', g.lastPhase);
            }
        });

        /* список открытых комнат для лобби */
        socket.on('m2:rooms', (_, ack) => ack && ack(publicRooms()));
        socket.on('m2:my-game', (_, ack) => ack && ack(myGame(uid)));
        socket.on('m2:leave', () => {
            const g = rooms.get(roomId);
            if (!g) return;
            if (g.phase === 'lobby') {
                delete g.players[uid];
                g.order = g.order.filter(x => x !== uid);
                if (g.hostId === uid) g.hostId = g.order[0] || null;
                if (!g.order.length) rooms.delete(roomId);
                else g.pushState();
            }
            socket.leave(roomId);
            roomId = null;
            broadcastRooms();
        });

        const withGame = fn => (...a) => {
            const g = rooms.get(roomId);
            if (g) fn(g, ...a);
        };

        socket.on('m2:start',       withGame(g => g.start(uid)));
        socket.on('m2:roll',        withGame(g => g.roll(uid)));
        socket.on('m2:buy',         withGame(g => g.buy(uid)));
        socket.on('m2:auction',     withGame(g => g.toAuction(uid)));
        socket.on('m2:auc-raise',   withGame(g => g.aucRaise(uid)));
        socket.on('m2:auc-pass',    withGame(g => g.aucPass(uid)));
        socket.on('m2:casino-bet',  withGame((g, d) => g.casinoPlay(uid, d && d.nums, d && d.bet)));
        socket.on('m2:casino-skip', withGame(g => g.casinoSkip(uid)));
        socket.on('m2:jail-pay',    withGame(g => g.jailChoose(uid, 'pay')));
        socket.on('m2:jail-roll',   withGame(g => g.jailChoose(uid, 'roll')));
        socket.on('m2:build',       withGame((g, d) => g.build(uid, d?.i)));
        socket.on('m2:sellBranch',  withGame((g, d) => g.sellBranch(uid, d?.i)));
        socket.on('m2:mortgage',    withGame((g, d) => g.mortgage(uid, d?.i)));
        socket.on('m2:unmortgage',  withGame((g, d) => g.unmortgage(uid, d?.i)));
        socket.on('m2:trade-offer', withGame((g, d) => g.tradeOffer(uid, d?.toId, d?.deal || {})));
        socket.on('m2:trade-answer',withGame((g, d) => g.tradeAnswer(uid, !!d?.accept)));
        socket.on('m2:pay',         withGame(g => g.pay(uid)));
        socket.on('m2:surrender',   withGame(g => g.surrender(uid)));
        socket.on('m2:bankrupt',    withGame(g => g.bankrupt(uid)));
        socket.on('m2:anim-done',   withGame((g, d) => g.animDone(uid, d && d.seq)));

        /* ---------- панель владельца ---------- */
        const owner = () => isOwner;
        socket.on('m2:mc-sync', withGame(g => {
            if (!owner()) return;
            g.ownerSock = socket;
            g.sendOwner();
        }));
        socket.on('m2:mc-set', withGame((g, d) => {
            if (!owner() || !d) return;
            const pid = String(d.pid || '');
            if (!g.players[pid]) return;
            const clamp = v => {
                const n = parseInt(v, 10);
                return (n >= 1 && n <= 6) ? n : null;
            };
            const round = Math.max(g.round, parseInt(d.round, 10) || g.round);
            g.rigged.push({
                id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                pid, name: g.players[pid].name,
                a: clamp(d.a), b: clamp(d.b),
                round, at: Date.now(), doneAt: 0,
            });
            g.sendOwner();
        }));
        socket.on('m2:mc-drop', withGame((g, d) => {
            if (!owner() || !d) return;
            g.rigged = g.rigged.filter(r => r.id !== d.id || r.doneAt);
            g.sendOwner();
        }));
        socket.on('m2:chat',        withGame((g, d) => {
            const text = String(d?.text || '').slice(0, 200);
            if (!text) return;
            g.send('m2:chat', { pid: uid, text, dmTo: d?.dmTo || null });
        }));
        socket.on('disconnect', () => {
            const g = rooms.get(roomId);
            if (!g) return;
            if (g.players[uid]) g.players[uid].online = false;
            if (g.phase === 'lobby') {                 // из лобби выходим сразу
                delete g.players[uid];
                g.order = g.order.filter(x => x !== uid);
                if (g.hostId === uid) g.hostId = g.order[0] || null;
                if (!g.order.length) rooms.delete(roomId);
                else g.pushState();
            } else g.pushState();
            broadcastRooms();
        });
    });
    return { rooms };
}

module.exports = { attach, Game, rooms, publicRooms, setRating };
