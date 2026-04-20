import type { Settings } from '@sophie/shared';
import type { SettingsPatch } from '@sophie/shared';
import type { Db } from '../db/postgres.js';
import { clock } from '../util/clock.js';

export async function getSettings(db: Db): Promise<Settings> {
  const { rows } = await db.query('SELECT * FROM settings WHERE id = 1');
  const row = rows[0] as Record<string, unknown>;
  return {
    expiring_soon_window_days: row.expiring_soon_window_days as number,
    quick_add_default_type_id: (row.quick_add_default_type_id as string | null) ?? null,
    quick_add_default_location_id: (row.quick_add_default_location_id as string | null) ?? null,
    quick_add_default_unit: (row.quick_add_default_unit as string | null) ?? null,
    last_backup_status: (row.last_backup_status as 'ok' | 'failed' | null) ?? null,
    last_backup_at: (row.last_backup_at as string | null) ?? null,
    updated_at: row.updated_at as string,
  };
}

export async function patchSettings(db: Db, patch: SettingsPatch): Promise<Settings> {
  const current = await getSettings(db);
  const merged = {
    expiring_soon_window_days:
      patch.expiring_soon_window_days ?? current.expiring_soon_window_days,
    quick_add_default_type_id:
      patch.quick_add_default_type_id === undefined
        ? current.quick_add_default_type_id
        : patch.quick_add_default_type_id,
    quick_add_default_location_id:
      patch.quick_add_default_location_id === undefined
        ? current.quick_add_default_location_id
        : patch.quick_add_default_location_id,
    quick_add_default_unit:
      patch.quick_add_default_unit === undefined
        ? current.quick_add_default_unit
        : patch.quick_add_default_unit,
  };
  const now = clock.nowIso();
  await db.query(
    `UPDATE settings SET
       expiring_soon_window_days = $1,
       quick_add_default_type_id = $2,
       quick_add_default_location_id = $3,
       quick_add_default_unit = $4,
       updated_at = $5
     WHERE id = 1`,
    [
      merged.expiring_soon_window_days,
      merged.quick_add_default_type_id,
      merged.quick_add_default_location_id,
      merged.quick_add_default_unit,
      now,
    ],
  );
  return getSettings(db);
}

export async function setBackupStatus(
  db: Db,
  status: 'ok' | 'failed',
  at: string,
): Promise<void> {
  await db.query(
    `UPDATE settings SET last_backup_status = $1, last_backup_at = $2, updated_at = $3 WHERE id = 1`,
    [status, at, clock.nowIso()],
  );
}
