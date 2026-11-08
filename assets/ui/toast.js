/* Spark: единые всплывающие уведомления — небольшая плашка с анимированным
   эмодзи (галочка, крестик, огонёк серии…). Снизу (выбор владельца): над
   нижней панелью, когда она видна, а в игре — у самого края экрана.
   Вариант «сверху» остаётся за html[data-toast="top"]. */
(function () {
    'use strict';
    if (window.SparkToast) return;
    const EMOJI = { success: 'check', welcome: 'party', error: 'cross', info: 'info', streak: 'fire', record: 'crown' };
    let el = null, timer = 0;
    function host() {
        if (el?.isConnected) return el;
        el = document.createElement('div');
        el.className = 'sp-toast';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.innerHTML = '<span class="sp-toast-ico" aria-hidden="true"></span><span class="sp-toast-text"></span>';
        el.addEventListener('click', hide);
        document.body.appendChild(el);
        return el;
    }
    /** Нижняя панель видна и ничем не закрыта (игра, окно, шторка). */
    function tabBarFree() {
        const bar = document.getElementById('tabBar');
        if (!bar) return false;
        const r = bar.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!hit && bar.contains(hit);
    }
    /** Верх нижних кнопок открытой игры (копать/флаг, цифры, клавиатура, фигуры): плашка встаёт над ними. */
    function gameControlsTop() {
        let top = Infinity;
        document.querySelectorAll('.game-overlay.visible :is(.bottom-controls, .numpad, .wordle-keyboard, .bb-footer)').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.height && r.bottom > window.innerHeight * 0.6 && getComputedStyle(el).visibility !== 'hidden') top = Math.min(top, r.top);
        });
        return top;
    }
    function show(message, type = 'success', { duration = 2600 } = {}) {
        const toast = host();
        const bottom = document.documentElement.dataset.toast !== 'top';
        const overTabs = bottom && tabBarFree();
        toast.className = `sp-toast is-${type} is-${bottom ? 'bottom' : 'top'}${overTabs ? ' over-tabs' : ''}`;
        const controls = bottom && !overTabs ? gameControlsTop() : Infinity;
        toast.style.bottom = Number.isFinite(controls) ? `${Math.round(window.innerHeight - controls + 10)}px` : '';
        toast.querySelector('.sp-toast-text').textContent = String(message ?? '');
        const old = toast.querySelector('.sp-toast-ico');
        const ico = document.createElement('span');
        ico.className = 'sp-toast-ico';
        ico.setAttribute('aria-hidden', 'true');
        old.replaceWith(ico);
        window.SparkJuicy?.emoji(ico, EMOJI[type] || 'check');
        void toast.offsetWidth;
        toast.classList.add('is-in');
        clearTimeout(timer);
        timer = setTimeout(hide, duration);
    }
    function hide() { el?.classList.remove('is-in'); }
    window.SparkJuicy?.preload?.(['check', 'cross']);
    window.SparkToast = { show, hide };
})();
