// Sideline Coach service worker. It has one job: turn a Web Push message from this
// computer's Sideline daemon into a system notification, and bring Sideline forward
// when that notification is tapped. It caches nothing and intercepts no requests.
'use strict';

const DEFAULT_TITLE = 'Sideline Coach';
const MAX_TITLE_CHARS = 60;
const MAX_BODY_CHARS = 180;

const boundedText = (value, max, fallback) => {
  const text = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
  if (!text) return fallback;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const notificationFromPush = (data) => {
  const payload = data && typeof data === 'object' ? data : {};
  const tag = typeof payload.tag === 'string' && /^[A-Za-z0-9_:-]{1,80}$/.test(payload.tag) ? payload.tag : 'sideline';
  return {
    title: boundedText(payload.title, MAX_TITLE_CHARS, DEFAULT_TITLE),
    options: {
      body: boundedText(payload.body, MAX_BODY_CHARS, ''),
      tag,
      // Same tag as the page-side fallback: a second copy replaces the first silently.
      renotify: false,
      data: { url: '/' }
    }
  };
};

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener('push', (event) => {
  let data = null;
  try { data = event.data ? event.data.json() : null; } catch { data = null; }
  const { title, options } = notificationFromPush(data);
  // Chrome requires every push to show a notification, so an unreadable payload still shows one.
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin && 'focus' in client) return client.focus();
    }
    return self.clients.openWindow('/');
  })());
});
