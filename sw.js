/* 存錢Bo士 — 離線快取。改版時把 VER 加一，手機才會抓到新版 */
const VER = 'savequest-v235';
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

/* ── 推播：打工做完了 ──
   2～8 小時的班一定是在 app 關著的時候結束，頁面裡的 setTimeout 撐不到那時候，
   所以由雲端那邊在時間到的時候推一則過來，這裡負責顯示 */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || '存錢Bo士', {
    body: d.body || '',
    icon: './icon-192.png',
    badge: './icon-32.png',
    tag: d.tag || 'savequest',
    renotify: true,
    data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.location).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});
