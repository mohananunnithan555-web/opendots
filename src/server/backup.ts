import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

export interface BackupInfo {
  name: string;
  path: string;
  sizeBytes: number;
  createdAt: number;
}

export interface BackupResult {
  success: boolean;
  backupPath: string;
  timestamp: number;
}

export function defaultBackupDirectory(dbPath: string): string {
  if (dbPath === ':memory:') {
    return resolve('data/backups');
  }
  return join(dirname(resolve(dbPath)), 'backups');
}

/**
 * Creates a timestamped snapshot of the SQLite database file.
 * Safely handles both in-memory test databases (no-op) and physical SQLite files.
 */
export function createDatabaseBackup(
  dbPath: string,
  backupDir?: string,
): BackupResult {
  const timestamp = Date.now();
  if (dbPath === ':memory:') {
    return {
      success: true,
      backupPath: ':memory:backup',
      timestamp,
    };
  }

  const resolvedDbPath = resolve(dbPath);
  if (!existsSync(resolvedDbPath)) {
    throw new Error(`Database file does not exist at: ${resolvedDbPath}`);
  }

  const targetDir = backupDir ? resolve(backupDir) : defaultBackupDirectory(resolvedDbPath);
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const dateStr = new Date(timestamp).toISOString().replace(/[:.]/g, '-');
  const baseName = basename(resolvedDbPath, '.sqlite');
  const backupFileName = `${baseName}-backup-${dateStr}.sqlite`;
  const targetBackupPath = join(targetDir, backupFileName);

  // Copy the main database file
  copyFileSync(resolvedDbPath, targetBackupPath);

  // If a WAL file exists, also copy it for recovery integrity
  const walPath = `${resolvedDbPath}-wal`;
  if (existsSync(walPath)) {
    copyFileSync(walPath, `${targetBackupPath}-wal`);
  }

  return {
    success: true,
    backupPath: targetBackupPath,
    timestamp,
  };
}

/**
 * Lists all existing database backups ordered from newest to oldest.
 */
export function listDatabaseBackups(backupDir: string): BackupInfo[] {
  const resolvedDir = resolve(backupDir);
  if (!existsSync(resolvedDir)) {
    return [];
  }

  const entries = readdirSync(resolvedDir);
  const backups: BackupInfo[] = [];

  for (const entry of entries) {
    if (entry.endsWith('.sqlite') && !entry.endsWith('-wal')) {
      const fullPath = join(resolvedDir, entry);
      try {
        const stats = statSync(fullPath);
        backups.push({
          name: entry,
          path: fullPath,
          sizeBytes: stats.size,
          createdAt: stats.mtimeMs,
        });
      } catch {
        // Skip entry if stat fails
      }
    }
  }

  return backups.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Restores a database from a specified backup path to the target database location.
 */
export function restoreDatabaseBackup(
  backupPath: string,
  targetDbPath: string,
): { success: boolean } {
  const resolvedBackup = resolve(backupPath);
  if (!existsSync(resolvedBackup)) {
    throw new Error(`Backup file not found at: ${resolvedBackup}`);
  }

  const resolvedTarget = resolve(targetDbPath);
  const targetDir = dirname(resolvedTarget);
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  copyFileSync(resolvedBackup, resolvedTarget);

  const backupWal = `${resolvedBackup}-wal`;
  const targetWal = `${resolvedTarget}-wal`;
  if (existsSync(backupWal)) {
    copyFileSync(backupWal, targetWal);
  }

  return { success: true };
}
