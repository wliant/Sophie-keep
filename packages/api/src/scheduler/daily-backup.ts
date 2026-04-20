import type { FastifyBaseLogger } from 'fastify';
import { getPool } from '../db/postgres.js';
import { config } from '../config.js';
import { createBackup } from '../services/backup-service.js';
import { setBackupStatus } from '../services/settings-service.js';
import { clock } from '../util/clock.js';

export function scheduleDailyBackup(log: FastifyBaseLogger): () => void {
  let timer: NodeJS.Timeout | null = null;

  async function run(): Promise<void> {
    try {
      await createBackup(getPool());
      log.info('daily backup completed');
    } catch (e) {
      log.error({ err: e }, 'daily backup failed');
      await setBackupStatus(getPool(), 'failed', clock.nowIso());
    }
    schedule();
  }

  function schedule(): void {
    const now = new Date();
    const next = new Date(now);
    next.setHours(config.backupTime.h, config.backupTime.m, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    const delay = next.getTime() - now.getTime();
    timer = setTimeout(() => void run(), delay);
  }

  schedule();
  return () => {
    if (timer) clearTimeout(timer);
  };
}
