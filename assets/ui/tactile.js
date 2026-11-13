/* Spark: тактильный отклик кнопок во всём приложении. Нажатие сжимает элемент
   сразу (даже самое короткое касание видно), а отпускание возвращает его
   пружиной с лёгким перелётом — как физическую кнопку. Работает через свойство
   scale, поэтому не спорит с transform, которым элементы расставлены и которым
   они уже реагируют на :active. Только украшение: событий не перехватывает. */
(() => {
    'use strict';
    if (window.SparkTactile) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const SELECTOR = [
        'button', '[role="button"]', '[role="switch"]', '.card', '.btn-main', '.btn-secondary', '.back-btn', '.tab-item',
        '.segment-item', '.lb-item', '.th-item', '.language-row', '.mono-mode-card', '.ck-tile', '.ck-hero', '.theme-switch',
    ].join(',');
    // игровые поля и то, что само ведёт палец (капсула превращения, ползунки), не трогаем
    const SKIP = '[data-tactile="off"], .cs-board, .cs-promo, .game-area, .mono-board, #monopolyFrame, input, textarea, select';
    const PRESS_MS = 90, MIN_HOLD = 70, RELEASE_MS = 420;

    /** Кадры возврата пружиной: из сжатия from к 1 с одним мягким перелётом. */
    function springBack(from) {
        const w = 13.2, z = 0.42, wd = w * Math.sqrt(1 - z * z);
        const out = [];
        for (let i = 0; i <= 18; i++) {
            const t = i / 18;
            const x = Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t));
            out.push((1 - (1 - from) * x).toFixed(4));
        }
        out[out.length - 1] = '1';
        return out;
    }

    let current = null;
    function press(el) {
        release();
        if (reduced || !el.animate || lite()) return;
        const box = el.getBoundingClientRect();
        const size = Math.max(box.width, box.height);
        if (!size) return;
        // ход нажатия — около пяти пикселей, каким бы большим ни был элемент
        const depth = Math.max(0.012, Math.min(0.062, 5 / size));
        const hold = el.animate({ scale: ['1', String(1 - depth)] }, { duration: PRESS_MS, easing: 'cubic-bezier(.2, .7, .3, 1)', fill: 'forwards' });
        current = { el, depth, hold, at: performance.now() };
    }
    function release() {
        const state = current;
        if (!state) return;
        current = null;
        const wait = Math.max(0, MIN_HOLD - (performance.now() - state.at));
        setTimeout(() => {
            try {
                state.hold.cancel();
                if (state.el.isConnected) state.el.animate({ scale: springBack(1 - state.depth) }, { duration: RELEASE_MS, easing: 'linear' });
            } catch (_) {}
        }, wait);
    }
    const lite = () => document.body.classList.contains('lite-mode');

    // Палец мог начать не нажатие, а прокрутку: на телефоне сжатие выжидает мгновение и отменяется, если палец поехал.
    let pending = null;
    const drop = () => { if (pending) { clearTimeout(pending.timer); pending = null; } };
    document.addEventListener('pointerdown', event => {
        if (event.button > 0 || !event.isPrimary) return;
        const el = event.target.closest?.(SELECTOR);
        if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled') || el.closest(SKIP)) return;
        drop();
        if (event.pointerType === 'mouse') { press(el); return; }
        pending = { el, x: event.clientX, y: event.clientY, timer: setTimeout(() => { const p = pending; pending = null; if (p) press(p.el); }, 55) };
    }, { capture: true, passive: true });
    document.addEventListener('pointermove', event => {
        const ref = pending || current;
        if (!ref || event.pointerType === 'mouse') return;
        if (pending && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 8) drop();
    }, { capture: true, passive: true });
    document.addEventListener('pointerup', () => {
        // быстрый тап: палец уже ушёл, а сжатие ещё не началось — показываем его целиком
        if (pending) { const el = pending.el; drop(); press(el); }
        release();
    }, { capture: true, passive: true });
    for (const type of ['pointercancel', 'dragstart']) document.addEventListener(type, () => { drop(); release(); }, { capture: true, passive: true });
    window.addEventListener('blur', () => { drop(); release(); });

    window.SparkTactile = { press, release, springBack, SELECTOR };
})();
