import { z } from 'zod';
import type { OpenDotsToolDefinition } from '../types.js';

export const calculatorTool: OpenDotsToolDefinition<
  { expression: string },
  { result: number; expression: string }
> = {
  name: 'calculate',
  description:
    'Safely evaluate arithmetic and mathematical expressions (e.g. "125 * 8 - 45", "Math.sqrt(256) * 10") without arbitrary code execution.',
  parameters: z.object({
    expression: z
      .string()
      .min(1)
      .max(200)
      .describe('The arithmetic expression to evaluate.'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 5000,
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
