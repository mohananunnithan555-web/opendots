import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { UserProfile, UserDataExport } from './types.js';

export class AuthStore {
  constructor(private db: DatabaseSync) {
    this.ensureSchema();
  }

  ensureSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        googleSub TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        picture TEXT,
        createdAt INTEGER NOT NULL,
        lastLoginAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS users_email ON users(email);
      CREATE INDEX IF NOT EXISTS users_google_sub ON users(googleSub);
    `);
  }

  upsertGoogleUser(data: {
    googleSub: string;
    email: string;
    name: string;
    picture?: string;
  }): UserProfile {
    const existing = this.getUserByGoogleSub(data.googleSub);
    const now = Date.now();

    if (existing) {
      this.db
        .prepare(
          `UPDATE users SET name = ?, picture = ?, lastLoginAt = ? WHERE id = ?`,
        )
        .run(data.name, data.picture ?? null, now, existing.id);
      return {
        ...existing,
        name: data.name,
        picture: data.picture,
        lastLoginAt: now,
      };
    }

    // Check if user with same email exists
    const existingByEmail = this.getUserByEmail(data.email);
    if (existingByEmail) {
      this.db
        .prepare(
          `UPDATE users SET googleSub = ?, name = ?, picture = ?, lastLoginAt = ? WHERE id = ?`,
        )
        .run(data.googleSub, data.name, data.picture ?? null, now, existingByEmail.id);
      return {
        ...existingByEmail,
        googleSub: data.googleSub,
        name: data.name,
        picture: data.picture,
        lastLoginAt: now,
      };
    }

    const newUser: UserProfile = {
      id: randomUUID(),
      googleSub: data.googleSub,
      email: data.email,
      name: data.name,
      picture: data.picture,
      createdAt: now,
      lastLoginAt: now,
    };

    this.db
      .prepare(
        `INSERT INTO users (id, googleSub, email, name, picture, createdAt, lastLoginAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        newUser.id,
        newUser.googleSub,
        newUser.email,
        newUser.name,
        newUser.picture ?? null,
        newUser.createdAt,
        newUser.lastLoginAt,
      );

    return newUser;
  }

  getUserById(id: string): UserProfile | null {
    const row = this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(id) as unknown as UserProfile | undefined;
    return row ?? null;
  }

  getUserByGoogleSub(googleSub: string): UserProfile | null {
    const row = this.db
      .prepare('SELECT * FROM users WHERE googleSub = ?')
      .get(googleSub) as unknown as UserProfile | undefined;
    return row ?? null;
  }

  getUserByEmail(email: string): UserProfile | null {
    const row = this.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(email) as unknown as UserProfile | undefined;
    return row ?? null;
  }

  countUsers(): number {
    const res = this.db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
    return res.c;
  }

  checkHasLegacyData(): {
    hasLegacy: boolean;
    chatsCount: number;
    memoriesCount: number;
    remindersCount: number;
    goalsCount: number;
  } {
    const getCount = (table: string, ownerCol = 'ownerId') => {
      try {
        const row = this.db
          .prepare(`SELECT COUNT(*) as c FROM ${table} WHERE ${ownerCol} = 'opendots-owner'`)
          .get() as { c: number } | undefined;
        return row?.c ?? 0;
      } catch {
        return 0;
      }
    };

    const chatsCount = getCount('thread_bindings');
    const memoriesCount = getCount('memories_v2');
    const remindersCount = getCount('reminders');
    const goalsCount = getCount('goals');

    const hasLegacy = chatsCount > 0 || memoriesCount > 0 || remindersCount > 0 || goalsCount > 0;
    return { hasLegacy, chatsCount, memoriesCount, remindersCount, goalsCount };
  }

  migrateLegacyData(targetUserId: string): {
    migratedChats: number;
    migratedMemories: number;
    migratedReminders: number;
    migratedGoals: number;
    migratedPlans: number;
  } {
    if (!targetUserId) throw new Error('Target user ID is required for migration.');

    const migrateTable = (table: string, ownerCol = 'ownerId') => {
      try {
        const countBefore = (this.db
          .prepare(`SELECT COUNT(*) as c FROM ${table} WHERE ${ownerCol} = 'opendots-owner'`)
          .get() as { c: number }).c;

        if (countBefore > 0) {
          this.db
            .prepare(`UPDATE ${table} SET ${ownerCol} = ? WHERE ${ownerCol} = 'opendots-owner'`)
            .run(targetUserId);
        }
        return countBefore;
      } catch {
        return 0;
      }
    };

    this.db.exec('BEGIN IMMEDIATE');
    try {
      const migratedChats = migrateTable('thread_bindings');
      const migratedMemories = migrateTable('memories_v2');
      const migratedReminders = migrateTable('reminders');
      const migratedGoals = migrateTable('goals');
      const migratedPlans = migrateTable('task_plans');

      this.db.exec('COMMIT');
      return {
        migratedChats,
        migratedMemories,
        migratedReminders,
        migratedGoals,
        migratedPlans,
      };
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  exportUserData(userId: string): UserDataExport {
    const user = this.getUserById(userId);
    if (!user) throw new Error('User not found.');

    const safeAll = (table: string, ownerCol = 'ownerId') => {
      try {
        return this.db.prepare(`SELECT * FROM ${table} WHERE ${ownerCol} = ?`).all(userId) as unknown[];
      } catch {
        return [];
      }
    };

    const conversations = safeAll('thread_bindings');
    const memories = safeAll('memories_v2');
    const reminders = safeAll('reminders');
    const goals = safeAll('goals');
    const spaces = safeAll('spaces');
    const pages = safeAll('pages');

    let settings: unknown = null;
    try {
      const row = this.db.prepare('SELECT value FROM settings WHERE id = 1').get() as { value: string } | undefined;
      if (row) settings = JSON.parse(row.value);
    } catch {}

    return {
      exportDate: new Date().toISOString(),
      user,
      stats: {
        conversationsCount: conversations.length,
        memoriesCount: memories.length,
        remindersCount: reminders.length,
        goalsCount: goals.length,
        spacesCount: spaces.length,
        pagesCount: pages.length,
      },
      conversations,
      memories,
      reminders,
      goals,
      spaces,
      pages,
      settings,
    };
  }

  deleteUserAccount(userId: string): { success: boolean; deletedTables: string[] } {
    const user = this.getUserById(userId);
    if (!user) throw new Error('User not found.');

    const deletedTables: string[] = [];
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const tablesWithOwner = [
        'thread_bindings',
        'memories_v2',
        'reminders',
        'goals',
        'task_plans',
        'push_subscriptions',
        'connectors',
        'approvals',
        'custom_rules',
        'custom_skills',
      ];

      for (const t of tablesWithOwner) {
        try {
          this.db.prepare(`DELETE FROM ${t} WHERE ownerId = ?`).run(userId);
          deletedTables.push(t);
        } catch {}
      }

      this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
      deletedTables.push('users');

      this.db.exec('COMMIT');
      return { success: true, deletedTables };
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}
