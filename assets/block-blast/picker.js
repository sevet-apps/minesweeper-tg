/* A bottom-anchored material sheet. It never relies on native dialog positioning. */
(function (root) {
    'use strict';
    const cross = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m7 7 10 10M17 7 7 17"/></svg>';
    const check = '<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 10 3 3 7-7"/></svg>';
    let nextId = 0;

    function create(options) {
        const doc = root.document;
        let overlay, panel, backdrop, header, choices, calmInput, shakeInput, volumeInput, closeButton;
        let activeTab = 'settings';
        let state = 'closed', restoreFocus, drag, panelAnimation, backdropAnimation;
        let inertSiblings = [];
        const titleId = 'bbPickerTitle' + (++nextId);
        const copy = (ru, en, zh) => {
            const lang = options.lang?.() || 'ru';
            return ({ ru, en, zh })[lang] || root.SparkLocalePacks?.[lang]?.extras?.[ru] || ru;
        };
        const themeId = () => { const theme = options.getTheme(); return typeof theme === 'string' ? theme : theme.id; };
        const reduced = () => !!options.reduced?.();
        const stopAnimations = () => {
            panelAnimation?.cancel(); backdropAnimation?.cancel();
            panelAnimation = backdropAnimation = null;
        };
        const focus = element => { if (element?.isConnected) element.focus({ preventScroll: true }); };
        const focusable = () => Array.from(panel.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')).filter(el => el.getClientRects().length && el.tabIndex !== -1);

        function setBackgroundInert() {
            inertSiblings = Array.from(doc.body.children).filter(el => el !== overlay && !/^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(el.tagName)).map(el => ({ el, inert: el.inert, hidden: el.getAttribute('aria-hidden') }));
            for (const { el } of inertSiblings) { el.inert = true; el.setAttribute('aria-hidden', 'true'); }
        }
        function restoreBackground() {
            for (const { el, inert, hidden } of inertSiblings) {
                el.inert = inert;
                if (hidden === null) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', hidden);
            }
            inertSiblings = [];
        }
        function keydown(event) {
            if (state === 'closed') return;
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
            if (event.key !== 'Tab') return;
            const items = focusable();
            const first = items[0] || panel, last = items[items.length - 1] || panel;
            if (event.shiftKey && (doc.activeElement === first || !panel.contains(doc.activeElement))) { event.preventDefault(); focus(last); }
            else if (!event.shiftKey && (doc.activeElement === last || !panel.contains(doc.activeElement))) { event.preventDefault(); focus(first); }
        }
        function containFocus(event) {
            if (state !== 'closed' && !panel.contains(event.target)) focus(closeButton);
        }
        function updateSelection() {
            const selected = themeId();
            choices.querySelectorAll('[data-material-choice]').forEach(button => {
                button.setAttribute('aria-pressed', String(button.dataset.materialChoice === selected));
            });
            calmInput.checked = !!options.isCalm();
            shakeInput.checked = options.isShake?.() !== false;
            shakeInput.disabled = reduced();
            shakeInput.closest('label').classList.toggle('is-disabled', reduced());
            volumeInput.value = String(options.getVolume?.() ?? 100);
            volumeInput.style.setProperty('--bb-volume-fill', volumeInput.value + '%');
            panel.querySelector('.bb-picker-volume-value').textContent = volumeInput.value + '%';
        }
        // ---- Progress tab: the line value and four bonuses. The server computes everything. ----
        const make = (tag, className, content) => {
            const node = doc.createElement(tag);
            if (className) node.className = className;
            if (content !== undefined) node.textContent = content;
            return node;
        };
        const number = value => { try { return new Intl.NumberFormat(options.lang?.() || 'ru').format(value); } catch (_) { return String(value); } };
        function challengeText(stat) {
            switch (stat) {
                case 'best_combo': return copy('Серия ×{n} в одной игре', 'Combo ×{n} in one game', '单局连击 ×{n}');
                case 'lines': return copy('Закройте {n} линий за день', 'Clear {n} lines today', '今日消除 {n} 行');
                case 'best_game_lines': return copy('{n} линий в одной игре', '{n} lines in one game', '单局消除 {n} 行');
                case 'pieces': return copy('Поставьте {n} фигур за день', 'Place {n} pieces today', '今日放置 {n} 个方块');
                case 'best_score': return copy('{n} очков в одной игре', '{n} points in one game', '单局得分 {n}');
                case 'points': return copy('{n} очков за день', '{n} points today', '今日累计 {n} 分');
                case 'doubles': return copy('2 линии одним ходом {n} раза', 'Clear 2 lines in one move {n} times', '一步消除两行 {n} 次');
                case 'games': return copy('Сыграйте {n} игры', 'Play {n} games', '完成 {n} 局游戏');
                default: return '';
            }
        }
        function bonusRow(bonus, source) {
            const row = make('div', 'bb-bonus' + (bonus.active ? ' is-active' : ''));
            row.dataset.bonus = bonus.id;
            const icon = make('span', 'bb-bonus-icon');
            icon.setAttribute('aria-hidden', 'true');
            const emoji = { friends: '👥', streak: '🔥', daily: '🎯', channel: '📢' }[bonus.id] || '★';
            const photo = bonus.id === 'channel' && bonus.channel?.photo ? source?.photo?.(bonus.channel.photo) : null;
            if (photo) {
                const img = make('img');
                img.alt = '';
                img.decoding = 'async';
                img.onerror = () => { img.remove(); icon.textContent = emoji; };
                img.src = photo;
                icon.appendChild(img);
            } else icon.textContent = emoji;
            const body = make('div', 'bb-bonus-body');
            const names = {
                friends: copy('Друзья', 'Friends', '好友'),
                streak: copy('Серия дней', 'Daily streak', '连续天数'),
                daily: copy('Задание дня', 'Daily challenge', '每日挑战'),
                channel: bonus.channel?.title || copy('Канал', 'Channel', '频道'),
            };
            const conditions = {
                friends: copy('3 друга по вашей ссылке играют 2 дня', 'Invite 3 friends who play on 2 days', '邀请 3 位好友各玩 2 天'),
                streak: copy('Играйте 7 дней без пропусков', 'Play 7 days without a break', '连续 7 天不间断'),
                daily: challengeText(bonus.stat).replace('{n}', number(bonus.target)),
                channel: bonus.active ? copy('Вы подписаны', 'Subscribed', '已订阅') : copy('Подпишитесь на канал', 'Subscribe to the channel', '订阅频道'),
            };
            const done = bonus.active && (bonus.id === 'daily' || bonus.id === 'channel');
            const count = bonus.id === 'channel' ? (bonus.active ? '✓' : '') : done ? '✓' : `${number(bonus.progress)}/${number(bonus.target)}`;
            const top = make('div', 'bb-bonus-top');
            top.append(make('span', 'bb-bonus-name', names[bonus.id] || bonus.id), make('span', 'bb-bonus-count', count));
            body.append(top, make('small', 'bb-bonus-detail', conditions[bonus.id] || ''));
            if (bonus.id === 'daily') body.appendChild(make('small', 'bb-bonus-detail bb-bonus-note', copy('Награда со следующей игры до полуночи', 'Reward from your next game until midnight', '奖励自下一局起生效至午夜')));
            if (bonus.id !== 'channel') {
                const bar = make('div', 'bb-bonus-bar');
                const fill = make('i');
                fill.style.transform = `scaleX(${Math.max(0, Math.min(1, bonus.progress / Math.max(1, bonus.target)))})`;
                bar.appendChild(fill);
                body.appendChild(bar);
            }
            const action = !bonus.active && (bonus.id === 'friends' ? copy('Позвать друзей', 'Invite friends', '邀请好友') : bonus.id === 'channel' && bonus.channel?.link ? copy('Подписаться', 'Subscribe', '订阅') : '');
            if (action) {
                const button = make('button', 'bb-bonus-action', action);
                button.type = 'button';
                button.addEventListener('click', () => {
                    if (bonus.id === 'friends') source?.invite?.();
                    else { source?.openChannel?.(bonus.channel.link); }
                });
                body.appendChild(button);
            }
            row.append(icon, body, make('span', 'bb-bonus-chip', '+' + bonus.points));
            return row;
        }
        let renderedProgress = '';
        function renderProgress(force = false) {
            const page = panel?.querySelector('.bb-progress');
            if (!page) return;
            const data = progressData;
            // A background refresh with the same numbers leaves the rows (and their fill animation) alone.
            const key = (options.lang?.() || 'ru') + progressState + JSON.stringify(data);
            if (!force && key === renderedProgress) return;
            renderedProgress = key;
            page.textContent = '';
            if (!data) {
                page.appendChild(make('p', 'bb-progress-empty', progressState === 'failed'
                    ? copy('Не удалось загрузить бонусы. Попробуйте позже.', 'Could not load bonuses. Try again later.', '无法加载奖励，请稍后再试。')
                    : copy('Загружаем бонусы…', 'Loading bonuses…', '正在加载奖励…')));
                return;
            }
            const head = make('div', 'bb-progress-head');
            const value = make('strong', 'bb-progress-value');
            const [before, after = ''] = copy('Линия: {n} очков', 'Line: {n} points', '每行 {n} 分').split('{n}');
            value.append(before, make('b', '', number(data.line_points)), after);
            head.append(value, make('small', 'bb-progress-caption', copy('Столько очков даёт каждая закрытая линия', 'Points for every line you clear', '每消除一行获得的分数')));
            const steps = Math.max(1, Math.round((data.max - data.base) / 5));
            const lit = Math.round((data.line_points - data.base) / 5);
            const scale = make('div', 'bb-progress-scale');
            scale.setAttribute('role', 'img');
            scale.setAttribute('aria-label', `${data.line_points} / ${data.max}`);
            for (let i = 0; i < steps; i++) scale.appendChild(make('i', i < lit ? 'is-on' : ''));
            const ticks = make('div', 'bb-progress-ticks');
            ticks.append(make('span', '', number(data.base)), make('span', '', number(data.max)));
            const list = make('div', 'bb-progress-list');
            const source = options.progress?.();
            for (const bonus of data.bonuses || []) list.appendChild(bonusRow(bonus, source));
            page.append(head, scale, ticks, list);
        }
        let progressData = null, progressState = 'idle', progressRequest = 0;
        function loadProgress(fresh = false) {
            const source = options.progress?.();
            if (!source?.load) { progressState = 'failed'; renderProgress(); return; }
            const request = ++progressRequest;
            if (!progressData) { progressState = 'loading'; renderProgress(); }
            Promise.resolve(source.load({ fresh })).catch(() => null).then(data => {
                if (request !== progressRequest) return;
                if (data) progressData = data;
                progressState = data || progressData ? 'ready' : 'failed';
                renderProgress();
            });
        }
        // Back from the channel or the share sheet: re-check right away.
        function visible() {
            if (state === 'open' && activeTab === 'progress' && !doc.hidden) loadProgress(true);
        }
        function setTab(next, animate = true) {
            activeTab = next;
            if (next === 'progress' && state === 'open') loadProgress();
            const tabs = ['settings', 'skins', 'progress'];
            panel.querySelector('.bb-picker-tabs').style.setProperty('--bb-tab-index', String(tabs.indexOf(next)));
            for (const tab of tabs) {
                const button = panel.querySelector(`[data-bb-tab="${tab}"]`);
                button.setAttribute('aria-selected', String(tab === next));
                button.tabIndex = tab === next ? 0 : -1;
                const page = panel.querySelector(`[data-bb-page="${tab}"]`);
                page.hidden = tab !== next;
                page.classList.remove('is-entering');
                if (tab === next && animate && !reduced()) {
                    // A small entrance, with no layout-sized horizontal slide.
                    void page.offsetWidth;
                    page.classList.add('is-entering');
                }
            }
            panel.querySelector('.bb-picker-content').scrollTop = 0;
        }
        function refresh() {
            if (!overlay) return;
            panel.querySelector('.bb-picker-title').textContent = copy('Блок Бласт', 'Block Blast', '方块消除');
            closeButton.setAttribute('aria-label', copy('Закрыть', 'Close', '关闭'));
            panel.querySelector('[data-bb-tab="settings"]').textContent = copy('Настройки', 'Settings', '设置');
            panel.querySelector('[data-bb-tab="skins"]').textContent = copy('Скины', 'Skins', '皮肤');
            panel.querySelector('[data-bb-tab="progress"]').textContent = copy('Прогресс', 'Progress', '进度');
            choices.setAttribute('aria-label', copy('Материал блоков', 'Block material', '方块材质'));
            panel.querySelector('.bb-picker-motion-title').textContent = copy('Спокойные эффекты', 'Gentle effects', '轻柔效果');
            panel.querySelector('.bb-picker-motion-detail').textContent = copy('Меньше движения и частиц', 'Less motion and fewer particles', '减少动画和粒子');
            panel.querySelector('.bb-picker-shake-title').textContent = copy('Встряска поля', 'Board shake', '棋盘震动');
            panel.querySelector('.bb-picker-shake-detail').textContent = reduced() ? copy('Отключена в спокойном режиме', 'Off with gentle effects', '轻柔模式下关闭') : copy('Ощутимый толчок при закрытии линии', 'A satisfying kick when a line clears', '消除整行时有明显震动');
            panel.querySelector('.bb-picker-volume-title').textContent = copy('Громкость звуков', 'Sound volume', '音效音量');
            volumeInput.setAttribute('aria-label', copy('Громкость звуков', 'Sound volume', '音效音量'));
            panel.querySelector('.bb-picker-volume-detail').textContent = copy('Звуки фигур и закрытия линий', 'Pieces and line clears', '方块与消除音效');
            renderProgress();
            choices.querySelectorAll('[data-material-choice]').forEach(button => {
                const item = options.catalog.find(item => item.id === button.dataset.materialChoice);
                const lang = options.lang?.() || 'ru';
                button.querySelector('.bb-picker-name').textContent = item.name[lang] || root.SparkLocalePacks?.[lang]?.extras?.[item.name.ru] || item.name.ru;
            });
            updateSelection();
        }
        function settle() {
            const from = panel.style.transform || 'translate3d(0,0,0)';
            const dim = Number(backdrop.style.opacity || 1);
            stopAnimations();
            panel.style.transform = 'translate3d(0,0,0)';
            backdrop.style.opacity = '1';
            if (!reduced()) {
                panelAnimation = panel.animate([{ transform: from }, { transform: 'translate3d(0,0,0)' }], { duration: 330, easing: 'cubic-bezier(.2,.8,.2,1)' });
                backdropAnimation = backdrop.animate([{ opacity: dim }, { opacity: 1 }], { duration: 240 });
            }
        }
        function bindSwipe() {
            header.addEventListener('pointerdown', event => {
                if (state !== 'open' || drag || event.isPrimary === false || event.button !== 0 || event.target.closest('button')) return;
                const transform = root.getComputedStyle(panel).transform;
                const dim = root.getComputedStyle(backdrop).opacity;
                stopAnimations();
                const currentY = transform === 'none' ? 0 : Number(transform.replace(/^matrix(3d)?\(|\)$/g, '').split(',')[transform.startsWith('matrix3d') ? 13 : 5]) || 0;
                panel.style.transform = `translate3d(0,${Math.max(0, currentY)}px,0)`;
                backdrop.style.opacity = dim;
                drag = { id: event.pointerId, y: event.clientY, offset: Math.max(0, currentY), start: event.timeStamp, distance: 0, height: panel.getBoundingClientRect().height };
                header.setPointerCapture(event.pointerId);
                header.classList.add('is-dragging');
            });
            header.addEventListener('pointermove', event => {
                if (drag?.id !== event.pointerId) return;
                drag.distance = Math.max(0, drag.offset + event.clientY - drag.y);
                panel.style.transform = `translate3d(0,${drag.distance}px,0)`;
                backdrop.style.opacity = String(Math.max(.15, 1 - drag.distance / drag.height));
            });
            const finish = (event, cancelled) => {
                if (drag?.id !== event.pointerId) return;
                const current = drag;
                drag = null;
                header.classList.remove('is-dragging');
                if (header.hasPointerCapture(event.pointerId)) header.releasePointerCapture(event.pointerId);
                if (!cancelled) current.distance = Math.max(0, current.offset + event.clientY - current.y);
                const velocity = Math.max(0, event.clientY - current.y) / Math.max(1, event.timeStamp - current.start);
                if (!cancelled && (current.distance > Math.min(110, current.height * .2) || (current.distance > 30 && velocity > .55))) close();
                else settle();
            };
            header.addEventListener('pointerup', event => finish(event, false));
            header.addEventListener('pointercancel', event => finish(event, true));
            header.addEventListener('lostpointercapture', event => finish(event, true));
        }
        function build() {
            overlay = doc.createElement('div');
            overlay.className = 'bb-picker-overlay';
            overlay.hidden = true;
            overlay.innerHTML = `<div class="bb-picker-backdrop" aria-hidden="true"></div><section class="bb-picker-panel" role="dialog" aria-modal="true" aria-labelledby="${titleId}" tabindex="-1"><header class="bb-picker-header"><div class="bb-picker-grab" aria-hidden="true"><span></span></div><div class="bb-picker-heading"><h2 class="bb-picker-title" id="${titleId}"></h2><button type="button" class="bb-picker-close">${cross}</button></div></header><div class="bb-picker-tabs" role="tablist" aria-label="Block Blast"><span class="bb-picker-tab-indicator" aria-hidden="true"></span><button type="button" role="tab" data-bb-tab="settings"></button><button type="button" role="tab" data-bb-tab="skins"></button><button type="button" role="tab" data-bb-tab="progress"></button></div><div class="bb-picker-content"><div class="bb-picker-page" data-bb-page="settings" role="tabpanel"><label class="bb-picker-motion"><span><span class="bb-picker-motion-title"></span><small class="bb-picker-motion-detail"></small></span><input class="bb-calm-input" type="checkbox" role="switch"><i aria-hidden="true"></i></label><label class="bb-picker-motion bb-picker-shake"><span><span class="bb-picker-motion-title bb-picker-shake-title"></span><small class="bb-picker-motion-detail bb-picker-shake-detail"></small></span><input class="bb-shake-input" type="checkbox" role="switch"><i aria-hidden="true"></i></label><div class="bb-picker-volume"><div class="bb-picker-volume-heading"><span><span class="bb-picker-volume-title"></span><small class="bb-picker-volume-detail"></small></span><strong class="bb-picker-volume-value"></strong></div><input class="bb-volume-input" type="range" min="0" max="100" step="1" value="100" aria-label="Sound volume"></div></div><div class="bb-picker-page" data-bb-page="skins" role="tabpanel" hidden><div class="bb-picker-choices" role="group"></div></div><div class="bb-picker-page" data-bb-page="progress" role="tabpanel" hidden><div class="bb-progress"></div></div></div></section>`;
            doc.body.appendChild(overlay);
            panel = overlay.querySelector('.bb-picker-panel');
            backdrop = overlay.querySelector('.bb-picker-backdrop');
            header = overlay.querySelector('.bb-picker-header');
            choices = overlay.querySelector('.bb-picker-choices');
            calmInput = overlay.querySelector('.bb-calm-input');
            shakeInput = overlay.querySelector('.bb-shake-input');
            volumeInput = overlay.querySelector('.bb-volume-input');
            closeButton = overlay.querySelector('.bb-picker-close');
            for (const item of options.catalog) {
                const button = doc.createElement('button');
                button.type = 'button';
                button.className = 'bb-picker-choice';
                button.dataset.materialChoice = item.id;
                button.innerHTML = `<span class="bb-picker-swatch" data-bb-swatch="${item.id}" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="bb-picker-name"></span><span class="bb-picker-check">${check}</span>`;
                const swatch = button.querySelector('.bb-picker-swatch');
                swatch.style.setProperty('--swatch-texture', `url("${options.textureBase}${item.id}.svg${options.textureQuery || ''}")`);
                // The preview uses the material's own palette, the same one the board renders.
                if (options.gradient) swatch.querySelectorAll('i').forEach((tile, index) => { tile.style.background = options.gradient(item.id, [4, 3, 1, 6][index]); });
                button.addEventListener('click', () => {
                    options.selectTheme(item.id);
                    updateSelection();
                    const swatch = button.querySelector('.bb-picker-swatch');
                    swatch.getAnimations().forEach(animation => animation.cancel());
                    if (!reduced()) swatch.animate(item.id === 'jelly' ? [
                        { transform: 'scale(.92,1.06)' }, { transform: 'scale(1.08,.92)', offset: .32 }, { transform: 'scale(.98,1.02)', offset: .65 }, { transform: 'scale(1)' },
                    ] : [{ transform: 'scale(.91)' }, { transform: 'scale(1.045)', offset: .45 }, { transform: 'scale(1)' }], { duration: 460, easing: 'ease-out' });
                });
                choices.appendChild(button);
            }
            calmInput.addEventListener('change', () => { options.setCalm(calmInput.checked); refresh(); });
            shakeInput.addEventListener('change', () => options.setShake?.(shakeInput.checked));
            volumeInput.addEventListener('input', () => {
                options.setVolume?.(Number(volumeInput.value));
                volumeInput.style.setProperty('--bb-volume-fill', volumeInput.value + '%');
                panel.querySelector('.bb-picker-volume-value').textContent = volumeInput.value + '%';
            });
            const tabNames = ['settings', 'skins', 'progress'];
            tabNames.forEach(tab => {
                const button = panel.querySelector(`[data-bb-tab="${tab}"]`);
                const page = panel.querySelector(`[data-bb-page="${tab}"]`);
                button.id = `${titleId}-${tab}-tab`;
                page.id = `${titleId}-${tab}-page`;
                button.setAttribute('aria-controls', page.id);
                page.setAttribute('aria-labelledby', button.id);
                button.addEventListener('click', () => setTab(tab));
            });
            panel.querySelector('.bb-picker-tabs').addEventListener('keydown', event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const current = tabNames.indexOf(activeTab);
                const index = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (current + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
                setTab(tabNames[index]);
                focus(panel.querySelector(`[data-bb-tab="${tabNames[index]}"]`));
            });
            closeButton.addEventListener('click', () => close());
            backdrop.addEventListener('click', () => close());
            bindSwipe();
            refresh();
            setTab(activeTab, false);
        }
        function open() {
            if (state !== 'closed') return;
            if (!overlay) build(); else refresh();
            restoreFocus = doc.activeElement;
            stopAnimations();
            state = 'open';
            overlay.hidden = false;
            panel.style.transform = 'translate3d(0,100%,0)';
            backdrop.style.opacity = '0';
            panel.querySelector('.bb-picker-content').scrollTop = 0;
            doc.addEventListener('keydown', keydown, true);
            doc.addEventListener('focusin', containFocus, true);
            doc.addEventListener('visibilitychange', visible);
            if (activeTab === 'progress') loadProgress();
            focus(closeButton);
            setBackgroundInert();
            // These explicit first keyframes apply before the browser's first paint.
            if (!reduced()) {
                const touch = root.matchMedia?.('(pointer: coarse)').matches || !doc.body.classList.contains('desktop');
                panelAnimation = panel.animate([{ transform: 'translate3d(0,100%,0)' }, { transform: 'translate3d(0,0,0)' }], { duration: touch ? 580 : 420, delay: 32, easing: 'cubic-bezier(.25,.72,.2,1)', fill: 'both' });
                backdropAnimation = backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out', fill: 'both' });
            }
            panel.style.transform = 'translate3d(0,0,0)';
            backdrop.style.opacity = '1';
        }
        function close(immediate = false) {
            immediate = immediate === true;
            if (state === 'closed' || (state === 'closing' && !immediate)) return;
            const transform = root.getComputedStyle(panel).transform;
            const opacity = root.getComputedStyle(backdrop).opacity;
            drag = null;
            header.classList.remove('is-dragging');
            stopAnimations();
            state = 'closing';
            const finish = () => {
                if (state !== 'closing') return;
                state = 'closed';
                stopAnimations();
                overlay.hidden = true;
                panel.style.transform = 'translate3d(0,100%,0)';
                backdrop.style.opacity = '0';
                doc.removeEventListener('keydown', keydown, true);
                doc.removeEventListener('focusin', containFocus, true);
                doc.removeEventListener('visibilitychange', visible);
                restoreBackground();
                focus(restoreFocus);
            };
            if (immediate || reduced()) { finish(); return; }
            panelAnimation = panel.animate([{ transform }, { transform: 'translate3d(0,100%,0)' }], { duration: 300, easing: 'cubic-bezier(.4,0,.8,.3)', fill: 'both' });
            backdropAnimation = backdrop.animate([{ opacity }, { opacity: 0 }], { duration: 300, easing: 'ease-in', fill: 'both' });
            panelAnimation.onfinish = finish;
        }
        return { open, close, refresh, showTab: tab => setTab(tab, false) };
    }
    const api = { create };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.BBMaterialPicker = api;
})(typeof window !== 'undefined' ? window : globalThis);
