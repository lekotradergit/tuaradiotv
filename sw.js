// ==========================================
// Service Worker - Tua Rádio TV
// ==========================================
const CACHE_NAME = 'tua-radio-tv-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/script.js',
    '/style.css',
    '/favicon.svg'
];

// Instalação do Service Worker
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache da Tua Rádio TV aberta com sucesso');
                return cache.addAll(urlsToCache);
            })
    );
});

// Ativação e limpeza de caches antigos
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Removendo cache antigo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Interceção de pedidos de rede (Fetch)
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});