import type { z } from 'zod';

export type SkillPermission =
  | 'basic'
  | 'research'
  | 'files'
  | 'media'
  | 'code'
  | 'computer'
  | 'admin';

export interface SkillMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  category: 'analysis' | 'utility' | 'generation' | 'research' | 'coding';
  requiredPermissions: SkillPermission[];
  tags?: string[];
  author?: string;
}

export interface SkillLogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface SkillContext {
  userId?: string;
  dotId?: string;
  userPermissions?: SkillPermission[];
  config?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface SkillExecutionResult<TOutput = unknown> {
  success: boolean;
  data?: TOutput;
  error?: string;
  executionTimeMs: number;
  logs: SkillLogEntry[];
}

export interface SkillDefinition<TInput = unknown, TOutput = unknown> {
  metadata: SkillMetadata;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  timeoutMs?: number;
  execute(input: TInput, ctx: SkillContext): Promise<TOutput>;
}
