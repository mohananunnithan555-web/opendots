import { describe, expect, it } from 'vitest';
import { Store } from '../src/server/store.js';
import { memoryTools } from '../src/server/memory-tools.js';
import { containsSensitiveSecret } from '../src/server/memory-types.js';

describe('Persistent Categorized Memory (Phase 3)', () => {
  it('stores and retrieves memories by category', () => {
    const store = new Store(':memory:');
    const pref = store.saveMemoryV2({
      text: 'User prefers concise summaries with bullet points',
      category: 'preference',
    });
    expect(pref.category).toBe('preference');
    expect(pref.text).toContain('concise summaries');

    const proj = store.saveMemoryV2({
      text: 'Working on upgrading OpenDots personal AI agent',
      category: 'project',
    });
    expect(proj.category).toBe('project');

    // Retrieve by category
    const preferences = store.memoriesV2({ category: 'preference' });
    expect(preferences).toHaveLength(1);
    expect(preferences[0].text).toContain('concise summaries');

    const projects = store.memoriesV2({ category: 'project' });
    expect(projects).toHaveLength(1);
    expect(projects[0].text).toContain('upgrading OpenDots');
    store.close();
  });

  it('preserves legacy store.memories() backward-compatibility', () => {
    const store = new Store(':memory:');
    store.saveMemory('Legacy format memory 1');
    store.saveMemoryV2({ text: 'V2 format memory 2', category: 'project' });

    const legacyList = store.memories();
    expect(legacyList).toHaveLength(2);
    expect(legacyList.map((m) => m.text)).toContain('Legacy format memory 1');
    expect(legacyList.map((m) => m.text)).toContain('V2 format memory 2');
    store.close();
  });

  it('rejects sensitive passwords and API keys from memory', () => {
    const store = new Store(':memory:');

    expect(containsSensitiveSecret('My password is secret12345')).toBe(true);
    expect(
      containsSensitiveSecret('Here is ' + 'sk_live_' + '1234567890abcdef12345678'),
    ).toBe(true);

    expect(() =>
      store.saveMemoryV2({
        text: 'Save my password: supersecretpassword123',
        category: 'preference',
      }),
    ).toThrow(/Security policy/);

    expect(() =>
      store.saveMemoryV2({
        text: 'API key: ' + 'sk_live_' + '1234567890abcdef12345678',
        category: 'project',
      }),
    ).toThrow(/Security policy/);

    store.close();
  });

  it('searches memories by keyword and category', () => {
    const store = new Store(':memory:');
    store.saveMemoryV2({ text: 'Prefers TypeScript over Python', category: 'preference' });
    store.saveMemoryV2({ text: 'Prefers dark theme in UI', category: 'preference' });
    store.saveMemoryV2({ text: 'Python backend prototype', category: 'project' });

    const tsMatches = store.searchMemories('TypeScript');
    expect(tsMatches).toHaveLength(1);
    expect(tsMatches[0].text).toContain('TypeScript');

    // Search scoped to category
    const pyPref = store.searchMemories('Python', 'preference');
    expect(pyPref).toHaveLength(1);
    expect(pyPref[0].category).toBe('preference');

    const pyProj = store.searchMemories('Python', 'project');
    expect(pyProj).toHaveLength(1);
    expect(pyProj[0].category).toBe('project');

    store.close();
  });

  it('supports forgetting individual memories and entire categories', () => {
    const store = new Store(':memory:');
    const m1 = store.saveMemoryV2({ text: 'Temporary context item 1', category: 'task_context' });
    const m2 = store.saveMemoryV2({ text: 'Temporary context item 2', category: 'task_context' });
    store.saveMemoryV2({ text: 'Important preference', category: 'preference' });

    // Forget single memory
    const removed = store.forgetMemory(m1.id);
    expect(removed).toBe(true);
    expect(store.memoriesV2({ category: 'task_context' })).toHaveLength(1);

    // Clear entire category
    const cleared = store.clearMemoriesCategory('task_context');
    expect(cleared).toBe(1);
    expect(store.memoriesV2({ category: 'task_context' })).toHaveLength(0);
    // Preference remains untouched
    expect(store.memoriesV2({ category: 'preference' })).toHaveLength(1);

    store.close();
  });

  it('enforces multi-user isolation on memories', () => {
    const store = new Store(':memory:');
    store.saveMemoryV2({ text: 'User A note', ownerId: 'user-a' });
    store.saveMemoryV2({ text: 'User B note', ownerId: 'user-b' });

    expect(store.memoriesV2(undefined, 'user-a')).toHaveLength(1);
    expect(store.memoriesV2(undefined, 'user-a')[0].text).toBe('User A note');

    expect(store.memoriesV2(undefined, 'user-b')).toHaveLength(1);
    expect(store.memoriesV2(undefined, 'user-b')[0].text).toBe('User B note');

    store.close();
  });

  it('executes agent memory tools correctly', async () => {
    const store = new Store(':memory:');
    const tools = memoryTools(store, 'test-owner');
    const rememberTool = tools.find((t) => t.name === 'remember_info')!;
    const searchTool = tools.find((t) => t.name === 'search_memory')!;
    const forgetTool = tools.find((t) => t.name === 'forget_info')!;

    // Remember info
    const remResult: any = await (rememberTool.execute as any)({
      text: 'User likes dark roast coffee',
      category: 'preference',
    });
    expect(remResult.success).toBe(true);
    expect(remResult.message).toContain('Remembered');

    // Search memory
    const searchResult: any = await (searchTool.execute as any)({ query: 'coffee' });
    expect(searchResult.success).toBe(true);
    expect(searchResult.found).toBe(true);
    expect(searchResult.results[0].text).toContain('dark roast coffee');

    // Forget info by query
    const forgetResult: any = await (forgetTool.execute as any)({ query: 'coffee' });
    expect(forgetResult.success).toBe(true);
    expect(forgetResult.message).toContain('Forgot 1 memories');

    store.close();
  });
});
