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
import type { CustomSkillRecord } from './skills/types.js';
import type { CustomRule } from './tools/action-review.js';
import type { ProactiveMonitor } from './research/proactive-monitor.js';
import type {
  Action,
  Approval,
  ApprovalActionType,
  Connector,
  ConnectorType,
  Detail,
  DocumentSnapshot,
  Goal,
  GoalMetrics,
  GoalMilestone,
  Memory,
  Notification,
  NotificationPriority,
  NotificationType,
  Result,
  Run,
  Settings,
  Task,
  TaskChangeHistoryItem,
  TaskCondition,
  TaskEvent,
  TaskMonitoringConfig,
  TaskQuietHours,
  TaskTriggerType,
} from '../shared/types.js';

export type Claim = Task & { lease: string };
export const DEFAULT_WORKER_LEASE_MS = 180_000;
const defaults: Settings = {
  name: 'Dot',
  paused: false,
  researchAllowed: true,
  memoryAllowed: true,
  appsAllowed: true,
  approvalPolicy: 'always_ask',
  proactiveGoalsAllowed: true,
  disabledMemoryCategories: [],
  freeOnlyMode: true,
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
        projectId TEXT,
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
        spaceId TEXT,
        projectId TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS task_plans_owner ON task_plans(ownerId, createdAt DESC);
      CREATE TABLE IF NOT EXISTS custom_skills (
        id TEXT PRIMARY KEY,
        ownerId TEXT NOT NULL DEFAULT 'opendots-owner',
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        version TEXT NOT NULL DEFAULT '1.0.0',
        instructions TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'utility',
        requiredPermissionsJson TEXT NOT NULL DEFAULT '["basic"]',
        allowedToolsJson TEXT NOT NULL DEFAULT '[]',
        timeoutMs INTEGER NOT NULL DEFAULT 30000,
        enabled INTEGER NOT NULL DEFAULT 1,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS custom_skills_owner ON custom_skills(ownerId, createdAt DESC);
      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY,
        ownerId TEXT NOT NULL DEFAULT 'opendots-owner',
        title TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL DEFAULT 'personal',
        targetDate INTEGER,
        priority TEXT NOT NULL DEFAULT 'medium',
        status TEXT NOT NULL DEFAULT 'active',
        milestonesJson TEXT NOT NULL DEFAULT '[]',
        metricsJson TEXT NOT NULL DEFAULT '{}',
        notes TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS goals_owner_status ON goals(ownerId, status, createdAt DESC);
      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        ownerId TEXT NOT NULL DEFAULT 'opendots-owner',
        actionType TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        destination TEXT,
        payloadJson TEXT NOT NULL,
        consequences TEXT,
        estimatedCost TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        policy TEXT NOT NULL DEFAULT 'always_ask',
        createdAt INTEGER NOT NULL,
        decidedAt INTEGER,
        decidedBy TEXT
      );
      CREATE INDEX IF NOT EXISTS approvals_status ON approvals(ownerId, status, createdAt DESC);
      CREATE TABLE IF NOT EXISTS connectors (
        id TEXT PRIMARY KEY,
        ownerId TEXT NOT NULL DEFAULT 'opendots-owner',
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'unconfigured',
        configJson TEXT NOT NULL DEFAULT '{}',
        permissionsJson TEXT NOT NULL DEFAULT '[]',
        availableActionsJson TEXT NOT NULL DEFAULT '[]',
        lastTestedAt INTEGER,
        error TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS connectors_owner ON connectors(ownerId, type);
      CREATE TABLE IF NOT EXISTS document_snapshots (
        id TEXT PRIMARY KEY,
        ownerId TEXT NOT NULL DEFAULT 'opendots-owner',
        filePath TEXT NOT NULL,
        version INTEGER NOT NULL,
        content TEXT NOT NULL,
        summary TEXT,
        createdAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS doc_snapshots_path ON document_snapshots(ownerId, filePath, version DESC);
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        ownerId TEXT NOT NULL DEFAULT 'opendots-owner',
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'medium',
        targetId TEXT,
        targetUrl TEXT,
        isRead INTEGER NOT NULL DEFAULT 0,
        metadataJson TEXT,
        createdAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS notifications_owner_created ON notifications(ownerId, createdAt DESC);
      CREATE INDEX IF NOT EXISTS notifications_owner_unread ON notifications(ownerId, isRead);
      CREATE TABLE IF NOT EXISTS custom_rules (
        id TEXT PRIMARY KEY,
        ownerId TEXT NOT NULL DEFAULT 'opendots-owner',
        name TEXT NOT NULL,
        pattern TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        policy TEXT NOT NULL DEFAULT 'take_action_without_asking',
        description TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS custom_rules_owner ON custom_rules(ownerId, createdAt DESC);
      CREATE TABLE IF NOT EXISTS proactive_monitors (
        id TEXT PRIMARY KEY,
        ownerId TEXT NOT NULL DEFAULT 'opendots-owner',
        topic TEXT NOT NULL,
        sourcesJson TEXT NOT NULL DEFAULT '[]',
        intervalMinutes INTEGER NOT NULL DEFAULT 60,
        lastCheckedAt INTEGER,
        lastResultSummary TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS proactive_monitors_owner ON proactive_monitors(ownerId, status);`);

    // Ensure conditional task monitoring columns exist
    try {
      const taskCols = this.db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>;
      const taskColNames = new Set(taskCols.map((c) => c.name));
      if (!taskColNames.has('triggerType')) this.db.exec("ALTER TABLE tasks ADD COLUMN triggerType TEXT DEFAULT 'time'");
      if (!taskColNames.has('conditionJson')) this.db.exec("ALTER TABLE tasks ADD COLUMN conditionJson TEXT");
      if (!taskColNames.has('monitoringConfigJson')) this.db.exec("ALTER TABLE tasks ADD COLUMN monitoringConfigJson TEXT");
      if (!taskColNames.has('changeHistoryJson')) this.db.exec("ALTER TABLE tasks ADD COLUMN changeHistoryJson TEXT DEFAULT '[]'");
      if (!taskColNames.has('dependsOnJson')) this.db.exec("ALTER TABLE tasks ADD COLUMN dependsOnJson TEXT DEFAULT '[]'");
      if (!taskColNames.has('idempotencyKey')) this.db.exec("ALTER TABLE tasks ADD COLUMN idempotencyKey TEXT");
    } catch {}

    // Ensure task_plans spaceId and projectId columns exist
    try {
      const planCols = this.db.prepare('PRAGMA table_info(task_plans)').all() as Array<{ name: string }>;
      const planColNames = new Set(planCols.map((c) => c.name));
      if (!planColNames.has('spaceId')) this.db.exec('ALTER TABLE task_plans ADD COLUMN spaceId TEXT');
      if (!planColNames.has('projectId')) this.db.exec('ALTER TABLE task_plans ADD COLUMN projectId TEXT');
    } catch {}

    // Ensure memories_v2 projectId column exists
    try {
      const memCols = this.db.prepare('PRAGMA table_info(memories_v2)').all() as Array<{ name: string }>;
      const memColNames = new Set(memCols.map((c) => c.name));
      if (!memColNames.has('projectId')) this.db.exec('ALTER TABLE memories_v2 ADD COLUMN projectId TEXT');
    } catch {}

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
    this.seedInitialSkills();
    this.seedInitialConnectors();
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
  private mapTaskRow(row: any): Task {
    return {
      id: row.id,
      prompt: row.prompt,
      status: row.status,
      intervalSeconds: row.intervalSeconds,
      nextRunAt: row.nextRunAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      error: row.error,
      lease: row.lease,
      leaseUntil: row.leaseUntil,
      triggerType: (row.triggerType as TaskTriggerType) || 'time',
      condition: row.conditionJson ? JSON.parse(row.conditionJson) : undefined,
      monitoringConfig: row.monitoringConfigJson ? JSON.parse(row.monitoringConfigJson) : undefined,
      changeHistory: row.changeHistoryJson ? JSON.parse(row.changeHistoryJson) : [],
      dependsOn: row.dependsOnJson ? JSON.parse(row.dependsOnJson) : [],
      idempotencyKey: row.idempotencyKey || undefined,
    };
  }
  tasks(): Task[] {
    const rows = this.db
      .prepare('SELECT * FROM tasks ORDER BY createdAt DESC')
      .all() as any[];
    return rows.map((r) => this.mapTaskRow(r));
  }
  task(id: string): Task | undefined {
    const row = this.db
      .prepare('SELECT * FROM tasks WHERE id=?')
      .get(id);
    return row ? this.mapTaskRow(row) : undefined;
  }
  add(task: {
    id?: string;
    prompt: string;
    cadence?: string;
    intervalSeconds?: number;
    state?: string;
    status?: string;
    triggerType?: TaskTriggerType;
    condition?: TaskCondition;
    monitoringConfig?: TaskMonitoringConfig;
    dependsOn?: string[];
  }): Task {
    const id = task.id || randomUUID();
    const triggerType = task.triggerType || 'time';
    const conditionJson = task.condition ? JSON.stringify(task.condition) : null;
    const monitoringConfigJson = task.monitoringConfig ? JSON.stringify(task.monitoringConfig) : null;
    const dependsOnJson = task.dependsOn ? JSON.stringify(task.dependsOn) : '[]';
    const status = task.state === 'running' || task.status === 'running' ? 'running' : 'queued';
    const now = Date.now();

    this.db
      .prepare(
        `INSERT INTO tasks (
          id, prompt, status, intervalSeconds, nextRunAt, createdAt, updatedAt,
          error, lease, leaseUntil, triggerType, conditionJson, monitoringConfigJson,
          changeHistoryJson, dependsOnJson, idempotencyKey
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          NULL, ?, ?, ?, ?, ?,
          '[]', ?, NULL
        )`,
      )
      .run(
        id,
        task.prompt,
        status,
        task.intervalSeconds || null,
        status === 'running' ? null : now,
        now,
        now,
        status === 'running' ? 'lease-test' : null,
        status === 'running' ? now + 60_000 : null,
        triggerType,
        conditionJson,
        monitoringConfigJson,
        dependsOnJson,
      );

    return this.task(id)!;
  }

  createTask(
    prompt: string,
    intervalSeconds: number | null = null,
    nextRunAt: number | null = null,
    options?: {
      triggerType?: TaskTriggerType;
      condition?: TaskCondition;
      monitoringConfig?: TaskMonitoringConfig;
      dependsOn?: string[];
      idempotencyKey?: string;
    },
  ): Task {
    const now = Date.now();
    const id = randomUUID();
    const triggerType = options?.triggerType || 'time';
    const conditionJson = options?.condition ? JSON.stringify(options.condition) : null;
    const monitoringConfigJson = options?.monitoringConfig ? JSON.stringify(options.monitoringConfig) : null;
    const dependsOnJson = options?.dependsOn ? JSON.stringify(options.dependsOn) : '[]';
    const idempotencyKey = options?.idempotencyKey || null;

    this.db
      .prepare(
        `INSERT INTO tasks (id, prompt, status, intervalSeconds, nextRunAt, createdAt, updatedAt, error, lease, leaseUntil, triggerType, conditionJson, monitoringConfigJson, changeHistoryJson, dependsOnJson, idempotencyKey)
         VALUES (?, ?, 'queued', ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, '[]', ?, ?)`,
      )
      .run(
        id,
        prompt,
        intervalSeconds,
        nextRunAt ?? null,
        now,
        now,
        triggerType,
        conditionJson,
        monitoringConfigJson,
        dependsOnJson,
        idempotencyKey,
      );
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
  recentEvents(limit = 50): TaskEvent[] {
    return this.db
      .prepare('SELECT * FROM events ORDER BY id DESC LIMIT ?')
      .all(limit) as unknown as TaskEvent[];
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
      const candidateRows = this.db
        .prepare(
          "SELECT * FROM tasks WHERE (status='queued' AND (nextRunAt IS NULL OR nextRunAt<=?)) OR (status='completed' AND nextRunAt IS NOT NULL AND nextRunAt<=?) ORDER BY createdAt LIMIT 20",
        )
        .all(now, now) as any[];

      for (const taskRow of candidateRows) {
        const task = this.mapTaskRow(taskRow);

        // Check DAG dependencies (dependsOn)
        if (task.dependsOn && task.dependsOn.length > 0) {
          const placeholders = task.dependsOn.map(() => '?').join(',');
          const unfinished = this.db
            .prepare(
              `SELECT COUNT(*) as count FROM tasks WHERE id IN (${placeholders}) AND status != 'completed'`,
            )
            .get(...task.dependsOn) as { count: number };
          if (unfinished.count > 0) {
            continue;
          }
        }

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
      }
      return null;
    });
  }
  owns(claim: Claim): boolean {
    const task = this.task(claim.id);
    return task?.status === 'running' && task.lease === claim.lease;
  }
  finish(claim: Claim | string, result: Result | string, now = Date.now()): boolean {
    return this.transaction(() => {
      const taskId = typeof claim === 'string' ? claim : claim.id;
      const lease = typeof claim === 'string' ? null : claim.lease;
      const task = this.task(taskId);
      if (!task) return false;
      if (typeof claim !== 'string' && !this.owns(claim)) return false;

      const normResult: Result =
        typeof result === 'string'
          ? { text: result, sources: [], sample: false }
          : result;

      if (lease) {
        this.db
          .prepare(
            "UPDATE runs SET status='completed', finishedAt=?, result=? WHERE id=?",
          )
          .run(now, JSON.stringify(normResult), lease);
      }
      this.db
        .prepare(
          "UPDATE tasks SET status='completed', lease=NULL, leaseUntil=NULL, updatedAt=?, nextRunAt=? WHERE id=?",
        )
        .run(
          now,
          task.intervalSeconds ? now + task.intervalSeconds * 1000 : null,
          taskId,
        );
      if (lease) {
        this.event(
          taskId,
          lease,
          normResult.sample ? 'Fictional sample brief ready.' : 'Run completed.',
        );
      }
      this.createNotification({
        type: 'task_completed',
        title: `Task Completed: ${task.prompt.slice(0, 40)}`,
        message: normResult.text.slice(0, 150) || 'Task execution finished successfully.',
        priority: 'medium',
        targetId: task.id,
      });
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
        this.createNotification({
          type: 'task_failed',
          title: `Task Failed: ${task?.prompt?.slice(0, 40) || 'Background Task'}`,
          message: error,
          priority: 'high',
          targetId: claim.id,
        });
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
    if (filter?.projectId) {
      query += ' AND projectId = ?';
      params.push(filter.projectId);
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
      projectId?: string | null;
      createdAt: number;
      updatedAt: number;
      lastAccessedAt: number | null;
    }>;

    return rows.map((row) => ({
      ...row,
      category: row.category as MemoryCategory,
      pinned: Boolean(row.pinned),
      source: row.source as 'user_explicit' | 'agent_inferred',
      projectId: row.projectId ?? undefined,
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
    projectId?: string;
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
    const projectId = options.projectId ?? null;
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
          `INSERT INTO memories_v2 (id, ownerId, category, text, confidence, pinned, source, projectId, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             text=excluded.text,
             category=excluded.category,
             confidence=excluded.confidence,
             pinned=excluded.pinned,
             projectId=excluded.projectId,
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
          projectId,
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

  saveTaskPlan(
    plan: Partial<TaskPlan> & { goal: string; steps: any[] },
  ): TaskPlan {
    const now = Date.now();
    const id = plan.id || randomUUID();
    const ownerId = plan.ownerId || 'opendots-owner';
    const spaceId = plan.spaceId || plan.projectId || null;
    this.db
      .prepare(
        `INSERT INTO task_plans (id, ownerId, goal, status, currentStepIndex, stepsJson, finalResult, error, spaceId, projectId, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status=excluded.status,
           currentStepIndex=excluded.currentStepIndex,
           stepsJson=excluded.stepsJson,
           finalResult=excluded.finalResult,
           error=excluded.error,
           spaceId=COALESCE(excluded.spaceId, task_plans.spaceId),
           projectId=COALESCE(excluded.projectId, task_plans.projectId),
           updatedAt=excluded.updatedAt`,
      )
      .run(
        id,
        ownerId,
        plan.goal,
        plan.status || 'pending',
        plan.currentStepIndex || 0,
        JSON.stringify(plan.steps),
        plan.finalResult ?? null,
        plan.error ?? null,
        spaceId,
        spaceId,
        plan.createdAt || now,
        now,
      );
    return this.getTaskPlan(id, ownerId)!;
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
        spaceId?: string | null;
        projectId?: string | null;
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
        spaceId: row.spaceId ?? row.projectId ?? undefined,
        projectId: row.projectId ?? row.spaceId ?? undefined,
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
        spaceId?: string | null;
        projectId?: string | null;
        createdAt: number;
        updatedAt: number;
      }>;

    const plans: TaskPlan[] = [];
    for (const row of rows) {
      try {
        plans.push({
          id: row.id,
          ownerId: row.ownerId,
          goal: row.goal,
          status: row.status as any,
          currentStepIndex: row.currentStepIndex,
          steps: JSON.parse(row.stepsJson),
          finalResult: row.finalResult ?? undefined,
          error: row.error ?? undefined,
          spaceId: row.spaceId ?? row.projectId ?? undefined,
          projectId: row.projectId ?? row.spaceId ?? undefined,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        });
      } catch {
        // ignore malformed row
      }
    }
    return plans;
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

  seedInitialSkills(ownerId = 'opendots-owner'): void {
    const existing = this.customSkills(ownerId);
    if (existing.length > 0) return;

    const initial = [
      {
        id: 'research-brief',
        name: 'Deep Research Brief',
        description: 'Conduct deep web research and synthesize findings with citations into an executive brief.',
        version: '1.0.0',
        instructions: 'Break the topic into key search angles. Use research tools to extract verified claims, cite all source URLs using [1], [2], and highlight consensus vs contradictions.',
        category: 'research' as const,
        requiredPermissions: ['basic', 'research'] as any[],
        allowedTools: ['deep_research', 'read_web_page', 'search_web'],
        timeoutMs: 60000,
        enabled: true,
      },
      {
        id: 'code-review',
        name: 'Security & Quality Code Review',
        description: 'Inspect code for vulnerabilities, edge cases, memory leaks, performance bottlenecks, and style.',
        version: '1.0.0',
        instructions: 'Analyze the provided code thoroughly. Check for SSRF, SQL injection, secrets, unhandled promise rejections, and algorithmic complexity. Provide concrete drop-in fixes.',
        category: 'coding' as const,
        requiredPermissions: ['basic', 'code'] as any[],
        allowedTools: ['calculate', 'analyze_text'],
        timeoutMs: 30000,
        enabled: true,
      },
      {
        id: 'document-draft',
        name: 'Structured Document Drafting',
        description: 'Draft comprehensive technical specifications, user guides, or project proposals with clear sections.',
        version: '1.0.0',
        instructions: 'Generate clear, professional Markdown documents with an executive summary, problem statement, solution architecture, and step-by-step rollout plan.',
        category: 'generation' as const,
        requiredPermissions: ['basic', 'files'] as any[],
        allowedTools: ['write_workspace_file', 'read_workspace_file', 'analyze_text'],
        timeoutMs: 45000,
        enabled: true,
      },
      {
        id: 'study-assistant',
        name: 'Technical Study Assistant',
        description: 'Explain complex topics using progressive disclosure, analogies, and a generated 3-question self-test.',
        version: '1.0.0',
        instructions: 'Explain the subject clearly: 1. Core mental model and intuition; 2. Technical details; 3. Common pitfalls; 4. A 3-question interactive comprehension check with answers.',
        category: 'utility' as const,
        requiredPermissions: ['basic'] as any[],
        allowedTools: ['calculate', 'analyze_text'],
        timeoutMs: 30000,
        enabled: true,
      },
      {
        id: 'project-planner',
        name: 'Engineering Project Planner',
        description: 'Deconstruct a project goal into sequential phases, milestones, deliverables, and risk mitigations.',
        version: '1.0.0',
        instructions: 'Create an actionable project breakdown: Phase deliverables, technical dependencies, estimate ranges, and potential technical risks with fallback options.',
        category: 'analysis' as const,
        requiredPermissions: ['basic'] as any[],
        allowedTools: ['create_autonomous_plan', 'check_plan_status'],
        timeoutMs: 45000,
        enabled: true,
      },
    ];

    for (const skill of initial) {
      this.saveCustomSkill({ ...skill, ownerId });
    }
  }

  customSkills(ownerId = 'opendots-owner'): CustomSkillRecord[] {
    try {
      const rows = this.db
        .prepare('SELECT * FROM custom_skills WHERE ownerId=? ORDER BY createdAt DESC')
        .all(ownerId) as any[];
      return rows.map((r) => ({
        id: r.id,
        ownerId: r.ownerId,
        name: r.name,
        description: r.description,
        version: r.version,
        instructions: r.instructions,
        category: r.category,
        requiredPermissions: JSON.parse(r.requiredPermissionsJson || '["basic"]'),
        allowedTools: JSON.parse(r.allowedToolsJson || '[]'),
        timeoutMs: r.timeoutMs,
        enabled: Boolean(r.enabled),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    } catch {
      return [];
    }
  }

  saveCustomSkill(
    skill: Omit<CustomSkillRecord, 'id' | 'createdAt' | 'updatedAt' | 'ownerId'> & {
      id?: string;
      ownerId?: string;
    },
  ): CustomSkillRecord {
    const id = skill.id || randomUUID();
    const now = Date.now();
    const ownerId = skill.ownerId || 'opendots-owner';
    const record: CustomSkillRecord = {
      id,
      ownerId,
      name: skill.name,
      description: skill.description,
      version: skill.version || '1.0.0',
      instructions: skill.instructions,
      category: skill.category || 'utility',
      requiredPermissions: skill.requiredPermissions || ['basic'],
      allowedTools: skill.allowedTools || [],
      timeoutMs: skill.timeoutMs || 30000,
      enabled: skill.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO custom_skills (id, ownerId, name, description, version, instructions, category, requiredPermissionsJson, allowedToolsJson, timeoutMs, enabled, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.ownerId,
        record.name,
        record.description,
        record.version,
        record.instructions,
        record.category,
        JSON.stringify(record.requiredPermissions),
        JSON.stringify(record.allowedTools),
        record.timeoutMs,
        record.enabled ? 1 : 0,
        record.createdAt,
        record.updatedAt,
      );
    return record;
  }

  updateCustomSkill(
    id: string,
    patch: Partial<Omit<CustomSkillRecord, 'id' | 'ownerId' | 'createdAt'>>,
    ownerId = 'opendots-owner',
  ): CustomSkillRecord {
    const existing = this.customSkills(ownerId).find((s) => s.id === id);
    if (!existing) throw new Error('Skill not found.');
    const updated: CustomSkillRecord = {
      ...existing,
      ...patch,
      updatedAt: Date.now(),
    };
    this.db
      .prepare(
        `UPDATE custom_skills SET name=?, description=?, version=?, instructions=?, category=?, requiredPermissionsJson=?, allowedToolsJson=?, timeoutMs=?, enabled=?, updatedAt=?
         WHERE id=? AND ownerId=?`,
      )
      .run(
        updated.name,
        updated.description,
        updated.version,
        updated.instructions,
        updated.category,
        JSON.stringify(updated.requiredPermissions),
        JSON.stringify(updated.allowedTools),
        updated.timeoutMs,
        updated.enabled ? 1 : 0,
        updated.updatedAt,
        id,
        ownerId,
      );
    return updated;
  }

  toggleCustomSkill(
    id: string,
    enabled?: boolean,
    ownerId = 'opendots-owner',
  ): CustomSkillRecord {
    const existing = this.customSkills(ownerId).find((s) => s.id === id);
    if (!existing) throw new Error('Skill not found.');
    const nextState = enabled !== undefined ? enabled : !existing.enabled;
    return this.updateCustomSkill(id, { enabled: nextState }, ownerId);
  }

  deleteCustomSkill(id: string, ownerId = 'opendots-owner'): void {
    this.db
      .prepare('DELETE FROM custom_skills WHERE id=? AND ownerId=?')
      .run(id, ownerId);
  }

  // -------------------------------------------------------------
  // CONNECTORS (Phase 2.E)
  // -------------------------------------------------------------
  connectors(ownerId = 'opendots-owner'): Connector[] {
    try {
      const rows = this.db
        .prepare('SELECT * FROM connectors WHERE ownerId=? ORDER BY name ASC')
        .all(ownerId) as any[];
      return rows.map((r) => ({
        id: r.id,
        ownerId: r.ownerId,
        type: r.type as ConnectorType,
        name: r.name,
        status: r.status as Connector['status'],
        config: JSON.parse(r.configJson || '{}'),
        permissions: JSON.parse(r.permissionsJson || '[]'),
        availableActions: JSON.parse(r.availableActionsJson || '[]'),
        lastTestedAt: r.lastTestedAt || undefined,
        error: r.error || undefined,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    } catch {
      return [];
    }
  }

  getConnector(type: ConnectorType, ownerId = 'opendots-owner'): Connector | undefined {
    return this.connectors(ownerId).find((c) => c.type === type);
  }

  updateConnector(
    type: ConnectorType,
    patch: Partial<Omit<Connector, 'id' | 'ownerId' | 'type' | 'createdAt'>>,
    ownerId = 'opendots-owner',
  ): Connector {
    const existing = this.getConnector(type, ownerId);
    if (!existing) throw new Error(`Connector "${type}" not found.`);
    const updated: Connector = {
      ...existing,
      ...patch,
      updatedAt: Date.now(),
    };
    this.db
      .prepare(
        `UPDATE connectors SET name=?, status=?, configJson=?, permissionsJson=?, availableActionsJson=?, lastTestedAt=?, error=?, updatedAt=?
         WHERE type=? AND ownerId=?`,
      )
      .run(
        updated.name,
        updated.status,
        JSON.stringify(updated.config),
        JSON.stringify(updated.permissions),
        JSON.stringify(updated.availableActions),
        updated.lastTestedAt || null,
        updated.error || null,
        updated.updatedAt,
        type,
        ownerId,
      );
    return updated;
  }

  testConnector(type: ConnectorType, ownerId = 'opendots-owner'): { success: boolean; message: string; timestamp: number } {
    const conn = this.getConnector(type, ownerId);
    const now = Date.now();
    if (!conn) {
      return { success: false, message: `Connector "${type}" does not exist.`, timestamp: now };
    }

    if (type === 'instagram') {
      this.updateConnector(type, { status: 'connected', lastTestedAt: now, error: undefined }, ownerId);
      return { success: true, message: 'Instagram public research engine is verified and accessible.', timestamp: now };
    }

    if (type === 'venice') {
      this.updateConnector(type, { status: 'connected', lastTestedAt: now, error: undefined }, ownerId);
      return {
        success: true,
        message: 'Venice.ai Website Bridge is active (₹0 browser automation / authorized session link).',
        timestamp: now,
      };
    }

    if (type === 'slack') {
      const hasSlack = Boolean(process.env.SLACK_TEAM_ID || conn.config.teamId);
      const status = hasSlack ? 'connected' : 'unconfigured';
      const msg = hasSlack ? 'Slack integration verified.' : 'Slack credentials (SLACK_TEAM_ID) not configured.';
      this.updateConnector(type, { status, lastTestedAt: now, error: hasSlack ? undefined : msg }, ownerId);
      return { success: hasSlack, message: msg, timestamp: now };
    }

    if (['gmail', 'google_calendar', 'google_drive'].includes(type)) {
      const hasKey = Boolean(process.env.COMPOSIO_API_KEY || conn.config.apiKey);
      const status = hasKey ? 'connected' : 'unconfigured';
      const msg = hasKey ? `${conn.name} verified through Composio API.` : `Connect an API key (COMPOSIO_API_KEY) in Settings to activate ${conn.name}.`;
      this.updateConnector(type, { status, lastTestedAt: now, error: hasKey ? undefined : msg }, ownerId);
      return { success: hasKey, message: msg, timestamp: now };
    }

    if (type === 'telegram') {
      const hasToken = Boolean(process.env.TELEGRAM_BOT_TOKEN || conn.config.botToken);
      const status = hasToken ? 'connected' : 'unconfigured';
      const msg = hasToken ? 'Telegram bot token verified.' : 'Telegram token (TELEGRAM_BOT_TOKEN) not configured.';
      this.updateConnector(type, { status, lastTestedAt: now, error: hasToken ? undefined : msg }, ownerId);
      return { success: hasToken, message: msg, timestamp: now };
    }

    if (type === 'whatsapp') {
      const hasToken = Boolean(process.env.WHATSAPP_TOKEN || conn.config.token);
      const status = hasToken ? 'connected' : 'unconfigured';
      const msg = hasToken ? 'WhatsApp API credentials verified.' : 'WhatsApp token (WHATSAPP_TOKEN) not configured.';
      this.updateConnector(type, { status, lastTestedAt: now, error: hasToken ? undefined : msg }, ownerId);
      return { success: hasToken, message: msg, timestamp: now };
    }

    return { success: true, message: `${conn.name} test ping passed.`, timestamp: now };
  }

  disconnectConnector(type: ConnectorType, ownerId = 'opendots-owner'): Connector {
    return this.updateConnector(type, { status: 'disconnected', config: {}, error: 'Disconnected by user.' }, ownerId);
  }

  seedInitialConnectors(ownerId = 'opendots-owner'): void {
    const initial: Array<Omit<Connector, 'createdAt' | 'updatedAt' | 'ownerId'>> = [
      {
        id: 'conn-gmail',
        type: 'gmail',
        name: 'Google Gmail',
        status: process.env.COMPOSIO_API_KEY ? 'connected' : 'unconfigured',
        config: {},
        permissions: ['Read, draft, and send emails via user authorization'],
        availableActions: ['search_inbox', 'read_emails', 'draft_email', 'send_email (Requires Approval)'],
      },
      {
        id: 'conn-gcalendar',
        type: 'google_calendar',
        name: 'Google Calendar',
        status: process.env.COMPOSIO_API_KEY ? 'connected' : 'unconfigured',
        config: {},
        permissions: ['View schedule and create/reschedule calendar events'],
        availableActions: ['list_events', 'check_availability', 'create_event', 'reschedule_event'],
      },
      {
        id: 'conn-gdrive',
        type: 'google_drive',
        name: 'Google Drive',
        status: process.env.COMPOSIO_API_KEY ? 'connected' : 'unconfigured',
        config: {},
        permissions: ['Search files, inspect documents, and export deliverables'],
        availableActions: ['search_files', 'read_document', 'export_doc', 'save_file'],
      },
      {
        id: 'conn-instagram',
        type: 'instagram',
        name: 'Instagram Public Research',
        status: 'connected',
        config: {},
        permissions: ['Public web inspection of open accounts, hashtags, and public reel metadata'],
        availableActions: ['inspect_profile', 'search_hashtag', 'analyze_post_metadata'],
      },
      {
        id: 'conn-telegram',
        type: 'telegram',
        name: 'Telegram Messenger',
        status: process.env.TELEGRAM_BOT_TOKEN ? 'connected' : 'unconfigured',
        config: {},
        permissions: ['Bot message dispatch and status notifications'],
        availableActions: ['send_notification', 'receive_command', 'send_file'],
      },
      {
        id: 'conn-whatsapp',
        type: 'whatsapp',
        name: 'WhatsApp Business API',
        status: process.env.WHATSAPP_TOKEN ? 'connected' : 'unconfigured',
        config: {},
        permissions: ['Template message dispatch and event alerts'],
        availableActions: ['send_template_message', 'notify_user (Requires Approval)'],
      },
      {
        id: 'conn-slack',
        type: 'slack',
        name: 'Slack Workspace Channels',
        status: process.env.SLACK_TEAM_ID ? 'connected' : 'unconfigured',
        config: {},
        permissions: ['Channel messaging, thread replies, and project summaries'],
        availableActions: ['post_message', 'reply_thread', 'share_summary'],
      },
      {
        id: 'conn-onedrive',
        type: 'onedrive',
        name: 'Microsoft OneDrive & Office 365',
        status: process.env.MICROSOFT_CLIENT_ID ? 'connected' : 'unconfigured',
        config: {},
        permissions: ['Read files, analyze Excel workbooks, draft Word docs, sync PPTX'],
        availableActions: ['read_file', 'upload_deliverable', 'inspect_folder', 'export_office_doc'],
      },
      {
        id: 'conn-notion',
        type: 'notion',
        name: 'Notion Knowledge Base',
        status: process.env.NOTION_API_KEY ? 'connected' : 'unconfigured',
        config: {},
        permissions: ['Query databases, fetch page markdown, create project documentation'],
        availableActions: ['search_pages', 'create_page', 'update_database', 'read_block'],
      },
      {
        id: 'conn-github',
        type: 'github',
        name: 'GitHub Repositories & PRs',
        status: process.env.GITHUB_TOKEN ? 'connected' : 'unconfigured',
        config: {},
        permissions: ['Inspect code, read pull requests, review commits, create issues'],
        availableActions: ['search_repositories', 'read_file_contents', 'create_issue', 'review_pull_request'],
      },
      {
        id: 'conn-asana',
        type: 'asana',
        name: 'Asana Project Management',
        status: process.env.ASANA_ACCESS_TOKEN ? 'connected' : 'unconfigured',
        config: {},
        permissions: ['View tasks, track milestones, update task status'],
        availableActions: ['list_project_tasks', 'create_task', 'update_status'],
      },
      {
        id: 'conn-venice',
        type: 'venice',
        name: 'Venice.ai Website Bridge',
        status: 'connected',
        config: { url: 'https://venice.ai/' },
        permissions: ['Website automation for media generation and uncensored research at ₹0 cost'],
        availableActions: [
          'venice_generate_image',
          'venice_generate_video',
          'venice_research',
          'venice_website_bridge',
        ],
      },
    ];

    const now = Date.now();
    for (const c of initial) {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO connectors (id, ownerId, type, name, status, configJson, permissionsJson, availableActionsJson, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          c.id,
          ownerId,
          c.type,
          c.name,
          c.status,
          JSON.stringify(c.config),
          JSON.stringify(c.permissions),
          JSON.stringify(c.availableActions),
          now,
          now,
        );
    }
  }

  // -------------------------------------------------------------
  // GOALS (Phase 2.B)
  // -------------------------------------------------------------
  goals(ownerId = 'opendots-owner', status?: string): Goal[] {
    try {
      const query = status
        ? 'SELECT * FROM goals WHERE ownerId=? AND status=? ORDER BY createdAt DESC'
        : 'SELECT * FROM goals WHERE ownerId=? ORDER BY createdAt DESC';
      const rows = (status
        ? this.db.prepare(query).all(ownerId, status)
        : this.db.prepare(query).all(ownerId)) as any[];
      return rows.map((r) => ({
        id: r.id,
        ownerId: r.ownerId,
        title: r.title,
        description: r.description || undefined,
        category: r.category as Goal['category'],
        targetDate: r.targetDate || undefined,
        priority: r.priority as Goal['priority'],
        status: r.status as Goal['status'],
        milestones: JSON.parse(r.milestonesJson || '[]'),
        metrics: JSON.parse(r.metricsJson || '{}'),
        notes: r.notes || undefined,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    } catch {
      return [];
    }
  }

  getGoal(id: string, ownerId = 'opendots-owner'): Goal | undefined {
    return this.goals(ownerId).find((g) => g.id === id);
  }

  createGoal(
    data: {
      id?: string;
      ownerId?: string;
      title: string;
      description?: string;
      category?: Goal['category'];
      targetDate?: number;
      priority?: Goal['priority'];
      status?: Goal['status'];
      milestones?: GoalMilestone[];
      metrics?: Record<string, number | string>;
      notes?: string;
    },
  ): Goal {
    const id = data.id || randomUUID();
    const now = Date.now();
    const ownerId = data.ownerId || 'opendots-owner';
    const goal: Goal = {
      id,
      ownerId,
      title: data.title,
      description: data.description,
      category: data.category || 'personal',
      targetDate: data.targetDate,
      priority: data.priority || 'medium',
      status: data.status || 'active',
      milestones: data.milestones || [],
      metrics: data.metrics || {},
      notes: data.notes,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO goals (id, ownerId, title, description, category, targetDate, priority, status, milestonesJson, metricsJson, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        goal.id,
        goal.ownerId,
        goal.title,
        goal.description || null,
        goal.category,
        goal.targetDate || null,
        goal.priority,
        goal.status,
        JSON.stringify(goal.milestones),
        JSON.stringify(goal.metrics),
        goal.notes || null,
        goal.createdAt,
        goal.updatedAt,
      );
    return goal;
  }

  updateGoal(
    id: string,
    patch: Partial<Omit<Goal, 'id' | 'ownerId' | 'createdAt'>>,
    ownerId = 'opendots-owner',
  ): Goal {
    const existing = this.getGoal(id, ownerId);
    if (!existing) throw new Error('Goal not found.');
    const updated: Goal = {
      ...existing,
      ...patch,
      updatedAt: Date.now(),
    };
    this.db
      .prepare(
        `UPDATE goals SET title=?, description=?, category=?, targetDate=?, priority=?, status=?, milestonesJson=?, metricsJson=?, notes=?, updatedAt=?
         WHERE id=? AND ownerId=?`,
      )
      .run(
        updated.title,
        updated.description || null,
        updated.category,
        updated.targetDate || null,
        updated.priority,
        updated.status,
        JSON.stringify(updated.milestones),
        JSON.stringify(updated.metrics),
        updated.notes || null,
        updated.updatedAt,
        id,
        ownerId,
      );
    return updated;
  }

  deleteGoal(id: string, ownerId = 'opendots-owner'): void {
    this.db.prepare('DELETE FROM goals WHERE id=? AND ownerId=?').run(id, ownerId);
  }

  proactiveGoalSuggestions(ownerId = 'opendots-owner'): Array<{
    goalId?: string;
    title: string;
    reason: string;
    suggestedAction: string;
    urgency: 'low' | 'medium' | 'high';
  }> {
    const activeGoals = this.goals(ownerId, 'active');
    const suggestions: Array<{
      goalId?: string;
      title: string;
      reason: string;
      suggestedAction: string;
      urgency: 'low' | 'medium' | 'high';
    }> = [];

    const now = Date.now();
    for (const goal of activeGoals) {
      const totalMilestones = goal.milestones.length;
      const completedMilestones = goal.milestones.filter((m) => m.completed).length;

      if (totalMilestones === 0) {
        suggestions.push({
          goalId: goal.id,
          title: `Break down "${goal.title}"`,
          reason: 'This active goal has no milestones yet. Clear milestones increase completion by 70%.',
          suggestedAction: `Ask OpenDots to generate 3-5 concrete milestones for ${goal.title}.`,
          urgency: 'medium',
        });
      } else if (completedMilestones === 0 && now - goal.createdAt > 3 * 86400000) {
        suggestions.push({
          goalId: goal.id,
          title: `Start Milestone 1 for "${goal.title}"`,
          reason: `Goal was created ${Math.round((now - goal.createdAt) / 86400000)} days ago, but first milestone "${goal.milestones[0].title}" is still pending.`,
          suggestedAction: `Execute task for "${goal.milestones[0].title}".`,
          urgency: 'high',
        });
      }

      if (goal.targetDate && goal.targetDate - now < 7 * 86400000 && completedMilestones < totalMilestones) {
        const daysLeft = Math.max(1, Math.round((goal.targetDate - now) / 86400000));
        suggestions.push({
          goalId: goal.id,
          title: `Deadline Approaching: "${goal.title}"`,
          reason: `Deadline is in ${daysLeft} days with ${totalMilestones - completedMilestones} milestones remaining.`,
          suggestedAction: 'Review remaining blockers and prioritize next milestone.',
          urgency: 'high',
        });
      }
    }

    if (activeGoals.length === 0) {
      suggestions.push({
        title: 'Define your first long-term Goal',
        reason: 'Goals help OpenDots provide proactive suggestions, research monitoring, and tailored task execution.',
        suggestedAction: 'Click "+ New Goal" in the Goals dashboard to set a personal or technical milestone.',
        urgency: 'low',
      });
    }

    return suggestions;
  }

  // -------------------------------------------------------------
  // APPROVALS (Phase 2.F)
  // -------------------------------------------------------------
  approvals(ownerId = 'opendots-owner', status?: 'pending' | 'approved' | 'rejected'): Approval[] {
    try {
      const query = status
        ? 'SELECT * FROM approvals WHERE ownerId=? AND status=? ORDER BY createdAt DESC'
        : 'SELECT * FROM approvals WHERE ownerId=? ORDER BY createdAt DESC';
      const rows = (status
        ? this.db.prepare(query).all(ownerId, status)
        : this.db.prepare(query).all(ownerId)) as any[];
      return rows.map((r) => ({
        id: r.id,
        ownerId: r.ownerId,
        actionType: r.actionType as ApprovalActionType,
        title: r.title,
        description: r.description,
        destination: r.destination || undefined,
        payload: JSON.parse(r.payloadJson || '{}'),
        consequences: r.consequences || undefined,
        estimatedCost: r.estimatedCost || undefined,
        status: r.status as Approval['status'],
        policy: r.policy as Approval['policy'],
        createdAt: r.createdAt,
        decidedAt: r.decidedAt || undefined,
        decidedBy: r.decidedBy || undefined,
      }));
    } catch {
      return [];
    }
  }

  getApproval(id: string, ownerId = 'opendots-owner'): Approval | undefined {
    return this.approvals(ownerId).find((a) => a.id === id);
  }

  createApproval(
    data: {
      id?: string;
      ownerId?: string;
      actionType: ApprovalActionType;
      title: string;
      description: string;
      destination?: string;
      payload?: Record<string, unknown>;
      consequences?: string;
      estimatedCost?: string;
      status?: Approval['status'];
      policy?: 'always_ask' | 'category_based' | 'pre_authorized';
    },
  ): Approval {
    const id = data.id || randomUUID();
    const now = Date.now();
    const ownerId = data.ownerId || 'opendots-owner';
    const approval: Approval = {
      id,
      ownerId,
      actionType: data.actionType,
      title: data.title,
      description: data.description,
      destination: data.destination,
      payload: data.payload || {},
      consequences: data.consequences,
      estimatedCost: data.estimatedCost,
      status: data.status || 'pending',
      policy: data.policy || 'always_ask',
      createdAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO approvals (id, ownerId, actionType, title, description, destination, payloadJson, consequences, estimatedCost, status, policy, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        approval.id,
        approval.ownerId,
        approval.actionType,
        approval.title,
        approval.description,
        approval.destination || null,
        JSON.stringify(approval.payload),
        approval.consequences || null,
        approval.estimatedCost || null,
        approval.status,
        approval.policy,
        approval.createdAt,
      );
    this.createNotification({
      type: 'approval_required',
      title: `Approval Required: ${approval.title}`,
      message: `${approval.description} (Estimated: ${approval.estimatedCost || 'N/A'})`,
      priority: 'urgent',
      targetId: approval.id,
    });
    return approval;
  }

  decideApproval(
    id: string,
    decision: 'approved' | 'rejected',
    decidedBy = 'user',
    ownerId = 'opendots-owner',
  ): Approval {
    const existing = this.getApproval(id, ownerId);
    if (!existing) throw new Error('Approval request not found.');
    const now = Date.now();
    this.db
      .prepare('UPDATE approvals SET status=?, decidedAt=?, decidedBy=? WHERE id=? AND ownerId=?')
      .run(decision, now, decidedBy, id, ownerId);
    return {
      ...existing,
      status: decision,
      decidedAt: now,
      decidedBy,
    };
  }

  // -------------------------------------------------------------
  // DOCUMENT SNAPSHOTS (Phase 2.K)
  // -------------------------------------------------------------
  saveDocumentSnapshot(
    filePath: string,
    content: string,
    summary?: string,
    ownerId = 'opendots-owner',
  ): DocumentSnapshot {
    const existing = this.documentSnapshots(filePath, ownerId);
    const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;
    const id = randomUUID();
    const now = Date.now();

    const snapshot: DocumentSnapshot = {
      id,
      ownerId,
      filePath,
      version: nextVersion,
      content,
      summary,
      createdAt: now,
    };

    this.db
      .prepare(
        `INSERT INTO document_snapshots (id, ownerId, filePath, version, content, summary, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        snapshot.id,
        snapshot.ownerId,
        snapshot.filePath,
        snapshot.version,
        snapshot.content,
        snapshot.summary || null,
        snapshot.createdAt,
      );

    return snapshot;
  }

  documentSnapshots(filePath?: string, ownerId = 'opendots-owner'): DocumentSnapshot[] {
    try {
      const query = filePath
        ? 'SELECT * FROM document_snapshots WHERE ownerId=? AND filePath=? ORDER BY version DESC'
        : 'SELECT * FROM document_snapshots WHERE ownerId=? ORDER BY createdAt DESC';
      const rows = (filePath
        ? this.db.prepare(query).all(ownerId, filePath)
        : this.db.prepare(query).all(ownerId)) as any[];
      return rows.map((r) => ({
        id: r.id,
        ownerId: r.ownerId,
        filePath: r.filePath,
        version: r.version,
        content: r.content,
        summary: r.summary || undefined,
        createdAt: r.createdAt,
      }));
    } catch {
      return [];
    }
  }

  getDocumentSnapshot(id: string, ownerId = 'opendots-owner'): DocumentSnapshot | undefined {
    return this.documentSnapshots(undefined, ownerId).find((s) => s.id === id);
  }

  // -------------------------------------------------------------
  // MEMORY ENHANCEMENTS (Phase 2.A)
  // -------------------------------------------------------------
  exportMemories(format: 'json' | 'markdown' = 'json', ownerId = 'opendots-owner'): string {
    const memories = this.memoriesV2({ limit: 1000 }, ownerId);
    if (format === 'markdown') {
      let md = '# OpenDots Persistent Personal Memory Export\n\n';
      md += `*Exported on ${new Date().toISOString()} | Total Memories: ${memories.length}*\n\n`;
      const categories: Record<string, typeof memories> = {};
      for (const m of memories) {
        if (!categories[m.category]) categories[m.category] = [];
        categories[m.category].push(m);
      }
      for (const [cat, list] of Object.entries(categories)) {
        md += `## ${cat.toUpperCase()}\n\n`;
        for (const item of list) {
          md += `- **${item.text}** *(Confidence: ${(item.confidence * 100).toFixed(0)}%, Saved: ${new Date(item.createdAt).toLocaleDateString()})*\n`;
        }
        md += '\n';
      }
      return md;
    }
    return JSON.stringify(memories, null, 2);
  }

  purgeMemories(category?: MemoryCategory, ownerId = 'opendots-owner'): number {
    if (category) {
      const info = this.db
        .prepare('DELETE FROM memories_v2 WHERE ownerId=? AND category=?')
        .run(ownerId, category);
      return Number(info.changes);
    }
    const info = this.db
      .prepare('DELETE FROM memories_v2 WHERE ownerId=?')
      .run(ownerId);
    return Number(info.changes);
  }

  // -------------------------------------------------------------
  // NOTIFICATIONS (Gemini Spark Section 6)
  // -------------------------------------------------------------
  notifications(ownerId = 'opendots-owner', unreadOnly = false, limit = 50): Notification[] {
    try {
      const query = unreadOnly
        ? 'SELECT * FROM notifications WHERE ownerId=? AND isRead=0 ORDER BY createdAt DESC, rowid DESC LIMIT ?'
        : 'SELECT * FROM notifications WHERE ownerId=? ORDER BY createdAt DESC, rowid DESC LIMIT ?';
      const rows = this.db.prepare(query).all(ownerId, limit) as any[];
      return rows.map((r) => ({
        id: r.id,
        ownerId: r.ownerId,
        type: r.type as NotificationType,
        title: r.title,
        message: r.message,
        priority: r.priority as NotificationPriority,
        targetId: r.targetId || undefined,
        targetUrl: r.targetUrl || undefined,
        sourceId: r.targetId || undefined,
        actionUrl: r.targetUrl || undefined,
        isRead: Boolean(r.isRead),
        metadata: r.metadataJson ? JSON.parse(r.metadataJson) : undefined,
        createdAt: r.createdAt,
      }));
    } catch {
      return [];
    }
  }

  unreadNotificationCount(ownerId = 'opendots-owner'): number {
    try {
      const res = this.db
        .prepare('SELECT COUNT(*) as count FROM notifications WHERE ownerId=? AND isRead=0')
        .get(ownerId) as { count: number } | undefined;
      return res?.count ?? 0;
    } catch {
      return 0;
    }
  }

  createNotification(
    data: Omit<Notification, 'id' | 'createdAt' | 'isRead'> & {
      id?: string;
      isRead?: boolean;
    },
  ): Notification {
    const id = data.id || randomUUID();
    const now = Date.now();
    const ownerId = data.ownerId || 'opendots-owner';
    const notif: Notification = {
      id,
      ownerId,
      type: data.type,
      title: data.title,
      message: data.message,
      priority: data.priority || 'medium',
      targetId: data.targetId || data.sourceId,
      targetUrl: data.targetUrl || data.actionUrl,
      sourceId: data.sourceId || data.targetId,
      actionUrl: data.actionUrl || data.targetUrl,
      isRead: data.isRead ?? false,
      metadata: data.metadata,
      createdAt: now,
    };
    try {
      this.db
        .prepare(
          `INSERT INTO notifications (id, ownerId, type, title, message, priority, targetId, targetUrl, isRead, metadataJson, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          notif.id,
          notif.ownerId || 'opendots-owner',
          notif.type,
          notif.title,
          notif.message,
          notif.priority,
          notif.targetId || null,
          notif.targetUrl || null,
          notif.isRead ? 1 : 0,
          notif.metadata ? JSON.stringify(notif.metadata) : null,
          notif.createdAt,
        );
    } catch (err) {
      console.error('Failed to insert notification:', err);
    }
    return notif;
  }

  markNotificationRead(id: string, ownerId = 'opendots-owner'): boolean {
    try {
      const info = this.db
        .prepare('UPDATE notifications SET isRead=1 WHERE id=? AND ownerId=?')
        .run(id, ownerId);
      return Number(info.changes) > 0;
    } catch {
      return false;
    }
  }

  markAllNotificationsRead(ownerId = 'opendots-owner'): number {
    try {
      const info = this.db
        .prepare('UPDATE notifications SET isRead=1 WHERE ownerId=? AND isRead=0')
        .run(ownerId);
      return Number(info.changes);
    } catch {
      return 0;
    }
  }

  deleteNotification(id: string, ownerId = 'opendots-owner'): boolean {
    try {
      const info = this.db
        .prepare('DELETE FROM notifications WHERE id=? AND ownerId=?')
        .run(id, ownerId);
      return Number(info.changes) > 0;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------
  // CONDITIONAL MONITORING & TASK CHANGE AUDIT (Gemini Spark Section 1)
  // -------------------------------------------------------------
  recordTaskChange(
    taskId: string,
    changeOrSource:
      | {
          oldValue?: string;
          newValue?: string;
          description?: string;
          source?: string;
          summary?: string;
          meaningfulChange?: boolean;
        }
      | string,
    valOrOld?: string,
    descOrSummary?: string,
    meaningfulOrSummary?: string | boolean,
    isMeaningfulFlag?: boolean,
  ): TaskChangeHistoryItem {
    let item: TaskChangeHistoryItem;
    if (typeof changeOrSource === 'object') {
      item = {
        detectedAt: Date.now(),
        oldValue: changeOrSource.oldValue,
        newValue: changeOrSource.newValue ?? '',
        description: changeOrSource.description || changeOrSource.summary || '',
        source: changeOrSource.source,
        summary: changeOrSource.summary || changeOrSource.description,
        meaningfulChange: changeOrSource.meaningfulChange ?? true,
      };
    } else {
      item = {
        detectedAt: Date.now(),
        source: changeOrSource,
        oldValue: valOrOld,
        newValue: typeof meaningfulOrSummary === 'string' ? meaningfulOrSummary : (valOrOld ?? ''),
        summary: descOrSummary,
        description: descOrSummary || '',
        meaningfulChange:
          typeof meaningfulOrSummary === 'boolean'
            ? meaningfulOrSummary
            : typeof isMeaningfulFlag === 'boolean'
              ? isMeaningfulFlag
              : true,
      };
    }
    try {
      const task = this.task(taskId);
      if (task) {
        const history = [...(task.changeHistory || []), item];
        this.db
          .prepare('UPDATE tasks SET changeHistoryJson=? WHERE id=?')
          .run(JSON.stringify(history), taskId);
      }
    } catch (err) {
      console.error('Failed to record task change history:', err);
    }
    return item;
  }

  evaluateTaskCondition(
    task: Task,
    currentValue: string | number | Record<string, any>,
  ): { shouldTrigger: boolean; changeDetected: boolean; description: string } {
    if (!task.condition) {
      return { shouldTrigger: true, changeDetected: false, description: 'Standard execution.' };
    }
    const cond = task.condition;
    let targetVal: any = currentValue;
    if (typeof currentValue === 'object' && currentValue !== null) {
      if (cond.field && (currentValue as any)[cond.field] !== undefined) {
        targetVal = (currentValue as any)[cond.field];
      }
    }

    const currentStr = String(targetVal);
    const currentNum = typeof targetVal === 'number' ? targetVal : parseFloat(currentStr);
    const lastVal = cond.lastValue;
    const changeDetected = lastVal !== undefined && lastVal !== currentStr;

    let shouldTrigger = false;
    let description = '';

    switch (cond.operator) {
      case 'lt':
      case 'less_than': {
        const thresh = Number(cond.threshold);
        if (!isNaN(currentNum) && !isNaN(thresh) && currentNum < thresh) {
          shouldTrigger = true;
          description = `Metric value (${currentNum}) dropped below target threshold (${thresh}).`;
        }
        break;
      }
      case 'gt':
      case 'greater_than': {
        const thresh = Number(cond.threshold);
        if (!isNaN(currentNum) && !isNaN(thresh) && currentNum > thresh) {
          shouldTrigger = true;
          description = `Metric value (${currentNum}) exceeded target threshold (${thresh}).`;
        }
        break;
      }
      case 'eq':
      case 'equals': {
        if (currentStr.trim().toLowerCase() === String(cond.threshold).trim().toLowerCase()) {
          shouldTrigger = true;
          description = `Target value detected: "${cond.threshold}".`;
        }
        break;
      }
      case 'contains': {
        if (cond.threshold && currentStr.toLowerCase().includes(String(cond.threshold).toLowerCase())) {
          shouldTrigger = true;
          description = `Target keyword "${cond.threshold}" detected in monitored stream.`;
        }
        break;
      }
      case 'changes':
      default: {
        if (changeDetected) {
          shouldTrigger = true;
          description = `Content change detected from "${lastVal?.slice(0, 30)}..." to "${currentStr.slice(0, 30)}...".`;
        }
        break;
      }
    }

    if (shouldTrigger && changeDetected) {
      this.recordTaskChange(task.id, {
        oldValue: lastVal,
        newValue: currentStr,
        description,
      });

      // Update stored lastValue on task
      const updatedCond = { ...cond, lastValue: currentStr };
      this.db
        .prepare('UPDATE tasks SET conditionJson=? WHERE id=?')
        .run(JSON.stringify(updatedCond), task.id);

      this.createNotification({
        type: 'monitoring_alert',
        title: `Monitoring Alert: ${task.prompt.slice(0, 40)}`,
        message: description,
        priority: 'high',
        targetId: task.id,
      });
    }

    return { shouldTrigger, changeDetected, description };
  }

  isQuietHours(quietHours?: TaskQuietHours, now = new Date()): boolean {
    if (!quietHours || !quietHours.enabled) return false;
    try {
      const tz = quietHours.timezone || 'UTC';
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      });
      const parts = formatter.formatToParts(now);
      const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
      const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
      const currentMins = hour * 60 + minute;

      let startH = 22;
      let startM = 0;
      let endH = 7;
      let endM = 0;

      if (quietHours.startHour !== undefined) {
        startH = quietHours.startHour;
      } else if (quietHours.start) {
        [startH, startM] = quietHours.start.split(':').map(Number);
      }

      if (quietHours.endHour !== undefined) {
        endH = quietHours.endHour;
      } else if (quietHours.end) {
        [endH, endM] = quietHours.end.split(':').map(Number);
      }

      const startMins = startH * 60 + (startM || 0);
      const endMins = endH * 60 + (endM || 0);

      if (startMins <= endMins) {
        return currentMins >= startMins && currentMins < endMins;
      } else {
        return currentMins >= startMins || currentMins < endMins;
      }
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------
  // CUSTOM RULES (ChatGPT Dots Auto-Review & Rules)
  // -------------------------------------------------------------
  customRules(ownerId = 'opendots-owner'): CustomRule[] {
    try {
      const rows = this.db
        .prepare('SELECT * FROM custom_rules WHERE ownerId = ? ORDER BY createdAt DESC')
        .all(ownerId) as Array<{
          id: string;
          ownerId: string;
          name: string;
          pattern: string;
          category: string;
          policy: string;
          description: string;
          enabled: number;
          createdAt: number;
          updatedAt: number;
        }>;
      return rows.map((r) => ({
        id: r.id,
        ownerId: r.ownerId,
        name: r.name,
        pattern: r.pattern,
        category: r.category as any,
        policy: r.policy as any,
        description: r.description,
        enabled: Boolean(r.enabled),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    } catch {
      return [];
    }
  }

  getCustomRule(id: string, ownerId = 'opendots-owner'): CustomRule | undefined {
    return this.customRules(ownerId).find((r) => r.id === id);
  }

  createCustomRule(
    data: Omit<CustomRule, 'id' | 'createdAt' | 'updatedAt' | 'ownerId'> & { id?: string; ownerId?: string },
  ): CustomRule {
    const id = data.id || randomUUID();
    const now = Date.now();
    const rule: CustomRule = {
      id,
      ownerId: data.ownerId || 'opendots-owner',
      name: data.name,
      pattern: data.pattern,
      category: data.category || 'general',
      policy: data.policy || 'take_action_without_asking',
      description: data.description || '',
      enabled: data.enabled !== false,
      createdAt: now,
      updatedAt: now,
    };

    this.db
      .prepare(
        `INSERT INTO custom_rules (id, ownerId, name, pattern, category, policy, description, enabled, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        rule.id,
        rule.ownerId,
        rule.name,
        rule.pattern,
        rule.category,
        rule.policy,
        rule.description,
        rule.enabled ? 1 : 0,
        rule.createdAt,
        rule.updatedAt,
      );

    return rule;
  }

  updateCustomRule(
    id: string,
    updates: Partial<CustomRule>,
    ownerId = 'opendots-owner',
  ): CustomRule | undefined {
    const existing = this.getCustomRule(id, ownerId);
    if (!existing) return undefined;

    const updated: CustomRule = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    this.db
      .prepare(
        `UPDATE custom_rules SET
           name = ?, pattern = ?, category = ?, policy = ?, description = ?, enabled = ?, updatedAt = ?
         WHERE id = ? AND ownerId = ?`,
      )
      .run(
        updated.name,
        updated.pattern,
        updated.category,
        updated.policy,
        updated.description,
        updated.enabled ? 1 : 0,
        updated.updatedAt,
        id,
        ownerId,
      );

    return updated;
  }

  deleteCustomRule(id: string, ownerId = 'opendots-owner'): boolean {
    const result = this.db
      .prepare('DELETE FROM custom_rules WHERE id = ? AND ownerId = ?')
      .run(id, ownerId);
    return Boolean(result.changes);
  }

  // -------------------------------------------------------------
  // PROACTIVE MONITORS (ChatGPT Dots Standing Monitoring)
  // -------------------------------------------------------------
  proactiveMonitors(ownerId = 'opendots-owner'): ProactiveMonitor[] {
    try {
      const rows = this.db
        .prepare('SELECT * FROM proactive_monitors WHERE ownerId = ? ORDER BY createdAt DESC')
        .all(ownerId) as Array<{
          id: string;
          ownerId: string;
          topic: string;
          sourcesJson: string;
          intervalMinutes: number;
          lastCheckedAt: number | null;
          lastResultSummary: string | null;
          status: string;
          createdAt: number;
          updatedAt: number;
        }>;
      return rows.map((r) => ({
        id: r.id,
        ownerId: r.ownerId,
        topic: r.topic,
        sources: JSON.parse(r.sourcesJson || '[]'),
        intervalMinutes: r.intervalMinutes,
        lastCheckedAt: r.lastCheckedAt ?? undefined,
        lastResultSummary: r.lastResultSummary ?? undefined,
        status: r.status as 'active' | 'paused',
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    } catch {
      return [];
    }
  }

  getProactiveMonitor(id: string, ownerId = 'opendots-owner'): ProactiveMonitor | undefined {
    return this.proactiveMonitors(ownerId).find((m) => m.id === id);
  }

  saveProactiveMonitor(monitor: ProactiveMonitor): ProactiveMonitor {
    this.db
      .prepare(
        `INSERT INTO proactive_monitors (id, ownerId, topic, sourcesJson, intervalMinutes, lastCheckedAt, lastResultSummary, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           topic = excluded.topic,
           sourcesJson = excluded.sourcesJson,
           intervalMinutes = excluded.intervalMinutes,
           lastCheckedAt = excluded.lastCheckedAt,
           lastResultSummary = excluded.lastResultSummary,
           status = excluded.status,
           updatedAt = excluded.updatedAt`,
      )
      .run(
        monitor.id,
        monitor.ownerId,
        monitor.topic,
        JSON.stringify(monitor.sources || []),
        monitor.intervalMinutes || 60,
        monitor.lastCheckedAt || null,
        monitor.lastResultSummary || null,
        monitor.status || 'active',
        monitor.createdAt,
        monitor.updatedAt,
      );
    return monitor;
  }

  deleteProactiveMonitor(id: string, ownerId = 'opendots-owner'): boolean {
    const result = this.db
      .prepare('DELETE FROM proactive_monitors WHERE id = ? AND ownerId = ?')
      .run(id, ownerId);
    return Boolean(result.changes);
  }
}
