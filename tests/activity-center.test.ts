import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Store } from '../src/server/store.js';
import { WorkspaceStore } from '../src/server/workspace.js';
import { createApp } from '../src/server/app.js';
import { SPECIALIST_ROLES } from '../src/server/specialists/specialist-roles.js';

describe('Activity Center & Reviewer Specialist (Phase 11 & 12)', () => {
  let store: Store;
  let workspace: WorkspaceStore;

  beforeEach(() => {
    store = new Store(':memory:');
    workspace = new WorkspaceStore(':memory:', 'owner-test');
  });

  afterEach(() => {
    workspace.close();
    store.close();
  });

  it('contains Reviewer Dot in specialist roles and auto-seeds on startup', () => {
    expect(SPECIALIST_ROLES.reviewer).toBeDefined();
    expect(SPECIALIST_ROLES.reviewer.name).toBe('Reviewer Dot');
    expect(SPECIALIST_ROLES.reviewer.tagline).toContain('Quality audit');

    const dots = workspace.dots();
    const reviewerDot = dots.find((d) => d.name === 'Reviewer Dot');
    expect(reviewerDot).toBeDefined();
    expect(reviewerDot?.instructions).toContain('Specialist Reviewer');
  });

  it('aggregates events, plans, and memories into a unified activity stream', async () => {
    // 1. Add task event
    store.event('task-101', 'run-1', 'Started web scrape for benchmark data');

    // 2. Add plan
    store.saveTaskPlan({
      goal: 'Audit system security posture',
      status: 'running',
      currentStepIndex: 1,
      steps: [
        {
          id: 's1',
          title: 'Review endpoints',
          description: 'Check auth middleware',
          status: 'completed',
        },
        {
          id: 's2',
          title: 'Audit permissions',
          description: 'Verify RBAC',
          status: 'running',
        },
      ],
    });

    // 3. Add memory
    store.saveMemoryV2({
      text: 'Preferred styling: dark mode and high contrast charts',
      category: 'preference',
    });

    const app = createApp({
      store,
      runner: {} as any,
      config: { mode: 'live' } as any,
    });

    const res = await app.request('/api/activity?limit=10');
    expect(res.status).toBe(200);

    const feed = (await res.json()) as Array<{
      id: string;
      type: string;
      title: string;
      description: string;
      timestamp: number;
    }>;

    expect(feed.length).toBeGreaterThanOrEqual(3);

    const types = feed.map((item) => item.type);
    expect(types).toContain('task');
    expect(types).toContain('plan');
    expect(types).toContain('memory');

    // Chronologically sorted (descending)
    for (let i = 0; i < feed.length - 1; i++) {
      expect(feed[i].timestamp).toBeGreaterThanOrEqual(feed[i + 1].timestamp);
    }
  });
});
