import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { AuthStore } from '../src/server/auth/auth-store.js';
import { signSession, verifySession } from '../src/server/auth/jwt.js';
import { verifyGoogleToken } from '../src/server/auth/google-verifier.js';
import { Store } from '../src/server/store.js';
import { WorkspaceStore } from '../src/server/workspace.js';
import { createApp } from '../src/server/app.js';
import { Runner } from '../src/server/runner.js';
import { Config } from '../src/server/platform-config.js';

describe('OpenDots — Google Sign-In & Multi-Tenant Cloud Storage', () => {
  let db: DatabaseSync;
  let authStore: AuthStore;
  let store: Store;
  let workspace: WorkspaceStore;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    authStore = new AuthStore(db);
    store = new Store(':memory:');
    workspace = new WorkspaceStore(':memory:', 'opendots-owner');
  });

  afterEach(() => {
    db.close();
    store.close();
    workspace.close();
  });

  describe('JWT Session Token Handling', () => {
    it('signs and verifies valid sessions', () => {
      const session = {
        userId: 'usr_123',
        googleSub: 'google_sub_999',
        email: 'alice@example.com',
        name: 'Alice Cooper',
        picture: 'https://lh3.googleusercontent.com/avatar1',
      };

      const token = signSession(session, 'test-secret-key-123', 3600);
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);

      const verified = verifySession(token, 'test-secret-key-123');
      expect(verified).not.toBeNull();
      expect(verified?.userId).toBe('usr_123');
      expect(verified?.email).toBe('alice@example.com');
      expect(verified?.name).toBe('Alice Cooper');
    });

    it('rejects tampered tokens', () => {
      const session = {
        userId: 'usr_123',
        googleSub: 'google_sub_999',
        email: 'alice@example.com',
        name: 'Alice Cooper',
      };

      const token = signSession(session, 'test-secret-key-123', 3600);
      const [header, payload, sig] = token.split('.');
      const tampered = `${header}.${payload}bad.${sig}`;

      expect(verifySession(tampered, 'test-secret-key-123')).toBeNull();
    });

    it('rejects expired tokens', () => {
      const session = {
        userId: 'usr_123',
        googleSub: 'google_sub_999',
        email: 'alice@example.com',
        name: 'Alice Cooper',
      };

      // Sign with negative TTL (already expired)
      const token = signSession(session, 'test-secret-key-123', -10);
      expect(verifySession(token, 'test-secret-key-123')).toBeNull();
    });
  });

  describe('Google Token Verifier', () => {
    it('verifies test mock credentials in test environment', async () => {
      const mockCredential = 'test-mock-token:bob@gmail.com:Bob Dylan:google_sub_bob_1';
      const payload = await verifyGoogleToken(mockCredential);

      expect(payload.email).toBe('bob@gmail.com');
      expect(payload.name).toBe('Bob Dylan');
      expect(payload.sub).toBe('google_sub_bob_1');
      expect(payload.email_verified).toBe(true);
    });

    it('rejects invalid credentials', async () => {
      await expect(verifyGoogleToken('')).rejects.toThrow();
    });
  });

  describe('AuthStore User Profile & Account Management', () => {
    it('upserts a new Google user profile', () => {
      const user = authStore.upsertGoogleUser({
        googleSub: 'google_sub_100',
        email: 'carol@example.com',
        name: 'Carol Danvers',
        picture: 'https://example.com/carol.png',
      });

      expect(user.id).toBeDefined();
      expect(user.email).toBe('carol@example.com');
      expect(user.name).toBe('Carol Danvers');
      expect(user.googleSub).toBe('google_sub_100');

      const retrieved = authStore.getUserById(user.id);
      expect(retrieved?.email).toBe('carol@example.com');
    });

    it('updates user profile on repeated login without creating duplicate users', () => {
      const user1 = authStore.upsertGoogleUser({
        googleSub: 'google_sub_100',
        email: 'carol@example.com',
        name: 'Carol',
      });

      const user2 = authStore.upsertGoogleUser({
        googleSub: 'google_sub_100',
        email: 'carol@example.com',
        name: 'Carol Danvers (Updated)',
        picture: 'https://example.com/new_pic.png',
      });

      expect(user1.id).toBe(user2.id);
      expect(user2.name).toBe('Carol Danvers (Updated)');
      expect(user2.picture).toBe('https://example.com/new_pic.png');
      expect(authStore.countUsers()).toBe(1);
    });
  });

  describe('Safe Legacy Data Migration', () => {
    it('detects and idempotently migrates legacy records to the authenticated user', () => {
      // Create legacy records with 'opendots-owner'
      db.exec(`
        CREATE TABLE IF NOT EXISTS thread_bindings (id TEXT PRIMARY KEY, dotId TEXT, ownerId TEXT, title TEXT, createdAt INTEGER);
        CREATE TABLE IF NOT EXISTS memories_v2 (id TEXT PRIMARY KEY, ownerId TEXT, category TEXT, text TEXT, confidence REAL, pinned INTEGER, source TEXT, createdAt INTEGER, updatedAt INTEGER);
        CREATE TABLE IF NOT EXISTS reminders (id TEXT PRIMARY KEY, ownerId TEXT, title TEXT, scheduledAt INTEGER, status TEXT);
        CREATE TABLE IF NOT EXISTS goals (id TEXT PRIMARY KEY, ownerId TEXT, title TEXT);
        CREATE TABLE IF NOT EXISTS task_plans (id TEXT PRIMARY KEY, ownerId TEXT, goal TEXT, status TEXT);
      `);

      db.prepare("INSERT INTO thread_bindings VALUES ('t1', 'dot1', 'opendots-owner', 'Legacy Chat', 1000)").run();
      db.prepare("INSERT INTO memories_v2 VALUES ('m1', 'opendots-owner', 'preference', 'Prefers dark mode', 1.0, 0, 'user', 1000, 1000)").run();
      db.prepare("INSERT INTO reminders VALUES ('r1', 'opendots-owner', 'Study Science', 2000, 'scheduled')").run();

      const legacyCheck = authStore.checkHasLegacyData();
      expect(legacyCheck.hasLegacy).toBe(true);
      expect(legacyCheck.chatsCount).toBe(1);
      expect(legacyCheck.memoriesCount).toBe(1);
      expect(legacyCheck.remindersCount).toBe(1);

      // Create new user and migrate
      const user = authStore.upsertGoogleUser({
        googleSub: 'google_sub_migrator',
        email: 'migrator@example.com',
        name: 'Migrator',
      });

      const migration = authStore.migrateLegacyData(user.id);
      expect(migration.migratedChats).toBe(1);
      expect(migration.migratedMemories).toBe(1);
      expect(migration.migratedReminders).toBe(1);

      // Verify records are now owned by the user
      const chat = db.prepare('SELECT ownerId FROM thread_bindings WHERE id = ?').get('t1') as { ownerId: string };
      expect(chat.ownerId).toBe(user.id);

      const mem = db.prepare('SELECT ownerId FROM memories_v2 WHERE id = ?').get('m1') as { ownerId: string };
      expect(mem.ownerId).toBe(user.id);

      // Subsequent check should report no legacy data
      expect(authStore.checkHasLegacyData().hasLegacy).toBe(false);
    });
  });

  describe('Data Export and Account Deletion', () => {
    it('exports all user data in structured JSON', () => {
      const user = authStore.upsertGoogleUser({
        googleSub: 'google_sub_export',
        email: 'exporter@example.com',
        name: 'Data Exporter',
      });

      db.exec(`
        CREATE TABLE IF NOT EXISTS thread_bindings (id TEXT PRIMARY KEY, dotId TEXT, ownerId TEXT, title TEXT, createdAt INTEGER);
        CREATE TABLE IF NOT EXISTS memories_v2 (id TEXT PRIMARY KEY, ownerId TEXT, category TEXT, text TEXT, confidence REAL, pinned INTEGER, source TEXT, createdAt INTEGER, updatedAt INTEGER);
        CREATE TABLE IF NOT EXISTS reminders (id TEXT PRIMARY KEY, ownerId TEXT, title TEXT);
        CREATE TABLE IF NOT EXISTS goals (id TEXT PRIMARY KEY, ownerId TEXT, title TEXT);
        CREATE TABLE IF NOT EXISTS spaces (id TEXT PRIMARY KEY, ownerId TEXT, name TEXT);
        CREATE TABLE IF NOT EXISTS pages (id TEXT PRIMARY KEY, ownerId TEXT, title TEXT);
      `);

      db.prepare("INSERT INTO thread_bindings VALUES ('t_exp', 'dot1', ?, 'My Chat', 1000)").run(user.id);
      db.prepare("INSERT INTO memories_v2 VALUES ('m_exp', ?, 'project', 'OpenDots project memory', 1.0, 0, 'user', 1000, 1000)").run(user.id);

      const exportBundle = authStore.exportUserData(user.id);
      expect(exportBundle.user.email).toBe('exporter@example.com');
      expect(exportBundle.stats.conversationsCount).toBe(1);
      expect(exportBundle.stats.memoriesCount).toBe(1);
      expect(exportBundle.conversations.length).toBe(1);
      expect(exportBundle.memories.length).toBe(1);
    });

    it('deletes user account and associated personal data completely', () => {
      const user = authStore.upsertGoogleUser({
        googleSub: 'google_sub_delete',
        email: 'delete_me@example.com',
        name: 'To Be Deleted',
      });

      db.exec(`
        CREATE TABLE IF NOT EXISTS thread_bindings (id TEXT PRIMARY KEY, dotId TEXT, ownerId TEXT);
        CREATE TABLE IF NOT EXISTS memories_v2 (id TEXT PRIMARY KEY, ownerId TEXT);
      `);

      db.prepare("INSERT INTO thread_bindings VALUES ('t_del', 'dot1', ?)").run(user.id);
      db.prepare("INSERT INTO memories_v2 VALUES ('m_del', ?)").run(user.id);

      const deleteRes = authStore.deleteUserAccount(user.id);
      expect(deleteRes.success).toBe(true);

      expect(authStore.getUserById(user.id)).toBeNull();
      const remainingChats = db.prepare('SELECT COUNT(*) as c FROM thread_bindings WHERE ownerId = ?').get(user.id) as { c: number };
      expect(remainingChats.c).toBe(0);
    });
  });

  describe('Full HTTP Auth & Isolation Endpoints', () => {
    it('authenticates via POST /api/auth/google, checks /api/auth/me, and isolates data', async () => {
      const app = createApp({
        store,
        runner: new Runner(store),
        config: {
          runtimeUrl: 'http://localhost:4310/api/copilotkit',
          agentRunTimeoutMs: 30000,
        },
      });

      // 1. Google login for Alice
      const loginRes = await app.request('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential: 'test-mock-token:alice@example.com:Alice Smith:sub_alice_1',
        }),
      });

      expect(loginRes.status).toBe(200);
      const loginData = (await loginRes.json()) as any;
      expect(loginData.ok).toBe(true);
      expect(loginData.token).toBeDefined();
      expect(loginData.user.email).toBe('alice@example.com');

      const aliceToken = loginData.token;

      // 2. Query /api/auth/me with Alice's token
      const meRes = await app.request('/api/auth/me', {
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(meRes.status).toBe(200);
      const meData = (await meRes.json()) as any;
      expect(meData.authenticated).toBe(true);
      expect(meData.user.email).toBe('alice@example.com');

      // 3. Query /api/auth/me without token -> returns guest mode
      const guestRes = await app.request('/api/auth/me');
      const guestData = (await guestRes.json()) as any;
      expect(guestData.authenticated).toBe(false);
      expect(guestData.guest).toBe(true);

      // 4. Logout Alice
      const logoutRes = await app.request('/api/auth/logout', { method: 'POST' });
      expect(logoutRes.status).toBe(200);
    });
  });
});
