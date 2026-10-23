import { describe, it, expect, beforeEach } from 'vitest';
import { FileWorkspace } from '../src/server/files/file-workspace.js';
import { Store } from '../src/server/store.js';
import { createApp } from '../src/server/app.js';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, existsSync } from 'node:fs';

describe('OpenDots Smart Tools Menu, File Uploads, Library & Integrations', () => {
  let tempDir: string;
  let workspace: FileWorkspace;
  let store: Store;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    tempDir = join(tmpdir(), `opendots_tools_test_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    workspace = new FileWorkspace(tempDir);
    store = new Store(':memory:');
    app = createApp({
      store,
      runner: { abortAll: () => {}, abort: () => {} } as any,
      config: {} as any,
    });
  });

  describe('FileWorkspace Buffer Operations & Security', () => {
    it('writes and reads binary buffers with exact byte preservation', () => {
      const samplePngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
      const res = workspace.writeBuffer('uploads/sample.png', samplePngBytes, 'general');

      expect(res.name).toBe('sample.png');
      expect(res.size).toBe(samplePngBytes.length);

      const readBack = workspace.readBuffer('uploads/sample.png');
      expect(readBack.size).toBe(samplePngBytes.length);
      expect(Buffer.compare(readBack.buffer, samplePngBytes)).toBe(0);
    });

    it('rejects disallowed executable file types', () => {
      const fakeExe = Buffer.from('MZ fake binary executable');
      expect(() => {
        workspace.writeBuffer('malicious.exe', fakeExe);
      }).toThrow(/Security restriction/);

      expect(() => {
        workspace.writeBuffer('script.bat', Buffer.from('echo bad'));
      }).toThrow(/Security restriction/);
    });

    it('blocks directory traversal attempts in buffer operations', () => {
      const payload = Buffer.from('test');
      expect(() => {
        workspace.writeBuffer('../../../evil.txt', payload);
      }).toThrow(/Path traversal attempt blocked/);

      expect(() => {
        workspace.readBuffer('../../etc/shadow');
      }).toThrow(/Path traversal attempt blocked/);
    });
  });

  describe('File Upload API (/api/files/upload)', () => {
    it('uploads a base64 canvas sketch and returns metadata with previewUrl', async () => {
      // 1x1 transparent PNG data URL
      const dataUrl =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const res = await app.request('/api/files/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'test_sketch.png',
          content: dataUrl,
          mimeType: 'image/png',
          category: 'sketch',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.file).toBeDefined();
      expect(json.file.name).toBe('test_sketch.png');
      expect(json.file.type).toBe('sketch');
      expect(json.file.previewUrl).toContain('/api/workspace-files/raw?filePath=');
      expect(json.file.size).toBeGreaterThan(0);
    });

    it('uploads text/document file and extracts snippet for prompt context', async () => {
      const markdownDoc = '# Technical Architecture\nThis document describes the OpenDots Tools menu specification.';

      const res = await app.request('/api/files/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'spec.md',
          content: markdownDoc,
          mimeType: 'text/markdown',
          category: 'document',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.file.name).toBe('spec.md');
      expect(json.file.type).toBe('document');
      expect(json.file.textSnippet).toContain('Technical Architecture');
    });

    it('rejects files exceeding the 10MB limit', async () => {
      const hugeBuffer = Buffer.alloc(11 * 1024 * 1024, 'a');
      const res = await app.request('/api/files/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'huge.txt',
          content: hugeBuffer.toString('base64'),
          isBase64: true,
        }),
      });

      // 413 Payload Too Large
      expect([413, 500]).toContain(res.status);
    });
  });

  describe('File Library API (/api/files/library)', () => {
    it('returns filtered and searchable library files', async () => {
      // Seed a sketch and a doc
      await app.request('/api/files/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'architecture_diagram.png',
          content: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          mimeType: 'image/png',
          category: 'sketch',
        }),
      });

      await app.request('/api/files/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'budget_analysis.csv',
          content: 'item,cost\nServer,0\nGemini,0',
          mimeType: 'text/csv',
          category: 'general',
        }),
      });

      // Query all
      const resAll = await app.request('/api/files/library');
      expect(resAll.status).toBe(200);
      const dataAll = await resAll.json();
      expect(dataAll.files.length).toBeGreaterThanOrEqual(2);

      // Query with search filter
      const resSearch = await app.request('/api/files/library?query=architecture');
      const dataSearch = await resSearch.json();
      expect(dataSearch.files.some((f: any) => f.name.includes('architecture'))).toBe(true);

      // Query with type filter
      const resType = await app.request('/api/files/library?type=sketch');
      const dataType = await resType.json();
      expect(dataType.files.every((f: any) => f.type === 'sketch')).toBe(true);
    });
  });

  describe('Integrations & Connectors (GitHub & OpenAI Platform)', () => {
    it('seeds and returns github and openai connectors', () => {
      const connectors = store.connectors('opendots-owner');
      const gh = connectors.find((c) => c.type === 'github');
      const oai = connectors.find((c) => c.type === 'openai');

      expect(gh).toBeDefined();
      expect(gh?.name).toContain('GitHub');
      expect(oai).toBeDefined();
      expect(oai?.name).toContain('OpenAI');
    });

    it('tests GitHub connector accurately and reports configuration status', () => {
      const testBefore = store.testConnector('github', 'opendots-owner');
      expect(testBefore.success).toBe(false);
      expect(testBefore.message).toContain('GitHub token');

      // Update with token
      store.updateConnector('github', {
        status: 'connected',
        config: { apiKey: 'ghp_sampleToken12345' },
      });

      const testAfter = store.testConnector('github', 'opendots-owner');
      expect(testAfter.success).toBe(true);
      expect(testAfter.message).toContain('GitHub integration verified');
    });

    it('tests OpenAI Platform connector accurately and reports configuration status', () => {
      const testBefore = store.testConnector('openai', 'opendots-owner');
      expect(testBefore.success).toBe(false);
      expect(testBefore.message).toContain('OpenAI API key');

      // Update with key
      store.updateConnector('openai', {
        status: 'connected',
        config: { apiKey: 'sk-proj-sampleOpenAiKey' },
      });

      const testAfter = store.testConnector('openai', 'opendots-owner');
      expect(testAfter.success).toBe(true);
      expect(testAfter.message).toContain('OpenAI Platform API key configured');
    });
  });

  describe('Settings API & Theme Configuration', () => {
    it('successfully accepts settings updates including freeOnlyMode and theme without invalid settings error', async () => {
      const res = await app.request('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          researchAllowed: true,
          memoryAllowed: true,
          appsAllowed: false,
          freeOnlyMode: true,
          theme: 'light',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.researchAllowed).toBe(true);
      expect(json.freeOnlyMode).toBe(true);
    });
  });
});
