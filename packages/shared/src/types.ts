import type { Shape } from './shapes.js';

export type QuantityChangeReason =
  | 'manual'
  | 'quick_add'
  | 'shopping_restock'
  | 'import';

export interface Item {
  id: string;
  name: string;
  item_type_id: string;
  storage_location_id: string;
  quantity: number;
  unit: string;
  expiration_date: string | null;
  low_stock_threshold: number | null;
  notes: string | null;
  photo_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface ItemWithDerived extends Item {
  is_low_stock: boolean;
  is_expired: boolean;
  is_expiring_soon: boolean;
  effective_low_stock_threshold: number | null;
  type_name?: string;
  room_name?: string;
  location_name?: string;
  thumbnail_url?: string | null;
}

export interface ItemType {
  id: string;
  name: string;
  default_unit: string;
  default_low_stock_threshold: number | null;
  icon: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
  item_count?: number;
}

export interface Room {
  id: string;
  name: string;
  shape_on_plan: Shape;
  created_at: string;
  updated_at: string;
}

export interface StorageLocation {
  id: string;
  name: string;
  room_id: string;
  shape_on_plan: Shape;
  created_at: string;
  updated_at: string;
  item_count?: number;
}

export interface FloorPlan {
  id: string;
  name: string;
  width: number;
  height: number;
  background_image_photo_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Photo {
  id: string;
  owner_kind: 'item' | 'floor_plan';
  owner_id: string;
  file_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

export interface QuantityChange {
  id: string;
  item_id: string;
  delta: number;
  new_quantity: number;
  reason: QuantityChangeReason;
  created_at: string;
}

export interface ShoppingListEntry {
  id: string;
  label: string;
  checked: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShoppingListAutoEntry {
  kind: 'auto';
  item_id: string;
  item: ItemWithDerived;
  reason: 'low_stock' | 'expired' | 'low_stock_and_expired';
  reason_text: string;
  checked: boolean;
}

export interface ShoppingListManualEntry {
  kind: 'manual';
  entry: ShoppingListEntry;
}

export interface Settings {
  expiring_soon_window_days: number;
  quick_add_default_type_id: string | null;
  quick_add_default_location_id: string | null;
  quick_add_default_unit: string | null;
  last_backup_status: 'ok' | 'failed' | null;
  last_backup_at: string | null;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface BackupManifest {
  timestamp: string;
  schema_version: number;
  entity_counts: Record<string, number>;
  photo_count: number;
  checksum: string;
  app_version: string;
}

export interface BackupRecord {
  id: string;
  filename: string;
  timestamp: string;
  size_bytes: number;
  manifest: BackupManifest | null;
  verification_status: 'ok' | 'checksum_mismatch' | 'unreadable';
}

export const SCHEMA_VERSION = 1;
export const APP_VERSION = '1.0.0';
