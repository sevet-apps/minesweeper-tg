/* ============================================================
   emoji.js — набор эмодзи для чата.
   Кнопка стоит в самой строке ввода, по нажатию из неё
   разворачивается панель выбора. Начертание одинаковое на всех
   устройствах: картинки Apple с CDN, при недоступности сети
   остаётся системный символ.
   ============================================================ */
(function (global) {
    'use strict';

    /* порядок как в задумке: смех, нежность, ирония, грусть, злость, прочее */
    const LIST = [
        ['😄', '1f604'], ['😁', '1f601'], ['😆', '1f606'], ['😅', '1f605'],
        ['😂', '1f602'], ['🤣', '1f923'], ['💋', '1f48b'], ['😌', '1f60c'],
        ['😘', '1f618'], ['🥰', '1f970'], ['😜', '1f61c'], ['🤪', '1f92a'],
        ['😛', '1f61b'], ['😎', '1f60e'], ['😒', '1f612'], ['😏', '1f60f'],
        ['😔', '1f614'], ['🥺', '1f97a'], ['😭', '1f62d'], ['😡', '1f621'],
        ['🤬', '1f92c'], ['🤯', '1f92f'], ['😳', '1f633'], ['🙄', '1f644'],
        ['🤥', '1f925'], ['😦', '1f626'], ['🤤', '1f924'], ['😉', '1f609'],
        ['☠️', '2620-fe0f'], ['🤝', '1f91d'],
    ];

    const CDN = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/';
    const CODE = {};
    LIST.forEach(([ch, code]) => { CODE[ch] = code; });

    /* Для подстановки в текст сообщений: ищем любой из наших символов.
       Длинные последовательности идут первыми, иначе «☠️» распадётся. */
    const RE = new RegExp(
        LIST.map(([ch]) => ch).sort((a, b) => b.length - a.length)
            .map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');

    function imgFor(ch, cls) {
        const code = CODE[ch];
        if (!code) return ch;
        /* alt держит настоящий символ: если картинка не загрузится,
           браузер покажет системный эмодзи, а копирование даст текст */
        return `<img class="emo ${cls || ''}" src="${CDN}${code}.png" alt="${ch}" draggable="false" loading="lazy">`;
    }

    /** Заменяет эмодзи в уже экранированном тексте на картинки. */
    function render(html) {
        return String(html == null ? '' : html).replace(RE, ch => imgFor(ch));
    }

    /* ---------- панель ---------- */
    function mount(row, input) {
        if (!row || !input || row.querySelector('.emo-btn')) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'emo-btn';
        btn.setAttribute('aria-label', 'Эмодзи');
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
            <circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.15" fill="currentColor" stroke="none"/>
            <circle cx="15" cy="10" r="1.15" fill="currentColor" stroke="none"/>
            <path d="M8.2 14.2a4.6 4.6 0 0 0 7.6 0" stroke-linecap="round"/></svg>`;

        const pop = document.createElement('div');
        pop.className = 'emo-pop';
        pop.innerHTML = `<div class="emo-grid">${
            LIST.map(([ch]) => `<button type="button" class="emo-cell" data-e="${ch}">${imgFor(ch, 'big')}</button>`).join('')
        }</div>`;

        row.appendChild(btn);
        row.appendChild(pop);

        const close = () => {
            pop.classList.remove('on');
            btn.classList.remove('on');
        };
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const on = !pop.classList.contains('on');
            pop.classList.toggle('on', on);
            btn.classList.toggle('on', on);
        });
        /* вставляем в позицию курсора, а не в конец строки */
        pop.addEventListener('click', e => {
            const cell = e.target.closest('.emo-cell');
            if (!cell) return;
            const ch = cell.dataset.e;
            const at = input.selectionStart == null ? input.value.length : input.selectionStart;
            const to = input.selectionEnd == null ? at : input.selectionEnd;
            const max = parseInt(input.getAttribute('maxlength'), 10) || 200;
            const next = (input.value.slice(0, at) + ch + input.value.slice(to)).slice(0, max);
            input.value = next;
            const pos = Math.min(at + ch.length, next.length);
            input.focus();
            try { input.setSelectionRange(pos, pos); } catch (err) {}
        });
        document.addEventListener('click', ev => {
            if (pop.classList.contains('on') && !pop.contains(ev.target) && ev.target !== btn) close();
        });
        input.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === 'Escape') close(); });
    }

    global.Emoji = { mount, render, imgFor, LIST };
})(window);
