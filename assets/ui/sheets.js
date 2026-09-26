/* Shared app-sheet gestures and keyboard behaviour. No game state lives here. */
(function (root) {
    'use strict';
    const bound = new WeakMap();
    const cross = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';
    function shouldDismiss(distance, velocity, age, height, cancelled) {
        return !cancelled && (distance > Math.min(130, height * .24) || (distance > 20 && velocity > .7 && age < 100));
    }
    function bindDrag(panel, close) {
        if (bound.has(panel)) return;
        let drag = null;
        const overlay = panel.parentElement;
        const reset = () => { drag = null; panel.classList.remove('dragging'); panel.style.transform = ''; overlay?.classList.remove('backdrop-dragging'); overlay?.style.removeProperty('--ui-backdrop-opacity'); };
        bound.set(panel, reset);
        const begin = (x, y, target) => {
            if (target.closest('button,a,input,select,textarea,[role="switch"],[role="tablist"],.segment-control')) return false;
            const fromHeader = !!target.closest('.ui-sheet-topbar,.ui-sheet-heading,.ui-sheet-grab');
            if (!fromHeader) for (let el = target; el && panel.contains(el); el = el.parentElement) if (el.scrollTop > 0) return false;
            drag = { x, y, lastY:y, time:performance.now(), velocity:0, active:false, offset:0, fromHeader };
            return true;
        };
        const move = (x, y, event) => {
            if (!drag) return;
            const distance = y - drag.y;
            if (!drag.active) {
                if (Math.max(Math.abs(distance),Math.abs(x-drag.x)) < 7) return;
                if (distance < 0 || Math.abs(x-drag.x) > distance || (!drag.fromHeader && panel.scrollTop > 0)) { drag = null; return; }
                const transform = root.getComputedStyle(panel).transform;
                drag.offset = transform === 'none' ? 0 : new root.DOMMatrixReadOnly(transform).m42;
                panel.classList.add('dragging'); drag.active = true;
                overlay?.classList.add('backdrop-dragging');
            }
            if (event.cancelable) event.preventDefault();
            const now = performance.now();
            drag.velocity = (y-drag.lastY) / Math.max(1,now-drag.time);
            drag.lastY = y; drag.time = now;
            const offset = Math.max(0,distance+drag.offset);
            panel.style.transform = `translate3d(0,${offset}px,0)`;
            overlay?.style.setProperty('--ui-backdrop-opacity',String(Math.max(0,1-offset/Math.max(280,panel.offsetHeight*.85))));
        };
        const finish = (cancelled=false) => {
            if (!drag) return;
            const dismiss = drag.active && shouldDismiss(drag.lastY-drag.y,drag.velocity,performance.now()-drag.time,panel.offsetHeight,cancelled);
            reset();
            if (dismiss) close();
        };
        panel.addEventListener('touchstart', e => { if (e.touches.length === 1) begin(e.touches[0].clientX,e.touches[0].clientY,e.target); else finish(true); }, {passive:true});
        panel.addEventListener('touchmove', e => { if (e.touches.length === 1) move(e.touches[0].clientX,e.touches[0].clientY,e); else finish(true); }, {passive:false});
        panel.addEventListener('touchend', () => finish());
        panel.addEventListener('touchcancel', () => finish(true));
        // WebKit may cancel the parallel pointer stream while the touch stream continues.
        panel.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button === 0) begin(e.clientX,e.clientY,e.target); });
        panel.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; move(e.clientX,e.clientY,e); if (drag?.active && !panel.hasPointerCapture(e.pointerId)) panel.setPointerCapture(e.pointerId); });
        panel.addEventListener('pointerup', e => { if (e.pointerType === 'mouse') finish(); });
        panel.addEventListener('pointercancel', e => { if (e.pointerType === 'mouse') finish(true); });
        panel.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !drag?.active) drag = null; });
    }
    function init() {
        const doc = root.document;
        const definitions = [
            ['modalSaper',null], ['modalSudoku',null], ['modalCheckers',null],
            ['modalResult','closeResult',true], ['modalLoading',null,true], ['modalWaitOpponent','cancelOnlineWait',true],
            ['settingsSheet','closeSettingsSheet'], ['referralConditionsSheet','hideReferralConditions'],
            ['titleDetailOverlay','closeTitleDetail'], ['titleChoiceOverlay','closeTitleChoiceMenu'],
            ['privacyScreen','closePrivacyPolicy',true], ['titleLibraryOverlay','closeTitleLibrary',true]
        ];
        const sheets = definitions.map(([id, handler, fullScreen]) => {
            const overlay = doc.getElementById(id);
            if (!overlay) return null;
            const panel = overlay.matches('.privacy-screen') ? overlay : overlay.querySelector('.ui-mode-panel,.bottom-sheet,.title-bottom-sheet,.title-library-sheet,.modal');
            if (!panel) return null;
            const close = () => { if (handler && typeof root[handler] === 'function') root[handler](); else overlay.classList.remove('visible'); };
            panel.tabIndex = -1; panel.setAttribute('role','dialog'); panel.setAttribute('aria-modal','true');
            const title = panel.querySelector('h2,h3,.bottom-sheet-title,.title-bottom-sheet-title,.privacy-header-title');
            if (title) { title.id ||= id+'Heading'; panel.setAttribute('aria-labelledby',title.id); }
            if (panel.matches('.bottom-sheet')) {
                const header = doc.createElement('div'); header.className = 'ui-sheet-topbar';
                const handle = panel.querySelector('.bottom-sheet-handle');
                panel.prepend(header);
                if (handle) header.appendChild(handle);
                if (title) header.appendChild(title);
                const button = doc.createElement('button'); button.className = 'ui-close'; button.type = 'button';
                button.setAttribute('aria-label','Закрыть'); button.innerHTML = cross; button.onclick = close; header.appendChild(button);
            }
            if (panel.matches('.ui-mode-panel')) overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
            if (!fullScreen) bindDrag(panel, close);
            return {overlay,panel,close,open:false,opener:null};
        }).filter(Boolean);
        let background = new Map();
        const visible = () => sheets.filter(s => s.open).sort((a,b) => Number(root.getComputedStyle(a.overlay).zIndex)-Number(root.getComputedStyle(b.overlay).zIndex));
        const sync = () => {
            const changed = [];
            for (const sheet of sheets) {
                const open = sheet.overlay.classList.contains('visible');
                if (open === sheet.open) continue;
                sheet.open = open; changed.push(sheet);
                if (open) sheet.opener = doc.activeElement;
                else bound.get(sheet.panel)?.();
                sheet.overlay.setAttribute('aria-hidden', String(!open));
            }
            if (!changed.length) return;
            for (const [el, wasInert] of background) el.inert = wasInert;
            background.clear();
            const top = visible().at(-1);
            if (top) {
                for (const el of doc.body.children) {
                    if (el === top.overlay || /^(SCRIPT|STYLE|LINK)$/.test(el.tagName)) continue;
                    background.set(el,el.inert); el.inert = true;
                }
                const previousControl = changed.find(s => !s.open)?.opener;
                (previousControl && top.panel.contains(previousControl) ? previousControl : top.panel).focus({preventScroll:true});
            } else {
                const opener = changed.find(s => !s.open)?.opener;
                if (opener?.isConnected && opener.getClientRects().length && !opener.closest('[inert]')) opener.focus({preventScroll:true});
            }
        };
        const observer = new MutationObserver(sync);
        for (const {overlay} of sheets) { overlay.setAttribute('aria-hidden','true'); observer.observe(overlay,{attributes:true,attributeFilter:['class']}); }
        doc.addEventListener('keydown', e => {
            const sheet = visible().at(-1); if (!sheet) return;
            if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); sheet.close(); }
            if (e.key !== 'Tab') return;
            const items = [...sheet.panel.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"],a[href]')].filter(el => el.getClientRects().length);
            const first = items[0], last = items.at(-1);
            if (!items.length) { e.preventDefault(); return; }
            if (e.shiftKey && (doc.activeElement === first || doc.activeElement === sheet.panel)) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && (doc.activeElement === last || doc.activeElement === sheet.panel)) { e.preventDefault(); first.focus(); }
        },true);
        doc.querySelectorAll('.segment-control:not(.bb-mode-tabs)').forEach(group => {
            const items = [...group.querySelectorAll('.segment-item')];
            const update = () => items.forEach(item => item.setAttribute('aria-pressed',String(item.classList.contains('active'))));
            group.addEventListener('keydown', e => {
                if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)) return;
                const index = items.indexOf(doc.activeElement); if (index < 0) return;
                e.preventDefault();
                const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length-1 : (index + (['ArrowRight','ArrowDown'].includes(e.key) ? 1 : -1) + items.length) % items.length;
                items[next].click(); items[next].focus();
            });
            new MutationObserver(update).observe(group,{attributes:true,subtree:true,attributeFilter:['class']}); update();
        });
        doc.querySelectorAll('.theme-switch').forEach(control => {
            control.tabIndex = 0; control.setAttribute('role','switch');
            const label = control.parentElement.querySelector('.setting-text,.setting-label,b') || control.previousElementSibling;
            if (label) { label.id ||= control.id+'Label'; control.setAttribute('aria-labelledby',label.id); }
            const update = () => control.setAttribute('aria-checked',String(control.id.startsWith('themeToggle') ? doc.documentElement.dataset.theme === 'dark' : control.classList.contains('active')));
            new MutationObserver(update).observe(control,{attributes:true,attributeFilter:['class']});
            new MutationObserver(update).observe(doc.documentElement,{attributes:true,attributeFilter:['data-theme']});
            control.addEventListener('keydown',e => { if ([' ','Enter'].includes(e.key)) { e.preventDefault(); control.click(); } }); update();
        });
        const viewport = () => {
            doc.documentElement.style.setProperty('--ui-viewport-height',(root.visualViewport?.height || root.innerHeight)+'px');
            doc.documentElement.style.setProperty('--ui-viewport-top',(root.visualViewport?.offsetTop || 0)+'px');
        };
        root.visualViewport?.addEventListener('resize',viewport); root.visualViewport?.addEventListener('scroll',viewport);
        const localizeClose = () => {
            const label = doc.documentElement.lang === 'en' ? 'Close' : doc.documentElement.lang === 'zh' ? '关闭' : 'Закрыть';
            doc.querySelectorAll('.ui-close').forEach(button => button.setAttribute('aria-label',label));
        };
        new MutationObserver(localizeClose).observe(doc.documentElement,{attributes:true,attributeFilter:['lang']});
        localizeClose(); viewport(); sync();
    }
    root.SparkSheets = {bindDrag,shouldDismiss};
    if (root.document) root.document.addEventListener('DOMContentLoaded',init,{once:true});
    if (typeof module !== 'undefined') module.exports = {shouldDismiss,bindDrag};
})(typeof window !== 'undefined' ? window : globalThis);
