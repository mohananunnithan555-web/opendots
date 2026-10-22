import { describe, it, expect } from 'vitest';
import { globalToolRegistry } from '../src/server/tools/tool-registry.js';
import { executeSafeTool } from '../src/server/tools/open-dots-tool.js';
import { codeSandboxTool } from '../src/server/tools/builtin/code-sandbox.js';
import { perspectiveMatrixTool } from '../src/server/tools/builtin/perspective-matrix.js';
import {
  GROK_MODES,
  applyGrokMode,
  extractThoughts,
} from '../src/server/persona/grok-modes.js';
import {
  GrokDeepSearchEngine,
  globalGrokDeepSearch,
} from '../src/server/research/grok-deep-search.js';
import { fetchBreakingStories } from '../src/server/social/breaking-stories.js';

describe('Grok Extended Capabilities Suite (Phase 2 - ₹0 Cost Guarantee)', () => {
  describe('1. Grok Persona Modes & Audited Chain-of-Thought (Think Mode)', () => {
    it('defines the 5 core Grok persona modes with distinct instructions', () => {
      expect(GROK_MODES.normal).toBeDefined();
      expect(GROK_MODES.think).toBeDefined();
      expect(GROK_MODES.fun).toBeDefined();
      expect(GROK_MODES.deepsearch).toBeDefined();
      expect(GROK_MODES['de-hype']).toBeDefined();

      expect(GROK_MODES.think.systemPromptModifier).toContain('<thought>');
      expect(GROK_MODES.fun.systemPromptModifier).toContain('witty, sarcastic');
      expect(GROK_MODES['de-hype'].systemPromptModifier).toContain('Cut through all marketing claims');
    });

    it('applyGrokMode injects mode instructions and chain-of-thought directives into system prompt', () => {
      const basePrompt = 'You are OpenDots AI assistant.';
      const thinkPrompt = applyGrokMode(basePrompt, 'think');
      expect(thinkPrompt).toContain('You are OpenDots AI assistant.');
      expect(thinkPrompt).toContain('<thought>');
      expect(thinkPrompt).toContain('ACTIVATE THINK MODE');

      const funPrompt = applyGrokMode(basePrompt, 'fun');
      expect(funPrompt).toContain('ACTIVATE FUN MODE');

      const defaultPrompt = applyGrokMode(basePrompt, 'unknown' as any);
      expect(defaultPrompt).toContain('[GROK MODE: NORMAL MODE]');
    });

    it('extractThoughts correctly isolates <thought> from user-visible response', () => {
      const rawResponse = `
<thought>
Step 1: Parse the user formula.
Step 2: Calculate the derivative.
Step 3: Double-check edge conditions.
</thought>
The derivative of x^3 + 4x with respect to x is 3x^2 + 4.
      `.trim();

      const { thoughts, response } = extractThoughts(rawResponse);

      expect(thoughts).toBeDefined();
      expect(thoughts).toContain('Step 1: Parse the user formula.');
      expect(thoughts).toContain('Step 3: Double-check edge conditions.');
      expect(response).toBe('The derivative of x^3 + 4x with respect to x is 3x^2 + 4.');
      expect(response).not.toContain('<thought>');
    });

    it('extractThoughts gracefully handles responses without thinking tags', () => {
      const plainText = 'Here is the direct answer without thinking.';
      const { thoughts, response } = extractThoughts(plainText);
      expect(thoughts).toBeNull();
      expect(response).toBe(plainText);
    });
  });

  describe('2. Local VM Safe Code Execution Sandbox (₹0 Cloudless Sandbox)', () => {
    it('code_sandbox_runner is registered with isPaidService=false and $0 cost', () => {
      const tool = globalToolRegistry.get('code_sandbox_runner');
      expect(tool).toBeDefined();
      expect(tool?.isPaidService).toBe(false);
      expect(tool?.costEstimateUsd).toBe(0);
    });

    it('executes safe JavaScript computations and returns values', async () => {
      const safeCode = `
        const nums = [10, 20, 30, 40];
        const sum = nums.reduce((a, b) => a + b, 0);
        return { count: nums.length, sum, avg: sum / nums.length };
      `;

      const result = await executeSafeTool(
        codeSandboxTool,
        { code: safeCode },
        { freeOnlyMode: true, userPermissions: ['basic'] },
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.syntaxValid).toBe(true);
      expect(result.data?.result).toEqual({ count: 4, sum: 100, avg: 25 });
      expect(result.data?.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('captures console.log and console.warn inside the sandbox', async () => {
      const loggingCode = `
        console.log("Analyzing prime factors...");
        console.warn("Notice: Even number detected.");
        return 42;
      `;

      const result = await executeSafeTool(
        codeSandboxTool,
        { code: loggingCode },
        { freeOnlyMode: true, userPermissions: ['basic'] },
      );

      expect(result.success).toBe(true);
      expect(result.data?.logs).toBeDefined();
      expect(result.data?.logs).toContain('Analyzing prime factors...');
      expect(result.data?.logs).toContain('[WARN] Notice: Even number detected.');
      expect(result.data?.result).toBe(42);
    });

    it('rejects forbidden access to filesystem, child processes, and global process', async () => {
      const maliciousCodes = [
        'const fs = require("fs"); return fs.readdirSync(".");',
        'return process.env.API_KEY;',
        'const { exec } = require("child_process");',
      ];

      for (const code of maliciousCodes) {
        const result = await executeSafeTool(
          codeSandboxTool,
          { code },
          { freeOnlyMode: true, userPermissions: ['basic'] },
        );

        // Security violation caught by executeSafeTool error handler
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Security policy violation|restricted keyword/i);
      }
    });

    it('enforces execution timeout and terminates runaway loops', async () => {
      const infiniteLoop = `
        while (true) {}
      `;

      const result = await executeSafeTool(
        codeSandboxTool,
        { code: infiniteLoop },
        { freeOnlyMode: true, userPermissions: ['basic'] },
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/timed out|Execution timed out|Sandbox execution error/i);
    });
  });

  describe('3. Perspective Matrix & Viewpoint Steelmanning ("Both Sides of the Debate")', () => {
    it('perspective_matrix_analyzer is registered in the tool registry with ₹0 cost', () => {
      const tool = globalToolRegistry.get('perspective_matrix_analyzer');
      expect(tool).toBeDefined();
      expect(tool?.isPaidService).toBe(false);
      expect(tool?.costEstimateUsd).toBe(0);
    });

    it('constructs balanced steelmanned matrix with consensus facts and open questions', async () => {
      const result = await executeSafeTool(
        perspectiveMatrixTool,
        {
          topic: 'Artificial Intelligence Regulation and Open Weights',
          perspectiveALabel: 'Strict Centralized Licensing',
          perspectiveBLabel: 'Open Science and Open Source Weights',
        },
        { freeOnlyMode: true, userPermissions: ['basic'] },
      );

      expect(result.success).toBe(true);
      expect(result.data?.topic).toBe('Artificial Intelligence Regulation and Open Weights');
      expect(result.data?.perspectiveA).toBeDefined();
      expect(result.data?.perspectiveB).toBeDefined();

      const { perspectiveA, perspectiveB, consensusFacts, unresolvedQuestions } = result.data!;
      expect(perspectiveA.label).toBe('Strict Centralized Licensing');
      expect(perspectiveA.arguments.length).toBeGreaterThan(0);
      expect(perspectiveA.evidenceSignals.length).toBeGreaterThan(0);

      expect(perspectiveB.label).toBe('Open Science and Open Source Weights');
      expect(perspectiveB.arguments.length).toBeGreaterThan(0);
      expect(perspectiveB.evidenceSignals.length).toBeGreaterThan(0);

      expect(consensusFacts.length).toBeGreaterThan(0);
      expect(unresolvedQuestions.length).toBeGreaterThan(0);
    });
  });

  describe('4. Grok DeepSearch Multi-Source Verification Engine', () => {
    it('executes globalGrokDeepSearch with sub-queries and verification score', async () => {
      const report = await globalGrokDeepSearch.executeDeepSearch('Open-source LLM efficiency optimizations 2026', {
        maxSources: 2,
      });

      expect(report).toBeDefined();
      expect(report.originalQuery).toBe('Open-source LLM efficiency optimizations 2026');
      expect(report.subQueries.length).toBeGreaterThanOrEqual(2);
      expect(report.verificationScore).toBeGreaterThanOrEqual(0);
      expect(report.confidenceLevel).toBeDefined();
      expect(report.report).toBeDefined();
      expect(report.reasoningTrace.length).toBeGreaterThan(0);
    });
  });

  describe('5. Breaking Stories & Live News Aggregator ("What\'s Happening Now")', () => {
    it('fetches breaking stories from live public endpoints without credentials', async () => {
      const response = await fetchBreakingStories('technology', 5);

      expect(response).toBeDefined();
      expect(response.category).toBe('technology');
      expect(Array.isArray(response.stories)).toBe(true);

      // Verify each story has necessary fields
      if (response.stories.length > 0) {
        const first = response.stories[0];
        expect(first.title).toBeDefined();
        expect(first.sourceUrl).toBeDefined();
        expect(first.sourceDomain).toBeDefined();
      }
    });
  });
});
