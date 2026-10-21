import { describe, expect, it } from 'vitest';
import { Store } from '../src/server/store.js';

describe('Background Task Scheduler & Retry Engine (Phase 9)', () => {
  it('creates and schedules recurring background tasks', () => {
    const store = new Store(':memory:');
    const task = store.createTask('Summarize tech news each morning', 86400);

    expect(task.id).toBeDefined();
    expect(task.status).toBe('queued');
    expect(task.intervalSeconds).toBe(86400);

    const reloaded = store.task(task.id);
    expect(reloaded?.intervalSeconds).toBe(86400);

    store.close();
  });

  it('retries transient failures with exponential backoff when maxRetries > 0', () => {
    const store = new Store(':memory:');
    const task = store.createTask('Periodic check', 3600);

    const claim1 = store.claim(Date.now(), 60_000);
    expect(claim1).toBeDefined();

    // First failure triggers retry 1 with exponential backoff
    store.fail(claim1!, 'Network gateway timeout', 2);

    const taskAfterFail1 = store.task(task.id);
    expect(taskAfterFail1?.status).toBe('queued'); // re-queued for retry
    expect(taskAfterFail1?.nextRunAt).toBeGreaterThan(Date.now());
    expect(taskAfterFail1?.error).toContain('Attempt 1 failed');

    // Claim next retry run
    const claim2 = store.claim(taskAfterFail1!.nextRunAt!, 60_000);
    expect(claim2).toBeDefined();

    // Second failure triggers retry 2
    store.fail(claim2!, 'Server unreachable', 2);
    const taskAfterFail2 = store.task(task.id);
    expect(taskAfterFail2?.status).toBe('queued');
    expect(taskAfterFail2?.error).toContain('Attempt 2 failed');

    // Claim 3rd run and fail exceeding maxRetries=2
    const claim3 = store.claim(taskAfterFail2!.nextRunAt!, 60_000);
    store.fail(claim3!, 'Still down', 2);

    const taskExhausted = store.task(task.id);
    expect(taskExhausted?.status).toBe('failed');
    // For recurring tasks, the next regular interval is still scheduled!
    expect(taskExhausted?.nextRunAt).toBeGreaterThan(Date.now() + 3500 * 1000);

    store.close();
  });

  it('allows users to pause and resume scheduled tasks', () => {
    const store = new Store(':memory:');
    const task = store.createTask('Generate weekly report', 604800);

    // Pause task
    const paused = store.action(task.id, 'pause');
    expect(paused?.status).toBe('paused');
    expect(paused?.nextRunAt).toBeNull();

    // Cannot claim paused task
    const claim = store.claim(Date.now(), 60_000);
    expect(claim).toBeNull();

    // Resume task
    const resumed = store.action(task.id, 'run');
    expect(resumed?.status).toBe('queued');
    expect(resumed?.nextRunAt).toBeNull(); // ready immediately
    expect(store.claim(Date.now(), 60_000)?.id).toBe(task.id);

    store.close();
  });

  it('allows users to delete scheduled tasks and cascades run history', () => {
    const store = new Store(':memory:');
    const task = store.createTask('Temporary task to remove');

    const claim = store.claim(Date.now(), 60_000);
    store.finish(claim!, { text: 'Done', sources: [], sample: false });

    expect(store.detail(task.id)?.runs).toHaveLength(1);

    // Delete task
    const deleted = store.deleteTask(task.id);
    expect(deleted).toBe(true);

    expect(store.task(task.id)).toBeUndefined();
    expect(store.detail(task.id)).toBeUndefined();

    store.close();
  });
});
