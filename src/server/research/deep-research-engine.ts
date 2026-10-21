import type { ResearchReport, ResearchSource, SearchProvider } from './types.js';
import { TavilySearchProvider } from './providers/tavily-provider.js';
import { SearxngSearchProvider } from './providers/searxng-provider.js';
import { DirectScrapeProvider } from './providers/direct-scrape-provider.js';
import { synthesizeResearchReport } from './citation-engine.js';
import { webReaderTool } from '../tools/builtin/web-reader.js';
import { executeSafeTool } from '../tools/open-dots-tool.js';

export class DeepResearchEngine {
  private providers: SearchProvider[] = [];

  constructor() {
    this.providers.push(new TavilySearchProvider());
    this.providers.push(new SearxngSearchProvider());
    this.providers.push(new DirectScrapeProvider());
  }

  registerProvider(provider: SearchProvider): void {
    this.providers.unshift(provider);
  }

  getActiveProvider(): SearchProvider | undefined {
    return this.providers.find((p) => p.isConfigured());
  }

  /**
   * Perform comprehensive multi-source web research with automatic citation extraction.
   */
  async deepResearch(
    query: string,
    options: { maxSources?: number; signal?: AbortSignal } = {},
  ): Promise<ResearchReport> {
    const cleanQuery = query.trim();
    const limit = options.maxSources ?? 3;
    const provider = this.getActiveProvider();

    if (!provider) {
      return synthesizeResearchReport(cleanQuery, []);
    }

    try {
      const searchResults = await provider.search(cleanQuery, limit, options.signal);
      if (searchResults.length === 0) {
        return synthesizeResearchReport(cleanQuery, []);
      }

      const sources: ResearchSource[] = [];

      // Fetch content for each source safely in parallel
      const fetchPromises = searchResults.map(async (res, idx) => {
        let content = res.snippet;
        try {
          if (res.url && res.url.startsWith('http')) {
            const pageResult = await executeSafeTool(
              webReaderTool,
              { url: res.url },
              { userPermissions: ['research'], signal: options.signal },
            );
            if (pageResult.success && pageResult.data?.content) {
              content = pageResult.data.content;
            }
          }
        } catch {
          // Fall back to search snippet
        }

        return {
          index: idx + 1,
          title: res.title || `Source ${idx + 1}`,
          url: res.url,
          content,
          snippet: res.snippet || content.slice(0, 200),
        };
      });

      const resolvedSources = await Promise.all(fetchPromises);
      return synthesizeResearchReport(cleanQuery, resolvedSources);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        query: cleanQuery,
        summary: `Research operation failed: ${msg}`,
        keyFindings: [],
        comparisons: [],
        uncertainties: [`Failed to query search provider "${provider.name}": ${msg}`],
        citations: [],
        markdownReport: `# Research Failed\n\nCould not complete research for "${cleanQuery}".\n\n**Error:** ${msg}`,
        sources: [],
        generatedAt: Date.now(),
      };
    }
  }
}

export const globalResearchEngine = new DeepResearchEngine();
