import type Database from 'better-sqlite3';
import type {
  ShoppingListEntry,
  ShoppingListAutoEntry,
  ShoppingListManualEntry,
  ItemWithDerived,
  QuantityChange,
} from '@sophie/shared';
import { clock } from '../util/clock.js';
import { ulid } from '../util/ulid.js';
import { notFound, conflictStale, validation } from '../errors.js';
import { tx } from '../db/sqlite.js';
import { getSettings } from './settings-service.js';
import {
  EFFECTIVE_THRESHOLD_SQL,
  IS_EXPIRED_SQL,
  IS_LOW_STOCK_SQL,
  isExpiringSoonSQL,
} from './alerts-service.js';
import { applyQuantityOp, patchItem, deleteItem } from './items-service.js';

export interface ShoppingListView {
  auto: ShoppingListAutoEntry[];
  manual: ShoppingListManualEntry[];
}

function buildAutoEntries(db: Database.Database): ShoppingListAutoEntry[] {
  const settings = getSettings(db);
  const today = clock.todayIso();
  const expSoonSql = isExpiringSoonSQL(settings.expiring_soon_window_days);

  const rows = db
    .prepare(
      `SELECT
         items.*,
         item_types.name AS type_name,
         storage_locations.name AS location_name,
         rooms.name AS room_name,
         ${IS_LOW_STOCK_SQL} AS is_low_stock,
         ${IS_EXPIRED_SQL} AS is_expired,
         ${expSoonSql} AS is_expiring_soon,
         ${EFFECTIVE_THRESHOLD_SQL} AS effective_low_stock_threshold,
         COALESCE(acs.checked, 0) AS auto_checked
       FROM items
       LEFT JOIN item_types ON item_types.id = items.item_type_id
       LEFT JOIN storage_locations ON storage_locations.id = items.storage_location_id
       LEFT JOIN rooms ON rooms.id = storage_locations.room_id
       LEFT JOIN auto_entry_check_state acs ON acs.item_id = items.id
       WHERE (${IS_LOW_STOCK_SQL} = 1 OR ${IS_EXPIRED_SQL} = 1)
       ORDER BY item_types.name COLLATE NOCASE, items.name COLLATE NOCASE`,
    )
    .all() as Array<Record<string, unknown>>;

  return rows.map((r) => {
    const photoIds = JSON.parse((r.photo_ids as string) || '[]') as string[];
    const firstPhoto = photoIds[0];
    const lowStock = Boolean(r.is_low_stock);
    const expired = Boolean(r.is_expired);
    const item: ItemWithDerived = {
      id: r.id as string,
      name: r.name as string,
      item_type_id: r.item_type_id as string,
      storage_location_id: r.storage_location_id as string,
      quantity: r.quantity as number,
      unit: r.unit as string,
      expiration_date: (r.expiration_date as string | null) ?? null,
      low_stock_threshold: (r.low_stock_threshold as number | null) ?? null,
      notes: (r.notes as string | null) ?? null,
      photo_ids: photoIds,
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
      is_low_stock: lowStock,
      is_expired: expired,
      is_expiring_soon: Boolean(r.is_expiring_soon),
      effective_low_stock_threshold: (r.effective_low_stock_threshold as number | null) ?? null,
      type_name: (r.type_name as string) ?? undefined,
      location_name: (r.location_name as string) ?? undefined,
      room_name: (r.room_name as string) ?? undefined,
      thumbnail_url: firstPhoto ? `/api/v1/photos/${firstPhoto}?variant=thumb` : null,
    };
    let reason: ShoppingListAutoEntry['reason'] = 'low_stock';
    let reasonText = `Low stock: ${item.quantity} ${item.unit} left`;
    if (lowStock && expired) {
      reason = 'low_stock_and_expired';
      reasonText = `Low stock & expired (${item.expiration_date})`;
    } else if (expired) {
      reason = 'expired';
      const dur = daysSince(item.expiration_date!, today);
      reasonText = `Expired ${dur === 0 ? 'today' : `${dur} days ago`}`;
    }
    return {
      kind: 'auto',
      item_id: item.id,
      item,
      reason,
      reason_text: reasonText,
      checked: Boolean(r.auto_checked),
    };
  });
}

function daysSince(date: string, today: string): number {
  const a = Date.parse(date + 'T00:00:00Z');
  const b = Date.parse(today + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

export function getShoppingList(db: Database.Database): ShoppingListView {
  const auto = buildAutoEntries(db);
  const manualRows = db
    .prepare(
      `SELECT * FROM shopping_entries ORDER BY checked ASC, label COLLATE NOCASE ASC`,
    )
    .all() as ShoppingListEntry[];
  const manual: ShoppingListManualEntry[] = manualRows.map((r) => ({
    kind: 'manual',
    entry: { ...r, checked: Boolean(r.checked) },
  }));
  return { auto, manual };
}

export function createManualEntry(db: Database.Database, label: string): ShoppingListEntry {
  const id = ulid();
  const now = clock.nowIso();
  db.prepare(
    `INSERT INTO shopping_entries (id, label, checked, created_at, updated_at) VALUES (?,?,?,?,?)`,
  ).run(id, label, 0, now, now);
  return { id, label, checked: false, created_at: now, updated_at: now };
}

export function patchManualEntry(
  db: Database.Database,
  id: string,
  patch: { label?: string; checked?: boolean; base_updated_at?: string },
): ShoppingListEntry {
  const row = db.prepare('SELECT * FROM shopping_entries WHERE id = ?').get(id) as
    | ShoppingListEntry
    | undefined;
  if (!row) throw notFound('shopping_entry');
  if (patch.base_updated_at && patch.base_updated_at !== row.updated_at) throw conflictStale();
  const label = patch.label ?? row.label;
  const checked = patch.checked ?? Boolean(row.checked);
  const now = clock.nowIso();
  db.prepare('UPDATE shopping_entries SET label=?, checked=?, updated_at=? WHERE id=?').run(
    label,
    checked ? 1 : 0,
    now,
    id,
  );
  return { id, label, checked, created_at: row.created_at, updated_at: now };
}

export function deleteManualEntry(db: Database.Database, id: string): void {
  const res = db.prepare('DELETE FROM shopping_entries WHERE id = ?').run(id);
  if (res.changes === 0) throw notFound('shopping_entry');
}

export function setAutoCheck(
  db: Database.Database,
  itemId: string,
  checked: boolean,
): void {
  const now = clock.nowIso();
  db.prepare(
    `INSERT INTO auto_entry_check_state (item_id, checked, updated_at) VALUES (?,?,?)
     ON CONFLICT(item_id) DO UPDATE SET checked=excluded.checked, updated_at=excluded.updated_at`,
  ).run(itemId, checked ? 1 : 0, now);
}

export function clearChecked(db: Database.Database): void {
  tx(db, () => {
    db.prepare('DELETE FROM auto_entry_check_state').run();
    db.prepare("UPDATE shopping_entries SET checked = 0, updated_at = ? WHERE checked = 1").run(
      clock.nowIso(),
    );
  });
}

export function purgeOldAutoChecks(db: Database.Database, olderThanMs = 24 * 3600 * 1000): void {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  db.prepare('DELETE FROM auto_entry_check_state WHERE updated_at < ?').run(cutoff);
}

export interface RestockResult {
  item_outcomes: Array<{
    item_id: string;
    ok: boolean;
    error?: string;
    change?: QuantityChange;
    new_quantity?: number;
  }>;
  manual_deleted: number;
}

export function confirmRestock(
  db: Database.Database,
  input: {
    items: Array<{
      item_id: string;
      restock_amount?: number;
      new_expiration_date?: string | null;
      new_quantity?: number;
      action?: 'restock' | 'update_expiry' | 'delete_item';
    }>;
    manual_entry_ids?: string[];
  },
): RestockResult {
  const outcomes: RestockResult['item_outcomes'] = [];
  let manualDeleted = 0;

  for (const req of input.items) {
    try {
      const action = req.action ?? 'restock';
      if (action === 'delete_item') {
        deleteItem(db, req.item_id);
        outcomes.push({ item_id: req.item_id, ok: true });
        continue;
      }
      if (action === 'update_expiry') {
        patchItem(db, req.item_id, { expiration_date: req.new_expiration_date ?? null });
        if (req.new_quantity != null) {
          applyQuantityOp(db, req.item_id, 'set', req.new_quantity, 'shopping_restock');
        }
        outcomes.push({ item_id: req.item_id, ok: true });
        continue;
      }
      // restock default
      let amount = req.restock_amount;
      if (amount == null) {
        const row = db
          .prepare(
            `SELECT items.quantity, COALESCE(items.low_stock_threshold, item_types.default_low_stock_threshold) AS effective
             FROM items LEFT JOIN item_types ON item_types.id = items.item_type_id WHERE items.id = ?`,
          )
          .get(req.item_id) as { quantity: number; effective: number | null } | undefined;
        if (!row) throw notFound('item');
        amount = Math.max(1, (row.effective ?? 0) + 1 - row.quantity);
      }
      if (amount <= 0) amount = 1;
      const { change } = applyQuantityOp(db, req.item_id, 'increment', amount, 'shopping_restock');
      outcomes.push({
        item_id: req.item_id,
        ok: true,
        change,
        new_quantity: change.new_quantity,
      });
    } catch (e) {
      outcomes.push({
        item_id: req.item_id,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (input.manual_entry_ids?.length) {
    const placeholders = input.manual_entry_ids.map(() => '?').join(',');
    const res = db
      .prepare(`DELETE FROM shopping_entries WHERE id IN (${placeholders})`)
      .run(...input.manual_entry_ids);
    manualDeleted = res.changes;
  }

  // Clear auto checks for items that were processed
  const processed = input.items.map((i) => i.item_id);
  if (processed.length) {
    const placeholders = processed.map(() => '?').join(',');
    db.prepare(`DELETE FROM auto_entry_check_state WHERE item_id IN (${placeholders})`).run(...processed);
  }

  void validation; // reserved
  return { item_outcomes: outcomes, manual_deleted: manualDeleted };
}
