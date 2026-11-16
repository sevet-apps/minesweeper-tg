/* Values shared between players must remain text, including inside attributes. */
(function (root) {
    'use strict';
    const escape = value => String(value == null ? '' : value).replace(/[&<>"'`]/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));
    function image(value) {
        if (typeof value !== 'string' || value.length > 512 || !/^https:\/\/[^\s"'<>`\\]+$/i.test(value)) return '';
        try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? escape(value) : ''; }
        catch (_) { return ''; }
    }
    const api = { escape, image };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SparkSafeHTML = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
