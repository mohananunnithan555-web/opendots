import { z } from 'zod';
import { globalFileWorkspace } from './file-workspace.js';
import type { OpenDotsToolDefinition } from '../tools/types.js';

export const readWorkspaceFileTool: OpenDotsToolDefinition<
  { path: string },
  { name: string; relativePath: string; content: string; size: number }
> = {
  name: 'read_workspace_file',
  description: 'Read the contents of a text, markdown, code, csv, or json file from the sandboxed workspace.',
  parameters: z.object({
    path: z.string().min(1).describe('Relative path to the file inside the workspace.'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 10_000,
  maxOutputChars: 50_000,
  execute: async ({ path }) => {
    return globalFileWorkspace.readFile(path);
  },
};

export const writeWorkspaceFileTool: OpenDotsToolDefinition<
  { path: string; content: string },
  { name: string; relativePath: string; size: number; writtenAt: number }
> = {
  name: 'write_workspace_file',
  description: 'Create or update a text, markdown, code, or json document inside the sandboxed workspace.',
  parameters: z.object({
    path: z.string().min(1).describe('Relative file path to write to.'),
    content: z.string().describe('Full textual or structured content to write.'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 10_000,
  execute: async ({ path, content }) => {
    return globalFileWorkspace.writeFile(path, content);
  },
};

export const listWorkspaceFilesTool: OpenDotsToolDefinition<
  { directory?: string },
  { files: Array<{ name: string; relativePath: string; size: number; extension: string }> }
> = {
  name: 'list_workspace_files',
  description: 'List available files and documents in the sandboxed workspace directory.',
  parameters: z.object({
    directory: z.string().optional().describe('Optional subdirectory inside workspace to list.'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 5000,
  execute: async ({ directory }) => {
    const files = globalFileWorkspace.listFiles(directory ?? '');
    return {
      files: files.map((f) => ({
        name: f.name,
        relativePath: f.relativePath,
        size: f.size,
        extension: f.extension,
      })),
    };
  },
};

export const exportDocumentTool: OpenDotsToolDefinition<
  { title: string; content: string; format?: 'markdown' | 'text' | 'json'; projectId?: string },
  { name: string; relativePath: string; size: number; writtenAt: number }
> = {
  name: 'export_workspace_document',
  description: 'Export a research report, summary, or document to the exports folder in Markdown, Text, or JSON format.',
  parameters: z.object({
    title: z.string().min(1).describe('Title of the document to export.'),
    content: z.string().describe('Body content to export.'),
    format: z.enum(['markdown', 'text', 'json']).optional().describe('Format (default markdown).'),
    projectId: z.string().optional().describe('Optional project ID to associate deliverable with.'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 10_000,
  execute: async ({ title, content, format, projectId }) => {
    return globalFileWorkspace.exportDocument(title, content, format ?? 'markdown', projectId);
  },
};

export const analyzeSpreadsheetTool: OpenDotsToolDefinition<
  { path?: string; rawCsv?: string; fileName?: string },
  any
> = {
  name: 'analyze_spreadsheet',
  description: 'Parse a CSV or tabular spreadsheet, compute statistics (sum, mean, median, min, max), evaluate formulas, and generate Markdown tables.',
  parameters: z.object({
    path: z.string().optional().describe('Relative path to CSV file in workspace.'),
    rawCsv: z.string().optional().describe('Direct CSV text content.'),
    fileName: z.string().optional().describe('File name for reporting.'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 15_000,
  execute: async ({ path, rawCsv, fileName }) => {
    const { globalOfficeDocumentEngine } = await import('./office-document-engine.js');
    let csvData = rawCsv ?? '';
    const name = fileName || path || 'Spreadsheet Data';

    if (path && !csvData) {
      const readRes = globalFileWorkspace.readFile(path);
      csvData = readRes.content;
    }

    return globalOfficeDocumentEngine.analyzeSpreadsheet(name, csvData);
  },
};

export const generateOfficeDocTool: OpenDotsToolDefinition<
  {
    title: string;
    executiveSummary: string;
    sections: Array<{ heading: string; body: string; bulletPoints?: string[] }>;
    author?: string;
    citations?: string[];
  },
  { markdownDocument: string; savedPath?: string }
> = {
  name: 'generate_office_document',
  description: 'Generate a professional Word/DOCX-compatible structured report with executive summary, sections, bullet points, and source citations.',
  parameters: z.object({
    title: z.string().min(1).describe('Document title.'),
    executiveSummary: z.string().describe('Executive summary paragraph.'),
    sections: z.array(
      z.object({
        heading: z.string(),
        body: z.string(),
        bulletPoints: z.array(z.string()).optional(),
      }),
    ).describe('Document sections with headings and content.'),
    author: z.string().optional().describe('Author name.'),
    citations: z.array(z.string()).optional().describe('List of references or citations.'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 10_000,
  execute: async ({ title, executiveSummary, sections, author, citations }) => {
    const { globalOfficeDocumentEngine } = await import('./office-document-engine.js');
    const docMd = globalOfficeDocumentEngine.generateWordDocument(
      title,
      executiveSummary,
      sections,
      { author, citations },
    );

    const exportRes = globalFileWorkspace.exportDocument(title, docMd, 'markdown');
    return {
      markdownDocument: docMd,
      savedPath: exportRes.relativePath,
    };
  },
};

export const generateSlideDeckTool: OpenDotsToolDefinition<
  {
    title: string;
    topic: string;
    author?: string;
  },
  any
> = {
  name: 'generate_slide_deck',
  description: 'Generate a structured multi-slide executive presentation deck outline (PPTX compatible) with layouts and speaker notes.',
  parameters: z.object({
    title: z.string().min(1).describe('Presentation title.'),
    topic: z.string().min(1).describe('Subject matter or research topic to outline.'),
    author: z.string().optional().describe('Author name.'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 10_000,
  execute: async ({ title, topic, author }) => {
    const { globalOfficeDocumentEngine } = await import('./office-document-engine.js');
    return globalOfficeDocumentEngine.generatePresentationDeck(title, topic, author);
  },
};

export const diffDocumentsTool: OpenDotsToolDefinition<
  { originalPath: string; newPath?: string; newContent?: string },
  any
> = {
  name: 'diff_documents',
  description: 'Compare two versions of a workspace document and produce an additions/deletions diff report.',
  parameters: z.object({
    originalPath: z.string().describe('Path to initial document.'),
    newPath: z.string().optional().describe('Path to updated revision.'),
    newContent: z.string().optional().describe('Direct updated content string.'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 10_000,
  execute: async ({ originalPath, newPath, newContent }) => {
    const orig = globalFileWorkspace.readFile(originalPath);
    let updatedStr = newContent ?? '';
    if (newPath && !updatedStr) {
      updatedStr = globalFileWorkspace.readFile(newPath).content;
    }
    return globalFileWorkspace.diffVersions(orig.content, updatedStr);
  },
};

