/* ============================================================
   monopoly-rating.js — рейтинг монополии: очки, титулы, античит.

   Очки за победу зависят от числа игроков: 5 → 15, 4 → 12, 3 → 9, 2 → 6.
   Плюс по одному очку за каждого разорённого соперника (даже если сам
   не выиграл). Чтобы очки начислились, партия должна быть настоящей:
   не меньше 20 минут и определённого числа раундов.

   Античит: серии побед и всплески за короткое время уходят владельцу
   отдельным сообщением с кнопками «Бан» и «Нет читов». Забаненный не
   получает очков сам и обнуляет начисление всем, кто играл с ним в
   одной партии, — иначе аккаунты плодят ради слива игр.

   Хранилище — Supabase (таблица monopoly_rating), при её отсутствии
   модуль продолжает работать в памяти и просто пишет об этом в лог.

   create table if not exists monopoly_rating (
       uid text primary key, points integer not null default 0,
       games integer not null default 0, wins integer not null default 0,
       bankrupted integer not null default 0, streak integer not null default 0,
       banned boolean not null default false, checked integer not null default 0,
       history jsonb not null default '[]'::jsonb,
       updated_at timestamptz not null default now());
   ============================================================ */
'use strict';

/* ---------- титулы ----------
   Порог — суммарные очки. Средняя победа даёт ~10 очков, поэтому до
   «Легенды» нужны тысячи партий. */
const TITLES = [
    { key: 'rookie',    name: 'Новичок',        from: 0 },
    { key: 'tenant',    name: 'Арендатор',      from: 100 },
    { key: 'realtor',   name: 'Риелтор',        from: 350 },
    { key: 'landlord',  name: 'Домовладелец',   from: 900 },
    { key: 'investor',  name: 'Инвестор',       from: 2000 },
    { key: 'developer', name: 'Застройщик',     from: 4200 },
    { key: 'banker',    name: 'Банкир',         from: 8000 },
    { key: 'magnate',   name: 'Магнат',         from: 14000 },
    { key: 'tycoon',    name: 'Монополист',     from: 24000 },
    { key: 'legend',    name: 'Легенда',        from: 40000 },
];

/** Титул и прогресс до следующего. */
function titleFor(points) {
    const pts = Math.max(0, points | 0);
    let idx = 0;
    for (let i = 0; i < TITLES.length; i++) if (pts >= TITLES[i].from) idx = i;
    const cur = TITLES[idx], next = TITLES[idx + 1] || null;
    const span = next ? next.from - cur.from : 1;
    return {
        key: cur.key, name: cur.name, index: idx, total: TITLES.length,
        from: cur.from,
        nextName: next ? next.name : null,
        nextAt: next ? next.from : null,
        progress: next ? Math.min(1, (pts - cur.from) / span) : 1,
        inTitle: pts - cur.from,
        needed: next ? span : 0,
    };
}

/* ---------- условия зачёта партии ---------- */
const WIN_POINTS = { 2: 6, 3: 9, 4: 12, 5: 15, 6: 18 };
const TEAM_WIN_POINTS = 7;              // победа в командном матче 2×2
const MIN_ROUNDS = { 2: 20, 3: 15, 4: 10, 5: 10, 6: 10 };
const MIN_ROUNDS_ANY = 10;      /* короче десяти раундов партия не считается
                                   настоящей ни при каком числе игроков */
const MIN_MINUTES = 20;

/** Засчитывать ли партию: и время, и раунды должны быть настоящими. */
function roundsNeeded(players) {
    const n = Math.max(2, Math.min(6, players | 0));
    return Math.max(MIN_ROUNDS_ANY, MIN_ROUNDS[n] || 20);
}
function matchCounts({ players, rounds, durationMs }) {
    const minutes = durationMs / 60000;
    return minutes >= MIN_MINUTES && rounds >= roundsNeeded(players);
}

/* ---------- пороги проверок ---------- */
const STREAK_LIMIT = 10;          // побед подряд
const BURST_LIMIT = 4;            // побед за 2 часа
const BURST_WINDOW = 2 * 3600e3;
const DAY = 24 * 3600e3;

function makeRating(opts) {
    const supabase = opts && opts.supabase;
    const notify = (opts && opts.notify) || (() => {});
    const log = (opts && opts.log) || console.log;

    const cache = new Map();      // uid -> запись
    let tableOk = true;

    function blank(uid) {
        return {
            uid, points: 0, games: 0, wins: 0, bankrupted: 0,
            streak: 0, banned: false, checked: 0, unfairCount: 0,
            history: [],           // отметки времени побед, для всплесков
            lastReport: 0,
        };
    }

    async function load(uid) {
        if (cache.has(uid)) return cache.get(uid);
        let rec = blank(uid);
        if (supabase && tableOk) {
            try {
                const { data, error } = await supabase
                    .from('monopoly_rating').select('*').eq('uid', uid).maybeSingle();
                if (error && error.code === '42P01') {   // таблицы нет
                    tableOk = false;
                    log('[rating] таблицы monopoly_rating нет — работаю в памяти');
                } else if (data) {
                    rec = Object.assign(rec, data, {
                        history: Array.isArray(data.history) ? data.history : [],
                        unfairCount: data.unfair_count | 0,
                    });
                }
            } catch (e) { log('[rating] load:', e.message); }
        }
        cache.set(uid, rec);
        return rec;
    }

    async function save(rec) {
        cache.set(rec.uid, rec);
        if (!supabase || !tableOk) return;
        try {
            await supabase.from('monopoly_rating').upsert({
                uid: rec.uid, points: rec.points, games: rec.games, wins: rec.wins,
                bankrupted: rec.bankrupted, streak: rec.streak, banned: rec.banned,
                checked: rec.checked, history: rec.history,
                unfair_count: rec.unfairCount | 0,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'uid' });
        } catch (e) { log('[rating] save:', e.message); }
    }

    /* ---------- бан ---------- */
    async function setBanned(uid, banned) {
        const rec = await load(uid);
        rec.banned = !!banned;
        rec.checked = (rec.checked | 0) + 1;      // проверку помним в любом случае
        if (banned) rec.streak = 0;
        await save(rec);
        return rec;
    }
    async function isBanned(uid) { return (await load(uid)).banned; }

    /** Статистика за сутки — для сообщения владельцу. */
    function dayStats(rec) {
        const since = Date.now() - DAY;
        const wins = rec.history.filter(t => t >= since).length;
        return { wins, games: rec.gamesDay || wins };
    }

    /* ---------- начисление за партию ----------
       players: [{ uid, name, winner, bankruptedCount }]
       Возвращает разбор по каждому игроку для красивого окна на клиенте. */
    async function applyMatch(match) {
        const { players, rounds, durationMs, withBots, teamMode } = match;
        const n = players.length;
        const counts = matchCounts({ players: n, rounds, durationMs });

        const recs = {};
        for (const p of players) recs[p.uid] = await load(p.uid);

        /* если в партии был забаненный, очки не получает никто */
        const tainted = players.some(p => recs[p.uid].banned);
        /* в режиме 2×2 победа команды стоит 7 очков каждому её участнику */
        const base = teamMode ? TEAM_WIN_POINTS : (WIN_POINTS[Math.max(2, Math.min(6, n))] || 6);
        const result = [];

        for (const p of players) {
            const rec = recs[p.uid];
            const before = rec.points;
            const reasons = [];
            let gained = 0;

            if (counts && !tainted && !rec.banned && !p.unfair && !withBots) {
                if (p.winner) { gained += base; reasons.push({ label: 'Победа', points: base }); }
                const bk = p.bankruptedCount | 0;
                if (bk > 0) {
                    gained += bk;
                    reasons.push({ label: bk === 1 ? 'Соперник разорён' : `Разорено соперников: ${bk}`, points: bk });
                }
            }

            /* Партии, за которые очки не начисляются (короткие, с забаненным
               участником), не попадают и в общую статистику: иначе процент
               побед считался бы по матчам, которых как бы не было. */
            const inStats = gained > 0 || (counts && !tainted && !rec.banned && !p.unfair && !withBots);
            if (p.unfair) {
                rec.unfairCount = (rec.unfairCount | 0) + 1;
                rec.streak = 0;
            }
            if (inStats) {
                rec.games += 1;
                if (p.winner) {
                    rec.wins += 1;
                    rec.streak += 1;
                    rec.history.push(Date.now());
                    if (rec.history.length > 200) rec.history = rec.history.slice(-200);
                } else {
                    rec.streak = 0;
                }
                rec.bankrupted += (p.bankruptedCount | 0);
                rec.points = Math.max(0, rec.points + gained);
            }
            await save(rec);

            result.push({
                uid: p.uid, name: p.name, winner: !!p.winner,
                place: p.place || null, peak: p.peak || 0,
                gained, reasons,
                pointsBefore: before, pointsAfter: rec.points,
                titleBefore: titleFor(before), titleAfter: titleFor(rec.points),
                counted: counts && !tainted && !rec.banned && !p.unfair,
                skipReason: p.unfair ? 'unfair'
                    : rec.banned ? 'banned'
                    : tainted ? 'tainted'
                    : !counts ? 'short' : null,
            });

            if (p.winner && inStats) await maybeReport(rec, p.name);
        }

        return {
            counted: counts && !tainted,
            minMinutes: MIN_MINUTES,
            minRounds: roundsNeeded(n),
            players: result,
        };
    }

    /* ---------- проверки ---------- */
    async function maybeReport(rec, name) {
        const now = Date.now();
        if (now - rec.lastReport < 10 * 60e3) return;      // не спамим

        const burst = rec.history.filter(t => now - t <= BURST_WINDOW).length;
        const reasons = [];
        if ((rec.unfairCount | 0) >= 2)
            reasons.push(`невыгодные сделки перед выбыванием: ${rec.unfairCount}`);
        if (rec.streak >= STREAK_LIMIT && rec.streak % STREAK_LIMIT === 0)
            reasons.push(`${rec.streak} побед подряд`);
        if (burst >= BURST_LIMIT)
            reasons.push(`${burst} побед за 2 часа`);
        if (!reasons.length) return;

        rec.lastReport = now;
        await save(rec);

        const dayWins = rec.history.filter(t => now - t <= DAY).length;
        const winRate = rec.games ? Math.round(rec.wins / rec.games * 100) : 0;
        const text =
            `<b>Проверка игрока</b>\n\n` +
            `Игрок: <b>${escapeHtml(name)}</b>\n` +
            `ID: <code>${escapeHtml(rec.uid)}</code>\n\n` +
            `Причина: ${reasons.join(', ')}\n\n` +
            `За 24 часа: побед ${dayWins}\n` +
            `Всего: игр ${rec.games}, побед ${rec.wins} (${winRate}%)\n` +
            `Серия побед: ${rec.streak}\n` +
            `Очков: ${rec.points} — ${titleFor(rec.points).name}\n` +
            `Ранее проверялся: ${rec.checked} раз(а)`;

        notify(text, {
            inline_keyboard: [[
                { text: '🚫 Бан', callback_data: `mrb_ban_${rec.uid}` },
                { text: '✅ Нет читов', callback_data: `mrb_ok_${rec.uid}` },
            ]],
        });
    }

    async function get(uid) {
        const rec = await load(uid);
        return { ...rec, title: titleFor(rec.points) };
    }

    async function top(limit = 20) {
        if (supabase && tableOk) {
            try {
                const { data } = await supabase.from('monopoly_rating')
                    .select('uid, points, games, wins')
                    .eq('banned', false).order('points', { ascending: false }).limit(limit);
                if (data) return data.map(r => ({ ...r, title: titleFor(r.points) }));
            } catch (e) { log('[rating] top:', e.message); }
        }
        return [...cache.values()].filter(r => !r.banned)
            .sort((a, b) => b.points - a.points).slice(0, limit)
            .map(r => ({ ...r, title: titleFor(r.points) }));
    }

    return { applyMatch, get, top, setBanned, isBanned, titleFor, TITLES };
}

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

module.exports = { makeRating, titleFor, TITLES, matchCounts, roundsNeeded,
                   WIN_POINTS, TEAM_WIN_POINTS, MIN_ROUNDS, MIN_ROUNDS_ANY, MIN_MINUTES };
