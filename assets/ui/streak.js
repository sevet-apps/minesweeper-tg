/* Spark: серия дней — огонёк с числом у заголовка «Игры» и шторка с неделей.
   День засчитывается, когда игрок что-то делает в любой игре (то же событие,
   что считает время в игре). Дни хранятся на сервере (переживают смену
   телефона) и в localStorage (огонёк рисуется сразу, ещё под заставкой).
   Расчёт и заморозка — assets/ui/streak-core.js. */
(function () {
    'use strict';
    if (window.SparkStreak || !window.SparkStreakCore) return;
    const core = window.SparkStreakCore;
    const API = 'https://spark-game-backend.onrender.com';
    const KEY = 'spark_streak_days';
    const tg = window.Telegram?.WebApp;
    const REDUCED = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const T = {
        ru: {
            aria: n => `Серия: ${n}`,
            title: 'Серия дней',
            days: n => `${n} ${plural(n, 'день', 'дня', 'дней')} подряд`,
            zero: 'Огонёк ещё не горит',
            done: 'Сегодня засчитано — возвращайся завтра',
            risk: 'Сыграй сегодня любую игру, чтобы серия продолжилась',
            start: 'Сыграй любую игру — и огонёк загорится',
            best: 'Лучшая серия',
            freeze: 'Заморозка',
            freezeOn: 'Пропуск дня не погасит серию',
            freezeUsed: 'Уже выручила на этой неделе',
            goal: n => `Цель — ${n} ${plural(n, 'день', 'дня', 'дней')}`,
            play: 'Играть', ok: 'Понятно',
            toast: n => n === 1 ? 'Огонёк зажжён — день 1' : `Серия: ${n} ${plural(n, 'день', 'дня', 'дней')}`,
        },
        en: {
            aria: n => `Streak: ${n}`,
            title: 'Daily streak',
            days: n => `${n}-day streak`,
            zero: 'No streak yet',
            done: 'Today counts — come back tomorrow',
            risk: 'Play any game today to keep your streak',
            start: 'Play any game to light the flame',
            best: 'Best streak',
            freeze: 'Freeze',
            freezeOn: 'A missed day won’t break your streak',
            freezeUsed: 'Already used this week',
            goal: n => `Goal — ${n} days`,
            play: 'Play', ok: 'Got it',
            toast: n => n === 1 ? 'Flame lit — day 1' : `Streak: ${n} days`,
        },
    };
    function plural(n, one, few, many) {
        const m10 = n % 10, m100 = n % 100;
        if (m10 === 1 && m100 !== 11) return one;
        if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
        return many;
    }
    const lang = () => { try { return currentLang || 'ru'; } catch (_) { return 'ru'; } };   // eslint-disable-line no-undef
    const tr = (key, ...args) => { const d = T[lang()] || T.en; const v = d[key] ?? T.en[key]; return typeof v === 'function' ? v(...args) : v; };
    const haptic = (kind, style) => { try { if (localStorage.getItem('vibration') === 'false') return; const h = tg?.HapticFeedback; if (!h) return; if (kind === 'impact') h.impactOccurred(style || 'light'); else if (kind === 'notify') h.notificationOccurred(style || 'success'); else h.selectionChanged(); } catch (_) {} };
    const shortNum = n => n >= 1000 ? `${Math.floor(n / 1000)}k` : String(n);

    /* ---------- данные ---------- */
    let days = (() => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter(core.isDay) : []; } catch (_) { return []; } })();
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(days.slice(-400))); } catch (_) {} };
    const auth = () => tg?.initData ? { 'X-Init-Data': tg.initData } : null;
    function merge(list) {
        days = [...new Set([...days, ...(list || [])].filter(core.isDay))].sort();
        save();
        render();
    }
    async function refresh() {
        const headers = auth();
        if (!headers) return;
        try {
            const r = await fetch(`${API}/api/streak`, { headers });
            if (r.ok) merge((await r.json()).days);
        } catch (_) {}
    }
    /** Игрок что-то сделал в игре — день засчитан (один раз за день). */
    function touch() {
        const today = core.localDay();
        if (days.includes(today)) return;
        days = [...days, today].sort();
        save();
        const state = core.compute(days, today);
        render({ bump: true });
        haptic('notify', 'success');
        if (window.SparkToast) window.SparkToast.show(tr('toast', state.count), 'streak');
        const headers = auth();
        if (!headers) return;
        fetch(`${API}/api/streak/checkin`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ day: today }) })
            .then(r => r.ok ? r.json() : null).then(data => data && merge(data.days)).catch(() => {});
    }

    /* ---------- огонёк у заголовка ---------- */
    let btn = null;
    function mount() {
        const header = document.querySelector('#view-games > .header');
        const title = header?.querySelector('.app-title');
        if (!title || header.querySelector('.st-fire')) return;
        header.querySelector('.jc-title-emoji')?.remove();
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'st-fire';
        btn.innerHTML = '<span class="st-fire-anim jc-title-emoji" data-emoji="fire" aria-hidden="true"></span><b class="st-num" aria-hidden="true"></b>';
        title.after(btn);
        btn.addEventListener('click', () => {
            haptic('impact', 'medium');
            btn.classList.remove('is-tap'); void btn.offsetWidth; btn.classList.add('is-tap');
            window.SparkJuicy?.replay(btn.querySelector('.st-fire-anim'));
            setTimeout(open, REDUCED ? 0 : 160);
        });
        render();
    }
    function render({ bump = false } = {}) {
        if (!btn) return;
        const state = core.compute(days);
        const text = shortNum(state.count);
        const num = btn.querySelector('.st-num');
        if (num.textContent !== text) num.textContent = text;
        num.dataset.len = String(Math.min(text.length, 3));
        btn.classList.toggle('is-lit', state.todayDone);
        btn.classList.toggle('is-zero', state.count === 0);
        btn.setAttribute('aria-label', tr('aria', state.count));
        if (bump && !REDUCED) { btn.classList.remove('is-bump'); void btn.offsetWidth; btn.classList.add('is-bump'); }
        if (sheetOpen()) fillSheet();
    }

    /* ---------- шторка ---------- */
    const FLAME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.6 2.3c.5 3-1.6 4.6-3 6.3-1.5 1.7-2.8 3.6-2.8 6.2A5.4 5.4 0 0 0 12 20.3a5.4 5.4 0 0 0 5.4-5.5c0-2.1-.9-3.7-1.9-5 .1 1.5-.5 2.6-1.4 3.1.3-3.5-.4-7.6-1.5-10.6z"/></svg>';
    const SNOW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/></svg>';
    const sheetEl = () => document.getElementById('streakSheet');
    const sheetOpen = () => !!sheetEl()?.classList.contains('visible');
    function weekdayNames() {
        try {
            const fmt = new Intl.DateTimeFormat(lang(), { weekday: 'short' });
            return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2024, 0, 1 + i, 12))).replace('.', '').slice(0, 2));
        } catch (_) { return ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']; }
    }
    function fillSheet() {
        const panel = sheetEl()?.querySelector('.ui-mode-panel');
        if (!panel) return;
        const state = core.compute(days);
        const week = core.week(days);
        const names = weekdayNames();
        const sub = state.todayDone ? tr('done') : state.count ? tr('risk') : tr('start');
        const goalFrom = [0, ...core.MILESTONES].filter(m => m <= state.count).pop() || 0;
        const progress = Math.max(0.04, Math.min(1, (state.count - goalFrom) / Math.max(1, state.next - goalFrom)));
        const text = shortNum(state.count);
        panel.innerHTML = `
            <div class="ui-sheet-grab" aria-hidden="true"></div>
            <div class="ui-sheet-heading"><h2 id="streakSheetHeading">${tr('title')}</h2><button class="ui-close" type="button" aria-label="×"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button></div>
            <div class="st-hero${state.todayDone ? ' is-lit' : ''}${state.count ? '' : ' is-zero'}">
                <div class="st-hero-fire"><span class="st-hero-anim" aria-hidden="true"></span><b class="st-hero-num" data-len="${Math.min(text.length, 3)}">${text}</b></div>
                <div class="st-hero-title">${state.count ? tr('days', state.count) : tr('zero')}</div>
                <div class="st-hero-sub">${sub}</div>
            </div>
            <div class="st-week" role="list">${week.map((d, i) => `
                <div class="st-day is-${d.kind}" role="listitem" style="--i:${i}"><small>${names[i]}</small><i>${d.kind === 'done' ? FLAME : d.kind === 'frozen' ? SNOW : ''}</i></div>`).join('')}
            </div>
            <div class="st-tiles">
                <div class="st-tile"><b class="jc-num">${state.best}</b><span>${tr('best')}</span></div>
                <div class="st-tile is-ice${state.freezeLeft ? '' : ' is-used'}"><b>${SNOW}<em>${state.freezeLeft ? 1 : 0}</em></b><span>${state.freezeLeft ? tr('freezeOn') : tr('freezeUsed')}</span></div>
            </div>
            <div class="st-goal">
                <div class="st-goal-row"><span>${tr('goal', state.next)}</span><b>${state.count}/${state.next}</b></div>
                <div class="st-goal-bar"><i style="--p:${progress.toFixed(3)}"></i></div>
            </div>
            <button class="btn-main st-go" type="button">${state.todayDone ? tr('ok') : tr('play')}</button>`;
        panel.querySelector('.ui-close').onclick = close;
        panel.querySelector('.st-go').onclick = close;
        window.SparkJuicy?.emoji(panel.querySelector('.st-hero-anim'), 'fire');
        requestAnimationFrame(() => window.SparkJuicy?.countUpIn(panel, '.st-hero-num, .jc-num', { duration: 650 }));
    }
    function open() {
        const sheet = sheetEl();
        if (!sheet) return;
        fillSheet();
        sheet.classList.add('visible');
        refresh();
    }
    function close() { sheetEl()?.classList.remove('visible'); }
    window.closeStreakSheet = close;

    function init() {
        mount();
        window.SparkJuicy?.preload?.(['fire', 'snow']);
        refresh();
        // новый день, пока приложение открыто: огонёк гаснет до первой игры
        document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
    }
    window.SparkStreak = { touch, refresh, open, close, render, state: () => core.compute(days) };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
