/* Spark: «Поделиться рекордом» — карточка топа и богатое сообщение.
   Карточку рисуем на холсте здесь (цвета игры, иконка, аватар, место, топ-5
   с твоей строкой), показываем превью в шторке; по «Отправить» картинка
   уходит на сервер, сервер собирает богатое сообщение (картинка, имя-ссылка
   с приглашением, кнопка «Побить рекорд»), Telegram открывает выбор чата. */
(function () {
    'use strict';
    if (window.SparkShare) return;
    const API = 'https://spark-game-backend.onrender.com';
    const tg = window.Telegram?.WebApp;
    const W = 1200, H = 900;
    const COLORS = {
        saper: ['#63b4ff', '#2463d8', '#10235f'], checkers: ['#aab1bd', '#5b616c', '#1a1b20'], chess: ['#b9c5da', '#5b6987', '#232a3d'],
        nardy: ['#f5ab6c', '#a9531b', '#4a1f08'], bb: ['#55f2bd', '#0f9a78', '#093f5e'], sudoku: ['#d7a2ff', '#8b33ff', '#350b8f'],
        tower: ['#62f2a6', '#10a06a', '#0a426d'], wordle: ['#55f1ff', '#0799b0', '#094853'], monopoly: ['#ff8585', '#d81c2c', '#540914'],
    };
    const ICONS = { saper: 'minesweeper', bb: 'block-blast' };
    const NAMES = { saper: 'minesweeper', bb: 'blockBlast' };
    const RING = { 1: ['#fff1a8', '#ffc400', '#e08a00'], 2: ['#f6f8fb', '#cdd5e0', '#8f9bb0'], 3: ['#ffd6ad', '#e08a45', '#a8531a'] };
    const T = {
        ru: { label: 'Поделиться', title: 'Поделиться рекордом', send: 'Отправить в чат', note: 'Друзья увидят карточку и смогут сразу побить твой результат — по твоей ссылке.', place: n => `${n} место`, top: 'Топ', you: 'ты', better: 'Сможешь лучше?', notInTop: 'Сначала попади в топ — и будет чем поделиться', failed: 'Не получилось подготовить сообщение', shareText: 'Мой рекорд в Spark — сможешь лучше?' },
        en: { label: 'Share', title: 'Share your record', send: 'Send to a chat', note: 'Friends will see the card and can try to beat you right away — through your link.', place: n => `#${n}`, top: 'Top', you: 'you', better: 'Can you beat it?', notInTop: 'Get into the top first — then there’s something to share', failed: 'Could not prepare the message', shareText: 'My record in Spark — can you beat it?' },
    };
    const lang = () => { try { return currentLang || 'ru'; } catch (_) { return 'ru'; } };   // eslint-disable-line no-undef
    const tr = (key, ...a) => { const d = T[lang()] || T.en; const v = d[key] ?? T.en[key]; return typeof v === 'function' ? v(...a) : v; };
    const appT = key => { try { return t(key); } catch (_) { return key; } };   // eslint-disable-line no-undef
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const group = n => Math.trunc(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 12.5v5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-5"/></svg>';
    const FONT = '-apple-system, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

    /* ---------- картинки ---------- */
    function loadImage(src) {
        return new Promise(resolve => {
            if (!src) return resolve(null);
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = src;
        });
    }
    /** Аватарки Telegram — через сервер (без CORS холст «портится» и не сохраняется). */
    async function avatar(url) {
        if (typeof url !== 'string' || !/^https:\/\//.test(url)) return null;
        const src = /^https:\/\/t\.me\//.test(url) ? `${API}/api/avatar?u=${encodeURIComponent(url)}` : url;
        try {
            const r = await fetch(src);
            if (!r.ok) return null;
            const blob = await r.blob();
            return loadImage(URL.createObjectURL(blob));
        } catch (_) { return null; }
    }
    /** Кадр анимированного эмодзи как картинка: lottie рисует SVG, его и кладём на холст. */
    async function emojiImage(name, frame = 0) {
        try {
            const text = await window.SparkJuicy.data(name);
            const box = document.createElement('div');
            box.style.cssText = 'position:fixed;left:-9999px;top:0;width:256px;height:256px;';
            document.body.appendChild(box);
            const anim = window.lottie.loadAnimation({ container: box, renderer: 'svg', loop: false, autoplay: false, animationData: JSON.parse(text) });
            anim.goToAndStop(frame, true);
            const svg = box.querySelector('svg');
            svg.setAttribute('width', '256'); svg.setAttribute('height', '256');
            svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            const markup = new XMLSerializer().serializeToString(svg);
            anim.destroy(); box.remove();
            return loadImage(URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' })));
        } catch (_) { return null; }
    }

    /* ---------- рисование ---------- */
    function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
    function fitText(ctx, text, max, size, weight) {
        let s = size;
        do { ctx.font = `${weight} ${s}px ${FONT}`; s -= 2; } while (ctx.measureText(text).width > max && s > 14);
        if (ctx.measureText(text).width <= max) return text;
        let cut = text;
        while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
        return `${cut}…`;
    }
    function circleImage(ctx, img, cx, cy, r, letter, hue) {
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
        if (img) {
            const s = Math.max((2 * r) / img.width, (2 * r) / img.height);
            ctx.drawImage(img, cx - img.width * s / 2, cy - img.height * s / 2, img.width * s, img.height * s);
        } else {
            const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
            g.addColorStop(0, `hsl(${hue} 80% 62%)`); g.addColorStop(1, `hsl(${hue} 70% 42%)`);
            ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
            ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(r * .9)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(letter, cx, cy + r * .04);
        }
        ctx.restore();
    }
    const hue = text => [...String(text)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);

    async function drawCard({ game, gameName, categoryName, rows, meIndex, isTime }) {
        const [c1, c2, c3] = COLORS[game] || COLORS.saper;
        const me = rows[meIndex];
        const place = Number(me.rank) || meIndex + 1;
        const fmt = v => isTime ? `${Number(v).toFixed(3)} ${lang() === 'ru' ? 'с' : 's'}` : group(v);
        // топ-5: первые строки и твоя (если ты ниже)
        const list = rows.filter(r => !r.rank).slice(0, 5).map((r, i) => ({ ...r, place: i + 1 }));
        if (!list.some(r => String(r.user_id) === String(me.user_id))) { list.splice(4, 1); list.push({ ...me, place }); }
        const [icon, ava, crown, medal, ...avas] = await Promise.all([
            loadImage(`assets/game-icons/${ICONS[game] || game}.png`), avatar(me.photo_url),
            place === 1 ? emojiImage('crown', 0) : null, place === 2 || place === 3 ? emojiImage(`medal${place}`, 30) : null,
            ...list.map(r => avatar(r.photo_url)),
        ]);
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        // фон: цвет игры со светом из левого верхнего угла, как карточки на главной
        let g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1500);
        g.addColorStop(0, c1); g.addColorStop(.42, c2); g.addColorStop(1, c3);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        g = ctx.createRadialGradient(300, 420, 0, 300, 420, 420);
        g.addColorStop(0, 'rgba(255,255,255,.26)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        // шапка: иконка, игра и раздел; справа — Spark
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10;
        if (icon) ctx.drawImage(icon, 64, 56, 112, 112);
        ctx.restore();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(fitText(ctx, gameName, 560, 54, 850), 200, 110);
        ctx.fillStyle = 'rgba(255,255,255,.78)';
        ctx.fillText(fitText(ctx, categoryName, 560, 32, 650), 200, 154);
        // знак Spark — четырёхлучевая искра, как в логотипе
        const sx = W - 64 - 26, sy = 96, sr = 26;
        ctx.beginPath(); ctx.moveTo(sx, sy - sr);
        ctx.quadraticCurveTo(sx + 4, sy - 4, sx + sr, sy); ctx.quadraticCurveTo(sx + 4, sy + 4, sx, sy + sr);
        ctx.quadraticCurveTo(sx - 4, sy + 4, sx - sr, sy); ctx.quadraticCurveTo(sx - 4, sy - 4, sx, sy - sr);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.font = `800 30px ${FONT}`; ctx.textAlign = 'right';
        ctx.fillText('Spark', sx - sr - 12, 107);
        // герой: аватар с кольцом места, имя, результат, место
        const cx = 300, cy = 395, r = 118;
        const ring = RING[place];
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 14;
        ctx.beginPath(); ctx.arc(cx, cy, r + 12, 0, Math.PI * 2);
        if (ring) { g = ctx.createLinearGradient(cx, cy - r, cx, cy + r); g.addColorStop(0, ring[0]); g.addColorStop(.5, ring[1]); g.addColorStop(1, ring[2]); ctx.fillStyle = g; }
        else ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.fill(); ctx.restore();
        circleImage(ctx, ava, cx, cy, r, String(me.username || '?').slice(0, 1).toUpperCase(), hue(me.username || ''));
        if (crown) ctx.drawImage(crown, cx - 70, cy - r - 108, 140, 140);
        if (medal) ctx.drawImage(medal, cx + r - 70, cy + r - 92, 120, 120);
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
        ctx.fillText(fitText(ctx, String(me.username || ''), 470, 44, 850), cx, cy + r + 76);
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
        ctx.fillText(fitText(ctx, fmt(me.score), 500, 96, 900), cx, cy + r + 178);
        ctx.restore();
        const pill = tr('place', place);
        ctx.font = `850 34px ${FONT}`;
        const pw = ctx.measureText(pill).width + 56;
        roundRect(ctx, cx - pw / 2, cy + r + 206, pw, 60, 30);
        ctx.fillStyle = ring ? ring[1] : 'rgba(255,255,255,.95)'; ctx.fill();
        ctx.fillStyle = ring ? (place === 2 ? '#3a4458' : '#4a2600') : c3;
        ctx.fillText(pill, cx, cy + r + 248);
        // справа: топ с твоей строкой
        const px = 610, py = 214, pwid = W - px - 56, rowH = 110;
        roundRect(ctx, px, py, pwid, 40 + list.length * rowH + 20, 40);
        ctx.fillStyle = 'rgba(255,255,255,.13)'; ctx.fill();
        ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `800 26px ${FONT}`;
        ctx.fillText(tr('top').toUpperCase(), px + 32, py + 48);
        list.forEach((row, i) => {
            const y = py + 66 + i * rowH;
            const mine = String(row.user_id) === String(me.user_id);
            if (mine) { roundRect(ctx, px + 14, y, pwid - 28, rowH - 12, 28); ctx.fillStyle = 'rgba(255,255,255,.26)'; ctx.fill(); }
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `900 30px ${FONT}`;
            ctx.fillText(String(row.place), px + 58, y + 60);
            circleImage(ctx, avas[i], px + 124, y + 49, 32, String(row.username || '?').slice(0, 1).toUpperCase(), hue(row.username || ''));
            ctx.textAlign = 'right'; ctx.font = `850 30px ${FONT}`;
            const val = fmt(row.score);
            ctx.fillText(val, px + pwid - 36, y + 60);
            const vw = ctx.measureText(val).width;
            ctx.textAlign = 'left';
            ctx.fillStyle = mine ? '#fff' : 'rgba(255,255,255,.9)';
            const name = mine ? `${row.username} · ${tr('you')}` : String(row.username || '');
            ctx.fillText(fitText(ctx, name, pwid - 36 - vw - 210, 28, mine ? 850 : 650), px + 172, y + 59);
        });
        // внизу: вызов
        ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = `800 30px ${FONT}`;
        ctx.fillText(tr('better'), px + pwid / 2, H - 34);
        return canvas;
    }

    /* ---------- шторка ---------- */
    const sheet = () => document.getElementById('shareSheet');
    function close() { sheet()?.classList.remove('visible'); }
    window.closeShareSheet = close;
    let job = 0;
    async function record({ game, category }) {
        const el = sheet();
        const panel = el?.querySelector('.ui-mode-panel');
        if (!panel) return;
        const my = ++job;
        try { tg?.HapticFeedback?.impactOccurred('light'); } catch (_) {}
        const cats = (typeof topsCategories === 'function' ? topsCategories()[game] : null) || [];   // eslint-disable-line no-undef
        const cat = cats.find(c => c.id === category);
        const gameName = appT(NAMES[game] || game);
        const categoryName = cat ? appT(cat.nameKey) : '';
        panel.innerHTML = `
            <div class="ui-sheet-grab" aria-hidden="true"></div>
            <div class="ui-sheet-heading"><h2 id="shareSheetHeading">${esc(tr('title'))}</h2><button class="ui-close" type="button" aria-label="×"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button></div>
            <div class="sh-preview is-loading"><div class="sh-skel"></div></div>
            <p class="sh-note">${esc(tr('note'))}</p>
            <button class="btn-main sh-send" type="button" disabled>${ICON}<span>${esc(tr('send'))}</span></button>`;
        panel.querySelector('.ui-close').onclick = close;
        el.classList.add('visible');
        let rows;
        try { rows = await fetchTops(game, category); } catch (_) { rows = null; }   // eslint-disable-line no-undef
        if (my !== job) return;
        const uid = String(tg?.initDataUnsafe?.user?.id || '');
        const meIndex = Array.isArray(rows) ? rows.findIndex(r => String(r.user_id) === uid) : -1;
        if (meIndex < 0) { close(); window.SparkToast?.show(tr('notInTop'), 'info'); return; }
        const canvas = await drawCard({ game, gameName, categoryName, rows, meIndex, isTime: !!cat?.isTime });
        if (my !== job) return;
        const preview = panel.querySelector('.sh-preview');
        preview.classList.remove('is-loading');
        preview.innerHTML = '';
        const img = new Image();
        img.alt = '';
        img.src = canvas.toDataURL('image/jpeg', .9);
        preview.appendChild(img);
        const send = panel.querySelector('.sh-send');
        send.disabled = false;
        send.onclick = async () => {
            send.disabled = true;
            send.classList.add('is-busy');
            const ok = await deliver(canvas, { game, category, gameName, categoryName });
            send.disabled = false;
            send.classList.remove('is-busy');
            if (ok) close();
        };
    }
    async function deliver(canvas, { game, category, gameName, categoryName }) {
        const headers = tg?.initData ? { 'X-Init-Data': tg.initData } : null;
        const fallback = () => {
            const uid = tg?.initDataUnsafe?.user?.id;
            const link = uid ? `https://t.me/spark_game_bot/spark?startapp=ref_${uid}` : 'https://t.me/spark_game_bot/spark';
            const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(tr('shareText'))}`;
            if (tg?.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
            return true;
        };
        if (!headers || typeof tg?.shareMessage !== 'function') return fallback();
        try {
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .88));
            const up = await fetch(`${API}/api/share/card`, { method: 'POST', headers: { ...headers, 'Content-Type': 'image/jpeg' }, body: blob });
            const card = await up.json();
            if (!up.ok || !card.id) throw new Error(card.error || 'upload');
            const prep = await fetch(`${API}/prepare-share`, {
                method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind: 'record', card_id: card.id, game, category, game_name: gameName, category_name: categoryName, lang: lang() }),
            });
            const prepared = await prep.json();
            if (!prep.ok || !prepared.id) throw new Error(prepared.error || 'prepare');
            await tg.shareMessage(prepared.id);
            return true;
        } catch (error) {
            console.warn('[share] record:', error.message);
            window.SparkToast?.show(tr('failed'), 'error');
            return false;
        }
    }

    window.SparkShare = {
        record, close, drawCard,
        label: () => tr('label'),
        buttonHtml: () => `${ICON}<span>${esc(tr('label'))}</span>`,
    };
})();
