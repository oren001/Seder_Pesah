const ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/haggadah_data.js',
    '/haggadah_app_icon.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('fetch', (event) => {
    // For socket.io and other dynamic things, we bypass the cache
    if (event.request.url.includes('socket.io') || event.request.url.includes('version.json')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
