import type { SearchProvider, SearchResultItem } from '../types.js';

export class DuckduckgoSearchProvider implements SearchProvider {
  name = 'duckduckgo_free';

  isConfigured(): boolean {
    return true; // 100% Free, zero-cost, no API key required
  }

  async search(query: string, limit: number = 5, signal?: AbortSignal): Promise<SearchResultItem[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 OpenDotsResearch/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal,
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo free search request failed (${response.status}): ${response.statusText}`);
    }

    const html = await response.text();
    const results: SearchResultItem[] = [];

    // Pattern for result blocks in DuckDuckGo HTML
    // Extracts title link: <a class="result__a" href="..." ...>(title)</a>
    // and snippet: <a class="result__snippet" ...>(snippet)</a>
    const blockRegex = /<div class="result__body">([\s\S]*?)<\/div>/gi;
    let blockMatch: RegExpExecArray | null;

    while ((blockMatch = blockRegex.exec(html)) !== null && results.length < limit) {
      const block = blockMatch[1];

      // Extract destination URL and Title
      const titleMatch = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
      if (!titleMatch) continue;

      let rawUrl = titleMatch[1];
      let cleanUrl = rawUrl;

      // Extract target URL from DuckDuckGo redirect uddg parameter if present
      if (rawUrl.includes('uddg=')) {
        try {
          const matchUddg = rawUrl.match(/[?&]uddg=([^&]+)/);
          if (matchUddg) {
            cleanUrl = decodeURIComponent(matchUddg[1]);
          }
        } catch {
          cleanUrl = rawUrl;
        }
      }

      // If relative URL, make absolute
      if (cleanUrl.startsWith('//')) {
        cleanUrl = 'https:' + cleanUrl;
      }

      const rawTitle = titleMatch[2].replace(/<[^>]+>/g, '').trim();

      // Extract snippet
      const snippetMatch = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i.exec(block) ||
                           /<div[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i.exec(block);
      const rawSnippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';

      if (cleanUrl.startsWith('http')) {
        results.push({
          title: rawTitle || 'Web Search Result',
          url: cleanUrl,
          snippet: rawSnippet || `Relevant web result for "${cleanQuery}"`,
        });
      }
    }

    return results;
  }
}
