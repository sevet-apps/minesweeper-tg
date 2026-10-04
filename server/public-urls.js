'use strict';

const DEFAULT_WEBAPP_URL = 'https://sevet-apps.github.io/minesweeper-tg/';

function createPublicUrls(value = DEFAULT_WEBAPP_URL) {
    let base;
    try { base = new URL(value || DEFAULT_WEBAPP_URL); }
    catch (_) { throw new Error('WEBAPP_URL must be an absolute HTTPS site URL'); }
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
        throw new Error('WEBAPP_URL must use HTTPS without credentials, query or fragment');
    }
    base.pathname = base.pathname.replace(/\/+$/, '') + '/';
    const WEBAPP_URL = base.href;
    function assetUrl(relativePath) {
        // All callers supply local branding assets. Never resolve an absolute URL
        // or a parent path that could silently discard a Pages project prefix.
        if (!/^assets\/[a-zA-Z0-9_/-]+\.[a-zA-Z0-9]+(?:\?v=[a-zA-Z0-9_-]+)?$/.test(relativePath)) {
            throw new Error('Expected a relative Spark asset path');
        }
        return new URL(relativePath, WEBAPP_URL).href;
    }
    return { WEBAPP_URL, assetUrl };
}

module.exports = { createPublicUrls, DEFAULT_WEBAPP_URL };
