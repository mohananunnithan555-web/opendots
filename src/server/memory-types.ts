import { z } from 'zod';
import { redactSecrets } from './skills/skill-logger.js';

export const MemoryCategorySchema = z.enum([
  'preference',
  'project',
  'conversation_summary',
  'task_context',
  'responsibility',
  'decision',
  'lesson',
]);

export type MemoryCategory = z.infer<typeof MemoryCategorySchema>;

export interface MemoryRecord {
  id: string;
  ownerId: string;
  category: MemoryCategory;
  text: string;
  confidence: number;
  pinned: boolean;
  source: 'user_explicit' | 'agent_inferred';
  projectId?: string;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt?: number;
}

export interface MemoryFilter {
  category?: MemoryCategory;
  query?: string;
  limit?: number;
  pinnedOnly?: boolean;
  projectId?: string;
}

/**
 * Checks whether text might contain sensitive secrets that should never be memorized.
 */
export function containsSensitiveSecret(text: string): boolean {
  const secretDetectors = [
    /sk_[a-zA-Z0-9_\-]{16,}/i,
    /pk_[a-zA-Z0-9_\-]{16,}/i,
    /Bearer\s+[a-zA-Z0-9_\-\.]{16,}/i,
    /(?:password|passwd|pin)\s*(?:is|[:=])\s*\S+/i,
    /(?:api[_-]?key|secret|token)\s*(?:is|[:=])\s*\S+/i,
    /AIza[0-9A-Za-z-_]{35}/,
    /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/, // Credit card regex
  ];

  return secretDetectors.some((pattern) => pattern.test(text));
}

/**
 * Cleans memory text and redacts sensitive information.
 */
export function sanitizeMemoryContent(text: string): string {
  const trimmed = text.trim();
  return redactSecrets(trimmed);
}
