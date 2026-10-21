export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchProvider {
  name: string;
  isConfigured(): boolean;
  search(query: string, limit?: number, signal?: AbortSignal): Promise<SearchResultItem[]>;
}

export interface ResearchSource {
  index: number;
  title: string;
  url: string;
  content: string;
  snippet: string;
}

export interface CitationItem {
  index: number;
  title: string;
  url: string;
  claim: string;
}

export interface ResearchReport {
  query: string;
  summary: string;
  keyFindings: string[];
  comparisons: string[];
  uncertainties: string[];
  citations: CitationItem[];
  markdownReport: string;
  sources: ResearchSource[];
  generatedAt: number;
}
