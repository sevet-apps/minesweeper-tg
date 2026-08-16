/* ============================================================
   sound.js — единая звуковая система Монополии.

   Для коротких и часто повторяющихся эффектов используется пул Audio:
   новый шаг фишки или удар второго кубика не обрывает предыдущий звук.
   Настройка хранится в общем localStorage основного приложения.
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

    let enabled = true;
    try { enabled = global.localStorage.getItem(STORAGE_KEY) !== 'false'; } catch (_) {}

    const pools = new Map();
    const cursors = new Map();
    const lastPlayed = new Map();
    const groups = new Map();

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

    function stop(audio) {
        if (!audio) return;
        try { audio.pause(); audio.currentTime = 0; } catch (_) {}
    }

    function play(name, options) {
        if (!enabled || !FILES[name]) return null;
        const opts = options || {};
        const now = (global.performance && global.performance.now)
            ? global.performance.now() : Date.now();
        const minInterval = Math.max(0, Number(opts.minInterval) || 0);
        if (minInterval && now - (lastPlayed.get(name) || -Infinity) < minInterval) return null;

        const pool = poolFor(name);
        if (!pool.length) return null;
        const index = cursors.get(name) || 0;
        const audio = pool[index % pool.length];
        cursors.set(name, (index + 1) % pool.length);
        lastPlayed.set(name, now);

        if (opts.group) {
            const previous = groups.get(opts.group);
            if (previous && previous !== audio) stop(previous);
            groups.set(opts.group, audio);
        }

        stop(audio);
        audio.volume = Math.max(0, Math.min(1, opts.volume == null ? 0.72 : opts.volume));
        try {
            const pending = audio.play();
            if (pending && typeof pending.catch === 'function') pending.catch(() => {});
        } catch (_) {}
        return audio;
    }

    function setEnabled(value) {
        enabled = !!value;
        try { global.localStorage.setItem(STORAGE_KEY, String(enabled)); } catch (_) {}
        if (!enabled) {
            pools.forEach(pool => pool.forEach(stop));
            groups.clear();
        }
        return enabled;
    }

    function isEnabled() { return enabled; }

    global.addEventListener?.('storage', event => {
        if (event.key !== STORAGE_KEY) return;
        enabled = event.newValue !== 'false';
        if (!enabled) {
            pools.forEach(pool => pool.forEach(stop));
            groups.clear();
        }
    });

    global.MonopolySound = { FILES, STORAGE_KEY, play, setEnabled, isEnabled };
})(window);
