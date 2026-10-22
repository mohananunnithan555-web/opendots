import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  analyzeSpreadsheet,
  generateOfficeDocument,
  generateSlideDeck,
  validateDocumentIntegrity,
} from '../src/server/files/office-document-engine.js';
import {
  FileWorkspace,
  validateArchiveEntryPath,
} from '../src/server/files/file-workspace.js';
import {
  COWORK_WORKFLOW_TEMPLATES,
  getCoworkTemplate,
} from '../src/server/planner/cowork-templates.js';
import { TaskPlanner } from '../src/server/planner/task-planner.js';
import { Store } from '../src/server/store.js';
import { WorkspaceStore } from '../src/server/workspace.js';
import {
  analyzeSpreadsheetTool,
  generateOfficeDocTool,
  generateSlideDeckTool,
  diffDocumentsTool,
} from '../src/server/files/file-tools.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Claude Cowork Feature Suite', () => {
  let tempDir: string;
  let fileWorkspace: FileWorkspace;
  let store: Store;
  let workspace: WorkspaceStore;
  let taskPlanner: TaskPlanner;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opendots-cowork-test-'));
    fileWorkspace = new FileWorkspace(tempDir);
    store = new Store(path.join(tempDir, 'test.db'));
    workspace = new WorkspaceStore(path.join(tempDir, 'workspace.db'), 'test-owner');
    taskPlanner = new TaskPlanner(store);
  });

  afterEach(async () => {
    try {
      workspace.close();
    } catch {
      // ignore
    }
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('Office Document Engine & Spreadsheet Analysis', () => {
    it('parses CSV data, calculates column statistics and evaluates formulas', () => {
      const csvData = [
        'Quarter,Revenue,Expenses,Profit',
        'Q1,100,60,=B2-C2',
        'Q2,150,70,=B3-C3',
        'Q3,200,80,=B4-C4',
        'Total,=SUM(B2:B4),=SUM(C2:C4),=SUM(D2:D4)',
      ].join('\n');

      const result = analyzeSpreadsheet(csvData, 'Quarterly Financials');

      expect(result.fileName).toBe('Quarterly Financials');
      expect(result.rowCount).toBe(4);
      expect(result.columnCount).toBe(4);
      expect(result.columns).toEqual(['Quarter', 'Revenue', 'Expenses', 'Profit']);

      // Check statistics for Revenue column
      const revStats = result.statistics['Revenue'];
      expect(revStats).toBeDefined();
      expect(revStats.count).toBe(3);
      expect(revStats.min).toBe(100);
      expect(revStats.max).toBe(200);
      expect(revStats.mean).toBe(150);

      // Check generated Markdown table
      expect(result.markdownTable).toContain('| Quarter | Revenue | Expenses | Profit |');
      expect(result.markdownTable).toContain('| Q1 | 100 | 60 |');
    });

    it('generates a structured Word-compatible executive report', () => {
      const doc = generateOfficeDocument({
        title: 'Q3 Enterprise Strategy',
        author: 'Lead Architect Dot',
        executiveSummary: 'Comprehensive roadmap for AI agent workspace modernization.',
        sections: [
          {
            title: 'Market Dynamics',
            content: 'Enterprise demand for autonomous workspace agents has grown exponentially.',
            callout: 'Security and sandbox boundaries are the primary adoption bottleneck.',
          },
          {
            title: 'Action Items',
            content: 'Immediate priority is zero-risk artifact sandboxing and deterministic reviews.',
          },
        ],
        recommendations: [
          'Enable local sandboxed workspace files.',
          'Mandate approval center reviews for financial transactions.',
        ],
      });

      expect(doc).toContain('# Q3 Enterprise Strategy');
      expect(doc).toContain('**Author:** Lead Architect Dot');
      expect(doc).toContain('## Executive Summary');
      expect(doc).toContain('> Security and sandbox boundaries are the primary adoption bottleneck.');
      expect(doc).toContain('## References & Verified Sources');
      expect(doc).toContain('Mandate approval center reviews for financial transactions.');
    });

    it('generates a presentation deck model from markdown sections', () => {
      const deck = generateSlideDeck('Agent Strategy Deck', 'Next-Generation Autonomous Cowork Agents');

      expect(deck.title).toBe('Agent Strategy Deck');
      expect(deck.slides.length).toBeGreaterThanOrEqual(3);
      expect(deck.slides[0].title).toBe('Agent Strategy Deck');
      expect(deck.slides[1].title).toBe('Current State & Problem Space');
      expect(deck.slides[1].bullets.length).toBeGreaterThan(0);
    });

    it('validates document integrity, detecting empty content or unclosed blocks', () => {
      const invalidDoc = '## Section 1\n```ts\nconsole.log("unclosed block");';
      const result = validateDocumentIntegrity(invalidDoc);
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Document contains unclosed code blocks (fenced ```)');

      const validDoc = '## Section 1\n```ts\nconsole.log("closed block");\n```\nAll good.';
      const validResult = validateDocumentIntegrity(validDoc);
      expect(validResult.valid).toBe(true);
      expect(validResult.issues.length).toBe(0);
    });
  });

  describe('File Workspace Security & Diff Engine', () => {
    it('defends against Zip-Slip path traversal attacks', () => {
      expect(validateArchiveEntryPath('reports/q3-summary.md')).toBe(true);
      expect(validateArchiveEntryPath('src/components/Card.tsx')).toBe(true);

      // Malicious entries
      expect(validateArchiveEntryPath('../../etc/passwd')).toBe(false);
      expect(validateArchiveEntryPath('../evil.sh')).toBe(false);
      expect(validateArchiveEntryPath('/etc/shadow')).toBe(false);
      expect(validateArchiveEntryPath('C:\\Windows\\System32\\cmd.exe')).toBe(false);
      expect(validateArchiveEntryPath('..\\..\\secret.key')).toBe(false);
    });

    it('isolates files per project space and supports versioning with line diffs', async () => {
      const projectId = 'proj-alpha-123';

      // Write v1
      fileWorkspace.writeVersionedFile(
        'brief.md',
        'Line 1: Introduction\nLine 2: Scope\nLine 3: Conclusion\n',
        'Alice',
        'Initial draft',
        projectId,
        'source',
      );

      // Write v2
      fileWorkspace.writeVersionedFile(
        'brief.md',
        'Line 1: Introduction\nLine 2: Updated Scope and Requirements\nLine 3: Conclusion\nLine 4: Appendix\n',
        'Bob',
        'Expanded scope',
        projectId,
        'deliverable',
      );

      // List files in project
      const files = fileWorkspace.listFiles('', projectId);
      expect(files.length).toBe(1);
      expect(files[0].path).toBe('brief.md');
      expect(files[0].version).toBe(2);
      expect(files[0].category).toBe('deliverable');

      // Compute diff between v1 and v2
      const diff = fileWorkspace.diffVersions('brief.md', 1, 2, projectId);
      expect(diff.file).toBe('brief.md');
      expect(diff.v1).toBe(1);
      expect(diff.v2).toBe(2);
      expect(diff.changes.added).toBeGreaterThan(0);
      expect(diff.changes.removed).toBeGreaterThan(0);
      expect(diff.diff).toContain('+ Line 2: Updated Scope and Requirements');
      expect(diff.diff).toContain('- Line 2: Scope');
    });

    it('ensures separate projects do not leak files to each other', async () => {
      fileWorkspace.writeVersionedFile('secret.md', 'Project 1 data', 'author', 'v1', 'proj-1');
      fileWorkspace.writeVersionedFile('notes.md', 'Project 2 data', 'author', 'v1', 'proj-2');

      const proj1Files = fileWorkspace.listFiles('', 'proj-1');
      const proj2Files = fileWorkspace.listFiles('', 'proj-2');

      expect(proj1Files.map((f) => f.path)).toEqual(['secret.md']);
      expect(proj2Files.map((f) => f.path)).toEqual(['notes.md']);
    });
  });

  describe('12 Cowork Workflow Templates & Task Planner', () => {
    it('defines all 12 required Claude Cowork workflow templates', () => {
      expect(COWORK_WORKFLOW_TEMPLATES.length).toBe(12);

      const templateIds = COWORK_WORKFLOW_TEMPLATES.map((t) => t.id);
      expect(templateIds).toContain('template-1-cited-research');
      expect(templateIds).toContain('template-2-folder-summary');
      expect(templateIds).toContain('template-3-document-comparison');
      expect(templateIds).toContain('template-4-spreadsheet-analysis');
      expect(templateIds).toContain('template-5-presentation-deck');
      expect(templateIds).toContain('template-6-file-organization');
      expect(templateIds).toContain('template-7-repo-review-plan');
      expect(templateIds).toContain('template-8-email-message-drafts');
      expect(templateIds).toContain('template-9-verified-deliverable');
      expect(templateIds).toContain('template-10-scheduled-report');
      expect(templateIds).toContain('template-11-contradiction-review');
      expect(templateIds).toContain('template-12-project-handover');
    });

    it('instantiates a Cowork workflow plan with validation criteria and specialist assignments', () => {
      const plan = taskPlanner.createPlanFromTemplate(
        'cowork_spreadsheet_analysis',
        'Analyze quarterly SaaS churn dataset',
        'finance-space',
      );

      expect(plan.id).toBeDefined();
      expect(plan.spaceId).toBe('finance-space');
      expect(plan.goal).toBe('Analyze quarterly SaaS churn dataset');
      expect(plan.steps.length).toBeGreaterThanOrEqual(2);

      // Check first step
      const step1 = plan.steps[0];
      expect(step1.assignedSpecialist).toBe('analyst');
      expect(step1.tool).toBe('analyze_spreadsheet');
      expect(step1.validationCriteria).toBeDefined();
      expect(step1.validationCriteria?.length).toBeGreaterThan(0);
    });

    it('pauses and resumes task execution cleanly', () => {
      const plan = taskPlanner.createPlan('Test pause resume workflow');
      expect(plan.status).toBe('pending');

      const paused = taskPlanner.pausePlan(plan.id);
      expect(paused.status).toBe('paused');

      const resumed = taskPlanner.resumePlan(plan.id);
      expect(resumed.status).toBe('pending');
    });

    it('replans a step dynamically with explanation and logs', () => {
      const plan = taskPlanner.createPlan('Test dynamic replanning');
      const stepId = plan.steps[0].id;

      const replanned = taskPlanner.replanStep(
        plan.id,
        stepId,
        'API endpoint rate limited, switching to offline fallback archive',
      );

      const step = replanned.steps.find((s) => s.id === stepId);
      expect(step?.status).toBe('pending');
      expect(step?.description).toContain('[Replanned: API endpoint rate limited, switching to offline fallback archive]');
    });
  });

  describe('Project Duplication & Space Cloning', () => {
    it('duplicates an entire project workspace including its pages', () => {
      const original = workspace.createSpace(
        'Alpha Launch',
        'Project Alpha strategic workspace',
        'Deliver Alpha by Q4',
        'Focus on quality and stability',
      );

      workspace.pages.create(original.id, {
        title: 'Architecture Brief',
        content: 'System architecture details',
      });
      workspace.pages.create(original.id, {
        title: 'Roadmap',
        content: 'Milestone dates',
      });

      const duplicated = workspace.duplicateSpace(original.id, 'Alpha Launch (Clone)');

      expect(duplicated.id).not.toBe(original.id);
      expect(duplicated.name).toBe('Alpha Launch (Clone)');
      expect(duplicated.goal).toBe('Deliver Alpha by Q4');
      expect(duplicated.instructions).toBe('Focus on quality and stability');

      const clonedPages = workspace.pages.list(duplicated.id);
      expect(clonedPages.length).toBe(2);
      expect(clonedPages.map((p) => p.title).sort()).toEqual(['Architecture Brief', 'Roadmap'].sort());
    });
  });

  describe('Office Document File Tools Execution', () => {
    it('executes analyzeSpreadsheetTool with mock context', async () => {
      const mockCtx: any = {
        store,
        ownerId: 'test-user',
        sendNotification: () => {},
      };

      const res = await analyzeSpreadsheetTool.execute(
        {
          rawCsv: 'Product,Sales,Units\nWidget,100,5\nGadget,200,10',
          fileName: 'Products',
        },
        mockCtx,
      );

      expect(res.rowCount).toBe(2);
      expect(res.markdownTable).toContain('| Widget | 100 | 5 |');
    });

    it('executes generateOfficeDocTool with mock context', async () => {
      const mockCtx: any = {
        store,
        ownerId: 'test-user',
        sendNotification: () => {},
      };

      const res = await generateOfficeDocTool.execute(
        {
          title: 'Audit Findings',
          executiveSummary: 'Key security observations.',
          sections: [
            {
              heading: 'Permissions',
              body: 'All endpoints properly verified.',
            },
          ],
        },
        mockCtx,
      );

      expect(res.markdownDocument).toContain('# Audit Findings');
      expect(res.markdownDocument).toContain('## Permissions');
    });

    it('executes generateSlideDeckTool with mock context', async () => {
      const mockCtx: any = {
        store,
        ownerId: 'test-user',
        sendNotification: () => {},
      };

      const res = await generateSlideDeckTool.execute(
        {
          title: 'Quarterly Review',
          topic: 'Review of Q3 product metrics and growth trajectory',
          author: 'Analyst Dot',
        },
        mockCtx,
      );

      expect(res.title).toBe('Quarterly Review');
      expect(res.slides.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('New Connectors Availability', () => {
    it('registers onedrive, notion, github, and asana in the store connectors catalog', () => {
      const connectors = store.connectors();
      const types = connectors.map((c) => c.type);

      expect(types).toContain('onedrive');
      expect(types).toContain('notion');
      expect(types).toContain('github');
      expect(types).toContain('asana');

      const github = connectors.find((c) => c.type === 'github');
      expect(github?.name).toContain('GitHub');
      expect(github?.availableActions).toContain('search_repositories');

      const notion = connectors.find((c) => c.type === 'notion');
      expect(notion?.name).toContain('Notion');

      const onedrive = connectors.find((c) => c.type === 'onedrive');
      expect(onedrive?.name).toContain('OneDrive');
    });
  });
});
