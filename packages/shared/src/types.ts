import type { Shape } from './shapes.js';

export interface Door {
  id: string;
  room_id: string;
  wall: 'north' | 'south' | 'east' | 'west';
  /** 0..1 position along the wall */
  t: number;
  /** opening width in floor-plan units */
  width: number;
}

export type QuantityChangeReason =
  | 'manual'
  | 'quick_add'
  | 'shopping_restock'
  | 'import'
  | 'recipe_cooked';

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
  doors: Door[];
  created_at: string;
  updated_at: string;
}

export interface Photo {
  id: string;
  owner_kind: 'item' | 'floor_plan' | 'recipe';
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

export interface Recipe {
  id: string;
  name: string;
  description: string | null;
  steps: string[];
  tags: string[];
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  notes: string | null;
  photo_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  item_type_id: string;
  required_quantity: number;
  required_unit: string;
  optional: boolean;
  note: string | null;
  sort_order: number;
}

export type IngredientMatchStatus = 'ok' | 'short' | 'missing' | 'unit_mismatch';
export type RecipeMatchStatus = 'makeable' | 'partial' | 'missing';

export interface RecipeIngredientWithStatus extends RecipeIngredient {
  status: IngredientMatchStatus;
  on_hand_quantity: number;
  shortfall: number | null;
  soonest_expiration_date: string | null;
  type_name: string | null;
}

export interface RecipeWithDerived extends Recipe {
  match_status: RecipeMatchStatus;
  missing_count: number;
  short_count: number;
  unit_mismatch_count: number;
  ingredient_count: number;
  thumbnail_url?: string | null;
}

export interface RecipeDetail extends RecipeWithDerived {
  ingredients: RecipeIngredientWithStatus[];
}

export interface RecipeCookPlanStep {
  item_id: string;
  item_name: string;
  item_type_id: string;
  decrement: number;
  unit: string;
}

export interface RecipeCookResult {
  recipe_id: string;
  dry_run: boolean;
  decrements: RecipeCookPlanStep[];
  quantity_change_ids: string[];
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

export const SCHEMA_VERSION = 2;
export const APP_VERSION = '1.0.0';
