import type { Store } from '../store.js';
import type { Reminder } from '../../shared/types.js';
import { globalPushService } from './push-service.js';
import { computeNextRecurrenceEpoch, parseTimeString } from './nlp-parser.js';

export class ReminderService {
  private timer?: ReturnType<typeof setInterval>;
  private isTicking = false;

  constructor(private store: Store) {}

  start() {
    if (!this.timer) {
      // Poll every 5 seconds
      this.timer = setInterval(() => void this.tick(), 5000);
      void this.tick();
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  getPushService() {
    return globalPushService;
  }

  async triggerDueReminders(): Promise<number> {
    const res = await this.tick();
    return res.processedCount;
  }

  async tick(): Promise<{ processedCount: number; errors: string[] }> {
    if (this.isTicking) return { processedCount: 0, errors: [] };
    this.isTicking = true;

    const errors: string[] = [];
    let processedCount = 0;

    try {
      const now = Date.now();
      const due = this.store.dueReminders(now);

      for (const reminder of due) {
        try {
          await this.processDueReminder(reminder, now);
          processedCount++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Failed to trigger reminder ${reminder.id}: ${msg}`);
          this.store.updateReminder(reminder.id, { failureReason: msg });
        }
      }

      // Check event monitoring reminders that need periodic inspection
      await this.checkEventMonitoringReminders(now);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Reminder tick failed: ${msg}`);
    } finally {
      this.isTicking = false;
    }

    return { processedCount, errors };
  }

  private async processDueReminder(reminder: Reminder, now = Date.now()) {
    const notificationBody =
      reminder.message || `Reminder, sir. Your task is to ${reminder.title}.`;

    // 1. In-App Notification
    this.store.createNotification({
      ownerId: reminder.ownerId,
      type: 'reminder',
      title: 'OpenDots Reminder',
      message: notificationBody,
      priority: 'high',
      targetId: reminder.id,
      targetUrl: '/#reminders',
      metadata: {
        reminderId: reminder.id,
        title: reminder.title,
        spokenText: notificationBody,
      },
    });

    // 2. Web Push Notification to all subscribed devices
    const subs = this.store.pushSubscriptions(reminder.ownerId);
    if (subs.length > 0) {
      await globalPushService.sendToAll(
        subs,
        {
          title: 'OpenDots Reminder',
          body: notificationBody,
          tag: `reminder-${reminder.id}`,
          icon: '/favicon.svg',
          badge: '/favicon.svg',
          data: {
            reminderId: reminder.id,
            url: '/#reminders',
            spokenText: notificationBody,
          },
        },
        (expiredEndpoint) => {
          this.store.deletePushSubscription(expiredEndpoint, reminder.ownerId);
        },
      );
    }

    // 3. Handle Recurrence or Completion
    if (reminder.recurrence && reminder.recurrence !== 'none') {
      const parsed = parseTimeString(reminder.recurrenceRule || '6:00 AM');
      const nextTime = computeNextRecurrenceEpoch(
        reminder.recurrence,
        parsed.hours,
        parsed.minutes,
        now,
      );
      this.store.markReminderTriggered(reminder.id, nextTime, reminder.ownerId);
    } else {
      this.store.markReminderTriggered(reminder.id, undefined, reminder.ownerId);
    }
  }

  private async checkEventMonitoringReminders(now: number) {
    try {
      const monitoringReminders = this.store
        .reminders('opendots-owner', 'monitoring')
        .concat(
          this.store
            .reminders('opendots-owner')
            .filter((r) => r.isEventMonitoring && r.status === 'scheduled'),
        );

      for (const rem of monitoringReminders) {
        // Run check once every 6 hours or if past check time
        if (!rem.lastTriggeredAt || now - rem.lastTriggeredAt > 6 * 60 * 60 * 1000) {
          // Never invent a date. For now mark checked timestamp
          this.store.updateReminder(rem.id, {
            lastTriggeredAt: now,
            failureReason: undefined,
          });
        }
      }
    } catch {
      // Event monitoring failure should never crash the scheduler
    }
  }

  async sendTestNotification(ownerId = 'opendots-owner'): Promise<{
    inAppCreated: boolean;
    pushSent: number;
    pushFailed: number;
  }> {
    const testBody = 'Reminder, sir. Your task is to study science.';

    // 1. Create In-App Notification
    this.store.createNotification({
      ownerId,
      type: 'reminder',
      title: 'OpenDots Notification Test',
      message: testBody,
      priority: 'high',
      targetUrl: '/#reminders',
      metadata: {
        spokenText: testBody,
        isTest: true,
      },
    });

    // 2. Dispatch Web Push to subscriptions
    const subs = this.store.pushSubscriptions(ownerId);
    const { sent, failed } = await globalPushService.sendToAll(
      subs,
      {
        title: 'OpenDots Notification Test',
        body: testBody,
        tag: 'opendots-test-push',
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        data: {
          url: '/#reminders',
          spokenText: testBody,
        },
      },
      (expiredEndpoint) => {
        this.store.deletePushSubscription(expiredEndpoint, ownerId);
      },
    );

    return {
      inAppCreated: true,
      pushSent: sent,
      pushFailed: failed,
    };
  }
}
