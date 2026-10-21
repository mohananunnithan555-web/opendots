import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Store } from '../src/server/store.js';
import { WorkspaceStore } from '../src/server/workspace.js';
import { Platform } from '../src/server/platform.js';
import { Runner } from '../src/server/runner.js';
import { createApp } from '../src/server/app.js';

describe('Cloud Task Execution & Scheduling Queue (Phase 8 & 9)', () => {
  let store: Store;
  let workspace: WorkspaceStore;
  let runner: Runner;

  beforeEach(() => {
    store = new Store(':memory:');
    workspace = new WorkspaceStore(':memory:', 'owner-test');
    runner = new Runner(store, { mode: 'live', baseUrl: 'https://api.openai.com/v1' } as any);
  });

  afterEach(() => {
    runner.stop();
    workspace.close();
    store.close();
  });

  it('queues a headless cloud task and automatically creates a dedicated thread', async () => {
    const platform = new Platform(store, workspace, {
      model: 'gemini-3.8-flash',
    } as any);
    const app = createApp({
      store,
      runner,
      config: { mode: 'live' } as any,
      platform,
    });

    const res = await app.request('/api/cloud-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Research breakthroughs in generative video models for 2026',
        timezone: 'Asia/Kolkata',
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      task: { id: string; prompt: string; status: string };
      threadId: string;
      timezone: string;
      status: string;
    };

    expect(body.task.id).toBeDefined();
    expect(body.task.prompt).toContain('generative video');
    expect(body.status).toBe('queued');
    expect(body.threadId).toBeDefined();

    // Verify thread was created and bound
    const thread = workspace.conversations().find((t) => t.id === body.threadId);
    expect(thread).toBeDefined();
    expect(thread?.title).toContain('Cloud Task');

    // Verify task is claimable in store
    const claim = store.claim(Date.now(), 60000);
    expect(claim).toBeDefined();
    expect(claim?.id).toBe(body.task.id);
  });

  it('schedules delayed and recurring cloud tasks with timezone metadata', async () => {
    const platform = new Platform(store, workspace, {
      model: 'gemini-3.8-flash',
    } as any);
    const app = createApp({
      store,
      runner,
      config: { mode: 'live' } as any,
      platform,
    });

    const delaySec = 3600; // 1 hour delay
    const now = Date.now();
    const res = await app.request('/api/cloud-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Hourly sync of customer analytics',
        delaySeconds: delaySec,
        intervalSeconds: 3600,
        timezone: 'America/New_York',
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      task: { id: string; nextRunAt: number; intervalSeconds: number };
      timezone: string;
    };

    expect(body.task.intervalSeconds).toBe(3600);
    expect(body.task.nextRunAt).toBeGreaterThanOrEqual(now + 3590 * 1000);
    expect(body.timezone).toBe('America/New_York');

    // Delayed task should NOT be claimable right now
    const immediateClaim = store.claim(now, 60000);
    expect(immediateClaim).toBeNull();
  });

  it('lists cloud tasks with run details and supports deletion', async () => {
    const platform = new Platform(store, workspace, {
      model: 'gemini-3.8-flash',
    } as any);
    const app = createApp({
      store,
      runner,
      config: { mode: 'live' } as any,
      platform,
    });

    // Create cloud task
    const createRes = await app.request('/api/cloud-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Generate monthly SEO report',
      }),
    });
    const { task } = (await createRes.json()) as { task: { id: string } };

    // List cloud tasks
    const listRes = await app.request('/api/cloud-tasks');
    expect(listRes.status).toBe(200);
    const tasks = (await listRes.json()) as Array<{ id: string; prompt: string }>;
    expect(tasks.some((t) => t.id === task.id)).toBe(true);

    // Delete cloud task
    const deleteRes = await app.request(`/api/tasks/${task.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(deleteRes.status).toBe(200);

    const postDeleteList = await app.request('/api/cloud-tasks');
    const remaining = (await postDeleteList.json()) as Array<{ id: string }>;
    expect(remaining.some((t) => t.id === task.id)).toBe(false);
  });
});
