/* Знакомство со Spark: несколько ярких карточек при первом запуске.
   Закрыть нельзя — только «Дальше»; кнопка наполняется, пока человек читает,
   и срабатывает, когда заполнится. Повтор — из настроек (SparkIntro.open). */
(function (root) {
    'use strict';
    if (root.SparkIntro) return;

    const BASE = new URL('..', document.currentScript?.src || location.href).href;   // …/assets/
    const DONE_KEY = 'spark_intro_done';
    const READ_MS = 1500;
    const LANGS = ['ru', 'en', 'zh', 'es', 'pt', 'id', 'fr', 'ja', 'de', 'ko', 'tr', 'vi'];

    const T = {
        next: ['Дальше', 'Next', '下一步', 'Siguiente', 'Próximo', 'Lanjut', 'Suivant', '次へ', 'Weiter', '다음', 'İleri', 'Tiếp'],
        start: ['Начать играть', 'Start playing', '开始游戏', 'Empezar a jugar', 'Começar a jogar', 'Mulai bermain', 'Commencer à jouer', 'プレイを始める', 'Los geht’s', '게임 시작', 'Oynamaya başla', 'Bắt đầu chơi'],
        gamesTitle: ['8 игр в одном приложении', '8 games in one app', '一个应用，8 款游戏', '8 juegos en una app', '8 jogos em um app', '8 game dalam satu aplikasi', '8 jeux dans une seule appli', '1つのアプリに8つのゲーム', '8 Spiele in einer App', '앱 하나에 게임 8개', 'Tek uygulamada 8 oyun', '8 trò chơi trong một ứng dụng'],
        gamesText: ['Шахматы, шашки, сапёр, судоку, блок бласт и другие — прямо в Telegram.', 'Chess, checkers, minesweeper, sudoku, Block Blast and more — right in Telegram.', '国际象棋、跳棋、扫雷、数独、Block Blast 等等——就在 Telegram 里。', 'Ajedrez, damas, buscaminas, sudoku, Block Blast y más, directamente en Telegram.', 'Xadrez, damas, campo minado, sudoku, Block Blast e mais — direto no Telegram.', 'Catur, dam, minesweeper, sudoku, Block Blast dan lainnya — langsung di Telegram.', 'Échecs, dames, démineur, sudoku, Block Blast et plus — directement dans Telegram.', 'チェス、チェッカー、マインスイーパー、数独、Block Blast など — Telegramでそのまま遊べます。', 'Schach, Dame, Minesweeper, Sudoku, Block Blast und mehr — direkt in Telegram.', '체스, 체커, 지뢰찾기, 스도쿠, 블록 블라스트 등 — 텔레그램에서 바로.', 'Satranç, dama, mayın tarlası, sudoku, Block Blast ve dahası — doğrudan Telegram’da.', 'Cờ vua, cờ đam, dò mìn, sudoku, Block Blast và hơn thế — ngay trong Telegram.'],
        onlineLabel: ['Онлайн', 'Online', '在线', 'Online', 'Online', 'Online', 'En ligne', 'オンライン', 'Online', '온라인', 'Çevrimiçi', 'Trực tuyến'],
        onlineTitle: ['Играй с друзьями', 'Play with friends', '和好友一起玩', 'Juega con amigos', 'Jogue com amigos', 'Main bersama teman', 'Joue avec tes amis', '友達と対戦', 'Spiel mit Freunden', '친구와 함께', 'Arkadaşlarınla oyna', 'Chơi cùng bạn bè'],
        onlineText: ['Зови друзей по ссылке и играйте онлайн в шахматы, шашки и монополию.', 'Invite friends with a link and play chess, checkers and Monopoly online.', '用链接邀请好友，一起在线下棋、跳棋和玩大富翁。', 'Invita a amigos con un enlace y jugad online al ajedrez, damas y Monopoly.', 'Convide amigos por link e joguem xadrez, damas e Monopoly online.', 'Ajak teman lewat tautan dan main catur, dam, dan Monopoli online.', 'Invite tes amis par lien et jouez en ligne aux échecs, dames et Monopoly.', 'リンクで友達を招待して、チェス・チェッカー・モノポリーをオンラインで。', 'Lade Freunde per Link ein und spielt online Schach, Dame und Monopoly.', '링크로 친구를 초대해 체스, 체커, 모노폴리를 온라인으로.', 'Arkadaşlarını bağlantıyla davet et; satranç, dama ve Monopoly oynayın.', 'Mời bạn bằng liên kết và chơi cờ vua, cờ đam, Cờ tỷ phú trực tuyến.'],
        topsLabel: ['Топ-1', 'Top 1', '第 1 名', 'Top 1', 'Top 1', 'Top 1', 'Top 1', 'トップ1', 'Top 1', '1위', 'Zirve', 'Top 1'],
        topsTitle: ['Поднимайся в топах', 'Climb the leaderboards', '冲上排行榜', 'Sube en las clasificaciones', 'Suba nos rankings', 'Naik di papan peringkat', 'Grimpe dans les classements', 'ランキングを駆け上がろう', 'Steig in den Bestenlisten auf', '랭킹을 올려라', 'Sıralamalarda yüksel', 'Leo bảng xếp hạng'],
        topsText: ['У каждой игры свой рейтинг. Побеждай и собирай титулы в профиле.', 'Every game has its own rating. Win and collect titles in your profile.', '每款游戏都有独立评分。赢下对局，在个人资料中收集称号。', 'Cada juego tiene su ranking. Gana y colecciona títulos en tu perfil.', 'Cada jogo tem seu ranking. Vença e colecione títulos no perfil.', 'Setiap game punya peringkat. Menang dan kumpulkan gelar di profil.', 'Chaque jeu a son classement. Gagne et collectionne des titres.', 'ゲームごとにランキング。勝ってプロフィールで称号を集めよう。', 'Jedes Spiel hat eine Wertung. Gewinne und sammle Titel im Profil.', '게임마다 랭킹이 있어요. 이기고 프로필에 칭호를 모으세요.', 'Her oyunun sıralaması var. Kazan ve profilinde unvan topla.', 'Mỗi trò có bảng xếp hạng riêng. Thắng và sưu tầm danh hiệu.'],
        prizeLabel: ['Турниры', 'Tournaments', '锦标赛', 'Torneos', 'Torneios', 'Turnamen', 'Tournois', 'トーナメント', 'Turniere', '토너먼트', 'Turnuvalar', 'Giải đấu'],
        prizeTitle: ['Денежные призы', 'Cash prizes', '现金奖励', 'Premios en dinero', 'Prêmios em dinheiro', 'Hadiah uang', 'Prix en argent', '賞金', 'Geldpreise', '상금', 'Para ödülleri', 'Thưởng tiền mặt'],
        prizeText: ['Займи первое место в турнире или в топе рефералов — получи деньги.', 'Take first place in a tournament or the referral top — and win money.', '在锦标赛或邀请排行榜中夺得第一，赢取现金。', 'Gana un torneo o el top de referidos y llévate dinero.', 'Fique em 1º num torneio ou no top de indicações e ganhe dinheiro.', 'Jadi juara turnamen atau top referal dan menangkan uang.', 'Termine premier d’un tournoi ou du top parrainage et gagne de l’argent.', 'トーナメントや招待ランキングで1位になって賞金をゲット。', 'Werde Erster im Turnier oder im Einladungs-Top und gewinne Geld.', '토너먼트나 초대 랭킹에서 1위를 하고 상금을 받으세요.', 'Turnuvada ya da davet sıralamasında birinci ol, para kazan.', 'Đứng đầu giải đấu hoặc bảng mời bạn và nhận tiền thưởng.'],
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
    const CROWN = '<svg viewBox="0 0 48 36" aria-hidden="true"><defs><linearGradient id="obGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c2"/><stop offset=".45" stop-color="#ffd23f"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs><path fill="url(#obGold)" d="M4 30 1.5 8.5 14 18 24 2l10 16 12.5-9.5L44 30z"/><rect x="4" y="30.5" width="40" height="5" rx="2.5" fill="url(#obGold)"/><circle cx="24" cy="2.6" r="2.6" fill="#fff6c2"/></svg>';
    /* Медаль «1» на ленте; цифра — фигура с центром ровно в центре медали (80, 118). */
    const MEDAL = `<svg class="ob-medal-big" viewBox="0 0 160 190" aria-hidden="true">
        <defs>
            <linearGradient id="obRibL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5c7c"/><stop offset="1" stop-color="#c8102e"/></linearGradient>
            <linearGradient id="obRibR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b8cff"/><stop offset="1" stop-color="#1e40af"/></linearGradient>
            <linearGradient id="obRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff4b8"/><stop offset=".4" stop-color="#ffcf33"/><stop offset=".75" stop-color="#f29a00"/><stop offset="1" stop-color="#b86a00"/></linearGradient>
            <linearGradient id="obFace" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff1a6"/><stop offset=".5" stop-color="#ffc928"/><stop offset="1" stop-color="#e88f00"/></linearGradient>
            <clipPath id="obMedalClip"><circle cx="80" cy="118" r="54"/></clipPath>
        </defs>
        <path d="M44 0h30l20 70H64z" fill="url(#obRibL)"/>
        <path d="M86 0h30L96 70H66z" fill="url(#obRibR)"/>
        <path d="M44 0h8l20 70h-8zM108 0h8L96 70h-8z" fill="#fff" opacity=".35"/>
        <circle cx="80" cy="118" r="56" fill="url(#obRing)"/>
        <circle cx="80" cy="118" r="43" fill="url(#obFace)" stroke="#b86a00" stroke-opacity=".35" stroke-width="2"/>
        <circle cx="80" cy="118" r="49" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.6" stroke-dasharray="2 4"/>
        <path d="M71 99 83 92h7v52H77v-37l-6 3z" fill="#fff" opacity=".95"/>
        <path d="M71 99 83 92h7v52H77v-37l-6 3z" fill="none" stroke="#c97a00" stroke-width="2" stroke-linejoin="round" opacity=".55"/>
        <g clip-path="url(#obMedalClip)"><path class="ob-shine" d="M6 50h16L-8 190h-16z" fill="#fff" opacity=".5"/></g>
    </svg>`;
    const BILL = '<svg viewBox="0 0 100 52" aria-hidden="true"><rect x="1" y="1" width="98" height="50" rx="7" fill="#2fbf71"/><rect x="5" y="5" width="90" height="42" rx="5" fill="none" stroke="#e9ffe9" stroke-opacity=".75" stroke-width="2"/><circle cx="50" cy="26" r="14" fill="#e9ffe9" opacity=".9"/><path d="M50 15v22M55 20.5c-1.2-1.8-3-2.6-5.2-2.6-3 0-5 1.5-5 3.7 0 5.3 10.6 2.6 10.6 8.3 0 2.3-2.3 3.9-5.4 3.9-2.4 0-4.4-1-5.6-2.9" fill="none" stroke="#1d8a4f" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="26" r="4" fill="#e9ffe9" opacity=".6"/><circle cx="84" cy="26" r="4" fill="#e9ffe9" opacity=".6"/></svg>';
    const COIN = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="#f2a400"/><circle cx="20" cy="20" r="15.5" fill="#ffd34d" stroke="#fff3b0" stroke-width="1.5"/><path d="M20 11.5v17M23.6 15.8c-.9-1.3-2.2-1.9-3.8-1.9-2.2 0-3.7 1.1-3.7 2.7 0 3.9 7.8 1.9 7.8 6.1 0 1.7-1.7 2.9-4 2.9-1.8 0-3.2-.7-4.1-2.1" fill="none" stroke="#b86a00" stroke-width="2.2" stroke-linecap="round"/></svg>';

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
                        <div class="ob-bar p2"><span class="ob-medal silver"></span><em>2</em></div>
                        <div class="ob-bar p1"><span class="ob-crown">${CROWN}</span><em>1</em></div>
                        <div class="ob-bar p3"><span class="ob-medal bronze"></span><em>3</em></div>
                    </div>` + sparkles([[10, 34, .8, .3], [90, 40, .7, 1], [16, 62, .5, 1.6], [84, 66, .6, .7]]),
            },
            {
                theme: 'prize', label: tr('prizeLabel'), title: tr('prizeTitle'), text: tr('prizeText'),
                art: `<span class="ob-rays"></span><div class="ob-cash"><i class="ob-bill b1">${BILL}</i><i class="ob-bill b2">${BILL}</i><i class="ob-bill b3">${BILL}</i>${MEDAL}</div>`
                    + [[12, 0], [28, 1.1], [72, .5], [88, 1.6], [50, 2.3]].map(([x, d]) => `<i class="ob-coin" style="left:${x}%;--d:${d}s">${COIN}</i>`).join('')
                    + sparkles([[12, 30, .8, .4], [88, 34, .7, 1.2], [20, 74, .5, .9], [80, 72, .6, 0]]),
            },
        ];
    }

    let el = null;
    let index = 0;
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
                        <h2 class="ob-title">${esc(c.title)}</h2>
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
        const button = el.querySelector('.ob-next');
        button.querySelector('.ob-next-text').textContent = tr(index === count - 1 ? 'start' : 'next');
        // кнопка наполняется, пока читают карточку; уже прочитанные открываются сразу
        const seen = Number(el.dataset.seen || 0);
        clearTimeout(readyTimer);
        button.classList.remove('is-ready', 'is-filling');
        void button.offsetWidth;
        if (index < seen) { button.classList.add('is-ready'); return; }
        button.classList.add('is-filling');
        readyTimer = setTimeout(() => {
            button.classList.add('is-ready');
            el.dataset.seen = String(Math.max(seen, index + 1));
        }, READ_MS);
    }

    function haptic(kind) {
        try {
            if (typeof vibrationEnabled !== 'undefined' && !vibrationEnabled) return;
            const h = root.Telegram?.WebApp?.HapticFeedback;
            if (kind === 'success') h?.notificationOccurred('success'); else h?.impactOccurred(kind || 'light');
        } catch (_) {}
    }

    function next() {
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
        try { localStorage.setItem(DONE_KEY, '1'); } catch (_) {}
        try { root.Telegram?.WebApp?.CloudStorage?.setItem(DONE_KEY, '1', () => {}); } catch (_) {}
        clearTimeout(readyTimer);
        const node = el;
        el = null;
        node.classList.remove('show');
        setTimeout(() => node.remove(), 420);
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
            if (dx < -width * 0.2) { const before = index; next(); if (el && index === before) snap(); return; }
            if (dx > width * 0.2 && index > 0) { haptic('light'); show(index - 1); return; }
            snap();
        };
        viewport.addEventListener('touchend', end);
        viewport.addEventListener('touchcancel', end);
    }

    function open({ then } = {}) {
        if (el) return;
        onDone = then || null;
        render();
        requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('show'); show(0); }));
    }

    root.SparkIntro = { open, DONE_KEY };
})(window);
