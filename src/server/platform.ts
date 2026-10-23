import { ComputerService } from './computer-service.js';
import { ConnectionService } from './connections.js';
import { PageService } from './page-service.js';
import { randomUUID } from 'node:crypto';
import {
  CopilotKitIntelligence,
  CopilotRuntime,
  createCopilotHonoHandler,
  type CopilotHonoApp,
} from '@copilotkit/runtime/v2';
import { createSlackChannel } from './slack-channel.js';
export { slackIdentity } from './slack-channel.js';
import { Store } from './store.js';
import { WorkspaceStore } from './workspace.js';
import { DotAgent } from './dot-agent.js';
import { runThreadTurn } from './headless.js';
import {
  INTELLIGENCE_KEY_MISSING_LABEL,
  setupStatus,
  type PlatformConfig,
} from './platform-config.js';
import { validateRuntimeScope } from './runtime-scope.js';
import { learningSelector } from './learning.js';
import { SetupTelemetry } from './setup-telemetry.js';
import { getSessionFromRequest } from './auth/auth-routes.js';
export class Platform {
  private channelStartupFailed = false;
  readonly setupTelemetry: SetupTelemetry;
  readonly pages: PageService;
  readonly computers: ComputerService;
  readonly connections: ConnectionService;
  readonly intelligence?: CopilotKitIntelligence;
  readonly handler?: CopilotHonoApp;
  constructor(
    readonly store: Store,
    readonly workspace: WorkspaceStore,
    readonly config: PlatformConfig,
  ) {
    this.setupTelemetry = new SetupTelemetry(store);
    this.computers = new ComputerService(
      workspace,
      config,
      () => store.settings().paused,
    );
    this.connections = new ConnectionService(workspace.connections);
    this.pages = new PageService(workspace, () => {
      this.requireReady();
      return this.intelligence!;
    });
    if (!config.intelligenceKey) return;
    this.intelligence = new CopilotKitIntelligence({
      apiKey: config.intelligenceKey,
      apiUrl: config.intelligenceApiUrl,
      wsUrl: config.intelligenceWsUrl,
      getLearningContainerId: learningSelector(
        workspace,
        config.slackDotId ?? workspace.dots()[0]?.id,
      ),
    });
    const channels = [];
    if (config.slackChannel && config.slackTeam && config.slackUsers.length) {
      const dotId = config.slackDotId ?? workspace.dots()[0].id;
      if (!workspace.dot(dotId))
        throw new Error('SLACK_DOT_ID does not identify an existing Dot.');
      const slack = createSlackChannel({
        name: config.slackChannel,
        config,
        ownerId: workspace.ownerId,
        paused: () => store.settings().paused,
        agent: () =>
          new DotAgent(
            store,
            workspace,
            config,
            dotId,
            true,
            this.setupTelemetry,
          ),
      });
      channels.push(slack);
    }
    const runtime = new CopilotRuntime({
      intelligence: this.intelligence,
      telemetryId: this.setupTelemetry.identity,
      telemetryProperties: this.setupTelemetry.metadata,
      identifyUser: async (request?: Request) => this.resolveUser(request),
      agents: async () =>
        Object.fromEntries(
          workspace
            .dots()
            .map((dot) => [
              dot.id,
              new DotAgent(
                store,
                workspace,
                config,
                dot.id,
                false,
                this.setupTelemetry,
              ),
            ]),
        ),
      channels,
      generateThreadNames: true,
    });
    this.handler = createCopilotHonoHandler({
      runtime,
      basePath: '/api/copilotkit',
      cors: { origin: [] },
    });
  }
  setup() {
    return setupStatus(
      this.config,
      this.handler?.channels?.status().overall ??
        (this.config.slackChannel ? 'setup_required' : 'not_configured'),
      this.channelStartupFailed,
    );
  }
  requireReady() {
    const missing = this.setup().missing;
    if (missing.length)
      throw new Error(
        `Setup required: ${missing.join(', ')}. Conversations require CopilotKit Intelligence.`,
      );
  }
  async start() {
    this.setupTelemetry.start();
    if (this.handler?.channels) {
      try {
        await this.handler.channels.ready({ timeoutMs: 15000 });
        this.channelStartupFailed = false;
      } catch (error) {
        this.channelStartupFailed = true;
        this.setupTelemetry.capture({
          kind: 'setup_failed',
          step: 'settings',
          error_class: 'channel_start_failed',
        });
        throw error;
      }
    }
  }
  async stop() {
    await this.setupTelemetry.stop();
    await this.handler?.channels?.stop();
  }
  async createConversation(dotId: string, title: string, userId?: string) {
    this.requireReady();
    if (!this.workspace.dot(dotId)) throw new Error('Dot not found.');
    const id = randomUUID();
    const owner = userId || this.workspace.ownerId;
    try {
      await this.intelligence!.createThread({
        threadId: id,
        userId: owner,
        agentId: dotId,
        name: title,
      });
    } catch {
      throw new Error(
        'Intelligence could not create this conversation. Check the runtime key and connection.',
      );
    }
    return this.workspace.bindThread(id, dotId, title, owner);
  }
  async history(threadId: string, userId?: string): Promise<string> {
    this.requireReady();
    const owner = userId || this.workspace.ownerId;
    this.workspace.requireThread(threadId, undefined, owner);
    const history = await this.intelligence!.getThreadMessages({
      threadId,
      userId: owner,
    });
    return history.messages
      .filter((message) => ['user', 'assistant'].includes(message.role))
      .slice(-12)
      .map(
        (message) =>
          `${message.role}: ${typeof message.content === 'string' ? message.content : ''}`,
      )
      .join('\n')
      .slice(-12000);
  }
  resolveUser(
    request?: Request,
    threadId?: string,
  ): { id: string; name: string } {
    if (request) {
      try {
        const session = getSessionFromRequest({
          req: {
            header: (name: string) => request.headers.get(name) ?? undefined,
          },
        });
        if (session?.userId && /^[\w.@:=-]+$/.test(session.userId)) {
          return {
            id: session.userId,
            name: session.name || session.email || 'OpenDots User',
          };
        }
      } catch {}
    }
    if (threadId) {
      try {
        const thread = this.workspace.findThread(threadId);
        if (thread?.ownerId && /^[\w.@:=-]+$/.test(thread.ownerId)) {
          return {
            id: thread.ownerId,
            name: 'OpenDots User',
          };
        }
      } catch {}
    }
    const safeOwnerId =
      this.workspace.ownerId && /^[\w.@:=-]+$/.test(this.workspace.ownerId)
        ? this.workspace.ownerId
        : 'opendots-owner';
    return {
      id: safeOwnerId,
      name: 'OpenDots owner',
    };
  }
  async handle(request: Request): Promise<Response> {
    if (!this.handler)
      return Response.json(
        { error: `Setup required: ${INTELLIGENCE_KEY_MISSING_LABEL}.` },
        { status: 503 },
      );
    let body: unknown;
    if (request.method !== 'GET' && request.method !== 'HEAD')
      body = await request
        .clone()
        .json()
        .catch(() => null);
    try {
      validateRuntimeScope(request, this.workspace, body);
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Conversation scope denied.',
        },
        { status: 403 },
      );
    }
    let finalRequest = request;
    const reqUrl = new URL(request.url);
    const agentParam = reqUrl.searchParams.get('agentId');
    const defaultDotId = this.workspace.dots()[0]?.id;
    if (agentParam?.startsWith('chat-')) {
      const threadId = agentParam.slice(5);
      const thread = this.workspace.ensureThread(threadId, defaultDotId);
      reqUrl.searchParams.set('agentId', thread.dotId);
      finalRequest = new Request(reqUrl.toString(), request);
    }
    const match = reqUrl.pathname.match(/\/(?:agents|agent)\/chat-([^/]+)(\/.*)?$/);
    if (match) {
      const threadId = match[1];
      const thread = this.workspace.ensureThread(threadId, defaultDotId);
      const prefix = match[0].includes('/agents/') ? '/agents/' : '/agent/';
      const suffix = match[2] || '';
      reqUrl.pathname = reqUrl.pathname.replace(match[0], `${prefix}${thread.dotId}${suffix}`);
      finalRequest = new Request(reqUrl.toString(), request);
    }

    const dataObj =
      body && typeof body === 'object'
        ? (body as Record<string, unknown>)
        : null;
    const targetThreadId =
      match?.[1] ||
      (agentParam?.startsWith('chat-') ? agentParam.slice(5) : undefined) ||
      (typeof dataObj?.threadId === 'string' ? dataObj.threadId : undefined) ||
      (typeof (dataObj?.input as any)?.threadId === 'string'
        ? (dataObj?.input as any).threadId
        : undefined) ||
      reqUrl.searchParams.get('threadId') ||
      reqUrl.pathname.match(/\/threads\/([^/]+)/)?.[1];

    const targetDot = targetThreadId
      ? this.workspace.findThread(targetThreadId) ||
        this.workspace.ensureThread(targetThreadId, defaultDotId)
      : undefined;
    const targetDotId = targetDot?.dotId || defaultDotId;

    if (this.intelligence && targetThreadId && targetDotId) {
      const user = this.resolveUser(request, targetThreadId);
      try {
        await this.intelligence.getOrCreateThread({
          threadId: targetThreadId,
          userId: user.id,
          agentId: targetDotId,
          name: targetDot?.title || 'OpenDots Conversation',
        });
      } catch (syncErr) {
        console.warn(
          '[Platform] CopilotKit getOrCreateThread pre-sync warning:',
          syncErr,
        );
      }
    }

    let response = await this.handler.fetch(finalRequest);

    const isConnect =
      reqUrl.pathname.endsWith('/connect') ||
      reqUrl.pathname.includes('/connect');
    if (
      isConnect &&
      response.status === 404 &&
      this.intelligence &&
      targetThreadId &&
      targetDotId
    ) {
      try {
        const errJson = await response.clone().json().catch(() => null);
        const errStr = JSON.stringify(errJson || '');
        if (
          errStr.includes('THREAD_NOT_FOUND') ||
          errStr.includes('Connect request rejected')
        ) {
          console.warn(
            '[Platform] THREAD_NOT_FOUND detected during connect. Auto-healing with createThread and retrying...',
          );
          const user = this.resolveUser(request, targetThreadId);
          await this.intelligence
            .createThread({
              threadId: targetThreadId,
              userId: user.id,
              agentId: targetDotId,
              name: targetDot?.title || 'OpenDots Conversation',
            })
            .catch((createErr) => {
              console.warn(
                '[Platform] Healing createThread fallback:',
                createErr,
              );
            });
          response = await this.handler.fetch(finalRequest);
        }
      } catch (retryErr) {
        console.warn('[Platform] Connect retry handler error:', retryErr);
      }

      if (response.status === 404) {
        console.warn(
          '[Platform] Connect still 404 after heal. Returning 204 to maintain conversational flow.',
        );
        return new Response(null, { status: 204 });
      }
    }

    return response;
  }
  async turn(
    threadId: string,
    prompt: string,
    signal: AbortSignal,
    metadata?: Record<string, unknown>,
  ): Promise<string> {
    this.requireReady();
    const thread = this.workspace.requireThread(threadId);
    return runThreadTurn(
      this.config.runtimeUrl,
      this.config.ownerToken
        ? { Authorization: `Bearer ${this.config.ownerToken}` }
        : {},
      thread.dotId,
      threadId,
      prompt,
      signal,
      metadata,
    );
  }
}
