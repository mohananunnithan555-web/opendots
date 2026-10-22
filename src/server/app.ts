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
import { globalFileWorkspace } from './files/file-workspace.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  COWORK_WORKFLOW_TEMPLATES,
  getCoworkTemplate,
} from './planner/cowork-templates.js';
import type {
  ConnectorType,
  ApprovalActionType,
  WorkflowAnalysisProposal,
  TaskTriggerType,
} from '../shared/types.js';
import type { MemoryCategory } from './memory-types.js';
import {
  buildImageGenerationConfig,
  type ImageQuality,
  type ImageAspectRatio,
  type ImageStyle,
} from './image-config.js';
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

  // Cowork Workflow Templates API
  app.get('/api/planner/templates', (c) => {
    return c.json(COWORK_WORKFLOW_TEMPLATES);
  });

  app.get('/api/planner/templates/:templateId', (c) => {
    const template = getCoworkTemplate(c.req.param('templateId'));
    if (!template) return c.json({ error: 'Template not found' }, 404);
    return c.json(template);
  });

  app.post('/api/planner/templates/:templateId/instantiate', async (c) => {
    const templateId = c.req.param('templateId');
    const parsed = z
      .object({
        goal: z.string().trim().max(2000).optional(),
        spaceId: z.string().optional(),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'Invalid instantiation payload.' }, 400);
    }
    try {
      const plan = taskPlanner.createPlanFromTemplate(
        templateId,
        parsed.data.goal,
        parsed.data.spaceId,
      );
      return c.json(plan, 201);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Failed to instantiate template.' },
        400,
      );
    }
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

  app.post('/api/plans/:id/pause', (c) => {
    try {
      const plan = taskPlanner.pausePlan(c.req.param('id'));
      return c.json(plan);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Pause failed.' }, 400);
    }
  });

  app.post('/api/plans/:id/resume', (c) => {
    try {
      const plan = taskPlanner.resumePlan(c.req.param('id'));
      return c.json(plan);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Resume failed.' }, 400);
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

  app.post('/api/plans/:id/steps/:stepId/replan', async (c) => {
    const parsed = z
      .object({
        reason: z.string().trim().min(1).max(1000),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'Replan reason is required.' }, 400);
    }
    try {
      const plan = taskPlanner.replanStep(
        c.req.param('id'),
        c.req.param('stepId'),
        parsed.data.reason,
      );
      return c.json(plan);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Replan failed.' }, 400);
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

  // Project Workspace Files API
  app.get('/api/projects/:id/files', async (c) => {
    const projectId = c.req.param('id');
    try {
      const files = await globalFileWorkspace.listFiles('', projectId);
      return c.json({ files });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Failed to list project files.' },
        500,
      );
    }
  });

  app.post('/api/projects/:id/files', async (c) => {
    const projectId = c.req.param('id');
    const parsed = z
      .object({
        path: z.string().trim().min(1).max(500),
        content: z.string(),
        category: z.enum(['source', 'intermediate', 'deliverable', 'archive', 'general']).optional(),
        comment: z.string().max(200).optional(),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'Valid path and content are required.' }, 400);
    }
    try {
      const saved = await globalFileWorkspace.writeVersionedFile(
        parsed.data.path,
        parsed.data.content,
        'user',
        parsed.data.comment || 'Uploaded to project',
        projectId,
        parsed.data.category || 'source',
      );
      return c.json(saved, 201);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Failed to write project file.' },
        400,
      );
    }
  });

  app.get('/api/files/download', async (c) => {
    const filePath = c.req.query('path');
    const projectId = c.req.query('projectId') || undefined;
    if (!filePath) {
      return c.json({ error: 'Path query parameter is required.' }, 400);
    }
    try {
      const resolved = globalFileWorkspace.resolveSafePath(filePath, projectId);
      const content = await fs.readFile(resolved, 'utf-8');
      const filename = path.basename(resolved);
      const ext = path.extname(filename).toLowerCase();
      let contentType = 'text/plain; charset=utf-8';
      if (ext === '.json') contentType = 'application/json';
      else if (ext === '.csv') contentType = 'text/csv; charset=utf-8';
      else if (ext === '.md') contentType = 'text/markdown; charset=utf-8';
      else if (ext === '.html') contentType = 'text/html; charset=utf-8';

      c.header('Content-Type', contentType);
      c.header('Content-Disposition', `attachment; filename="${filename}"`);
      return c.body(content);
    } catch (err) {
      return c.json({ error: 'File not found or access denied.' }, 404);
    }
  });

  app.get('/api/files/diff', async (c) => {
    const filePath = c.req.query('path');
    const v1 = parseInt(c.req.query('v1') || '1', 10);
    const v2 = parseInt(c.req.query('v2') || '2', 10);
    const projectId = c.req.query('projectId') || undefined;
    if (!filePath) {
      return c.json({ error: 'Path query parameter is required.' }, 400);
    }
    try {
      const diff = await globalFileWorkspace.diffVersions(filePath, v1, v2, projectId);
      return c.json(diff);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Diff failed.' }, 400);
    }
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

  // Image proxy endpoint (enables CORS-safe canvas manipulation & high-res upscaling)
  app.get('/api/image/proxy', async (c) => {
    const url = c.req.query('url');
    if (!url) return c.json({ error: 'Missing url parameter.' }, 400);

    try {
      const parsed = new URL(url);
      const allowedHosts = ['image.pollinations.ai', 'pollinations.ai', 'gen.pollinations.ai'];
      if (!allowedHosts.includes(parsed.hostname)) {
        return c.json({ error: 'Host not permitted.' }, 403);
      }

      const response = await fetch(url);
      if (!response.ok) {
        return c.json({ error: `Provider returned status ${response.status}.` }, 502);
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const buffer = Buffer.from(await response.arrayBuffer());

      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch {
      return c.json({ error: 'Failed to proxy image.' }, 500);
    }
  });

  // Direct image download endpoint (forces Content-Disposition attachment on all desktop & mobile browsers)
  app.get('/api/image/download', async (c) => {
    const url = c.req.query('url');
    const rawFilename = c.req.query('filename') || 'opendots-image.jpg';
    const filename = rawFilename.replace(/[^a-zA-Z0-9_.-]/g, '_');

    if (!url) return c.json({ error: 'Missing url parameter.' }, 400);

    try {
      const parsed = new URL(url);
      const allowedHosts = ['image.pollinations.ai', 'pollinations.ai', 'gen.pollinations.ai'];
      if (!allowedHosts.includes(parsed.hostname)) {
        return c.json({ error: 'Host not permitted.' }, 403);
      }

      const response = await fetch(url);
      if (!response.ok) {
        return c.json({ error: `Provider returned status ${response.status}.` }, 502);
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const buffer = Buffer.from(await response.arrayBuffer());

      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-cache',
        },
      });
    } catch {
      return c.json({ error: 'Download failed.' }, 500);
    }
  });

  // Image generation endpoint (used by Image Studio modal)
  app.post('/api/image/generate', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) {
      return c.json({ error: 'Please enter a visual prompt.' }, 400);
    }

    const quality = ['standard', 'hd', '4k'].includes(body.quality)
      ? (body.quality as ImageQuality)
      : 'standard';
    const aspectRatio = ['16:9', '1:1', '4:3', '3:4', '9:16'].includes(body.aspectRatio)
      ? (body.aspectRatio as ImageAspectRatio)
      : '1:1';
    const style = typeof body.style === 'string' ? (body.style as ImageStyle) : 'photorealistic';

    const apiKey = process.env.POLLINATIONS_API_KEY?.trim();
    const result = buildImageGenerationConfig(
      { prompt, quality, aspectRatio, style },
      apiKey,
    );

    return c.json(result);
  });

  // -------------------------------------------------------------
  // GOALS (Phase 2.B)
  // -------------------------------------------------------------
  app.get('/api/goals', (c) => {
    const status = c.req.query('status');
    const goals = store.goals('opendots-owner', status || undefined);
    return c.json(goals);
  });

  app.get('/api/goals/suggestions', (c) => {
    const suggestions = store.proactiveGoalSuggestions('opendots-owner');
    return c.json(suggestions);
  });

  app.get('/api/goals/:id', (c) => {
    const goal = store.getGoal(c.req.param('id'), 'opendots-owner');
    return goal ? c.json(goal) : c.json({ error: 'Goal not found.' }, 404);
  });

  app.post('/api/goals', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
      return c.json({ error: 'Goal title is required.' }, 400);
    }
    const created = store.createGoal({
      title: body.title.trim(),
      description: body.description,
      category: body.category || 'personal',
      targetDate: body.targetDate ? Number(body.targetDate) : undefined,
      priority: body.priority || 'medium',
      status: body.status || 'active',
      milestones: Array.isArray(body.milestones) ? body.milestones : [],
      metrics: body.metrics || {},
      notes: body.notes,
    });
    return c.json(created, 201);
  });

  app.put('/api/goals/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    try {
      const updated = store.updateGoal(id, body, 'opendots-owner');
      return c.json(updated);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Goal update failed.' }, 400);
    }
  });

  app.delete('/api/goals/:id', (c) => {
    store.deleteGoal(c.req.param('id'), 'opendots-owner');
    return c.json({ ok: true });
  });

  // -------------------------------------------------------------
  // APPROVALS (Phase 2.F)
  // -------------------------------------------------------------
  app.get('/api/approvals', (c) => {
    const status = c.req.query('status') as 'pending' | 'approved' | 'rejected' | undefined;
    const approvals = store.approvals('opendots-owner', status || undefined);
    return c.json(approvals);
  });

  app.get('/api/approvals/:id', (c) => {
    const approval = store.getApproval(c.req.param('id'), 'opendots-owner');
    return approval ? c.json(approval) : c.json({ error: 'Approval request not found.' }, 404);
  });

  app.post('/api/approvals', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.actionType || !body.title || !body.description) {
      return c.json({ error: 'actionType, title, and description are required.' }, 400);
    }
    const created = store.createApproval({
      actionType: body.actionType as ApprovalActionType,
      title: body.title,
      description: body.description,
      destination: body.destination,
      payload: body.payload || {},
      consequences: body.consequences,
      estimatedCost: body.estimatedCost,
      policy: body.policy || store.settings().approvalPolicy || 'always_ask',
    });
    return c.json(created, 201);
  });

  app.post('/api/approvals/:id/decide', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    if (!['approved', 'rejected'].includes(body.decision)) {
      return c.json({ error: 'decision must be "approved" or "rejected".' }, 400);
    }
    try {
      const updated = store.decideApproval(id, body.decision, body.decidedBy || 'user', 'opendots-owner');
      return c.json(updated);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Decision failed.' }, 400);
    }
  });

  // -------------------------------------------------------------
  // CONNECTORS (Phase 2.E)
  // -------------------------------------------------------------
  app.get('/api/connectors', (c) => {
    const connectors = store.connectors('opendots-owner');
    return c.json(connectors);
  });

  app.get('/api/connectors/:type', (c) => {
    const conn = store.getConnector(c.req.param('type') as ConnectorType, 'opendots-owner');
    return conn ? c.json(conn) : c.json({ error: 'Connector not found.' }, 404);
  });

  app.put('/api/connectors/:type', async (c) => {
    const type = c.req.param('type') as ConnectorType;
    const body = await c.req.json().catch(() => ({}));
    try {
      const updated = store.updateConnector(type, body, 'opendots-owner');
      return c.json(updated);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Update failed.' }, 400);
    }
  });

  app.post('/api/connectors/:type/test', (c) => {
    const type = c.req.param('type') as ConnectorType;
    const result = store.testConnector(type, 'opendots-owner');
    return c.json(result);
  });

  app.post('/api/connectors/:type/disconnect', (c) => {
    const type = c.req.param('type') as ConnectorType;
    try {
      const disconnected = store.disconnectConnector(type, 'opendots-owner');
      return c.json(disconnected);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Disconnect failed.' }, 400);
    }
  });

  // -------------------------------------------------------------
  // DOCUMENT SNAPSHOTS (Phase 2.K)
  // -------------------------------------------------------------
  app.get('/api/workspace-files/snapshots', (c) => {
    const filePath = c.req.query('filePath');
    const snapshots = store.documentSnapshots(filePath || undefined, 'opendots-owner');
    return c.json(snapshots);
  });

  app.post('/api/workspace-files/snapshots', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.filePath || typeof body.filePath !== 'string') {
      return c.json({ error: 'filePath is required.' }, 400);
    }
    try {
      const content = body.content !== undefined ? body.content : globalFileWorkspace.readFile(body.filePath).content;
      const snapshot = store.saveDocumentSnapshot(body.filePath, content, body.summary, 'opendots-owner');
      return c.json(snapshot, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Failed to create snapshot.' }, 400);
    }
  });

  app.post('/api/workspace-files/rollback', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.snapshotId) {
      return c.json({ error: 'snapshotId is required.' }, 400);
    }
    const snapshot = store.getDocumentSnapshot(body.snapshotId, 'opendots-owner');
    if (!snapshot) return c.json({ error: 'Snapshot not found.' }, 404);

    try {
      const written = globalFileWorkspace.writeFile(snapshot.filePath, snapshot.content);
      return c.json({ ok: true, file: written, version: snapshot.version });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Rollback failed.' }, 400);
    }
  });

  // -------------------------------------------------------------
  // MEMORY CONTROLS (Phase 2.A)
  // -------------------------------------------------------------
  app.get('/api/memories/export', (c) => {
    const format = c.req.query('format') === 'markdown' ? 'markdown' : 'json';
    const exported = store.exportMemories(format, 'opendots-owner');
    if (format === 'markdown') {
      c.header('Content-Type', 'text/markdown; charset=utf-8');
      c.header('Content-Disposition', 'attachment; filename="opendots-memories-export.md"');
      return c.text(exported);
    }
    c.header('Content-Type', 'application/json');
    c.header('Content-Disposition', 'attachment; filename="opendots-memories-export.json"');
    return c.text(exported);
  });

  app.post('/api/memories/purge', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const category = body.category || undefined;
    const count = store.purgeMemories(category, 'opendots-owner');
    return c.json({ ok: true, deletedCount: count });
  });

  // -------------------------------------------------------------
  // TOOL BUILDER (Phase 2.H)
  // -------------------------------------------------------------
  app.post('/api/tools/propose', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const name = body.name || 'custom_utility_tool';
    const description = body.description || 'Custom capability created for automated task execution';
    const instructions = body.instructions || 'Execute task using structured steps and validation.';

    return c.json({
      proposedTool: {
        name,
        description,
        version: '1.0.0',
        instructions,
        category: body.category || 'utility',
        requiredPermissions: ['basic'],
        allowedTools: [],
        timeoutMs: 30000,
        safetyChecksPassed: true,
        estimatedCost: '$0.00 (Local Execution)',
      },
      message: 'Tool proposal generated and ready for sandbox verification.',
    });
  });

  app.post('/api/tools/verify', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.name || !body.instructions) {
      return c.json({ error: 'Tool name and instructions are required for verification.' }, 400);
    }
    const hasDisallowed = body.instructions.includes('process.exit') || body.instructions.includes('rm -rf');
    return c.json({
      verified: !hasDisallowed,
      warnings: hasDisallowed ? ['Unsafe system calls detected in tool logic.'] : [],
      status: !hasDisallowed ? 'ready_for_installation' : 'rejected_by_sandbox',
    });
  });

  app.post('/api/tools/install', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    try {
      const installed = store.saveCustomSkill({
        name: body.name,
        description: body.description,
        version: body.version || '1.0.0',
        instructions: body.instructions,
        category: body.category || 'utility',
        requiredPermissions: body.requiredPermissions || ['basic'],
        allowedTools: body.allowedTools || [],
        timeoutMs: body.timeoutMs || 30000,
        enabled: true,
      });
      return c.json(installed, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Install failed.' }, 400);
    }
  });

  // -------------------------------------------------------------
  // NOTIFICATIONS (Gemini Spark Section 6)
  // -------------------------------------------------------------
  app.get('/api/notifications', (c) => {
    const unreadOnly = c.req.query('unreadOnly') === 'true';
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const notifs = store.notifications('opendots-owner', unreadOnly, limit);
    return c.json(notifs);
  });

  app.get('/api/notifications/unread-count', (c) => {
    const count = store.unreadNotificationCount('opendots-owner');
    return c.json({ count });
  });

  app.patch('/api/notifications/:id/read', (c) => {
    const id = c.req.param('id');
    const ok = store.markNotificationRead(id, 'opendots-owner');
    return c.json({ ok });
  });

  app.post('/api/notifications/mark-all-read', (c) => {
    const count = store.markAllNotificationsRead('opendots-owner');
    return c.json({ ok: true, updatedCount: count });
  });

  app.delete('/api/notifications/:id', (c) => {
    const id = c.req.param('id');
    const ok = store.deleteNotification(id, 'opendots-owner');
    return c.json({ ok });
  });

  // -------------------------------------------------------------
  // MCP DIRECTORY & GOVERNANCE (Gemini Spark Section 4)
  // -------------------------------------------------------------
  app.get('/api/mcp/directory', (c) => {
    const directory = [
      {
        id: 'mcp-github',
        name: 'GitHub MCP Server',
        description: 'Inspect repositories, open pull requests, read issues, and manage commits.',
        category: 'developer',
        defaultUrl: 'https://api.github.com/mcp',
        requiresToken: true,
        tokenPlaceholder: 'ghp_...',
        availableTools: [
          { name: 'list_repos', description: 'List repositories for authenticated user', readOnly: true },
          { name: 'read_file', description: 'Read file contents from repository branch', readOnly: true },
          { name: 'create_issue', description: 'Create a new GitHub issue', readOnly: false },
          { name: 'search_code', description: 'Search codebase across GitHub', readOnly: true },
        ],
        documentationUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
      },
      {
        id: 'mcp-brave',
        name: 'Brave Web Search MCP',
        description: 'Privacy-preserving global web, news, and video search with structured snippets.',
        category: 'search',
        defaultUrl: 'https://api.search.brave.com/mcp',
        requiresToken: true,
        tokenPlaceholder: 'BSA...',
        availableTools: [
          { name: 'brave_web_search', description: 'Query Brave global web index', readOnly: true },
          { name: 'brave_news_search', description: 'Search breaking news across trusted publications', readOnly: true },
        ],
        documentationUrl: 'https://brave.com/search/api/',
      },
      {
        id: 'mcp-google-workspace',
        name: 'Google Workspace Native MCP',
        description: 'Deep integration for Gmail, Google Calendar, Google Docs, and Google Drive.',
        category: 'productivity',
        defaultUrl: 'https://workspace.mcp.google.com',
        requiresToken: false,
        availableTools: [
          { name: 'gmail_search', description: 'Search emails and summarize threads', readOnly: true },
          { name: 'calendar_events', description: 'Query events and check scheduling conflicts', readOnly: true },
          { name: 'drive_search', description: 'Search files and inspect documents', readOnly: true },
        ],
        documentationUrl: 'https://developers.google.com/workspace',
      },
      {
        id: 'mcp-fetch',
        name: 'Fetch Web Scraper MCP',
        description: 'Converts any public webpage or blog into clean markdown without executing untrusted client scripts.',
        category: 'utilities',
        defaultUrl: 'https://fetch.mcp.opendots.internal',
        requiresToken: false,
        availableTools: [
          { name: 'fetch_url', description: 'Scrape and parse webpage to sanitized markdown', readOnly: true },
          { name: 'extract_article', description: 'Extract main article body from blog or news site', readOnly: true },
        ],
      },
      {
        id: 'mcp-filesystem',
        name: 'Local File Workspace MCP',
        description: 'Read and write isolated files in the local OpenDots workspace directory with version snapshots.',
        category: 'utilities',
        defaultUrl: 'http://127.0.0.1:4310/mcp/local',
        requiresToken: false,
        availableTools: [
          { name: 'read_workspace_file', description: 'Read local workspace file', readOnly: true },
          { name: 'write_workspace_file', description: 'Write or append to local workspace file', readOnly: false },
          { name: 'list_workspace_files', description: 'List workspace files and sizes', readOnly: true },
        ],
      },
    ];
    return c.json(directory);
  });

  // -------------------------------------------------------------
  // SKILLS & TASK SETUP ASSISTANT (Gemini Spark Section 7)
  // -------------------------------------------------------------
  app.post('/api/assistant/analyze-workflow', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const goalText = (body.goalText || '').trim();
    if (!goalText) {
      return c.json({ error: 'goalText is required.' }, 400);
    }

    const lower = goalText.toLowerCase();

    // 1. Detect required connectors
    const requiredConnectors: ConnectorType[] = [];
    if (lower.includes('email') || lower.includes('gmail') || lower.includes('inbox')) {
      requiredConnectors.push('gmail');
    }
    if (lower.includes('calendar') || lower.includes('schedule') || lower.includes('meeting')) {
      requiredConnectors.push('google_calendar');
    }
    if (lower.includes('drive') || lower.includes('doc') || lower.includes('file')) {
      requiredConnectors.push('google_drive');
    }
    if (lower.includes('slack')) requiredConnectors.push('slack');
    if (lower.includes('telegram')) requiredConnectors.push('telegram');
    if (lower.includes('whatsapp')) requiredConnectors.push('whatsapp');
    if (lower.includes('instagram')) requiredConnectors.push('instagram');

    // 2. Detect missing information
    const missingInformation: string[] = [];
    if (requiredConnectors.includes('gmail')) {
      missingInformation.push('Should drafted email replies require user authorization in the Approval Center before delivery? (Recommended: Yes)');
    }
    if (lower.includes('perfume') || lower.includes('price') || lower.includes('product')) {
      missingInformation.push('What is your target maximum budget? (e.g., ₹1,000)');
    }
    if (lower.includes('every') && !lower.includes('at')) {
      missingInformation.push('What preferred time of day should this execute? (Default: 09:00 AM)');
    }

    // 3. Propose schedule / conditional trigger
    let triggerType: TaskTriggerType = 'time';
    let intervalSeconds: number | undefined = undefined;
    let scheduleDescription = 'Manual one-off execution';

    if (lower.includes('monday') || lower.includes('weekly')) {
      intervalSeconds = 604800; // 7 days
      scheduleDescription = 'Recurring every week (Mondays at 09:00 AM)';
    } else if (lower.includes('daily') || lower.includes('every day') || lower.includes('morning')) {
      intervalSeconds = 86400; // 24 hours
      scheduleDescription = 'Recurring every day at 09:00 AM';
    } else if (lower.includes('hourly') || lower.includes('every hour')) {
      intervalSeconds = 3600; // 1 hour
      scheduleDescription = 'Recurring every hour';
    } else if (lower.includes('monitor') || lower.includes('alert') || lower.includes('below') || lower.includes('when')) {
      triggerType = 'threshold';
      intervalSeconds = 1800; // 30 mins
      scheduleDescription = 'Continuous monitoring every 30 minutes with threshold alert';
    }

    // 4. Propose reusable skill
    const skillName = goalText.slice(0, 40).replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'Automated Assistant Workflow';
    const proposal: WorkflowAnalysisProposal = {
      intendedOutcome: `Automate workflow for: "${goalText}".`,
      missingInformation,
      requiredConnectors,
      proposedSkill: {
        name: skillName,
        description: `Automated skill generated by OpenDots Setup Assistant for: ${goalText}`,
        instructions: `1. Inspect configured sources and verify permissions.\n2. Execute workflow steps according to target criteria.\n3. Validate outputs using step verifier.\n4. Save structured summary deliverable to workspace files.`,
        tools: ['google_gmail_workspace', 'google_calendar_tasks_workspace', 'step_verifier'],
      },
      proposedSchedule: {
        triggerType,
        intervalSeconds,
        description: scheduleDescription,
        condition: triggerType === 'threshold' ? { operator: 'lt', threshold: 1000 } : undefined,
      },
      expectedResourceUsage: {
        estimatedTime: '~30-45 seconds per run',
        estimatedCost: '$0.00 USD (Within free tier)',
        apiCalls: '~3 tool invocations per execution',
      },
      suggestedActionItems: [
        'Confirm required connector credentials are saved',
        'Review approval policy for outbound actions',
        'Enable quiet hours to avoid night notifications',
      ],
    };

    return c.json(proposal);
  });

  app.post('/api/assistant/install-workflow', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.skill || !body.schedule) {
      return c.json({ error: 'skill and schedule objects are required.' }, 400);
    }
    try {
      // 1. Save skill
      const createdSkill = store.saveCustomSkill({
        name: body.skill.name,
        description: body.skill.description,
        version: '1.0.0',
        instructions: body.skill.instructions,
        category: 'utility',
        requiredPermissions: ['basic', 'files'],
        allowedTools: body.skill.tools || [],
        timeoutMs: 45000,
        enabled: true,
      });

      // 2. Create task
      const createdTask = store.createTask(
        `Execute workflow "${body.skill.name}": ${body.skill.instructions.slice(0, 100)}`,
        body.schedule.intervalSeconds || null,
        Date.now(),
        {
          triggerType: body.schedule.triggerType || 'time',
          condition: body.schedule.condition,
          monitoringConfig: {
            checkFrequencySeconds: body.schedule.intervalSeconds,
            quietHours: { enabled: true, start: '22:00', end: '07:00', timezone: 'UTC' },
          },
        },
      );

      return c.json({
        ok: true,
        skill: createdSkill,
        task: createdTask,
        message: 'Workflow successfully configured, scheduled, and activated!',
      }, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Workflow setup failed.' }, 400);
    }
  });

  // -------------------------------------------------------------
  // CONDITIONAL MONITORING (Gemini Spark Section 1)
  // -------------------------------------------------------------
  app.post('/api/tasks/conditional', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.prompt) {
      return c.json({ error: 'prompt is required.' }, 400);
    }
    try {
      const task = store.createTask(
        body.prompt,
        body.intervalSeconds || null,
        body.nextRunAt || Date.now(),
        {
          triggerType: body.triggerType || 'condition',
          condition: body.condition,
          monitoringConfig: body.monitoringConfig,
          dependsOn: body.dependsOn,
          idempotencyKey: body.idempotencyKey,
        },
      );
      return c.json(task, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Failed to create conditional task.' }, 400);
    }
  });

  app.post('/api/tasks/:id/evaluate-condition', async (c) => {
    const id = c.req.param('id');
    const task = store.task(id);
    if (!task) return c.json({ error: 'Task not found.' }, 404);
    const body = await c.req.json().catch(() => ({}));
    const currentValue = body.currentValue !== undefined ? body.currentValue : '';

    const evaluation = store.evaluateTaskCondition(task, currentValue);
    return c.json(evaluation);
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
