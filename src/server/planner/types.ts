import { z } from 'zod';

export type PlanStatus =
  | 'pending'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type PlanStepStatus =
  | 'pending'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped';

export interface TaskStep {
  id: string;
  title: string;
  description: string;
  status: PlanStepStatus;
  tool?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  error?: string;
  requiresApproval?: boolean;
  approved?: boolean;
  retries?: number;
  maxRetries?: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface TaskPlan {
  id: string;
  ownerId: string;
  goal: string;
  status: PlanStatus;
  currentStepIndex: number;
  steps: TaskStep[];
  finalResult?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export const TaskStepSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().default(''),
  status: z.enum([
    'pending',
    'running',
    'waiting_approval',
    'completed',
    'failed',
    'cancelled',
    'skipped',
  ]),
  tool: z.string().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  output: z.unknown().optional(),
  error: z.string().optional(),
  requiresApproval: z.boolean().optional(),
  approved: z.boolean().optional(),
  retries: z.number().optional(),
  maxRetries: z.number().optional(),
  startedAt: z.number().optional(),
  finishedAt: z.number().optional(),
});

export const TaskPlanSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  goal: z.string().min(1),
  status: z.enum([
    'pending',
    'running',
    'waiting_approval',
    'completed',
    'failed',
    'cancelled',
  ]),
  currentStepIndex: z.number().min(0),
  steps: z.array(TaskStepSchema),
  finalResult: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
