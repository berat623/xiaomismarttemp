/**
 * Models — Progressive Web App Service Worker
 * Sayısal Hava Tahmin Modelleri İstasyonu (CHMI ALADIN CZ & MGM ALADIN TR)
 */

const CACHE_NAME = 'models-forecast-v6.1';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './aladin.js',
  './data/aladin.json',
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
      console.log('[SW] Pre-caching offline assets for SmartTemp Pro...');
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

// 3. Fetch: Clean Cache-First Strategy with Zero Unnecessary Background Network Calls
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only handle HTTP/HTTPS GET requests
  if (request.method !== 'GET') return;
  if (!request.url.startsWith('http')) return;

  // MGM ALADIN Model Verisi ve Proxy İstekleri için Network-First Stratejisi
  if (request.url.includes('aladin.json') || request.url.includes('/api/aladin')) {
    event.respondWith(
      fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const toCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, toCache));
        }
        return networkResponse;
      }).catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return instantly from cache for 0ms offline latency with zero redundant background network traffic
        return cachedResponse;
      }

      // If not in cache, fetch from network and store in cache
      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Offline Fallback for HTML page navigations
        if (request.mode === 'navigate') {
          return caches.match('./index.html') || caches.match('./');
        }
      });
    })
  );
});
