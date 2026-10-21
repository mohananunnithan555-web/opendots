import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkspaceStore } from '../src/server/workspace.js';
import { createApp } from '../src/server/app.js';
import { Store } from '../src/server/store.js';
import { Platform } from '../src/server/platform.js';

describe('Project Workspaces & Deliverables (Phase 6)', () => {
  let workspace: WorkspaceStore;
  let store: Store;

  beforeEach(() => {
    store = new Store(':memory:');
    workspace = new WorkspaceStore(':memory:', 'owner-123');
  });

  afterEach(() => {
    workspace.close();
    store.close();
  });

  it('creates project spaces with goal, instructions, and active status', () => {
    const project = workspace.createSpace(
      'Deep Learning Agent',
      'Research and design neural agents',
      'Build a production-ready reasoning agent',
      'Always include benchmarks and verify citations',
    );

    expect(project.id).toBeDefined();
    expect(project.name).toBe('Deep Learning Agent');
    expect(project.goal).toBe('Build a production-ready reasoning agent');
    expect(project.instructions).toBe(
      'Always include benchmarks and verify citations',
    );
    expect(project.status).toBe('active');

    const allSpaces = workspace.spaces();
    const found = allSpaces.find((s) => s.id === project.id);
    expect(found).toBeDefined();
    expect(found?.goal).toBe('Build a production-ready reasoning agent');
  });

  it('updates project space metadata and supports archiving', () => {
    const project = workspace.createSpace(
      'E-commerce Redesign',
      'Q4 deliverables',
    );

    const updated = workspace.updateSpace(project.id, {
      goal: 'Double conversion rate',
      instructions: 'Target mobile devices first',
      status: 'archived',
    });

    expect(updated.goal).toBe('Double conversion rate');
    expect(updated.instructions).toBe('Target mobile devices first');
    expect(updated.status).toBe('archived');
    expect(updated.archivedAt).toBeGreaterThan(0);
  });

  it('prevents deleting the last remaining space in a workspace', () => {
    const spaces = workspace.spaces();
    expect(spaces.length).toBeGreaterThan(0);

    // If there is only one space, deleteSpace should throw
    if (spaces.length === 1) {
      expect(() => workspace.deleteSpace(spaces[0].id)).toThrow(
        /Cannot delete the last remaining/,
      );
    } else {
      // Create a new space and delete it
      const temp = workspace.createSpace('Temporary', 'Delete me');
      workspace.deleteSpace(temp.id);
      expect(workspace.spaces().some((s) => s.id === temp.id)).toBe(false);
    }
  });

  it('exports bundled project deliverables with markdown synthesis', async () => {
    const project = workspace.createSpace(
      'Research Report 2026',
      'AI Trends Analysis',
      'Analyze multimodal capabilities',
      'Cite all academic papers',
    );

    // Create pages in this project space
    workspace.pages.create(project.id, {
      title: 'Executive Summary',
      content: '# Summary\n\nMultimodal models achieved 98% accuracy in 2026.',
      parentId: null,
    });

    workspace.pages.create(project.id, {
      title: 'Architecture Overview',
      content: '## Architecture\n\nHybrid transformer-state-space models dominate.',
      parentId: null,
    });

    const platform = new Platform(store, workspace, {
      model: 'gemini-3.8-flash',
    } as any);
    const app = createApp({
      store,
      runner: {} as any,
      platform,
      config: { mode: 'live' } as any,
    });

    const res = await app.request(`/api/spaces/${project.id}/export`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      space: { name: string };
      pageCount: number;
      markdown: string;
    };

    expect(data.space.name).toBe('Research Report 2026');
    expect(data.pageCount).toBe(2);
    expect(data.markdown).toContain('# Project Deliverable: Research Report 2026');
    expect(data.markdown).toContain('**Goal:** Analyze multimodal capabilities');
    expect(data.markdown).toContain('## Executive Summary');
    expect(data.markdown).toContain('## Architecture Overview');
  });

  it('patches and deletes spaces via REST API', async () => {
    const platform = new Platform(store, workspace, {
      model: 'gemini-3.8-flash',
    } as any);
    const app = createApp({
      store,
      runner: {} as any,
      platform,
      config: { mode: 'live' } as any,
    });

    // Create via POST
    const createRes = await app.request('/api/spaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Sprint Alpha',
        description: 'First engineering sprint',
        goal: 'Complete MVP',
        instructions: 'Follow TDD',
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string; goal: string };
    expect(created.goal).toBe('Complete MVP');

    // Patch via PATCH
    const patchRes = await app.request(`/api/spaces/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal: 'Complete MVP and deploy to staging',
        status: 'completed',
      }),
    });
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as { goal: string; status: string };
    expect(patched.goal).toBe('Complete MVP and deploy to staging');
    expect(patched.status).toBe('completed');

    // Delete via DELETE
    const deleteRes = await app.request(`/api/spaces/${created.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(deleteRes.status).toBe(200);
    const deletedBody = (await deleteRes.json()) as { ok: boolean };
    expect(deletedBody.ok).toBe(true);
  });
});
