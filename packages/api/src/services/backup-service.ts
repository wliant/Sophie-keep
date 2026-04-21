import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createGzip, createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import tar from 'tar-stream';
import { APP_VERSION, SCHEMA_VERSION } from '@sophie/shared';
import type { BackupManifest, BackupRecord } from '@sophie/shared';
import type { Db, Pool } from '../db/postgres.js';
import { tx } from '../db/postgres.js';
import { clock } from '../util/clock.js';
import { config } from '../config.js';
import {
  backupChecksumMismatch,
  notFound,
  restoreFailed,
  schemaMismatch,
} from '../errors.js';
import { setBackupStatus } from './settings-service.js';
import { listPrefix, getObject, putObject } from '../storage/s3.js';

const TABLES = [
  'settings',
  'item_types',
  'rooms',
  'storage_locations',
  'floor_plan',
  'items',
  'photos',
  'quantity_changes',
  'shopping_entries',
  'recipes',
  'recipe_ingredients',
];

function writeTarEntry(pack: tar.Pack, name: string, buf: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    pack.entry({ name, size: buf.length }, buf, (err) => (err ? reject(err) : resolve()));
  });
}

function computeChecksum(
  manifestWithoutChecksum: Omit<BackupManifest, 'checksum'>,
  data: Buffer,
  photoHashes: string[],
): string {
  const h = createHash('sha256');
  h.update(JSON.stringify(manifestWithoutChecksum));
  h.update(data);
  for (const ph of photoHashes) h.update(ph);
  return h.digest('hex');
}

export async function createBackup(db: Db): Promise<BackupRecord> {
  fs.mkdirSync(config.backupRoot, { recursive: true });
  const timestamp = clock.nowIso();
  const filename = `backup_${timestamp.replace(/[:.]/g, '-')}.tar.gz`;
  const fullPath = path.join(config.backupRoot, filename);
  const tmpPath = fullPath + '.tmp';

  const entityData: Record<string, unknown[]> = {};
  let photoCount = 0;
  const photoHashes: string[] = [];

  for (const tableName of TABLES) {
    const { rows } = await db.query(`SELECT * FROM ${tableName}`);
    entityData[tableName] = rows;
  }

  const photos = entityData['photos'] as Array<{ file_path: string; id: string }>;
  photoCount = photos.length;

  const manifestBase: Omit<BackupManifest, 'checksum'> = {
    timestamp,
    schema_version: SCHEMA_VERSION,
    entity_counts: Object.fromEntries(
      Object.entries(entityData).map(([k, v]) => [k, v.length]),
    ),
    photo_count: photoCount,
    app_version: APP_VERSION,
  };

  const dataBuffer = Buffer.from(JSON.stringify(entityData), 'utf8');

  // Hash photo objects in S3 for checksum
  for (const p of photos) {
    const keys = await listPrefix(p.file_path);
    if (keys.length === 0) {
      photoHashes.push(`missing:${p.id}`);
      continue;
    }
    const h = createHash('sha256');
    for (const key of keys.sort()) {
      const relPath = key.slice(p.file_path.length);
      h.update(relPath);
      h.update(await getObject(key));
    }
    photoHashes.push(`${p.id}:${h.digest('hex')}`);
  }

  const checksum = computeChecksum(manifestBase, dataBuffer, photoHashes);
  const manifest: BackupManifest = { ...manifestBase, checksum };

  // Build tarball
  const pack = tar.pack();
  const gz = createGzip();
  const writeStream = fs.createWriteStream(tmpPath);
  const pipePromise = pipeline(pack, gz, writeStream);

  await writeTarEntry(pack, 'manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
  await writeTarEntry(pack, 'data.json', dataBuffer);
  for (const p of photos) {
    const keys = await listPrefix(p.file_path);
    for (const key of keys) {
      const relPath = key.slice(p.file_path.length);
      const buf = await getObject(key);
      await writeTarEntry(pack, `photos/${p.id}/${relPath}`, buf);
    }
  }
  pack.finalize();
  await pipePromise;

  // Verify
  const verifyManifest = await readManifest(tmpPath);
  if (!verifyManifest || verifyManifest.checksum !== manifest.checksum) {
    fs.unlinkSync(tmpPath);
    throw backupChecksumMismatch('backup checksum verification failed');
  }

  fs.renameSync(tmpPath, fullPath);

  const stat = fs.statSync(fullPath);
  await setBackupStatus(db, 'ok', timestamp);

  pruneOldBackups();

  return {
    id: filename,
    filename,
    timestamp,
    size_bytes: stat.size,
    manifest,
    verification_status: 'ok',
  };
}

async function readBackupContents(filePath: string): Promise<{
  manifest: BackupManifest | null;
  data: Record<string, unknown[]> | null;
  photoFiles: Map<string, Map<string, Buffer>>;
}> {
  const gunzip = createGunzip();
  const extract = tar.extract();
  const inStream = fs.createReadStream(filePath);
  let manifest: BackupManifest | null = null;
  let data: Record<string, unknown[]> | null = null;
  const photoFiles = new Map<string, Map<string, Buffer>>();

  extract.on('entry', (header, stream, next) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => {
      const buf = Buffer.concat(chunks);
      if (header.name === 'manifest.json') {
        manifest = JSON.parse(buf.toString('utf8')) as BackupManifest;
      } else if (header.name === 'data.json') {
        data = JSON.parse(buf.toString('utf8')) as Record<string, unknown[]>;
      } else if (header.name.startsWith('photos/')) {
        const parts = header.name.split('/');
        const photoId = parts[1]!;
        const relPath = parts.slice(2).join('/');
        if (!photoFiles.has(photoId)) photoFiles.set(photoId, new Map());
        photoFiles.get(photoId)!.set(relPath, buf);
      }
      next();
    });
    stream.resume();
  });

  await pipeline(inStream, gunzip, extract);
  return { manifest, data, photoFiles };
}

async function readManifest(filePath: string): Promise<BackupManifest | null> {
  try {
    const { manifest } = await readBackupContents(filePath);
    return manifest;
  } catch {
    return null;
  }
}

function recomputeChecksumForContents(
  manifestBase: Omit<BackupManifest, 'checksum'>,
  data: Record<string, unknown[]>,
  photoFiles: Map<string, Map<string, Buffer>>,
): string {
  const photos = (data['photos'] as Array<{ id: string; file_path: string }>) ?? [];
  const photoHashes: string[] = [];
  for (const p of photos) {
    const files = photoFiles.get(p.id);
    if (!files) {
      photoHashes.push(`missing:${p.id}`);
      continue;
    }
    const h = createHash('sha256');
    for (const name of [...files.keys()].sort()) {
      h.update(name);
      h.update(files.get(name)!);
    }
    photoHashes.push(`${p.id}:${h.digest('hex')}`);
  }
  const dataBuffer = Buffer.from(JSON.stringify(data), 'utf8');
  return computeChecksum(manifestBase, dataBuffer, photoHashes);
}

export function listBackups(): BackupRecord[] {
  if (!fs.existsSync(config.backupRoot)) return [];
  const files = fs
    .readdirSync(config.backupRoot)
    .filter((f) => f.endsWith('.tar.gz'))
    .sort()
    .reverse();
  return files.map((f) => {
    const full = path.join(config.backupRoot, f);
    const stat = fs.statSync(full);
    return {
      id: f,
      filename: f,
      timestamp: stat.mtime.toISOString(),
      size_bytes: stat.size,
      manifest: null,
      verification_status: 'ok' as const,
    };
  });
}

export function getBackupPath(id: string): string {
  const full = path.join(config.backupRoot, id);
  if (!fs.existsSync(full)) throw notFound('backup');
  return full;
}

export function pruneOldBackups(olderThanDays = 30): void {
  if (!fs.existsSync(config.backupRoot)) return;
  const cutoff = Date.now() - olderThanDays * 86400 * 1000;
  for (const f of fs.readdirSync(config.backupRoot)) {
    if (!f.endsWith('.tar.gz')) continue;
    if (f.startsWith('pre_restore_')) continue;
    const full = path.join(config.backupRoot, f);
    const stat = fs.statSync(full);
    if (stat.mtimeMs < cutoff) {
      fs.unlinkSync(full);
    }
  }
}

export async function restoreBackup(
  db: Db,
  backupPath: string,
  opts: { isRollbackAttempt?: boolean } = {},
): Promise<void> {
  let contents: Awaited<ReturnType<typeof readBackupContents>>;
  try {
    contents = await readBackupContents(backupPath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw backupChecksumMismatch(`backup file is unreadable: ${msg}`);
  }
  if (!contents.manifest || !contents.data) {
    throw restoreFailed('backup file is missing manifest or data');
  }
  if (contents.manifest.schema_version !== SCHEMA_VERSION) {
    throw schemaMismatch(
      `backup schema version ${contents.manifest.schema_version} does not match current ${SCHEMA_VERSION}`,
    );
  }
  const { checksum, ...base } = contents.manifest;
  const recomputed = recomputeChecksumForContents(base, contents.data, contents.photoFiles);
  if (recomputed !== checksum) {
    throw backupChecksumMismatch('restore aborted: backup checksum mismatch');
  }

  let snapshotPath: string | null = null;
  if (!opts.isRollbackAttempt) {
    fs.mkdirSync(config.backupRoot, { recursive: true });
    const snapshotName = `pre_restore_${clock.nowIso().replace(/[:.]/g, '-')}.tar.gz`;
    snapshotPath = path.join(config.backupRoot, snapshotName);
    try {
      await createBackupSnapshot(db, snapshotPath);
    } catch (e) {
      throw restoreFailed(
        `could not create pre-restore snapshot: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  try {
    // Atomic DB restore in a transaction
    await tx(db as Pool, async (client) => {
      for (const t of [...TABLES].reverse()) {
        await client.query(`DELETE FROM ${t}`);
      }
      await client.query('DELETE FROM auto_entry_check_state');
      for (const t of TABLES) {
        const rows = contents.data![t] as Array<Record<string, unknown>>;
        if (!rows || rows.length === 0) continue;
        const columns = Object.keys(rows[0]!);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(',');
        for (const row of rows) {
          await client.query(
            `INSERT INTO ${t} (${columns.join(',')}) VALUES (${placeholders})`,
            columns.map((c) => row[c] ?? null),
          );
        }
      }
    });

    // Restore photos to S3
    const photos =
      (contents.data['photos'] as Array<{ id: string; file_path: string; mime_type: string }>) ?? [];
    for (const p of photos) {
      const files = contents.photoFiles.get(p.id);
      if (!files) continue;
      for (const [relPath, buf] of files) {
        const contentType = relPath.startsWith('thumb') ? 'image/webp' : p.mime_type;
        await putObject(p.file_path + relPath, buf, contentType);
      }
    }
  } catch (e) {
    const originalMessage = e instanceof Error ? e.message : String(e);
    if (snapshotPath && !opts.isRollbackAttempt) {
      try {
        await restoreBackup(db, snapshotPath, { isRollbackAttempt: true });
        throw restoreFailed(
          `restore failed and rolled back: ${originalMessage} (pre-restore snapshot at ${snapshotPath})`,
        );
      } catch (rollbackErr) {
        const rbMsg = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
        throw restoreFailed(
          `restore failed AND rollback failed. original=${originalMessage} rollback=${rbMsg} (pre-restore snapshot at ${snapshotPath})`,
        );
      }
    }
    throw restoreFailed(
      `restore failed: ${originalMessage}${snapshotPath ? ` (pre-restore snapshot at ${snapshotPath})` : ''}`,
    );
  }
}

async function createBackupSnapshot(db: Db, snapshotPath: string): Promise<void> {
  const entityData: Record<string, unknown[]> = {};
  for (const tableName of TABLES) {
    const { rows } = await db.query(`SELECT * FROM ${tableName}`);
    entityData[tableName] = rows;
  }
  const photos = entityData['photos'] as Array<{ file_path: string; id: string }>;
  const photoHashes: string[] = [];
  for (const p of photos) {
    const keys = await listPrefix(p.file_path);
    if (keys.length === 0) {
      photoHashes.push(`missing:${p.id}`);
      continue;
    }
    const h = createHash('sha256');
    for (const key of keys.sort()) {
      const relPath = key.slice(p.file_path.length);
      h.update(relPath);
      h.update(await getObject(key));
    }
    photoHashes.push(`${p.id}:${h.digest('hex')}`);
  }
  const manifestBase: Omit<BackupManifest, 'checksum'> = {
    timestamp: clock.nowIso(),
    schema_version: SCHEMA_VERSION,
    entity_counts: Object.fromEntries(
      Object.entries(entityData).map(([k, v]) => [k, v.length]),
    ),
    photo_count: photos.length,
    app_version: APP_VERSION,
  };
  const dataBuffer = Buffer.from(JSON.stringify(entityData), 'utf8');
  const checksum = computeChecksum(manifestBase, dataBuffer, photoHashes);
  const manifest: BackupManifest = { ...manifestBase, checksum };

  const pack = tar.pack();
  const gz = createGzip();
  const writeStream = fs.createWriteStream(snapshotPath);
  const pipePromise = pipeline(pack, gz, writeStream);
  await writeTarEntry(pack, 'manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
  await writeTarEntry(pack, 'data.json', dataBuffer);
  for (const p of photos) {
    const keys = await listPrefix(p.file_path);
    for (const key of keys) {
      const relPath = key.slice(p.file_path.length);
      const buf = await getObject(key);
      await writeTarEntry(pack, `photos/${p.id}/${relPath}`, buf);
    }
  }
  pack.finalize();
  await pipePromise;
}
