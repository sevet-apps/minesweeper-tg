/* Spark: общее ядро шахмат — режимы времени, шахматные часы, итог партии,
   рейтинг Эло и уровни бота. Один файл работает и в Mini App (globalThis
   .SparkChessCore), и на сервере (require). Правила ходов — chess.js. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SparkChessCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const MIN = 60 * 1000;
    const SEC = 1000;

    /** Контроль времени «минуты+добавка за ход в секундах», как на lichess. */
    const TIME_CONTROLS = Object.freeze([
        { id: '1+0', base: 1 * MIN, inc: 0, cat: 'bullet' },
        { id: '2+1', base: 2 * MIN, inc: 1 * SEC, cat: 'bullet' },
        { id: '3+0', base: 3 * MIN, inc: 0, cat: 'blitz' },
        { id: '3+2', base: 3 * MIN, inc: 2 * SEC, cat: 'blitz' },
        { id: '5+0', base: 5 * MIN, inc: 0, cat: 'blitz' },
        { id: '5+3', base: 5 * MIN, inc: 3 * SEC, cat: 'blitz' },
        { id: '10+0', base: 10 * MIN, inc: 0, cat: 'rapid' },
        { id: '15+10', base: 15 * MIN, inc: 10 * SEC, cat: 'rapid' },
        { id: '30+0', base: 30 * MIN, inc: 0, cat: 'classical' },
    ].map(Object.freeze));
    const TIME_CATEGORIES = Object.freeze(['bullet', 'blitz', 'rapid', 'classical']);
    const DEFAULT_ONLINE_TC = '5+0';

    function timeControl(id) {
        return TIME_CONTROLS.find(tc => tc.id === id) || null;
    }

    /** Отдельный рейтинг для пули, блица и рапида; классика (30+0) идёт в рапид. */
    const RATING_CATEGORIES = Object.freeze(['bullet', 'blitz', 'rapid']);
    function ratingCategory(tcOrId) {
        const tc = typeof tcOrId === 'string' ? timeControl(tcOrId) : tcOrId;
        if (!tc) return null;
        return tc.cat === 'classical' ? 'rapid' : tc.cat;
    }

    /* ---------- Шахматные часы ----------
       Часы — простой объект, время передаётся явно: так их одинаково
       считают сервер (авторитетно) и клиент (для отображения). Часы белых
       включаются только после первого хода чёрных, как на lichess. */
    function createClock(tc) {
        return { base: tc.base, inc: tc.inc, left: { w: tc.base, b: tc.base }, running: null, since: 0 };
    }

    function clockLeft(clock, color, at) {
        let left = clock.left[color];
        if (clock.running === color) left -= Math.max(0, at - clock.since);
        return Math.max(0, left);
    }

    /** Игрок `color` сделал ход в момент `at`: списываем время, добавляем
        прибавку и запускаем часы соперника. `startOther=false` — ход сделан,
        но часы соперника ещё не идут (первые ходы партии). */
    function clockPress(clock, color, at, { startOther = true, addIncrement = true } = {}) {
        if (clock.running === color) {
            clock.left[color] = Math.max(0, clock.left[color] - Math.max(0, at - clock.since));
        }
        if (addIncrement) clock.left[color] += clock.inc;
        clock.running = startOther ? other(color) : null;
        clock.since = at;
        return clock;
    }

    function clockStop(clock, at) {
        if (clock.running) {
            clock.left[clock.running] = clockLeft(clock, clock.running, at);
            clock.running = null;
            clock.since = at;
        }
        return clock;
    }

    /** У кого из игроков вышло время (или null). */
    function clockFlagged(clock, at) {
        if (clock.running && clockLeft(clock, clock.running, at) <= 0) return clock.running;
        return null;
    }

    function clockSnapshot(clock, at) {
        return { w: clockLeft(clock, 'w', at), b: clockLeft(clock, 'b', at), running: clock.running };
    }

    function other(color) { return color === 'w' ? 'b' : 'w'; }
    function colorName(color) { return color === 'w' ? 'white' : 'black'; }

    /* ---------- Итог партии ---------- */

    /** Итог по позиции на доске или null, если партия продолжается.
        result: 'white' | 'black' | 'draw'. */
    function boardOutcome(chess) {
        if (chess.isCheckmate()) return { result: chess.turn() === 'w' ? 'black' : 'white', reason: 'checkmate' };
        if (chess.isStalemate()) return { result: 'draw', reason: 'stalemate' };
        if (chess.isInsufficientMaterial()) return { result: 'draw', reason: 'insufficient' };
        if (chess.isThreefoldRepetition()) return { result: 'draw', reason: 'threefold' };
        if (chess.isDrawByFiftyMoves()) return { result: 'draw', reason: 'fifty' };
        return null;
    }

    /** Хватает ли у стороны материала, чтобы хоть как-то поставить мат.
        Нужно для флажка: если у соперника голый король (или король с одной
        лёгкой фигурой против голого короля), падение флажка — ничья. */
    function hasMatingMaterial(chess, color) {
        let minors = 0, rest = 0, opponentPieces = 0;
        for (const row of chess.board()) {
            for (const piece of row) {
                if (!piece || piece.type === 'k') continue;
                if (piece.color !== color) { opponentPieces++; continue; }
                if (piece.type === 'n' || piece.type === 'b') minors++;
                else rest++;
            }
        }
        if (rest > 0 || minors >= 2) return true;
        // Одной лёгкой фигурой мат возможен, только если соперник сам себя
        // запрёт своими же фигурами.
        return minors === 1 && opponentPieces > 0;
    }

    /** Итог, когда у `flagged` упал флажок. */
    function timeoutOutcome(chess, flagged) {
        const winner = other(flagged);
        if (!hasMatingMaterial(chess, winner)) return { result: 'draw', reason: 'timeoutVsInsufficient' };
        return { result: colorName(winner), reason: 'timeout' };
    }

    /** Материальный перевес белых (пешка 1, лёгкая фигура 3, ладья 5, ферзь 9)
        и списки взятых фигур для каждой стороны. */
    const PIECE_VALUE = Object.freeze({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 });
    const START_COUNT = Object.freeze({ p: 8, n: 2, b: 2, r: 2, q: 1 });
    function material(chess) {
        const count = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
        let score = 0;
        for (const row of chess.board()) {
            for (const piece of row) {
                if (!piece || piece.type === 'k') continue;
                count[piece.color][piece.type]++;
                score += (piece.color === 'w' ? 1 : -1) * PIECE_VALUE[piece.type];
            }
        }
        // Взятые фигуры: чего не хватает до стартового набора. Превращённые
        // пешки делают счёт отрицательным — такие фигуры просто не показываем.
        const captured = { w: [], b: [] };   // captured.w — какие фигуры белые взяли у чёрных
        for (const color of ['w', 'b']) {
            for (const type of ['q', 'r', 'b', 'n', 'p']) {
                const missing = Math.max(0, START_COUNT[type] - count[color][type]);
                for (let i = 0; i < missing; i++) captured[other(color)].push(type);
            }
        }
        return { score, captured };
    }

    /* ---------- Рейтинг Эло ---------- */
    const START_RATING = 1200;
    const MIN_RATING = 100;

    function eloK(rating, games) {
        if (games < 20) return 40;
        return rating >= 2400 ? 10 : 20;
    }

    /** Изменение рейтинга игрока A после партии со счётом score (1, ½, 0). */
    function eloDelta(ratingA, ratingB, score, gamesA = 0) {
        const expected = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
        const delta = Math.round(eloK(ratingA, gamesA) * (score - expected));
        return Math.max(MIN_RATING - ratingA, delta);
    }

    /* ---------- Бот ----------
       Сила задаётся Stockfish: Skill Level, глубина и время на ход. Слабым
       уровням добавляем долю случайных ходов — иначе даже «новичок» не
       зевает фигуры и играть с ним неинтересно. */
    const BOT_LEVELS = Object.freeze([
        { level: 1, elo: 400, skill: 0, depth: 1, movetime: 60, random: 0.45 },
        { level: 2, elo: 800, skill: 0, depth: 2, movetime: 100, random: 0.18 },
        { level: 3, elo: 1200, skill: 3, depth: 4, movetime: 200, random: 0.05 },
        { level: 4, elo: 1600, skill: 8, depth: 8, movetime: 400, random: 0 },
        { level: 5, elo: 2000, skill: 14, depth: 12, movetime: 800, random: 0 },
        { level: 6, elo: 2600, skill: 20, depth: 20, movetime: 1500, random: 0 },
    ].map(Object.freeze));

    function botLevel(level) {
        return BOT_LEVELS.find(item => item.level === Number(level)) || BOT_LEVELS[2];
    }

    /** Сколько думать боту, чтобы не проиграть по времени: не больше уровня
        и не больше 1/30 остатка плюс большая часть прибавки. */
    function botThinkTime(level, timeLeft, increment) {
        const cap = botLevel(level).movetime;
        if (!Number.isFinite(timeLeft)) return cap;
        const budget = timeLeft / 30 + (increment || 0) * 0.8;
        return Math.max(30, Math.min(cap, Math.floor(budget)));
    }

    /* ---------- Ходы ---------- */
    const SQUARE = /^[a-h][1-8]$/;
    const PROMOTION = /^[qrbn]$/;

    /** Ход из недоверенного источника (сеть, движок) → { from, to, promotion } или null. */
    function normalizeMove(move) {
        if (typeof move === 'string') {
            const m = move.trim().match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
            return m ? { from: m[1], to: m[2], promotion: m[3] || undefined } : null;
        }
        if (!move || typeof move !== 'object') return null;
        const { from, to, promotion } = move;
        if (typeof from !== 'string' || typeof to !== 'string' || !SQUARE.test(from) || !SQUARE.test(to)) return null;
        if (promotion != null && (typeof promotion !== 'string' || !PROMOTION.test(promotion))) return null;
        return { from, to, promotion: promotion || undefined };
    }

    function moveToUci(move) {
        return move.from + move.to + (move.promotion || '');
    }

    /** Пробует сделать ход в chess.js, не бросая исключений. */
    function tryMove(chess, raw) {
        const move = normalizeMove(raw);
        if (!move) return null;
        try {
            return chess.move(move.promotion ? move : { from: move.from, to: move.to });
        } catch (_) {
            return null;
        }
    }

    return Object.freeze({
        TIME_CONTROLS, TIME_CATEGORIES, DEFAULT_ONLINE_TC, timeControl, RATING_CATEGORIES, ratingCategory,
        createClock, clockLeft, clockPress, clockStop, clockFlagged, clockSnapshot,
        other, colorName,
        boardOutcome, hasMatingMaterial, timeoutOutcome, material, PIECE_VALUE,
        START_RATING, eloDelta, eloK,
        BOT_LEVELS, botLevel, botThinkTime,
        normalizeMove, moveToUci, tryMove,
    });
});
