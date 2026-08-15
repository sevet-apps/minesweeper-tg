'use strict';

const crypto = require('crypto');

const DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60;
const MAX_FUTURE_SKEW_SECONDS = 30;

/** Verify Telegram Mini App initData and return its signed user payload. */
function verifyTelegramInitData(initData, botToken, options = {}) {
    if (!initData || !botToken) return null;
    try {
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return null;
        params.delete('hash');

        const check = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
        const calculated = crypto.createHmac('sha256', secret).update(check).digest();
        const supplied = Buffer.from(hash, 'hex');
        if (calculated.length !== supplied.length || !crypto.timingSafeEqual(calculated, supplied)) return null;

        const nowSeconds = Number.isFinite(options.nowSeconds)
            ? options.nowSeconds
            : Math.floor(Date.now() / 1000);
        const maxAgeSeconds = Number.isFinite(options.maxAgeSeconds)
            ? options.maxAgeSeconds
            : DEFAULT_MAX_AGE_SECONDS;
        const authDate = Number.parseInt(params.get('auth_date'), 10);
        if (!authDate || authDate > nowSeconds + MAX_FUTURE_SKEW_SECONDS || nowSeconds - authDate > maxAgeSeconds) {
            return null;
        }

        const user = JSON.parse(params.get('user') || 'null');
        if (!user || !Number.isSafeInteger(Number(user.id)) || Number(user.id) <= 0) return null;
        return user;
    } catch (_) {
        return null;
    }
}

function socketIdentity(initData, botToken, socketId, options = {}) {
    const user = verifyTelegramInitData(initData, botToken, options);
    if (user) return { uid: `tg${user.id}`, user, authenticated: true };
    return { uid: `guest:${String(socketId)}`, user: null, authenticated: false };
}

module.exports = { verifyTelegramInitData, socketIdentity, DEFAULT_MAX_AGE_SECONDS };
