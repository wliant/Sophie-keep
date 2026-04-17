import path from 'node:path';
import fs from 'node:fs';

function parseTime(t: string): { h: number; m: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return { h: 3, m: 0 };
  return { h: Math.min(23, parseInt(m[1]!, 10)), m: Math.min(59, parseInt(m[2]!, 10)) };
}

const DATA_DIR = process.env.SOPHIE_DATA_DIR || path.resolve(process.cwd(), 'data');

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  bind: process.env.BIND || '127.0.0.1',
  dataDir: DATA_DIR,
  dbPath: process.env.SOPHIE_DB_PATH || path.join(DATA_DIR, 'sophie.db'),
  photoRoot: process.env.SOPHIE_PHOTO_ROOT || path.join(DATA_DIR, 'photos'),
  backupRoot: process.env.SOPHIE_BACKUP_ROOT || path.join(DATA_DIR, 'backups'),
  logDir: process.env.SOPHIE_LOG_DIR || path.join(DATA_DIR, 'logs'),
  backupTime: parseTime(process.env.SOPHIE_BACKUP_TIME || '03:00'),
  nodeEnv: process.env.NODE_ENV || 'development',
  webDistDir: process.env.SOPHIE_WEB_DIST || path.resolve(process.cwd(), 'packages/web/dist'),
  maxPhotoBytes: 10 * 1024 * 1024,
  maxPhotosPerItem: 10,
  quantityChangeRetention: 100,
};

export function ensureDirs(): void {
  for (const p of [config.dataDir, config.photoRoot, config.backupRoot, config.logDir]) {
    fs.mkdirSync(p, { recursive: true });
  }
}
