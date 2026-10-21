import { defineTool } from '@copilotkit/runtime/v2';
import { z } from 'zod';
import type { Store } from './store.js';
import { MemoryCategorySchema } from './memory-types.js';

export function memoryTools(store: Store, ownerId: string = 'opendots-owner') {
  return [
    defineTool({
      name: 'remember_info',
      description:
        'Save an important user preference, ongoing project detail, or conversation summary to persistent memory so you can remember it across conversations. Never store passwords, API keys, or credit cards.',
      parameters: z.object({
        text: z
          .string()
          .min(1)
          .max(1000)
          .describe('The concise piece of information to remember.'),
        category: MemoryCategorySchema.describe(
          'Category: "preference" (user likes/dislikes/habits), "project" (ongoing goals/projects), "conversation_summary" (key discussion points), or "task_context".',
        ),
      }),
      execute: async ({ text, category }) => {
        try {
          const record = store.saveMemoryV2({
            text,
            category,
            ownerId,
            source: 'agent_inferred',
          });
          return {
            success: true,
            message: `Remembered: "${record.text}" (${record.category})`,
            id: record.id,
          };
        } catch (err) {
          return {
            success: false,
            error:
              err instanceof Error ? err.message : 'Failed to save memory.',
          };
        }
      },
    }),

    defineTool({
      name: 'search_memory',
      description:
        'Search persistent personal memory for past user preferences, project notes, or saved information.',
      parameters: z.object({
        query: z.string().describe('Keywords or topic to search for in memory.'),
        category: MemoryCategorySchema.optional().describe(
          'Optional category to filter results by.',
        ),
      }),
      execute: async ({ query, category }) => {
        const matches = store.searchMemories(query, category, ownerId);
        if (!matches.length) {
          return {
            success: true,
            found: false,
            message: `No memories found matching "${query}".`,
            results: [],
          };
        }
        return {
          success: true,
          found: true,
          count: matches.length,
          results: matches.map((m) => ({
            id: m.id,
            category: m.category,
            text: m.text,
            createdAt: new Date(m.createdAt).toISOString(),
          })),
        };
      },
    }),

    defineTool({
      name: 'forget_info',
      description:
        'Delete or forget a specific memory or outdated information upon user request.',
      parameters: z.object({
        id: z.string().optional().describe('The ID of the memory to forget.'),
        query: z
          .string()
          .optional()
          .describe('Topic or keywords to find and forget.'),
      }),
      execute: async ({ id, query }) => {
        if (id) {
          const removed = store.forgetMemory(id, ownerId);
          return {
            success: removed,
            message: removed
              ? 'Successfully deleted memory.'
              : 'Memory not found.',
          };
        }
        if (query) {
          const matches = store.searchMemories(query, undefined, ownerId);
          if (!matches.length) {
            return {
              success: false,
              message: `No memories found matching "${query}" to forget.`,
            };
          }
          let count = 0;
          for (const m of matches) {
            if (store.forgetMemory(m.id, ownerId)) count++;
          }
          return {
            success: true,
            message: `Forgot ${count} memories matching "${query}".`,
          };
        }
        return {
          success: false,
          error: 'Provide either an ID or a query to forget.',
        };
      },
    }),
  ];
}
