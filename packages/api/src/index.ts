import { buildApp } from './app.js';
import { config, ensureDirs } from './config.js';
import { openPool, getPool, runMigrations, closePool } from './db/postgres.js';
import { initS3, ensureBucket } from './storage/s3.js';
import { scheduleDailyBackup } from './scheduler/daily-backup.js';
import { scheduleAutoCheckCleanup } from './scheduler/auto-check-cleanup.js';
import { isBindRoutable } from './util/bind.js';

async function main(): Promise<void> {
  ensureDirs();

  openPool(config.databaseUrl);
  initS3(config.minioEndpoint, config.minioAccessKey, config.minioSecretKey, config.minioBucket);
  await ensureBucket();
  await runMigrations(getPool());

  const app = await buildApp();

  if (isBindRoutable(config.bind)) {
    app.log.warn(
      { bind: config.bind },
      'WARNING: binding to a publicly routable address. Sophie-keep is LAN-only by design and must not be exposed to the public internet.',
    );
  }

  const stopDaily = scheduleDailyBackup(app.log);
  const stopAuto = scheduleAutoCheckCleanup();

  try {
    await app.listen({ port: config.port, host: config.bind });
    app.log.info({ bind: config.bind, port: config.port }, 'sophie-keep listening');
  } catch (err) {
    app.log.error({ err }, 'failed to start');
    process.exit(1);
  }

  const shutdown = async (): Promise<void> => {
    app.log.info('shutting down');
    stopDaily();
    stopAuto();
    try {
      await app.close();
    } catch (e) {
      app.log.error({ err: e }, 'error closing app');
    }
    await closePool();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
