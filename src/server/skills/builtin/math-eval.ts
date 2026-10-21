import { z } from 'zod';
import type { SkillDefinition } from '../types.js';

export const mathEvalSkill: SkillDefinition<
  { expression: string },
  { result: number; expression: string }
> = {
  metadata: {
    id: 'math-eval',
    name: 'Mathematical Calculator',
    description:
      'Safely evaluate arithmetic and mathematical expressions (addition, subtraction, multiplication, division, exponents, square roots, etc.) without arbitrary code execution.',
    version: '1.0.0',
    category: 'analysis',
    requiredPermissions: ['basic'],
    tags: ['math', 'calculator', 'arithmetic'],
    author: 'OpenDots Core',
  },
  inputSchema: z.object({
    expression: z
      .string()
      .min(1)
      .max(200)
      .describe('Mathematical expression to calculate, e.g. "25 * 4 + Math.sqrt(144)"'),
  }),
  outputSchema: z.object({
    result: z.number(),
    expression: z.string(),
  }),
  timeoutMs: 3000,
  execute: async ({ expression }) => {
    const cleanExpr = expression.trim();

    // Whitelist only safe mathematical characters and functions
    const stripped = cleanExpr
      .replace(
        /Math\.(sqrt|pow|abs|round|floor|ceil|min|max|sin|cos|tan|log|PI|E)/g,
        '',
      )
      .replace(/[\d\s+\-*/().,%^]/g, '');

    if (stripped.length > 0) {
      throw new Error(
        `Invalid or unsafe characters in mathematical expression: "${stripped}". Only numeric operations and Math constants are permitted.`,
      );
    }

    // Evaluate in safe isolated scope
    const sanitized = cleanExpr.replace(/\^/g, '**');
    const fn = new Function(`"use strict"; return (${sanitized});`);
    const val = fn();

    if (typeof val !== 'number' || Number.isNaN(val) || !Number.isFinite(val)) {
      throw new Error(`Expression "${expression}" did not evaluate to a finite number.`);
    }

    return {
      result: val,
      expression: cleanExpr,
    };
  },
};
