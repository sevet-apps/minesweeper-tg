/* Spark: незаконченные игры в облаке Telegram (CloudStorage).
   CloudStorage бесплатный и привязан к паре «бот + пользователь», поэтому
   партия, начатая на телефоне, продолжается на компьютере и переживает
   смену адреса сайта. Значение до 4096 символов — длинные сохранения
   режутся на части. Побеждает более свежая запись (метка времени). */
(function (root) {
    'use strict';
    const KEYS = ['wordle_saved_game', 'sudo_state', 'bb_state_original', 'bb_state_tournament'];
    const CHUNK = 3800;
    const PREFIX = 'sv_';
    const stampKey = key => `cloud_t_${key}`;

    function createCloudSaves({ cloud, storage, now = () => Date.now(), delay = 1500 }) {
        const proto = Object.getPrototypeOf(storage);
        const rawSet = proto.setItem, rawRemove = proto.removeItem;
        const timers = new Map();
        const call = (method, ...args) => new Promise(resolve => {
            try { cloud[method](...args, (error, result) => resolve(error ? null : result)); }
            catch (_) { resolve(null); }
        });
        const metaKey = key => `${PREFIX}${key}_n`;
        const partKey = (key, i) => `${PREFIX}${key}_${i}`;
        const parseMeta = value => {
            const [count, time] = String(value || '').split('|').map(Number);
            return { count: count || 0, time: time || 0 };
        };

        async function push(key) {
            timers.delete(key);
            const value = storage.getItem(key);
            const time = now();
            rawSet.call(storage, stampKey(key), String(time));
            const previous = parseMeta(await call('getItem', metaKey(key)));
            const parts = [];
            if (value != null) for (let i = 0; i < value.length; i += CHUNK) parts.push(value.slice(i, i + CHUNK));
            for (let i = 0; i < parts.length; i++) {
                if ((await call('setItem', partKey(key, i), parts[i])) === null) return;
            }
            await call('setItem', metaKey(key), `${parts.length}|${time}`);
            if (previous.count > parts.length) {
                await call('removeItems', Array.from({ length: previous.count - parts.length }, (_, i) => partKey(key, parts.length + i)));
            }
        }

        function schedule(key) {
            clearTimeout(timers.get(key));
            timers.set(key, setTimeout(() => push(key), delay));
        }

        function flush() {
            for (const [key, timer] of timers) { clearTimeout(timer); push(key); }
        }

        async function restore() {
            const metas = await call('getItems', KEYS.map(metaKey));
            if (!metas) return [];
            const restored = [];
            for (const key of KEYS) {
                const { count, time } = parseMeta(metas[metaKey(key)]);
                const localTime = Number(storage.getItem(stampKey(key))) || 0;
                if (!time || time <= localTime || timers.has(key)) continue;
                if (!count) {
                    // A save made before cloud sync existed has no stamp: never drop it
                    // because some other device finished its own game.
                    if (localTime) rawRemove.call(storage, key);
                    rawSet.call(storage, stampKey(key), String(time));
                    continue;
                }
                const chunks = await call('getItems', Array.from({ length: count }, (_, i) => partKey(key, i)));
                if (!chunks) continue;
                const value = Array.from({ length: count }, (_, i) => chunks[partKey(key, i)] || '').join('');
                if (!value) continue;
                rawSet.call(storage, key, value);
                rawSet.call(storage, stampKey(key), String(time));
                restored.push(key);
            }
            return restored;
        }

        function install() {
            proto.setItem = function (key, value) {
                rawSet.call(this, key, value);
                if (this === storage && KEYS.includes(key)) schedule(key);
            };
            proto.removeItem = function (key) {
                rawRemove.call(this, key);
                if (this === storage && KEYS.includes(key)) schedule(key);
            };
        }

        return { install, restore, flush, push, KEYS };
    }

    root.SparkCloudSaves = { createCloudSaves, KEYS };

    const tg = root.Telegram && root.Telegram.WebApp;
    if (!tg || !tg.CloudStorage || !(tg.isVersionAtLeast && tg.isVersionAtLeast('6.9'))) return;
    let saves;
    try { saves = createCloudSaves({ cloud: tg.CloudStorage, storage: root.localStorage }); }
    catch (_) { return; }
    saves.install();
    root.SparkCloudSaves.ready = saves.restore().catch(() => []);
    root.document.addEventListener('visibilitychange', () => { if (root.document.hidden) saves.flush(); });
    root.addEventListener('pagehide', () => saves.flush());
})(typeof window !== 'undefined' ? window : globalThis);
