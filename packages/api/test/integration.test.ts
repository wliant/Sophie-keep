import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';

let tmpDir: string;
let app: FastifyInstance;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sophie-test-'));
  process.env.SOPHIE_DATA_DIR = tmpDir;
  process.env.SOPHIE_DB_PATH = path.join(tmpDir, 'test.db');
  process.env.SOPHIE_PHOTO_ROOT = path.join(tmpDir, 'photos');
  process.env.SOPHIE_BACKUP_ROOT = path.join(tmpDir, 'backups');
  process.env.SOPHIE_LOG_DIR = path.join(tmpDir, 'logs');
  process.env.NODE_ENV = 'test';
  const { openDb, runMigrations } = await import('../src/db/sqlite.js');
  const { config, ensureDirs } = await import('../src/config.js');
  ensureDirs();
  const db = openDb(config.dbPath);
  runMigrations(db);
  const { buildApp } = await import('../src/app.js');
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function json<T = unknown>(
  method: string,
  url: string,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  const res = await app.inject({ method: method as 'GET', url, payload: body });
  return { status: res.statusCode, body: res.body ? (JSON.parse(res.body) as T) : (undefined as T) };
}

describe('integration', () => {
  it('health endpoint', async () => {
    const r = await json<{ status: string }>('GET', '/api/v1/health');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ok');
  });

  it('end-to-end: create type/room/location/item, search, decrement', async () => {
    const t = await json<{ id: string }>('POST', '/api/v1/item-types', {
      name: 'Spice',
      default_unit: 'g',
    });
    expect(t.status).toBe(201);

    const dup = await json<{ error: { code: string } }>('POST', '/api/v1/item-types', {
      name: 'spice',
      default_unit: 'g',
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('CONFLICT_UNIQUE');

    const r = await json<{ id: string }>('POST', '/api/v1/rooms', {
      name: 'Kitchen',
      shape_on_plan: { type: 'rect', x: 0, y: 0, w: 500, h: 500 },
    });
    expect(r.status).toBe(201);

    const l = await json<{ id: string }>('POST', '/api/v1/storage-locations', {
      name: 'Spice drawer',
      room_id: r.body.id,
      shape_on_plan: { type: 'rect', x: 10, y: 10, w: 100, h: 40 },
    });
    expect(l.status).toBe(201);

    const it1 = await json<{ id: string; updated_at: string }>('POST', '/api/v1/items', {
      name: 'paprika',
      item_type_id: t.body.id,
      storage_location_id: l.body.id,
      quantity: 5,
    });
    expect(it1.status).toBe(201);

    // decrement below zero blocks
    const dec = await json<{ error: { code: string } }>(
      'POST',
      `/api/v1/items/${it1.body.id}/quantity`,
      { op: 'decrement', amount: 100 },
    );
    expect(dec.status).toBe(422);
    expect(dec.body.error.code).toBe('SEMANTIC_ERROR');

    // search finds it
    const s = await json<{ items: unknown[] }>('GET', '/api/v1/items?q=paprika');
    expect(s.status).toBe(200);
    expect(s.body.items.length).toBe(1);

    // stale updated_at triggers CONFLICT_STALE
    const stale = await json<{ error: { code: string } }>(
      'PATCH',
      `/api/v1/items/${it1.body.id}`,
      { name: 'Paprika 2', base_updated_at: '2020-01-01T00:00:00Z' },
    );
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('CONFLICT_STALE');

    // delete type blocked by references
    const delType = await json<{ error: { code: string } }>(
      'DELETE',
      `/api/v1/item-types/${t.body.id}`,
    );
    expect(delType.status).toBe(409);
    expect(delType.body.error.code).toBe('CONFLICT_REFERENCED');

    // delete location blocked by references
    const delLoc = await json<{ error: { code: string } }>(
      'DELETE',
      `/api/v1/storage-locations/${l.body.id}`,
    );
    expect(delLoc.status).toBe(409);
    expect(delLoc.body.error.code).toBe('CONFLICT_REFERENCED');
  });

  it('XSS: stores script tag as literal text', async () => {
    const t = await json<{ id: string }>('POST', '/api/v1/item-types', {
      name: 'XssType',
      default_unit: 'pcs',
    });
    const r = await json<{ id: string }>('POST', '/api/v1/rooms', {
      name: 'XssRoom',
      shape_on_plan: { type: 'rect', x: 0, y: 0, w: 100, h: 100 },
    });
    const l = await json<{ id: string }>('POST', '/api/v1/storage-locations', {
      name: 'XssLoc',
      room_id: r.body.id,
      shape_on_plan: { type: 'rect', x: 10, y: 10, w: 20, h: 20 },
    });
    const it = await json<{ name: string }>('POST', '/api/v1/items', {
      name: '<script>alert(1)</script>',
      item_type_id: t.body.id,
      storage_location_id: l.body.id,
    });
    expect(it.status).toBe(201);
    expect(it.body.name).toBe('<script>alert(1)</script>');
  });
});
