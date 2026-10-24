/* Экран обязательной подписки на каналы Spark (со второго запуска).
   Каждый канал — строка с аватаркой и кнопкой «Подписаться». Вернулся из
   канала — проверяем сами, строка становится «Готово»; когда подписан на всё,
   экран закрывается. Закрыть без подписки нельзя. */
(function (root) {
    'use strict';
    if (root.SparkGate) return;

    const SRC = new URL(document.currentScript?.src || location.href);
    const BASE = new URL('..', SRC).href;   // …/assets/
    const VERSION = SRC.searchParams.get('v') || '';
    const LANGS = ['ru', 'en', 'zh', 'es', 'pt', 'id', 'fr', 'ja', 'de', 'ko', 'tr', 'vi'];
    const T = {
        title: ['Последний шаг', 'One last step', '最后一步', 'Un último paso', 'Último passo', 'Satu langkah lagi', 'Dernière étape', 'あと一歩', 'Noch ein Schritt', '마지막 단계', 'Son bir adım', 'Bước cuối cùng'],
        textMany: ['Подпишитесь на каналы Spark: там турниры с денежными призами, новые игры и бонусы.', 'Subscribe to the Spark channels: tournaments with cash prizes, new games and bonuses.', '订阅 Spark 频道：现金奖励锦标赛、新游戏和福利。', 'Suscríbete a los canales de Spark: torneos con premios en efectivo, juegos nuevos y bonos.', 'Inscreva-se nos canais do Spark: torneios com prêmios em dinheiro, jogos novos e bônus.', 'Ikuti kanal Spark: turnamen berhadiah uang, game baru, dan bonus.', 'Abonnez-vous aux chaînes Spark : tournois avec prix en argent, nouveaux jeux et bonus.', 'Sparkのチャンネルを登録しよう：賞金付きトーナメント、新しいゲーム、ボーナス。', 'Abonniere die Spark-Kanäle: Turniere mit Geldpreisen, neue Spiele und Boni.', 'Spark 채널을 구독하세요: 상금 토너먼트, 새 게임, 보너스.', 'Spark kanallarına abone olun: para ödüllü turnuvalar, yeni oyunlar ve bonuslar.', 'Theo dõi các kênh Spark: giải đấu có thưởng tiền mặt, game mới và phần thưởng.'],
        textOne: ['Подпишитесь на канал Spark: там турниры с денежными призами, новые игры и бонусы.', 'Subscribe to the Spark channel: tournaments with cash prizes, new games and bonuses.', '订阅 Spark 频道：现金奖励锦标赛、新游戏和福利。', 'Suscríbete al canal de Spark: torneos con premios en efectivo, juegos nuevos y bonos.', 'Inscreva-se no canal do Spark: torneios com prêmios em dinheiro, jogos novos e bônus.', 'Ikuti kanal Spark: turnamen berhadiah uang, game baru, dan bonus.', 'Abonnez-vous à la chaîne Spark : tournois avec prix en argent, nouveaux jeux et bonus.', 'Sparkのチャンネルを登録しよう：賞金付きトーナメント、新しいゲーム、ボーナス。', 'Abonniere den Spark-Kanal: Turniere mit Geldpreisen, neue Spiele und Boni.', 'Spark 채널을 구독하세요: 상금 토너먼트, 새 게임, 보너스.', 'Spark kanalına abone olun: para ödüllü turnuvalar, yeni oyunlar ve bonuslar.', 'Theo dõi kênh Spark: giải đấu có thưởng tiền mặt, game mới và phần thưởng.'],
        subscribe: ['Подписаться', 'Subscribe', '订阅', 'Suscribirse', 'Inscrever-se', 'Ikuti', 'S’abonner', '登録する', 'Abonnieren', '구독', 'Abone ol', 'Theo dõi'],
        done: ['Готово', 'Done', '已完成', 'Listo', 'Pronto', 'Selesai', 'C’est fait', '完了', 'Erledigt', '완료', 'Tamam', 'Xong'],
        progress: ['Подписка {n} из {total}', '{n} of {total} subscribed', '已订阅 {n}/{total}', '{n} de {total} suscritos', '{n} de {total} inscritos', '{n} dari {total} diikuti', '{n} sur {total} abonnements', '{n}/{total} 登録済み', '{n} von {total} abonniert', '{total}개 중 {n}개 구독', '{total} kanaldan {n} abone', 'Đã theo dõi {n}/{total}'],
        go: ['Продолжить', 'Continue', '继续', 'Continuar', 'Continuar', 'Lanjut', 'Continuer', '続ける', 'Weiter', '계속', 'Devam', 'Tiếp tục'],
        play: ['Играть', 'Play', '开始游戏', 'Jugar', 'Jogar', 'Main', 'Jouer', 'プレイ', 'Spielen', '플레이', 'Oyna', 'Chơi'],
        notYet: ['Подпишитесь на «{name}» и вернитесь сюда', 'Subscribe to “{name}” and come back here', '订阅“{name}”后回到这里', 'Suscríbete a «{name}» y vuelve aquí', 'Inscreva-se em “{name}” e volte aqui', 'Ikuti “{name}” lalu kembali ke sini', 'Abonnez-vous à « {name} » puis revenez ici', '「{name}」を登録してここに戻ってください', 'Abonniere „{name}“ und komm zurück', '“{name}” 구독 후 여기로 돌아오세요', '“{name}” kanalına abone olup buraya dönün', 'Theo dõi “{name}” rồi quay lại đây'],
        channel: ['Канал', 'Channel', '频道', 'Canal', 'Canal', 'Kanal', 'Chaîne', 'チャンネル', 'Kanal', '채널', 'Kanal', 'Kênh'],
    };
    const lang = () => Math.max(0, LANGS.indexOf(typeof currentLang === 'string' ? currentLang : 'ru'));
    const tr = (key, vars) => {
        let text = T[key][lang()] || T[key][1];
        for (const [k, v] of Object.entries(vars || {})) text = text.split(`{${k}}`).join(String(v));
        return text;
    };
    const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const tg = () => root.Telegram?.WebApp;
    const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.6 4.6L19.4 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    let el = null;
    let state = null;   // { channels, check, onDone, timer, busy, finished }
    let anim = null;
    let background = [];

    function haptic(kind) {
        try {
            if (typeof vibrationEnabled !== 'undefined' && !vibrationEnabled) return;
            const h = tg()?.HapticFeedback;
            if (kind === 'success' || kind === 'error' || kind === 'warning') h?.notificationOccurred(kind); else h?.impactOccurred(kind || 'light');
        } catch (_) {}
    }

    function avatar(channel) {
        const letter = esc((channel.title || '?').trim().charAt(0).toUpperCase() || 'S');
        return channel.photo
            ? `<span class="sg-ava"><img src="${esc(channel.photo)}" alt="" onerror="this.parentNode.classList.add('is-letter');this.remove()"><b>${letter}</b></span>`
            : `<span class="sg-ava is-letter"><b>${letter}</b></span>`;
    }

    function render() {
        const list = state.channels;
        el = document.createElement('div');
        el.className = 'sg-overlay';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-labelledby', 'sgTitle');
        el.innerHTML = `
            <div class="sg-sheet">
                <div class="sg-hero"><span class="sg-hero-ring"></span><span class="sg-lottie"></span></div>
                <h2 class="sg-title" id="sgTitle">${esc(tr('title'))}</h2>
                <p class="sg-text">${esc(tr(list.length > 1 ? 'textMany' : 'textOne'))}</p>
                <div class="sg-list">${list.map((c, i) => `
                    <div class="sg-row" data-i="${i}">
                        ${avatar(c)}
                        <span class="sg-name"><b>${esc(c.title)}</b><small>${esc(c.username ? `@${c.username}` : tr('channel'))}</small></span>
                        <button type="button" class="sg-sub" data-i="${i}"></button>
                    </div>`).join('')}
                </div>
                <div class="sg-meter"><div class="sg-progress" aria-hidden="true"><i></i></div><span class="sg-count"></span></div>
                <p class="sg-hint" aria-live="polite"></p>
                <button type="button" class="sg-go"></button>
            </div>`;
        document.body.appendChild(el);
        el.addEventListener('click', onClick);
        const box = el.querySelector('.sg-lottie');
        if (root.lottie?.loadAnimation) {
            try {
                anim = root.lottie.loadAnimation({ container: box, renderer: 'svg', loop: true, autoplay: true, path: `${BASE}ui/gate/megaphone.json${VERSION ? `?v=${VERSION}` : ''}` });
                anim.addEventListener('data_failed', () => { box.textContent = '📢'; box.classList.add('is-fallback'); });
            } catch (_) { box.textContent = '📢'; box.classList.add('is-fallback'); }
        } else { box.textContent = '📢'; box.classList.add('is-fallback'); }
        update();
    }

    function update() {
        if (!el) return;
        const list = state.channels;
        const done = list.filter(c => c.subscribed).length;
        el.querySelectorAll('.sg-row').forEach((row, i) => {
            const channel = list[i];
            const button = row.querySelector('.sg-sub');
            const was = row.classList.contains('is-done');
            row.classList.toggle('is-done', !!channel.subscribed);
            button.disabled = !!channel.subscribed;
            button.innerHTML = channel.subscribed ? `${CHECK}<span>${esc(tr('done'))}</span>` : `<span>${esc(tr('subscribe'))}</span>`;
            if (channel.subscribed && !was && state.shown) { row.classList.remove('is-pop'); void row.offsetWidth; row.classList.add('is-pop'); }
        });
        el.querySelector('.sg-progress i').style.width = `${list.length ? (done / list.length) * 100 : 100}%`;
        const all = done === list.length;
        el.classList.toggle('is-complete', all);
        const go = el.querySelector('.sg-go');
        go.textContent = all ? tr('play') : tr('go');
        el.querySelector('.sg-count').textContent = tr('progress', { n: done, total: list.length });
        el.querySelector('.sg-meter').hidden = list.length < 2;
        if (all) el.querySelector('.sg-hint').textContent = '';
        state.shown = true;
    }

    function openLink(channel) {
        if (!channel?.link) return;
        haptic('light');
        state.waiting = true;
        try {
            if (/^https:\/\/t\.me\//.test(channel.link) && tg()?.openTelegramLink) tg().openTelegramLink(channel.link);
            else root.open(channel.link, '_blank');
        } catch (_) { root.open(channel.link, '_blank'); }
    }

    async function recheck({ explicit = false } = {}) {
        if (!state || state.busy || state.finished) return;
        state.busy = true;
        el?.classList.add('is-checking');
        try {
            const fresh = await state.check();
            if (!state || !Array.isArray(fresh)) return;
            const before = state.channels.filter(c => c.subscribed).length;
            // порядок и вид строк сохраняем; статус — из свежего ответа
            state.channels = state.channels.map(c => ({ ...c, subscribed: !!fresh.find(f => f.id === c.id)?.subscribed || (!fresh.find(f => f.id === c.id)) }));
            const after = state.channels.filter(c => c.subscribed).length;
            update();
            if (after > before) haptic('success');
            if (after === state.channels.length) { finish(); return; }
            if (explicit) {
                const missing = state.channels.find(c => !c.subscribed);
                el.querySelector('.sg-hint').textContent = tr('notYet', { name: missing.title });
                const row = el.querySelector(`.sg-row[data-i="${state.channels.indexOf(missing)}"]`);
                row?.classList.remove('is-nudge'); void row?.offsetWidth; row?.classList.add('is-nudge');
                haptic('warning');
            }
        } catch (_) {
            // сеть подвела — попробуем ещё раз при следующем возвращении
        } finally {
            if (state) state.busy = false;
            el?.classList.remove('is-checking');
        }
    }

    function onClick(event) {
        const sub = event.target.closest('.sg-sub');
        if (sub && !sub.disabled) { openLink(state.channels[Number(sub.dataset.i)]); return; }
        if (event.target.closest('.sg-go')) {
            if (el.classList.contains('is-complete')) finish();
            else recheck({ explicit: true });
        }
    }

    // вернулся из канала — проверяем сразу; плюс редкий запасной опрос
    function onVisible() { if (!document.hidden && state?.waiting) setTimeout(() => recheck(), 350); }
    function onFocus() { if (state?.waiting) setTimeout(() => recheck(), 350); }

    function finish() {
        if (!state || state.finished) return;
        state.finished = true;
        clearInterval(state.timer);
        document.removeEventListener('visibilitychange', onVisible);
        root.removeEventListener('focus', onFocus);
        update();
        haptic('success');
        const node = el, done = state.onDone, leaving = anim;
        setTimeout(() => {
            node.style.pointerEvents = 'none';
            node.classList.remove('show');
            background.forEach(([n, was]) => { n.inert = was; });
            background = [];
            setTimeout(() => { leaving?.destroy?.(); node.remove(); }, 420);
            el = null;
            state = null;
            anim = null;
            if (done) done();
        }, 650);
    }

    /** channels: [{ id, title, username, link, photo, subscribed }]; check(): свежий список. */
    function open({ channels, check, onDone } = {}) {
        if (el || !Array.isArray(channels) || !channels.length) return;
        state = { channels: channels.map(c => ({ ...c })), check, onDone, busy: false, finished: false, waiting: false, shown: false, timer: null };
        render();
        background = [...document.body.children].filter(n => n !== el && !/^(SCRIPT|STYLE|LINK)$/.test(n.tagName)).map(n => [n, n.inert]);
        background.forEach(([n]) => { n.inert = true; });
        document.addEventListener('visibilitychange', onVisible);
        root.addEventListener('focus', onFocus);
        state.timer = setInterval(() => { if (!document.hidden && state?.waiting) recheck(); }, 5000);
        requestAnimationFrame(() => requestAnimationFrame(() => {
            el?.classList.add('show');
            try { el?.querySelector('.sg-sub:not([disabled]), .sg-go')?.focus({ preventScroll: true }); } catch (_) {}
        }));
    }

    root.SparkGate = { open, isOpen: () => !!el };
})(window);
