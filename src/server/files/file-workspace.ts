import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { FileInfo, ReadFileResult, WriteFileResult } from './types.js';

const DISALLOWED_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.ps1',
  '.dll',
  '.so',
  '.vbs',
  '.scr',
  '.msi',
  '.com',
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_READ_CHARS = 50_000;

export function resolveWorkspaceFilesDirectory(customDir?: string): string {
  if (customDir) return resolve(normalize(customDir));
  if (process.env.WORKSPACE_FILES_PATH) {
    return resolve(normalize(process.env.WORKSPACE_FILES_PATH));
  }
  const dbPath = process.env.DATABASE_PATH;
  if (dbPath && dbPath !== ':memory:') {
    return join(dirname(resolve(dbPath)), 'workspace_files');
  }
  return resolve('./data/workspace_files');
}

export class FileWorkspace {
  readonly baseDir: string;

  constructor(baseDirectory?: string) {
    const target = resolveWorkspaceFilesDirectory(baseDirectory);
    try {
      if (!existsSync(target)) {
        mkdirSync(target, { recursive: true });
      }
      this.baseDir = target;
    } catch (err) {
      console.warn(`[FileWorkspace] Warning: Could not create baseDir at ${target}:`, err);
      // Fallback to os.tmpdir() to prevent container startup failure
      const fallback = resolve(join(tmpdir(), 'opendots_workspace_files'));
      try {
        if (!existsSync(fallback)) {
          mkdirSync(fallback, { recursive: true });
        }
        this.baseDir = fallback;
      } catch {
        this.baseDir = target;
      }
    }
  }

  /**
   * Safely resolve path and prevent path traversal outside baseDir
   */
  resolveSafePath(userPath: string): string {
    if (typeof userPath !== 'string') {
      throw new Error('File path must be a valid string.');
    }

    if (!userPath.trim() || userPath.trim() === '.') {
      return this.baseDir;
    }

    if (userPath.includes('\0')) {
      throw new Error('Invalid path: null byte detected.');
    }

    const resolved = resolve(this.baseDir, normalize(userPath));

    // Must be within baseDir
    if (!resolved.startsWith(this.baseDir)) {
      throw new Error(`Security restriction: Path traversal attempt blocked for "${userPath}".`);
    }

    return resolved;
  }

  readFile(userPath: string): ReadFileResult {
    const fullPath = this.resolveSafePath(userPath);

    if (!existsSync(fullPath)) {
      throw new Error(`File "${userPath}" does not exist.`);
    }

    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      throw new Error(`"${userPath}" is a directory, not a file.`);
    }

    if (stat.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(`File size (${(stat.size / 1024 / 1024).toFixed(2)}MB) exceeds 10MB limit.`);
    }

    const rawContent = readFileSync(fullPath, 'utf-8');
    const rel = relative(this.baseDir, fullPath).replace(/\\/g, '/');

    if (rawContent.length > MAX_READ_CHARS) {
      return {
        name: fullPath.split(/[/\\]/).pop() ?? userPath,
        relativePath: rel,
        content: rawContent.slice(0, MAX_READ_CHARS) + '\n\n[TRUNCATED: File content exceeded 50,000 characters]',
        size: stat.size,
        truncated: true,
      };
    }

    return {
      name: fullPath.split(/[/\\]/).pop() ?? userPath,
      relativePath: rel,
      content: rawContent,
      size: stat.size,
      truncated: false,
    };
  }

  writeFile(userPath: string, content: string): WriteFileResult {
    const fullPath = this.resolveSafePath(userPath);
    const ext = extname(fullPath).toLowerCase();

    if (DISALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(`Security restriction: Creating executable file types ("${ext}") is prohibited.`);
    }

    // Ensure directory exists
    const dir = resolve(fullPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(fullPath, content, 'utf-8');
    const stat = statSync(fullPath);
    const rel = relative(this.baseDir, fullPath).replace(/\\/g, '/');

    return {
      name: fullPath.split(/[/\\]/).pop() ?? userPath,
      relativePath: rel,
      size: stat.size,
      writtenAt: stat.mtimeMs,
    };
  }

  listFiles(subDir: string = ''): FileInfo[] {
    const targetDir = this.resolveSafePath(subDir);
    if (!existsSync(targetDir)) return [];

    const results: FileInfo[] = [];

    const walk = (currentPath: string) => {
      const items = readdirSync(currentPath, { withFileTypes: true });
      for (const item of items) {
        const itemFullPath = join(currentPath, item.name);
        if (item.isDirectory()) {
          walk(itemFullPath);
        } else if (item.isFile()) {
          const stat = statSync(itemFullPath);
          const rel = relative(this.baseDir, itemFullPath).replace(/\\/g, '/');
          results.push({
            name: item.name,
            relativePath: rel,
            size: stat.size,
            modifiedAt: stat.mtimeMs,
            extension: extname(item.name).toLowerCase(),
          });
        }
      }
    };

    walk(targetDir);
    return results;
  }

  deleteFile(userPath: string): boolean {
    const fullPath = this.resolveSafePath(userPath);
    if (!existsSync(fullPath)) return false;
    unlinkSync(fullPath);
    return true;
  }

  exportDocument(name: string, content: string, format: 'markdown' | 'text' | 'json' = 'markdown'): WriteFileResult {
    let cleanName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const ext = format === 'json' ? '.json' : format === 'text' ? '.txt' : '.md';
    if (!cleanName.endsWith(ext)) {
      cleanName += ext;
    }

    return this.writeFile(join('exports', cleanName), content);
  }
}

export const globalFileWorkspace = new FileWorkspace();
