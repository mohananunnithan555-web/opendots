import { defineTool } from '@copilotkit/runtime/v2';
import { z } from 'zod';
import { globalDelegationCoordinator } from './delegation-coordinator.js';
import type { OpenDotsToolDefinition } from '../tools/types.js';

export const delegateToSpecialistTool: OpenDotsToolDefinition<
  {
    specialistRole: 'researcher' | 'coder' | 'writer' | 'planner' | 'analyst';
    task: string;
  },
  {
    specialistRole: string;
    specialistName: string;
    response: string;
    evidence?: string[];
  }
> = {
  name: 'delegate_to_specialist',
  description:
    'Delegate a specialized task to one of the 5 dedicated specialist AI agents: "researcher" (web research and fact verification), "coder" (programming, refactoring, and debugging), "writer" (drafting documents and emails), "planner" (multi-step workflow planning), or "analyst" (quantitative data evaluation). Use this when high specialization is needed.',
  parameters: z.object({
    specialistRole: z
      .enum(['researcher', 'coder', 'writer', 'planner', 'analyst'])
      .describe('The specific specialist role to delegate to.'),
    task: z.string().min(1).max(2000).describe('Clear task description and objectives for the specialist.'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 30_000,
  execute: async ({ specialistRole, task }) => {
    const result = await globalDelegationCoordinator.delegate({
      specialistRole,
      task,
    });

    return {
      specialistRole: result.specialistRole,
      specialistName: result.specialistName,
      response: result.response,
      evidence: result.evidence,
    };
  },
};
