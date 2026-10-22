import type { SearchProvider, SearchResultItem } from '../types.js';

export class WikipediaSearchProvider implements SearchProvider {
  name = 'wikipedia_free';

  isConfigured(): boolean {
    return true; // 100% Free Wikimedia API
  }

  async search(query: string, limit: number = 5, signal?: AbortSignal): Promise<SearchResultItem[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      cleanQuery,
    )}&utf8=&format=json&srlimit=${limit}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'OpenDots/1.0 (https://opendots-1j9k.onrender.com/; opendots-agent@render.com)',
        Accept: 'application/json',
      },
      signal,
    });

    if (!response.ok) {
      throw new Error(`Wikipedia API search request failed (${response.status}): ${response.statusText}`);
    }

    const data = (await response.json()) as {
      query?: {
        search?: Array<{
          title: string;
          snippet: string;
          pageid: number;
        }>;
      };
    };

    const searchItems = data.query?.search ?? [];
    return searchItems.map((item) => {
      const cleanTitle = item.title;
      const cleanSnippet = item.snippet.replace(/<[^>]+>/g, '').trim();
      const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(cleanTitle.replace(/\s+/g, '_'))}`;

      return {
        title: `${cleanTitle} — Wikipedia`,
        url: pageUrl,
        snippet: cleanSnippet || `Wikipedia article overview for ${cleanTitle}`,
      };
    });
  }
}
