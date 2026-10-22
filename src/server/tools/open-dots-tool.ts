import { defineTool } from '@copilotkit/runtime/v2';
import { redactSecrets } from '../skills/skill-logger.js';
import type {
  OpenDotsToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from './types.js';

const DEFAULT_TOOL_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_CHARS = 30_000;

export function redactObject<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    return redactSecrets(obj) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      redacted[key] = redactObject(val);
    }
    return redacted as T;
  }
  return obj;
}

export function truncateOutput<T>(data: T, maxChars: number): { data: T; truncated: boolean } {
  if (data === null || data === undefined) return { data, truncated: false };

  if (typeof data === 'string') {
    if (data.length > maxChars) {
      return {
        data: (data.slice(0, maxChars) + '\n\n[TRUNCATED: Output exceeded size limit]') as unknown as T,
        truncated: true,
      };
    }
    return { data, truncated: false };
  }

  try {
    const serialized = JSON.stringify(data);
    if (serialized && serialized.length > maxChars) {
      const truncatedStr = serialized.slice(0, maxChars) + '... [TRUNCATED]';
      return {
        data: {
          _truncated: true,
          preview: truncatedStr,
          note: `Output of ${serialized.length} characters exceeded maximum limit of ${maxChars} characters.`,
        } as unknown as T,
        truncated: true,
      };
    }
  } catch {
    // If not serializable, return as is
  }

  return { data, truncated: false };
}

/**
 * Execute an OpenDots tool with unified security, validation, permission checks, timeouts, and redaction.
 */
export async function executeSafeTool<TInput, TOutput>(
  tool: OpenDotsToolDefinition<TInput, TOutput>,
  rawInput: unknown,
  ctx: ToolExecutionContext = {},
): Promise<ToolExecutionResult<TOutput>> {
  const startTime = Date.now();

  // 0. Free-Only Mode Cost Protection Check (₹0 strict policy)
  const isFreeOnlyActive = ctx.freeOnlyMode !== false;
  if (isFreeOnlyActive && (tool.isPaidService || (tool.costEstimateUsd && tool.costEstimateUsd > 0))) {
    return {
      success: false,
      error: `Execution blocked: Tool "${tool.name}" requires paid API credits or fees ($${tool.costEstimateUsd ?? 'paid'}). Free-Only Mode is active (strict ₹0 / $0 policy).`,
      executionTimeMs: 0,
    };
  }

  // 1. Permission Check
  if (tool.requiredPermission && tool.requiredPermission !== 'basic') {
    const permissions = ctx.userPermissions ?? ['basic'];
    if (!permissions.includes(tool.requiredPermission) && !permissions.includes('admin')) {
      return {
        success: false,
        error: `Permission denied: Tool "${tool.name}" requires "${tool.requiredPermission}" permission.`,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  // 2. Input Validation
  const parsed = tool.parameters.safeParse(rawInput);
  if (!parsed.success) {
    const issues = parsed.error.issues ?? [];
    const errorMsg = issues.length > 0
      ? `Input validation failed: ${issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`
      : `Input validation failed: ${parsed.error.message}`;
    return {
      success: false,
      error: redactSecrets(errorMsg),
      executionTimeMs: Date.now() - startTime,
    };
  }

  // 3. Timeout & Abort Handling
  const timeoutMs = tool.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Link external signal if present
  if (ctx.signal) {
    if (ctx.signal.aborted) {
      clearTimeout(timer);
      return {
        success: false,
        error: 'Execution cancelled before tool started.',
        executionTimeMs: 0,
      };
    }
    ctx.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const executionPromise = tool.execute(parsed.data, {
      ...ctx,
      signal: controller.signal,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener(
        'abort',
        () => reject(new Error(`Tool "${tool.name}" timed out after ${timeoutMs}ms.`)),
        { once: true },
      );
    });

    const rawResult = await Promise.race([executionPromise, timeoutPromise]);
    clearTimeout(timer);

    // 4. Output Truncation
    const maxChars = tool.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
    const { data: truncatedData, truncated } = truncateOutput(rawResult, maxChars);

    // 5. Secret Redaction
    const safeData = redactObject(truncatedData);

    return {
      success: true,
      data: safeData,
      truncated,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    clearTimeout(timer);
    const rawError = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: redactSecrets(rawError),
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Convert an OpenDotsToolDefinition to a CopilotKit ToolDefinition.
 */
export function toCopilotKitTool<TInput, TOutput>(
  tool: OpenDotsToolDefinition<TInput, TOutput>,
  ctxProvider?: () => ToolExecutionContext,
) {
  return defineTool({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    execute: async (rawInput: TInput) => {
      const ctx = ctxProvider ? ctxProvider() : {};
      return executeSafeTool(tool, rawInput, ctx);
    },
  });
}
