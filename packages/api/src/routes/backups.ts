import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { restoreConfirmZ } from '@sophie/shared';
import { getDb } from '../db/sqlite.js';
import { parseId } from '../util/params.js';
import { parseMultipartForm } from '../util/multipart.js';
import {
  createBackup,
  getBackupPath,
  listBackups,
  restoreBackup,
} from '../services/backup-service.js';
import { getSettings } from '../services/settings-service.js';
import { config } from '../config.js';
import { validation } from '../errors.js';

export async function backupsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/backups', async () => ({ items: listBackups() }));

  app.post('/api/v1/backups', async (req, reply) => {
    const result = await createBackup(getDb());
    reply.status(201);
    return result;
  });

  app.get('/api/v1/backups/status', async () => {
    const s = getSettings(getDb());
    return {
      last_backup_status: s.last_backup_status,
      last_backup_at: s.last_backup_at,
    };
  });

  app.get('/api/v1/backups/:id/download', async (req, reply) => {
    const id = parseId(req.params);
    const full = getBackupPath(id);
    reply.header('content-type', 'application/gzip');
    reply.header('content-disposition', `attachment; filename="${id}"`);
    return reply.send(fs.createReadStream(full));
  });

  app.post('/api/v1/backups/:id/restore', async (req) => {
    const id = parseId(req.params);
    restoreConfirmZ.parse(req.body);
    const full = getBackupPath(id);
    await restoreBackup(getDb(), full);
    return { ok: true };
  });

  app.post('/api/v1/backups/upload-and-restore', async (req) => {
    const form = await parseMultipartForm(req, {
      maxFileBytes: 2 * 1024 * 1024 * 1024, // 2 GB cap for backup archives
      maxFiles: 1,
    });
    if (form.fields.confirm !== 'REPLACE ALL DATA') {
      throw validation("confirm must be 'REPLACE ALL DATA'");
    }
    if (form.files.length !== 1) throw validation('exactly one file required');
    const uploadDir = path.join(config.backupRoot, '.uploads');
    fs.mkdirSync(uploadDir, { recursive: true });
    const tmpPath = path.join(uploadDir, `upload_${Date.now()}.tar.gz`);
    fs.writeFileSync(tmpPath, form.files[0]!.buffer);
    try {
      await restoreBackup(getDb(), tmpPath);
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
    return { ok: true };
  });
}
