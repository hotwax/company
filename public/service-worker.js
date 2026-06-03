// Self-unregistering service worker — replaces the stale Vue CLI PWA service worker
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => {
  self.registration.unregister();
  self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
    clients.forEach(client => client.navigate(client.url));
  });
});
