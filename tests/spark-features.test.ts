import { describe, expect, it, beforeEach } from 'vitest';
import { Store } from '../src/server/store.js';
import {
  gmailWorkspaceTool,
  sheetsAnalyticsWorkspaceTool,
  calendarTasksWorkspaceTool,
  keepNotesWorkspaceTool,
  docsDriveWorkspaceTool,
  slidesPresentationWorkspaceTool,
} from '../src/server/tools/builtin/workspace-google-tools.js';
import { buildComparisonTable, extractVerifiedAndConflicting } from '../src/server/research/citation-engine.js';
import type { Task, TaskCondition } from '../src/shared/types.js';

describe('OpenDots × Gemini Spark Capability Suite', () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(':memory:');
  });

  describe('1. Conditional Schedules, Topic Diffing & Quiet Hours', () => {
    it('evaluates numeric threshold conditions correctly', () => {
      const condition: TaskCondition = {
        field: 'price',
        operator: 'less_than',
        threshold: 1000,
      };

      const task = store.add({
        id: 't-perfume-1',
        prompt: 'Check perfume discount',
        intervalSeconds: 3600,
        triggerType: 'conditional',
        condition,
      });

      expect(store.evaluateTaskCondition(task, { price: 799 }).shouldTrigger).toBe(true);
      expect(store.evaluateTaskCondition(task, { price: 1200 }).shouldTrigger).toBe(false);
      expect(store.evaluateTaskCondition(task, { price: 1000 }).shouldTrigger).toBe(false);
    });

    it('evaluates string equality and regex conditions correctly', () => {
      const matchCond: TaskCondition = {
        field: 'status',
        operator: 'equals',
        threshold: 'in_stock',
      };
      const regexCond: TaskCondition = {
        field: 'title',
        operator: 'contains',
        threshold: 'amber',
      };

      const task1 = store.add({
        id: 't-stock',
        prompt: 'Track stock',
        intervalSeconds: 900,
        condition: matchCond,
      });
      const task2 = store.add({
        id: 't-regex',
        prompt: 'Track note',
        intervalSeconds: 900,
        condition: regexCond,
      });

      expect(store.evaluateTaskCondition(task1, { status: 'in_stock' }).shouldTrigger).toBe(true);
      expect(store.evaluateTaskCondition(task1, { status: 'out_of_stock' }).shouldTrigger).toBe(false);

      expect(store.evaluateTaskCondition(task2, { title: 'French Amber Eau de Parfum' }).shouldTrigger).toBe(true);
      expect(store.evaluateTaskCondition(task2, { title: 'Pure Vanilla Splash' }).shouldTrigger).toBe(false);
    });

    it('records meaningful change diffs in task change history', () => {
      store.add({
        id: 't-diff',
        prompt: 'Track competitor pricing',
        cadence: '30m',
        state: 'ready',
      });

      const change1 = store.recordTaskChange(
        't-diff',
        'https://example.com/item',
        'Price is ₹1,200',
        'Price dropped from ₹1,400 to ₹1,200',
        true,
      );

      expect(change1).toBeDefined();
      expect(change1?.source).toBe('https://example.com/item');
      expect(change1?.meaningfulChange).toBe(true);

      const loaded = store.task('t-diff');
      expect(loaded?.changeHistory).toHaveLength(1);
      expect(loaded?.changeHistory?.[0].summary).toContain('Price dropped');
    });

    it('accurately identifies quiet hours suppression', () => {
      const quiet = {
        enabled: true,
        startHour: 22,
        endHour: 7,
        timezone: 'UTC',
      };

      // 23:30 UTC is inside quiet hours
      const nightDate = new Date('2026-10-22T23:30:00Z');
      expect(store.isQuietHours(quiet, nightDate)).toBe(true);

      // 14:00 UTC is outside quiet hours
      const dayDate = new Date('2026-10-22T14:00:00Z');
      expect(store.isQuietHours(quiet, dayDate)).toBe(false);

      // Disabled quiet hours always return false
      expect(store.isQuietHours({ ...quiet, enabled: false }, nightDate)).toBe(false);
    });
  });

  describe('2. DAG Dependency Resolution (dependsOn)', () => {
    it('blocks dependent task claim until upstream dependency completes', () => {
      // Step A: Ingestion
      store.add({
        id: 'task-a',
        prompt: 'Fetch latest financial reports',
        cadence: 'none',
        state: 'running',
      });

      // Step B: Analysis (depends on task-a)
      store.add({
        id: 'task-b',
        prompt: 'Synthesize balance sheet data',
        cadence: 'none',
        state: 'ready',
        dependsOn: ['task-a'],
      });

      // Step B should not be claimable while task-a is running
      const firstClaim = store.claim();
      expect(firstClaim?.id).not.toBe('task-b');

      // Now complete task-a
      store.finish('task-a', 'financial report data retrieved');

      // Now task-b should be unblocked and claimed
      const secondClaim = store.claim();
      expect(secondClaim?.id).toBe('task-b');
    });
  });

  describe('3. Unified Notification Center', () => {
    it('creates, reads, marks read, and deletes notifications', () => {
      const n1 = store.createNotification({
        title: 'Price drop detected',
        message: 'Amber Oud dropped below ₹1,000 to ₹899',
        type: 'conditional_trigger',
        priority: 'high',
        sourceId: 't-perfume-1',
        actionUrl: '/tasks',
      });

      const n2 = store.createNotification({
        title: 'Approval Required',
        message: 'External email send needs your authorization',
        type: 'approval_required',
        priority: 'urgent',
        actionUrl: '/approvals',
      });

      expect(store.unreadNotificationCount()).toBe(2);

      const all = store.notifications();
      expect(all).toHaveLength(2);
      expect(all[0].id).toBe(n2.id); // Sorted newest first

      // Mark n1 as read
      store.markNotificationRead(n1.id);
      expect(store.unreadNotificationCount()).toBe(1);

      // Mark all read
      store.markAllNotificationsRead();
      expect(store.unreadNotificationCount()).toBe(0);

      // Delete n2
      store.deleteNotification(n2.id);
      expect(store.notifications()).toHaveLength(1);
    });

    it('automatically generates notifications on task finish and failure', () => {
      store.add({
        id: 'task-auto',
        prompt: 'Automated synthesis',
        cadence: 'none',
        state: 'running',
      });

      store.finish('task-auto', 'Report finished successfully');

      const notifs = store.notifications();
      expect(notifs.some((n) => n.title.includes('Task Completed'))).toBe(true);
    });
  });

  describe('4. Advanced Google Workspace Tools', () => {
    const mockCtx = {} as any;

    it('gmailWorkspaceTool summarizes and drafts emails without paid APIs', async () => {
      const searchRes = await gmailWorkspaceTool.execute({
        action: 'search_messages',
        query: 'contract review',
        maxResults: 5,
      }, mockCtx);

      expect(searchRes.success).toBe(true);
      expect(searchRes.data.messages.length).toBeGreaterThan(0);

      const draftRes = await gmailWorkspaceTool.execute({
        action: 'draft_reply',
        to: 'partner@example.com',
        subject: 'Contract updates',
        body: 'Here are the reviewed terms for 2026.',
      }, mockCtx);

      expect(draftRes.success).toBe(true);
      expect(draftRes.data.draftId).toBeDefined();
    });

    it('sheetsAnalyticsWorkspaceTool performs statistical analytics locally and freely', async () => {
      const statsRes = await sheetsAnalyticsWorkspaceTool.execute({
        action: 'calculate_statistics',
        sheetId: 'sheet-financial-2026',
        range: 'Q1!C2:C10',
        values: [100, 200, 300, 400, 500, 600, 700, 800, 900],
      }, mockCtx);

      expect(statsRes.success).toBe(true);
      expect(statsRes.data.count).toBe(9);
      expect(statsRes.data.mean).toBe(500);
      expect(statsRes.data.sum).toBe(4500);
      expect(statsRes.data.median).toBe(500);
      expect(statsRes.data.min).toBe(100);
      expect(statsRes.data.max).toBe(900);
    });

    it('calendarTasksWorkspaceTool manages schedule and creates action items', async () => {
      const eventRes = await calendarTasksWorkspaceTool.execute({
        action: 'create_event',
        title: 'Q4 Product Roadmap Strategy',
        startIso: '2026-11-01T10:00:00Z',
        endIso: '2026-11-01T11:00:00Z',
        description: 'Review quarterly progress and dependencies',
      }, mockCtx);

      expect(eventRes.success).toBe(true);
      expect(eventRes.data.event.id).toBeDefined();

      const taskRes = await calendarTasksWorkspaceTool.execute({
        action: 'create_task',
        title: 'Review supplier SLA',
        dueIso: '2026-11-02T18:00:00Z',
      }, mockCtx);

      expect(taskRes.success).toBe(true);
      expect(taskRes.data.task.title).toBe('Review supplier SLA');
    });

    it('keepNotesWorkspaceTool captures structured notes and tags', async () => {
      const noteRes = await keepNotesWorkspaceTool.execute({
        action: 'create_note',
        title: 'Agent Orchestration Architecture',
        content: 'Use DAG dependencies and durable SQLite checkpoints.',
        tags: ['architecture', 'opendots'],
      }, mockCtx);

      expect(noteRes.success).toBe(true);
      expect(noteRes.data.note.id).toBeDefined();

      const searchRes = await keepNotesWorkspaceTool.execute({
        action: 'search_notes',
        query: 'architecture',
      }, mockCtx);

      expect(searchRes.success).toBe(true);
      expect(searchRes.data.results.length).toBeGreaterThan(0);
    });

    it('docsDriveWorkspaceTool and slidesPresentationWorkspaceTool execute correctly', async () => {
      const docRes = await docsDriveWorkspaceTool.execute({
        action: 'create_document',
        title: 'Executive Briefing',
        content: '# Executive Summary\nAll key deliverables are on schedule.',
      }, mockCtx);
      expect(docRes.success).toBe(true);

      const slideRes = await slidesPresentationWorkspaceTool.execute({
        action: 'generate_deck',
        title: 'Spark AI Architecture',
        slides: [
          { title: 'Intro', bulletPoints: ['Autonomous DAG', 'Zero-cost stack'] },
          { title: 'Next Steps', bulletPoints: ['Production verification'] },
        ],
      }, mockCtx);
      expect(slideRes.success).toBe(true);
      expect(slideRes.data.slideCount).toBe(2);
    });
  });

  describe('5. Multi-Source Research Engine Upgrades', () => {
    it('buildComparisonTable formats structured markdown matrix with citations', () => {
      const matrix = [
        {
          item: 'Model A',
          criteria: { Latency: '120ms', Cost: '$0.00', Reliability: '99.9%' },
          sources: ['https://example.com/sourceA'],
        },
        {
          item: 'Model B',
          criteria: { Latency: '450ms', Cost: '$0.02', Reliability: '98.5%' },
          sources: ['https://example.com/sourceB'],
        },
      ];

      const tableMd = buildComparisonTable(matrix);
      expect(tableMd).toContain('| Item | Latency | Cost | Reliability | Sources |');
      expect(tableMd).toContain('Model A');
      expect(tableMd).toContain('Model B');
      expect(tableMd).toContain('[1](https://example.com/sourceA)');
    });

    it('extractVerifiedAndConflicting classifies facts, claims, and uncertainties', () => {
      const items = [
        {
          text: 'OpenDots is deployed on Render free tier',
          sourceUrl: 'https://opendots-1j9k.onrender.com',
          domain: 'render.com',
          isConsensus: true,
          corroboratingCount: 3,
        },
        {
          text: 'Render service may reboot after idle timeout',
          sourceUrl: 'https://render.com/docs/free',
          domain: 'render.com',
          isContested: true,
          notes: 'Persistent disk preserves SQLite DB',
        },
        {
          text: 'Upcoming hardware expansion timeline',
          sourceUrl: 'https://example.com/rumors',
          domain: 'example.com',
          confidence: 0.4,
        },
      ];

      const classified = extractVerifiedAndConflicting(items);
      expect(classified.verifiedFacts).toHaveLength(1);
      expect(classified.conflictingClaims).toHaveLength(1);
      expect(classified.uncertainties).toHaveLength(1);
      expect(classified.verifiedFacts[0]).toContain('OpenDots is deployed');
    });
  });
});
