import type {
  BackupRecord,
  FloorPlan,
  FloorPlanEditSession,
  Item,
  ItemType,
  ItemWithDerived,
  PaginatedResponse,
  Photo,
  QuantityChange,
  Recipe,
  RecipeCookResult,
  RecipeDetail,
  RecipeIngredientWithStatus,
  RecipeMatchStatus,
  RecipeWithDerived,
  Room,
  Settings,
  ShoppingListAutoEntry,
  ShoppingListEntry,
  ShoppingListManualEntry,
  StorageLocation,
} from '@sophie/shared';
import { api } from './client';

// One typed method per endpoint — pages/hooks import from here instead of
// embedding raw `/api/v1/...` strings. Query-key helpers live alongside so
// TanStack Query invalidations can stay coordinated.

export interface ItemDetailResponse extends ItemWithDerived {
  quantity_changes: QuantityChange[];
}

export interface AutocompleteMatch {
  id: string;
  name: string;
  type_name: string | null;
  location_name: string | null;
  room_name: string | null;
  quantity: number;
  unit: string;
}

export interface ShoppingListResponse {
  auto: ShoppingListAutoEntry[];
  manual: ShoppingListManualEntry[];
}

export interface BackupStatus {
  last_backup_status: 'ok' | 'failed' | null;
  last_backup_at: string | null;
}

export interface HealthResponse {
  status: string;
  schema_version: number;
  app_version: string;
}

export const qk = {
  settings: ['settings'] as const,
  itemTypes: ['item-types'] as const,
  rooms: ['rooms'] as const,
  locations: ['storage-locations'] as const,
  floorPlan: ['floor-plan'] as const,
  items: (query?: Record<string, unknown>) => ['items', query ?? {}] as const,
  item: (id: string) => ['items', id] as const,
  autocomplete: (q: string) => ['autocomplete', q] as const,
  shopping: ['shopping-list'] as const,
  backups: ['backups'] as const,
  backupStatus: ['backup-status'] as const,
  health: ['health'] as const,
  recipes: (query?: Record<string, unknown>) => ['recipes', query ?? {}] as const,
  recipe: (id: string) => ['recipes', id] as const,
  recipeTags: ['recipe-tags'] as const,
};

export interface RecipeMatchResponse {
  recipe_id: string;
  match_status: RecipeMatchStatus;
  ingredients: RecipeIngredientWithStatus[];
  counts: { ok: number; short: number; missing: number; unit_mismatch: number };
}

export const endpoints = {
  // Items
  listItems: (query: Record<string, unknown> = {}) =>
    api.get<PaginatedResponse<ItemWithDerived>>('/api/v1/items', query),
  getItem: (id: string) => api.get<ItemDetailResponse>(`/api/v1/items/${id}`),
  createItem: (body: Partial<Item> & { name: string }) =>
    api.post<ItemWithDerived>('/api/v1/items', body),
  patchItem: (id: string, body: Record<string, unknown>) =>
    api.patch<ItemWithDerived>(`/api/v1/items/${id}`, body),
  deleteItem: (id: string) => api.del<void>(`/api/v1/items/${id}`),
  adjustQuantity: (id: string, body: { op: 'increment' | 'decrement' | 'set'; amount: number; reason?: string }) =>
    api.post<{ item: ItemWithDerived; change: QuantityChange }>(
      `/api/v1/items/${id}/quantity`,
      body,
    ),
  reorderPhotos: (id: string, photoIds: string[]) =>
    api.post<ItemWithDerived>(`/api/v1/items/${id}/photos/order`, { photo_ids: photoIds }),
  autocomplete: (q: string, limit = 5) =>
    api.get<{ items: AutocompleteMatch[] }>('/api/v1/items/autocomplete', { q, limit }),

  // Types
  listTypes: () => api.get<{ items: ItemType[] }>('/api/v1/item-types'),
  createType: (body: Partial<ItemType> & { name: string; default_unit: string }) =>
    api.post<ItemType>('/api/v1/item-types', body),
  patchType: (id: string, body: Record<string, unknown>) =>
    api.patch<ItemType>(`/api/v1/item-types/${id}`, body),
  deleteType: (id: string) => api.del<void>(`/api/v1/item-types/${id}`),
  mergeType: (id: string, targetId: string) =>
    api.post<ItemType>(`/api/v1/item-types/${id}/merge`, { target_id: targetId }),

  // Rooms
  listRooms: () => api.get<{ items: Room[] }>('/api/v1/rooms'),
  createRoom: (body: Partial<Room> & { name: string }) =>
    api.post<Room>('/api/v1/rooms', body),
  deleteRoom: (id: string) => api.del<void>(`/api/v1/rooms/${id}`),

  // Storage locations
  listLocations: (roomId?: string) =>
    api.get<{ items: StorageLocation[] }>(
      '/api/v1/storage-locations',
      roomId ? { room_id: roomId } : undefined,
    ),
  createLocation: (body: Partial<StorageLocation> & { name: string; room_id: string }) =>
    api.post<StorageLocation>('/api/v1/storage-locations', body),
  deleteLocation: (id: string) => api.del<void>(`/api/v1/storage-locations/${id}`),

  // Floor plan
  getFloorPlan: () => api.get<FloorPlan>('/api/v1/floor-plan'),
  patchFloorPlan: (body: Record<string, unknown>) =>
    api.patch<FloorPlan>('/api/v1/floor-plan', body),
  applyFloorPlanSession: (session: FloorPlanEditSession) =>
    api.post<{
      plan: FloorPlan;
      rooms_created: Record<string, string>;
      locations_created: Record<string, string>;
    }>('/api/v1/floor-plan/edit-session', session),

  // Quick-add
  quickAdd: (body: Record<string, unknown>) =>
    api.post<{ item: ItemWithDerived; created: boolean; change?: QuantityChange }>(
      '/api/v1/quick-add',
      body,
    ),

  // Shopping
  getShoppingList: () => api.get<ShoppingListResponse>('/api/v1/shopping-list'),
  addShoppingEntry: (label: string) =>
    api.post<ShoppingListEntry>('/api/v1/shopping-list/entries', { label }),
  patchShoppingEntry: (id: string, patch: Record<string, unknown>) =>
    api.patch<ShoppingListEntry>(`/api/v1/shopping-list/entries/${id}`, patch),
  deleteShoppingEntry: (id: string) => api.del<void>(`/api/v1/shopping-list/entries/${id}`),
  setAutoCheck: (itemId: string, checked: boolean) =>
    api.post<{ ok: boolean }>('/api/v1/shopping-list/auto-check', {
      item_id: itemId,
      checked,
    }),
  confirmRestock: (body: Record<string, unknown>) =>
    api.post<{ item_outcomes: unknown[]; manual_deleted: number }>(
      '/api/v1/shopping-list/confirm-restock',
      body,
    ),
  clearChecked: () =>
    api.post<{ ok: boolean }>('/api/v1/shopping-list/clear-checked', {}),

  // Settings
  getSettings: () => api.get<Settings>('/api/v1/settings'),
  patchSettings: (body: Record<string, unknown>) =>
    api.patch<Settings>('/api/v1/settings', body),

  // Backups
  listBackups: () => api.get<{ items: BackupRecord[] }>('/api/v1/backups'),
  createBackup: () => api.post<BackupRecord>('/api/v1/backups', {}),
  backupStatus: () => api.get<BackupStatus>('/api/v1/backups/status'),
  restoreBackup: (id: string) =>
    api.post<{ ok: boolean }>(`/api/v1/backups/${id}/restore`, {
      confirm: 'REPLACE ALL DATA',
    }),
  backupDownloadUrl: (id: string) => `/api/v1/backups/${id}/download`,

  // Photos
  uploadPhotos: (ownerKind: 'item' | 'floor_plan', ownerId: string, files: File[] | FileList) => {
    const form = new FormData();
    form.set('owner_kind', ownerKind);
    form.set('owner_id', ownerId);
    Array.from(files).forEach((f) => form.append('file', f));
    return api.upload<{ items: Photo[] }>('/api/v1/photos', form);
  },
  deletePhoto: (id: string) => api.del<void>(`/api/v1/photos/${id}`),

  // Health
  health: () => api.get<HealthResponse>('/api/v1/health'),

  // Recipes
  listRecipes: (query: Record<string, unknown> = {}) =>
    api.get<PaginatedResponse<RecipeWithDerived>>('/api/v1/recipes', query),
  getRecipe: (id: string) => api.get<RecipeDetail>(`/api/v1/recipes/${id}`),
  createRecipe: (body: Record<string, unknown>) =>
    api.post<RecipeDetail>('/api/v1/recipes', body),
  patchRecipe: (id: string, body: Record<string, unknown>) =>
    api.patch<RecipeDetail>(`/api/v1/recipes/${id}`, body),
  deleteRecipe: (id: string) => api.del<void>(`/api/v1/recipes/${id}`),
  matchRecipe: (id: string) =>
    api.get<RecipeMatchResponse>(`/api/v1/recipes/${id}/match`),
  cookRecipe: (id: string, body: { skip_optional?: boolean; dry_run?: boolean } = {}) =>
    api.post<RecipeCookResult>(`/api/v1/recipes/${id}/cook`, body),
  listRecipeTags: () => api.get<{ items: string[] }>('/api/v1/recipes/tags'),
};
