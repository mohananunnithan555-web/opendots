import { z } from 'zod';
import type { OpenDotsToolDefinition } from '../types.js';

export const webReaderTool: OpenDotsToolDefinition<
  { url: string },
  { title?: string; content: string; url: string; contentLength: number }
> = {
  name: 'read_web_page',
  description:
    'Extract and read readable text content from a public URL safely. Respects timeouts and caps content size to prevent memory exhaustion.',
  parameters: z.object({
    url: z.string().url().describe('The public http/https URL of the web page to read.'),
  }),
  requiredPermission: 'research',
  timeoutMs: 15_000,
  maxOutputChars: 20_000,
  execute: async ({ url }, ctx) => {
    const parsedUrl = new URL(url);

    // Prevent access to private/internal IPs, localhost, or cloud metadata endpoints
    const hostname = parsedUrl.hostname.toLowerCase();
    const isPrivate =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.endsWith('.local') ||
      hostname === '169.254.169.254' || // AWS/GCP metadata
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      (hostname.startsWith('172.') &&
        (() => {
          const second = parseInt(hostname.split('.')[1] ?? '0', 10);
          return second >= 16 && second <= 31;
        })());

    if (isPrivate) {
      throw new Error(`Security restriction: Access to internal/private host "${hostname}" is prohibited.`);
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 OpenDotsResearch/1.0',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
      },
      signal: ctx.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch web page: HTTP ${response.status} ${response.statusText}`);
    }

    const html = await response.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : undefined;

    // Clean HTML tags and scripts
    const textContent = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      title,
      url,
      content: textContent,
      contentLength: textContent.length,
    };
  },
};
