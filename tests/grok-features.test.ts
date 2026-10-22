import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Store } from '../src/server/store.js';
import { globalToolRegistry } from '../src/server/tools/tool-registry.js';
import { executeSafeTool } from '../src/server/tools/open-dots-tool.js';
import type { OpenDotsToolDefinition } from '../src/server/tools/types.js';
import { z } from 'zod';
import {
  redditPublicResearchTool,
  youtubePublicResearchTool,
  xPublicResearchTool,
  publicTrendAnalysisTool,
} from '../src/server/tools/builtin/social-research.js';
import {
  codeReviewTool,
  unitTestGeneratorTool,
  codeSymbolsTool,
} from '../src/server/tools/builtin/code-assistant.js';
import { synthesizeResearchReport } from '../src/server/research/citation-engine.js';
import { DuckduckgoSearchProvider } from '../src/server/research/providers/duckduckgo-provider.js';
import { WikipediaSearchProvider } from '../src/server/research/providers/wikipedia-provider.js';
import { globalFileWorkspace } from '../src/server/files/file-workspace.js';

describe('Grok-Inspired Free AI Capabilities Suite', () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  describe('1. Free-Only Mode & Strict Cost Guardrails (₹0 Policy)', () => {
    it('initializes store settings with freeOnlyMode = true by default', () => {
      const settings = store.settings();
      expect(settings.freeOnlyMode).toBe(true);
    });

    it('allows toggling freeOnlyMode via updateSettings', () => {
      const updated = store.updateSettings({ freeOnlyMode: false });
      expect(updated.freeOnlyMode).toBe(false);

      const restored = store.updateSettings({ freeOnlyMode: true });
      expect(restored.freeOnlyMode).toBe(true);
    });

    it('strictly blocks execution of paid tools when Free-Only Mode is active', async () => {
      const paidTestTool: OpenDotsToolDefinition = {
        name: 'premium_commercial_api',
        description: 'A hypothetical paid external tool requiring credits.',
        parameters: z.object({ query: z.string() }),
        isPaidService: true,
        costEstimateUsd: 0.05,
        execute: async () => ({ status: 'billed' }),
      };

      const result = await executeSafeTool(
        paidTestTool,
        { query: 'test' },
        { freeOnlyMode: true, userPermissions: ['basic'] },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Free-Only Mode is active (strict ₹0 / $0 policy)');
    });

    it('allows paid tools only when Free-Only Mode is explicitly disabled and permitted', async () => {
      const paidTestTool: OpenDotsToolDefinition = {
        name: 'premium_commercial_api',
        description: 'A hypothetical paid external tool.',
        parameters: z.object({ query: z.string() }),
        isPaidService: true,
        costEstimateUsd: 0.05,
        execute: async ({ query }) => ({ output: `processed ${query}` }),
      };

      const result = await executeSafeTool(
        paidTestTool,
        { query: 'allowed-query' },
        { freeOnlyMode: false, userPermissions: ['basic'] },
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ output: 'processed allowed-query' });
    });
  });

  describe('2. Free Public Social Media Research', () => {
    it('reddit_public_research is registered and configured with ₹0 cost', () => {
      const tool = globalToolRegistry.get('reddit_public_research');
      expect(tool).toBeDefined();
      expect(tool?.isPaidService).toBe(false);
      expect(tool?.costEstimateUsd).toBe(0);
    });

    it('executes reddit_public_research without credentials and returns structured citations', async () => {
      const result = await executeSafeTool(
        redditPublicResearchTool,
        { query: 'open source AI', subreddit: 'artificial', limit: 3 },
        { userPermissions: ['research'] },
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.cost).toContain('₹0.00');
      expect(result.data?.transparencyNotice).toBeDefined();
      expect(Array.isArray(result.data?.posts)).toBe(true);
    });

    it('youtube_public_research handles 11-char video IDs via free oEmbed', async () => {
      const result = await executeSafeTool(
        youtubePublicResearchTool,
        { target: 'dQw4w9WgXcQ' },
        { userPermissions: ['research'] },
      );

      expect(result.success).toBe(true);
      expect(result.data?.cost).toContain('₹0.00');
      expect(result.data?.video?.videoId).toBe('dQw4w9WgXcQ');
      expect(result.data?.video?.watchUrl).toContain('youtube.com/watch?v=dQw4w9WgXcQ');
    });

    it('x_public_research provides transparent disclaimer regarding official paid API tiers', async () => {
      const result = await executeSafeTool(
        xPublicResearchTool,
        { query: 'deepseek open weights' },
        { userPermissions: ['research'] },
      );

      expect(result.success).toBe(true);
      expect(result.data?.cost).toContain('₹0.00');
      expect(result.data?.paidApiNotice).toContain('discontinued free search tiers');
      expect(Array.isArray(result.data?.indexedPosts)).toBe(true);
    });

    it('public_trend_analysis aggregates public trends without synthetic metrics', async () => {
      const result = await executeSafeTool(
        publicTrendAnalysisTool,
        { category: 'technology' },
        { userPermissions: ['research'] },
      );

      expect(result.success).toBe(true);
      expect(result.data?.cost).toContain('₹0.00');
      expect(result.data?.transparencyNotice).toContain('community activity without synthetic metric');
    });
  });

  describe('3. Free Static Code Review & Test Generation Suite', () => {
    it('code_review_tool validates balanced syntax and detects functions', async () => {
      const sampleCode = `
        function calculateTotal(price: number, taxRate: number): number {
          if (taxRate < 0) throw new Error("Negative tax rate");
          return price * (1 + taxRate);
        }
      `;

      const result = await executeSafeTool(codeReviewTool, { code: sampleCode }, { userPermissions: ['basic'] });

      expect(result.success).toBe(true);
      expect(result.data?.syntaxValid).toBe(true);
      expect(result.data?.metrics.functionsFound).toBe(1);
      expect(result.data?.issues.filter((i: any) => i.type === 'error').length).toBe(0);
    });

    it('code_review_tool detects bracket mismatch syntax errors', async () => {
      const brokenCode = `
        function badSyntax() {
          const arr = [1, 2, 3;
        }
      `;

      const result = await executeSafeTool(codeReviewTool, { code: brokenCode }, { userPermissions: ['basic'] });

      expect(result.success).toBe(true);
      expect(result.data?.syntaxValid).toBe(false);
      expect(result.data?.issues.some((i: any) => i.type === 'error')).toBe(true);
    });

    it('code_review_tool detects dangerous security anti-patterns (eval & innerHTML)', async () => {
      const dangerousCode = `
        function renderUser(input) {
          eval("console.log(" + input + ")");
          document.getElementById('root').innerHTML = input;
        }
      `;

      const result = await executeSafeTool(codeReviewTool, { code: dangerousCode }, { userPermissions: ['basic'] });

      expect(result.success).toBe(true);
      const securityIssues = result.data?.issues.filter((i: any) => i.type === 'security') || [];
      expect(securityIssues.length).toBeGreaterThanOrEqual(2);
      expect(securityIssues.some((i: any) => i.message.includes('eval()'))).toBe(true);
      expect(securityIssues.some((i: any) => i.message.includes('innerHTML'))).toBe(true);
    });

    it('unit_test_generator scaffolds a comprehensive Vitest test suite', async () => {
      const code = `
        export function multiply(a: number, b: number): number {
          return a * b;
        }
        export function divide(a: number, b: number): number {
          if (b === 0) throw new Error("Zero division");
          return a / b;
        }
      `;

      const result = await executeSafeTool(
        unitTestGeneratorTool,
        { code, framework: 'vitest' },
        { userPermissions: ['basic'] },
      );

      expect(result.success).toBe(true);
      expect(result.data?.framework).toBe('vitest');
      expect(result.data?.functionsCovered).toContain('multiply');
      expect(result.data?.functionsCovered).toContain('divide');
      expect(result.data?.testCode).toContain("import { describe, it, expect, vi } from 'vitest';");
      expect(result.data?.testCode).toContain("describe('multiply'");
    });

    it('code_symbols_navigator finds declarations in workspace files', async () => {
      globalFileWorkspace.writeFile(
        'sample-calc.ts',
        'export function add(a: number, b: number) { return a + b; }\nexport class Calculator {}\nexport interface CalcConfig {}',
      );

      const result = await executeSafeTool(
        codeSymbolsTool,
        { query: 'Calc' },
        { userPermissions: ['basic'] },
      );

      expect(result.success).toBe(true);
      expect(result.data?.symbols.some((s: any) => s.name === 'Calculator')).toBe(true);
      expect(result.data?.symbols.some((s: any) => s.name === 'CalcConfig')).toBe(true);
    });
  });

  describe('4. Free Search Providers & Citation Engine with Conflict Detection', () => {
    it('DuckDuckGo search provider is configured by default for free search', () => {
      const ddg = new DuckduckgoSearchProvider();
      expect(ddg.isConfigured()).toBe(true);
      expect(ddg.name).toBe('duckduckgo_free');
    });

    it('Wikipedia search provider is configured by default for free search', () => {
      const wiki = new WikipediaSearchProvider();
      expect(wiki.isConfigured()).toBe(true);
      expect(wiki.name).toBe('wikipedia_free');
    });

    it('synthesizes research report and identifies conflicting temporal or pricing claims', () => {
      const sources = [
        {
          index: 1,
          title: 'Software Project Release Notes (2021)',
          url: 'https://example.com/2021-notes',
          snippet: 'Released in 2021 as a fully free and open-source toolkit for developers.',
          content: 'Released in 2021 as a free tool.',
        },
        {
          index: 2,
          title: 'Enterprise Software Overview (2024)',
          url: 'https://example.com/2024-overview',
          snippet: 'In 2024, the enterprise tier introduced paid subscription pricing for high volume.',
          content: 'In 2024, paid subscription was introduced.',
        },
      ];

      const report = synthesizeResearchReport('software evolution', sources);

      expect(report.query).toBe('software evolution');
      expect(report.sources.length).toBe(2);
      expect(report.verifiedFacts.length).toBeGreaterThan(0);
      expect(report.conflictingClaims.length).toBeGreaterThan(0);
      expect(report.conflictingClaims.some((c) => c.includes('Temporal divergence') || c.includes('licensing') || c.includes('pricing'))).toBe(true);
      expect(report.uncertainties.length).toBeGreaterThan(0);
      expect(report.markdownReport).toContain('Deep Research Report: software evolution');
    });
  });
});
