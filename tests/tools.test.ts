import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ToolRegistry,
  executeSafeTool,
  truncateOutput,
  redactObject,
  calculatorTool,
  textAnalyzerTool,
  webReaderTool,
  type OpenDotsToolDefinition,
} from '../src/server/tools/index.js';

describe('Unified Tool-Calling Framework (Phase 4)', () => {
  it('registers and retrieves tool definitions', () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);

    expect(registry.has('calculate')).toBe(true);
    expect(registry.get('calculate')?.name).toBe('calculate');
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0].name).toBe('calculate');
  });

  it('rejects duplicate tool registration', () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);
    expect(() => registry.register(calculatorTool)).toThrow(/already registered/);
  });

  it('enforces input schema validation', async () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);

    // Missing required expression
    const result = await registry.execute('calculate', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Input validation failed');
  });

  it('enforces backend authorization and permissions', async () => {
    const registry = new ToolRegistry();
    const adminTool: OpenDotsToolDefinition = {
      name: 'restricted_admin_tool',
      description: 'Dangerous action',
      parameters: z.object({ target: z.string() }),
      requiredPermission: 'admin',
      execute: async () => ({ status: 'executed' }),
    };
    registry.register(adminTool);

    // Call without admin permission
    const denied = await registry.execute(
      'restricted_admin_tool',
      { target: 'all' },
      { userPermissions: ['basic', 'research'] },
    );
    expect(denied.success).toBe(false);
    expect(denied.error).toContain('Permission denied');

    // Call with admin permission
    const allowed = await registry.execute(
      'restricted_admin_tool',
      { target: 'all' },
      { userPermissions: ['admin'] },
    );
    expect(allowed.success).toBe(true);
    expect(allowed.data).toEqual({ status: 'executed' });
  });

  it('enforces tool execution timeouts', async () => {
    const hangingTool: OpenDotsToolDefinition = {
      name: 'slow_tool',
      description: 'Simulates slow external API',
      parameters: z.object({}),
      timeoutMs: 100,
      execute: async (_, ctx) => {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => resolve('done'), 1000);
          ctx.signal?.addEventListener('abort', () => {
            clearTimeout(timeout);
            reject(new Error('Aborted by signal'));
          });
        });
      },
    };

    const result = await executeSafeTool(hangingTool, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/timed out/i);
  });

  it('truncates outputs that exceed maximum size limits', () => {
    const giantString = 'A'.repeat(500);
    const truncated = truncateOutput(giantString, 100);

    expect(truncated.truncated).toBe(true);
    expect(typeof truncated.data).toBe('string');
    expect(truncated.data).toContain('[TRUNCATED: Output exceeded size limit]');
    expect((truncated.data as string).length).toBeLessThan(200);

    const normal = truncateOutput('Short message', 100);
    expect(normal.truncated).toBe(false);
    expect(normal.data).toBe('Short message');
  });

  it('redacts sensitive API keys and secrets from tool outputs', () => {
    const dirtyOutput = {
      apiKey: 'sk_' + 'live_1234567890abcdef12345678',
      message: 'Generated successfully with Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test.secret',
      nested: {
        token: 'AIzaSyA_abcdef1234567890abcdef123456',
      },
    };

    const clean = redactObject(dirtyOutput);
    expect(clean.apiKey).not.toContain('sk_live');
    expect(clean.apiKey).toContain('[REDACTED');
    expect(clean.message).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(clean.nested.token).not.toContain('AIzaSyA');
  });

  it('executes the built-in calculate tool safely', async () => {
    const res = await executeSafeTool(calculatorTool, {
      expression: '25 * 4 + Math.sqrt(100)',
    });
    expect(res.success).toBe(true);
    expect(res.data?.result).toBe(110);

    // Unsafe code injection blocked
    const unsafe = await executeSafeTool(calculatorTool, {
      expression: 'process.exit(1)',
    });
    expect(unsafe.success).toBe(false);
    expect(unsafe.error).toContain('Invalid or unsafe characters');
  });

  it('executes the built-in analyze_text tool correctly', async () => {
    const res = await executeSafeTool(textAnalyzerTool, {
      text: 'The quick brown fox jumps over the lazy dog. It was a sunny afternoon.',
    });
    expect(res.success).toBe(true);
    expect(res.data?.words).toBe(14);
    expect(res.data?.sentences).toBe(2);
    expect(res.data?.paragraphs).toBe(1);
    expect(res.data?.estimatedReadingTimeMinutes).toBeGreaterThan(0);
  });

  it('blocks webReaderTool from connecting to localhost or private IPs', async () => {
    const localAttempt = await executeSafeTool(
      webReaderTool,
      { url: 'http://localhost:8080/admin' },
      { userPermissions: ['research'] },
    );
    expect(localAttempt.success).toBe(false);
    expect(localAttempt.error).toContain('Security restriction: Access to internal/private host');

    const metadataAttempt = await executeSafeTool(
      webReaderTool,
      { url: 'http://169.254.169.254/latest/meta-data/' },
      { userPermissions: ['research'] },
    );
    expect(metadataAttempt.success).toBe(false);
    expect(metadataAttempt.error).toContain('Security restriction: Access to internal/private host');
  });

  it('converts authorized tools to CopilotKit ToolDefinition instances', () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);
    registry.register(webReaderTool);

    // User without 'research' permission only gets basic calculator
    const basicTools = registry.toCopilotKitTools(['basic']);
    expect(basicTools.map((t) => t.name)).toContain('calculate');
    expect(basicTools.map((t) => t.name)).not.toContain('read_web_page');

    // User with 'research' permission gets both
    const researchTools = registry.toCopilotKitTools(['basic', 'research']);
    expect(researchTools.map((t) => t.name)).toContain('calculate');
    expect(researchTools.map((t) => t.name)).toContain('read_web_page');
  });
});
