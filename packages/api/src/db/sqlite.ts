import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_VERSION } from '@sophie/shared';
import { clock } from '../util/clock.js';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) throw new Error('DB not initialized');
  return db;
}

export function openDb(dbPath: string): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const instance = new Database(dbPath);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  instance.pragma('synchronous = NORMAL');
  instance.pragma('busy_timeout = 5000');
  db = instance;
  return instance;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
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
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({ name: f, sql: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

export function runMigrations(database: Database.Database): void {
  // Idempotent: every statement uses IF NOT EXISTS / IF EXISTS patterns.
  // We apply all migrations in filename order on every boot.
  for (const m of loadMigrations()) {
    database.exec(m.sql);
  }
  const row = database.prepare('SELECT version FROM schema_version').get() as
    | { version: number }
    | undefined;
  if (!row) {
    database.prepare('INSERT INTO schema_version(version) VALUES (?)').run(SCHEMA_VERSION);
  } else if (row.version > SCHEMA_VERSION) {
    throw new Error(
      `schema_version ${row.version} is newer than supported ${SCHEMA_VERSION}; refusing to start`,
    );
  } else if (row.version < SCHEMA_VERSION) {
    database.prepare('UPDATE schema_version SET version = ?').run(SCHEMA_VERSION);
  }

  const s = database.prepare('SELECT id FROM settings WHERE id = 1').get();
  if (!s) {
    database
      .prepare('INSERT INTO settings(id, expiring_soon_window_days, updated_at) VALUES (1, 7, ?)')
      .run(clock.nowIso());
  }
  const fp = database.prepare("SELECT id FROM floor_plan WHERE id = 'singleton'").get();
  if (!fp) {
    const now = clock.nowIso();
    database
      .prepare(
        "INSERT INTO floor_plan(id, name, width, height, created_at, updated_at) VALUES ('singleton', ?, ?, ?, ?, ?)",
      )
      .run('Home', 1000, 700, now, now);
  }
}

export function tx<T>(database: Database.Database, fn: () => T): T {
  const wrap = database.transaction(fn);
  return wrap();
}
