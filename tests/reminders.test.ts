import { describe, expect, it, beforeEach } from 'vitest';
import { Store } from '../src/server/store.js';
import {
  parseNaturalLanguageReminder,
  PushNotificationService,
  ReminderService,
  initializeReminderTools,
  createReminderTool,
  listRemindersTool,
  cancelReminderTool,
  snoozeReminderTool,
} from '../src/server/reminders/index.js';
import { globalToolRegistry } from '../src/server/tools/tool-registry.js';
import fs from 'node:fs';

const TEST_DB = 'data/test-reminders.sqlite';

describe('Website-Only Smart Reminder System', () => {
  let store: Store;

  beforeEach(() => {
    if (fs.existsSync(TEST_DB)) {
      try {
        fs.unlinkSync(TEST_DB);
      } catch {}
    }
    store = new Store(TEST_DB);
    initializeReminderTools(store);
  });

  describe('Natural Language Reminder Parser (IST Timezone)', () => {
    it('parses relative offset: "Remind me in 30 minutes to drink water"', () => {
      const parsed = parseNaturalLanguageReminder('Remind me in 30 minutes to drink water', 'Asia/Kolkata');
      expect(parsed.intent).toBe('create');
      expect(parsed.title.toLowerCase()).toContain('drink water');
      expect(parsed.dueAt).not.toBeNull();
      const diffMinutes = Math.round(((parsed.dueAt || 0) - Date.now()) / 60000);
      expect(diffMinutes).toBeGreaterThanOrEqual(29);
      expect(diffMinutes).toBeLessThanOrEqual(31);
    });

    it('parses specific time: "Remind me tomorrow at 7 AM to study"', () => {
      const parsed = parseNaturalLanguageReminder('Remind me tomorrow at 7 AM to study', 'Asia/Kolkata');
      expect(parsed.intent).toBe('create');
      expect(parsed.title.toLowerCase()).toContain('study');
      expect(parsed.dueAt).not.toBeNull();
      expect(parsed.formattedDue).toContain('IST');
      expect(parsed.formattedDue).toContain('7:00 AM');
    });

    it('parses recurring daily: "Remind me every day at 6 AM"', () => {
      const parsed = parseNaturalLanguageReminder('Remind me every day at 6 AM', 'Asia/Kolkata');
      expect(parsed.intent).toBe('create');
      expect(parsed.recurrence).not.toBeNull();
      const recType = typeof parsed.recurrence === 'string' ? parsed.recurrence : parsed.recurrence.type;
      const recTime = typeof parsed.recurrence === 'object' ? parsed.recurrence.timeOfDay : '06:00';
      expect(recType).toBe('daily');
      expect(recTime).toBe('06:00');
    });

    it('parses recurring weekdays: "Remind me every weekday at 9:30 AM to check standup"', () => {
      const parsed = parseNaturalLanguageReminder('Remind me every weekday at 9:30 AM to check standup', 'Asia/Kolkata');
      expect(parsed.intent).toBe('create');
      expect(parsed.title.toLowerCase()).toContain('check standup');
      const recType = typeof parsed.recurrence === 'string' ? parsed.recurrence : parsed.recurrence.type;
      const recTime = typeof parsed.recurrence === 'object' ? parsed.recurrence.timeOfDay : '09:30';
      expect(recType).toBe('weekdays');
      expect(recTime).toBe('09:30');
    });

    it('handles unknown future event: "Remind me at 4 PM on the day the iPhone 18 base model releases"', () => {
      const parsed = parseNaturalLanguageReminder('Remind me at 4 PM on the day the iPhone 18 base model releases', 'Asia/Kolkata');
      expect(parsed.isEventMonitoring).toBe(true);
      expect(parsed.targetEvent?.toLowerCase()).toContain('iphone 18');
      // Must NOT invent a fictitious date!
      expect(parsed.dueAt).toBeNull();
    });

    it('parses cancellation: "Cancel my science reminder"', () => {
      const parsed = parseNaturalLanguageReminder('Cancel my science reminder', 'Asia/Kolkata');
      expect(parsed.intent).toBe('cancel');
      expect(parsed.title.toLowerCase()).toContain('science');
    });

    it('requests clarification when date/time is unclear', () => {
      const parsed = parseNaturalLanguageReminder('Remind me to finish the quarterly audit', 'Asia/Kolkata');
      expect(parsed.clarificationQuestion).not.toBeNull();
      expect(parsed.dueAt).toBeNull();
    });
  });

  describe('Database Persistence & Lifecycle', () => {
    it('creates, retrieves, and lists reminders', () => {
      const rem = store.createReminder({
        userId: 'test-user',
        title: 'Submit project report',
        dueAt: Date.now() + 3600000,
        timezone: 'Asia/Kolkata',
      });

      expect(rem.id).toBeDefined();
      expect(rem.title).toBe('Submit project report');
      expect(rem.status).toBe('pending');

      const fetched = store.getReminder(rem.id);
      expect(fetched?.title).toBe('Submit project report');

      const all = store.reminders({ status: 'pending' });
      expect(all.length).toBe(1);
    });

    it('retrieves due reminders correctly with epoch cutoff', () => {
      const now = Date.now();
      // Past due
      store.createReminder({
        userId: 'test-user',
        title: 'Past reminder',
        dueAt: now - 5000,
      });
      // Future
      store.createReminder({
        userId: 'test-user',
        title: 'Future reminder',
        dueAt: now + 50000,
      });

      const due = store.dueReminders(now);
      expect(due.length).toBe(1);
      expect(due[0].title).toBe('Past reminder');
    });

    it('snoozes a reminder by extending dueAt', () => {
      const now = Date.now();
      const rem = store.createReminder({
        userId: 'test-user',
        title: 'Take medication',
        dueAt: now,
      });

      const snoozed = store.snoozeReminder(rem.id, 15);
      expect(snoozed?.status).toBe('snoozed');
      expect((snoozed?.dueAt ?? snoozed?.scheduledAt)).toBeGreaterThanOrEqual(now + 14 * 60000);
    });

    it('completes and deletes reminders', () => {
      const rem = store.createReminder({
        userId: 'test-user',
        title: 'Clean room',
        dueAt: Date.now() + 10000,
      });

      const completed = store.updateReminder(rem.id, { status: 'completed' });
      expect(completed?.status).toBe('completed');

      const deleted = store.deleteReminder(rem.id);
      expect(deleted).toBe(true);
      expect(store.getReminder(rem.id)).toBeUndefined();
    });

    it('persists and deletes Web Push subscriptions', () => {
      const sub = store.savePushSubscription({
        ownerId: 'test-user',
        userId: 'test-user',
        endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB...',
        keys: {
          auth: 'auth-secret-token',
          p256dh: 'p256dh-public-key',
        },
        userAgent: 'Mozilla/5.0 (Android; Mobile)',
      });

      expect(sub.endpoint).toContain('mozilla.com');
      const allSubs = store.pushSubscriptions();
      expect(allSubs.length).toBe(1);

      const deleted = store.deletePushSubscription(sub.endpoint);
      expect(deleted).toBe(true);
      expect(store.pushSubscriptions().length).toBe(0);
    });
  });

  describe('Web Push Service & VAPID Key Zero-Config', () => {
    it('initializes VAPID keypair automatically and returns public key', () => {
      const pushService = new PushNotificationService();
      const publicKey = pushService.getPublicKey();
      expect(publicKey).toBeDefined();
      expect(typeof publicKey).toBe('string');
      expect(publicKey.length).toBeGreaterThan(20);
    });
  });

  describe('AI Tools & Global Registry Integration', () => {
    it('verifies reminder tools are registered in globalToolRegistry', () => {
      expect(globalToolRegistry.has('create_reminder')).toBe(true);
      expect(globalToolRegistry.has('list_reminders')).toBe(true);
      expect(globalToolRegistry.has('cancel_reminder')).toBe(true);
      expect(globalToolRegistry.has('snooze_reminder')).toBe(true);
    });

    it('executes create_reminder tool via natural language prompt', async () => {
      const res = await createReminderTool.execute(
        { prompt: 'Remind me tomorrow at 7 AM to study physics' },
        { userId: 'test-user' },
      );

      expect(res.success).toBe(true);
      expect(res.data?.reminder?.title).toContain('study physics');
      expect(res.data?.formattedDue).toContain('IST');
    });

    it('executes list_reminders tool', async () => {
      store.createReminder({
        userId: 'test-user',
        title: 'Meeting with team',
        dueAt: Date.now() + 100000,
      });

      const res = await listRemindersTool.execute({ status: 'pending' }, { userId: 'test-user' });
      expect(res.success).toBe(true);
      expect(res.data?.count).toBeGreaterThanOrEqual(1);
    });

    it('executes cancel_reminder tool', async () => {
      const rem = store.createReminder({
        userId: 'test-user',
        title: 'Biology exam prep',
        dueAt: Date.now() + 100000,
      });

      const res = await cancelReminderTool.execute({ reminderId: rem.id }, { userId: 'test-user' });
      expect(res.success).toBe(true);
      expect(store.getReminder(rem.id)?.status).toBe('cancelled');
    });
  });
});
