import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sophie-photo-'));
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

async function makeJpegWithExifGps(): Promise<Buffer> {
  // Build a small JPEG with GPS EXIF injected.
  const base = await sharp({
    create: { width: 64, height: 48, channels: 3, background: { r: 128, g: 64, b: 32 } },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
  return sharp(base)
    .withExif({
      IFD0: { Make: 'TestCam', Model: 'Fixture' },
      GPSIFD: {
        GPSLatitudeRef: 'N',
        GPSLongitudeRef: 'E',
      },
    })
    .jpeg({ quality: 85 })
    .toBuffer();
}

describe('photo upload pipeline', () => {
  it('strips EXIF on re-encode so uploaded JPEG has no metadata', async () => {
    const { openDb, runMigrations } = await import('../src/db/sqlite.js');
    const { ensureDirs, config } = await import('../src/config.js');
    const { uploadPhoto, photoFiles } = await import('../src/services/photo-service.js');
    const { createType } = await import('../src/services/types-service.js');
    const { createRoom, createLocation } = await import('../src/services/locations-service.js');
    const { createItem } = await import('../src/services/items-service.js');
    ensureDirs();
    const db = openDb(config.dbPath);
    runMigrations(db);
    const t = createType(db, { name: 'PhotoType', default_unit: 'pcs' });
    const r = createRoom(db, {
      name: 'PhotoRoom',
      shape_on_plan: { type: 'rect', x: 0, y: 0, w: 300, h: 200 },
    });
    const l = createLocation(db, {
      name: 'PhotoLoc',
      room_id: r.id,
      shape_on_plan: { type: 'rect', x: 10, y: 10, w: 40, h: 40 },
    });
    const item = createItem(db, {
      name: 'With photo',
      item_type_id: t.id,
      storage_location_id: l.id,
    });

    const buffer = await makeJpegWithExifGps();
    const pre = await sharp(buffer).metadata();
    // Confirm our fixture actually has EXIF before upload
    expect(pre.exif && pre.exif.length > 0).toBe(true);

    const uploaded = await uploadPhoto(db, 'item', item.id, 'image/jpeg', buffer);
    const files = photoFiles(uploaded.photo);
    expect(files.original).toBeTruthy();
    const post = await sharp(files.original!).metadata();
    // After the server re-encode we expect no EXIF block in the output.
    expect(post.exif === undefined || post.exif.length === 0).toBe(true);

    // Thumbnail exists
    expect(files.thumb && fs.existsSync(files.thumb)).toBe(true);
  });

  it('rejects a file whose magic bytes do not match declared mime', async () => {
    const { openDb, runMigrations } = await import('../src/db/sqlite.js');
    const { ensureDirs, config } = await import('../src/config.js');
    const { uploadPhoto } = await import('../src/services/photo-service.js');
    const { createType } = await import('../src/services/types-service.js');
    const { createRoom, createLocation } = await import('../src/services/locations-service.js');
    const { createItem } = await import('../src/services/items-service.js');
    ensureDirs();
    const db = openDb(config.dbPath);
    runMigrations(db);
    const t = createType(db, { name: 'MagicType', default_unit: 'pcs' });
    const r = createRoom(db, {
      name: 'MagicRoom',
      shape_on_plan: { type: 'rect', x: 0, y: 0, w: 100, h: 100 },
    });
    const l = createLocation(db, {
      name: 'MagicLoc',
      room_id: r.id,
      shape_on_plan: { type: 'rect', x: 5, y: 5, w: 40, h: 40 },
    });
    const item = createItem(db, {
      name: 'bad photo',
      item_type_id: t.id,
      storage_location_id: l.id,
    });

    const pngBytes = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

    await expect(
      // Declared as jpeg but actually a png → MAGIC_BYTES_MISMATCH
      uploadPhoto(db, 'item', item.id, 'image/jpeg', pngBytes),
    ).rejects.toMatchObject({ code: 'MAGIC_BYTES_MISMATCH' });
  });
});
