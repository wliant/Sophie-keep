import type Database from 'better-sqlite3';
import { purgeOldAutoChecks } from '../services/shopping-service.js';

export function scheduleAutoCheckCleanup(db: Database.Database): () => void {
  const interval = setInterval(
    () => {
      try {
        purgeOldAutoChecks(db);
      } catch {
        // ignore
      }
    },
    60 * 60 * 1000,
  );
  return () => clearInterval(interval);
}
