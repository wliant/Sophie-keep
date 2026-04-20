import { Pool, type PoolClient } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_VERSION } from '@sophie/shared';
import { clock } from '../util/clock.js';

export type { Pool, PoolClient };
export type Db = Pool | PoolClient;

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) throw new Error('DB pool not initialized');
  return pool;
}

export function openPool(connectionString: string): Pool {
  pool = new Pool({ connectionString });
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function tx<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Build a PostgreSQL parameter placeholder builder. */
export interface PgParamBuilder {
  /** Push a value and return its placeholder ($N). */
  add(v: unknown): string;
  /** Push multiple values and return a comma-separated placeholder list. */
  addAll(vs: unknown[]): string;
  /** Return a snapshot of the accumulated values. */
  values(): unknown[];
  /** Number of values accumulated so far. */
  count(): number;
}

export function pgParams(): PgParamBuilder {
  const vals: unknown[] = [];
  return {
    add(v) {
      vals.push(v);
      return `$${vals.length}`;
    },
    addAll(vs) {
      return vs.map((v) => { vals.push(v); return `$${vals.length}`; }).join(',');
    },
    values() {
      return [...vals];
    },
    count() {
      return vals.length;
    },
  };
}

function findMigrationsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, 'migrations'),
    path.join(here, '..', '..', 'src', 'db', 'migrations'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('migrations directory not found');
}

function loadMigrations(): Array<{ name: string; sql: string }> {
  const dir = findMigrationsDir();
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.pg.sql'))
    .sort()
    .map((f) => ({ name: f, sql: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS applied_migrations (
       name TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL
     )`,
  );

  for (const m of loadMigrations()) {
    const { rows } = await pool.query('SELECT 1 FROM applied_migrations WHERE name = $1', [m.name]);
    if (rows.length > 0) continue;
    await pool.query(m.sql);
    await pool.query('INSERT INTO applied_migrations (name, applied_at) VALUES ($1, $2)', [
      m.name,
      new Date().toISOString(),
    ]);
  }

  const { rows: svRows } = await pool.query('SELECT version FROM schema_version');
  const svRow = svRows[0] as { version: number } | undefined;
  if (!svRow) {
    await pool.query('INSERT INTO schema_version(version) VALUES ($1)', [SCHEMA_VERSION]);
  } else if (svRow.version > SCHEMA_VERSION) {
    throw new Error(
      `schema_version ${svRow.version} is newer than supported ${SCHEMA_VERSION}; refusing to start`,
    );
  } else if (svRow.version < SCHEMA_VERSION) {
    await pool.query('UPDATE schema_version SET version = $1', [SCHEMA_VERSION]);
  }

  const { rows: sRows } = await pool.query('SELECT id FROM settings WHERE id = 1');
  if (sRows.length === 0) {
    await pool.query(
      'INSERT INTO settings(id, expiring_soon_window_days, updated_at) VALUES ($1, $2, $3)',
      [1, 7, clock.nowIso()],
    );
  }

  const { rows: fpRows } = await pool.query("SELECT id FROM floor_plan WHERE id = 'singleton'");
  if (fpRows.length === 0) {
    const now = clock.nowIso();
    await pool.query(
      "INSERT INTO floor_plan(id, name, width, height, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)",
      ['singleton', 'Home', 1000, 700, now, now],
    );
  }
}
