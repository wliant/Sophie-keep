import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sophie-plan-'));
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

describe('floor-plan edit session', () => {
  it('rolls back all ops when any op fails validation', async () => {
    const { openDb, runMigrations } = await import('../src/db/sqlite.js');
    const { ensureDirs, config } = await import('../src/config.js');
    const { applyEditSession, EditSessionError } = await import(
      '../src/services/floor-plan-service.js'
    );
    ensureDirs();
    const db = openDb(config.dbPath);
    runMigrations(db);

    const preCount = (
      db.prepare('SELECT COUNT(*) c FROM rooms').get() as { c: number }
    ).c;

    // First op is a valid room; second op is a location whose shape lies
    // outside the (non-existent) target room — it must fail and rollback
    // the first op as well.
    expect(() =>
      applyEditSession(db, {
        ops: [
          {
            op: 'create_room',
            temp_id: 'r1',
            name: 'TxRollbackRoom',
            shape_on_plan: { type: 'rect', x: 10, y: 10, w: 200, h: 100 },
          },
          {
            op: 'create_location',
            temp_id: 'l1',
            name: 'OutsideLoc',
            room_id: 'r1',
            shape_on_plan: { type: 'rect', x: 500, y: 500, w: 40, h: 40 },
          },
        ],
      }),
    ).toThrow(EditSessionError);

    const postCount = (
      db.prepare('SELECT COUNT(*) c FROM rooms').get() as { c: number }
    ).c;
    expect(postCount).toBe(preCount);

    const leaked = db
      .prepare('SELECT COUNT(*) c FROM rooms WHERE name = ?')
      .get('TxRollbackRoom') as { c: number };
    expect(leaked.c).toBe(0);
  });

  it('applies a valid batch atomically and resolves temp_ids', async () => {
    const { openDb, runMigrations } = await import('../src/db/sqlite.js');
    const { ensureDirs, config } = await import('../src/config.js');
    const { applyEditSession } = await import('../src/services/floor-plan-service.js');
    ensureDirs();
    const db = openDb(config.dbPath);
    runMigrations(db);

    const result = applyEditSession(db, {
      ops: [
        {
          op: 'create_room',
          temp_id: 'r1',
          name: 'NewRoom',
          shape_on_plan: { type: 'rect', x: 10, y: 10, w: 300, h: 200 },
        },
        {
          op: 'create_location',
          temp_id: 'l1',
          name: 'NewLoc',
          room_id: 'r1',
          shape_on_plan: { type: 'rect', x: 20, y: 20, w: 40, h: 40 },
        },
      ],
    });

    expect(result.rooms_created.r1).toMatch(/^[A-Z0-9]+$/);
    expect(result.locations_created.l1).toMatch(/^[A-Z0-9]+$/);
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(result.rooms_created.r1) as
      | { room_id?: string }
      | undefined;
    expect(room).toBeDefined();
    const loc = db
      .prepare('SELECT room_id FROM storage_locations WHERE id = ?')
      .get(result.locations_created.l1) as { room_id: string } | undefined;
    expect(loc?.room_id).toBe(result.rooms_created.r1);
  });
});
