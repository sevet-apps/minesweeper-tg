/* Experimental web glass. This is not Apple's native Liquid Glass renderer. */
(function (root) {
    'use strict';
    const KEY = 'spark_liquid_glass';
    const DEFAULTS = Object.freeze({ enabled:false, mode:'clear', intensity:55 });
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    function normalize(value) {
        const candidate = Number(value?.intensity);
        return { enabled:value?.enabled === true, mode:value?.mode === 'tinted' ? 'tinted' : 'clear',
            intensity:typeof value?.intensity === 'number' && Number.isFinite(candidate) ? clamp(candidate,0,100) : DEFAULTS.intensity };
    }
    function appearance(settings, lite=false) {
        const t = settings.intensity / 100, tinted = settings.mode === 'tinted';
        return { blur:lite ? 2 : 3 + t * 9, opacity:.12 + t * .42 + (tinted ? .12 : 0),
            tint:.92 + t * .07, rim:.12 + t * .27, saturation:1.12 + t * .38 };
    }
    function read(storage) {
        try { return normalize(JSON.parse(storage.getItem(KEY))); } catch (_) { return {...DEFAULTS}; }
    }
    if (typeof module !== 'undefined') module.exports = {normalize,appearance,read,KEY,DEFAULTS};
    if (!root.document) return;
    const doc = root.document;
    let storage; try { storage = root.localStorage; } catch (_) { storage = null; }
    let settings = read(storage), observer = null, pointer = null, moveFrame = 0, updateFrame = 0;
    const animations = new Map();
    const reducedMotion = root.matchMedia('(prefers-reduced-motion: reduce)');
    const controls = 'button,[role="button"],.theme-switch,.back-btn,.tab-item,.num-btn,.wordle-key,.segment-item,.lb-selector,.lb-live-badge,.card[onclick],.game-card,.lb-sw,.switch,.bb-picker-motion > i,.bb-settings-trigger,.profile-action-btn,.ref-copy-btn,.ref-share-btn,.lb-room,.lb-me';
    const tracks = '.segment-control,.profile-segment,.bb-lb-segment,.title-sort-switch,.lb-seg,.mc-tabs,.bb-picker-tabs,.spark-glass-modes';
    const thumbs = '.segment-glider,.profile-segment-glider,.bb-lb-segment-thumb,.title-sort-indicator,.lb-seg-ind,.bb-picker-tab-indicator,.switch-circle';
    const accent = '.btn-main,.subscription-btn.primary,.settings-footer-btn.primary,.bb-mode-play-btn,.lb-primary,.lb-btn:not(.ghost),.mc-primary,.btn-primary,.checkers-join-btn,.mono-primary-btn,.ref-share-btn';
    const skip = '[data-glass="off"],.qa-tools button,input,.bb-cell,.cell,.checker,.tile,.mc-board-cell';
    const isLite = () => doc.body?.classList.contains('lite-mode') || (() => { try { return storage?.getItem('lite_mode') === 'true'; } catch (_) { return false; } })();
    const canMove = () => settings.enabled && !isLite() && !reducedMotion.matches && !doc.hidden && root.CSS?.supports('scale','1 1');
    function mark(el) {
        if (!el.matches || el.matches(skip)) return;
        if (el.matches(tracks)) el.classList.add('spark-glass-track');
        if (el.matches(thumbs)) el.classList.add('spark-glass-thumb');
        if (!el.matches(controls)) return;
        el.classList.add('spark-glass-control');
        if (el.matches(accent)) el.classList.add('spark-glass-accent');
        if (el.matches('.btn-danger,.mc-danger,.danger,.lb-seat-btn.danger') || /background[^;]*(?:var\(--danger\)|#ff3b30|#ef4056)/i.test(el.getAttribute('style') || '')) el.classList.add('spark-glass-danger');
        if (el.closest(tracks) && !el.matches(tracks)) el.classList.add('spark-glass-segment');
        if (el.matches('.game-card,.card[onclick]')) el.classList.add('spark-glass-card');
    }
    function scan(node) {
        if (node.nodeType !== 1 && node !== doc) return;
        mark(node);
        node.querySelectorAll?.(controls+','+tracks+','+thumbs).forEach(mark);
    }
    function stopAnimation(el) {
        animations.get(el)?.cancel(); animations.delete(el);
        el.style.removeProperty('scale'); el.style.removeProperty('translate');
    }
    function resetPointer() {
        if (moveFrame) root.cancelAnimationFrame(moveFrame);
        moveFrame = 0;
        if (pointer) stopAnimation(pointer.el);
        pointer = null;
    }
    function stopAll() { resetPointer(); for (const el of [...animations.keys()]) stopAnimation(el); }
    function syncSettings() {
        const toggle = doc.getElementById('liquidGlassToggle');
        toggle?.classList.toggle('active',settings.enabled);
        toggle?.setAttribute('aria-checked',String(settings.enabled));
        const details = doc.getElementById('liquidGlassDetails');
        details?.classList.toggle('is-open',settings.enabled);
        details?.setAttribute('aria-hidden',String(!settings.enabled));
        if (details) details.inert = !settings.enabled;
        const fieldset = doc.getElementById('liquidGlassControls');
        if (fieldset) fieldset.disabled = !settings.enabled;
        const slider = doc.getElementById('liquidGlassIntensity');
        if (slider) { slider.value = settings.intensity; slider.style.setProperty('--sg-range',settings.intensity+'%'); }
        const output = doc.getElementById('liquidGlassValue');
        if (output) output.textContent = new Intl.NumberFormat(doc.documentElement.lang || 'en',{style:'percent',maximumFractionDigits:0}).format(settings.intensity/100);
        doc.querySelectorAll('[data-glass-mode]').forEach(el => el.setAttribute('aria-pressed',String(el.dataset.glassMode === settings.mode)));
        const modes = doc.getElementById('liquidGlassModes');
        modes?.style.setProperty('--sg-mode-index',settings.mode === 'tinted' ? '1' : '0');
    }
    function apply() {
        const lite = isLite(), style = doc.documentElement.style, visual = appearance(settings,lite);
        doc.documentElement.dataset.liquidGlass = settings.enabled ? 'on' : 'off';
        doc.documentElement.dataset.glassMode = settings.mode;
        doc.documentElement.dataset.glassLite = String(lite);
        style.setProperty('--sg-blur',visual.blur+'px'); style.setProperty('--sg-opacity',visual.opacity);
        style.setProperty('--sg-tint',visual.tint); style.setProperty('--sg-rim',visual.rim);
        style.setProperty('--sg-saturation',visual.saturation);
        if (!canMove()) stopAll();
        if (settings.enabled && !observer && doc.body) {
            scan(doc);
            observer = new MutationObserver(records => {
                for (const record of records) for (const node of record.addedNodes) scan(node);
            });
            observer.observe(doc.body,{subtree:true,childList:true});
        } else if (!settings.enabled && observer) { observer.disconnect(); observer = null; }
        syncSettings();
    }
    function update(patch, persist=true) {
        settings = normalize({...settings,...patch});
        apply();
        if (persist) try { storage?.setItem(KEY,JSON.stringify(settings)); } catch (_) {}
        return {...settings};
    }
    root.SparkGlass = {getSettings:() => ({...settings}),update,refresh:apply};
    function release(cancelled=false) {
        if (!pointer) return;
        if (moveFrame) root.cancelAnimationFrame(moveFrame);
        moveFrame = 0;
        const el = pointer.el, scale = el.style.scale || '.975 1.02', translate = el.style.translate || '0px 0px';
        pointer = null;
        if (cancelled || !canMove() || !el.isConnected || !el.animate) { stopAnimation(el); return; }
        // Individual transform properties leave existing spring/indicator transforms intact.
        const animation = el.animate([
            {scale,translate,offset:0}, {scale:'1.035 .975',translate:'0px 0px',offset:.32},
            {scale:'.992 1.012',translate:'0px 0px',offset:.62}, {scale:'1 1',translate:'0px 0px',offset:1}
        ],{duration:430,easing:'cubic-bezier(.22,.75,.28,1)'});
        animations.set(el,animation);
        el.style.removeProperty('scale'); el.style.removeProperty('translate');
        animation.onfinish = animation.oncancel = () => { if (animations.get(el) === animation) animations.delete(el); };
    }
    function down(e) {
        if (!canMove() || e.isPrimary === false || e.button !== 0) return;
        const row = e.target.closest?.('.bb-picker-motion,.lb-switch-row');
        if (row?.querySelector('input')?.disabled || row?.classList.contains('is-disabled')) return;
        const target = row?.querySelector('i,.lb-sw') || e.target.closest?.('.spark-glass-control');
        if (!target || target.matches(':disabled,[aria-disabled="true"]') || target.closest('[inert]') || target.offsetWidth === 0) return;
        resetPointer(); stopAnimation(target);
        pointer = {el:target,id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0};
        target.style.scale = '.972 1.018'; target.style.translate = '0px 0px';
    }
    function move(e) {
        if (!pointer || pointer.id !== e.pointerId) return;
        pointer.dx = e.clientX-pointer.x; pointer.dy = e.clientY-pointer.y;
        // Let native page/sheet scrolls and segmented-control drags own their gestures.
        if ((e.pointerType !== 'mouse' && Math.abs(pointer.dy)>9) || Math.hypot(pointer.dx,pointer.dy)>60) { release(true); return; }
        if (moveFrame) return;
        moveFrame = root.requestAnimationFrame(() => {
            moveFrame = 0; if (!pointer) return;
            const {el,dx,dy} = pointer, horizontal = Math.abs(dx) >= Math.abs(dy), stretch = Math.min(.075,Math.hypot(dx,dy)/360);
            el.style.scale = horizontal ? `${1+stretch} ${.985-stretch*.45}` : `${.985-stretch*.45} ${1+stretch}`;
            el.style.translate = `${clamp(dx*.14,-7,7)}px ${clamp(dy*.14,-5,5)}px`;
        });
    }
    function init() {
        doc.getElementById('liquidGlassToggle')?.addEventListener('click',() => update({enabled:!settings.enabled}));
        doc.querySelectorAll('[data-glass-mode]').forEach(el => el.addEventListener('click',() => update({mode:el.dataset.glassMode})));
        const slider = doc.getElementById('liquidGlassIntensity');
        slider?.addEventListener('input',() => {
            if (updateFrame) root.cancelAnimationFrame(updateFrame);
            updateFrame = root.requestAnimationFrame(() => { updateFrame = 0; update({intensity:Number(slider.value)},false); });
        });
        slider?.addEventListener('change',() => {
            if (updateFrame) root.cancelAnimationFrame(updateFrame); updateFrame = 0;
            update({intensity:Number(slider.value)});
        });
        // No pointer capture, preventDefault or synthetic clicks: controls keep their original behaviour.
        doc.addEventListener('pointerdown',down,{passive:true}); doc.addEventListener('pointermove',move,{passive:true});
        doc.addEventListener('pointerup',e => { if (pointer?.id === e.pointerId) release(); },{passive:true});
        doc.addEventListener('pointercancel',() => release(true),{passive:true});
        doc.addEventListener('visibilitychange',() => { if (doc.hidden) stopAll(); });
        root.addEventListener('blur',stopAll); reducedMotion.addEventListener?.('change',apply);
        root.addEventListener('storage',e => { if (e.key === KEY || e.key === null) { settings = read(storage); apply(); } else if (e.key === 'lite_mode') apply(); });
        new MutationObserver(apply).observe(doc.documentElement,{attributes:true,attributeFilter:['lang']});
        new MutationObserver(() => { if (doc.documentElement.dataset.glassLite !== String(isLite())) apply(); }).observe(doc.body,{attributes:true,attributeFilter:['class']});
        apply();
    }
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})(typeof window !== 'undefined' ? window : globalThis);
