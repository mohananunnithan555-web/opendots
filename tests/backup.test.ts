import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabaseBackup,
  listDatabaseBackups,
  restoreDatabaseBackup,
  defaultBackupDirectory,
} from '../src/server/backup.js';

describe('Database Backup & Restore Protocol', () => {
  let tempDir: string;
  let testDbPath: string;
  let testBackupDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendots-backup-test-'));
    testDbPath = join(tempDir, 'test-db.sqlite');
    testBackupDir = join(tempDir, 'backups');
    writeFileSync(testDbPath, 'SQLITE_HEADER_DUMMY_DATA_VERSION_1');
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('handles :memory: database without throwing', () => {
    const result = createDatabaseBackup(':memory:');
    expect(result.success).toBe(true);
    expect(result.backupPath).toBe(':memory:backup');
  });

  it('throws an error if the database file does not exist', () => {
    const missingDb = join(tempDir, 'missing.sqlite');
    expect(() => createDatabaseBackup(missingDb, testBackupDir)).toThrow(
      /Database file does not exist/,
    );
  });

  it('creates a physical snapshot backup in the target backup directory', () => {
    const result = createDatabaseBackup(testDbPath, testBackupDir);
    expect(result.success).toBe(true);
    expect(existsSync(result.backupPath)).toBe(true);

    const backups = listDatabaseBackups(testBackupDir);
    expect(backups).toHaveLength(1);
    expect(backups[0].path).toBe(result.backupPath);
    expect(backups[0].sizeBytes).toBeGreaterThan(0);
  });

  it('safely copies -wal companion file if one exists', () => {
    const walPath = `${testDbPath}-wal`;
    writeFileSync(walPath, 'WAL_DATA_DUMMY');

    const result = createDatabaseBackup(testDbPath, testBackupDir);
    expect(existsSync(result.backupPath)).toBe(true);
    expect(existsSync(`${result.backupPath}-wal`)).toBe(true);
  });

  it('successfully restores a database from a backup snapshot', () => {
    const backup = createDatabaseBackup(testDbPath, testBackupDir);

    // Corrupt or modify original DB
    writeFileSync(testDbPath, 'MODIFIED_CORRUPTED_DATA');
    expect(readFileSync(testDbPath, 'utf8')).toBe('MODIFIED_CORRUPTED_DATA');

    // Restore from backup
    const restoreResult = restoreDatabaseBackup(backup.backupPath, testDbPath);
    expect(restoreResult.success).toBe(true);
    expect(readFileSync(testDbPath, 'utf8')).toBe(
      'SQLITE_HEADER_DUMMY_DATA_VERSION_1',
    );
  });

  it('determines the default backup directory relative to the db file', () => {
    const dir = defaultBackupDirectory(testDbPath);
    expect(dir).toContain('backups');
  });
});
