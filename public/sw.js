// Service Worker pour Enchères-Antiquités (PWA & Notifications d'enchères)
const CACHE_NAME = 'encheres-antiquites-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Réception d'un message depuis l'application pour afficher une notification système (téléphone en veille / fermé)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    event.waitUntil(
      self.registration.showNotification(title, {
        icon: '/icon.svg',
        badge: '/icon.svg',
        vibrate: [200, 100, 300],
        requireInteraction: true,
        ...options,
      })
    );
  }
});

// Événement Push standard
self.addEventListener('push', (event) => {
  let data = {
    title: 'Enchères-Antiquités',
    body: 'Mise à jour de votre enchère.',
  };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const title = data.title || 'Enchères-Antiquités';
  const options = {
    body: data.body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: data.tag || 'general-auction',
    data: data.data || {},
    vibrate: [200, 100, 300],
    requireInteraction: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Clic sur la notification -> ouvre directement le lot concerné dans l'application
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const lotId = event.notification.data?.lotId;
  const targetUrl = lotId ? `/?lotId=${lotId}` : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          if (lotId) {
            client.postMessage({ type: 'OPEN_LOT', lotId });
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
