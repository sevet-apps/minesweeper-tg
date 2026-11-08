/* Spark: серия дней — чистый расчёт (общий для приложения и тестов сервера).
   День засчитан, если в этот день была игра. Раз в неделю (по неделе
   пропущенного дня) один пропуск между двумя игровыми днями не гасит серию —
   «заморозка». Даты — строки ГГГГ-ММ-ДД по местному времени игрока. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SparkStreakCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const DAY = 86400000;
    const toNum = day => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / DAY;
    const toDay = num => new Date(num * DAY).toISOString().slice(0, 10);
    const isDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toNum(value));
    /** Понедельник недели этого дня (номер дня): ключ недели для заморозки. */
    const weekOf = num => num - ((new Date(num * DAY).getUTCDay() + 6) % 7);
    const MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365, 500, 1000];

    function localDay(date = new Date()) {
        const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /** Отрезки серии по возрастанию дат: { start, end, count, frozen: [номера дней], weeks: Set }. */
    function runs(days) {
        const nums = [...new Set((days || []).filter(isDay).map(toNum))].sort((a, b) => a - b);
        const list = [];
        let run = null;
        for (const n of nums) {
            if (run && n - run.end === 1) { run.end = n; run.count++; continue; }
            if (run && n - run.end === 2 && !run.weeks.has(weekOf(n - 1))) {
                run.weeks.add(weekOf(n - 1)); run.frozen.push(n - 1);
                run.end = n; run.count++; continue;
            }
            run = { start: n, end: n, count: 1, frozen: [], weeks: new Set() };
            list.push(run);
        }
        return list;
    }

    /**
     * Состояние серии на сегодня.
     * count — дней в серии (заморозка не прибавляет), todayDone — сегодня уже играл,
     * atRisk — серия жива, но сегодня ещё не было игры, best — лучшая серия,
     * frozen — даты заморозок текущей серии, freezeLeft — заморозка этой недели ещё есть.
     */
    function compute(days, today = localDay()) {
        const list = runs(days);
        const t = toNum(today);
        const best = list.reduce((m, r) => Math.max(m, r.count), 0);
        const last = list[list.length - 1];
        let current = null;
        if (last) {
            if (last.end === t || last.end === t - 1) current = last;
            // вчера пропуск, но заморозка этой недели не тронута — серия жива
            else if (last.end === t - 2 && !last.weeks.has(weekOf(t - 1))) current = last;
        }
        const todayDone = !!last && last.end === t;
        const count = current ? current.count : 0;
        const frozen = current ? current.frozen.slice() : [];
        if (current && current.end === t - 2) frozen.push(t - 1);
        const usedThisWeek = frozen.some(n => weekOf(n) === weekOf(t));
        const next = MILESTONES.find(m => m > count) || (Math.floor(count / 100) + 1) * 100;
        return {
            count, best: Math.max(best, count), todayDone,
            atRisk: count > 0 && !todayDone,
            frozen: frozen.map(toDay),
            freezeLeft: !usedThisWeek,
            next,
        };
    }

    /** Неделя с понедельника: для каждого дня — done, frozen, today, missed или future. */
    function week(days, today = localDay()) {
        const set = new Set((days || []).filter(isDay));
        const t = toNum(today);
        const state = compute(days, today);
        const frozen = new Set(state.frozen);
        const monday = weekOf(t);
        return Array.from({ length: 7 }, (_, i) => {
            const n = monday + i, day = toDay(n);
            const kind = set.has(day) ? 'done' : frozen.has(day) ? 'frozen' : n === t ? 'today' : n > t ? 'future' : 'missed';
            return { day, weekday: i, kind };
        });
    }

    return { compute, week, runs, localDay, isDay, MILESTONES };
});
