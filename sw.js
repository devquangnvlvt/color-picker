const CACHE_NAME = 'pixel-art-v18';
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
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then(response => response || fetch(e.request))
    );
});
