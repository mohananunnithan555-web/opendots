import type { SearchProvider, SearchResultItem } from '../types.js';

export class TavilySearchProvider implements SearchProvider {
  name = 'tavily';

  constructor(private apiKey?: string) {
    this.apiKey = apiKey ?? process.env.TAVILY_API_KEY?.trim();
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 0);
  }

  async search(query: string, limit: number = 5, signal?: AbortSignal): Promise<SearchResultItem[]> {
    if (!this.isConfigured()) {
      throw new Error('Tavily search provider is not configured. Set TAVILY_API_KEY.');
    }

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        search_depth: 'advanced',
        max_results: limit,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Tavily search failed (${response.status}): ${response.statusText}`);
    }

    const data = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };

    return (data.results ?? []).map((r) => ({
      title: r.title ?? 'Untitled Source',
      url: r.url ?? '',
      snippet: r.content ?? '',
    }));
  }
}
