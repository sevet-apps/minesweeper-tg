/* One app opening, shared by all HTTP calls and game sockets. Server-side
   first-visit state cannot be reset by clearing localStorage. */
(function () {
    'use strict';
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    window.SparkVisitId = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    const fetch = window.fetch.bind(window);
    window.fetch = function (input, options) {
        const address = typeof input === 'string' ? input : input?.url;
        try {
            if (new URL(address, location.href).origin === 'https://spark-game-backend.onrender.com') {
                const headers = new Headers(options?.headers || (typeof input === 'object' ? input.headers : undefined));
                headers.set('X-Spark-Visit', window.SparkVisitId);
                options = { ...options, headers };
            }
        } catch (_) { /* native fetch reports malformed URLs */ }
        return fetch(input, options).then(response => {
            if (response.status === 403) response.clone().json().then(data => {
                if (data.error === 'subscription_required') window.dispatchEvent(new CustomEvent('spark-subscription-required', { detail: data }));
            }).catch(() => {});
            return response;
        });
    };
})();
