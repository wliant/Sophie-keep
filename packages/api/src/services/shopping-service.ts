import type {
  ShoppingListEntry,
  ShoppingListAutoEntry,
  ShoppingListManualEntry,
  ItemWithDerived,
  QuantityChange,
} from '@sophie/shared';
import type { Db, Pool } from '../db/postgres.js';
import { tx } from '../db/postgres.js';
import { clock } from '../util/clock.js';
import { ulid } from '../util/ulid.js';
import { notFound, conflictStale, validation } from '../errors.js';
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

async function buildAutoEntries(db: Db): Promise<ShoppingListAutoEntry[]> {
  const settings = await getSettings(db);
  const today = clock.todayIso();
  const expSoonSql = isExpiringSoonSQL(settings.expiring_soon_window_days);

  const { rows } = await db.query<Record<string, unknown>>(
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
     ORDER BY LOWER(item_types.name), LOWER(items.name)`,
  );

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
      quantity: Number(r.quantity),
      unit: r.unit as string,
      expiration_date: (r.expiration_date as string | null) ?? null,
      low_stock_threshold: r.low_stock_threshold != null ? Number(r.low_stock_threshold) : null,
      notes: (r.notes as string | null) ?? null,
      photo_ids: photoIds,
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
      is_low_stock: lowStock,
      is_expired: expired,
      is_expiring_soon: Boolean(r.is_expiring_soon),
      effective_low_stock_threshold:
        r.effective_low_stock_threshold != null ? Number(r.effective_low_stock_threshold) : null,
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

export async function getShoppingList(db: Db): Promise<ShoppingListView> {
  const auto = await buildAutoEntries(db);
  const { rows: manualRows } = await db.query<ShoppingListEntry>(
    `SELECT * FROM shopping_entries ORDER BY checked ASC, LOWER(label) ASC`,
  );
  const manual: ShoppingListManualEntry[] = manualRows.map((r) => ({
    kind: 'manual',
    entry: { ...r, checked: Boolean(r.checked) },
  }));
  return { auto, manual };
}

export async function createManualEntry(db: Db, label: string): Promise<ShoppingListEntry> {
  const id = ulid();
  const now = clock.nowIso();
  await db.query(
    `INSERT INTO shopping_entries (id, label, checked, created_at, updated_at) VALUES ($1,$2,$3,$4,$5)`,
    [id, label, 0, now, now],
  );
  return { id, label, checked: false, created_at: now, updated_at: now };
}

export async function patchManualEntry(
  db: Db,
  id: string,
  patch: { label?: string; checked?: boolean; base_updated_at?: string },
): Promise<ShoppingListEntry> {
  const { rows } = await db.query<ShoppingListEntry>(
    'SELECT * FROM shopping_entries WHERE id = $1',
    [id],
  );
  const row = rows[0];
  if (!row) throw notFound('shopping_entry');
  if (patch.base_updated_at && patch.base_updated_at !== row.updated_at) throw conflictStale();
  const label = patch.label ?? row.label;
  const checked = patch.checked ?? Boolean(row.checked);
  const now = clock.nowIso();
  await db.query('UPDATE shopping_entries SET label=$1, checked=$2, updated_at=$3 WHERE id=$4', [
    label,
    checked ? 1 : 0,
    now,
    id,
  ]);
  return { id, label, checked, created_at: row.created_at, updated_at: now };
}

export async function deleteManualEntry(db: Db, id: string): Promise<void> {
  const result = await db.query('DELETE FROM shopping_entries WHERE id = $1', [id]);
  if ((result.rowCount ?? 0) === 0) throw notFound('shopping_entry');
}

export async function setAutoCheck(db: Db, itemId: string, checked: boolean): Promise<void> {
  const now = clock.nowIso();
  await db.query(
    `INSERT INTO auto_entry_check_state (item_id, checked, updated_at) VALUES ($1,$2,$3)
     ON CONFLICT(item_id) DO UPDATE SET checked=EXCLUDED.checked, updated_at=EXCLUDED.updated_at`,
    [itemId, checked ? 1 : 0, now],
  );
}

export async function clearChecked(db: Db): Promise<void> {
  await tx(db as Pool, async (client) => {
    await client.query('DELETE FROM auto_entry_check_state');
    await client.query(
      "UPDATE shopping_entries SET checked = 0, updated_at = $1 WHERE checked = 1",
      [clock.nowIso()],
    );
  });
}

export async function purgeOldAutoChecks(db: Db, olderThanMs = 24 * 3600 * 1000): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  await db.query('DELETE FROM auto_entry_check_state WHERE updated_at < $1', [cutoff]);
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

export async function confirmRestock(
  db: Db,
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
): Promise<RestockResult> {
  const outcomes: RestockResult['item_outcomes'] = [];
  let manualDeleted = 0;

  for (const req of input.items) {
    try {
      const action = req.action ?? 'restock';
      if (action === 'delete_item') {
        await deleteItem(db, req.item_id);
        outcomes.push({ item_id: req.item_id, ok: true });
        continue;
      }
      if (action === 'update_expiry') {
        await patchItem(db, req.item_id, { expiration_date: req.new_expiration_date ?? null });
        if (req.new_quantity != null) {
          await applyQuantityOp(db, req.item_id, 'set', req.new_quantity, 'shopping_restock');
        }
        outcomes.push({ item_id: req.item_id, ok: true });
        continue;
      }
      // restock default
      let amount = req.restock_amount;
      if (amount == null) {
        const { rows } = await db.query<{ quantity: number; effective: number | null }>(
          `SELECT items.quantity, COALESCE(items.low_stock_threshold, item_types.default_low_stock_threshold) AS effective
           FROM items LEFT JOIN item_types ON item_types.id = items.item_type_id WHERE items.id = $1`,
          [req.item_id],
        );
        const row = rows[0];
        if (!row) throw notFound('item');
        amount = Math.max(1, (row.effective ?? 0) + 1 - Number(row.quantity));
      }
      if (amount <= 0) amount = 1;
      const { change } = await applyQuantityOp(db, req.item_id, 'increment', amount, 'shopping_restock');
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
    const ids = input.manual_entry_ids;
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const res = await db.query(`DELETE FROM shopping_entries WHERE id IN (${placeholders})`, ids);
    manualDeleted = res.rowCount ?? 0;
  }

  const processed = input.items.map((i) => i.item_id);
  if (processed.length) {
    const placeholders = processed.map((_, i) => `$${i + 1}`).join(',');
    await db.query(`DELETE FROM auto_entry_check_state WHERE item_id IN (${placeholders})`, processed);
  }

  void validation; // reserved
  return { item_outcomes: outcomes, manual_deleted: manualDeleted };
}
