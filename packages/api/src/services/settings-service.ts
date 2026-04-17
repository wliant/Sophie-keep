import type Database from 'better-sqlite3';
import type { Settings } from '@sophie/shared';
import type { SettingsPatch } from '@sophie/shared';
import { clock } from '../util/clock.js';

export function getSettings(db: Database.Database): Settings {
  const row = db.prepare('SELECT * FROM settings WHERE id = 1').get() as Record<string, unknown>;
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

export function patchSettings(db: Database.Database, patch: SettingsPatch): Settings {
  const current = getSettings(db);
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
  db.prepare(
    `UPDATE settings SET
       expiring_soon_window_days = ?,
       quick_add_default_type_id = ?,
       quick_add_default_location_id = ?,
       quick_add_default_unit = ?,
       updated_at = ?
     WHERE id = 1`,
  ).run(
    merged.expiring_soon_window_days,
    merged.quick_add_default_type_id,
    merged.quick_add_default_location_id,
    merged.quick_add_default_unit,
    now,
  );
  return getSettings(db);
}

export function setBackupStatus(
  db: Database.Database,
  status: 'ok' | 'failed',
  at: string,
): void {
  db.prepare(
    `UPDATE settings SET last_backup_status = ?, last_backup_at = ?, updated_at = ? WHERE id = 1`,
  ).run(status, at, clock.nowIso());
}
