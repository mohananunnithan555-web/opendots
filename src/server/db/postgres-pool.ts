import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let isInitialized = false;

export function getDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.SUPABASE_DATABASE_URL) return process.env.SUPABASE_DATABASE_URL;
  return undefined;
}

export function isCloudDatabaseEnabled(): boolean {
  return Boolean(getDatabaseUrl());
}

export function getPostgresPool(): pg.Pool | null {
  const connectionString = getDatabaseUrl();
  if (!connectionString) return null;

  if (!pool) {
    // Supabase and cloud Postgres typically require SSL with rejectUnauthorized: false
    const isLocalhost = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
    pool = new Pool({
      connectionString,
      ssl: isLocalhost ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.warn('[PostgresPool] Unexpected cloud database error on idle client:', err.message);
    });
  }

  return pool;
}

export async function initCloudDatabase(): Promise<boolean> {
  const currentPool = getPostgresPool();
  if (!currentPool) {
    return false;
  }

  if (isInitialized) return true;

  try {
    const client = await currentPool.connect();
    try {
      console.log('[PostgresPool] Connected to persistent cloud PostgreSQL database.');

      // Load and execute schema
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const schemaPath = join(__dirname, 'postgres-schema.sql');
      if (existsSync(schemaPath)) {
        const schemaSql = readFileSync(schemaPath, 'utf8');
        await client.query(schemaSql);
        console.log('[PostgresPool] Cloud database schema initialized successfully.');
      }
      isInitialized = true;
      return true;
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn(
      '[PostgresPool] Warning: Could not connect to cloud PostgreSQL database. Falling back to local storage:',
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}

export async function closePostgresPool(): Promise<void> {
  if (pool) {
    await pool.end().catch(() => {});
    pool = null;
    isInitialized = false;
  }
}
