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
  { title: string; content: string; format?: 'markdown' | 'text' | 'json' },
  { name: string; relativePath: string; size: number; writtenAt: number }
> = {
  name: 'export_workspace_document',
  description: 'Export a research report, summary, or document to the exports folder in Markdown, Text, or JSON format.',
  parameters: z.object({
    title: z.string().min(1).describe('Title of the document to export.'),
    content: z.string().describe('Body content to export.'),
    format: z.enum(['markdown', 'text', 'json']).optional().describe('Format (default markdown).'),
  }),
  requiredPermission: 'basic',
  timeoutMs: 10_000,
  execute: async ({ title, content, format }) => {
    return globalFileWorkspace.exportDocument(title, content, format ?? 'markdown');
  },
};
