// Simple Service Worker for PWA compliance
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installed');
});

self.addEventListener('fetch', (event) => {
  // Pass-through fetch
  event.respondWith(fetch(event.request));
});
