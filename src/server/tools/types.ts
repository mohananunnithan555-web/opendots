import type { z } from 'zod';
import type { SkillPermission } from '../skills/types.js';

export interface ToolExecutionContext {
  userId?: string;
  dotId?: string;
  userPermissions?: SkillPermission[];
  signal?: AbortSignal;
  freeOnlyMode?: boolean;
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
  /** True if this tool relies on paid endpoints, tokens, or subscription plans. Blocked when Free-Only Mode is active. */
  isPaidService?: boolean;
  /** Estimated cost in USD if applicable. */
  costEstimateUsd?: number;
  execute(input: TInput, ctx: ToolExecutionContext): Promise<TOutput>;
}
