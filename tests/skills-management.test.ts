import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Store } from '../src/server/store.js';
import { createApp } from '../src/server/app.js';

describe('Skill Registry & Visual Skill Manager (Phase 7)', () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('automatically seeds initial high-value skills on initialization', () => {
    const skills = store.customSkills();
    expect(skills.length).toBeGreaterThanOrEqual(5);

    const ids = skills.map((s) => s.id);
    expect(ids).toContain('research-brief');
    expect(ids).toContain('code-review');
    expect(ids).toContain('document-draft');
    expect(ids).toContain('study-assistant');
    expect(ids).toContain('project-planner');

    const codeReview = skills.find((s) => s.id === 'code-review');
    expect(codeReview?.category).toBe('coding');
    expect(codeReview?.enabled).toBe(true);
    expect(codeReview?.instructions).toContain('Analyze the provided code');
  });

  it('allows creating, updating, toggling, and deleting custom skills', () => {
    const created = store.saveCustomSkill({
      name: 'SQL Query Optimizer',
      description: 'Analyze and rewrite slow SQL queries',
      version: '1.0.0',
      instructions: 'Review execution plan, suggest indexes and join strategies.',
      category: 'coding',
      requiredPermissions: ['basic', 'code'],
      allowedTools: ['calculate'],
      timeoutMs: 25000,
      enabled: true,
    });

    expect(created.id).toBeDefined();
    expect(created.name).toBe('SQL Query Optimizer');
    expect(created.enabled).toBe(true);

    // Toggle skill off
    const toggledOff = store.toggleCustomSkill(created.id, false);
    expect(toggledOff.enabled).toBe(false);

    // Toggle skill on
    const toggledOn = store.toggleCustomSkill(created.id, true);
    expect(toggledOn.enabled).toBe(true);

    // Update skill
    const updated = store.updateCustomSkill(created.id, {
      description: 'Analyze, benchmark, and rewrite slow SQL queries with indexes',
    });
    expect(updated.description).toContain('benchmark');

    // Delete skill
    store.deleteCustomSkill(created.id);
    const remaining = store.customSkills();
    expect(remaining.some((s) => s.id === created.id)).toBe(false);
  });

  it('exposes full skill management via REST API', async () => {
    const app = createApp({
      store,
      runner: {} as any,
      config: { mode: 'live' } as any,
    });

    // 1. GET /api/skills
    const listRes = await app.request('/api/skills');
    expect(listRes.status).toBe(200);
    const listData = (await listRes.json()) as {
      builtin: Array<{ id: string }>;
      custom: Array<{ id: string }>;
    };
    expect(listData.builtin.length).toBeGreaterThan(0);
    expect(listData.custom.length).toBeGreaterThanOrEqual(5);

    // 2. POST /api/skills
    const createRes = await app.request('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'API Security Auditor',
        description: 'Verify OAuth2 and JWT token scopes',
        instructions: 'Check token expiry, signatures, and least-privilege role bindings.',
        category: 'coding',
        allowedTools: ['analyze_text'],
      }),
    });
    expect(createRes.status).toBe(201);
    const createdSkill = (await createRes.json()) as { id: string; name: string };
    expect(createdSkill.name).toBe('API Security Auditor');

    // 3. POST /api/skills/:id/duplicate
    const dupRes = await app.request(`/api/skills/${createdSkill.id}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(dupRes.status).toBe(201);
    const duplicated = (await dupRes.json()) as { id: string; name: string };
    expect(duplicated.name).toBe('API Security Auditor (Copy)');

    // 4. POST /api/skills/:id/toggle
    const toggleRes = await app.request(`/api/skills/${createdSkill.id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    expect(toggleRes.status).toBe(200);
    const toggled = (await toggleRes.json()) as { enabled: boolean };
    expect(toggled.enabled).toBe(false);

    // 5. DELETE /api/skills/:id
    const delRes = await app.request(`/api/skills/${createdSkill.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(delRes.status).toBe(200);
  });
});
