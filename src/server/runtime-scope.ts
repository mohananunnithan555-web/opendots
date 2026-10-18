import { WorkspaceStore } from './workspace.js';
export function validateRuntimeScope(
  request: Request,
  workspace: WorkspaceStore,
  body: unknown,
): void {
  const url = new URL(request.url);
  const prefix = '/api/copilotkit/';
  const deny = () => {
    throw new Error('This runtime route is not enabled in OpenDots.');
  };
  if (!url.pathname.startsWith(prefix)) return deny();
  const path = url.pathname.slice(prefix.length);
  const data =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const id = (value: string) => {
    const decoded = decodeURIComponent(value);
    if (!decoded || /[/\\\s]/.test(decoded)) return deny();
    return decoded;
  };
  let agentId: string | undefined;
  let threadId: string | undefined;
  let methods: string[];
  let match: RegExpMatchArray | null;
  // Match the whole path. The SDK accepts suffix matches, so accepting arbitrary
  // prefixes here would validate a different thread than the SDK dispatches.
  if (
    path === 'info' ||
    path === 'threads' ||
    path === 'threads/info' ||
    path === 'threads/inspector-metadata' ||
    path === 'threads/inspector-learning' ||
    path === 'inspector-metadata' ||
    path === 'inspector-learning' ||
    path === 'inspector/learning' ||
    path === 'memories' ||
    path === 'entitlements/runtime'
  )
    methods = ['GET', 'POST'];
  else if (path === 'threads/subscribe' || path === 'memories/subscribe')
    methods = ['POST'];
  else if ((match = path.match(/^agent\/([^/]+)\/(run|connect|suggest)$/))) {
    agentId = id(match[1]);
    threadId = typeof data.threadId === 'string' ? data.threadId : undefined;
    if (!threadId) return deny();
    methods = ['POST'];
  } else if ((match = path.match(/^agent\/([^/]+)\/stop\/([^/]+)$/))) {
    agentId = id(match[1]);
    threadId = id(match[2]);
    methods = ['POST'];
  } else if (
    (match = path.match(/^threads\/([^/]+)\/(messages|events|state|archive)$/))
  ) {
    threadId = id(match[1]);
    methods = match[2] === 'archive' ? ['POST'] : ['GET'];
  } else if ((match = path.match(/^threads\/([^/]+)$/))) {
    // Reserved suffixes resolve before threads/update inside the SDK router.
    if (
      [
        'clear',
        'transcribe',
        'cpk-debug-events',
        'annotate',
      ].includes(match[1])
    )
      return deny();
    threadId = id(match[1]);
    methods = ['PATCH', 'DELETE'];
  } else return deny();
  if (!methods.includes(request.method)) return deny();
  const bodyAgentRaw = typeof data.agentId === 'string' ? data.agentId : undefined;
  const queryAgentRaw = url.searchParams.get('agentId') ?? undefined;
  const sanitizeAgent = (val?: string) =>
    val && val !== 'undefined' && val !== 'null' ? val : undefined;
  const bodyAgent = sanitizeAgent(bodyAgentRaw);
  const queryAgent = sanitizeAgent(queryAgentRaw);
  const resolveDot = (val?: string) => {
    if (!val) return undefined;
    if (val.startsWith('chat-')) {
      const thread = workspace.conversations().find((t) => t.id === val.slice(5));
      if (thread) return workspace.dot(thread.dotId);
    }
    return (
      workspace.dot(val) ||
      workspace.dots().find((d) => d.name === val)
    );
  };
  for (const candidate of [agentId, bodyAgent, queryAgent]) {
    if (candidate && !resolveDot(candidate)) return deny();
  }
  const rawAgent = agentId ?? bodyAgent ?? queryAgent;
  const resolvedDot = resolveDot(rawAgent);
  agentId = resolvedDot?.id ?? rawAgent;
  for (const candidate of [
    threadId,
    typeof data.threadId === 'string' ? data.threadId : undefined,
    url.searchParams.get('threadId') ?? undefined,
  ]) {
    if (candidate) {
      if (threadId && candidate !== threadId) return deny();
      workspace.requireThread(candidate, agentId);
    }
  }
}
