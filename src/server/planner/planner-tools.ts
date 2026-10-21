import { defineTool } from '@copilotkit/runtime/v2';
import { z } from 'zod';
import type { TaskPlanner } from './task-planner.js';

export function plannerTools(planner: TaskPlanner, ownerId: string = 'opendots-owner') {
  return [
    defineTool({
      name: 'create_autonomous_plan',
      description:
        'Decompose a complex multi-step user goal (e.g., "Research AI coding tools, compare them, create a report, and save it") into an autonomous step-by-step plan with progress tracking and safety checks.',
      parameters: z.object({
        goal: z.string().min(1).max(2000).describe('The high-level goal or objective to plan and execute.'),
      }),
      execute: async ({ goal }) => {
        try {
          const plan = planner.createPlan(goal, ownerId);
          return {
            success: true,
            planId: plan.id,
            status: plan.status,
            totalSteps: plan.steps.length,
            steps: plan.steps.map((s, idx) => ({
              index: idx + 1,
              id: s.id,
              title: s.title,
              requiresApproval: s.requiresApproval,
            })),
            message: `Created plan with ${plan.steps.length} steps. View progress in the Activity dashboard.`,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to create plan.',
          };
        }
      },
    }),

    defineTool({
      name: 'check_plan_status',
      description: 'Check the status, current step, and results of an ongoing autonomous task plan.',
      parameters: z.object({
        planId: z.string().describe('The ID of the plan to check.'),
      }),
      execute: async ({ planId }) => {
        const plan = planner.getPlan(planId, ownerId);
        if (!plan) return { success: false, error: 'Plan not found.' };

        return {
          success: true,
          planId: plan.id,
          goal: plan.goal,
          status: plan.status,
          currentStepIndex: plan.currentStepIndex,
          totalSteps: plan.steps.length,
          finalResult: plan.finalResult,
          error: plan.error,
          steps: plan.steps.map((s) => ({
            id: s.id,
            title: s.title,
            status: s.status,
            error: s.error,
          })),
        };
      },
    }),

    defineTool({
      name: 'execute_next_plan_step',
      description: 'Execute the next step of an autonomous task plan.',
      parameters: z.object({
        planId: z.string().describe('The ID of the plan.'),
      }),
      execute: async ({ planId }) => {
        try {
          const result = await planner.executeNextStep(planId, ownerId);
          return {
            success: true,
            ...result,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Step execution failed.',
          };
        }
      },
    }),
  ];
}
