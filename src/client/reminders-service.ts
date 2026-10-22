import type { Reminder, ReminderStatus, ReminderRecurrence } from '../shared/types';

// Convert URL-safe base64 string to Uint8Array for VAPID applicationServerKey
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return reg;
  } catch (err) {
    console.error('Service Worker registration failed:', err);
    return null;
  }
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribeUserToPush(): Promise<{ success: boolean; subscription?: PushSubscription; error?: string }> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { success: false, error: 'Web Push is not supported in this browser.' };
  }

  // Request notification permission if not yet granted
  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Notification permission was denied. Please allow notifications in browser settings.' };
    }
  }

  try {
    const reg = await navigator.serviceWorker.ready;

    // Fetch VAPID public key from backend
    const keyRes = await fetch('/api/reminders/vapid-public-key');
    if (!keyRes.ok) throw new Error('Failed to retrieve VAPID key from server.');
    const { publicKey } = await keyRes.json();
    if (!publicKey) throw new Error('VAPID public key not configured.');

    const convertedKey = urlBase64ToUint8Array(publicKey);
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey as any,
      });
    }

    // Register subscription on backend
    const subJson = subscription.toJSON();
    await fetch('/api/reminders/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: {
          auth: subJson.keys?.auth,
          p256dh: subJson.keys?.p256dh,
        },
      }),
    });

    return { success: true, subscription };
  } catch (err: any) {
    console.error('Push subscription error:', err);
    return { success: false, error: err.message || 'Push subscription failed.' };
  }
}

export async function unsubscribeUserFromPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      await fetch('/api/reminders/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
    }
    return true;
  } catch (err) {
    console.error('Push unsubscription error:', err);
    return false;
  }
}

// Synthesize pleasant futuristic chime sound using Web Audio API (₹0 cost, 0 dependencies)
export function playReminderChime(): void {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const notes = [659.25, 880, 1046.5]; // E5, A5, C6 (ascending bright chime)
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);

      gain.gain.setValueAtTime(0, now + idx * 0.12);
      gain.gain.linearRampToValueAtTime(0.25, now + idx * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.5);
    });
  } catch (err) {
    console.warn('Audio chime playback failed:', err);
  }
}

// Spoken voice announcement via Web Speech API (active tab only)
export function speakReminderAnnouncement(title: string): void {
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel(); // Stop any pending speech
    const utterance = new SpeechSynthesisUtterance(`Reminder, sir. Your task is to ${title}.`);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.lang = 'en-US';

    // Prefer higher quality English voice if available
    const voices = window.speechSynthesis.getVoices();
    const naturalVoice = voices.find(
      (v) => (v.name.includes('Natural') || v.name.includes('Google') || v.lang.startsWith('en')) && !v.name.includes('Compact')
    );
    if (naturalVoice) {
      utterance.voice = naturalVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Spoken announcement failed:', err);
  }
}

// REST API Helpers
export async function getRemindersList(status?: ReminderStatus): Promise<Reminder[]> {
  const url = status ? `/api/reminders?status=${status}` : '/api/reminders';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load reminders');
  const data = await res.json();
  return data.reminders || [];
}

export async function createNaturalReminder(prompt: string, timezone: string = 'Asia/Kolkata') {
  const res = await fetch('/api/reminders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, timezone }),
  });
  return res.json();
}

export async function createStructuredReminder(data: {
  title: string;
  dueAt: number | null;
  recurrence?: ReminderRecurrence | null;
  targetEvent?: string | null;
  timezone?: string;
}) {
  const res = await fetch('/api/reminders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function snoozeReminder(id: string, minutes: number = 10) {
  const res = await fetch(`/api/reminders/${id}/snooze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ minutes }),
  });
  return res.json();
}

export async function completeReminder(id: string) {
  const res = await fetch(`/api/reminders/${id}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return res.json();
}

export async function deleteReminder(id: string) {
  const res = await fetch(`/api/reminders/${id}`, {
    method: 'DELETE',
  });
  return res.json();
}

export async function triggerTestPushNotification(message?: string) {
  const res = await fetch('/api/reminders/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return res.json();
}
