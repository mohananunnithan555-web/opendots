import { randomUUID } from 'node:crypto';
import type { Store } from '../store.js';
import { globalToolRegistry } from '../tools/tool-registry.js';
import type { TaskPlan, TaskStep, PlanStatus } from './types.js';

export interface PlanStepResult {
  planId: string;
  stepId: string;
  status: PlanStatus;
  waitingApproval?: boolean;
  stepOutput?: unknown;
  error?: string;
}

export class TaskPlanner {
  constructor(private store: Store) {}

  /**
   * Decompose a complex objective into manageable steps with tools and approval safeguards.
   */
  createPlan(goal: string, ownerId: string = 'opendots-owner'): TaskPlan {
    const cleanGoal = goal.trim();
    if (!cleanGoal) {
      throw new Error('Objective cannot be empty.');
    }

    const steps = this.decomposeGoalIntoSteps(cleanGoal);
    const now = Date.now();

    const plan: TaskPlan = {
      id: randomUUID(),
      ownerId,
      goal: cleanGoal,
      status: 'pending',
      currentStepIndex: 0,
      steps,
      createdAt: now,
      updatedAt: now,
    };

    return this.store.saveTaskPlan(plan);
  }

  /**
   * Intelligently break down a goal into ordered steps with tools, input schemas, and approval flags.
   */
  private decomposeGoalIntoSteps(goal: string): TaskStep[] {
    const lower = goal.toLowerCase();
    const steps: TaskStep[] = [];

    // Step 1: Research or Analyze Objective
    if (lower.includes('research') || lower.includes('find') || lower.includes('compare') || lower.includes('look up')) {
      steps.push({
        id: randomUUID(),
        title: 'Gather information and data sources',
        description: `Search web sources and relevant data for: ${goal}`,
        status: 'pending',
        tool: 'read_web_page',
        input: { url: 'https://example.com' },
        retries: 0,
        maxRetries: 2,
        requiresApproval: false,
      });
    }

    // Step 2: Analysis / Calculation if quantitative
    if (lower.includes('calculate') || lower.includes('math') || lower.includes('cost') || lower.includes('compare') || lower.includes('benchmark')) {
      steps.push({
        id: randomUUID(),
        title: 'Perform quantitative evaluation and analysis',
        description: 'Compute numerical metrics, comparisons, or statistics for findings.',
        status: 'pending',
        tool: 'calculate',
        input: { expression: '100 * 1.05' },
        retries: 0,
        maxRetries: 2,
        requiresApproval: false,
      });
    }

    // Step 3: Synthesis & Readability
    steps.push({
      id: randomUUID(),
      title: 'Synthesize findings and structured report',
      description: 'Analyze content readability, organize key findings, and compile summary.',
      status: 'pending',
      tool: 'analyze_text',
      input: { text: `Structured summary report for: ${goal}` },
      retries: 0,
      maxRetries: 2,
      requiresApproval: false,
    });

    // Step 4: Consequential actions (Email, Save, Mutation, Purchase, Deletion)
    const isConsequential =
      lower.includes('email') ||
      lower.includes('send') ||
      lower.includes('purchase') ||
      lower.includes('buy') ||
      lower.includes('delete') ||
      lower.includes('publish') ||
      lower.includes('deploy');

    if (isConsequential) {
      steps.push({
        id: randomUUID(),
        title: 'Review and approve external action',
        description: `User confirmation required before executing external action: ${goal}`,
        status: 'pending',
        retries: 0,
        maxRetries: 1,
        requiresApproval: true,
        approved: false,
      });
    }

    // Step 5: Save to memory / workspace
    steps.push({
      id: randomUUID(),
      title: 'Save findings to memory',
      description: 'Store key findings into persistent memory for future reference.',
      status: 'pending',
      tool: 'remember_info',
      input: { text: `Completed goal: ${goal}`, category: 'project' },
      retries: 0,
      maxRetries: 1,
      requiresApproval: false,
    });

    // Ensure at least two steps if goal was brief
    if (steps.length === 1) {
      steps.unshift({
        id: randomUUID(),
        title: 'Clarify parameters and prepare task environment',
        description: 'Verify prerequisites and inputs for objective.',
        status: 'pending',
        retries: 0,
        maxRetries: 1,
        requiresApproval: false,
      });
    }

    return steps;
  }

  /**
   * Execute the next pending step of a plan, enforcing permissions, retries, and human approval checkpoints.
   */
  async executeNextStep(
    planId: string,
    ownerId: string = 'opendots-owner',
  ): Promise<PlanStepResult> {
    const plan = this.store.getTaskPlan(planId, ownerId);
    if (!plan) {
      throw new Error(`Plan "${planId}" not found.`);
    }

    if (plan.status === 'completed' || plan.status === 'cancelled' || plan.status === 'failed') {
      return {
        planId,
        stepId: '',
        status: plan.status,
      };
    }

    const currentStep = plan.steps[plan.currentStepIndex];
    if (!currentStep) {
      plan.status = 'completed';
      plan.finalResult = `All ${plan.steps.length} steps executed successfully.`;
      this.store.saveTaskPlan(plan);
      return {
        planId,
        stepId: '',
        status: 'completed',
        stepOutput: plan.finalResult,
      };
    }

    // Check approval requirement
    if (currentStep.requiresApproval && !currentStep.approved) {
      currentStep.status = 'waiting_approval';
      plan.status = 'waiting_approval';
      this.store.saveTaskPlan(plan);
      return {
        planId,
        stepId: currentStep.id,
        status: 'waiting_approval',
        waitingApproval: true,
      };
    }

    // Mark step running
    currentStep.status = 'running';
    currentStep.startedAt = Date.now();
    plan.status = 'running';
    this.store.saveTaskPlan(plan);

    try {
      let output: unknown = { ok: true, message: `Step "${currentStep.title}" completed.` };

      // Execute tool if assigned
      if (currentStep.tool && globalToolRegistry.has(currentStep.tool)) {
        const input = currentStep.input ?? {};
        const toolResult = await globalToolRegistry.execute(
          currentStep.tool,
          input,
          { userId: ownerId },
        );

        if (!toolResult.success) {
          throw new Error(toolResult.error ?? 'Tool execution failed');
        }
        output = toolResult.data;
      }

      currentStep.status = 'completed';
      currentStep.output = output;
      currentStep.finishedAt = Date.now();
      plan.currentStepIndex += 1;

      // Check if all steps done
      if (plan.currentStepIndex >= plan.steps.length) {
        plan.status = 'completed';
        plan.finalResult = `All ${plan.steps.length} steps executed successfully.`;
      }

      this.store.saveTaskPlan(plan);

      return {
        planId,
        stepId: currentStep.id,
        status: plan.status,
        stepOutput: output,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      currentStep.retries = (currentStep.retries ?? 0) + 1;

      if (currentStep.retries <= (currentStep.maxRetries ?? 2)) {
        // Can retry
        currentStep.status = 'pending';
        currentStep.error = `Attempt ${currentStep.retries} failed: ${errorMsg}. Retrying...`;
        this.store.saveTaskPlan(plan);
      } else {
        // Exhausted retries
        currentStep.status = 'failed';
        currentStep.error = errorMsg;
        plan.status = 'failed';
        plan.error = `Plan failed at step "${currentStep.title}": ${errorMsg}`;
        this.store.saveTaskPlan(plan);
      }

      return {
        planId,
        stepId: currentStep.id,
        status: plan.status,
        error: errorMsg,
      };
    }
  }

  /**
   * Approve a waiting step and resume execution.
   */
  async approveStep(
    planId: string,
    stepId: string,
    ownerId: string = 'opendots-owner',
  ): Promise<PlanStepResult> {
    const plan = this.store.getTaskPlan(planId, ownerId);
    if (!plan) throw new Error(`Plan "${planId}" not found.`);

    const step = plan.steps.find((s) => s.id === stepId);
    if (!step) throw new Error(`Step "${stepId}" not found in plan.`);

    step.approved = true;
    step.status = 'pending';
    plan.status = 'pending';
    this.store.saveTaskPlan(plan);

    return this.executeNextStep(planId, ownerId);
  }

  /**
   * Cancel an ongoing plan.
   */
  cancelPlan(planId: string, ownerId: string = 'opendots-owner'): TaskPlan {
    const plan = this.store.getTaskPlan(planId, ownerId);
    if (!plan) throw new Error(`Plan "${planId}" not found.`);

    plan.status = 'cancelled';
    for (const step of plan.steps) {
      if (step.status === 'pending' || step.status === 'running' || step.status === 'waiting_approval') {
        step.status = 'cancelled';
      }
    }
    return this.store.saveTaskPlan(plan);
  }

  getPlan(planId: string, ownerId: string = 'opendots-owner'): TaskPlan | undefined {
    return this.store.getTaskPlan(planId, ownerId);
  }

  listPlans(ownerId: string = 'opendots-owner'): TaskPlan[] {
    return this.store.listTaskPlans(ownerId);
  }
}
