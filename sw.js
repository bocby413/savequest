/* 存錢Bo士 — 離線快取。改版時把 VER 加一，手機才會抓到新版 */
const VER = 'savequest-v294';
const FILES = ['./', './index.html', './manifest.json',
  './prices.json', './icon-192.png', './icon-512.png', './icon-512-maskable.png', './icon-180.png', './icon-32.png', './og.png'];

/* 裝新版的時候把每個檔案「繞過瀏覽器快取」重抓一次。
   直接用 cache.addAll 會走 HTTP 快取，GitHub Pages 的 CDN 可能餵舊的，
   那快取裡就會存到跟這個 VER 對不起來的檔案。
   這一步做對了，下面才敢放心直接拿快取給頁面用。 */
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER)
    .then(c => Promise.all(FILES.map(f =>
      fetch(new Request(f, { cache: 'reload' }))
        .then(r => r.ok ? c.put(f, r) : null)
        .catch(() => null))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* 開 app 的時候先把快取裡的直接給出去，不等網路。
   之前是反過來的（每次開都強制走網路、快取只有斷網才用），
   結果每開一次都要等主檔下載完 —— 壓縮後 223KB，手機上就是 5～10 秒。
   網路慢不會讓 fetch 失敗，它只是慢，所以「失敗才用快取」等於快取沒用。

   換新版不靠這裡，靠的是 sw.js 自己的更新：VER 一改，瀏覽器裝新的 SW，
   install 重抓所有檔案，頁面收到 updatefound 就重新整理。所以直接拿快取
   不會卡在舊版。背景那一次抓只是順手把快取補新，抓不到也無所謂。

   prices.json 例外：收盤價每天更新，那不會動到 VER，一定要走網路。 */
/* 存進快取。跨網域的不透明回應 put 會丟例外，接住就好，
   存不進去不影響這次的回應 */
const keep = (req, res) => caches.open(VER).then(c => c.put(req, res)).catch(() => {});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const path = new URL(e.request.url).pathname;
  const live = /prices\.json$/.test(path);          /* 每天會變的，一律走網路 */

  if (live) {
    e.respondWith(
      fetch(new Request(e.request, { cache: 'reload' }))
        .then(res => { const cp = res.clone(); keep(e.request, cp); return res; })
        .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request)
        .then(res => { const cp = res.clone(); keep(e.request, cp); return res; })
        .catch(() => hit || caches.match('./index.html'));
      return hit || net;                            /* 有快取就先給，沒有才等網路 */
    })
  );
});
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  /* 讓頁面問得到「現在跑的是哪一版」。改版之後最常見的問題就是
     不知道自己更新了沒，從畫面上看不出來 */
  if (e.data === 'ver' && e.source) e.source.postMessage({ ver: VER });
});

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
