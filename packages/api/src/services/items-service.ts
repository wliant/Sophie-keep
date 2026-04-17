import type Database from 'better-sqlite3';
import type { Item, ItemWithDerived, QuantityChange, QuantityChangeReason } from '@sophie/shared';
import type { ItemCreate, ItemPatch } from '@sophie/shared';
import { conflictStale, notFound, semantic, validation } from '../errors.js';
import { clock } from '../util/clock.js';
import { ulid } from '../util/ulid.js';
import { tx } from '../db/sqlite.js';
import { getSettings } from './settings-service.js';
import { isExpiredJS, isExpiringSoonJS, isLowStockJS } from './alerts-service.js';
import { getType } from './types-service.js';
import { getLocation } from './locations-service.js';
import { config } from '../config.js';

type ItemRow = {
  id: string;
  name: string;
  item_type_id: string;
  storage_location_id: string;
  quantity: number;
  unit: string;
  expiration_date: string | null;
  low_stock_threshold: number | null;
  notes: string | null;
  photo_ids: string;
  created_at: string;
  updated_at: string;
};

function rowToItem(r: ItemRow): Item {
  return {
    id: r.id,
    name: r.name,
    item_type_id: r.item_type_id,
    storage_location_id: r.storage_location_id,
    quantity: r.quantity,
    unit: r.unit,
    expiration_date: r.expiration_date,
    low_stock_threshold: r.low_stock_threshold,
    notes: r.notes,
    photo_ids: JSON.parse(r.photo_ids),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function getItemRow(db: Database.Database, id: string): ItemRow {
  const r = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow | undefined;
  if (!r) throw notFound('item');
  return r;
}

export function getItem(db: Database.Database, id: string): Item {
  return rowToItem(getItemRow(db, id));
}

export function enrichItem(db: Database.Database, item: Item): ItemWithDerived {
  const settings = getSettings(db);
  const today = clock.todayIso();
  const type = db
    .prepare('SELECT name, default_low_stock_threshold FROM item_types WHERE id = ?')
    .get(item.item_type_id) as { name: string; default_low_stock_threshold: number | null } | undefined;
  const loc = db
    .prepare(
      `SELECT sl.name AS loc_name, r.name AS room_name FROM storage_locations sl
       JOIN rooms r ON r.id = sl.room_id WHERE sl.id = ?`,
    )
    .get(item.storage_location_id) as { loc_name: string; room_name: string } | undefined;

  const effective = item.low_stock_threshold ?? type?.default_low_stock_threshold ?? null;
  const firstPhoto = item.photo_ids[0];
  const thumbnail_url = firstPhoto ? `/api/v1/photos/${firstPhoto}?variant=thumb` : null;
  return {
    ...item,
    is_low_stock: isLowStockJS(
      item.quantity,
      item.low_stock_threshold,
      type?.default_low_stock_threshold ?? null,
    ),
    is_expired: isExpiredJS(item.expiration_date, today),
    is_expiring_soon: isExpiringSoonJS(
      item.expiration_date,
      today,
      settings.expiring_soon_window_days,
    ),
    effective_low_stock_threshold: effective,
    type_name: type?.name,
    room_name: loc?.room_name,
    location_name: loc?.loc_name,
    thumbnail_url,
  };
}

export function createItem(db: Database.Database, data: ItemCreate): Item {
  const type = getType(db, data.item_type_id);
  getLocation(db, data.storage_location_id);
  const unit = data.unit ?? type.default_unit;
  const quantity = data.quantity ?? 0;
  const id = ulid();
  const now = clock.nowIso();
  db.prepare(
    `INSERT INTO items (id, name, item_type_id, storage_location_id, quantity, unit, expiration_date, low_stock_threshold, notes, photo_ids, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    data.name,
    data.item_type_id,
    data.storage_location_id,
    quantity,
    unit,
    data.expiration_date ?? null,
    data.low_stock_threshold ?? null,
    data.notes ?? null,
    JSON.stringify(data.photo_ids ?? []),
    now,
    now,
  );
  return getItem(db, id);
}

export function patchItem(db: Database.Database, id: string, patch: ItemPatch): Item {
  const existing = getItemRow(db, id);
  if (patch.base_updated_at && patch.base_updated_at !== existing.updated_at) throw conflictStale();
  if (patch.item_type_id !== undefined) getType(db, patch.item_type_id);
  if (patch.storage_location_id !== undefined) getLocation(db, patch.storage_location_id);
  if (patch.photo_ids && patch.photo_ids.length > config.maxPhotosPerItem) {
    throw validation('photo_ids exceeds max count', {
      photo_ids: [`max ${config.maxPhotosPerItem}`],
    });
  }
  const now = clock.nowIso();
  // Zod's trim transform runs on incoming patch values. Trim here again so
  // the merged result matches the shape createItem would produce.
  const next = {
    name: (patch.name ?? existing.name).trim(),
    item_type_id: patch.item_type_id ?? existing.item_type_id,
    storage_location_id: patch.storage_location_id ?? existing.storage_location_id,
    quantity: patch.quantity ?? existing.quantity,
    unit: patch.unit ?? existing.unit,
    expiration_date:
      patch.expiration_date === undefined ? existing.expiration_date : patch.expiration_date,
    low_stock_threshold:
      patch.low_stock_threshold === undefined
        ? existing.low_stock_threshold
        : patch.low_stock_threshold,
    notes:
      patch.notes === undefined
        ? existing.notes
        : patch.notes === null
          ? null
          : patch.notes,
    photo_ids: patch.photo_ids
      ? JSON.stringify(patch.photo_ids)
      : existing.photo_ids,
  };
  db.prepare(
    `UPDATE items SET name=?, item_type_id=?, storage_location_id=?, quantity=?, unit=?, expiration_date=?, low_stock_threshold=?, notes=?, photo_ids=?, updated_at=? WHERE id=?`,
  ).run(
    next.name,
    next.item_type_id,
    next.storage_location_id,
    next.quantity,
    next.unit,
    next.expiration_date,
    next.low_stock_threshold,
    next.notes,
    next.photo_ids,
    now,
    id,
  );
  return getItem(db, id);
}

export function deleteItem(db: Database.Database, id: string): { photoPaths: string[] } {
  // Collect photo paths for post-commit filesystem cleanup, then atomically
  // delete photo rows + item row so we never leave dangling photo metadata.
  // (quantity_changes cascade via FK; photos.owner_id is TEXT so we clean
  // them explicitly in the same transaction.)
  return tx(db, () => {
    getItem(db, id); // throws NOT_FOUND if missing
    const photoRows = db
      .prepare('SELECT file_path FROM photos WHERE owner_kind = ? AND owner_id = ?')
      .all('item', id) as Array<{ file_path: string }>;
    db.prepare('DELETE FROM photos WHERE owner_kind = ? AND owner_id = ?').run('item', id);
    db.prepare('DELETE FROM items WHERE id = ?').run(id);
    return { photoPaths: photoRows.map((r) => r.file_path) };
  });
}

export function applyQuantityOp(
  db: Database.Database,
  id: string,
  op: 'increment' | 'decrement' | 'set',
  amount: number,
  reason: QuantityChangeReason,
): { item: Item; change: QuantityChange } {
  if (!Number.isFinite(amount) || amount < 0) {
    throw validation('amount must be a non-negative finite number');
  }
  return tx(db, () => {
    const row = getItemRow(db, id);
    let newQty: number;
    let delta: number;
    if (op === 'increment') {
      delta = amount;
      newQty = row.quantity + amount;
    } else if (op === 'decrement') {
      delta = -amount;
      newQty = row.quantity - amount;
      if (newQty < 0)
        throw semantic('decrement would make quantity negative', {
          amount: ['cannot exceed current quantity'],
        });
    } else {
      delta = amount - row.quantity;
      newQty = amount;
    }
    const now = clock.nowIso();
    db.prepare('UPDATE items SET quantity = ?, updated_at = ? WHERE id = ?').run(newQty, now, id);
    const changeId = ulid();
    db.prepare(
      `INSERT INTO quantity_changes (id, item_id, delta, new_quantity, reason, created_at)
       VALUES (?,?,?,?,?,?)`,
    ).run(changeId, id, delta, newQty, reason, now);
    db.prepare(
      `DELETE FROM quantity_changes
       WHERE item_id = ? AND id NOT IN (
         SELECT id FROM quantity_changes WHERE item_id = ? ORDER BY created_at DESC LIMIT ?
       )`,
    ).run(id, id, config.quantityChangeRetention);
    return {
      item: getItem(db, id),
      change: {
        id: changeId,
        item_id: id,
        delta,
        new_quantity: newQty,
        reason,
        created_at: now,
      },
    };
  });
}

export function listQuantityChanges(db: Database.Database, id: string, limit = 10): QuantityChange[] {
  const rows = db
    .prepare(
      'SELECT * FROM quantity_changes WHERE item_id = ? ORDER BY created_at DESC LIMIT ?',
    )
    .all(id, limit) as QuantityChange[];
  return rows;
}

export function reorderPhotos(db: Database.Database, itemId: string, photoIds: string[]): Item {
  const existing = getItem(db, itemId);
  const existingSet = new Set(existing.photo_ids);
  if (photoIds.length !== existingSet.size || photoIds.some((p) => !existingSet.has(p))) {
    throw validation('photo_ids must be a reordering of the existing set');
  }
  const now = clock.nowIso();
  db.prepare('UPDATE items SET photo_ids = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(photoIds),
    now,
    itemId,
  );
  return getItem(db, itemId);
}
