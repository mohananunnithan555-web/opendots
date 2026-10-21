import { describe, expect, it, beforeEach } from 'vitest';
import { Store } from '../src/server/store.js';
import { globalToolRegistry } from '../src/server/tools/tool-registry.js';
import { shoppingResearchTool } from '../src/server/tools/builtin/shopping-research.js';
import { instagramResearchTool } from '../src/server/tools/builtin/instagram-research.js';
import { executionReportTool } from '../src/server/tools/builtin/execution-report.js';
import { stepVerifierTool } from '../src/server/tools/builtin/step-verifier.js';

describe('OpenDots × Muse Complete Feature Suite', () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(':memory:');
  });

  describe('A. Personal Memory Export & Category Purge', () => {
    it('exports memories to clean Markdown format with categories', () => {
      store.saveMemoryV2({
        text: 'Prefers TypeScript with strict mode',
        category: 'preference',
        confidence: 0.95,
      });
      store.saveMemoryV2({
        text: 'OpenDots master upgrade target URL',
        category: 'project',
        confidence: 1.0,
      });

      const mdExport = store.exportMemories('markdown');
      expect(mdExport).toContain('# OpenDots Persistent Personal Memory Export');
      expect(mdExport).toContain('PREFERENCE');
      expect(mdExport).toContain('Prefers TypeScript with strict mode');
      expect(mdExport).toContain('PROJECT');

      const jsonExport = store.exportMemories('json');
      const parsed = JSON.parse(jsonExport);
      expect(parsed).toHaveLength(2);
    });

    it('purges memories by specific category without affecting others', () => {
      store.saveMemoryV2({ text: 'Pref 1', category: 'preference' });
      store.saveMemoryV2({ text: 'Proj 1', category: 'project' });

      const deleted = store.purgeMemories('preference');
      expect(deleted).toBe(1);

      const remaining = store.memoriesV2();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].category).toBe('project');
    });
  });

  describe('B. Long-Term Goals & Proactive Suggestions', () => {
    it('creates, tracks milestones, and updates goals', () => {
      const goal = store.createGoal({
        title: 'Launch AI Agent on Production',
        description: 'Zero cost Render deployment with full autonomy',
        category: 'project',
        priority: 'high',
        targetDate: Date.now() + 86400000 * 5,
        milestones: [
          { id: 'm1', title: 'Code audit', completed: true },
          { id: 'm2', title: 'Approval center', completed: false },
        ],
      });

      expect(goal.id).toBeDefined();
      expect(goal.status).toBe('active');
      expect(goal.milestones).toHaveLength(2);

      const updated = store.updateGoal(goal.id, {
        milestones: [
          { id: 'm1', title: 'Code audit', completed: true },
          { id: 'm2', title: 'Approval center', completed: true },
        ],
        status: 'completed',
      });

      expect(updated.status).toBe('completed');
      expect(updated.milestones[1].completed).toBe(true);
    });

    it('generates proactive suggestions for goals needing milestones or approaching deadlines', () => {
      store.createGoal({
        title: 'Empty Goal with No Milestones',
        category: 'learning',
        priority: 'medium',
        milestones: [],
      });

      const suggestions = store.proactiveGoalSuggestions();
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].title).toContain('Break down');
      expect(suggestions[0].urgency).toBe('medium');
    });
  });

  describe('C. Autonomous Execution Tools & Deliverable Reports', () => {
    it('stepVerifierTool verifies outputs against criteria and flags errors', async () => {
      const successRes = await stepVerifierTool.execute(
        {
          stepTitle: 'Write database schema',
          acceptanceCriteria: ['Must create table goals', 'Must add indexes'],
          outputToVerify: 'Successfully executed SQL: CREATE TABLE goals and created indexes for ownerId.',
        },
        {},
      );

      expect(successRes.verified).toBe(true);
      expect(successRes.recommendation).toBe('proceed');
      expect(successRes.confidence).toBeGreaterThanOrEqual(0.5);

      const failRes = await stepVerifierTool.execute(
        {
          stepTitle: 'Run external sync',
          acceptanceCriteria: ['Sync complete without error'],
          outputToVerify: 'Fatal error: failed to connect to host.',
        },
        {},
      );

      expect(failRes.verified).toBe(false);
      expect(failRes.recommendation).toBe('replan');
    });

    it('executionReportTool exports structured deliverables to workspace', async () => {
      const report = await executionReportTool.execute(
        {
          title: 'Master Architectural Upgrade',
          objective: 'Upgrade agent capabilities to Muse parity',
          completedSteps: ['Database schema migrated', 'Approval Center implemented', 'Connectors active'],
          filesCreated: ['src/client/ApprovalCenter.tsx', 'src/client/GoalsDashboard.tsx'],
          keyFindings: ['Zero cost maintained', 'All tests passing'],
        },
        {},
      );

      expect(report.reportFileName).toContain('.md');
      expect(report.markdown).toContain('# Execution Deliverable: Master Architectural Upgrade');
      expect(report.markdown).toContain('Zero cost maintained');
    });
  });

  describe('E. Connectors & External Applications', () => {
    it('seeds default connectors (Gmail, Calendar, Drive, Instagram, Telegram, WhatsApp, Slack)', () => {
      const conns = store.connectors();
      expect(conns.length).toBeGreaterThanOrEqual(7);

      const types = conns.map((c) => c.type);
      expect(types).toContain('gmail');
      expect(types).toContain('google_calendar');
      expect(types).toContain('google_drive');
      expect(types).toContain('instagram');
      expect(types).toContain('slack');
      expect(types).toContain('whatsapp');
      expect(types).toContain('telegram');
    });

    it('tests connector ping and manages connection status', () => {
      const res = store.testConnector('instagram');
      expect(res.success).toBe(true);
      expect(res.message).toContain('Instagram public research engine is verified');

      const disconnected = store.disconnectConnector('instagram');
      expect(disconnected.status).toBe('disconnected');
    });
  });

  describe('F. Central Approval Center', () => {
    it('creates, inspects, and decides approvals with consequences and cost tracking', () => {
      const approval = store.createApproval({
        actionType: 'purchase',
        title: 'Order replacement mechanical switches',
        description: 'Order 70x Gateron Yellow switches from verified vendor',
        destination: 'https://store.example.com/cart',
        payload: { quantity: 70, item: 'Gateron Yellow' },
        estimatedCost: '$24.50 USD',
        consequences: 'Credit card will be charged $24.50 USD upon confirmation.',
      });

      expect(approval.id).toBeDefined();
      expect(approval.status).toBe('pending');
      expect(approval.estimatedCost).toBe('$24.50 USD');

      const approved = store.decideApproval(approval.id, 'approved', 'tester');
      expect(approved.status).toBe('approved');
      expect(approved.decidedBy).toBe('tester');
      expect(approved.decidedAt).toBeGreaterThan(0);
    });
  });

  describe('J & L. Shopping & Instagram Research Builtin Tools', () => {
    it('shoppingResearchTool extracts products and produces comparison table', async () => {
      const result = await shoppingResearchTool.execute(
        {
          productQuery: 'mechanical keyboard',
          budget: 100,
          currency: 'USD',
        },
        {},
      );

      expect(result.products.length).toBeGreaterThan(0);
      expect(result.comparisonMarkdown).toContain('### Shopping Comparison: mechanical keyboard');
      expect(result.comparisonMarkdown).toContain('| Product / Model |');
    });

    it('instagramResearchTool inspects public targets with transparency disclaimer', async () => {
      const res = await instagramResearchTool.execute(
        {
          target: '@openai',
          type: 'profile',
        },
        {},
      );

      expect(res.isPublic).toBe(true);
      expect(res.handleOrTag).toBe('openai');
      expect(res.transparencyNote).toContain('Notice: OpenDots queries only verified public web metadata');
    });
  });

  describe('K. Document Snapshots & Rollback', () => {
    it('saves versions and retrieves history', () => {
      const s1 = store.saveDocumentSnapshot('notes.md', '# Version 1', 'Initial draft');
      expect(s1.version).toBe(1);

      const s2 = store.saveDocumentSnapshot('notes.md', '# Version 2', 'Added milestones');
      expect(s2.version).toBe(2);

      const snapshots = store.documentSnapshots('notes.md');
      expect(snapshots).toHaveLength(2);
      expect(snapshots[0].version).toBe(2);
      expect(snapshots[1].version).toBe(1);
    });
  });
});
