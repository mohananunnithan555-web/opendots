import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { DocumentDiffResult, FileCategory, FileInfo, ReadFileResult, WriteFileResult } from './types.js';

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

export function validateArchiveEntryPath(entryPath: string): boolean {
  if (!entryPath || typeof entryPath !== 'string') return false;
  if (entryPath.includes('\0')) return false;
  if (/^[a-zA-Z]:[/\\]/.test(entryPath) || entryPath.startsWith('/') || entryPath.startsWith('\\')) {
    return false;
  }
  const normalized = normalize(entryPath).replace(/^[/\\]+/, '');
  if (normalized.startsWith('..') || normalized.includes('../') || normalized.includes('..\\')) {
    return false;
  }
  return true;
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
   * Safely resolve path and prevent path traversal outside baseDir or project scope
   */
  resolveSafePath(userPath: string, projectId?: string): string {
    if (typeof userPath !== 'string') {
      throw new Error('File path must be a valid string.');
    }

    if (userPath.includes('\0')) {
      throw new Error('Security violation: null byte detected in path.');
    }

    // Optional project-level sandboxing
    let targetRelative = normalize(userPath);
    if (projectId) {
      const cleanProject = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
      if (!targetRelative.startsWith(`projects/${cleanProject}`)) {
        targetRelative = join('projects', cleanProject, targetRelative);
      }
    }

    if (!targetRelative.trim() || targetRelative.trim() === '.') {
      return this.baseDir;
    }

    const resolved = resolve(this.baseDir, targetRelative);

    // Canonicalize path boundaries
    if (!resolved.startsWith(this.baseDir)) {
      throw new Error(`Security restriction: Path traversal attempt blocked for "${userPath}".`);
    }

    // Verify realpath if file exists to prevent symlink bypass
    if (existsSync(resolved)) {
      try {
        const canonical = realpathSync(resolved);
        if (!canonical.startsWith(this.baseDir) && !canonical.startsWith(realpathSync(this.baseDir))) {
          throw new Error(`Security restriction: Symlink breakout attempt blocked for "${userPath}".`);
        }
      } catch (err: any) {
        if (err?.message?.includes('Security restriction')) throw err;
      }
    }

    return resolved;
  }

  /**
   * Validate archive (ZIP) entry path against Zip-Slip vulnerabilities
   */
  validateArchiveEntryPath(entryPath: string): boolean {
    if (!validateArchiveEntryPath(entryPath)) return false;
    const normalized = normalize(entryPath).replace(/^[/\\]+/, '');
    const target = resolve(this.baseDir, normalized);
    return target.startsWith(this.baseDir);
  }

  categorizeFile(path: string): FileCategory {
    const lower = path.toLowerCase().replace(/\\/g, '/');
    if (lower.includes('/sources/') || lower.startsWith('sources/')) return 'source';
    if (lower.includes('/deliverables/') || lower.startsWith('deliverables/') || lower.includes('/exports/')) return 'deliverable';
    if (lower.includes('/intermediate/') || lower.startsWith('intermediate/')) return 'intermediate';
    if (lower.endsWith('.zip') || lower.endsWith('.tar') || lower.endsWith('.gz')) return 'archive';
    return 'general';
  }

  readFile(userPath: string, projectId?: string): ReadFileResult {
    const fullPath = this.resolveSafePath(userPath, projectId);

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
        category: this.categorizeFile(rel),
      };
    }

    return {
      name: fullPath.split(/[/\\]/).pop() ?? userPath,
      relativePath: rel,
      content: rawContent,
      size: stat.size,
      truncated: false,
      category: this.categorizeFile(rel),
    };
  }

  writeFile(
    userPath: string,
    content: string,
    category: FileCategory = 'general',
    projectId?: string,
  ): WriteFileResult {
    const fullPath = this.resolveSafePath(userPath, projectId);
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
      category,
    };
  }

  /**
   * Versioned write: preserves a backup before overwriting existing files
   */
  writeVersionedFile(
    userPath: string,
    content: string,
    authorOrSummary?: string,
    changeSummaryOrCategory?: string | FileCategory,
    projectIdOrCategory?: string | FileCategory,
    categoryArg?: FileCategory,
  ): WriteFileResult {
    let category: FileCategory = 'intermediate';
    let projectId: string | undefined = undefined;

    if (categoryArg) {
      category = categoryArg;
    }
    if (typeof projectIdOrCategory === 'string') {
      if (['source', 'intermediate', 'deliverable', 'archive', 'general'].includes(projectIdOrCategory)) {
        category = projectIdOrCategory as FileCategory;
      } else {
        projectId = projectIdOrCategory;
      }
    }
    if (typeof changeSummaryOrCategory === 'string' && ['source', 'intermediate', 'deliverable', 'archive', 'general'].includes(changeSummaryOrCategory)) {
      category = changeSummaryOrCategory as FileCategory;
    }

    const fullPath = this.resolveSafePath(userPath, projectId);
    const baseName = fullPath.split(/[/\\]/).pop() || userPath;
    const verDir = join(dirname(fullPath), '.versions');
    let version = 1;

    if (existsSync(fullPath)) {
      try {
        const oldContent = readFileSync(fullPath, 'utf-8');
        if (!existsSync(verDir)) mkdirSync(verDir, { recursive: true });
        const existing = readdirSync(verDir).filter((f) => f.startsWith(baseName + '.') && f.endsWith('.bak'));
        version = existing.length + 2;
        const backupPath = join(verDir, `${baseName}.${Date.now()}.bak`);
        writeFileSync(backupPath, oldContent, 'utf-8');
      } catch (err) {
        console.warn('Could not archive prior file version:', err);
      }
    }

    try {
      if (!existsSync(verDir)) mkdirSync(verDir, { recursive: true });
      writeFileSync(join(verDir, `${baseName}.meta.json`), JSON.stringify({ category, version }), 'utf-8');
    } catch {}

    const res = this.writeFile(userPath, content, category, projectId);
    return {
      ...res,
      version,
      category,
    };
  }

  /**
   * Compare two versions of content and produce a structured diff
   */
  diffVersions(
    originalContentOrPath: string,
    newContentOrV1: string | number,
    v2?: number,
    projectId?: string,
  ): DocumentDiffResult & { diff: string; changes: { added: number; removed: number }; file?: string; v1?: number; v2?: number } {
    let originalContent = '';
    let newContent = '';
    let file = typeof originalContentOrPath === 'string' ? originalContentOrPath : 'document';
    let v1Num = typeof newContentOrV1 === 'number' ? newContentOrV1 : 1;
    let v2Num = typeof v2 === 'number' ? v2 : 2;

    if (typeof newContentOrV1 === 'number') {
      // It's a path diff request
      const fullPath = this.resolveSafePath(originalContentOrPath, projectId);
      if (existsSync(fullPath)) {
        newContent = readFileSync(fullPath, 'utf-8');
      }
      const verDir = join(dirname(fullPath), '.versions');
      const baseName = fullPath.split(/[/\\]/).pop() || originalContentOrPath;
      if (existsSync(verDir)) {
        const backups = readdirSync(verDir).filter((f) => f.startsWith(baseName + '.')).sort();
        if (backups.length > 0) {
          const targetBackup = backups[Math.min(v1Num - 1, backups.length - 1)];
          originalContent = readFileSync(join(verDir, targetBackup), 'utf-8');
        } else {
          originalContent = newContent;
        }
      } else {
        originalContent = newContent;
      }
    } else {
      originalContent = originalContentOrPath;
      newContent = newContentOrV1;
    }

    const origLines = originalContent.split('\n');
    const newLines = newContent.split('\n');

    const origSet = new Set(origLines);
    const newSet = new Set(newLines);

    const additions = newLines.filter((l) => !origSet.has(l) && l.trim().length > 0);
    const deletions = origLines.filter((l) => !newSet.has(l) && l.trim().length > 0);
    const totalChanges = additions.length + deletions.length;

    const diffLines: string[] = [];
    origLines.forEach((l) => {
      if (!newSet.has(l)) diffLines.push(`- ${l}`);
      else diffLines.push(`  ${l}`);
    });
    additions.forEach((l) => {
      diffLines.push(`+ ${l}`);
    });

    const summary =
      totalChanges === 0
        ? 'No differences detected between revisions.'
        : `Identified ${additions.length} additions and ${deletions.length} deletions across versions.`;

    return {
      additions,
      deletions,
      totalChanges,
      summary,
      diff: diffLines.join('\n'),
      changes: { added: additions.length, removed: deletions.length },
      file,
      v1: v1Num,
      v2: v2Num,
    };
  }

  listFiles(subDir: string = '', projectId?: string): FileInfo[] {
    const targetDir = this.resolveSafePath(subDir, projectId);
    if (!existsSync(targetDir)) return [];

    const results: FileInfo[] = [];

    const walk = (currentPath: string) => {
      const items = readdirSync(currentPath, { withFileTypes: true });
      for (const item of items) {
        if (item.name.startsWith('.') || item.name === 'node_modules') continue;
        const itemFullPath = join(currentPath, item.name);
        if (item.isDirectory()) {
          walk(itemFullPath);
        } else if (item.isFile()) {
          const stat = statSync(itemFullPath);
          const targetRoot = projectId ? this.resolveSafePath('', projectId) : this.baseDir;
          const rel = relative(targetRoot, itemFullPath).replace(/\\/g, '/');
          const verDir = join(dirname(itemFullPath), '.versions');
          let version = 1;
          let category = this.categorizeFile(rel);
          if (existsSync(verDir)) {
            const backups = readdirSync(verDir).filter((f) => f.startsWith(item.name + '.') && f.endsWith('.bak'));
            version = backups.length + 1;
            const metaPath = join(verDir, `${item.name}.meta.json`);
            if (existsSync(metaPath)) {
              try {
                const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
                if (meta.category) category = meta.category;
              } catch {}
            }
          }
          results.push({
            name: item.name,
            path: rel,
            relativePath: rel,
            size: stat.size,
            modifiedAt: stat.mtimeMs,
            updatedAt: stat.mtimeMs,
            extension: extname(item.name).toLowerCase(),
            category,
            version,
            projectId,
          });
        }
      }
    };

    walk(targetDir);
    return results;
  }

  deleteFile(userPath: string, projectId?: string): boolean {
    const fullPath = this.resolveSafePath(userPath, projectId);
    if (!existsSync(fullPath)) return false;
    unlinkSync(fullPath);
    return true;
  }

  exportDocument(
    name: string,
    content: string,
    format: 'markdown' | 'text' | 'json' = 'markdown',
    projectId?: string,
  ): WriteFileResult {
    let cleanName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const ext = format === 'json' ? '.json' : format === 'text' ? '.txt' : '.md';
    if (!cleanName.endsWith(ext)) {
      cleanName += ext;
    }

    const folder = projectId ? join('projects', projectId, 'deliverables') : 'exports';
    return this.writeFile(join(folder, cleanName), content, 'deliverable');
  }
}

export const globalFileWorkspace = new FileWorkspace();
