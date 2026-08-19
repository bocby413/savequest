/* 存錢Bo士 — 離線快取。改版時把 VER 加一，手機才會抓到新版 */
const VER = 'savequest-v42';
const FILES = ['./', './index.html', './manifest.json',
  './prices.json', './icon-192.png', './icon-512.png', './icon-512-maskable.png', './icon-180.png', './icon-32.png', './og.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
/* 有網路就拿新的（順手更新快取），沒網路就用快取。
   開頁面時繞過瀏覽器自己的 HTTP 快取，否則 GitHub Pages 的 10 分鐘快取會餵舊版。 */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const fresh = e.request.mode === 'navigate' || /\.(html|js|json)$/.test(new URL(e.request.url).pathname);
  e.respondWith(
    fetch(fresh ? new Request(e.request, { cache: 'reload' }) : e.request)
      .then(res => { const cp = res.clone(); caches.open(VER).then(c => c.put(e.request, cp)); return res; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
