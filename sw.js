const CACHE_NAME = 'pixel-art-v24';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './data/levels.json',
    './data/animal_0.json',
    './data/animal_1.json',
    './data/food_0.json'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
        })
    );
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Use Network-First for HTML to ensure latest version
    if (url.pathname.endsWith('/') || url.pathname.endsWith('index.html')) {
        e.respondWith(
            fetch(e.request)
                .then(res => {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                    return res;
                })
                .catch(() => caches.match(e.request))
        );
    } else {
        // Cache-First for other assets
        e.respondWith(
            caches.match(e.request).then(response => response || fetch(e.request))
        );
    }
});
