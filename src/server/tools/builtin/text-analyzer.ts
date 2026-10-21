import { z } from 'zod';
import type { OpenDotsToolDefinition } from '../types.js';

export const textAnalyzerTool: OpenDotsToolDefinition<
  { text: string },
  {
    words: number;
    characters: number;
    sentences: number;
    paragraphs: number;
    estimatedReadingTimeMinutes: number;
  }
> = {
  name: 'analyze_text',
  description:
    'Calculate word count, characters, sentences, paragraphs, and reading time for any text or document content.',
  parameters: z.object({
    text: z.string().min(1).max(50_000).describe('Text to analyze.'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 5000,
  execute: async ({ text }) => {
    const trimmed = text.trim();
    const characters = trimmed.length;
    const words = trimmed.match(/\b\w+\b/g)?.length ?? 0;
    const sentences = trimmed.split(/[.!?]+/).filter((s) => s.trim().length > 0).length || 1;
    const paragraphs = trimmed.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length || 1;
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
