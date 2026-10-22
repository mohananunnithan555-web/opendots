export type FileCategory = 'source' | 'intermediate' | 'deliverable' | 'archive' | 'general';

export interface FileInfo {
  name: string;
  relativePath: string;
  path?: string;
  size: number;
  modifiedAt: number;
  updatedAt?: number;
  extension: string;
  category?: FileCategory;
  version?: number;
  projectId?: string;
}

export interface OfficeDocumentModel {
  title: string;
  author?: string;
  executiveSummary?: string;
  markdown: string;
  wordCompatibleHtml?: string;
  tableOfContents?: string[];
  sectionsCount?: number;
}

export interface ReadFileResult {
  name: string;
  relativePath: string;
  content: string;
  size: number;
  truncated?: boolean;
  category?: FileCategory;
}

export interface WriteFileResult {
  name: string;
  relativePath: string;
  size: number;
  writtenAt: number;
  category?: FileCategory;
  version?: number;
}

export interface FileVersionRecord {
  version: number;
  filePath: string;
  savedAt: number;
  size: number;
  checksum?: string;
  changeSummary?: string;
}

export interface DocumentDiffResult {
  additions: string[];
  deletions: string[];
  totalChanges: number;
  summary: string;
}

export interface SpreadsheetRow {
  [key: string]: string | number | null;
}

export interface SpreadsheetAnalysisResult {
  fileName: string;
  rowCount: number;
  columnCount: number;
  columns: string[];
  statistics: Record<
    string,
    {
      count: number;
      sum?: number;
      mean?: number;
      median?: number;
      min?: number;
      max?: number;
    }
  >;
  formulaEvaluations: Record<string, number | string>;
  markdownTable: string;
  dataSummary: string;
}

export interface PresentationSlide {
  slideNumber: number;
  title: string;
  subtitle?: string;
  bullets: string[];
  speakerNotes?: string;
  layout?: 'title' | 'content' | 'comparison' | 'summary';
}

export interface PresentationDeckModel {
  title: string;
  author?: string;
  createdAt: number;
  slides: PresentationSlide[];
}

