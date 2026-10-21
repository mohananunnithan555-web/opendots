import type { SearchProvider, SearchResultItem } from '../types.js';

export class SearxngSearchProvider implements SearchProvider {
  name = 'searxng';

  constructor(private baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.SEARXNG_URL?.trim();
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.baseUrl.length > 0);
  }

  async search(query: string, limit: number = 5, signal?: AbortSignal): Promise<SearchResultItem[]> {
    if (!this.isConfigured()) {
      throw new Error('SearXNG provider is not configured. Set SEARXNG_URL.');
    }

    const cleanBase = this.baseUrl!.replace(/\/$/, '');
    const url = `${cleanBase}/search?q=${encodeURIComponent(query)}&format=json&categories=general`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
      signal,
    });

    if (!response.ok) {
      throw new Error(`SearXNG request failed (${response.status}): ${response.statusText}`);
    }

    const data = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };

    return (data.results ?? []).slice(0, limit).map((r) => ({
      title: r.title ?? 'Untitled Source',
      url: r.url ?? '',
      snippet: r.content ?? '',
    }));
  }
}
