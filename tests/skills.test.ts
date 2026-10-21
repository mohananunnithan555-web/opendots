import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  SkillRegistry,
  redactSecrets,
  type SkillDefinition,
} from '../src/server/skills/index.js';
import { mathEvalSkill } from '../src/server/skills/builtin/math-eval.js';
import { textStatsSkill } from '../src/server/skills/builtin/text-stats.js';

describe('Modular Skill System (Phase 2)', () => {
  it('registers and retrieves a skill definition', () => {
    const registry = new SkillRegistry();
    registry.register(mathEvalSkill);

    expect(registry.has('math-eval')).toBe(true);
    expect(registry.get('math-eval')?.metadata.name).toBe('Mathematical Calculator');
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0].id).toBe('math-eval');
  });

  it('rejects duplicate skill registration', () => {
    const registry = new SkillRegistry();
    registry.register(mathEvalSkill);
    expect(() => registry.register(mathEvalSkill)).toThrow(/already registered/);
  });

  it('enforces input validation using Zod schemas', async () => {
    const registry = new SkillRegistry();
    registry.register(mathEvalSkill);

    // Invalid input: empty expression
    const result = await registry.execute('math-eval', { expression: '' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Input validation failed');
  });

  it('enforces required permissions', async () => {
    const registry = new SkillRegistry();
    const adminSkill: SkillDefinition<any, any> = {
      metadata: {
        id: 'admin-action',
        name: 'Admin Only Action',
        description: 'Requires admin permission',
        version: '1.0.0',
        category: 'utility',
        requiredPermissions: ['admin'],
      },
      inputSchema: z.object({ value: z.string() }),
      outputSchema: z.object({ ok: z.boolean() }),
      execute: async () => ({ ok: true }),
    };
    registry.register(adminSkill);

    // User only has 'basic' permission
    const denied = await registry.execute('admin-action', { value: 'test' }, {
      userPermissions: ['basic'],
    });
    expect(denied.success).toBe(false);
    expect(denied.error).toContain('Permission denied');

    // User has 'admin' permission
    const allowed = await registry.execute('admin-action', { value: 'test' }, {
      userPermissions: ['admin'],
    });
    expect(allowed.success).toBe(true);
  });

  it('enforces execution timeouts', async () => {
    const registry = new SkillRegistry();
    const slowSkill: SkillDefinition<{ delay: number }, { done: boolean }> = {
      metadata: {
        id: 'slow-task',
        name: 'Slow Task',
        description: 'Times out',
        version: '1.0.0',
        category: 'utility',
        requiredPermissions: ['basic'],
      },
      inputSchema: z.object({ delay: z.number() }),
      outputSchema: z.object({ done: z.boolean() }),
      timeoutMs: 80, // Very short timeout for testing
      execute: async ({ delay }) => {
        await new Promise((r) => setTimeout(r, delay));
        return { done: true };
      },
    };
    registry.register(slowSkill);

    const result = await registry.execute('slow-task', { delay: 250 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  });

  it('redacts secrets from execution logs', () => {
    const rawLog = 'Calling API with Bearer eyJhbGciOiJIUzI1NiIsIn and ' + 'sk_live_' + '1234567890abcdef and ' + 'AIzaSy' + 'ABC1234567890DEF';
    const cleanLog = redactSecrets(rawLog);

    expect(cleanLog).not.toContain('sk_' + 'live_1234567890abcdef');
    expect(cleanLog).not.toContain('eyJhbGciOiJIUzI1NiIsIn');
    expect(cleanLog).toContain('[REDACTED');
  });

  it('allows disabling and enabling skills per Dot or globally', () => {
    const registry = new SkillRegistry();
    registry.register(mathEvalSkill);

    expect(registry.isEnabled('math-eval')).toBe(true);
    expect(registry.isEnabled('math-eval', 'dot-1')).toBe(true);

    // Disable for dot-1 only
    registry.disable('math-eval', 'dot-1');
    expect(registry.isEnabled('math-eval', 'dot-1')).toBe(false);
    expect(registry.isEnabled('math-eval', 'dot-2')).toBe(true);
    expect(registry.isEnabled('math-eval')).toBe(true);

    // Re-enable for dot-1
    registry.enable('math-eval', 'dot-1');
    expect(registry.isEnabled('math-eval', 'dot-1')).toBe(true);

    // Global disable
    registry.disable('math-eval');
    expect(registry.isEnabled('math-eval', 'dot-1')).toBe(false);
    expect(registry.isEnabled('math-eval', 'dot-2')).toBe(false);
  });

  it('executes the mathematical calculator built-in skill safely', async () => {
    const registry = new SkillRegistry();
    registry.register(mathEvalSkill);

    const res1 = await registry.execute('math-eval', { expression: '12 * 8 + 4' });
    expect(res1.success).toBe(true);
    expect(res1.data?.result).toBe(100);

    const res2 = await registry.execute('math-eval', { expression: 'Math.sqrt(144) + 8' });
    expect(res2.success).toBe(true);
    expect(res2.data?.result).toBe(20);

    // Rejects unsafe javascript execution attempts
    const unsafe = await registry.execute('math-eval', {
      expression: 'process.exit(1)',
    });
    expect(unsafe.success).toBe(false);
    expect(unsafe.error).toContain('Invalid or unsafe characters');
  });

  it('executes the text analyzer built-in skill correctly', async () => {
    const registry = new SkillRegistry();
    registry.register(textStatsSkill);

    const text = 'Hello world! This is a test sentence. OpenDots is an AI agent.';
    const result = await registry.execute('text-stats', { text });

    expect(result.success).toBe(true);
    expect(result.data?.words).toBe(12);
    expect(result.data?.sentences).toBe(3);
    expect(result.data?.characters).toBeGreaterThan(30);
  });

  it('converts enabled skills to CopilotKit ToolDefinition instances', () => {
    const registry = new SkillRegistry();
    registry.register(mathEvalSkill);
    registry.register(textStatsSkill);

    const tools = registry.toCopilotKitTools('dot-test', ['basic']);
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name)).toContain('skill_math_eval');
    expect(tools.map((t) => t.name)).toContain('skill_text_stats');
  });
});
