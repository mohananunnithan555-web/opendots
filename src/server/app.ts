import { computerRoutes } from './computer-routes.js';
import { connectionRoutes } from './connection-routes.js';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Store } from './store.js';
import { Runner } from './runner.js';
import { configured, type Config } from './research.js';
import type { Platform } from './platform.js';
import { VoiceService } from './voice.js';
import { workspaceRoutes } from './workspace-routes.js';
import { TaskPlanner } from './planner/task-planner.js';
import { globalSkillRegistry } from './skills/index.js';
const interval = z.number().int().min(60).max(31_536_000).nullable();
export interface AppOptions {
  store: Store;
  runner: Runner;
  config: Config;
  ownerToken?: string;
  origin?: string | string[];
  platform?: Platform;
}
export function createApp({
  store,
  runner,
  config,
  ownerToken,
  origin,
  platform,
}: AppOptions) {
  const app = new Hono();
  const taskPlanner = new TaskPlanner(store);
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 1_000_000,
      onError: (c) => c.json({ error: 'Request is too large.' }, 413),
    }),
  );
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    const requestUrl = new URL(c.req.url);
    const origins = origin
      ? Array.isArray(origin)
        ? origin
        : [origin]
      : undefined;
    const originHostnames = origins
      ? origins
          .map((o) => {
            try {
              return new URL(o).hostname;
            } catch {
              return '';
            }
          })
          .filter(Boolean)
      : [];
    const allowedHosts = new Set([
      'localhost',
      '127.0.0.1',
      '[::1]',
      ...originHostnames,
    ]);
    if (!ownerToken && !allowedHosts.has(requestUrl.hostname))
      return c.json({ error: 'Unrecognized host.' }, 403);
    const requestOrigin = c.req.header('origin');
    const allowedOrigins = new Set(origins ?? [new URL(c.req.url).origin]);

    if (requestOrigin && !allowedOrigins.has(requestOrigin))
      return c.json({ error: 'Cross-origin requests are not allowed.' }, 403);
    if (c.req.header('sec-fetch-site') === 'cross-site')
      return c.json({ error: 'Cross-site requests are not allowed.' }, 403);
    if (ownerToken) {
      const expected = Buffer.from(ownerToken);
      const supplied = Buffer.from(
        c.req.header('authorization')?.replace(/^Bearer /, '') ?? '',
      );
      if (
        expected.length !== supplied.length ||
        !timingSafeEqual(expected, supplied)
      )
        return c.json(
          { error: 'Enter your owner access token to unlock OpenDots.' },
          401,
        );
    }
    if (
      !['GET', 'HEAD'].includes(c.req.method) &&
      !c.req.header('content-type')?.includes('application/json')
    )
      return c.json({ error: 'Use application/json.' }, 415);
    await next();
  });
  if (platform) app.route('/api', computerRoutes(platform.computers));
  if (platform)
    app.route(
      '/api',
      connectionRoutes(platform.workspace, platform.connections),
    );
  const voice = platform ? new VoiceService(platform) : undefined;
  if (platform && voice) app.route('/api', workspaceRoutes(platform, voice));
  app.get('/api/state', (c) =>
    c.json({
      settings: store.settings(),
      tasks: store.tasks(),
      memories: store.memories(),
      mode: config.mode,
      configured: configured(config),
    }),
  );
  app.post('/api/tasks', async (c) => {
    const parsed = z
      .object({
        prompt: z.string().trim().min(3).max(4000),
        intervalSeconds: interval.optional(),
        threadId: z.string().optional(),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json(
        {
          error:
            'Enter a request between 3 and 4,000 characters; repeat intervals must be at least 60 seconds.',
        },
        400,
      );
    if (!store.settings().researchAllowed)
      return c.json({ error: 'Research is disabled in Settings.' }, 403);
    if (platform) {
      if (platform.setup().missing.length)
        return c.json(
          { error: `Setup required: ${platform.setup().missing.join(', ')}.` },
          503,
        );
      if (!parsed.data.threadId)
        return c.json(
          { error: 'Select a conversation for this scheduled task.' },
          400,
        );
      try {
        platform.workspace.requireThread(parsed.data.threadId);
      } catch {
        return c.json(
          { error: 'Conversation is not owned by this workspace.' },
          403,
        );
      }
    }
    const task = store.createTask(
      parsed.data.prompt,
      parsed.data.intervalSeconds,
    );
    if (platform && parsed.data.threadId)
      platform.workspace.bindTask(task.id, parsed.data.threadId);
    return c.json(task, 201);
  });
  app.post('/api/cloud-tasks', async (c) => {
    const parsed = z
      .object({
        prompt: z.string().trim().min(3).max(4000),
        intervalSeconds: interval.optional(),
        delaySeconds: z.number().int().min(0).max(86400 * 365).optional(),
        timezone: z.string().optional(),
        dotId: z.string().optional(),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json(
        { error: 'Provide a task prompt between 3 and 4,000 characters.' },
        400,
      );
    if (!store.settings().researchAllowed)
      return c.json({ error: 'Research is disabled in Settings.' }, 403);

    const nextRunAt = parsed.data.delaySeconds
      ? Date.now() + parsed.data.delaySeconds * 1000
      : Date.now();

    const task = store.createTask(
      parsed.data.prompt,
      parsed.data.intervalSeconds ?? null,
      nextRunAt,
    );

    let threadId: string | undefined;
    if (platform) {
      const dotId = parsed.data.dotId || platform.workspace.dots()[0]?.id;
      if (dotId) {
        const thread = platform.workspace.bindThread(
          randomUUID(),
          dotId,
          `Cloud Task: ${parsed.data.prompt.slice(0, 36)}...`,
        );
        threadId = thread.id;
        platform.workspace.bindTask(task.id, thread.id);
      }
    }

    return c.json(
      {
        task,
        threadId,
        timezone: parsed.data.timezone ?? 'UTC',
        status: 'queued',
        message: 'Task successfully queued for background cloud execution.',
      },
      201,
    );
  });
  app.get('/api/cloud-tasks', (c) => {
    const tasks = store.tasks();
    const details = tasks.map((task) => {
      const detail = store.detail(task.id);
      const threadId = platform?.workspace.taskThread(task.id);
      return {
        ...task,
        threadId,
        runs: detail?.runs ?? [],
        events: detail?.events ?? [],
      };
    });
    return c.json(details);
  });
  app.get('/api/activity', (c) => {
    const limit = Math.min(Number(c.req.query('limit') || 60), 200);
    const events = store.recentEvents(limit);
    const plans = store.listTaskPlans();
    const memories = store.memoriesV2({ limit: 30 });

    const feed: Array<{
      id: string;
      type: 'task' | 'plan' | 'memory';
      title: string;
      description: string;
      status?: string;
      timestamp: number;
    }> = [];

    for (const event of events) {
      feed.push({
        id: `event-${event.id}`,
        type: 'task',
        title: `Cloud Event`,
        description: event.text,
        timestamp: event.createdAt,
      });
    }

    for (const plan of plans) {
      const completed = plan.steps.filter((s) => s.status === 'completed').length;
      feed.push({
        id: `plan-${plan.id}`,
        type: 'plan',
        title: `Plan: ${plan.goal.slice(0, 48)}${plan.goal.length > 48 ? '...' : ''}`,
        description: `Status: ${plan.status} (${completed}/${plan.steps.length} steps completed)`,
        status: plan.status,
        timestamp: plan.updatedAt || plan.createdAt,
      });
    }

    for (const mem of memories) {
      feed.push({
        id: `mem-${mem.id}`,
        type: 'memory',
        title: `Memory Saved [${mem.category}]`,
        description: mem.text.slice(0, 80) + (mem.text.length > 80 ? '...' : ''),
        timestamp: mem.updatedAt || mem.createdAt,
      });
    }

    feed.sort((a, b) => b.timestamp - a.timestamp);
    return c.json(feed.slice(0, limit));
  });
  app.get('/api/tasks/:id', (c) => {
    const detail = store.detail(c.req.param('id'));
    return detail ? c.json(detail) : c.json({ error: 'Task not found.' }, 404);
  });
  app.post('/api/tasks/:id/actions', async (c) => {
    const parsed = z
      .object({ action: z.enum(['run', 'pause', 'cancel']) })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Unknown task action.' }, 400);
    if (parsed.data.action === 'run' && !store.settings().researchAllowed)
      return c.json({ error: 'Research is disabled in Settings.' }, 403);
    const task = store.action(c.req.param('id'), parsed.data.action);
    if (parsed.data.action !== 'run') runner.abort(c.req.param('id'));
    return task ? c.json(task) : c.json({ error: 'Task not found.' }, 404);
  });
  app.put('/api/tasks/:id/schedule', async (c) => {
    const parsed = z
      .object({ intervalSeconds: interval })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json(
        { error: 'Repeat interval must be 60 seconds to one year, or null.' },
        400,
      );
    const task = store.schedule(c.req.param('id'), parsed.data.intervalSeconds);
    return task ? c.json(task) : c.json({ error: 'Task not found.' }, 404);
  });
  app.delete('/api/tasks/:id', (c) => {
    runner.abort(c.req.param('id'));
    return store.deleteTask(c.req.param('id'))
      ? c.json({ ok: true })
      : c.json({ error: 'Task not found.' }, 404);
  });
  app.patch('/api/settings', async (c) => {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(40).optional(),
        paused: z.boolean().optional(),
        researchAllowed: z.boolean().optional(),
        memoryAllowed: z.boolean().optional(),
        appsAllowed: z.boolean().optional(),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid settings.' }, 400);
    const previous = store.settings();
    const settings = store.updateSettings(parsed.data);
    if (
      settings.paused ||
      !settings.researchAllowed ||
      previous.memoryAllowed !== settings.memoryAllowed ||
      previous.appsAllowed !== settings.appsAllowed
    )
      runner.abortAll();
    if (settings.paused) voice?.abortAll();
    else void voice?.resumePending();
    return c.json(settings);
  });
  app.get('/api/memories', (c) => {
    const category = c.req.query('category') as any;
    const query = c.req.query('query');
    return c.json(store.memoriesV2({ category, query }));
  });
  app.post('/api/memories', async (c) => {
    const parsed = z
      .object({
        text: z.string().trim().min(1).max(2000),
        category: z
          .enum([
            'preference',
            'project',
            'conversation_summary',
            'task_context',
          ])
          .optional(),
        pinned: z.boolean().optional(),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json(
        { error: 'Memory must be between 1 and 2,000 characters.' },
        400,
      );
    try {
      const record = store.saveMemoryV2({
        text: parsed.data.text,
        category: parsed.data.category,
        pinned: parsed.data.pinned,
      });
      return c.json(record, 201);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Invalid memory input.' },
        400,
      );
    }
  });
  app.put('/api/memories/:id', async (c) => {
    const parsed = z
      .object({
        text: z.string().trim().min(1).max(2000),
        category: z
          .enum([
            'preference',
            'project',
            'conversation_summary',
            'task_context',
          ])
          .optional(),
        pinned: z.boolean().optional(),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json(
        { error: 'Memory must be between 1 and 2,000 characters.' },
        400,
      );
    if (!store.memoriesV2().some((m) => m.id === c.req.param('id')))
      return c.json({ error: 'Memory not found.' }, 404);
    try {
      const record = store.saveMemoryV2({
        id: c.req.param('id'),
        text: parsed.data.text,
        category: parsed.data.category,
        pinned: parsed.data.pinned,
      });
      return c.json(record);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Invalid memory input.' },
        400,
      );
    }
  });
  app.delete('/api/memories/:id', (c) =>
    store.forgetMemory(c.req.param('id'))
      ? c.json({ ok: true })
      : c.json({ error: 'Memory not found.' }, 404),
  );
  app.delete('/api/memories', (c) => {
    const category = c.req.query('category') as any;
    if (!category) {
      return c.json({ error: 'Specify a category to clear.' }, 400);
    }
    const count = store.clearMemoriesCategory(category);
    return c.json({ ok: true, deleted: count });
  });

  // Autonomous Task Plans API
  app.get('/api/plans', (c) => {
    return c.json(taskPlanner.listPlans());
  });

  app.post('/api/plans', async (c) => {
    const parsed = z
      .object({ goal: z.string().trim().min(1).max(2000) })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'Goal is required and must be under 2,000 characters.' }, 400);
    }
    try {
      const plan = taskPlanner.createPlan(parsed.data.goal);
      return c.json(plan, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Failed to create plan.' }, 400);
    }
  });

  app.get('/api/plans/:id', (c) => {
    const plan = taskPlanner.getPlan(c.req.param('id'));
    return plan ? c.json(plan) : c.json({ error: 'Plan not found.' }, 404);
  });

  app.post('/api/plans/:id/step', async (c) => {
    try {
      const result = await taskPlanner.executeNextStep(c.req.param('id'));
      return c.json(result);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Step execution failed.' }, 400);
    }
  });

  app.post('/api/plans/:id/steps/:stepId/approve', async (c) => {
    try {
      const result = await taskPlanner.approveStep(c.req.param('id'), c.req.param('stepId'));
      return c.json(result);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Approval failed.' }, 400);
    }
  });

  app.post('/api/plans/:id/cancel', (c) => {
    try {
      const plan = taskPlanner.cancelPlan(c.req.param('id'));
      return c.json(plan);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Cancellation failed.' }, 400);
    }
  });

  app.delete('/api/plans/:id', (c) => {
    return store.deleteTaskPlan(c.req.param('id'))
      ? c.json({ ok: true })
      : c.json({ error: 'Plan not found.' }, 404);
  });

  app.get('/api/skills', (c) => {
    const builtinSkills = globalSkillRegistry.list();
    const custom = store.customSkills();
    return c.json({
      builtin: builtinSkills,
      custom,
    });
  });

  app.post('/api/skills', async (c) => {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(80),
        description: z.string().trim().min(1).max(500),
        version: z.string().trim().default('1.0.0'),
        instructions: z.string().trim().min(1).max(5000),
        category: z
          .enum(['analysis', 'utility', 'generation', 'research', 'coding'])
          .default('utility'),
        requiredPermissions: z
          .array(
            z.enum([
              'basic',
              'research',
              'files',
              'media',
              'code',
              'computer',
              'admin',
            ]),
          )
          .default(['basic']),
        allowedTools: z.array(z.string()).default([]),
        timeoutMs: z.number().int().min(1000).max(300000).default(30000),
        enabled: z.boolean().default(true),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json(
        { error: 'Invalid skill data. Please provide name, description, and instructions.' },
        400,
      );
    try {
      const created = store.saveCustomSkill(parsed.data);
      return c.json(created, 201);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Could not save skill.' },
        400,
      );
    }
  });

  app.put('/api/skills/:id', async (c) => {
    const id = c.req.param('id');
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(80).optional(),
        description: z.string().trim().min(1).max(500).optional(),
        version: z.string().trim().optional(),
        instructions: z.string().trim().min(1).max(5000).optional(),
        category: z
          .enum(['analysis', 'utility', 'generation', 'research', 'coding'])
          .optional(),
        requiredPermissions: z
          .array(
            z.enum([
              'basic',
              'research',
              'files',
              'media',
              'code',
              'computer',
              'admin',
            ]),
          )
          .optional(),
        allowedTools: z.array(z.string()).optional(),
        timeoutMs: z.number().int().min(1000).max(300000).optional(),
        enabled: z.boolean().optional(),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return c.json({ error: 'Invalid skill update data.' }, 400);
    try {
      const updated = store.updateCustomSkill(id, parsed.data);
      return c.json(updated);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Could not update skill.' },
        404,
      );
    }
  });

  app.post('/api/skills/:id/toggle', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    try {
      const updated = store.toggleCustomSkill(id, body?.enabled);
      return c.json(updated);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Could not toggle skill.' },
        404,
      );
    }
  });

  app.post('/api/skills/:id/duplicate', (c) => {
    const id = c.req.param('id');
    const skill = store.customSkills().find((s) => s.id === id);
    if (!skill) return c.json({ error: 'Skill not found.' }, 404);
    const duplicated = store.saveCustomSkill({
      ...skill,
      name: `${skill.name} (Copy)`,
      description: skill.description,
      instructions: skill.instructions,
      id: undefined,
    });
    return c.json(duplicated, 201);
  });

  app.delete('/api/skills/:id', (c) => {
    const id = c.req.param('id');
    store.deleteCustomSkill(id);
    return c.json({ ok: true });
  });

  app.onError((error, c) => {
    console.error('API request failed:', error.name);
    return c.json(
      {
        error:
          'The server could not complete this request. Check server logs and database access.',
      },
      500,
    );
  });
  return app;
}
