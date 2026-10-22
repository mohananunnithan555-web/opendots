import webpush from 'web-push';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { WebPushSubscription } from '../../shared/types.js';

const VAPID_CACHE_FILE = 'data/vapid-keys.json';

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

export class PushNotificationService {
  private vapidKeys: VapidKeys;
  private isConfigured = false;

  constructor() {
    this.vapidKeys = this.initializeVapidKeys();
    this.configureWebPush();
  }

  private initializeVapidKeys(): VapidKeys {
    // 1. Check environment variables
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      return {
        publicKey: process.env.VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY,
      };
    }

    // 2. Check local persistent file
    try {
      if (existsSync(VAPID_CACHE_FILE)) {
        const raw = readFileSync(VAPID_CACHE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.publicKey && parsed.privateKey) {
          return parsed;
        }
      }
    } catch {
      // Fallback to generation
    }

    // 3. Auto-generate persistent VAPID keys (₹0 cost, zero setup required)
    const generated = webpush.generateVAPIDKeys();
    try {
      mkdirSync(dirname(VAPID_CACHE_FILE), { recursive: true });
      writeFileSync(VAPID_CACHE_FILE, JSON.stringify(generated, null, 2), 'utf-8');
    } catch (e) {
      // Ignore write errors in read-only sandbox
    }

    return generated;
  }

  private configureWebPush() {
    try {
      const subject = process.env.VAPID_SUBJECT || 'mailto:opendots-reminders@opendots.local';
      webpush.setVapidDetails(subject, this.vapidKeys.publicKey, this.vapidKeys.privateKey);
      this.isConfigured = true;
    } catch (err) {
      console.error('Failed to configure webpush VAPID details:', err);
    }
  }

  getPublicKey(): string {
    return this.vapidKeys.publicKey;
  }

  async sendPushNotification(
    sub: WebPushSubscription,
    payload: {
      title: string;
      body: string;
      tag?: string;
      icon?: string;
      badge?: string;
      data?: Record<string, unknown>;
    },
  ): Promise<{ success: boolean; expired?: boolean; error?: string }> {
    if (!this.isConfigured) {
      return { success: false, error: 'WebPush not configured' };
    }

    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
    };

    try {
      await webpush.sendNotification(pushSubscription, JSON.stringify(payload), {
        TTL: 60 * 60 * 24, // 24 hours
        urgency: 'high',
      });
      return { success: true };
    } catch (err: any) {
      const statusCode = err?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        return { success: false, expired: true, error: 'Subscription expired or unsubscribed' };
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async sendToAll(
    subscriptions: WebPushSubscription[],
    payload: {
      title: string;
      body: string;
      tag?: string;
      icon?: string;
      badge?: string;
      data?: Record<string, unknown>;
    },
    onPrune?: (endpoint: string) => void,
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    await Promise.all(
      subscriptions.map(async (sub) => {
        const res = await this.sendPushNotification(sub, payload);
        if (res.success) {
          sent++;
        } else {
          failed++;
          if (res.expired && onPrune) {
            onPrune(sub.endpoint);
          }
        }
      }),
    );

    return { sent, failed };
  }
}

export const globalPushService = new PushNotificationService();
