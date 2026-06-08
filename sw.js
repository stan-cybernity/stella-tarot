/* 星语塔罗 Service Worker —— 卡图/字体缓存优先，离线可看牌面 */
const CACHE = 'stella-v1';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => {
  const u = e.request.url;
  if (/\.(webp|png|jpg|jpeg|woff2?)$/.test(u)) {
    e.respondWith(
      caches.open(CACHE).then(c =>
        c.match(e.request).then(r => r || fetch(e.request).then(resp => { c.put(e.request, resp.clone()); return resp; }).catch(() => r))
      )
    );
  }
});
