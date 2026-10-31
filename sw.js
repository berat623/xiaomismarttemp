/**
 * Models — Progressive Web App Service Worker
 * Sayısal Hava Tahmin Modelleri İstasyonu
 */

const CACHE_NAME = 'models-forecast-v7.0';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './style.css?v=7.0',
  './app.js',
  './app.js?v=7.0',
  './aladin.js',
  './aladin.js?v=7.0',
  './manifest.webmanifest',
  './icon.svg',
  './vendor/tailwind.js',
  './vendor/chart.umd.min.js',
  './vendor/lucide.min.js',
  './fonts/parkinsans-500.ttf',
  './fonts/parkinsans-600.ttf',
  './fonts/parkinsans-700.ttf',
  './fonts/parkinsans-800.ttf',
  './fonts/poppins-400.ttf',
  './fonts/poppins-500.ttf',
  './fonts/poppins-600.ttf',
  './fonts/poppins-700.ttf',
  './fonts/poppins-800.ttf'
];

// 1. Install: Pre-cache all core app shell, vendor scripts, and offline fonts
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching offline assets for Models...');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate: Clean up old caches and take immediate control of clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => {
          console.log('[SW] Removing old cache version:', key);
          return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch: Dynamic network-first strategy with cache fallback
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Sadece HTTP(S) GET isteklerini ele al
  if (request.method !== 'GET') return;
  if (!request.url.startsWith('http')) return;

  // Open-Meteo API istekleri için Network-First (Ağ Öncelikli, Ağ yoksa Önbellek)
  if (request.url.includes('api.open-meteo.com')) {
    event.respondWith(
      fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const toCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, toCache));
        }
        return networkResponse;
      }).catch(() => {
        return caches.match(request);
      })
    );
    return;
  }

  // Statik varlıklar ve uygulama kabuğu için Cache-First (Hızlı Açılış)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Arka planda güncelle (Stale-While-Revalidate)
        fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, networkResponse);
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });
        return networkResponse;
      });
    })
  );
});
