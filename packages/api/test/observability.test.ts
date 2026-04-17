import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';

let tmpDir: string;
let app: FastifyInstance;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sophie-obs-'));
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

describe('observability', () => {
  it('response x-request-id matches request_id in error envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/items/does-not-exist' });
    expect(res.statusCode).toBe(404);
    const headerId = res.headers['x-request-id'];
    expect(typeof headerId).toBe('string');
    const body = JSON.parse(res.body) as { error: { request_id?: string } };
    expect(body.error.request_id).toBe(headerId);
  });

  it('honors incoming x-request-id for correlation', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { 'x-request-id': 'my-correlation-id' },
    });
    expect(res.headers['x-request-id']).toBe('my-correlation-id');
  });

  it('returns VALIDATION_ERROR on malformed JSON body (not 500)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/item-types',
      headers: { 'content-type': 'application/json' },
      payload: '{not valid json',
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('sets Cache-Control: no-store on API responses', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
