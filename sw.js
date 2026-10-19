/**
 * Xiaomi SmartTemp Pro — Progressive Web App Service Worker
 * Complete 100% Offline Support (No Internet Connection Required)
 * Bluetooth BLE sensor telemetry operates locally via Web Bluetooth API.
 */

const CACHE_NAME = 'xiaomi-smarttemp-v3.2';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './vendor/tailwind.js',
  './vendor/chart.umd.min.js',
  './vendor/lucide.min.js',
  './fonts/parkinsans-500.ttf',
  './fonts/parkinsans-600.ttf',
  './fonts/parkinsans-700.ttf',
  './fonts/parkinsans-800.ttf'
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

// 3. Fetch: Cache-First strategy with background revalidation
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only handle HTTP/HTTPS GET requests
  if (request.method !== 'GET') return;
  if (!request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return instantly from cache for 0ms offline latency
        // Revalidate in background if online to update cache silently
        fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, networkResponse.clone());
            });
          }
        }).catch(() => {
          // Device is offline; cachedResponse handles the request flawlessly
        });

        return cachedResponse;
      }

      // If not in cache yet, fetch from network and store in cache
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
