import { defineTool } from '@copilotkit/runtime/v2';
import { z } from 'zod';
import { globalResearchEngine } from './deep-research-engine.js';
import type { OpenDotsToolDefinition } from '../tools/types.js';

export const deepResearchTool: OpenDotsToolDefinition<
  { query: string; maxSources?: number },
  {
    summary: string;
    keyFindings: string[];
    citations: Array<{ index: number; title: string; url: string }>;
    markdownReport: string;
  }
> = {
  name: 'deep_research',
  description:
    'Perform deep multi-source web research on any topic or query. Cross-references sources, extracts factual citations [1], identifies uncertainties, and synthesizes a structured Markdown research report with verified clickable links.',
  parameters: z.object({
    query: z
      .string()
      .min(1)
      .max(1000)
      .describe('The research query, question, or comparison to investigate.'),
    maxSources: z
      .number()
      .min(1)
      .max(10)
      .optional()
      .describe('Maximum number of web sources to analyze (default 3).'),
  }),
  requiredPermission: 'research',
  timeoutMs: 30_000,
  maxOutputChars: 30_000,
  execute: async ({ query, maxSources }, ctx) => {
    const report = await globalResearchEngine.deepResearch(query, {
      maxSources,
      signal: ctx.signal,
    });

    return {
      summary: report.summary,
      keyFindings: report.keyFindings,
      citations: report.citations.map((c) => ({
        index: c.index,
        title: c.title,
        url: c.url,
      })),
      markdownReport: report.markdownReport,
    };
  },
};
