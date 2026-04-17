import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import type { Photo } from '@sophie/shared';
import {
  magicBytesMismatch,
  notFound,
  payloadTooLarge,
  unsupportedMediaType,
  validation,
} from '../errors.js';
import { clock } from '../util/clock.js';
import { ulid } from '../util/ulid.js';
import { config } from '../config.js';
import { tx } from '../db/sqlite.js';

const ACCEPTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

function extFromMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'bin';
}

function photoDir(id: string, kind: 'item' | 'floor_plan'): string {
  const prefix = id.slice(0, 2).toLowerCase();
  if (kind === 'item') return path.join(config.photoRoot, 'items', prefix, id);
  return path.join(config.photoRoot, 'floor_plan', id);
}

export interface UploadedPhoto {
  photo: Photo;
  original_path: string;
  thumb_path: string;
}

export async function uploadPhoto(
  db: Database.Database,
  kind: 'item' | 'floor_plan',
  ownerId: string,
  declaredMime: string,
  buffer: Buffer,
): Promise<UploadedPhoto> {
  if (buffer.length > config.maxPhotoBytes) {
    throw payloadTooLarge(`file exceeds ${config.maxPhotoBytes} bytes`);
  }
  if (!ACCEPTED_MIME.has(declaredMime)) {
    throw unsupportedMediaType(`mime ${declaredMime} not supported`);
  }
  const sniffed = await fileTypeFromBuffer(buffer);
  if (!sniffed || !ACCEPTED_MIME.has(sniffed.mime)) {
    throw magicBytesMismatch('file content does not match an accepted image type');
  }
  if (sniffed.mime !== declaredMime) {
    throw magicBytesMismatch(`declared ${declaredMime} but file is ${sniffed.mime}`);
  }

  // Enforce owner exists
  if (kind === 'item') {
    const exists = db.prepare('SELECT 1 FROM items WHERE id = ?').get(ownerId);
    if (!exists) throw notFound('item');
    const photoCount = db
      .prepare(`SELECT COUNT(*) c FROM photos WHERE owner_kind='item' AND owner_id=?`)
      .get(ownerId) as { c: number };
    if (photoCount.c >= config.maxPhotosPerItem) {
      throw validation(`max ${config.maxPhotosPerItem} photos per item`);
    }
  } else {
    const exists = db
      .prepare("SELECT 1 FROM floor_plan WHERE id = 'singleton' AND 'singleton' = ?")
      .get(ownerId);
    if (!exists && ownerId !== 'singleton') throw notFound('floor_plan');
  }

  const id = ulid();
  const dir = photoDir(id, kind);
  fs.mkdirSync(dir, { recursive: true });
  const ext = extFromMime(sniffed.mime);
  const originalPath = path.join(dir, `original.${ext}`);
  const thumbPath = path.join(dir, `thumb.webp`);

  // EXIF strip + rotate + original (re-encode to remove metadata)
  const img = sharp(buffer).rotate();
  const reencoder =
    sniffed.mime === 'image/jpeg'
      ? img.jpeg({ quality: 90 })
      : sniffed.mime === 'image/png'
        ? img.png()
        : img.webp({ quality: 90 });
  await reencoder.withMetadata({ exif: undefined as unknown as never, orientation: 1 }).toFile(originalPath);

  try {
    await sharp(originalPath).resize(512, 512, { fit: 'inside' }).webp({ quality: 80 }).toFile(thumbPath);
  } catch {
    // thumbnail fallback: copy original path as thumbnail reference
    fs.copyFileSync(originalPath, thumbPath);
  }

  const size = fs.statSync(originalPath).size;
  const now = clock.nowIso();
  db.prepare(
    `INSERT INTO photos (id, owner_kind, owner_id, file_path, mime_type, size_bytes, created_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(id, kind, ownerId, dir, sniffed.mime, size, now);

  // Append to item.photo_ids order
  if (kind === 'item') {
    const row = db.prepare('SELECT photo_ids, updated_at FROM items WHERE id = ?').get(ownerId) as
      | { photo_ids: string; updated_at: string }
      | undefined;
    const ids = (row && JSON.parse(row.photo_ids)) as string[];
    ids.push(id);
    db.prepare('UPDATE items SET photo_ids = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(ids),
      clock.nowIso(),
      ownerId,
    );
  }

  return {
    photo: {
      id,
      owner_kind: kind,
      owner_id: ownerId,
      file_path: dir,
      mime_type: sniffed.mime,
      size_bytes: size,
      created_at: now,
    },
    original_path: originalPath,
    thumb_path: thumbPath,
  };
}

export function getPhoto(db: Database.Database, id: string): Photo {
  const r = db.prepare('SELECT * FROM photos WHERE id = ?').get(id) as Photo | undefined;
  if (!r) throw notFound('photo');
  return r;
}

export function photoFiles(p: Photo): { original: string | null; thumb: string | null } {
  const dir = p.file_path;
  if (!fs.existsSync(dir)) return { original: null, thumb: null };
  const files = fs.readdirSync(dir);
  const orig = files.find((f) => f.startsWith('original.')) ?? null;
  const thumb = files.find((f) => f.startsWith('thumb.')) ?? null;
  return {
    original: orig ? path.join(dir, orig) : null,
    thumb: thumb ? path.join(dir, thumb) : null,
  };
}

export function deletePhoto(db: Database.Database, id: string): void {
  const p = getPhoto(db, id);
  tx(db, () => {
    db.prepare('DELETE FROM photos WHERE id = ?').run(id);
    if (p.owner_kind === 'item') {
      const row = db.prepare('SELECT photo_ids FROM items WHERE id = ?').get(p.owner_id) as
        | { photo_ids: string }
        | undefined;
      if (row) {
        const ids = (JSON.parse(row.photo_ids) as string[]).filter((x) => x !== id);
        db.prepare('UPDATE items SET photo_ids = ?, updated_at = ? WHERE id = ?').run(
          JSON.stringify(ids),
          clock.nowIso(),
          p.owner_id,
        );
      }
    }
  });
  try {
    fs.rmSync(p.file_path, { recursive: true, force: true });
  } catch {
    // swallow; file cleanup is best-effort
  }
}

export function cleanupPhotoDirs(paths: string[]): void {
  for (const p of paths) {
    try {
      fs.rmSync(p, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}
