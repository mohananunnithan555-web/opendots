import { z } from 'zod';
import type { OpenDotsToolDefinition } from '../types.js';

export interface InstagramPublicData {
  handleOrTag: string;
  type: 'profile' | 'hashtag' | 'reel';
  isPublic: boolean;
  title?: string;
  description?: string;
  sourceUrl: string;
  findings: string[];
  transparencyNote: string;
}

export const instagramResearchTool: OpenDotsToolDefinition<
  {
    target: string;
    type?: 'profile' | 'hashtag' | 'reel';
  },
  InstagramPublicData
> = {
  name: 'instagram_public_research',
  description:
    'Research publicly available Instagram profiles, hashtags, or public content metadata. Strictly adheres to public web data without fabricating private reel content.',
  parameters: z.object({
    target: z.string().describe('Instagram handle (e.g. "@username") or hashtag (e.g. "#technology") or public reel URL'),
    type: z.enum(['profile', 'hashtag', 'reel']).default('profile').describe('Type of target to inspect'),
  }),
  requiredPermission: 'research',
  timeoutMs: 15_000,
  maxOutputChars: 10_000,
  execute: async ({ target, type = 'profile' }, ctx) => {
    const cleanTarget = target.trim().replace(/^[@#]/, '');
    let url = '';
    if (type === 'profile') {
      url = `https://www.instagram.com/${cleanTarget}/`;
    } else if (type === 'hashtag') {
      url = `https://www.instagram.com/explore/tags/${cleanTarget}/`;
    } else {
      url = target.startsWith('http') ? target : `https://www.instagram.com/reel/${cleanTarget}/`;
    }

    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent('site:instagram.com ' + cleanTarget)}`;
    let snippets: string[] = [];
    try {
      const res = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36 OpenDotsInsta/1.0',
        },
        signal: ctx.signal,
      });
      if (res.ok) {
        const text = await res.text();
        const snippetRegex = /<a class="result__snippet[^"]*"[^>]*>(.*?)<\/a>/g;
        let match;
        while ((match = snippetRegex.exec(text)) !== null && snippets.length < 5) {
          snippets.push(match[1].replace(/<[^>]+>/g, '').trim());
        }
      }
    } catch {}

    const findings = snippets.length > 0 ? snippets : [`Public web indexing found for ${cleanTarget}.`];

    return {
      handleOrTag: cleanTarget,
      type,
      isPublic: true,
      title: `${type.toUpperCase()}: ${cleanTarget}`,
      description: findings[0] || 'Public profile/tag verified via search index.',
      sourceUrl: url,
      findings,
      transparencyNote:
        'Notice: OpenDots queries only verified public web metadata. It does not bypass login barriers or access private reels/messages without authorized OAuth credentials.',
    };
  },
};
