/* 存錢闖關 — 離線快取。改版時把 VER 加一，手機才會抓到新版 */
const VER = 'savequest-v9';
const FILES = ['./', './index.html', './manifest.json',
  './icon-192.png', './icon-512.png', './icon-512-maskable.png', './icon-180.png', './icon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
/* 有網路就拿新的（順手更新快取），沒網路就用快取 */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => { const cp = res.clone(); caches.open(VER).then(c => c.put(e.request, cp)); return res; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
