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
        const copy = (ru, en, zh) => ({ ru, en, zh })[options.lang?.() || 'ru'] || ru;
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
        function setTab(next, animate = true) {
            activeTab = next;
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
            panel.querySelector('.bb-picker-progress-title').textContent = copy('Бонусы к очкам', 'Score bonuses', '分数奖励');
            panel.querySelector('.bb-picker-progress-detail').textContent = copy('Условия и награды скоро появятся здесь.', 'Challenges and rewards will appear here soon.', '挑战与奖励即将开放。');
            choices.querySelectorAll('[data-material-choice]').forEach(button => {
                const item = options.catalog.find(item => item.id === button.dataset.materialChoice);
                button.querySelector('.bb-picker-name').textContent = item.name[options.lang?.() || 'ru'] || item.name.ru;
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
            overlay.innerHTML = `<div class="bb-picker-backdrop" aria-hidden="true"></div><section class="bb-picker-panel" role="dialog" aria-modal="true" aria-labelledby="${titleId}" tabindex="-1"><header class="bb-picker-header"><div class="bb-picker-grab" aria-hidden="true"><span></span></div><div class="bb-picker-heading"><h2 class="bb-picker-title" id="${titleId}"></h2><button type="button" class="bb-picker-close">${cross}</button></div></header><div class="bb-picker-tabs" role="tablist" aria-label="Block Blast"><span class="bb-picker-tab-indicator" aria-hidden="true"></span><button type="button" role="tab" data-bb-tab="settings"></button><button type="button" role="tab" data-bb-tab="skins"></button><button type="button" role="tab" data-bb-tab="progress"></button></div><div class="bb-picker-content"><div class="bb-picker-page" data-bb-page="settings" role="tabpanel"><label class="bb-picker-motion"><span><span class="bb-picker-motion-title"></span><small class="bb-picker-motion-detail"></small></span><input class="bb-calm-input" type="checkbox" role="switch"><i aria-hidden="true"></i></label><label class="bb-picker-motion bb-picker-shake"><span><span class="bb-picker-motion-title bb-picker-shake-title"></span><small class="bb-picker-motion-detail bb-picker-shake-detail"></small></span><input class="bb-shake-input" type="checkbox" role="switch"><i aria-hidden="true"></i></label><div class="bb-picker-volume"><div class="bb-picker-volume-heading"><span><span class="bb-picker-volume-title"></span><small class="bb-picker-volume-detail"></small></span><strong class="bb-picker-volume-value"></strong></div><input class="bb-volume-input" type="range" min="0" max="100" step="1" value="100" aria-label="Sound volume"></div></div><div class="bb-picker-page" data-bb-page="skins" role="tabpanel" hidden><div class="bb-picker-choices" role="group"></div></div><div class="bb-picker-page" data-bb-page="progress" role="tabpanel" hidden><div class="bb-picker-progress"><span class="bb-picker-progress-icon" aria-hidden="true">✦</span><strong class="bb-picker-progress-title"></strong><p class="bb-picker-progress-detail"></p></div></div></div></section>`;
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
                button.querySelector('.bb-picker-swatch').style.setProperty('--swatch-texture', item.id === 'classic' ? 'none' : `url("${options.textureBase}${item.id}.svg")`);
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
                restoreBackground();
                focus(restoreFocus);
            };
            if (immediate || reduced()) { finish(); return; }
            panelAnimation = panel.animate([{ transform }, { transform: 'translate3d(0,100%,0)' }], { duration: 300, easing: 'cubic-bezier(.4,0,.8,.3)', fill: 'both' });
            backdropAnimation = backdrop.animate([{ opacity }, { opacity: 0 }], { duration: 300, easing: 'ease-in', fill: 'both' });
            panelAnimation.onfinish = finish;
        }
        return { open, close, refresh };
    }
    const api = { create };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.BBMaterialPicker = api;
})(typeof window !== 'undefined' ? window : globalThis);
