import type { SearchProvider, SearchResultItem } from '../types.js';

export class DirectScrapeProvider implements SearchProvider {
  name = 'direct_scrape';

  isConfigured(): boolean {
    return true;
  }

  async search(query: string, limit: number = 3, signal?: AbortSignal): Promise<SearchResultItem[]> {
    // Extract any URLs present in the query
    const urlMatches = query.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
    if (urlMatches.length === 0) {
      return [];
    }

    const uniqueUrls = [...new Set(urlMatches)].slice(0, limit);
    const results: SearchResultItem[] = [];

    for (const url of uniqueUrls) {
      try {
        const hostname = new URL(url).hostname;
        results.push({
          title: `Direct Web Source (${hostname})`,
          url,
          snippet: `Extracted live content directly from ${url}`,
        });
      } catch {
        // Skip invalid URL
      }
    }

    return results;
  }
}
