import { z } from 'zod';
import type { SkillDefinition } from '../types.js';

export const textStatsSkill: SkillDefinition<
  { text: string },
  {
    words: number;
    characters: number;
    sentences: number;
    paragraphs: number;
    estimatedReadingTimeMinutes: number;
  }
> = {
  metadata: {
    id: 'text-stats',
    name: 'Text & Readability Analyzer',
    description:
      'Analyze length, word count, character count, sentence count, paragraphs, and estimated reading time for any text document or essay.',
    version: '1.0.0',
    category: 'analysis',
    requiredPermissions: ['basic'],
    tags: ['text', 'words', 'statistics', 'analysis'],
    author: 'OpenDots Core',
  },
  inputSchema: z.object({
    text: z.string().min(1).max(50_000).describe('Text to analyze'),
  }),
  outputSchema: z.object({
    words: z.number(),
    characters: z.number(),
    sentences: z.number(),
    paragraphs: z.number(),
    estimatedReadingTimeMinutes: z.number(),
  }),
  timeoutMs: 5000,
  execute: async ({ text }) => {
    const trimmed = text.trim();
    const characters = trimmed.length;

    const words = trimmed.match(/\b\w+\b/g)?.length ?? 0;
    const sentences = trimmed.split(/[.!?]+/).filter((s) => s.trim().length > 0).length || 1;
    const paragraphs = trimmed.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length || 1;

    // Standard reading speed: ~200 words per minute
    const estimatedReadingTimeMinutes = Number((words / 200).toFixed(2));

    return {
      words,
      characters,
      sentences,
      paragraphs,
      estimatedReadingTimeMinutes,
    };
  },
};
