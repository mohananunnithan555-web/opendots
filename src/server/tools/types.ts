import type { z } from 'zod';
import type { SkillPermission } from '../skills/types.js';

export interface ToolExecutionContext {
  userId?: string;
  dotId?: string;
  userPermissions?: SkillPermission[];
  signal?: AbortSignal;
}

export interface ToolExecutionResult<TOutput = unknown> {
  success: boolean;
  data?: TOutput;
  error?: string;
  executionTimeMs: number;
  truncated?: boolean;
}

export interface OpenDotsToolDefinition<TInput = any, TOutput = any> {
  name: string;
  description: string;
  parameters: z.ZodType<TInput>;
  requiredPermission?: SkillPermission;
  timeoutMs?: number;
  maxOutputChars?: number;
  requiresApproval?: boolean;
  execute(input: TInput, ctx: ToolExecutionContext): Promise<TOutput>;
}
