import { z } from 'zod';
import vm from 'node:vm';
import type { OpenDotsToolDefinition } from '../types.js';

export interface CodeSandboxOutput {
  language: string;
  result: unknown;
  logs: string[];
  executionTimeMs: number;
  syntaxValid: boolean;
  cost: string;
}

/**
 * Isolated Free JavaScript & Math Code Sandbox (Zero Paid Compute)
 */
export const codeSandboxTool: OpenDotsToolDefinition<
  {
    code: string;
    language?: 'javascript' | 'math' | 'json';
  },
  CodeSandboxOutput
> = {
  name: 'code_sandbox_runner',
  description:
    'Safely execute isolated JavaScript calculations, mathematical evaluations, data filtering, and JSON transformations in a local sandbox without paid cloud runners.',
  parameters: z.object({
    code: z.string().describe('JavaScript code expression or block to evaluate.'),
    language: z.enum(['javascript', 'math', 'json']).default('javascript').describe('Execution mode.'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 5_000,
  maxOutputChars: 15_000,
  isPaidService: false,
  costEstimateUsd: 0,
  execute: async ({ code, language = 'javascript' }) => {
    const start = Date.now();
    const logs: string[] = [];

    if (language === 'json') {
      try {
        const parsed = JSON.parse(code);
        return {
          language,
          result: parsed,
          logs: ['JSON parsed successfully'],
          executionTimeMs: Date.now() - start,
          syntaxValid: true,
          cost: '₹0.00 / Free Local Execution',
        };
      } catch (err) {
        throw new Error(`JSON syntax error: ${err instanceof Error ? err.message : 'Invalid JSON'}`);
      }
    }

    // Build ultra-secure restricted context
    const sandboxContext = Object.create(null);
    sandboxContext.Math = Math;
    sandboxContext.JSON = JSON;
    sandboxContext.Date = Date;
    sandboxContext.Array = Array;
    sandboxContext.Object = Object;
    sandboxContext.Number = Number;
    sandboxContext.String = String;
    sandboxContext.Boolean = Boolean;
    sandboxContext.RegExp = RegExp;
    sandboxContext.Map = Map;
    sandboxContext.Set = Set;
    sandboxContext.parseInt = parseInt;
    sandboxContext.parseFloat = parseFloat;
    sandboxContext.isNaN = isNaN;
    sandboxContext.isFinite = isFinite;

    sandboxContext.console = {
      log: (...args: unknown[]) => {
        logs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
      },
      warn: (...args: unknown[]) => {
        logs.push('[WARN] ' + args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
      },
      error: (...args: unknown[]) => {
        logs.push('[ERROR] ' + args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
      },
    };

    const vmContext = vm.createContext(sandboxContext);

    // Guard against harmful keywords before compilation
    if (/\b(?:process|require|import|global|__dirname|__filename|constructor\.constructor)\b/.test(code)) {
      throw new Error('Security policy violation: restricted keyword in sandbox code.');
    }

    try {
      const script = new vm.Script(`(() => {\n${code.includes('return ') ? code : 'return (' + code + ');'}\n})()`);
      const result = script.runInContext(vmContext, {
        timeout: 2000,
        displayErrors: true,
      });

      return {
        language,
        result: result !== undefined ? result : null,
        logs,
        executionTimeMs: Date.now() - start,
        syntaxValid: true,
        cost: '₹0.00 / Free Local Sandbox',
      };
    } catch (err) {
      throw new Error(`Sandbox execution error: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
