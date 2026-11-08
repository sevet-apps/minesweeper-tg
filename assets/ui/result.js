/* Spark: единый экран итога для всех игр.
   Анимированный эмодзи, заголовок, крупное число с докруткой, плашка
   «Новый рекорд!», короткие показатели и главная кнопка, которая один раз
   наполняется цветом (как «Дальше» в знакомстве). Логику игр не трогает:
   игры передают текст, число и действия кнопок. */
(function () {
    'use strict';
    if (window.SparkResult && !window.SparkResult.shim) return;
    const REDUCED = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const calm = () => REDUCED || document.body.classList.contains('lite-mode');
    const EMOJI = { win: 'party', record: 'crown', lose: 'rain', boom: 'boom', draw: 'scales', info: 'info' };
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const group = n => Math.trunc(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const formatValue = (v, format) => format === 'time' ? Number(v).toFixed(3) : group(Number(v) || 0);
    const T = {
        ru: { view: 'Посмотреть поле', result: 'Итог', again: 'Ещё раз' },
        en: { view: 'View the board', result: 'Result', again: 'Play again' },
    };
    const tr = key => { let lang = 'ru'; try { lang = currentLang || 'ru'; } catch (_) {} return (T[lang] || T.en)[key]; };   // eslint-disable-line no-undef
    const AGAIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4.5h-4.5"/></svg>';
    const LIST = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M8 7h11M8 12h11M8 17h11M4 7h.01M4 12h.01M4 17h.01"/></svg>';

    /* ---------- «Посмотреть поле»: окно итога прячется, игра остаётся на экране ----------
       Внизу поля — плашка «Итог» (вернуть окно) и «Ещё раз». Выйти — как обычно, «Меню» вверху. */
    let docked = null;
    function undock() {
        if (!docked) return;
        const { dock, content, watcher } = docked;
        docked = null;
        watcher.disconnect();
        content.dataset.viewing = '';
        dock.parentElement?.classList.remove('sr-viewing');
        dock.classList.remove('is-in');
        setTimeout(() => dock.remove(), calm() ? 0 : 220);
    }
    function view(container, { screen, again }) {
        const overlay = container.closest('.modal-overlay');
        const host = typeof screen === 'string' ? document.getElementById(screen) : screen;
        if (!overlay || !host) return;
        undock();
        container.dataset.viewing = '1';
        overlay.classList.remove('visible');
        const dock = document.createElement('div');
        dock.className = `sr-dock${[...container.classList].filter(c => c.startsWith('jc-g-')).map(c => ` ${c}`).join('')}`;
        dock.innerHTML = `<button type="button" class="sr-dock-result">${LIST}<span>${esc(tr('result'))}</span></button>`
            + (again ? `<button type="button" class="sr-dock-again">${AGAIN}<span>${esc(tr('again'))}</span></button>` : '');
        host.appendChild(dock);
        host.classList.add('sr-viewing');   // нижние кнопки игры (копать/флаг, клавиатура) после конца не нужны
        // ушли из игры — плашка больше не нужна
        const watcher = new MutationObserver(() => { if (!host.classList.contains('visible')) { container.dataset.rendered = ''; undock(); } });
        watcher.observe(host, { attributes: true, attributeFilter: ['class'] });
        docked = { dock, content: container, watcher };
        dock.querySelector('.sr-dock-result').onclick = () => { undock(); overlay.classList.add('visible'); };
        const again2 = dock.querySelector('.sr-dock-again');
        if (again2) again2.onclick = () => { container.dataset.rendered = ''; undock(); again(); };
        requestAnimationFrame(() => dock.classList.add('is-in'));
    }

    function countTo(el, from, to, format, duration = 900) {
        if (!el) return;
        if (calm() || from === to) { el.textContent = formatValue(to, format); return; }
        const t0 = performance.now();
        const ease = t => 1 - Math.pow(1 - t, 3);
        const step = now => {
            if (!el.isConnected) return;
            const t = Math.min(1, (now - t0) / duration);
            el.textContent = formatValue(from + (to - from) * ease(t), format);
            if (t < 1) requestAnimationFrame(step);
        };
        el.textContent = formatValue(from, format);
        requestAnimationFrame(step);
    }

    /**
     * render(container, opts):
     *  game — цвет игры (saper, bb, …); kind — win | record | lose | boom | draw | info;
     *  title, text; badge — золотая плашка; value + format ('int' | 'time') + unit + from;
     *  valueId — id числа (для игр, которые сами докручивают его дальше), animate: false — не крутить;
     *  stats — [[подпись, значение], …]; extraHtml — свой блок под числом;
     *  primary / secondary / link — { text, onClick, id }; rematch — сохранить кнопку реванша шашек.
     */
    function render(container, opts = {}) {
        if (!container) return null;
        undock();
        const kind = opts.kind || 'info';
        const rematch = opts.rematch ? container.querySelector('#resRematchBtn') : null;
        container.classList.add('sr');
        container.dataset.kind = kind;
        container.dataset.rendered = '1';
        [...container.classList].filter(c => c.startsWith('jc-g-')).forEach(c => container.classList.remove(c));
        if (opts.game) container.classList.add(`jc-g-${opts.game}`);
        const hasValue = opts.value != null && opts.value !== '';
        const stats = (opts.stats || []).filter(s => s && s[1] != null && s[1] !== '');
        container.innerHTML = `
            <div class="sr-emoji" aria-hidden="true"></div>
            ${opts.badge ? `<div class="sr-badge">${esc(opts.badge)}</div>` : ''}
            <h2 class="sr-title" id="${opts.titleId || 'resTitle'}">${esc(opts.title || '')}</h2>
            <p class="sr-text" id="${opts.textId || 'resText'}"${opts.text ? '' : ' hidden'}>${esc(opts.text || '')}</p>
            ${hasValue ? `<div class="sr-value"><b class="sr-num"${opts.valueId ? ` id="${esc(opts.valueId)}"` : ''}>${esc(formatValue(opts.value, opts.format))}</b>${opts.unit ? `<small class="sr-unit">${esc(opts.unit)}</small>` : ''}</div>` : ''}
            ${stats.length ? `<div class="sr-stats">${stats.map(([label, value]) => `<div class="sr-stat"><b>${esc(value)}</b><span>${esc(label)}</span></div>`).join('')}</div>` : ''}
            ${opts.extraHtml || ''}
            <div class="sr-actions"></div>`;
        const actions = container.querySelector('.sr-actions');
        if (rematch) actions.appendChild(rematch);
        if (opts.secondary) {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'sr-secondary'; b.innerHTML = opts.secondary.html || esc(opts.secondary.text);
            if (opts.secondary.id) b.id = opts.secondary.id;
            b.onclick = opts.secondary.onClick;
            actions.appendChild(b);
        }
        if (opts.primary) {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'btn-main sr-primary';
            b.id = opts.primary.id || 'resBtn';
            b.innerHTML = `<span class="sr-fill" aria-hidden="true"></span><span class="sr-label">${esc(opts.primary.text)}</span>`;
            b.onclick = opts.primary.onClick;
            actions.appendChild(b);
            if (!calm()) requestAnimationFrame(() => b.classList.add('is-filling'));
            else b.classList.add('is-ready');
        }
        // внизу — тихие ссылки: «Посмотреть поле» · «Меню»
        const links = [opts.view ? { text: tr('view'), onClick: () => view(container, opts.view) } : null, opts.link].filter(Boolean);
        if (links.length) {
            const row = document.createElement('div');
            row.className = 'sr-links';
            links.forEach(link => {
                const b = document.createElement('button');
                b.type = 'button'; b.className = 'sr-link'; b.textContent = link.text;
                b.onclick = link.onClick;
                row.appendChild(b);
            });
            actions.appendChild(row);
        }
        window.SparkJuicy?.emoji(container.querySelector('.sr-emoji'), opts.emoji || EMOJI[kind] || 'info');
        if (hasValue && opts.animate !== false) countTo(container.querySelector('.sr-num'), Number(opts.from) || 0, Number(opts.value), opts.format);
        if (!calm()) { container.classList.remove('is-in'); void container.offsetWidth; container.classList.add('is-in'); }
        return container;
    }

    /* Шашки и пара мест в приложении пишут заголовок прямо в #resTitle и
       открывают окно сами — тогда вид итога угадываем по заголовку. */
    function guessKind(title) {
        const tt = key => { try { return t(key); } catch (_) { return null; } };   // eslint-disable-line no-undef
        if (!title) return 'info';
        if (title === tt('boom')) return 'boom';
        if ([tt('victory'), tt('whiteWon'), tt('blackWon')].includes(title)) return 'win';
        if ([tt('defeat'), tt('notGuessed'), tt('towerFell')].includes(title)) return 'lose';
        if (title === tt('newRecord')) return 'record';
        return 'info';
    }
    function watch() {
        const overlay = document.getElementById('modalResult');
        const content = document.getElementById('modalResultContent');
        if (!overlay || !content || overlay.__srWatch) return;
        overlay.__srWatch = true;
        let open = overlay.classList.contains('visible');
        new MutationObserver(() => {
            const now = overlay.classList.contains('visible');
            if (now === open) return;
            open = now;
            if (!now) { if (content.dataset.viewing !== '1') content.dataset.rendered = ''; return; }
            if (content.dataset.rendered === '1') return;
            // собрано вручную — переложим в единый вид, сохранив кнопки и их действия
            const title = content.querySelector('#resTitle')?.textContent || '';
            const text = content.querySelector('#resText')?.textContent || '';
            const btn = content.querySelector('#resBtn');
            const onClick = btn?.onclick || (() => window.closeResult?.());
            render(content, { game: content.dataset.game || null, kind: guessKind(title), title, text, primary: { text: btn?.textContent || 'OK', onClick }, rematch: true });
            content.dataset.rendered = '';
        }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
    }

    window.SparkJuicy?.preload?.(['party', 'rain', 'crown']);
    window.SparkResult = { render, guessKind, countTo, view, undock };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
    else watch();
})();
