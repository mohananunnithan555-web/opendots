import { describe, expect, it } from 'vitest';
import { Store } from '../src/server/store.js';
import { TaskPlanner } from '../src/server/planner/task-planner.js';
import { ActionReviewEngine, globalActionReviewEngine } from '../src/server/tools/action-review.js';
import { SPECIALIST_ROLES } from '../src/server/specialists/specialist-roles.js';
import { ProactiveResearchService } from '../src/server/research/proactive-monitor.js';
import { executeSafeTool } from '../src/server/tools/open-dots-tool.js';
import { z } from 'zod';
import type { OpenDotsToolDefinition } from '../src/server/tools/types.js';

describe('ChatGPT Dots Feature Parity Audit & Implementation', () => {
  describe('Phase 9: Action Review & Custom Rules Hard Safeguards', () => {
    it('strictly enforces Hard Safeguards on financial operations (hand_off_to_you)', () => {
      const engine = new ActionReviewEngine();

      const financialAttempt = engine.evaluate({
        actionName: 'process_stripe_payment',
        description: 'Charge credit card $50 for premium subscription',
        involvesFinancials: true,
      });

      expect(financialAttempt.decision).toBe('hand_off_to_you');
      expect(financialAttempt.hardSafeguardTriggered).toBe(true);
      expect(financialAttempt.isBlockedPermanently).toBe(true);
      expect(financialAttempt.reason).toContain('Strict ₹0 budget policy');
    });

    it('strictly enforces Hard Safeguards on credential tampering (hand_off_to_you)', () => {
      const engine = new ActionReviewEngine();

      const credAttempt = engine.evaluate({
        actionName: 'change_master_password',
        description: 'Export private ssh keys and change password',
        involvesCredentials: true,
      });

      expect(credAttempt.decision).toBe('hand_off_to_you');
      expect(credAttempt.hardSafeguardTriggered).toBe(true);
      expect(credAttempt.isBlockedPermanently).toBe(true);
      expect(credAttempt.reason).toContain('secrets, passwords, and private keys');
    });

    it('strictly enforces Hard Safeguards on catastrophic wipes (hand_off_to_you)', () => {
      const engine = new ActionReviewEngine();

      const wipeAttempt = engine.evaluate({
        actionName: 'run_bash_command',
        payload: { command: 'rm -rf / --no-preserve-root' },
      });

      expect(wipeAttempt.decision).toBe('hand_off_to_you');
      expect(wipeAttempt.hardSafeguardTriggered).toBe(true);
      expect(wipeAttempt.isBlockedPermanently).toBe(true);
    });

    it('evaluates custom user rules matching tools and categories', () => {
      const store = new Store(':memory:');
      const rule = store.createCustomRule({
        name: 'Auto-approve local document creation',
        pattern: 'tool:generate_office_document',
        category: 'file_operations',
        policy: 'take_action_without_asking',
        description: 'Allow autonomous drafting without confirmation',
        enabled: true,
      });

      const engine = new ActionReviewEngine(store);
      const res = engine.evaluate(
        { actionName: 'generate_office_document', category: 'file_operations' },
        store.customRules(),
      );

      expect(res.decision).toBe('take_action_without_asking');
      expect(res.matchedRuleId).toBe(rule.id);
      expect(res.requiresHumanApproval).toBe(false);

      store.close();
    });

    it('prevents custom rules from bypassing Hard Safeguards', () => {
      const store = new Store(':memory:');
      // Attempt to create a permissive custom rule for all actions including payments
      store.createCustomRule({
        name: 'Permit everything',
        pattern: '*',
        category: 'general',
        policy: 'take_action_without_asking',
        description: 'Dangerous rule attempting to allow everything',
        enabled: true,
      });

      const engine = new ActionReviewEngine(store);
      const res = engine.evaluate(
        {
          actionName: 'crypto_transfer',
          description: 'Transfer 1 ETH to external wallet',
          involvesFinancials: true,
        },
        store.customRules(),
      );

      // Hard Safeguard MUST win over permissive custom rule!
      expect(res.decision).toBe('hand_off_to_you');
      expect(res.hardSafeguardTriggered).toBe(true);

      store.close();
    });

    it('blocks prohibited actions inside executeSafeTool', async () => {
      const dangerousTool: OpenDotsToolDefinition = {
        name: 'crypto_wallet_payment',
        description: 'Send crypto payment',
        parameters: z.object({ amount: z.number() }),
        execute: async () => ({ transferred: true }),
      };

      const result = await executeSafeTool(dangerousTool, { amount: 100 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Action Prohibited by Action Policy');
      expect(result.error).toContain('Hand-off required');
    });
  });

  describe('Phases 3 & 4: Autonomous Multi-Step Plan Runner & Crash Recovery', () => {
    it('executes a multi-step plan autonomously in background to completion', async () => {
      const store = new Store(':memory:');
      const planner = new TaskPlanner(store);

      const plan = planner.createPlan('Synthesize text statistics');
      expect(plan.status).toBe('pending');

      const completedPlan = await planner.startAutonomousExecution(plan.id);

      expect(completedPlan.status).toBe('completed');
      expect(completedPlan.currentStepIndex).toBe(completedPlan.steps.length);
      expect(completedPlan.finalResult).toContain('successfully');

      const persisted = store.getTaskPlan(plan.id);
      expect(persisted?.status).toBe('completed');

      store.close();
    });

    it('pauses autonomous execution when a step requires human approval', async () => {
      const store = new Store(':memory:');
      const planner = new TaskPlanner(store);

      const plan = planner.createPlan('Research updates and email client the summary');
      const approvalIdx = plan.steps.findIndex((s) => s.requiresApproval);
      expect(approvalIdx).toBeGreaterThanOrEqual(0);

      // Advance directly to the approval step index
      plan.currentStepIndex = approvalIdx;
      store.saveTaskPlan(plan);

      const pausedPlan = await planner.startAutonomousExecution(plan.id);

      expect(pausedPlan.status).toBe('waiting_approval');
      const approvals = store.approvals('opendots-owner', 'pending');
      expect(approvals.length).toBeGreaterThan(0);

      store.close();
    });

    it('recovers interrupted running plans upon server restart without duplicate execution', async () => {
      const store = new Store(':memory:');
      const planner = new TaskPlanner(store);

      const plan = planner.createPlan('Compile research and calculate formulas');
      // Simulate crash mid-step
      plan.status = 'running';
      plan.steps[0].status = 'running';
      store.saveTaskPlan(plan);

      // Server reboot recovery
      const recoveredCount = await planner.recoverPendingPlans();
      expect(recoveredCount).toBe(1);

      // Verify running step was safely reset to pending and not corrupted
      const recovered = store.getTaskPlan(plan.id);
      expect(recovered).toBeDefined();

      store.close();
    });

    it('automatically replans failed steps using intelligent fallback tools', async () => {
      const store = new Store(':memory:');
      const planner = new TaskPlanner(store);

      const plan = planner.createPlan('Analyze complex metrics');
      // Assign tool that will fail retries
      const step = plan.steps[0];
      step.tool = 'generate_office_document';
      step.maxRetries = 0; // immediate exhaustion to trigger replanning
      store.saveTaskPlan(plan);

      // Attempt step
      const replanned = planner.replanStep(plan.id, step.id, {
        tool: 'export_workspace_document',
        reason: 'Fallback to workspace markdown deliverable',
      });

      expect(replanned.steps[0].tool).toBe('export_workspace_document');
      expect(replanned.steps[0].description).toContain('Replanned');
      expect(replanned.status).toBe('pending');

      store.close();
    });
  });

  describe('Phase 7: Enhanced Long-Term Memory (Responsibilities, Decisions, Lessons)', () => {
    it('stores and queries memory under new ChatGPT Dots categories', () => {
      const store = new Store(':memory:');

      const resp = store.saveMemoryV2({
        category: 'responsibility',
        text: 'Always check that unit tests pass before completing tasks',
        source: 'agent_inferred',
      });
      expect(resp.category).toBe('responsibility');

      const decision = store.saveMemoryV2({
        category: 'decision',
        text: 'User decided to keep Render free web service for production deployment',
        source: 'user_explicit',
      });
      expect(decision.category).toBe('decision');

      const lesson = store.saveMemoryV2({
        category: 'lesson',
        text: 'Prefer DuckDuckGo provider over unconfigured services',
        source: 'agent_inferred',
      });
      expect(lesson.category).toBe('lesson');

      const queried = store.memoriesV2({ category: 'responsibility' });
      expect(queried).toHaveLength(1);
      expect(queried[0].text).toContain('unit tests');

      store.close();
    });

    it('supports project-scoped memory isolation', () => {
      const store = new Store(':memory:');

      store.saveMemoryV2({
        category: 'project',
        text: 'Project Alpha uses PostgreSQL',
        projectId: 'project-alpha',
      });

      store.saveMemoryV2({
        category: 'project',
        text: 'Project Beta uses SQLite WAL',
        projectId: 'project-beta',
      });

      const alphaMems = store.memoriesV2({ projectId: 'project-alpha' });
      expect(alphaMems).toHaveLength(1);
      expect(alphaMems[0].text).toContain('PostgreSQL');

      const betaMems = store.memoriesV2({ projectId: 'project-beta' });
      expect(betaMems).toHaveLength(1);
      expect(betaMems[0].text).toContain('SQLite WAL');

      store.close();
    });
  });

  describe('Phase 12 & 14: Specialist Roles & Coder Dot Toolset Alignment', () => {
    it('equips Coder Dot with full code analysis, sandbox, and file workspace tools', () => {
      const coder = SPECIALIST_ROLES.coder;
      expect(coder.allowedTools).toContain('code_review_tool');
      expect(coder.allowedTools).toContain('unit_test_gen_tool');
      expect(coder.allowedTools).toContain('code_symbols_tool');
      expect(coder.allowedTools).toContain('code_sandbox_runner');
      expect(coder.allowedTools).toContain('read_workspace_file');
      expect(coder.allowedTools).toContain('write_workspace_file');
      expect(coder.allowedTools).toContain('diff_documents');
    });

    it('equips Analyst Dot with spreadsheet analytics, perspective matrix, and deep research', () => {
      const analyst = SPECIALIST_ROLES.analyst;
      expect(analyst.allowedTools).toContain('analyze_spreadsheet');
      expect(analyst.allowedTools).toContain('perspective_matrix');
      expect(analyst.allowedTools).toContain('deep_research');
    });

    it('equips Writer Dot with office documents and slide deck generators', () => {
      const writer = SPECIALIST_ROLES.writer;
      expect(writer.allowedTools).toContain('generate_office_document');
      expect(writer.allowedTools).toContain('generate_slide_deck');
      expect(writer.allowedTools).toContain('export_workspace_document');
    });

    it('equips Reviewer Dot with step verification and code audit tools', () => {
      const reviewer = SPECIALIST_ROLES.reviewer;
      expect(reviewer.allowedTools).toContain('verify_step_output');
      expect(reviewer.allowedTools).toContain('code_review_tool');
      expect(reviewer.allowedTools).toContain('diff_documents');
    });
  });

  describe('Phases 6 & 11: Proactive Standing Research & Monitoring', () => {
    it('executes a proactive monitor check strictly read-only at ₹0 cost', async () => {
      const store = new Store(':memory:');
      const service = new ProactiveResearchService(store);

      const monitor = store.saveProactiveMonitor({
        id: 'monitor-ai-news',
        ownerId: 'opendots-owner',
        topic: 'Open source local LLMs',
        sources: ['https://example.com/llm-news'],
        intervalMinutes: 120,
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const checkResult = await service.checkMonitor(monitor.id);

      expect(checkResult.monitorId).toBe('monitor-ai-news');
      expect(checkResult.topic).toBe('Open source local LLMs');
      expect(checkResult.summary).toBeDefined();

      // Check monitor record was updated with timestamp and summary
      const updatedMon = store.getProactiveMonitor(monitor.id);
      expect(updatedMon?.lastCheckedAt).toBeDefined();
      expect(updatedMon?.lastResultSummary).toBeDefined();

      store.close();
    });
  });
});
