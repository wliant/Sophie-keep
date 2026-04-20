import { getPool } from '../db/postgres.js';
import { purgeOldAutoChecks } from '../services/shopping-service.js';

export function scheduleAutoCheckCleanup(): () => void {
  const interval = setInterval(
    () => {
      purgeOldAutoChecks(getPool()).catch(() => {
        // ignore
      });
    },
    60 * 60 * 1000,
  );
  return () => clearInterval(interval);
}
