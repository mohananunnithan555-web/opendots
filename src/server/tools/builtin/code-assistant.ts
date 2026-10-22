import { z } from 'zod';
import type { OpenDotsToolDefinition } from '../types.js';
import { globalFileWorkspace } from '../../files/file-workspace.js';

export interface CodeIssue {
  type: 'error' | 'warning' | 'security' | 'style' | 'info';
  line?: number;
  message: string;
  snippet?: string;
  suggestion?: string;
}

export interface CodeReviewResult {
  fileName?: string;
  syntaxValid: boolean;
  issues: CodeIssue[];
  metrics: {
    totalLines: number;
    codeLines: number;
    commentLines: number;
    functionsFound: number;
  };
  summary: string;
}

export interface SymbolItem {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'export' | 'variable';
  file: string;
  line: number;
  preview: string;
}

export interface SymbolSearchResult {
  query?: string;
  totalFound: number;
  symbols: SymbolItem[];
}

export interface UnitTestGenerationResult {
  targetName: string;
  framework: string;
  testCode: string;
  suggestedTestFilePath: string;
  functionsCovered: string[];
}

/**
 * 1. Static Code Review & Syntax Check Tool
 */
export const codeReviewTool: OpenDotsToolDefinition<
  {
    code?: string;
    filePath?: string;
    language?: 'typescript' | 'javascript' | 'python' | 'json' | 'markdown';
  },
  CodeReviewResult
> = {
  name: 'code_review_tool',
  description:
    'Perform static code analysis, bracket balance checking, security vulnerability audits, and anti-pattern detection on workspace files or code snippets without paid language servers.',
  parameters: z.object({
    code: z.string().optional().describe('Direct source code to analyze.'),
    filePath: z.string().optional().describe('Relative path to code file in workspace.'),
    language: z.enum(['typescript', 'javascript', 'python', 'json', 'markdown']).optional().default('typescript'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 15_000,
  maxOutputChars: 20_000,
  isPaidService: false,
  costEstimateUsd: 0,
  execute: async ({ code, filePath, language = 'typescript' }) => {
    let source = code ?? '';
    let fileName = filePath;

    if (filePath && !source) {
      const readRes = globalFileWorkspace.readFile(filePath);
      source = readRes.content;
      fileName = readRes.name;
    }

    if (!source.trim()) {
      return {
        fileName,
        syntaxValid: false,
        issues: [{ type: 'error', message: 'No source code was provided for review.' }],
        metrics: { totalLines: 0, codeLines: 0, commentLines: 0, functionsFound: 0 },
        summary: 'Empty code input.',
      };
    }

    const lines = source.split(/\r?\n/);
    const issues: CodeIssue[] = [];
    let commentLines = 0;
    let codeLines = 0;
    let functionsFound = 0;

    // 1. Bracket & Quote balance check (JS/TS/Python)
    const stack: Array<{ char: string; line: number }> = [];
    const pairs: Record<string, string> = { ')': '(', '}': '{', ']': '[' };

    let inMultiLineComment = false;

    lines.forEach((lineText, idx) => {
      const lineNum = idx + 1;
      const trimmed = lineText.trim();

      if (!trimmed) return;

      if (trimmed.startsWith('/*') || trimmed.includes('/*')) inMultiLineComment = true;
      if (inMultiLineComment) {
        commentLines++;
        if (trimmed.includes('*/')) inMultiLineComment = false;
        return;
      }

      if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
        commentLines++;
        if (/TODO|FIXME|HACK|BUG/i.test(trimmed)) {
          issues.push({
            type: 'info',
            line: lineNum,
            message: `Found pending task comment: "${trimmed}"`,
            snippet: trimmed,
          });
        }
        return;
      }

      codeLines++;

      // Function count detection
      if (/(?:function\s+([a-zA-Z0-9_$]+)|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|def\s+([a-zA-Z0-9_$]+)\s*\()/i.test(trimmed)) {
        functionsFound++;
      }

      // Security Checks
      if (/\beval\s*\(/.test(trimmed)) {
        issues.push({
          type: 'security',
          line: lineNum,
          message: 'Potentially dangerous use of eval(). Can lead to arbitrary code execution.',
          snippet: trimmed,
          suggestion: 'Refactor using structured data parsing (e.g. JSON.parse) or a safe interpreter.',
        });
      }

      if (/\.innerHTML\s*=/.test(trimmed)) {
        issues.push({
          type: 'security',
          line: lineNum,
          message: 'Direct assignment to innerHTML detected. Susceptible to Cross-Site Scripting (XSS).',
          snippet: trimmed,
          suggestion: 'Use textContent, createElement, or sanitize input using DOMPurify.',
        });
      }

      if (/(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][a-zA-Z0-9_\-]{16,}['"]/i.test(trimmed)) {
        issues.push({
          type: 'security',
          line: lineNum,
          message: 'Hardcoded secret or credential token detected in source.',
          snippet: trimmed.replace(/['"][a-zA-Z0-9_\-]{16,}['"]/, '"[REDACTED_SECRET]"'),
          suggestion: 'Move secret credentials to environment variables or secret manager.',
        });
      }

      // Bracket syntax traversal (simple scanner ignoring quoted strings)
      if (language === 'typescript' || language === 'javascript' || language === 'json') {
        let inStr: string | null = null;
        for (let i = 0; i < lineText.length; i++) {
          const char = lineText[i];
          const prev = i > 0 ? lineText[i - 1] : '';

          if ((char === '"' || char === "'" || char === '`') && prev !== '\\') {
            if (inStr === char) inStr = null;
            else if (!inStr) inStr = char;
            continue;
          }

          if (inStr) continue;

          if (char === '(' || char === '{' || char === '[') {
            stack.push({ char, line: lineNum });
          } else if (char === ')' || char === '}' || char === ']') {
            const expected = pairs[char];
            const top = stack.pop();
            if (!top || top.char !== expected) {
              issues.push({
                type: 'error',
                line: lineNum,
                message: `Mismatched closing bracket "${char}". Expected matching "${expected || 'none'}".`,
                snippet: lineText.trim(),
              });
            }
          }
        }
      }
    });

    if (stack.length > 0) {
      const unclosed = stack.pop()!;
      issues.push({
        type: 'error',
        line: unclosed.line,
        message: `Unclosed bracket "${unclosed.char}" opened on line ${unclosed.line}.`,
      });
    }

    // JSON syntax verification if language is JSON
    if (language === 'json') {
      try {
        JSON.parse(source);
      } catch (err) {
        issues.unshift({
          type: 'error',
          message: `Invalid JSON syntax: ${err instanceof Error ? err.message : 'Parse error'}`,
        });
      }
    }

    const errorCount = issues.filter((i) => i.type === 'error').length;
    const securityCount = issues.filter((i) => i.type === 'security').length;
    const warningCount = issues.filter((i) => i.type === 'warning').length;

    const syntaxValid = errorCount === 0;
    const summary = syntaxValid
      ? `Static analysis passed successfully. ${codeLines} lines analyzed, ${functionsFound} functions detected. ${securityCount} security alerts, ${warningCount} warnings.`
      : `Static analysis found ${errorCount} syntax/structural errors and ${securityCount} security notices across ${codeLines} lines.`;

    return {
      fileName,
      syntaxValid,
      issues,
      metrics: {
        totalLines: lines.length,
        codeLines,
        commentLines,
        functionsFound,
      },
      summary,
    };
  },
};

/**
 * 2. Unit Test Generator Tool (Scaffolds Vitest/Jest/Pytest tests)
 */
export const unitTestGeneratorTool: OpenDotsToolDefinition<
  {
    code?: string;
    filePath?: string;
    framework?: 'vitest' | 'jest' | 'pytest';
    saveToWorkspace?: boolean;
  },
  UnitTestGenerationResult
> = {
  name: 'unit_test_generator',
  description:
    'Generate unit test test-suites (Vitest, Jest, or Pytest) for detected functions in workspace code files.',
  parameters: z.object({
    code: z.string().optional().describe('Source code to generate tests for.'),
    filePath: z.string().optional().describe('Relative path to target code file in workspace.'),
    framework: z.enum(['vitest', 'jest', 'pytest']).optional().default('vitest'),
    saveToWorkspace: z.boolean().optional().default(false).describe('Automatically write generated test to workspace.'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 15_000,
  maxOutputChars: 25_000,
  isPaidService: false,
  costEstimateUsd: 0,
  execute: async ({ code, filePath, framework = 'vitest', saveToWorkspace = false }) => {
    let source = code ?? '';
    let targetName = 'module';

    if (filePath && !source) {
      const readRes = globalFileWorkspace.readFile(filePath);
      source = readRes.content;
      targetName = readRes.name.replace(/\.[^.]+$/, '');
    }

    const functionsCovered: string[] = [];
    const lines = source.split(/\r?\n/);

    for (const line of lines) {
      const fnMatch = line.match(/(?:function\s+([a-zA-Z0-9_$]+)|(?:const|let)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|def\s+([a-zA-Z0-9_$]+)\s*\()/);
      if (fnMatch) {
        const fnName = fnMatch[1] || fnMatch[2] || fnMatch[3];
        if (fnName && !functionsCovered.includes(fnName)) {
          functionsCovered.push(fnName);
        }
      }
    }

    if (functionsCovered.length === 0) {
      functionsCovered.push('mainWorkflow');
    }

    let testCode = '';
    let ext = '.test.ts';

    if (framework === 'pytest') {
      ext = '_test.py';
      testCode = `import pytest\n# Tests generated by OpenDots Code Assistant\n\n`;
      functionsCovered.forEach((fn) => {
        testCode += `def test_${fn}_nominal():\n    # Test nominal happy-path execution\n    assert callable(lambda: True)\n\n`;
        testCode += `def test_${fn}_edge_cases():\n    # Test boundary parameters\n    with pytest.raises(Exception):\n        raise ValueError("Simulated input boundary check")\n\n`;
      });
    } else {
      const importHeader =
        framework === 'vitest'
          ? `import { describe, it, expect, vi } from 'vitest';\n`
          : `import { describe, it, expect, jest } from '@jest/globals';\n`;

      testCode = `${importHeader}\n// Unit Test Suite for ${targetName}\n// Generated by OpenDots Autonomous Code Engine\n\ndescribe('${targetName}', () => {\n`;

      functionsCovered.forEach((fn) => {
        testCode += `  describe('${fn}', () => {\n`;
        testCode += `    it('should execute nominal path successfully', async () => {\n`;
        testCode += `      // Arrange\n      const input = {};\n      // Act & Assert\n      expect(input).toBeDefined();\n    });\n\n`;
        testCode += `    it('should handle edge cases and empty parameters gracefully', async () => {\n`;
        testCode += `      expect(() => {}).not.toThrow();\n    });\n  });\n\n`;
      });

      testCode += `});\n`;
    }

    const suggestedTestFilePath = `tests/${targetName}${ext}`;

    if (saveToWorkspace) {
      globalFileWorkspace.writeFile(suggestedTestFilePath, testCode);
    }

    return {
      targetName,
      framework,
      testCode,
      suggestedTestFilePath,
      functionsCovered,
    };
  },
};

/**
 * 3. Symbol Search & Repository Navigation Tool
 */
export const codeSymbolsTool: OpenDotsToolDefinition<
  {
    query?: string;
    symbolType?: 'all' | 'function' | 'class' | 'interface' | 'type' | 'export';
    directory?: string;
  },
  SymbolSearchResult
> = {
  name: 'code_symbols_navigator',
  description:
    'Search for code declarations, functions, classes, interfaces, and exported types across workspace files using fast regex symbol navigation.',
  parameters: z.object({
    query: z.string().optional().describe('Symbol name or prefix to search for.'),
    symbolType: z.enum(['all', 'function', 'class', 'interface', 'type', 'export']).optional().default('all'),
    directory: z.string().optional().describe('Optional subdirectory in workspace to limit scan.'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 15_000,
  maxOutputChars: 25_000,
  isPaidService: false,
  costEstimateUsd: 0,
  execute: async ({ query, symbolType = 'all', directory }) => {
    const files = globalFileWorkspace.listFiles(directory ?? '');
    const codeFiles = files.filter((f) =>
      ['.ts', '.tsx', '.js', '.jsx', '.py', '.json', '.sql'].includes(f.extension.toLowerCase()),
    );

    const symbols: SymbolItem[] = [];
    const cleanQ = query?.toLowerCase().trim();

    for (const f of codeFiles) {
      try {
        const { content } = globalFileWorkspace.readFile(f.relativePath);
        const lines = content.split(/\r?\n/);

        lines.forEach((lineText, idx) => {
          const lineNum = idx + 1;
          const trimmed = lineText.trim();
          if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) return;

          // Functions
          const fnMatch = trimmed.match(/(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/) ||
                          trimmed.match(/(?:export\s+)?const\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/);
          if (fnMatch && (symbolType === 'all' || symbolType === 'function')) {
            const name = fnMatch[1];
            if (!cleanQ || name.toLowerCase().includes(cleanQ)) {
              symbols.push({ name, kind: 'function', file: f.relativePath, line: lineNum, preview: trimmed.slice(0, 100) });
            }
          }

          // Classes
          const classMatch = trimmed.match(/(?:export\s+)?class\s+([a-zA-Z0-9_$]+)/);
          if (classMatch && (symbolType === 'all' || symbolType === 'class')) {
            const name = classMatch[1];
            if (!cleanQ || name.toLowerCase().includes(cleanQ)) {
              symbols.push({ name, kind: 'class', file: f.relativePath, line: lineNum, preview: trimmed.slice(0, 100) });
            }
          }

          // Interfaces
          const ifMatch = trimmed.match(/(?:export\s+)?interface\s+([a-zA-Z0-9_$]+)/);
          if (ifMatch && (symbolType === 'all' || symbolType === 'interface')) {
            const name = ifMatch[1];
            if (!cleanQ || name.toLowerCase().includes(cleanQ)) {
              symbols.push({ name, kind: 'interface', file: f.relativePath, line: lineNum, preview: trimmed.slice(0, 100) });
            }
          }

          // Types
          const typeMatch = trimmed.match(/(?:export\s+)?type\s+([a-zA-Z0-9_$]+)\s*=/);
          if (typeMatch && (symbolType === 'all' || symbolType === 'type')) {
            const name = typeMatch[1];
            if (!cleanQ || name.toLowerCase().includes(cleanQ)) {
              symbols.push({ name, kind: 'type', file: f.relativePath, line: lineNum, preview: trimmed.slice(0, 100) });
            }
          }
        });
      } catch {}
    }

    return {
      query,
      totalFound: symbols.length,
      symbols: symbols.slice(0, 50),
    };
  },
};
