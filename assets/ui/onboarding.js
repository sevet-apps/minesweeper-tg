/* Знакомство со Spark: несколько ярких карточек при первом запуске.
   Закрыть нельзя — только «Дальше»; кнопка наполняется, пока человек читает,
   и срабатывает, когда заполнится. Повтор — из настроек (SparkIntro.open). */
(function (root) {
    'use strict';
    if (root.SparkIntro) return;

    const SRC = new URL(document.currentScript?.src || location.href);
    const BASE = new URL('..', SRC).href;   // …/assets/
    const VERSION = SRC.searchParams.get('v') || '';
    const DONE_KEY = 'spark_intro_done';
    const READ_MS = 1500;
    const REDUCED = !!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const tg = () => root.Telegram?.WebApp;
    const LANGS = ['ru', 'en', 'zh', 'es', 'pt', 'id', 'fr', 'ja', 'de', 'ko', 'tr', 'vi'];

    const T = {
        next: ['Дальше', 'Next', '下一步', 'Siguiente', 'Próximo', 'Lanjut', 'Suivant', '次へ', 'Weiter', '다음', 'İleri', 'Tiếp tục'],
        start: ['Начать играть', 'Start playing', '开始游戏', 'Empezar a jugar', 'Começar a jogar', 'Mulai bermain', 'Commencer à jouer', 'プレイを始める', 'Los geht’s', '게임 시작', 'Oynamaya başla', 'Bắt đầu chơi'],
        gamesTitle: ['8 игр в одном месте', '8 games in one app', '一个应用，8 款游戏', '8 juegos en una app', '8 jogos em um app', '8 game dalam satu aplikasi', '8 jeux dans une seule appli', '1つのアプリに8つのゲーム', '8 Spiele in einer App', '앱 하나에 게임 8개', 'Tek uygulamada 8 oyun', '8 trò chơi, một ứng dụng'],
        gamesText: ['Шахматы, шашки, сапёр, судоку, Блок Бласт и другие — прямо в Telegram.', 'Chess, checkers, minesweeper, sudoku, Block Blast and more — right in Telegram.', '国际象棋、跳棋、扫雷、数独、方块爆破等，尽在 Telegram。', 'Ajedrez, damas, buscaminas, sudoku, Block Blast y más, directamente en Telegram.', 'Xadrez, damas, campo minado, sudoku, Block Blast e mais — direto no Telegram.', 'Catur, dam, sapu ranjau, sudoku, Block Blast, dan lainnya di Telegram.', 'Échecs, dames, démineur, sudoku, Block Blast et plus — directement dans Telegram.', 'チェス、数独、マインスイーパー、ブロックブラストなどをTelegramで。', 'Schach, Dame, Minesweeper, Sudoku, Block Blast und mehr – direkt in Telegram.', '체스, 체커, 지뢰찾기, 스도쿠, 블록 블라스트 등 — Telegram에서 바로.', 'Satranç, dama, mayın tarlası, sudoku, Block Blast ve fazlası Telegram’da.', 'Cờ vua, cờ đam, dò mìn, sudoku, Block Blast và hơn thế — ngay trong Telegram.'],
        onlineLabel: ['Онлайн', 'Online', '在线', 'En línea', 'Online', 'Online', 'En ligne', 'オンライン', 'Online', '온라인', 'Çevrimiçi', 'Trực tuyến'],
        onlineTitle: ['Играйте с друзьями', 'Play with friends', '和好友一起玩', 'Juega con amigos', 'Jogue com amigos', 'Main bersama teman', 'Jouez avec vos amis', '友達と対戦', 'Spiel mit Freunden', '친구와 함께', 'Arkadaşlarınızla oynayın', 'Chơi cùng bạn bè'],
        onlineText: ['Позовите друзей по ссылке и играйте в шахматы, шашки и Монополию.', 'Invite friends with a link and play chess, checkers and Monopoly online.', '用链接邀请好友，在线畅玩国际象棋、跳棋和大富翁。', 'Invita a amigos con un enlace y juega en línea: ajedrez, damas y Monopoly.', 'Convide amigos por link e joguem xadrez, damas e Monopoly online.', 'Ajak teman lewat tautan dan main catur, dam, dan Monopoly online.', 'Invitez vos amis par lien et jouez aux échecs, aux dames et au Monopoly.', 'リンクで友達を招待して、チェス・チェッカー・モノポリーをオンラインで。', 'Lade Freunde per Link ein und spielt online Schach, Dame und Monopoly.', '링크로 친구를 초대해 체스, 체커, 모노폴리를 온라인으로 즐기세요.', 'Arkadaşlarınızı bağlantıyla davet edin; satranç, dama ve Monopoly oynayın.', 'Mời bạn bằng liên kết và chơi cờ vua, cờ đam, Monopoly trực tuyến.'],
        topsLabel: ['Топ-1', 'Top 1', '第 1 名', 'Top 1', 'Top 1', 'Top 1', 'Top 1', '1位', 'Platz 1', '1위', 'Zirve', 'Top 1'],
        topsTitle: ['Поднимайтесь в топах', 'Climb the leaderboards', '冲上排行榜', 'Sube en las clasificaciones', 'Suba nos rankings', 'Naik di papan peringkat', 'Grimpez au classement', 'ランキングを駆け上がろう', 'Erobere die Bestenlisten', '랭킹을 올려 보세요', 'Sıralamalarda yükselin', 'Leo bảng xếp hạng'],
        topsText: ['У каждой игры свой топ. Побеждайте и собирайте титулы в профиле.', 'Every game has its own leaderboard. Win and collect titles in your profile.', '每款游戏都有独立排行榜。赢下对局，在个人资料中收集称号。', 'Cada juego tiene su ranking. Gana y colecciona títulos en tu perfil.', 'Cada jogo tem seu ranking. Vença e colecione títulos no perfil.', 'Setiap game punya peringkat sendiri. Menang dan kumpulkan gelar di profil.', 'Chaque jeu a son classement. Gagnez et collectionnez des titres.', 'ゲームごとにランキング。勝ってプロフィールで称号を集めよう。', 'Jedes Spiel hat eine eigene Bestenliste. Gewinne und sammle Titel im Profil.', '게임마다 랭킹이 따로 있습니다. 이기고 프로필에 칭호를 모으세요.', 'Her oyunun kendi sıralaması var. Kazanın, profilinizde unvan toplayın.', 'Mỗi trò có bảng xếp hạng riêng. Thắng và sưu tầm danh hiệu.'],
        prizeLabel: ['Турниры', 'Tournaments', '锦标赛', 'Torneos', 'Torneios', 'Turnamen', 'Tournois', 'トーナメント', 'Turniere', '토너먼트', 'Turnuvalar', 'Giải đấu'],
        prizeTitle: ['Денежные призы', 'Cash prizes', '现金奖励', 'Premios en efectivo', 'Prêmios em dinheiro', 'Hadiah uang', 'Prix en argent', '賞金', 'Geldpreise', '상금', 'Nakit ödüller', 'Thưởng tiền mặt'],
        prizeText: ['Займите первое место в турнире или топе рефоводов — получите деньги.', 'Finish first in a tournament or the Referrers Top and win cash.', '在锦标赛或邀请排行榜中夺得第一，赢取现金。', 'Gana un torneo o la clasificación de referidos y llévate dinero.', 'Fique em 1º num torneio ou no ranking de indicações e ganhe dinheiro.', 'Juarai turnamen atau peringkat pengundang dan menangkan uang tunai.', 'Soyez 1er d’un tournoi ou du classement des parrains : gagnez de l’argent.', 'トーナメントや友達紹介ランキングで1位になって賞金をゲット。', 'Werde Erster im Turnier oder in der Einladungs-Bestenliste – gewinne Geld.', '토너먼트나 초대 랭킹에서 1위를 하고 상금을 받으세요.', 'Turnuvada ya da davet sıralamasında birinci olun, para ödülü kazanın.', 'Đứng đầu giải đấu hoặc BXH mời bạn bè để nhận tiền thưởng.'],
    };
    const lang = () => {
        const code = typeof currentLang === 'string' ? currentLang : 'ru';
        return Math.max(0, LANGS.indexOf(code));
    };
    const tr = key => T[key][lang()] || T[key][1];
    const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

    const SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0C13 8 16 11 24 12C16 13 13 16 12 24C11 16 8 13 0 12C8 11 11 8 12 0Z"/></svg>';
    const sparkles = list => list.map(([x, y, s, d]) => `<i class="ob-spark" style="left:${x}%;top:${y}%;--s:${s};--d:${d}s">${SPARK}</i>`).join('');
    const PERSON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.2" r="4.4"/><path d="M3.6 21.2c.6-4.6 4.1-7.4 8.4-7.4s7.8 2.8 8.4 7.4z"/></svg>';
    /* Бот на пьедестале: голова робота, глаза — цветом подложки (currentColor). */
    const ROBOT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2a1.3 1.3 0 0 1 .7 2.4V6h3.6A3.7 3.7 0 0 1 20 9.7v6.6a3.7 3.7 0 0 1-3.7 3.7H7.7A3.7 3.7 0 0 1 4 16.3V9.7A3.7 3.7 0 0 1 7.7 6h3.6V4.6A1.3 1.3 0 0 1 12 2.2zM2 11h1.4v4H2zm18.6 0H22v4h-1.4z"/><circle cx="9" cy="12.6" r="1.8" fill="currentColor"/><circle cx="15" cy="12.6" r="1.8" fill="currentColor"/><rect x="9" y="16" width="6" height="1.6" rx=".8" fill="currentColor"/></svg>';

    function cards() {
        const icons = ['chess', 'checkers', 'minesweeper', 'sudoku', 'block-blast', 'tower', 'wordle', 'monopoly'];
        const board = Array.from({ length: 16 }, (_, i) => `<span class="${(i + Math.floor(i / 4)) % 2 ? 'd' : ''}"></span>`).join('');
        return [
            {
                theme: 'games', label: 'Spark', title: tr('gamesTitle'), text: tr('gamesText'),
                art: `<div class="ob-icons">${icons.map((name, i) => `<i style="--i:${i}"><img src="${BASE}game-icons/${name}.png" alt=""></i>`).join('')}</div>`
                    + sparkles([[8, 30, 1, 0], [88, 26, .7, .8], [14, 86, .6, 1.4], [86, 84, .9, .4]]),
            },
            {
                theme: 'online', label: tr('onlineLabel'), title: tr('onlineTitle'), text: tr('onlineText'),
                art: `<div class="ob-duel">
                        <span class="ob-ava a">${PERSON}</span>
                        <span class="ob-link l"><b></b><b></b><b></b></span>
                        <span class="ob-board">${board}<i style="background-image:url('${BASE}chess/pieces/bN.svg')"></i></span>
                        <span class="ob-link r"><b></b><b></b><b></b></span>
                        <span class="ob-ava b">${PERSON}</span>
                    </div>` + sparkles([[10, 82, .8, .2], [90, 30, .6, 1.1], [84, 86, .7, .6]]),
            },
            {
                theme: 'tops', label: tr('topsLabel'), title: tr('topsTitle'), text: tr('topsText'),
                art: `<div class="ob-podium">
                        <div class="ob-bar p2"><span class="ob-player bot silver">${ROBOT}</span><em>2</em></div>
                        <div class="ob-bar p1"><span class="ob-player owner"><img src="${BASE}ui/intro/owner.jpg" alt=""></span><em>1</em></div>
                        <div class="ob-bar p3"><span class="ob-player bot bronze">${ROBOT}</span><em>3</em></div>
                    </div>` + sparkles([[10, 34, .8, .3], [91, 30, .7, 1], [8, 60, .5, 1.6]]),
            },
            {
                theme: 'prize', label: tr('prizeLabel'), title: tr('prizeTitle'), text: tr('prizeText'),
                // анимированные эмодзи Telegram (lottie): сундук с золотом, медаль «1», знак доллара
                art: `<span class="ob-rays"></span><div class="ob-prize">
                        <span class="ob-lottie ob-l-medal is-waiting" data-anim="medal1" data-fallback="🥇"><i class="ob-fb">🥇</i></span>
                        <span class="ob-lottie ob-l-chest is-waiting" data-anim="chest" data-fallback="💰"><i class="ob-fb">💰</i></span>
                        <span class="ob-lottie ob-l-cash is-waiting" data-anim="dollar" data-fallback="💵"><i class="ob-fb">💵</i></span>
                    </div>`
                    + sparkles([[12, 30, .8, .4], [88, 34, .7, 1.2], [20, 74, .5, .9], [80, 72, .6, 0]]),
            },
        ];
    }

    let el = null;
    let index = 0;
    const anims = new Map();   // контейнер → анимация lottie

    function fallback(box) {
        anims.get(box)?.destroy?.();
        anims.set(box, null);
        box.textContent = box.dataset.fallback || '';
        box.classList.remove('is-waiting');
        box.classList.add('is-fallback');
    }
    function lottieFor(box) {
        if (anims.has(box)) return anims.get(box);
        if (!root.lottie?.loadAnimation) { fallback(box); return null; }
        const anim = root.lottie.loadAnimation({
            container: box, renderer: 'svg', loop: !REDUCED, autoplay: false,
            path: `${BASE}ui/intro/${box.dataset.anim}.json${VERSION ? `?v=${VERSION}` : ''}`,
            rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
        });
        anims.set(box, anim);
        // файл не загрузился — вместо пустого места обычный эмодзи
        anim.addEventListener('data_failed', () => fallback(box));
        // загрузился: убираем временный эмодзи; если карточка уже на экране — запускаем
        anim.addEventListener('DOMLoaded', () => {
            box.classList.remove('is-waiting');
            box.querySelector('.ob-fb')?.remove();
            if (el && box.closest('.ob-card')?.classList.contains('is-active')) play(anim);
        });
        return anim;
    }
    function play(anim) {
        if (REDUCED) anim.goToAndStop(Math.floor((anim.totalFrames || 2) / 2), true);
        else anim.goToAndPlay(0, true);
    }
    /** Играет только видимая карточка; анимации видимой грузятся сразу. */
    function syncLotties() {
        el.querySelectorAll('.ob-card').forEach((card, k) => {
            card.querySelectorAll('.ob-lottie').forEach(box => {
                if (k !== index && !anims.has(box)) return;
                const anim = lottieFor(box);
                if (!anim || !anim.isLoaded) return;
                if (k === index) play(anim); else anim.pause();
            });
        });
    }
    /** Остальные анимации подгружаем, пока читают первую карточку, — в простое, не во время перелистывания. */
    function preloadLotties() {
        const run = () => { if (el) try { el.querySelectorAll('.ob-lottie').forEach(box => lottieFor(box)); } catch (_) {} };
        if (root.requestIdleCallback) root.requestIdleCallback(run, { timeout: 2500 }); else setTimeout(run, 1200);
    }
    let readyTimer = 0;
    let onDone = null;

    function render() {
        const list = cards();
        el = document.createElement('div');
        el.className = 'ob-overlay';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.innerHTML = `
            <div class="ob-sheet">
                <div class="ob-viewport"><div class="ob-track">
                    ${list.map((c, i) => `<section class="ob-card" data-i="${i}" aria-hidden="${i ? 'true' : 'false'}">
                        <div class="ob-art ob-art--${c.theme}"><span class="ob-glow"></span><b class="ob-label">${esc(c.label)}</b>${c.art}</div>
                        <h2 class="ob-title" id="obTitle${i}">${esc(c.title)}</h2>
                        <p class="ob-text">${esc(c.text)}</p>
                    </section>`).join('')}
                </div></div>
                <div class="ob-dots" aria-hidden="true">${list.map(() => '<i></i>').join('')}</div>
                <button class="ob-next" type="button"><span class="ob-fill"></span><span class="ob-next-text"></span></button>
            </div>`;
        document.body.appendChild(el);
        el.querySelector('.ob-next').addEventListener('click', next);
        bindSwipe(el.querySelector('.ob-viewport'));
    }

    /** Вернуть ленту на текущую карточку, не трогая таймер чтения. */
    function snap() {
        if (el) el.querySelector('.ob-track').style.transform = `translate3d(${-index * 100}%,0,0)`;
    }

    function show(i) {
        const count = el.querySelectorAll('.ob-card').length;
        index = Math.max(0, Math.min(count - 1, i));
        el.querySelector('.ob-track').style.transform = `translate3d(${-index * 100}%,0,0)`;
        el.querySelectorAll('.ob-card').forEach((card, k) => {
            const on = k === index;
            card.setAttribute('aria-hidden', String(!on));
            if (on) { card.classList.remove('is-active'); void card.offsetWidth; card.classList.add('is-active'); }
        });
        el.querySelectorAll('.ob-dots i').forEach((dot, k) => dot.classList.toggle('on', k === index));
        el.setAttribute('aria-labelledby', `obTitle${index}`);
        const button = el.querySelector('.ob-next');
        button.querySelector('.ob-next-text').textContent = tr(index === count - 1 ? 'start' : 'next');
        // кнопка наполняется, пока читают карточку; уже прочитанные открываются сразу
        const seen = Number(el.dataset.seen || 0);
        clearTimeout(readyTimer);
        button.classList.remove('is-ready', 'is-filling');
        void button.offsetWidth;
        if (index < seen) button.classList.add('is-ready');
        else {
            button.classList.add('is-filling');
            readyTimer = setTimeout(() => {
                if (!el) return;
                button.classList.add('is-ready');
                el.dataset.seen = String(Math.max(seen, index + 1));
            }, READ_MS);
        }
        // таймер уже заведён: сбой анимаций не должен запереть человека на карточке
        try { syncLotties(); } catch (_) {}
    }

    function haptic(kind) {
        try {
            if (typeof vibrationEnabled !== 'undefined' && !vibrationEnabled) return;
            const h = root.Telegram?.WebApp?.HapticFeedback;
            if (kind === 'success') h?.notificationOccurred('success'); else h?.impactOccurred(kind || 'light');
        } catch (_) {}
    }

    function next() {
        if (!el) return;
        const button = el.querySelector('.ob-next');
        if (!button.classList.contains('is-ready')) {
            button.classList.remove('is-nudge'); void button.offsetWidth; button.classList.add('is-nudge');
            return;
        }
        const count = el.querySelectorAll('.ob-card').length;
        if (index >= count - 1) { finish(); return; }
        haptic('light');
        show(index + 1);
    }

    function finish() {
        haptic('success');
        try { localStorage.setItem(DONE_KEY, '1'); localStorage.removeItem('spark_intro_pending'); } catch (_) {}
        try { if (tg()?.CloudStorage && (!tg().isVersionAtLeast || tg().isVersionAtLeast('6.9'))) tg().CloudStorage.setItem(DONE_KEY, '1', () => {}); } catch (_) {}
        clearTimeout(readyTimer);
        const leaving = [...anims.values()];
        anims.clear();
        const node = el;
        el = null;
        node.style.pointerEvents = 'none';   // уходящая шторка не ловит нажатия
        node.classList.remove('show');
        restoreBackground();
        setTimeout(() => { leaving.forEach(anim => anim?.destroy()); node.remove(); }, 420);
        const done = onDone;
        onDone = null;
        if (done) done();
    }

    /** Листание пальцем: назад — всегда, вперёд — когда кнопка уже готова. */
    function bindSwipe(viewport) {
        let start = null;
        const track = () => el.querySelector('.ob-track');
        viewport.addEventListener('touchstart', e => {
            if (e.touches.length !== 1) return;
            start = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, active: false };
        }, { passive: true });
        viewport.addEventListener('touchmove', e => {
            if (!start || !el) return;
            const dx = e.touches[0].clientX - start.x, dy = e.touches[0].clientY - start.y;
            if (!start.active) {
                if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
                start.active = true;
                track().classList.add('is-dragging');
            }
            const ready = el.querySelector('.ob-next').classList.contains('is-ready');
            const last = index >= el.querySelectorAll('.ob-card').length - 1;
            let shift = dx;
            if ((dx < 0 && (!ready || last)) || (dx > 0 && index === 0)) shift = dx / 4;   // упор
            start.dx = shift;
            track().style.transform = `translate3d(calc(${-index * 100}% + ${shift}px),0,0)`;
        }, { passive: true });
        const end = () => {
            if (!start || !el) { start = null; return; }
            const { dx, active } = start;
            start = null;
            if (!active) return;
            track().classList.remove('is-dragging');
            const width = viewport.clientWidth || 1;
            const last = index >= el.querySelectorAll('.ob-card').length - 1;
            if (dx < -width * 0.2 && !last) { const before = index; next(); if (el && index === before) snap(); return; }
            if (dx > width * 0.2 && index > 0) { haptic('light'); show(index - 1); return; }
            snap();
        };
        viewport.addEventListener('touchend', end);
        viewport.addEventListener('touchcancel', () => {
            if (start?.active && el) el.querySelector('.ob-track').classList.remove('is-dragging');
            start = null;
            snap();
        });
    }

    /* Пока идёт знакомство, остальная страница неактивна (Tab, Enter, клики не уходят под шторку). */
    let background = [];
    let opener = null;
    function lockBackground() {
        background = [...document.body.children]
            .filter(node => node !== el && !/^(SCRIPT|STYLE|LINK)$/.test(node.tagName))
            .map(node => [node, node.inert]);
        background.forEach(([node]) => { node.inert = true; });
    }
    function restoreBackground() {
        background.forEach(([node, was]) => { node.inert = was; });
        background = [];
        if (opener?.isConnected) try { opener.focus({ preventScroll: true }); } catch (_) {}
        opener = null;
    }

    function open({ then } = {}) {
        if (el) return;
        onDone = then || null;
        opener = document.activeElement;
        render();
        lockBackground();
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (!el) return;
            el.classList.add('show');
            show(0);
            setTimeout(preloadLotties, 900);
            try { el.querySelector('.ob-next').focus({ preventScroll: true }); } catch (_) {}
        }));
    }

    root.SparkIntro = { open, DONE_KEY, isOpen: () => !!el };
})(window);
