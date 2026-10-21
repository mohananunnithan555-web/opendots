import { describe, expect, it } from 'vitest';
import { Store } from '../src/server/store.js';
import { TaskPlanner } from '../src/server/planner/task-planner.js';
import { plannerTools } from '../src/server/planner/planner-tools.js';

describe('Autonomous Task Planner (Phase 5)', () => {
  it('decomposes a complex objective into structured steps', () => {
    const store = new Store(':memory:');
    const planner = new TaskPlanner(store);

    const plan = planner.createPlan(
      'Research AI coding tools, compare them, calculate cost differences, and compile a report',
    );

    expect(plan.id).toBeDefined();
    expect(plan.status).toBe('pending');
    expect(plan.steps.length).toBeGreaterThanOrEqual(3);

    // Verify step titles reflect decomposition
    const titles = plan.steps.map((s) => s.title.toLowerCase());
    expect(titles.some((t) => t.includes('gather') || t.includes('research'))).toBe(true);
    expect(titles.some((t) => t.includes('quantitative') || t.includes('calculate'))).toBe(true);
    expect(titles.some((t) => t.includes('synthesize') || t.includes('report'))).toBe(true);

    store.close();
  });

  it('persists and reloads plans in the database', () => {
    const store = new Store(':memory:');
    const planner = new TaskPlanner(store);

    const plan = planner.createPlan('Plan market research and document findings');
    const loaded = store.getTaskPlan(plan.id);

    expect(loaded).toBeDefined();
    expect(loaded?.goal).toBe('Plan market research and document findings');
    expect(loaded?.steps).toHaveLength(plan.steps.length);

    const allPlans = store.listTaskPlans();
    expect(allPlans).toHaveLength(1);
    expect(allPlans[0].id).toBe(plan.id);

    store.close();
  });

  it('executes steps sequentially and advances currentStepIndex', async () => {
    const store = new Store(':memory:');
    const planner = new TaskPlanner(store);

    const plan = planner.createPlan('Synthesize text statistics');
    expect(plan.currentStepIndex).toBe(0);

    const step1Result = await planner.executeNextStep(plan.id);
    expect(step1Result.status).toBe('running');

    const updated = store.getTaskPlan(plan.id);
    expect(updated?.currentStepIndex).toBe(1);
    expect(updated?.steps[0].status).toBe('completed');

    store.close();
  });

  it('flags consequential actions for human approval and pauses execution', async () => {
    const store = new Store(':memory:');
    const planner = new TaskPlanner(store);

    // Goal contains consequential keyword 'email'
    const plan = planner.createPlan('Research updates and email client the summary');
    const approvalStep = plan.steps.find((s) => s.requiresApproval);
    expect(approvalStep).toBeDefined();
    expect(approvalStep?.approved).toBe(false);

    // Manually advance to the approval step
    const approvalIdx = plan.steps.findIndex((s) => s.requiresApproval);
    plan.currentStepIndex = approvalIdx;
    store.saveTaskPlan(plan);

    const result = await planner.executeNextStep(plan.id);
    expect(result.status).toBe('waiting_approval');
    expect(result.waitingApproval).toBe(true);

    const planAfterPause = store.getTaskPlan(plan.id);
    expect(planAfterPause?.status).toBe('waiting_approval');
    expect(planAfterPause?.steps[approvalIdx].status).toBe('waiting_approval');

    // Human approves step
    const approveResult = await planner.approveStep(plan.id, approvalStep!.id);
    expect(approveResult.waitingApproval).toBeFalsy();

    const planAfterApproval = store.getTaskPlan(plan.id);
    expect(planAfterApproval?.steps[approvalIdx].approved).toBe(true);
    expect(planAfterApproval?.steps[approvalIdx].status).toBe('completed');

    store.close();
  });

  it('supports plan cancellation', () => {
    const store = new Store(':memory:');
    const planner = new TaskPlanner(store);

    const plan = planner.createPlan('Long multi-step project');
    const cancelled = planner.cancelPlan(plan.id);

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.steps.every((s) => s.status === 'cancelled' || s.status === 'completed')).toBe(true);

    const reloaded = store.getTaskPlan(plan.id);
    expect(reloaded?.status).toBe('cancelled');

    store.close();
  });

  it('provides planner agent tools for CopilotKit integration', async () => {
    const store = new Store(':memory:');
    const planner = new TaskPlanner(store);
    const tools = plannerTools(planner);

    expect(tools.map((t) => t.name)).toContain('create_autonomous_plan');
    expect(tools.map((t) => t.name)).toContain('check_plan_status');
    expect(tools.map((t) => t.name)).toContain('execute_next_plan_step');

    const createTool = tools.find((t) => t.name === 'create_autonomous_plan')!;
    const toolResult = (await (createTool as any).execute({
      goal: 'Research new AI architectures and compare',
    })) as any;

    expect(toolResult.success).toBe(true);
    expect(toolResult.planId).toBeDefined();
    expect(toolResult.totalSteps).toBeGreaterThanOrEqual(2);

    // Check status tool
    const statusTool = tools.find((t) => t.name === 'check_plan_status')!;
    const statusResult = (await (statusTool as any).execute({
      planId: toolResult.planId,
    })) as any;

    expect(statusResult.success).toBe(true);
    expect(statusResult.goal).toContain('Research new AI architectures');

    store.close();
  });
});
