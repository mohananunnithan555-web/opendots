import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  containsSensitiveSecret,
  sanitizeMemoryContent,
  type MemoryCategory,
  type MemoryFilter,
  type MemoryRecord,
} from './memory-types.js';
import type { TaskPlan } from './planner/types.js';
import type {
  Action,
  Detail,
  Memory,
  Result,
  Run,
  Settings,
  Task,
  TaskEvent,
} from '../shared/types.js';

export type Claim = Task & { lease: string };
export const DEFAULT_WORKER_LEASE_MS = 180_000;
const defaults: Settings = {
  name: 'Dot',
  paused: false,
  researchAllowed: true,
  memoryAllowed: true,
  appsAllowed: true,
};
export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS setup_telemetry (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, prompt TEXT NOT NULL, status TEXT NOT NULL, intervalSeconds INTEGER, nextRunAt INTEGER, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, error TEXT, lease TEXT, leaseUntil INTEGER);
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, taskId TEXT NOT NULL, status TEXT NOT NULL, startedAt INTEGER NOT NULL, finishedAt INTEGER, result TEXT, error TEXT);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, taskId TEXT NOT NULL, runId TEXT, text TEXT NOT NULL, createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, text TEXT NOT NULL, createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS memories_v2 (
        id TEXT PRIMARY KEY,
        ownerId TEXT NOT NULL,
        category TEXT NOT NULL,
        text TEXT NOT NULL,
        confidence REAL DEFAULT 1.0,
        pinned INTEGER DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'user_explicit',
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        lastAccessedAt INTEGER
      );
      CREATE INDEX IF NOT EXISTS tasks_due ON tasks(status, nextRunAt);
      CREATE INDEX IF NOT EXISTS runs_task ON runs(taskId, startedAt);
      CREATE INDEX IF NOT EXISTS events_task ON events(taskId, id);
      CREATE INDEX IF NOT EXISTS memories_v2_owner_cat ON memories_v2(ownerId, category);
      CREATE INDEX IF NOT EXISTS memories_v2_created ON memories_v2(createdAt DESC);
      CREATE TABLE IF NOT EXISTS task_plans (
        id TEXT PRIMARY KEY,
        ownerId TEXT NOT NULL DEFAULT 'opendots-owner',
        goal TEXT NOT NULL,
        status TEXT NOT NULL,
        currentStepIndex INTEGER NOT NULL DEFAULT 0,
        stepsJson TEXT NOT NULL,
        finalResult TEXT,
        error TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS task_plans_owner ON task_plans(ownerId, createdAt DESC);`);

    // Migrate any legacy rows into memories_v2
    try {
      const legacyRows = this.db
        .prepare('SELECT * FROM memories')
        .all() as unknown as Array<{ id: string; text: string; createdAt: number }>;
      for (const row of legacyRows) {
        this.db
          .prepare(
            `INSERT OR IGNORE INTO memories_v2 (id, ownerId, category, text, confidence, pinned, source, createdAt, updatedAt)
             VALUES (?, 'opendots-owner', 'preference', ?, 1.0, 0, 'user_explicit', ?, ?)`,
          )
          .run(row.id, row.text, row.createdAt, row.createdAt);
      }
    } catch {}

    this.db
      .prepare('INSERT OR IGNORE INTO settings VALUES (1, ?)')
      .run(JSON.stringify(defaults));
  }
  setupTelemetryState(): string | undefined {
    return (
      this.db.prepare('SELECT value FROM setup_telemetry WHERE id=1').get() as
        { value: string } | undefined
    )?.value;
  }
  saveSetupTelemetryState(value: string) {
    this.db
      .prepare('INSERT OR REPLACE INTO setup_telemetry VALUES (1, ?)')
      .run(value);
  }
  clearSetupTelemetry() {
    this.db.prepare('DELETE FROM setup_telemetry').run();
  }
  close() {
    this.db.close();
  }
  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      this.db.exec('COMMIT');
      return value;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  settings(): Settings {
    const row = this.db
      .prepare('SELECT value FROM settings WHERE id=1')
      .get() as { value: string };
    return { ...defaults, ...(JSON.parse(row.value) as Partial<Settings>) };
  }
  updateSettings(patch: Partial<Settings>): Settings {
    return this.transaction(() => {
      const previous = this.settings();
      const settings = { ...previous, ...patch };
      this.db
        .prepare('UPDATE settings SET value=? WHERE id=1')
        .run(JSON.stringify(settings));
      if (
        (!previous.paused && settings.paused) ||
        (previous.researchAllowed && !settings.researchAllowed) ||
        (previous.memoryAllowed && !settings.memoryAllowed) ||
        (previous.appsAllowed && !settings.appsAllowed)
      ) {
        const running = this.tasks().filter((t) => t.status === 'running');
        for (const task of running) {
          this.invalidate(
            task,
            'interrupted',
            'Run interrupted because settings changed. Review completed effects before retrying.',
          );
        }
      }
      return settings;
    });
  }
  tasks(): Task[] {
    return this.db
      .prepare('SELECT * FROM tasks ORDER BY createdAt DESC')
      .all() as unknown as Task[];
  }
  task(id: string): Task | undefined {
    return this.db
      .prepare('SELECT * FROM tasks WHERE id=?')
      .get(id) as unknown as Task | undefined;
  }
  createTask(prompt: string, intervalSeconds: number | null = null): Task {
    const now = Date.now();
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO tasks VALUES (?, ?, 'queued', ?, NULL, ?, ?, NULL, NULL, NULL)",
      )
      .run(id, prompt, intervalSeconds, now, now);
    this.event(id, null, 'Task added to the queue.');
    return this.task(id)!;
  }
  detail(id: string): Detail | undefined {
    const task = this.task(id);
    if (!task) return undefined;
    const rows = this.db
      .prepare(
        'SELECT * FROM runs WHERE taskId=? ORDER BY startedAt DESC, rowid DESC',
      )
      .all(id) as unknown as (Omit<Run, 'result'> & {
      result: string | null;
    })[];
    return {
      task,
      runs: rows.map((row) => ({
        ...row,
        result: row.result ? (JSON.parse(row.result) as Result) : null,
      })),
      events: this.db
        .prepare('SELECT * FROM events WHERE taskId=? ORDER BY id')
        .all(id) as unknown as TaskEvent[],
    };
  }
  event(taskId: string, runId: string | null, text: string) {
    this.db
      .prepare(
        'INSERT INTO events (taskId, runId, text, createdAt) VALUES (?, ?, ?, ?)',
      )
      .run(taskId, runId, text, Date.now());
  }
  private invalidate(task: Task, status: string, reason: string) {
    const now = Date.now();
    if (task.lease)
      this.db
        .prepare(
          "UPDATE runs SET status='interrupted', finishedAt=?, error=? WHERE id=? AND status='running'",
        )
        .run(now, reason, task.lease);
    this.db
      .prepare(
        'UPDATE tasks SET status=?, lease=NULL, leaseUntil=NULL, updatedAt=?, error=? WHERE id=?',
      )
      .run(status, now, status === 'interrupted' ? reason : null, task.id);
    this.event(task.id, task.lease, reason);
  }
  action(id: string, action: Action): Task | undefined {
    return this.transaction(() => {
      const task = this.task(id);
      if (!task) return undefined;
      if (action === 'run' && task.status === 'running') return task;
      const status =
        action === 'run'
          ? 'queued'
          : action === 'pause'
            ? 'paused'
            : 'cancelled';
      this.invalidate(
        task,
        status,
        action === 'run' ? 'Task queued for a new run.' : `Task ${status}.`,
      );
      this.db
        .prepare('UPDATE tasks SET error=NULL, nextRunAt=NULL WHERE id=?')
        .run(id);
      return this.task(id);
    });
  }
  schedule(id: string, intervalSeconds: number | null): Task | undefined {
    const task = this.task(id);
    if (!task) return undefined;
    const next =
      intervalSeconds && task.status === 'completed'
        ? Date.now() + intervalSeconds * 1000
        : null;
    this.db
      .prepare(
        'UPDATE tasks SET intervalSeconds=?, nextRunAt=?, updatedAt=? WHERE id=?',
      )
      .run(intervalSeconds, next, Date.now(), id);
    this.event(
      id,
      null,
      intervalSeconds
        ? `Repeats every ${intervalSeconds / 60} minutes after a successful run.`
        : 'Repeat schedule removed.',
    );
    return this.task(id);
  }
  deleteTask(id: string): boolean {
    return this.transaction(() => {
      this.db.prepare('DELETE FROM events WHERE taskId=?').run(id);
      this.db.prepare('DELETE FROM runs WHERE taskId=?').run(id);
      return (
        Number(this.db.prepare('DELETE FROM tasks WHERE id=?').run(id).changes) > 0
      );
    });
  }
  claim(
    now = Date.now(),
    leaseDurationMs = DEFAULT_WORKER_LEASE_MS,
  ): Claim | null {
    return this.transaction(() => {
      const settings = this.settings();
      if (settings.paused || !settings.researchAllowed) return null;
      const expired = this.db
        .prepare("SELECT * FROM tasks WHERE status='running' AND leaseUntil<=?")
        .all(now) as unknown as Task[];
      for (const task of expired)
        this.invalidate(
          task,
          'interrupted',
          'Worker lease expired. Review completed effects before retrying.',
        );
      const task = this.db
        .prepare(
          "SELECT * FROM tasks WHERE status='queued' OR (status='completed' AND nextRunAt IS NOT NULL AND nextRunAt<=?) ORDER BY createdAt LIMIT 1",
        )
        .get(now) as unknown as Task | undefined;
      if (!task) return null;
      const lease = randomUUID();
      this.db
        .prepare(
          "UPDATE tasks SET status='running', lease=?, leaseUntil=?, nextRunAt=NULL, error=NULL, updatedAt=? WHERE id=?",
        )
        .run(lease, now + leaseDurationMs, now, task.id);
      this.db
        .prepare(
          "INSERT INTO runs VALUES (?, ?, 'running', ?, NULL, NULL, NULL)",
        )
        .run(lease, task.id, now);
      this.event(task.id, lease, 'Run started.');
      return { ...this.task(task.id)!, lease };
    });
  }
  owns(claim: Claim): boolean {
    const task = this.task(claim.id);
    return task?.status === 'running' && task.lease === claim.lease;
  }
  finish(claim: Claim, result: Result, now = Date.now()): boolean {
    return this.transaction(() => {
      if (!this.owns(claim)) return false;
      const task = this.task(claim.id)!;
      this.db
        .prepare(
          "UPDATE runs SET status='completed', finishedAt=?, result=? WHERE id=?",
        )
        .run(now, JSON.stringify(result), claim.lease);
      this.db
        .prepare(
          "UPDATE tasks SET status='completed', lease=NULL, leaseUntil=NULL, updatedAt=?, nextRunAt=? WHERE id=?",
        )
        .run(
          now,
          task.intervalSeconds ? now + task.intervalSeconds * 1000 : null,
          claim.id,
        );
      this.event(
        claim.id,
        claim.lease,
        result.sample ? 'Fictional sample brief ready.' : 'Run completed.',
      );
      return true;
    });
  }
  interrupt(claim: Claim, reason: string) {
    this.transaction(() => {
      if (this.owns(claim)) this.invalidate(claim, 'interrupted', reason);
    });
  }
  fail(claim: Claim, error: string, maxRetries = 0) {
    this.transaction(() => {
      if (!this.owns(claim)) return;
      const now = Date.now();
      const task = this.task(claim.id);

      this.db
        .prepare(
          "UPDATE runs SET status='failed', finishedAt=?, error=? WHERE id=?",
        )
        .run(now, error, claim.lease);

      // Count recent consecutive failed runs within the last hour
      const recentFails = Number(
        (
          this.db
            .prepare(
              "SELECT COUNT(*) as count FROM runs WHERE taskId=? AND status='failed' AND startedAt > ?",
            )
            .get(claim.id, now - 3600_000) as { count: number }
        )?.count ?? 1,
      );

      if (maxRetries > 0 && recentFails <= maxRetries) {
        // Exponential backoff: 2s, 4s, 8s, up to 60s
        const backoffMs = Math.min(60_000, 2000 * Math.pow(2, recentFails - 1));
        const retryAt = now + backoffMs;
        this.db
          .prepare(
            "UPDATE tasks SET status='queued', lease=NULL, leaseUntil=NULL, error=?, nextRunAt=?, updatedAt=? WHERE id=?",
          )
          .run(
            `Attempt ${recentFails} failed: ${error} (retrying in ${backoffMs / 1000}s)`,
            retryAt,
            now,
            claim.id,
          );
        this.event(
          claim.id,
          claim.lease,
          `Attempt ${recentFails} failed. Retrying in ${backoffMs / 1000}s.`,
        );
      } else {
        // Exceeded max retries or maxRetries is 0. If recurring, schedule for next interval
        const nextRun =
          task?.intervalSeconds && task.intervalSeconds > 0
            ? now + task.intervalSeconds * 1000
            : null;
        this.db
          .prepare(
            "UPDATE tasks SET status='failed', lease=NULL, leaseUntil=NULL, error=?, nextRunAt=?, updatedAt=? WHERE id=?",
          )
          .run(error, nextRun, now, claim.id);
        this.event(
          claim.id,
          claim.lease,
          nextRun
            ? `Run failed. Next scheduled run in ${task!.intervalSeconds}s.`
            : error,
        );
      }
    });
  }
  memories(): Memory[] {
    return this.db
      .prepare('SELECT id, text, createdAt FROM memories_v2 ORDER BY pinned DESC, createdAt DESC')
      .all() as unknown as Memory[];
  }

  memoriesV2(
    filter?: MemoryFilter,
    ownerId: string = 'opendots-owner',
  ): MemoryRecord[] {
    let query = 'SELECT * FROM memories_v2 WHERE ownerId = ?';
    const params: (string | number)[] = [ownerId];

    if (filter?.category) {
      query += ' AND category = ?';
      params.push(filter.category);
    }
    if (filter?.pinnedOnly) {
      query += ' AND pinned = 1';
    }
    if (filter?.query) {
      query += ' AND text LIKE ?';
      params.push(`%${filter.query.trim()}%`);
    }

    query += ' ORDER BY pinned DESC, createdAt DESC';

    if (filter?.limit && filter.limit > 0) {
      query += ' LIMIT ?';
      params.push(filter.limit);
    }

    const rows = this.db.prepare(query).all(...params) as unknown as Array<{
      id: string;
      ownerId: string;
      category: string;
      text: string;
      confidence: number;
      pinned: number;
      source: string;
      createdAt: number;
      updatedAt: number;
      lastAccessedAt: number | null;
    }>;

    return rows.map((row) => ({
      ...row,
      category: row.category as MemoryCategory,
      pinned: Boolean(row.pinned),
      source: row.source as 'user_explicit' | 'agent_inferred',
      lastAccessedAt: row.lastAccessedAt ?? undefined,
    }));
  }

  saveMemory(text: string, id: string = randomUUID()): Memory {
    const record = this.saveMemoryV2({ text, id });
    return {
      id: record.id,
      text: record.text,
      createdAt: record.createdAt,
    };
  }

  saveMemoryV2(options: {
    text: string;
    id?: string;
    category?: MemoryCategory;
    ownerId?: string;
    confidence?: number;
    pinned?: boolean;
    source?: 'user_explicit' | 'agent_inferred';
  }): MemoryRecord {
    const rawText = options.text.trim();
    if (!rawText) {
      throw new Error('Memory text cannot be empty.');
    }

    // Reject raw secrets/passwords
    if (containsSensitiveSecret(rawText)) {
      throw new Error(
        'Security policy: Passwords, API keys, and sensitive payment data cannot be stored in persistent memory.',
      );
    }

    const cleanText = sanitizeMemoryContent(rawText);
    const id = options.id ?? randomUUID();
    const ownerId = options.ownerId ?? 'opendots-owner';
    const category = options.category ?? 'preference';
    const confidence = options.confidence ?? 1.0;
    const pinned = options.pinned ? 1 : 0;
    const source = options.source ?? 'user_explicit';
    const now = Date.now();

    // Check for similar memory in the same category to update instead of duplicating
    const existing = this.db
      .prepare(
        'SELECT id FROM memories_v2 WHERE ownerId = ? AND category = ? AND text = ?',
      )
      .get(ownerId, category, cleanText) as { id: string } | undefined;

    const targetId = existing?.id ?? id;

    this.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO memories_v2 (id, ownerId, category, text, confidence, pinned, source, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             text=excluded.text,
             category=excluded.category,
             confidence=excluded.confidence,
             pinned=excluded.pinned,
             updatedAt=excluded.updatedAt`,
        )
        .run(
          targetId,
          ownerId,
          category,
          cleanText,
          confidence,
          pinned,
          source,
          now,
          now,
        );

      // Keep legacy table synchronized for any older direct queries
      this.db
        .prepare(
          'INSERT INTO memories VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET text=excluded.text',
        )
        .run(targetId, cleanText, now);
    });

    return this.memoriesV2({ query: cleanText }, ownerId).find(
      (m) => m.id === targetId,
    )!;
  }

  deleteMemory(id: string): boolean {
    return this.forgetMemory(id);
  }

  forgetMemory(id: string, ownerId: string = 'opendots-owner'): boolean {
    let changed = 0;
    this.transaction(() => {
      changed = Number(
        this.db
          .prepare('DELETE FROM memories_v2 WHERE id = ? AND ownerId = ?')
          .run(id, ownerId).changes,
      );
      this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
    });
    return changed > 0;
  }

  clearMemoriesCategory(
    category: MemoryCategory,
    ownerId: string = 'opendots-owner',
  ): number {
    let deleted = 0;
    this.transaction(() => {
      const records = this.db
        .prepare('SELECT id FROM memories_v2 WHERE ownerId = ? AND category = ?')
        .all(ownerId, category) as unknown as Array<{ id: string }>;

      for (const rec of records) {
        this.db.prepare('DELETE FROM memories WHERE id = ?').run(rec.id);
      }

      deleted = Number(
        this.db
          .prepare('DELETE FROM memories_v2 WHERE ownerId = ? AND category = ?')
          .run(ownerId, category).changes,
      );
    });
    return deleted;
  }

  searchMemories(
    query: string,
    category?: MemoryCategory,
    ownerId: string = 'opendots-owner',
  ): MemoryRecord[] {
    return this.memoriesV2({ query, category }, ownerId);
  }

  saveTaskPlan(plan: TaskPlan): TaskPlan {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO task_plans (id, ownerId, goal, status, currentStepIndex, stepsJson, finalResult, error, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status=excluded.status,
           currentStepIndex=excluded.currentStepIndex,
           stepsJson=excluded.stepsJson,
           finalResult=excluded.finalResult,
           error=excluded.error,
           updatedAt=excluded.updatedAt`,
      )
      .run(
        plan.id,
        plan.ownerId,
        plan.goal,
        plan.status,
        plan.currentStepIndex,
        JSON.stringify(plan.steps),
        plan.finalResult ?? null,
        plan.error ?? null,
        plan.createdAt || now,
        now,
      );
    return this.getTaskPlan(plan.id, plan.ownerId) ?? plan;
  }

  getTaskPlan(id: string, ownerId: string = 'opendots-owner'): TaskPlan | undefined {
    const row = this.db
      .prepare('SELECT * FROM task_plans WHERE id = ? AND ownerId = ?')
      .get(id, ownerId) as unknown as {
        id: string;
        ownerId: string;
        goal: string;
        status: string;
        currentStepIndex: number;
        stepsJson: string;
        finalResult: string | null;
        error: string | null;
        createdAt: number;
        updatedAt: number;
      } | undefined;

    if (!row) return undefined;

    try {
      return {
        id: row.id,
        ownerId: row.ownerId,
        goal: row.goal,
        status: row.status as any,
        currentStepIndex: row.currentStepIndex,
        steps: JSON.parse(row.stepsJson),
        finalResult: row.finalResult ?? undefined,
        error: row.error ?? undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    } catch {
      return undefined;
    }
  }

  listTaskPlans(ownerId: string = 'opendots-owner'): TaskPlan[] {
    const rows = this.db
      .prepare('SELECT * FROM task_plans WHERE ownerId = ? ORDER BY createdAt DESC')
      .all(ownerId) as unknown as Array<{
        id: string;
        ownerId: string;
        goal: string;
        status: string;
        currentStepIndex: number;
        stepsJson: string;
        finalResult: string | null;
        error: string | null;
        createdAt: number;
        updatedAt: number;
      }>;

    return rows.map((row) => ({
      id: row.id,
      ownerId: row.ownerId,
      goal: row.goal,
      status: row.status as any,
      currentStepIndex: row.currentStepIndex,
      steps: JSON.parse(row.stepsJson),
      finalResult: row.finalResult ?? undefined,
      error: row.error ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  deleteTaskPlan(id: string, ownerId: string = 'opendots-owner'): boolean {
    return (
      Number(
        this.db
          .prepare('DELETE FROM task_plans WHERE id = ? AND ownerId = ?')
          .run(id, ownerId).changes,
      ) > 0
    );
  }
}
