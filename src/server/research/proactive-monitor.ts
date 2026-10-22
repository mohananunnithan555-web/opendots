import { randomUUID } from 'node:crypto';
import type { Store } from '../store.js';
import { globalGrokDeepSearch } from './grok-deep-search.js';
import { synthesizeResearchReport } from './citation-engine.js';
import { DuckduckgoSearchProvider } from './providers/duckduckgo-provider.js';
import { DirectScrapeProvider } from './providers/direct-scrape-provider.js';

export interface ProactiveMonitor {
  id: string;
  ownerId: string;
  topic: string;
  sources: string[];
  intervalMinutes: number;
  lastCheckedAt?: number;
  lastResultSummary?: string;
  status: 'active' | 'paused';
  createdAt: number;
  updatedAt: number;
}

export interface MonitorCheckResult {
  monitorId: string;
  topic: string;
  hasUpdates: boolean;
  summary: string;
  keyFindings: string[];
  sourcesCount: number;
  savedMemoryId?: string;
  checkedAt: number;
}

/**
 * Background Proactive Research & Standing Monitoring Worker.
 *
 * Implements ChatGPT Dots autonomous research:
 * - Continuously monitors topics, competitors, and project needs in background.
 * - Strictly read-only execution: does NOT write outside workspace or make destructive calls.
 * - Free-only policy: Uses free public search providers (DuckDuckGo & Direct Scrape) without any paid API keys.
 * - Stores meaningful insights directly into Dot's long-term memory under 'responsibility' or 'project'.
 * - Creates non-intrusive notifications when important changes or updates are detected.
 */
export class ProactiveResearchService {
  private ddgProvider = new DuckduckgoSearchProvider();
  private scrapeProvider = new DirectScrapeProvider();

  constructor(private store: Store) {}

  /**
   * Run a proactive check on a specific monitor.
   */
  async checkMonitor(
    monitorId: string,
    ownerId: string = 'opendots-owner',
  ): Promise<MonitorCheckResult> {
    const monitor = this.store.getProactiveMonitor(monitorId, ownerId);
    if (!monitor) {
      throw new Error(`Monitor "${monitorId}" not found.`);
    }

    const now = Date.now();
    const sources: Array<{ index: number; title: string; url: string; content: string; snippet: string }> = [];

    // 1. Check custom URLs if provided
    if (monitor.sources && monitor.sources.length > 0) {
      for (let i = 0; i < Math.min(monitor.sources.length, 3); i++) {
        const url = monitor.sources[i];
        try {
          const scraped = await this.scrapeProvider.search(url, 1);
          if (scraped.length > 0 && scraped[0].snippet) {
            sources.push({
              index: sources.length + 1,
              title: scraped[0].title || url,
              url,
              content: scraped[0].snippet.slice(0, 3000),
              snippet: scraped[0].snippet.slice(0, 300),
            });
          }
        } catch {
          // Ignore scrape errors for unreached sites
        }
      }
    }

    // 2. Query free public search for the topic
    try {
      const searchResults = await this.ddgProvider.search(monitor.topic, 4);
      for (const res of searchResults) {
        if (!sources.some((s) => s.url === res.url)) {
          sources.push({
            index: sources.length + 1,
            title: res.title,
            url: res.url,
            content: res.snippet || res.title,
            snippet: res.snippet || res.title,
          });
        }
      }
    } catch {
      // Fallback: search query handled gracefully
    }

    // Synthesize report
    const report = synthesizeResearchReport(monitor.topic, sources);
    const summary = report.summary || `Proactive check for "${monitor.topic}" completed. ${sources.length} sources evaluated.`;
    const keyFindings = report.keyFindings.slice(0, 3);

    const hasMeaningfulUpdates = sources.length > 0 && summary.length > 30;

    let savedMemoryId: string | undefined;
    if (hasMeaningfulUpdates) {
      // Persist to persistent long-term memory under 'responsibility'
      const memoryText = `[Standing Monitor: ${monitor.topic}]\n${summary}\nKey findings:\n${keyFindings.join('\n')}`;
      const mem = this.store.saveMemoryV2({
        ownerId,
        category: 'responsibility',
        text: memoryText,
        source: 'agent_inferred',
        confidence: 0.9,
      });
      savedMemoryId = mem.id;

      // Create notification
      this.store.createNotification({
        ownerId,
        type: 'monitoring_alert',
        title: `Proactive Update: ${monitor.topic.slice(0, 35)}`,
        message: summary.slice(0, 160),
        priority: 'low',
        targetId: monitor.id,
      });
    }

    // Update monitor record
    monitor.lastCheckedAt = now;
    monitor.lastResultSummary = summary;
    monitor.updatedAt = now;
    this.store.saveProactiveMonitor(monitor);

    return {
      monitorId: monitor.id,
      topic: monitor.topic,
      hasUpdates: hasMeaningfulUpdates,
      summary,
      keyFindings,
      sourcesCount: sources.length,
      savedMemoryId,
      checkedAt: now,
    };
  }

  /**
   * Run all active monitors that are due for a check.
   */
  async runDueMonitors(ownerId: string = 'opendots-owner'): Promise<MonitorCheckResult[]> {
    const monitors = this.store.proactiveMonitors(ownerId).filter((m) => m.status === 'active');
    const now = Date.now();
    const results: MonitorCheckResult[] = [];

    for (const monitor of monitors) {
      const intervalMs = (monitor.intervalMinutes || 60) * 60 * 1000;
      const isDue = !monitor.lastCheckedAt || now - monitor.lastCheckedAt >= intervalMs;

      if (isDue) {
        try {
          const res = await this.checkMonitor(monitor.id, ownerId);
          results.push(res);
        } catch (e) {
          console.warn(`Proactive monitor "${monitor.id}" check failed:`, e);
        }
      }
    }

    return results;
  }
}
