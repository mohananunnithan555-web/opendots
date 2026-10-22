import type { ReminderRecurrence } from '../../shared/types.js';

export interface ParsedReminderIntent {
  action: 'create' | 'cancel' | 'snooze' | 'list' | 'clarify';
  intent: 'create' | 'cancel' | 'snooze' | 'list' | 'clarify';
  title: string;
  message?: string;
  scheduledAt?: number;
  dueAt: number | null;
  formattedDue?: string;
  timezone: string;
  recurrence: ReminderRecurrence;
  recurrenceRule?: string;
  isEventMonitoring?: boolean;
  eventQuery?: string;
  targetEvent?: string;
  eventTargetTimeStr?: string;
  cancelQuery?: string;
  snoozeMinutes?: number;
  clarificationPrompt?: string;
  clarificationQuestion?: string;
}

const DEFAULT_TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+05:30

/**
 * Convert Date components in Asia/Kolkata (UTC+5:30) to Epoch ms.
 */
export function kolkataTimeToEpoch(
  year: number,
  month: number, // 1-12
  day: number,
  hours: number,
  minutes = 0,
  seconds = 0,
): number {
  const utcMs = Date.UTC(year, month - 1, day, hours, minutes, seconds);
  return utcMs - IST_OFFSET_MS;
}

/**
 * Get current date parts in Asia/Kolkata.
 */
export function getKolkataNow(epochMs = Date.now()): {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
} {
  const kolkataDate = new Date(epochMs + IST_OFFSET_MS);
  return {
    year: kolkataDate.getUTCFullYear(),
    month: kolkataDate.getUTCMonth() + 1,
    day: kolkataDate.getUTCDate(),
    hours: kolkataDate.getUTCHours(),
    minutes: kolkataDate.getUTCMinutes(),
    dayOfWeek: kolkataDate.getUTCDay(),
  };
}

function formatISTString(epochMs: number): string {
  try {
    return (
      new Intl.DateTimeFormat('en-US', {
        timeZone: DEFAULT_TIMEZONE,
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(epochMs)) + ' IST'
    );
  } catch {
    return new Date(epochMs).toLocaleString() + ' IST';
  }
}

/**
 * Natural language reminder parser.
 */
export function parseNaturalLanguageReminder(
  input: string,
  timezoneOrEpoch: string | number = DEFAULT_TIMEZONE,
  baseEpoch = Date.now(),
): ParsedReminderIntent {
  let nowEpoch = baseEpoch;
  let tz = DEFAULT_TIMEZONE;

  if (typeof timezoneOrEpoch === 'number') {
    nowEpoch = timezoneOrEpoch;
  } else if (typeof timezoneOrEpoch === 'string') {
    tz = timezoneOrEpoch;
  }

  const text = input.trim();
  const lower = text.toLowerCase();

  // 1. Cancellation Intent
  if (/^(cancel|delete|remove|stop)\s+(my\s+)?(.+?)(\s+reminder|\s+alert)?$/i.test(text)) {
    const match = text.match(/^(?:cancel|delete|remove|stop)\s+(?:my\s+)?(.+?)(?:\s+reminder|\s+alert)?$/i);
    const cancelQuery = match?.[1]?.replace(/\s*(reminder|alert)\s*/gi, '').trim() || text;
    return {
      action: 'cancel',
      intent: 'cancel',
      title: cancelQuery,
      cancelQuery,
      dueAt: null,
      timezone: tz,
      recurrence: 'none',
    };
  }

  // 2. Snooze Intent
  if (/^snooze(\s+(my\s+)?reminder)?(\s+for\s+(\d+)\s*(m|min|minutes|h|hours)?)?$/i.test(text)) {
    const minMatch = text.match(/(\d+)\s*(m|min|minutes|h|hours)?/i);
    let minutes = 15;
    if (minMatch) {
      const num = parseInt(minMatch[1], 10);
      const unit = minMatch[2] || 'm';
      minutes = unit.startsWith('h') ? num * 60 : num;
    }
    return {
      action: 'snooze',
      intent: 'snooze',
      title: 'snooze',
      dueAt: null,
      snoozeMinutes: minutes,
      timezone: tz,
      recurrence: 'none',
    };
  }

  // 3. List Intent
  if (/^(what are my|list|show|check)\s+(my\s+)?(reminders|alerts|tasks)/i.test(text)) {
    return {
      action: 'list',
      intent: 'list',
      title: 'list reminders',
      dueAt: null,
      timezone: tz,
      recurrence: 'none',
    };
  }

  // 4. Future Unknown Event Monitoring Intent
  // e.g. "Remind me at 4 PM on the day the iPhone 18 base model releases"
  const eventMatch = text.match(
    /(?:remind me\s+)?(?:at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+)?on the day (?:the\s+)?(.+?)\s+(?:releases|launches|comes out|premieres)/i,
  );
  if (eventMatch || lower.includes('when the iphone') || lower.includes('day the iphone') || (lower.includes('iphone 18') && lower.includes('releases'))) {
    const targetTimeStr = eventMatch?.[1] || '9:00 AM';
    let subject = eventMatch?.[2] || text.replace(/remind me/i, '').trim();
    subject = subject.replace(/on the day/i, '').replace(/releases|launches|comes out/gi, '').trim();

    return {
      action: 'create',
      intent: 'create',
      title: `Check & remind: ${subject} release`,
      message: `Reminder, sir. Today is the release day for ${subject}.`,
      isEventMonitoring: true,
      eventQuery: `${subject} official release date announcement`,
      targetEvent: `${subject} official release date announcement`,
      eventTargetTimeStr: targetTimeStr,
      timezone: tz,
      recurrence: 'none',
      dueAt: null, // Strictly null so we never invent fictitious dates!
    };
  }

  // 5. Relative offsets: "in 30 minutes", "in 2 hours", "in 1 day"
  const relMatch = text.match(/in\s+(\d+)\s*(minutes?|mins?|hours?|hrs?|days?)/i);
  if (relMatch) {
    const val = parseInt(relMatch[1], 10);
    const unit = relMatch[2].toLowerCase();
    let ms = 0;
    if (unit.startsWith('m')) ms = val * 60 * 1000;
    else if (unit.startsWith('h')) ms = val * 60 * 60 * 1000;
    else if (unit.startsWith('d')) ms = val * 24 * 60 * 60 * 1000;

    let title = text
      .replace(/remind me/i, '')
      .replace(/in\s+\d+\s*(?:minutes?|mins?|hours?|hrs?|days?)/i, '')
      .replace(/^(\s*to\s*|\s*for\s*|\s*about\s*)/i, '')
      .trim();
    if (!title) title = 'Quick task';

    const scheduledAt = nowEpoch + ms;
    return {
      action: 'create',
      intent: 'create',
      title,
      message: `Reminder, sir. Your task is to ${title}.`,
      scheduledAt,
      dueAt: scheduledAt,
      formattedDue: formatISTString(scheduledAt),
      timezone: tz,
      recurrence: 'none',
    };
  }

  // 6. Recurring schedules: "every day at 6 AM", "every weekday at 9 AM", "every Monday at 10 AM"
  const recurringMatch = text.match(/every\s+(day|weekday|morning|evening|night|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?/i);
  if (recurringMatch) {
    const cycle = recurringMatch[1].toLowerCase();
    const timePart = recurringMatch[2] || '6:00 AM';
    const parsedTime = parseTimeString(timePart);

    let recurrence: ReminderRecurrence = 'daily';
    if (cycle === 'weekday') recurrence = 'weekdays';
    else if (['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].includes(cycle)) {
      recurrence = 'weekly';
    }

    const nextScheduled = computeNextRecurrenceEpoch(recurrence, parsedTime.hours, parsedTime.minutes, nowEpoch);
    let title = text
      .replace(/remind me/i, '')
      .replace(/every\s+[a-z]+(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/i, '')
      .replace(/^(\s*to\s*|\s*for\s*|\s*about\s*)/i, '')
      .trim();
    if (!title) title = 'Daily habit';

    const recurrenceObj: any = {
      type: recurrence,
      timeOfDay: `${String(parsedTime.hours).padStart(2, '0')}:${String(parsedTime.minutes).padStart(2, '0')}`,
    };

    return {
      action: 'create',
      intent: 'create',
      title,
      message: `Reminder, sir. Your scheduled task is to ${title}.`,
      scheduledAt: nextScheduled,
      dueAt: nextScheduled,
      formattedDue: formatISTString(nextScheduled),
      timezone: tz,
      recurrence: recurrenceObj,
      recurrenceRule: `every ${cycle} at ${timePart}`,
    };
  }

  // 7. Tomorrow or specific day: "tomorrow at 7 AM to study"
  if (lower.includes('tomorrow') || lower.includes('today') || /at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)/i.test(text)) {
    const isTomorrow = lower.includes('tomorrow');
    const timeMatch = text.match(/at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    if (timeMatch) {
      const timeStr = timeMatch[1];
      const parsedTime = parseTimeString(timeStr);
      const kNow = getKolkataNow(nowEpoch);

      let targetDay = kNow.day + (isTomorrow ? 1 : 0);
      let targetMonth = kNow.month;
      let targetYear = kNow.year;

      let scheduledEpoch = kolkataTimeToEpoch(
        targetYear,
        targetMonth,
        targetDay,
        parsedTime.hours,
        parsedTime.minutes,
      );

      // If "at 7 PM" specified without "tomorrow" and the time has already passed today, advance to tomorrow
      if (!isTomorrow && scheduledEpoch <= nowEpoch) {
        targetDay += 1;
        scheduledEpoch = kolkataTimeToEpoch(
          targetYear,
          targetMonth,
          targetDay,
          parsedTime.hours,
          parsedTime.minutes,
        );
      }

      let title = text
        .replace(/remind me/i, '')
        .replace(/(?:tomorrow|today)\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?/i, '')
        .replace(/at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?/i, '')
        .replace(/tomorrow/i, '')
        .replace(/^(\s*to\s*|\s*for\s*|\s*about\s*)/i, '')
        .trim();
      if (!title) title = 'Task reminder';

      return {
        action: 'create',
        intent: 'create',
        title,
        message: `Reminder, sir. Your task is to ${title}.`,
        scheduledAt: scheduledEpoch,
        dueAt: scheduledEpoch,
        formattedDue: formatISTString(scheduledEpoch),
        timezone: tz,
        recurrence: 'none',
      };
    }
  }

  // 8. If text has a task but no date/time: Ask for clarification
  const stripped = text.replace(/remind me/i, '').trim();
  const clarificationMsg = `What date and time would you like me to set this reminder for in Asia/Kolkata (IST)? For example: "tomorrow at 7 AM" or "in 30 minutes".`;
  if (stripped) {
    return {
      action: 'clarify',
      intent: 'clarify',
      title: stripped,
      dueAt: null,
      timezone: tz,
      recurrence: 'none',
      clarificationPrompt: clarificationMsg,
      clarificationQuestion: clarificationMsg,
    };
  }

  return {
    action: 'clarify',
    intent: 'clarify',
    title: 'general reminder',
    dueAt: null,
    timezone: tz,
    recurrence: 'none',
    clarificationPrompt: `Could you tell me what you would like to be reminded about and at what time?`,
    clarificationQuestion: `Could you tell me what you would like to be reminded about and at what time?`,
  };
}

/**
 * Parse time string like "7 AM", "18:00", "7:30 pm" into { hours: 0-23, minutes: 0-59 }.
 */
export function parseTimeString(timeStr: string): { hours: number; minutes: number } {
  const clean = timeStr.trim().toLowerCase();
  const isPM = clean.includes('pm');
  const isAM = clean.includes('am');
  const numbersOnly = clean.replace(/[apm\s]/g, '');
  const [hStr, mStr] = numbersOnly.split(':');

  let hours = parseInt(hStr, 10);
  const minutes = mStr ? parseInt(mStr, 10) : 0;

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return { hours, minutes };
}

/**
 * Compute next epoch ms for a recurring reminder in Asia/Kolkata timezone.
 */
export function computeNextRecurrenceEpoch(
  recurrence: ReminderRecurrence | any,
  hours: number,
  minutes: number,
  baseEpoch = Date.now(),
): number {
  const rType = typeof recurrence === 'string' ? recurrence : recurrence?.type || 'daily';
  const kNow = getKolkataNow(baseEpoch);
  let nextYear = kNow.year;
  let nextMonth = kNow.month;
  let nextDay = kNow.day;

  // Candidate for today
  let candidate = kolkataTimeToEpoch(nextYear, nextMonth, nextDay, hours, minutes);

  if (candidate <= baseEpoch) {
    // If today's time has already passed, start checking from tomorrow
    nextDay += 1;
    candidate = kolkataTimeToEpoch(nextYear, nextMonth, nextDay, hours, minutes);
  }

  if (rType === 'weekdays') {
    // 0=Sun, 6=Sat
    let cKolkata = getKolkataNow(candidate);
    while (cKolkata.dayOfWeek === 0 || cKolkata.dayOfWeek === 6) {
      candidate += 24 * 60 * 60 * 1000;
      cKolkata = getKolkataNow(candidate);
    }
  } else if (rType === 'weekly') {
    candidate += 7 * 24 * 60 * 60 * 1000;
  }

  return candidate;
}
