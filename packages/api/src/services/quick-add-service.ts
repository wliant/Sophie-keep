import type Database from 'better-sqlite3';
import type { Item, QuantityChange } from '@sophie/shared';
import { applyQuantityOp, createItem } from './items-service.js';
import { patchSettings, getSettings } from './settings-service.js';
import { notFound, validation } from '../errors.js';

export interface QuickAddInput {
  name?: string;
  existing_item_id?: string;
  item_type_id?: string;
  storage_location_id?: string;
  unit?: string;
  amount?: number;
}

export interface QuickAddResult {
  item: Item;
  created: boolean;
  change?: QuantityChange;
}

export function quickAdd(db: Database.Database, input: QuickAddInput): QuickAddResult {
  const amount = input.amount ?? 1;
  if (input.existing_item_id) {
    const exists = db.prepare('SELECT id FROM items WHERE id = ?').get(input.existing_item_id);
    if (!exists) throw notFound('item');
    const { item, change } = applyQuantityOp(
      db,
      input.existing_item_id,
      'increment',
      amount,
      'quick_add',
    );
    return { item, created: false, change };
  }
  if (!input.name) {
    throw validation('name or existing_item_id required');
  }
  const settings = getSettings(db);
  const typeId = input.item_type_id ?? settings.quick_add_default_type_id;
  const locId = input.storage_location_id ?? settings.quick_add_default_location_id;
  if (!typeId || !locId) {
    throw validation('no defaults set; item_type_id and storage_location_id required');
  }
  const unit = input.unit ?? settings.quick_add_default_unit ?? undefined;
  const item = createItem(db, {
    name: input.name,
    item_type_id: typeId,
    storage_location_id: locId,
    quantity: amount,
    unit,
  });
  patchSettings(db, {
    quick_add_default_type_id: typeId,
    quick_add_default_location_id: locId,
    ...(unit ? { quick_add_default_unit: unit } : {}),
  });
  // Emit a quantity change
  const { change } = applyQuantityOp(db, item.id, 'set', amount, 'quick_add');
  return { item, created: true, change };
}
