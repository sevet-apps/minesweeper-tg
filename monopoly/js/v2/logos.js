/* ============================================================
   logos.js — логотипы брендов для плиток.
   Сначала пробуем реальный ассет  assets/brands/<key>.svg|png
   (просто положите файлы в папку — подхватятся сами),
   при отсутствии рисуем инлайновую SVG-аппроксимацию.
   ============================================================ */
(function (global) {
    'use strict';

    const F_SANS   = "-apple-system,'Segoe UI',Roboto,Arial,sans-serif";
    const F_SERIF  = "Georgia,'Times New Roman',serif";
    const F_SCRIPT = "'Brush Script MT','Segoe Script','Snell Roundhand',cursive";

    function txt(t, { x = 60, y = 26, size = 22, fill = '#111', font = F_SANS,
                      weight = 700, ls = 0, anchor = 'middle', style = '' } = {}) {
        return `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}"
            font-weight="${weight}" fill="${fill}" letter-spacing="${ls}"
            text-anchor="${anchor}" ${style}>${t}</text>`;
    }
    function svg(inner, w = 120, h = 40) {
        return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"
            preserveAspectRatio="xMidYMid meet"
            xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
    }

    const L = {};

    /* --- Парфюмерия --- */
    L.chanel = () => svg(
        `<g stroke="#111" stroke-width="4.5" fill="none">
            <path d="M 52 8 A 12 12 0 1 0 52 32"/>
            <path d="M 68 8 A 12 12 0 1 1 68 32"/>
         </g>` + txt('CHANEL', { x: 60, y: 38, size: 9, ls: 2.5, weight: 600 }), 120, 42);

    L.boss = () => svg(
        txt('BOSS', { x: 60, y: 24, size: 26, font: F_SERIF, ls: 3 }) +
        txt('HUGO BOSS', { x: 60, y: 36, size: 6.5, ls: 3.2, weight: 500, fill: '#333' }));

    /* --- Автомобили --- */
    L.mercedes = () => svg(
        `<g stroke="#222" stroke-width="3" fill="none">
            <circle cx="60" cy="20" r="17"/>
            <path d="M60 3 L60 20 M60 20 L45.6 29.5 M60 20 L74.4 29.5"/>
         </g>`, 120, 40);

    L.audi = () => {
        let c = '';
        for (let i = 0; i < 4; i++)
            c += `<circle cx="${28 + i * 21.5}" cy="20" r="12.5" stroke="#222" stroke-width="3.4" fill="none"/>`;
        return svg(c, 120, 40);
    };

    L.ford = () => svg(
        `<ellipse cx="60" cy="20" rx="42" ry="17" fill="#1b4fa3"/>
         <ellipse cx="60" cy="20" rx="39" ry="14.5" fill="none" stroke="#fff" stroke-width="1.6"/>` +
        txt('Ford', { x: 60, y: 28, size: 21, fill: '#fff', font: F_SCRIPT, weight: 400, style: 'font-style="italic"' }));

    L.landrover = () => svg(
        `<ellipse cx="60" cy="20" rx="44" ry="16" fill="#2e5f34"/>` +
        txt('LAND', { x: 60, y: 17, size: 9.5, fill: '#fff', ls: 2.4 }) +
        `<line x1="30" y1="20" x2="49" y2="20" stroke="#fff" stroke-width="1.2"/>
         <line x1="71" y1="20" x2="90" y2="20" stroke="#fff" stroke-width="1.2"/>` +
        txt('ROVER', { x: 60, y: 30, size: 9.5, fill: '#fff', ls: 2.1 }));

    /* --- Одежда --- */
    L.adidas = () => svg(
        `<g fill="#111">
            <polygon points="34,18 44,18 40,25 30,25"/>
            <polygon points="47,11 58,11 50,25 41,25"/>
            <polygon points="61,4 73,4 60,25 51,25"/>
         </g>` + txt('adidas', { x: 55, y: 37, size: 12, weight: 700 }), 110, 40);

    L.puma = () => svg(
        txt('PUMA', { x: 58, y: 30, size: 26, ls: 1, style: 'font-style="italic"' }) +
        `<path d="M92 8 q6 -6 10 -2 q3 3 -1 7 l-7 9 q-3 4 -7 3" fill="#111"/>`, 120, 40);

    L.lacoste = () => svg(
        `<path d="M45 8 q8 -5 16 -1 q9 4 14 2 l6 -2 -3 4 q-6 5 -15 3 q-9 -2 -14 1 l-6 3 z" fill="#2e7d32"/>
         <circle cx="76" cy="7.5" r="1.1" fill="#c62828"/>` +
        txt('LACOSTE', { x: 60, y: 34, size: 13, ls: 2 }), 120, 40);

    /* --- Веб-сервисы --- */
    L.circleplus = () => svg(
        `<circle cx="60" cy="20" r="16" fill="#29c5e6"/>
         <path d="M67 13 a10 10 0 1 0 0 14" stroke="#fff" stroke-width="4.5" fill="none" stroke-linecap="round"/>
         <path d="M69 16 v8 M65 20 h8" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`, 120, 40);

    L.friender = () => svg(
        txt('friender', { x: 60, y: 28, size: 22, fill: '#6c5ce7', weight: 600, font: F_SANS }));

    L.chirp = () => svg(
        `<g fill="#2ecc9a">
            <path d="M45 25 q0 -13 14 -13 q7 0 9 5 l6 -2 -4 5 q1 12 -12 14 q-10 1 -13 -9 z"/>
            <circle cx="63.5" cy="16.5" r="1.4" fill="#fff"/>
            <path d="M52 22 l14 -3 -12 7 z" fill="#fff" opacity=".9"/>
         </g>`, 120, 40);

    /* --- Разработчики игр --- */
    L.rockstar = () => svg(
        `<rect x="42" y="2" width="36" height="36" rx="8" fill="#f5b800"/>
         ${txt('R', { x: 58, y: 30, size: 26, font: F_SERIF, weight: 800 })}
         <path d="M70 26 l2.2 4.4 4.8.6 -3.5 3.3 .9 4.7 -4.4 -2.3 -4.4 2.3 .9 -4.7 -3.5 -3.3 4.8 -.6 z"
               fill="#111" transform="scale(.62) translate(43,14)"/>`, 120, 40);

    L.rovio = () => svg(
        txt('ROVIO', { x: 62, y: 28, size: 24, fill: '#d0342c', weight: 800, ls: 1 }) +
        `<path d="M30 26 q-6 -2 -4 -9 q6 3 8 7 z" fill="#d0342c"/>`, 120, 40);

    /* --- Напитки --- */
    L.cocacola = () => svg(
        txt('Coca-Cola', { x: 60, y: 28, size: 24, fill: '#e4131b', font: F_SCRIPT, weight: 400 }));

    L.pepsi = () => svg(
        `<circle cx="34" cy="20" r="14" fill="#fff" stroke="#e6e6e6"/>
         <path d="M20.5 17 a14 14 0 0 1 27 -1 q-14 6 -27 1z" fill="#e4131b"/>
         <path d="M20.8 24 a14 14 0 0 0 26.5 -2 q-13 7 -26.5 2z" fill="#1b4fa3"/>` +
        txt('pepsi', { x: 78, y: 27, size: 20, fill: '#12386e', weight: 600 }), 120, 40);

    L.fanta = () => svg(
        `<path d="M28 20 q0 -14 32 -13 q34 1 32 13 q2 13 -32 13 q-32 0 -32 -13z" fill="#ff8300"/>` +
        txt('Fanta', { x: 60, y: 27, size: 19, fill: '#fff', font: F_SCRIPT, weight: 400,
                       style: 'transform="rotate(-4 60 27)"' }), 120, 40);

    /* --- Авиалинии --- */
    L.americanairlines = () => svg(
        `<path d="M30 30 q6 -18 12 -22 q3 -2 4 2 l6 20z" fill="#c9082a"/>
         <path d="M40 30 q8 -14 14 -16 l4 16z" fill="#1b4fa3"/>` +
        txt('American Airlines', { x: 78, y: 24, size: 10.5, weight: 600, fill: '#25272e' }), 130, 40);

    L.lufthansa = () => svg(
        `<circle cx="32" cy="20" r="14" fill="none" stroke="#0a1e6e" stroke-width="2.6"/>
         <path d="M24 26 q8 -13 17 -12 l-4 4 q-7 0 -10 9z" fill="#0a1e6e"/>` +
        txt('Lufthansa', { x: 80, y: 25, size: 15, fill: '#0a1e6e', weight: 600 }), 130, 40);

    L.britishairways = () => svg(
        `<path d="M22 26 q26 -14 42 -10 l-8 6 q-18 -2 -34 4z" fill="#c9082a"/>
         <path d="M26 21 q22 -11 36 -9 l-4 3 q-16 -1 -32 6z" fill="#1b4fa3"/>` +
        txt('BRITISH AIRWAYS', { x: 66, y: 36, size: 8.5, ls: 1.4, fill: '#1b2a5e', weight: 600 }), 130, 42);

    /* --- Рестораны --- */
    L.kfc = () => svg(
        `<rect x="40" y="4" width="9" height="32" fill="#e4131b"/>
         <rect x="53" y="4" width="9" height="32" fill="#fff" stroke="#eee"/>
         <rect x="66" y="4" width="9" height="32" fill="#e4131b"/>` +
        txt('KFC', { x: 57.5, y: 25, size: 13, weight: 800,
                     style: 'transform="rotate(-90 57.5 21)"' }), 116, 40);

    L.burgerking = () => svg(
        `<path d="M38 16 q22 -12 44 0 z" fill="#f5a300"/>
         <path d="M38 24 q22 12 44 0 z" fill="#f5a300"/>` +
        txt('BURGER', { x: 60, y: 17.5, size: 9, fill: '#d0342c', weight: 800, style: 'transform="rotate(-3 60 17)"' }) +
        txt('KING', { x: 60, y: 26.5, size: 9, fill: '#d0342c', weight: 800, style: 'transform="rotate(-3 60 26)"' }), 120, 40);

    L.maxburgers = () => svg(
        `<g transform="translate(38,2) scale(.9)">
            <path d="M4 14 q20 -16 40 0 z" fill="#e8a33a"/>
            <rect x="4" y="15" width="40" height="5" rx="2.5" fill="#7cb342"/>
            <rect x="2" y="21" width="44" height="6" rx="3" fill="#8d5524"/>
            <path d="M4 29 h40 q0 8 -20 8 q-20 0 -20 -8z" fill="#e8a33a"/>
         </g>
         <rect x="52" y="14" width="22" height="13" rx="2" fill="#d0342c"/>` +
        txt('MAX', { x: 63, y: 24, size: 9.5, fill: '#fff', weight: 800 }), 120, 42);

    /* --- Отели --- */
    L.holidayinn = () => svg(
        `<rect x="20" y="6" width="24" height="24" rx="6" fill="#2e7d32"/>
         ${txt('H', { x: 32, y: 25, size: 18, fill: '#fff', font: F_SCRIPT, weight: 400 })}` +
        txt('Holiday Inn', { x: 78, y: 25, size: 16, fill: '#2e7d32', font: F_SCRIPT, weight: 400 }), 130, 40);

    L.radisson = () => svg(
        txt('Radisson', { x: 52, y: 26, size: 20, font: F_SCRIPT, weight: 400, fill: '#14213d' }) +
        `<rect x="92" y="14" width="24" height="13" rx="2" fill="#1b6ac9"/>` +
        txt('BLU', { x: 104, y: 24, size: 8.5, fill: '#fff', weight: 700 }), 130, 40);

    L.novotel = () => svg(
        `<path d="M52 6 q8 -5 16 0 q-8 3 -16 0z" fill="#8a9bb8"/>` +
        txt('NOVOTEL', { x: 60, y: 26, size: 15, ls: 3, fill: '#1c2b4a', weight: 600 }) +
        txt('HOTELS & RESORTS', { x: 60, y: 35, size: 5.4, ls: 2, fill: '#6b7688', weight: 500 }), 120, 40);

    /* --- Электроника --- */
    L.apple = () => svg(
        `<g fill="#111" transform="translate(48,2) scale(.34)">
            <path d="M66 26 c-1 8 3 16 9 21 -3 8 -8 17 -15 25 -6 7 -12 14 -21 14 -8 0 -11 -5 -21 -5 -10 0 -13 5 -21 5 -9 0 -16 -8 -22 -15 C -37 58 -42 40 -36 27 -32 18 -23 12 -13 12 c8 0 14 5 21 5 6 0 13 -6 22 -5 4 0 14 1 21 10 -1 1 -12 7 -12 21z M43 -8 C 47 -13 50 -20 49 -27 43 -27 35 -23 30 -17 c-4 5 -8 12 -7 19 7 1 15 -4 20 -10z" transform="translate(50,32)"/>
         </g>`, 120, 40);

    L.nokia = () => svg(
        txt('NOKIA', { x: 60, y: 29, size: 25, fill: '#124191', weight: 800, ls: 1 }));

    /* --- сопоставление индексов доски ключам --- */
    const KEY_BY_TILE = {
        1: 'chanel', 3: 'boss', 5: 'mercedes', 6: 'adidas', 8: 'puma', 9: 'lacoste',
        11: 'circleplus', 12: 'rockstar', 13: 'friender', 14: 'chirp', 15: 'audi',
        16: 'cocacola', 18: 'pepsi', 19: 'fanta',
        21: 'americanairlines', 23: 'lufthansa', 24: 'britishairways',
        25: 'ford', 26: 'maxburgers', 27: 'burgerking', 28: 'rovio', 29: 'kfc',
        31: 'holidayinn', 32: 'radisson', 34: 'novotel',
        35: 'landrover', 37: 'apple', 39: 'nokia',
    };

    /**
     * Возвращает DOM-элемент логотипа: сразу рисуем инлайновую SVG.
     * Реальные файлы подключаются через манифест assets/brands/manifest.json
     * (JSON-массив имён, напр. ["chanel","nokia.png"]) — один запрос,
     * никакого перебора файлов и спама ошибками в консоли.
     */
    const holders = {};   // key -> [holder,...]
    const A = global.MonopolyAssets || {};   // встроенные ассеты (standalone-сборка)

    function logoEl(tileIndex) {
        const key = KEY_BY_TILE[tileIndex];
        const holder = document.createElement('div');
        holder.className = 'logo';
        if (!key) return holder;
        if (A.brands && A.brands[key]) {
            holder.innerHTML = A.brands[key];       // реальный логотип, встроенный в сборку
            holder.classList.add('prerotated');     // готовые файлы уже ориентированы как надо
        } else {
            holder.innerHTML = (L[key] ? L[key]() : '');
            (holders[key] = holders[key] || []).push(holder);  // кандидат на апгрейд манифестом
        }
        return holder;
    }

    /* иконка (углы, RIP и т.п.): встроенная -> файл assets/icons -> эмодзи-фолбэк */
    function iconEl(name, fallbackEmoji) {
        const holder = document.createElement('div');
        holder.className = 'logo';
        holder.classList.add('prerotated');
        if (A.icons && A.icons[name]) { holder.innerHTML = A.icons[name]; return holder; }
        const img = document.createElement('img');
        img.alt = name; img.draggable = false;
        img.onerror = () => { holder.innerHTML = `<span class="tile-emoji">${fallbackEmoji || ''}</span>`; };
        img.src = `assets/icons/${name}.svg`;
        holder.appendChild(img);
        return holder;
    }

    /* тихо пробуем манифест; нет — остаёмся на инлайне */
    (typeof fetch === 'function' ? fetch('assets/brands/manifest.json') : Promise.reject())
        .then(r => (r.ok ? r.json() : null))
        .then(list => {
            if (!Array.isArray(list)) return;
            list.forEach(entry => {
                const [key, ext = 'svg'] = String(entry).split('.');
                (holders[key] || []).forEach(h => {
                    const img = document.createElement('img');
                    img.alt = key; img.draggable = false;
                    img.onload = () => { h.innerHTML = ''; h.appendChild(img); h.classList.add('prerotated'); };
                    img.src = `assets/brands/${key}.${ext}`;
                });
            });
        })
        .catch(() => { /* file:// или нет папки — молча инлайн */ });

    global.MonopolyLogos = { logoEl, iconEl, KEY_BY_TILE, RENDERERS: L };
})(window);
