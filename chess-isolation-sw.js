/* Изоляция страницы (cross-origin isolation) для многопоточного Stockfish.
   Потокам движка нужен SharedArrayBuffer, а он есть только у изолированной
   страницы — с заголовками COOP/COEP. GitHub Pages их не отдаёт, поэтому их
   добавляет этот service worker к ответам нашего сайта. Регистрирует его
   только подсказка владельца на компьютере (assets/chess/chess-app.js);
   у остальных игроков его нет. COEP credentialless: чужие картинки и скрипты
   (аватарки Telegram, telegram-web-app.js) грузятся как раньше, без cookie. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;
    if (new URL(request.url).origin !== self.location.origin) return;
    event.respondWith(fetch(request).then(response => {
        if (!response || response.status === 0 || response.type === 'opaque' || response.type === 'opaqueredirect') return response;
        const headers = new Headers(response.headers);
        headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
        headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }));
});
