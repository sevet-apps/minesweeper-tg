/* ============================================================
   sound.js — единая звуковая система Монополии.

   Короткие частые эффекты проигрываются через заранее декодированный
   Web Audio buffer: новый удар кубика/шаг не обрывает предыдущий и не
   создаёт в момент броска пачку тяжёлых HTMLAudio на iOS. HTMLAudio-пул
   остаётся совместимым fallback для старых WebView.
   ============================================================ */
(function (global) {
    'use strict';

    const STORAGE_KEY = 'sounds_enabled';
    const FILES = Object.freeze({
        turnToYou:       'assets/sounds/turn-to-you.wav',
        casinoWin:       'assets/sounds/casino-win.wav',
        tradeSelect:     'assets/sounds/trade-select.wav',
        insufficient:    'assets/sounds/insufficient-funds.wav',
        diceContact:     'assets/sounds/dice-contact.wav',
        inspect:         'assets/sounds/inspect.wav',
        moneyIn:         'assets/sounds/money-in.wav',
        moneyOut:        'assets/sounds/money-out.wav',
        tokenStep:       'assets/sounds/token-step.wav',
        propertyPurchase:'assets/sounds/property-purchase.mp3',
    });
    const CHANNELS = Object.freeze({ diceContact: 8, tokenStep: 5, inspect: 3 });
    const CRITICAL = Object.freeze(['diceContact', 'tokenStep', 'inspect']);

    let enabled = true;
    try { enabled = global.localStorage.getItem(STORAGE_KEY) !== 'false'; } catch (_) {}

    const pools = new Map();
    const cursors = new Map();
    const lastPlayed = new Map();
    const groups = new Map();
    const AudioContextClass = global.AudioContext || global.webkitAudioContext;
    const buffers = new Map();
    const bufferLoads = new Map();
    const activeWebSounds = new Set();
    let audioContext = null;

    function createPool(name) {
        if (typeof global.Audio !== 'function' || !FILES[name]) return [];
        const count = CHANNELS[name] || 3;
        const pool = [];
        for (let i = 0; i < count; i++) {
            const audio = new global.Audio(FILES[name]);
            audio.preload = 'auto';
            audio.playsInline = true;
            pool.push(audio);
        }
        pools.set(name, pool);
        return pool;
    }

    function poolFor(name) { return pools.get(name) || createPool(name); }

    function stop(sound) {
        if (!sound) return;
        if (typeof sound.stop === 'function' && sound.__webAudioHandle) {
            sound.stop();
            return;
        }
        try { sound.pause(); sound.currentTime = 0; } catch (_) {}
    }

    function contextForAudio() {
        if (audioContext || !AudioContextClass) return audioContext;
        try { audioContext = new AudioContextClass({ latencyHint: 'interactive' }); }
        catch (_) {
            try { audioContext = new AudioContextClass(); } catch (_) { audioContext = null; }
        }
        return audioContext;
    }

    function decode(context, bytes) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const ok = buffer => { if (!settled) { settled = true; resolve(buffer); } };
            const fail = error => { if (!settled) { settled = true; reject(error); } };
            try {
                const pending = context.decodeAudioData(bytes.slice(0), ok, fail);
                if (pending && typeof pending.then === 'function') pending.then(ok, fail);
            } catch (error) { fail(error); }
        });
    }

    function loadBuffer(name) {
        if (buffers.has(name)) return Promise.resolve(buffers.get(name));
        if (bufferLoads.has(name)) return bufferLoads.get(name);
        const context = contextForAudio();
        if (!context || typeof global.fetch !== 'function') return Promise.reject(new Error('Web Audio unavailable'));
        const pending = global.fetch(FILES[name], { cache: 'force-cache' })
            .then(response => {
                if (!response.ok) throw new Error(`sound ${name}: ${response.status}`);
                return response.arrayBuffer();
            })
            .then(bytes => decode(context, bytes))
            .then(buffer => { buffers.set(name, buffer); return buffer; })
            .catch(error => { bufferLoads.delete(name); throw error; });
        bufferLoads.set(name, pending);
        return pending;
    }

    function prime(names) {
        if (!enabled || !AudioContextClass) return;
        (names || Object.keys(FILES)).forEach(name => loadBuffer(name).catch(() => {}));
    }

    function unlock() {
        if (!enabled) return;
        const context = contextForAudio();
        if (context && context.state !== 'running' && context.state !== 'closed') {
            try {
                const pending = context.resume();
                if (pending && typeof pending.catch === 'function') pending.catch(() => {});
            } catch (_) {}
        }
        prime(CRITICAL);
    }

    function playWebAudio(name, opts) {
        const context = contextForAudio();
        const buffer = buffers.get(name);
        if (!context || !buffer || context.state !== 'running') return null;
        try {
            const source = context.createBufferSource();
            const gain = context.createGain();
            source.buffer = buffer;
            gain.gain.value = Math.max(0, Math.min(1,
                opts.volume == null ? 0.72 : opts.volume));
            source.connect(gain);
            gain.connect(context.destination);
            let stopped = false;
            const handle = {
                __webAudioHandle: true,
                stop() {
                    if (stopped) return;
                    stopped = true;
                    try { source.stop(); } catch (_) {}
                    try { source.disconnect(); gain.disconnect(); } catch (_) {}
                    activeWebSounds.delete(handle);
                },
            };
            source.onended = () => {
                if (!stopped) {
                    stopped = true;
                    try { source.disconnect(); gain.disconnect(); } catch (_) {}
                    activeWebSounds.delete(handle);
                }
                if (opts.group && groups.get(opts.group) === handle) groups.delete(opts.group);
            };
            activeWebSounds.add(handle);
            source.start(0);
            return handle;
        } catch (_) { return null; }
    }

    function play(name, options) {
        if (!enabled || !FILES[name]) return null;
        const opts = options || {};
        const now = (global.performance && global.performance.now)
            ? global.performance.now() : Date.now();
        const minInterval = Math.max(0, Number(opts.minInterval) || 0);
        if (minInterval && now - (lastPlayed.get(name) || -Infinity) < minInterval) return null;

        let sound = playWebAudio(name, opts);
        if (!sound) {
            /* Буфер обычно готов задолго до первого броска. Если Web Audio
               заблокирован конкретным WebView, сохраняем прежний fallback. */
            loadBuffer(name).catch(() => {});
            const pool = poolFor(name);
            if (!pool.length) return null;
            const index = cursors.get(name) || 0;
            sound = pool[index % pool.length];
            cursors.set(name, (index + 1) % pool.length);
            stop(sound);
            sound.volume = Math.max(0, Math.min(1, opts.volume == null ? 0.72 : opts.volume));
            try {
                const pending = sound.play();
                if (pending && typeof pending.catch === 'function') pending.catch(() => {});
            } catch (_) {}
        }
        lastPlayed.set(name, now);

        if (opts.group) {
            const previous = groups.get(opts.group);
            if (previous && previous !== sound) stop(previous);
            groups.set(opts.group, sound);
        }
        return sound;
    }

    function setEnabled(value) {
        enabled = !!value;
        try { global.localStorage.setItem(STORAGE_KEY, String(enabled)); } catch (_) {}
        if (!enabled) {
            pools.forEach(pool => pool.forEach(stop));
            activeWebSounds.forEach(stop);
            groups.clear();
        } else {
            unlock();
            prime();
        }
        return enabled;
    }

    function isEnabled() { return enabled; }

    ['pointerdown', 'touchend', 'keydown'].forEach(type =>
        global.addEventListener?.(type, unlock, { capture: true, passive: true }));
    if (enabled) {
        prime(CRITICAL);
        const finishPrime = () => prime();
        if (typeof global.requestIdleCallback === 'function') {
            global.requestIdleCallback(finishPrime, { timeout: 1500 });
        } else if (typeof global.setTimeout === 'function') {
            global.setTimeout(finishPrime, 250);
        }
    }

    global.addEventListener?.('storage', event => {
        if (event.key !== STORAGE_KEY) return;
        setEnabled(event.newValue !== 'false');
    });

    global.MonopolySound = { FILES, STORAGE_KEY, play, setEnabled, isEnabled, prime, unlock };
})(window);
