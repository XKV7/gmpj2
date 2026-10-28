/*
 * 모여 서비스 워커 — 기기 알림(웹 푸시)
 * 앱을 닫아 두어도 서버가 보낸 알림을 받아 휴대폰·태블릿·PC의 알림창에 띄운다.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || '모여';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '새 메시지가 왔어요.',
      tag: data.tag || 'moyeo',
      // 같은 대화에서 또 오면 묶되, 소리·진동은 다시 울린다
      renotify: !!data.tag,
      icon: data.icon || '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      timestamp: Date.now(),
      data: { url: data.url || '/' },
    }),
  );
});

// 알림을 누르면: 열려 있는 모여 창이 있으면 그 창을 앞으로 가져와 해당 대화로, 없으면 새로 연다
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        client.postMessage({ type: 'moyeo:navigate', path: target.pathname });
        return;
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
