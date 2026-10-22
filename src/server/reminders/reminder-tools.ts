import { z } from 'zod';
import type { OpenDotsToolDefinition } from '../tools/types.js';
import type { Store } from '../store.js';
import type { Reminder, ReminderRecurrence } from '../../shared/types.js';
import { parseNaturalLanguageReminder } from './nlp-parser.js';

let sharedStore: Store | undefined;

export function initializeReminderTools(store: Store) {
  sharedStore = store;
}

function getStore(): Store {
  if (!sharedStore) {
    throw new Error('Reminder tools store not initialized.');
  }
  return sharedStore;
}

/**
 * Format epoch ms into a human-readable Asia/Kolkata (IST) string.
 */
function formatKolkataDate(epochMs: number): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(epochMs));
  } catch {
    return new Date(epochMs).toLocaleString();
  }
}

/**
 * Tool: create_reminder
 */
export const createReminderTool: OpenDotsToolDefinition<
  {
    text?: string;
    prompt?: string;
    title?: string;
    scheduledAt?: number;
    timeDescription?: string;
    recurrence?: 'none' | 'daily' | 'weekdays' | 'weekly';
    isEventMonitoring?: boolean;
    eventQuery?: string;
  },
  any
> = {
  name: 'create_reminder',
  description:
    'Create or schedule a smart reminder with persistent database storage, website push notification, and spoken announcement in Asia/Kolkata timezone. Understands natural language like "tomorrow at 7 AM to study", "in 30 minutes", "every day at 6 AM", or future event monitoring.',
  parameters: z.object({
    text: z.string().optional().describe('Full natural language command (e.g. "Remind me tomorrow at 7 AM to study science")'),
    prompt: z.string().optional().describe('Alternative prompt command string'),
    title: z.string().optional().describe('Task or topic to be reminded about (e.g. "study science")'),
    scheduledAt: z.number().optional().describe('Epoch timestamp in milliseconds for when to trigger'),
    timeDescription: z.string().optional().describe('Natural language time (e.g. "tomorrow at 7 AM", "in 30 minutes")'),
    recurrence: z.enum(['none', 'daily', 'weekdays', 'weekly']).optional().describe('Recurrence pattern if repeating'),
    isEventMonitoring: z.boolean().optional().describe('Set to true for unknown future release dates (e.g. iPhone 18)'),
    eventQuery: z.string().optional().describe('Topic or event to monitor'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 15_000,
  isPaidService: false,
  costEstimateUsd: 0,
  execute: async ({ text, prompt, title, scheduledAt, timeDescription, recurrence, isEventMonitoring, eventQuery }, ctx) => {
    const store = getStore();
    const ownerId = ctx.userId || 'opendots-owner';
    const rawInput = (text || prompt || '').trim();

    // If full text provided, parse with natural language parser
    if (rawInput) {
      const parsed = parseNaturalLanguageReminder(rawInput);

      if (parsed.action === 'clarify') {
        const res = {
          success: false,
          needsClarification: true,
          message: parsed.clarificationPrompt || 'When would you like me to set this reminder for in Asia/Kolkata (IST)?',
        };
        return { ...res, data: res };
      }

      if (parsed.action === 'cancel' && (parsed.cancelQuery || parsed.title)) {
        const targetQ = parsed.cancelQuery || parsed.title;
        const found = store.reminders(ownerId).find((r) =>
          r.status === 'scheduled' && r.title.toLowerCase().includes(targetQ.toLowerCase()),
        );
        if (found) {
          store.updateReminder(found.id, { status: 'cancelled', cancelledAt: Date.now() }, ownerId);
          const res = {
            success: true,
            message: `Cancelled reminder: "${found.title}".`,
          };
          return { ...res, data: res };
        }
        const res = {
          success: false,
          message: `Could not find an active reminder matching "${targetQ}".`,
        };
        return { ...res, data: res };
      }

      const rem = store.createReminder({
        ownerId,
        title: parsed.title,
        message: parsed.message,
        scheduledAt: parsed.scheduledAt ?? (parsed.isEventMonitoring ? null : Date.now() + 30 * 60 * 1000),
        originalScheduledAt: parsed.scheduledAt ?? (parsed.isEventMonitoring ? null : Date.now() + 30 * 60 * 1000),
        timezone: 'Asia/Kolkata',
        recurrence: parsed.recurrence,
        recurrenceRule: parsed.recurrenceRule,
        status: parsed.isEventMonitoring ? 'event_monitoring' : 'pending',
        isEventMonitoring: parsed.isEventMonitoring,
        eventQuery: parsed.eventQuery,
        eventTargetTimeStr: parsed.eventTargetTimeStr,
        deliveryChannels: ['push', 'in_app', 'speech'],
      });

      const formattedDue = rem.scheduledAt ? formatKolkataDate(rem.scheduledAt) + ' (IST)' : 'Event Monitoring';
      const res = {
        success: true,
        reminder: rem,
        formattedDue,
        formattedTime: formatKolkataDate(rem.scheduledAt),
        message: rem.isEventMonitoring
          ? `I've set up an event monitoring reminder for "${rem.title}". I'll monitor official announcements and alert you at ${rem.eventTargetTimeStr || '9:00 AM'} on release day.`
          : `Reminder scheduled for ${formatKolkataDate(rem.scheduledAt)} (IST): "${rem.title}". You will receive a website push notification and spoken alert.`,
      };
      return { ...res, data: res };
    }

    // Direct parameter creation
    if (!title) {
      return {
        success: false,
        needsClarification: true,
        message: 'Please provide what you want to be reminded about.',
      };
    }

    let targetEpoch = scheduledAt;
    if (!targetEpoch && timeDescription) {
      const parsedTime = parseNaturalLanguageReminder(`remind me ${timeDescription} to ${title}`);
      targetEpoch = parsedTime.scheduledAt;
    }

    if (!targetEpoch && !isEventMonitoring) {
      return {
        success: false,
        needsClarification: true,
        message: `What date and time would you like to be reminded for "${title}" in Asia/Kolkata (IST)?`,
      };
    }

    const rem = store.createReminder({
      ownerId,
      title,
      message: `Reminder, sir. Your task is to ${title}.`,
      scheduledAt: targetEpoch || Date.now() + 60 * 60 * 1000,
      originalScheduledAt: targetEpoch || Date.now() + 60 * 60 * 1000,
      timezone: 'Asia/Kolkata',
      recurrence: recurrence || 'none',
      status: isEventMonitoring ? 'monitoring' : 'scheduled',
      isEventMonitoring: Boolean(isEventMonitoring),
      eventQuery: eventQuery || (isEventMonitoring ? `${title} release date` : undefined),
      deliveryChannels: ['push', 'in_app', 'speech'],
    });

    return {
      success: true,
      reminder: rem,
      formattedTime: formatKolkataDate(rem.scheduledAt),
      message: `Reminder saved for ${formatKolkataDate(rem.scheduledAt)} (IST): "${rem.title}".`,
    };
  },
};

/**
 * Tool: list_reminders
 */
export const listRemindersTool: OpenDotsToolDefinition<
  {
    status?: string;
  },
  any
> = {
  name: 'list_reminders',
  description: 'List current scheduled, recurring, event-monitoring, or completed reminders.',
  parameters: z.object({
    status: z.string().optional().describe('Filter by reminder status (e.g. "pending", "upcoming", "completed", "monitoring", "all")'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 10_000,
  isPaidService: false,
  costEstimateUsd: 0,
  execute: async ({ status }, ctx) => {
    const store = getStore();
    const ownerId = ctx.userId || 'opendots-owner';
    const all = store.reminders(ownerId);

    let filtered = all;
    if (status === 'upcoming' || status === 'pending') {
      filtered = all.filter((r) => r.status === 'scheduled' || r.status === 'snoozed' || r.status === 'pending');
    } else if (status === 'completed') {
      filtered = all.filter((r) => r.status === 'completed' || r.status === 'triggered');
    } else if (status === 'monitoring') {
      filtered = all.filter((r) => r.isEventMonitoring || r.status === 'event_monitoring');
    }

    const res = {
      success: true,
      count: filtered.length,
      reminders: filtered.map((r) => ({
        id: r.id,
        title: r.title,
        scheduledAtFormatted: formatKolkataDate(r.scheduledAt),
        status: r.status,
        recurrence: r.recurrence,
        isEventMonitoring: r.isEventMonitoring,
      })),
    };
    return { ...res, data: res };
  },
};

/**
 * Tool: cancel_reminder
 */
export const cancelReminderTool: OpenDotsToolDefinition<
  {
    reminderId?: string;
    query?: string;
  },
  any
> = {
  name: 'cancel_reminder',
  description: 'Cancel an upcoming reminder by ID or matching title/topic.',
  parameters: z.object({
    reminderId: z.string().optional().describe('Exact reminder ID to cancel'),
    query: z.string().optional().describe('Topic or title to search and cancel (e.g. "science")'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 10_000,
  isPaidService: false,
  costEstimateUsd: 0,
  execute: async ({ reminderId, query }, ctx) => {
    const store = getStore();
    const ownerId = ctx.userId || 'opendots-owner';

    if (reminderId) {
      const updated = store.updateReminder(
        reminderId,
        { status: 'cancelled', cancelledAt: Date.now() },
        ownerId,
      );
      if (updated) {
        const res = { success: true, message: `Reminder "${updated.title}" has been cancelled.` };
        return { ...res, data: res };
      }
      const res = { success: false, message: `Reminder with ID ${reminderId} not found.` };
      return { ...res, data: res };
    }

    if (query) {
      const active = store
        .reminders(ownerId)
        .find(
          (r) =>
            (r.status === 'scheduled' || r.status === 'snoozed' || r.status === 'pending' || r.status === 'event_monitoring') &&
            r.title.toLowerCase().includes(query.toLowerCase()),
        );

      if (active) {
        store.updateReminder(
          active.id,
          { status: 'cancelled', cancelledAt: Date.now() },
          ownerId,
        );
        const res = { success: true, message: `Cancelled reminder: "${active.title}".` };
        return { ...res, data: res };
      }
      const res = { success: false, message: `No active reminder found matching "${query}".` };
      return { ...res, data: res };
    }

    const res = { success: false, message: 'Please specify the reminder ID or topic to cancel.' };
    return { ...res, data: res };
  },
};

/**
 * Tool: snooze_reminder
 */
export const snoozeReminderTool: OpenDotsToolDefinition<
  {
    reminderId?: string;
    minutes?: number;
  },
  {
    success: boolean;
    snoozedUntilFormatted?: string;
    message: string;
  }
> = {
  name: 'snooze_reminder',
  description: 'Snooze an active or triggered reminder for a specified number of minutes (default: 15 minutes).',
  parameters: z.object({
    reminderId: z.string().optional().describe('Reminder ID to snooze (snoozes the latest triggered reminder if omitted)'),
    minutes: z.number().int().min(1).max(1440).optional().describe('Number of minutes to snooze (default: 15)'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 10_000,
  isPaidService: false,
  costEstimateUsd: 0,
  execute: async ({ reminderId, minutes = 15 }, ctx) => {
    const store = getStore();
    const ownerId = ctx.userId || 'opendots-owner';

    let targetId = reminderId;
    if (!targetId) {
      const recent = store
        .reminders(ownerId)
        .filter((r) => r.status === 'triggered' || r.status === 'scheduled')
        .sort((a, b) => (b.lastTriggeredAt || b.scheduledAt) - (a.lastTriggeredAt || a.scheduledAt))[0];
      targetId = recent?.id;
    }

    if (!targetId) {
      return { success: false, message: 'No reminder found to snooze.' };
    }

    const snoozed = store.snoozeReminder(targetId, minutes, ownerId);
    if (snoozed) {
      const formatted = formatKolkataDate(snoozed.scheduledAt);
      return {
        success: true,
        snoozedUntilFormatted: formatted,
        message: `Snoozed reminder "${snoozed.title}" for ${minutes} minutes (until ${formatted} IST).`,
      };
    }

    return { success: false, message: `Could not snooze reminder.` };
  },
};
