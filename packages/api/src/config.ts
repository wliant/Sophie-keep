import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

function parseTime(t: string): { h: number; m: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return { h: 3, m: 0 };
  return { h: Math.min(23, parseInt(m[1]!, 10)), m: Math.min(59, parseInt(m[2]!, 10)) };
}

const DATA_DIR = process.env.SOPHIE_DATA_DIR || path.resolve(process.cwd(), 'data');

// Resolve the bundled web dist relative to this module, not the current
// working directory. In the monorepo this module lives at
// packages/api/{src,dist}/config.* so we walk up to the workspace root and
// look for packages/web/dist. The env var overrides this for custom layouts.
function resolveWebDist(): string {
  if (process.env.SOPHIE_WEB_DIST) return path.resolve(process.env.SOPHIE_WEB_DIST);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '..', '..', 'web', 'dist'), // packages/api/(src|dist) → packages/web/dist
    path.resolve(here, '..', '..', '..', 'web', 'dist'),
    path.resolve(here, '..', '..', '..', 'packages', 'web', 'dist'),
    path.resolve(process.cwd(), 'packages/web/dist'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'index.html'))) return c;
  }
  return candidates[0]!;
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  bind: process.env.BIND || '127.0.0.1',
  dataDir: DATA_DIR,
  databaseUrl: process.env.DATABASE_URL || 'postgres://sophie:sophie@localhost:5432/sophie',
  minioEndpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
  minioAccessKey: process.env.MINIO_ACCESS_KEY || 'sophie',
  minioSecretKey: process.env.MINIO_SECRET_KEY || 'sophiepass',
  minioBucket: process.env.MINIO_BUCKET || 'sophie-photos',
  backupRoot: process.env.SOPHIE_BACKUP_ROOT || path.join(DATA_DIR, 'backups'),
  logDir: process.env.SOPHIE_LOG_DIR || path.join(DATA_DIR, 'logs'),
  backupTime: parseTime(process.env.SOPHIE_BACKUP_TIME || '03:00'),
  nodeEnv: process.env.NODE_ENV || 'development',
  webDistDir: resolveWebDist(),
  maxPhotoBytes: 10 * 1024 * 1024,
  maxPhotosPerItem: 10,
  quantityChangeRetention: 100,
};

export function ensureDirs(): void {
  for (const p of [config.dataDir, config.backupRoot, config.logDir]) {
    fs.mkdirSync(p, { recursive: true });
  }
}
