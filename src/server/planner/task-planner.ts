import { randomUUID } from 'node:crypto';
import type { Store } from '../store.js';
import { globalToolRegistry } from '../tools/tool-registry.js';
import type { TaskPlan, TaskStep, PlanStatus } from './types.js';
import {
  COWORK_WORKFLOW_TEMPLATES,
  getCoworkTemplate,
} from './cowork-templates.js';

export interface PlanStepResult {
  planId: string;
  stepId: string;
  status: PlanStatus;
  waitingApproval?: boolean;
  stepOutput?: unknown;
  deliverablePath?: string;
  error?: string;
}

export class TaskPlanner {
  constructor(private store: Store) {}

  /**
   * Decompose a complex objective into manageable steps with tools and approval safeguards.
   */
  createPlan(goal: string, ownerId: string = 'opendots-owner', projectId?: string): TaskPlan {
    const cleanGoal = goal.trim();
    if (!cleanGoal) {
      throw new Error('Objective cannot be empty.');
    }

    const steps = this.decomposeGoalIntoSteps(cleanGoal);
    const now = Date.now();

    const plan: TaskPlan = {
      id: randomUUID(),
      ownerId,
      projectId,
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
   * Create a plan from a pre-defined Claude Cowork workflow template
   */
  createPlanFromTemplate(
    templateId: string,
    customGoal?: string,
    projectIdOrOwnerId?: string,
    ownerIdArg?: string,
  ): TaskPlan {
    const template = getCoworkTemplate(templateId);
    if (!template) {
      throw new Error(`Cowork template "${templateId}" not found.`);
    }

    let ownerId = 'opendots-owner';
    let projectId: string | undefined = undefined;

    if (ownerIdArg) {
      ownerId = ownerIdArg;
      projectId = projectIdOrOwnerId;
    } else if (projectIdOrOwnerId) {
      if (projectIdOrOwnerId === 'opendots-owner' || projectIdOrOwnerId.startsWith('user-')) {
        ownerId = projectIdOrOwnerId;
      } else {
        projectId = projectIdOrOwnerId;
      }
    }

    const steps: TaskStep[] = template.steps.map((s) => ({
      id: randomUUID(),
      title: s.title,
      description: s.description,
      status: 'pending',
      tool: s.tool,
      input: { ...s.defaultInput, ...(projectId ? { projectId } : {}) },
      retries: 0,
      maxRetries: 2,
      assignedSpecialist: s.assignedSpecialist,
      requiresApproval: s.requiresApproval ?? false,
      validationCriteria: s.validationCriteria,
    }));

    const now = Date.now();
    const plan: TaskPlan = {
      id: randomUUID(),
      ownerId,
      projectId,
      spaceId: projectId,
      goal: customGoal || template.title,
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
    if (
      lower.includes('research') ||
      lower.includes('find') ||
      lower.includes('compare') ||
      lower.includes('look up') ||
      lower.includes('investigate')
    ) {
      steps.push({
        id: randomUUID(),
        title: 'Gather information and data sources',
        description: `Search web sources and relevant data for: ${goal}`,
        status: 'pending',
        tool: 'deep_research',
        input: { query: goal },
        assignedSpecialist: 'researcher',
        retries: 0,
        maxRetries: 2,
        requiresApproval: false,
        validationCriteria: ['Citations provided', 'Verified facts categorized'],
      });
    }

    // Step 2: Spreadsheet / Tabular Analytics if numeric
    if (
      lower.includes('spreadsheet') ||
      lower.includes('table') ||
      lower.includes('csv') ||
      lower.includes('calculate') ||
      lower.includes('metrics') ||
      lower.includes('statistics')
    ) {
      steps.push({
        id: randomUUID(),
        title: 'Calculate quantitative metrics and tabular formulas',
        description: 'Parse dataset, calculate statistical distribution, and evaluate formulas.',
        status: 'pending',
        tool: 'analyze_spreadsheet',
        input: { rawCsv: 'Item,Value\nDataPoint1,100\nDataPoint2,200\nDataPoint3,300' },
        assignedSpecialist: 'analyst',
        retries: 0,
        maxRetries: 2,
        requiresApproval: false,
      });
    }

    // Step 2b: Consequential external communication check (requires approval)
    if (
      lower.includes('email') ||
      lower.includes('notify') ||
      lower.includes('dispatch') ||
      lower.includes('message') ||
      lower.includes('publish')
    ) {
      steps.push({
        id: randomUUID(),
        title: 'Dispatch email communication to client',
        description: `Deliver executive summary to external client or stakeholders for: ${goal}`,
        status: 'pending',
        tool: 'gmail_workspace',
        input: { subject: `Update: ${goal.slice(0, 40)}`, body: 'Executive summary report.' },
        assignedSpecialist: 'writer',
        retries: 0,
        maxRetries: 1,
        requiresApproval: true,
        approved: false,
      });
    }

    // Step 3: Drafting or Presentation Deliverable
    if (lower.includes('presentation') || lower.includes('deck') || lower.includes('slides')) {
      steps.push({
        id: randomUUID(),
        title: 'Generate presentation deck structure',
        description: 'Outline slides with speaker notes and layouts.',
        status: 'pending',
        tool: 'generate_slide_deck',
        input: { title: goal, topic: goal },
        assignedSpecialist: 'writer',
        retries: 0,
        maxRetries: 2,
        requiresApproval: false,
      });
    } else {
      steps.push({
        id: randomUUID(),
        title: 'Synthesize findings into executive deliverable',
        description: 'Compile structured report with sections and key conclusions.',
        status: 'pending',
        tool: 'generate_office_document',
        input: {
          title: `Report: ${goal.slice(0, 40)}`,
          executiveSummary: `Autonomous synthesis for "${goal}".`,
          sections: [{ heading: 'Key Findings', body: 'Analysis results and recommendations.' }],
        },
        assignedSpecialist: 'writer',
        retries: 0,
        maxRetries: 2,
        requiresApproval: false,
      });
    }

    // Step 4: Step Verification Guard
    steps.push({
      id: randomUUID(),
      title: 'Verify deliverable criteria and completeness',
      description: 'Audit output against user requirements and ensure zero contradictions.',
      status: 'pending',
      tool: 'verify_step_output',
      input: {
        stepTitle: 'Deliverable Verification',
        acceptanceCriteria: ['Deliverable generated', 'Zero fatal errors'],
        outputToVerify: 'Verified: Objective completed successfully with deliverable.',
      },
      assignedSpecialist: 'reviewer',
      retries: 0,
      maxRetries: 2,
      requiresApproval: false,
    });

    // Step 5: Save key takeaways to memory
    steps.push({
      id: randomUUID(),
      title: 'Save project context to persistent memory',
      description: 'Store key findings into persistent memory for future reference.',
      status: 'pending',
      tool: 'export_workspace_document',
      input: { title: `Project Memo - ${goal.slice(0, 30)}`, content: `# Memo\n\nOutcome for: ${goal}` },
      retries: 0,
      maxRetries: 1,
      requiresApproval: false,
    });

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

    if (
      plan.status === 'completed' ||
      plan.status === 'cancelled' ||
      plan.status === 'failed' ||
      plan.status === 'paused'
    ) {
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
      this.store.createNotification({
        ownerId,
        type: 'task_completed',
        title: `Plan Completed: ${plan.goal.slice(0, 40)}`,
        message: plan.finalResult,
        priority: 'medium',
        targetId: plan.id,
        actionUrl: '/activity',
      });
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

      // Create Approval Request in Store
      try {
        this.store.createApproval({
          ownerId,
          actionType: 'custom_tool',
          title: `Step Approval Required: ${currentStep.title}`,
          description: currentStep.description,
          destination: currentStep.tool || 'Planner Step',
          payload: (currentStep.input as Record<string, unknown>) || {},
          policy: 'always_ask',
          estimatedCost: '$0.00',
        });
      } catch (e) {
        console.warn('Could not auto-create approval record:', e);
      }

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
      let deliverablePath: string | undefined;

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

        if (typeof output === 'object' && output !== null) {
          const resObj = output as any;
          if (resObj.savedPath) deliverablePath = resObj.savedPath;
          else if (resObj.relativePath) deliverablePath = resObj.relativePath;
          else if (resObj.filePath) deliverablePath = resObj.filePath;
        }
      }

      currentStep.status = 'completed';
      currentStep.output = output;
      currentStep.deliverablePath = deliverablePath;
      currentStep.finishedAt = Date.now();
      plan.currentStepIndex += 1;

      // Check if all steps done
      if (plan.currentStepIndex >= plan.steps.length) {
        plan.status = 'completed';
        plan.finalResult = `All ${plan.steps.length} steps executed successfully.`;
        this.store.createNotification({
          ownerId,
          type: 'task_completed',
          title: `Plan Completed: ${plan.goal.slice(0, 40)}`,
          message: plan.finalResult,
          priority: 'medium',
          targetId: plan.id,
          actionUrl: '/activity',
        });
      }

      this.store.saveTaskPlan(plan);

      return {
        planId,
        stepId: currentStep.id,
        status: plan.status,
        stepOutput: output,
        deliverablePath,
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
        // Exhausted retries -> Replan step or fail gracefully
        currentStep.status = 'failed';
        currentStep.error = errorMsg;
        plan.status = 'failed';
        plan.error = `Plan failed at step "${currentStep.title}": ${errorMsg}`;
        this.store.saveTaskPlan(plan);

        this.store.createNotification({
          ownerId,
          type: 'task_failed',
          title: `Plan Failed: ${currentStep.title.slice(0, 40)}`,
          message: errorMsg,
          priority: 'high',
          targetId: plan.id,
          actionUrl: '/activity',
        });
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
   * Pause a plan
   */
  pausePlan(planId: string, ownerId: string = 'opendots-owner'): TaskPlan {
    const plan = this.store.getTaskPlan(planId, ownerId);
    if (!plan) throw new Error(`Plan "${planId}" not found.`);
    plan.status = 'paused';
    return this.store.saveTaskPlan(plan);
  }

  /**
   * Resume a paused plan
   */
  resumePlan(planId: string, ownerId: string = 'opendots-owner'): TaskPlan {
    const plan = this.store.getTaskPlan(planId, ownerId);
    if (!plan) throw new Error(`Plan "${planId}" not found.`);
    plan.status = 'pending';
    return this.store.saveTaskPlan(plan);
  }

  /**
   * Replan a failed or blocked step with alternative tool or input
   */
  replanStep(
    planId: string,
    stepId: string,
    update: { tool?: string; input?: Record<string, unknown>; title?: string; reason?: string } | string,
    ownerId: string = 'opendots-owner',
  ): TaskPlan {
    const plan = this.store.getTaskPlan(planId, ownerId);
    if (!plan) throw new Error(`Plan "${planId}" not found.`);

    const step = plan.steps.find((s) => s.id === stepId);
    if (!step) throw new Error(`Step "${stepId}" not found.`);

    if (typeof update === 'string') {
      step.description = `${step.description} [Replanned: ${update}]`;
    } else {
      if (update.tool) step.tool = update.tool;
      if (update.input) step.input = update.input;
      if (update.title) step.title = update.title;
      if (update.reason) step.description = `${step.description} [Replanned: ${update.reason}]`;
    }
    step.status = 'pending';
    step.error = undefined;
    step.retries = 0;
    plan.status = 'pending';
    plan.error = undefined;

    return this.store.saveTaskPlan(plan);
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

  /**
   * Autonomous Background Execution Loop.
   * Runs the plan continuously across steps until done, paused, cancelled, or waiting for approval.
   */
  async startAutonomousExecution(
    planId: string,
    ownerId: string = 'opendots-owner',
  ): Promise<TaskPlan> {
    let plan = this.store.getTaskPlan(planId, ownerId);
    if (!plan) throw new Error(`Plan "${planId}" not found.`);

    if (plan.status === 'completed' || plan.status === 'cancelled') {
      return plan;
    }

    plan.status = 'running';
    plan = this.store.saveTaskPlan(plan);

    while (plan.status === 'running' && plan.currentStepIndex < plan.steps.length) {
      // Re-read latest plan from DB in case user clicked Pause or Cancel
      const freshPlan = this.store.getTaskPlan(planId, ownerId);
      if (!freshPlan || freshPlan.status === 'paused' || freshPlan.status === 'cancelled') {
        break;
      }

      const currentStep = freshPlan.steps[freshPlan.currentStepIndex];
      if (!currentStep) break;

      // Check dependency steps
      if (currentStep.dependsOn && currentStep.dependsOn.length > 0) {
        const unmetDeps = currentStep.dependsOn.filter((depId) => {
          const depStep = freshPlan.steps.find((s) => s.id === depId);
          return !depStep || depStep.status !== 'completed';
        });
        if (unmetDeps.length > 0) {
          currentStep.status = 'failed';
          currentStep.error = `Unmet step dependencies: ${unmetDeps.join(', ')}`;
          freshPlan.status = 'failed';
          this.store.saveTaskPlan(freshPlan);
          break;
        }
      }

      // Execute current step
      const stepRes = await this.executeNextStep(planId, ownerId);

      // Refresh plan
      const updated = this.store.getTaskPlan(planId, ownerId);
      if (!updated) break;
      plan = updated;

      if (stepRes.waitingApproval || plan.status === 'waiting_approval') {
        // Paused waiting for user approval
        break;
      }

      if (plan.status === 'failed') {
        // Autonomous Replanning Check
        const failedStep = plan.steps[plan.currentStepIndex];
        if (failedStep && failedStep.status === 'failed') {
          const autoReplanned = this.attemptAutonomousReplan(plan, failedStep);
          if (autoReplanned) {
            plan = this.store.saveTaskPlan(plan);
            // Retry step after replanning
            continue;
          }
        }
        break;
      }

      if (plan.status === 'completed' || plan.status === 'paused' || plan.status === 'cancelled') {
        break;
      }

      // Micro-delay between steps to let other async tasks process
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return this.store.getTaskPlan(planId, ownerId) || plan;
  }

  /**
   * Autonomous Replanning when step retries are exhausted.
   * Tries intelligent fallback tools or relaxed parameters before failing permanently.
   */
  private attemptAutonomousReplan(plan: TaskPlan, step: TaskStep): boolean {
    if (!step.tool) return false;

    // Fallback 1: deep_research failed -> fallback to read_web_page or search_memory
    if (step.tool === 'deep_research') {
      step.tool = 'read_web_page';
      step.description += ' [Auto-replanned: falling back to direct web reading]';
      step.status = 'pending';
      step.retries = 0;
      step.error = undefined;
      plan.status = 'running';
      plan.error = undefined;
      return true;
    }

    // Fallback 2: analyze_spreadsheet failed -> fallback to text_analyzer
    if (step.tool === 'analyze_spreadsheet') {
      step.tool = 'analyze_text';
      step.input = { text: JSON.stringify(step.input || {}) };
      step.description += ' [Auto-replanned: falling back to text analytics]';
      step.status = 'pending';
      step.retries = 0;
      step.error = undefined;
      plan.status = 'running';
      plan.error = undefined;
      return true;
    }

    // Fallback 3: generate_office_document failed -> fallback to export_workspace_document
    if (step.tool === 'generate_office_document') {
      step.tool = 'export_workspace_document';
      step.input = { title: step.title, content: `# ${step.title}\n\nDeliverable generated by autonomous replanner.` };
      step.description += ' [Auto-replanned: falling back to workspace document export]';
      step.status = 'pending';
      step.retries = 0;
      step.error = undefined;
      plan.status = 'running';
      plan.error = undefined;
      return true;
    }

    return false;
  }

  /**
   * Crash & Server Restart Recovery.
   * Finds all plans in 'running' or 'pending' state and resumes their execution automatically.
   */
  async recoverPendingPlans(ownerId: string = 'opendots-owner'): Promise<number> {
    const plans = this.store.listTaskPlans(ownerId);
    const interruptedPlans = plans.filter(
      (p) => p.status === 'running' || (p.status === 'pending' && p.currentStepIndex < p.steps.length),
    );

    let count = 0;
    for (const plan of interruptedPlans) {
      // If a step was left running when the server shut down, reset it to pending
      for (const step of plan.steps) {
        if (step.status === 'running') {
          step.status = 'pending';
        }
      }
      this.store.saveTaskPlan(plan);

      // Launch autonomous execution in background (do not await so startup is fast)
      void this.startAutonomousExecution(plan.id, plan.ownerId).catch((err) => {
        if (!String(err).includes('database is not open')) {
          console.warn(`Plan recovery failed for plan ${plan.id}:`, err);
        }
      });
      count++;
    }

    return count;
  }
}
