import { describe, expect, it } from 'vitest';
import { rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FileWorkspace } from '../src/server/files/file-workspace.js';
import {
  readWorkspaceFileTool,
  writeWorkspaceFileTool,
  listWorkspaceFilesTool,
  exportDocumentTool,
} from '../src/server/files/file-tools.js';
import { executeSafeTool } from '../src/server/tools/open-dots-tool.js';

describe('Secure File Workspace & Document Processing (Phase 8)', () => {
  const testDir = resolve('./data/test_workspace_files');

  it('safely writes and reads files within the sandbox', () => {
    const ws = new FileWorkspace(testDir);

    const written = ws.writeFile('notes/meeting.md', '# Meeting Notes\nDiscussion about architecture.');
    expect(written.relativePath).toBe('notes/meeting.md');
    expect(written.size).toBeGreaterThan(0);

    const read = ws.readFile('notes/meeting.md');
    expect(read.content).toContain('Discussion about architecture.');
    expect(read.relativePath).toBe('notes/meeting.md');

    // Clean up
    rmSync(testDir, { recursive: true, force: true });
  });

  it('blocks path traversal attacks attempting to escape sandbox', () => {
    const ws = new FileWorkspace(testDir);

    expect(() => ws.resolveSafePath('../../etc/passwd')).toThrow(/traversal attempt blocked/);
    expect(() => ws.resolveSafePath('..\\..\\Windows\\System32\\cmd.exe')).toThrow(/traversal attempt blocked/);
    expect(() => ws.resolveSafePath('notes/../../../config.json')).toThrow(/traversal attempt blocked/);
    expect(() => ws.resolveSafePath('notes/file\0.txt')).toThrow(/null byte detected/);

    rmSync(testDir, { recursive: true, force: true });
  });

  it('blocks creation of executable or script files', () => {
    const ws = new FileWorkspace(testDir);

    expect(() => ws.writeFile('malicious.exe', 'binary')).toThrow(/Creating executable file types/);
    expect(() => ws.writeFile('script.bat', 'echo off')).toThrow(/Creating executable file types/);
    expect(() => ws.writeFile('run.ps1', 'Get-Process')).toThrow(/Creating executable file types/);
    expect(() => ws.writeFile('shell.sh', '#!/bin/bash')).toThrow(/Creating executable file types/);

    rmSync(testDir, { recursive: true, force: true });
  });

  it('lists files and metadata correctly', () => {
    const ws = new FileWorkspace(testDir);
    ws.writeFile('doc1.md', '# Title');
    ws.writeFile('sub/doc2.json', '{"key": "value"}');

    const files = ws.listFiles();
    expect(files).toHaveLength(2);

    const rels = files.map((f) => f.relativePath);
    expect(rels).toContain('doc1.md');
    expect(rels).toContain('sub/doc2.json');

    rmSync(testDir, { recursive: true, force: true });
  });

  it('exports documents to exports directory', () => {
    const ws = new FileWorkspace(testDir);
    const exported = ws.exportDocument('Research Summary Report', '# Report\nAll findings.', 'markdown');

    expect(exported.relativePath).toBe('exports/Research_Summary_Report.md');
    expect(ws.readFile('exports/Research_Summary_Report.md').content).toContain('All findings.');

    rmSync(testDir, { recursive: true, force: true });
  });

  it('safely deletes files', () => {
    const ws = new FileWorkspace(testDir);
    ws.writeFile('temp.txt', 'temporary');

    expect(ws.deleteFile('temp.txt')).toBe(true);
    expect(ws.deleteFile('temp.txt')).toBe(false); // second time returns false

    rmSync(testDir, { recursive: true, force: true });
  });

  it('executes file tools via the unified tool-calling framework', async () => {
    const writeRes = await executeSafeTool(
      writeWorkspaceFileTool,
      {
        path: 'reports/summary.txt',
        content: 'Autonomous analysis completed successfully.',
      },
      { userPermissions: ['basic'] },
    );

    expect(writeRes.success).toBe(true);

    const readRes = await executeSafeTool(
      readWorkspaceFileTool,
      { path: 'reports/summary.txt' },
      { userPermissions: ['basic'] },
    );

    expect(readRes.success).toBe(true);
    expect(readRes.data?.content).toContain('Autonomous analysis completed');
  });
});
