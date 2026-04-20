// Re-exports for backward compatibility.
// All new code should import directly from ./postgres.js
export {
  getPool as getDb,
  closePool as closeDb,
  runMigrations,
  tx,
  pgParams,
  type Db,
  type Pool,
  type PoolClient,
} from './postgres.js';
