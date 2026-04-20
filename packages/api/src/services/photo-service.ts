import type { Db, Pool } from '../db/postgres.js';
import { tx } from '../db/postgres.js';
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
import { putObject, deletePrefix } from '../storage/s3.js';

const ACCEPTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

function extFromMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'bin';
}

/** Returns the S3 key prefix for a photo (ends with '/'). */
function photoKeyPrefix(id: string, kind: 'item' | 'floor_plan'): string {
  const prefix = id.slice(0, 2).toLowerCase();
  if (kind === 'item') return `photos/items/${prefix}/${id}/`;
  return `photos/floor_plan/${id}/`;
}

/** Compute S3 keys for original and thumbnail given the stored prefix and mime type. */
export function photoKeys(keyPrefix: string, mimeType: string): { original: string; thumb: string } {
  const ext = extFromMime(mimeType);
  return {
    original: `${keyPrefix}original.${ext}`,
    thumb: `${keyPrefix}thumb.webp`,
  };
}

export interface UploadedPhoto {
  photo: Photo;
}

export async function uploadPhoto(
  db: Db,
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

  if (kind === 'item') {
    const { rows } = await db.query('SELECT 1 FROM items WHERE id = $1', [ownerId]);
    if (rows.length === 0) throw notFound('item');
    const { rows: countRows } = await db.query<{ c: string }>(
      `SELECT COUNT(*) c FROM photos WHERE owner_kind='item' AND owner_id=$1`,
      [ownerId],
    );
    if (Number(countRows[0]!.c) >= config.maxPhotosPerItem) {
      throw validation(`max ${config.maxPhotosPerItem} photos per item`);
    }
  } else {
    const { rows } = await db.query(
      "SELECT 1 FROM floor_plan WHERE id = 'singleton' AND 'singleton' = $1",
      [ownerId],
    );
    if (rows.length === 0 && ownerId !== 'singleton') throw notFound('floor_plan');
  }

  const id = ulid();
  const keyPrefix = photoKeyPrefix(id, kind);
  const ext = extFromMime(sniffed.mime);
  const originalKey = `${keyPrefix}original.${ext}`;
  const thumbKey = `${keyPrefix}thumb.webp`;

  // Strip EXIF by re-encoding via sharp (default drops all metadata; .rotate() applies EXIF orientation first)
  const img = sharp(buffer).rotate();
  const reencoder =
    sniffed.mime === 'image/jpeg'
      ? img.jpeg({ quality: 90 })
      : sniffed.mime === 'image/png'
        ? img.png()
        : img.webp({ quality: 90 });
  const originalBuf = await reencoder.toBuffer();
  await putObject(originalKey, originalBuf, sniffed.mime);

  let thumbBuf: Buffer;
  try {
    thumbBuf = await sharp(originalBuf).resize(512, 512, { fit: 'inside' }).webp({ quality: 80 }).toBuffer();
  } catch {
    thumbBuf = originalBuf;
  }
  await putObject(thumbKey, thumbBuf, 'image/webp');

  const size = originalBuf.length;
  const now = clock.nowIso();
  await db.query(
    `INSERT INTO photos (id, owner_kind, owner_id, file_path, mime_type, size_bytes, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, kind, ownerId, keyPrefix, sniffed.mime, size, now],
  );

  if (kind === 'item') {
    const { rows } = await db.query<{ photo_ids: string }>(
      'SELECT photo_ids FROM items WHERE id = $1',
      [ownerId],
    );
    const row = rows[0];
    if (row) {
      const ids = JSON.parse(row.photo_ids) as string[];
      ids.push(id);
      await db.query('UPDATE items SET photo_ids = $1, updated_at = $2 WHERE id = $3', [
        JSON.stringify(ids),
        clock.nowIso(),
        ownerId,
      ]);
    }
  }

  return {
    photo: {
      id,
      owner_kind: kind,
      owner_id: ownerId,
      file_path: keyPrefix,
      mime_type: sniffed.mime,
      size_bytes: size,
      created_at: now,
    },
  };
}

export async function getPhoto(db: Db, id: string): Promise<Photo> {
  const { rows } = await db.query<Photo>('SELECT * FROM photos WHERE id = $1', [id]);
  if (rows.length === 0) throw notFound('photo');
  return rows[0]!;
}

export async function deletePhoto(db: Db, id: string): Promise<void> {
  const p = await getPhoto(db, id);
  await tx(db as Pool, async (client) => {
    await client.query('DELETE FROM photos WHERE id = $1', [id]);
    if (p.owner_kind === 'item') {
      const { rows } = await client.query<{ photo_ids: string }>(
        'SELECT photo_ids FROM items WHERE id = $1',
        [p.owner_id],
      );
      if (rows[0]) {
        const ids = (JSON.parse(rows[0].photo_ids) as string[]).filter((x) => x !== id);
        await client.query('UPDATE items SET photo_ids = $1, updated_at = $2 WHERE id = $3', [
          JSON.stringify(ids),
          clock.nowIso(),
          p.owner_id,
        ]);
      }
    }
  });
  try {
    await deletePrefix(p.file_path);
  } catch {
    // swallow; S3 cleanup is best-effort
  }
}

export async function cleanupPhotoKeys(keyPrefixes: string[]): Promise<void> {
  for (const prefix of keyPrefixes) {
    try {
      await deletePrefix(prefix);
    } catch {
      // ignore
    }
  }
}
