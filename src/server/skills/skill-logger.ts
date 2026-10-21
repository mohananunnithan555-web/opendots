import type { SkillLogEntry } from './types.js';

// Common secret patterns to redact from logs
const SECRET_PATTERNS = [
  /sk_[a-zA-Z0-9_\-]{16,}/gi,
  /pk_[a-zA-Z0-9_\-]{16,}/gi,
  /Bearer\s+[a-zA-Z0-9_\-\.]{16,}/gi,
  /(?:api[_-]?key|token|secret|password|auth)[=:\s]+["']?([a-zA-Z0-9_\-\.]{8,})["']?/gi,
  /AIza[0-9A-Za-z-_]{30,}/g, // Google API keys
];

export function redactSecrets(text: string): string {
  if (!text) return text;
  let redacted = text;

  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, (match) => {
      if (match.startsWith('Bearer ')) {
        return 'Bearer [REDACTED_TOKEN]';
      }
      if (match.includes('=') || match.includes(':')) {
        const [prefix] = match.split(/[=:]/);
        return `${prefix}=[REDACTED]`;
      }
      return '[REDACTED_SECRET]';
    });
  }

  return redacted;
}

export class SkillLogger {
  private entries: SkillLogEntry[] = [];

  info(message: string): void {
    this.addEntry('info', message);
  }

  warn(message: string): void {
    this.addEntry('warn', message);
  }

  error(message: string): void {
    this.addEntry('error', message);
  }

  private addEntry(level: SkillLogEntry['level'], message: string): void {
    this.entries.push({
      timestamp: Date.now(),
      level,
      message: redactSecrets(message),
    });
  }

  getLogs(): SkillLogEntry[] {
    return [...this.entries];
  }
}
