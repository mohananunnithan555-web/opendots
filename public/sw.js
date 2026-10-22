// OpenDots Smart Reminders - Service Worker (Web Push)
// Handles background push events when tab is closed, browser in background, or mobile screen is locked.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'OpenDots Reminder',
    body: 'Reminder, sir. Your task is scheduled now.',
    tag: 'opendots-reminder',
    data: { url: '/' },
  };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (err) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: data.tag || 'opendots-reminder',
    renotify: true,
    requireInteraction: true,
    // Distinctive reminder vibration pattern: beep-beep-boop
    vibrate: [200, 100, 200, 100, 300, 100, 400],
    data: data.data || { url: '/' },
    actions: [
      { action: 'open', title: 'Open OpenDots' },
      { action: 'snooze', title: 'Snooze 10m' },
      { action: 'complete', title: 'Complete' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'OpenDots Reminder', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const action = event.action;
  const notificationData = event.notification.data || {};
  const reminderId = notificationData.reminderId;

  if (action === 'snooze' && reminderId) {
    event.waitUntil(
      fetch(`/api/reminders/${reminderId}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes: 10 }),
      }).catch((err) => console.error('Failed to snooze reminder:', err))
    );
    return;
  }

  if (action === 'complete' && reminderId) {
    event.waitUntil(
      fetch(`/api/reminders/${reminderId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch((err) => console.error('Failed to complete reminder:', err))
    );
    return;
  }

  // Open / Focus OpenDots window
  const targetUrl = notificationData.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
