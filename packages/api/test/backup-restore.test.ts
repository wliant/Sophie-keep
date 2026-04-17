import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sophie-backup-'));
  process.env.SOPHIE_DATA_DIR = tmpDir;
  process.env.SOPHIE_DB_PATH = path.join(tmpDir, 'test.db');
  process.env.SOPHIE_PHOTO_ROOT = path.join(tmpDir, 'photos');
  process.env.SOPHIE_BACKUP_ROOT = path.join(tmpDir, 'backups');
  process.env.SOPHIE_LOG_DIR = path.join(tmpDir, 'logs');
  process.env.NODE_ENV = 'test';
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('backup & restore', () => {
  it('round-trips an empty database with matching entity counts', async () => {
    const { openDb, runMigrations, closeDb } = await import('../src/db/sqlite.js');
    const { ensureDirs, config } = await import('../src/config.js');
    const { createBackup, restoreBackup } = await import('../src/services/backup-service.js');
    const { createType } = await import('../src/services/types-service.js');
    ensureDirs();
    const db = openDb(config.dbPath);
    runMigrations(db);

    createType(db, { name: 'RoundTrip', default_unit: 'pcs' });
    const preCount = (db.prepare('SELECT COUNT(*) c FROM item_types').get() as { c: number }).c;
    expect(preCount).toBeGreaterThan(0);

    const backup = await createBackup(db);
    expect(backup.verification_status).toBe('ok');

    db.prepare('DELETE FROM item_types').run();
    expect((db.prepare('SELECT COUNT(*) c FROM item_types').get() as { c: number }).c).toBe(0);

    await restoreBackup(db, path.join(config.backupRoot, backup.filename));
    const postCount = (db.prepare('SELECT COUNT(*) c FROM item_types').get() as { c: number }).c;
    expect(postCount).toBe(preCount);
    closeDb();
  });

  it('rejects a tampered backup with BACKUP_CHECKSUM_MISMATCH', async () => {
    const { openDb, runMigrations, closeDb } = await import('../src/db/sqlite.js');
    const { ensureDirs, config } = await import('../src/config.js');
    const { createBackup, restoreBackup } = await import('../src/services/backup-service.js');
    ensureDirs();
    const db = openDb(config.dbPath);
    runMigrations(db);

    const backup = await createBackup(db);
    const fullPath = path.join(config.backupRoot, backup.filename);
    // Corrupt the tarball by overwriting a few bytes deep inside
    const fd = fs.openSync(fullPath, 'r+');
    try {
      const size = fs.fstatSync(fd).size;
      fs.writeSync(fd, Buffer.from([0, 1, 2, 3, 4]), 0, 5, Math.floor(size / 2));
    } finally {
      fs.closeSync(fd);
    }

    await expect(restoreBackup(db, fullPath)).rejects.toMatchObject({
      code: expect.stringMatching(/BACKUP_CHECKSUM_MISMATCH|RESTORE_FAILED/),
    });
    closeDb();
  });
});

// Keep Database import referenced to silence unused-import warnings when
// tsc's isolatedModules is on; the real import happens dynamically above.
void Database;
