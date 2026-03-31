const CACHE_NAME = 'haggadah-v1.0.1570'; // Incremented to force update
const ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/haggadah_data.js',
    '/haggadah_app_icon.png'
];

self.addEventListener('install', (event) => {
    self.skipWaiting(); // Force active immediately
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('activate', (event) => {
    // Clean old caches
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Always bypass for analytics, sockets, and version check
    if (event.request.url.includes('socket.io') || event.request.url.includes('version.json')) {
        return;
    }

    // Network first for index.html to ensure they always get the latest Google-free version
    if (event.request.url.endsWith('/') || event.request.url.includes('index.html')) {
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
        return;
    }

    // Cache-first for large assets (scripts, styles)
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
