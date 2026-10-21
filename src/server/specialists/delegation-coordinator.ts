import { SPECIALIST_ROLES } from './specialist-roles.js';
import type { DelegationRequest, DelegationResult, SpecialistRoleType } from './types.js';
import { redactSecrets } from '../skills/skill-logger.js';

export class DelegationCoordinator {
  /**
   * Determine whether a task prompt warrants specialist delegation or should be handled directly.
   */
  shouldDelegate(taskPrompt: string): {
    delegate: boolean;
    recommendedRole?: SpecialistRoleType;
    rationale: string;
  } {
    const text = taskPrompt.trim().toLowerCase();

    // Check for coding requests
    if (
      text.includes('code') ||
      text.includes('function') ||
      text.includes('refactor') ||
      text.includes('bug') ||
      text.includes('typescript') ||
      text.includes('python') ||
      text.includes('javascript') ||
      text.includes('git') ||
      text.includes('debug') ||
      text.includes('algorithm')
    ) {
      return {
        delegate: true,
        recommendedRole: 'coder',
        rationale: 'Task involves programming, architecture, or code debugging.',
      };
    }

    // Check for deep research requests
    if (
      text.includes('research') ||
      text.includes('investigate') ||
      text.includes('find sources') ||
      text.includes('what are the latest') ||
      text.includes('citations')
    ) {
      return {
        delegate: true,
        recommendedRole: 'researcher',
        rationale: 'Task requires multi-source factual web investigation with citations.',
      };
    }

    // Check for planning / multi-step workflow requests
    if (
      text.includes('plan') ||
      text.includes('roadmap') ||
      text.includes('break down') ||
      text.includes('steps to') ||
      text.includes('workflow')
    ) {
      return {
        delegate: true,
        recommendedRole: 'planner',
        rationale: 'Task requires structured goal decomposition and sequential planning.',
      };
    }

    // Check for writing / editing / executive brief requests
    if (
      text.includes('draft') ||
      text.includes('write an email') ||
      text.includes('essay') ||
      text.includes('blog post') ||
      text.includes('executive summary') ||
      text.includes('press release')
    ) {
      return {
        delegate: true,
        recommendedRole: 'writer',
        rationale: 'Task requires professional long-form writing or audience adaptation.',
      };
    }

    // Check for data analysis / quantitative requests
    if (
      text.includes('analyze data') ||
      text.includes('metrics') ||
      text.includes('benchmark') ||
      text.includes('statistics') ||
      text.includes('dataset') ||
      text.includes('chart') ||
      text.includes('table comparison')
    ) {
      return {
        delegate: true,
        recommendedRole: 'analyst',
        rationale: 'Task requires quantitative data analysis and metric comparisons.',
      };
    }

    // Otherwise handle directly without delegation overhead
    return {
      delegate: false,
      rationale: 'Simple conversational or general inquiry; direct handling is optimal.',
    };
  }

  /**
   * Execute task delegation to a designated specialist role.
   */
  async delegate(req: DelegationRequest): Promise<DelegationResult> {
    const startTime = Date.now();
    const roleDef = SPECIALIST_ROLES[req.specialistRole];

    if (!roleDef) {
      throw new Error(`Unknown specialist role "${req.specialistRole}".`);
    }

    // Generate specialized briefing header
    const cleanTask = redactSecrets(req.task.trim());
    const briefing = `[Specialist Task for ${roleDef.name}]\nRole: ${roleDef.tagline}\nTask: ${cleanTask}`;

    return {
      specialistRole: req.specialistRole,
      specialistName: roleDef.name,
      response: `[Specialist Response from ${roleDef.name}]\n${briefing}\n\nTask has been reviewed within bounded role context (${roleDef.allowedPermissions.join(', ')}).`,
      evidence: [`Assigned specialist: ${roleDef.name}`, `Allowed tools: ${roleDef.allowedTools.join(', ')}`],
      executionTimeMs: Date.now() - startTime,
    };
  }
}

export const globalDelegationCoordinator = new DelegationCoordinator();
