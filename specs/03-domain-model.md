# Domain Model

The domain is intentionally small. This file is the single source of truth for entities, fields, and invariants. All functional specs reference this file rather than redefining fields.

## Entity summary

| Entity | Purpose |
|---|---|
| [Item](#item) | A tracked thing in the household inventory. |
| [ItemType](#itemtype) | A category for items, providing defaults and filtering. Supports a parent/child hierarchy. |
| [StorageLocation](#storagelocation) | A specific place items are kept. Belongs to a Room. |
| [Room](#room) | A top-level area of the home containing storage locations. |
| [FloorPlan](#floorplan) | The 2D layout shown in the UI. One active plan. |
| [Door](#door) | An opening on a room wall, stored as a JSON array on `FloorPlan`. |
| [Photo](#photo) | A photo attached to an item, floor plan, or recipe. |
| [QuantityChange](#quantitychange) | An audit record of a quantity delta. |
| [ShoppingListEntry](#shoppinglistentry) | A manual entry on the shopping list (auto entries are derived, not stored). |
| [Recipe](#recipe) | A collection of steps and ingredients for cooking a meal. |
| [RecipeIngredient](#recipeingredient) | One ingredient line of a recipe, referencing an `ItemType`. |

## ID and timestamp conventions

- All entities have an `id` that is a stable, opaque string (ULID or UUIDv4). Clients treat it as opaque.
- All entities have `created_at` and `updated_at` in UTC (ISO 8601 with `Z`).
- Timestamps are set server-side on create and on any field change.
- Soft-delete is **not** used in v1; deletes are hard deletes guarded by referential checks (see below).

## Item

Represents a physical thing being tracked.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Opaque. |
| `name` | string | yes | 1–120 chars. Trimmed. Case preserved. |
| `item_type_id` | string | yes | References an existing `ItemType`. |
| `storage_location_id` | string | yes | References an existing `StorageLocation`. |
| `quantity` | number | yes | Non-negative. Integer or decimal depending on `unit`. Default 0 on create if omitted. |
| `unit` | string | yes | E.g. `pcs`, `g`, `ml`. If omitted on create, inherits `ItemType.default_unit`. |
| `expiration_date` | date | no | ISO 8601 date (`YYYY-MM-DD`). Nullable. |
| `low_stock_threshold` | number | no | Non-negative. If null, inherits `ItemType.default_low_stock_threshold`. |
| `photo_ids` | string[] | no | Ordered. Matches `Photo.id`s whose `item_id` equals this item's id. |
| `notes` | string | no | Free text, ≤ 2,000 chars. |
| `created_at` | timestamp | yes | Server-set. |
| `updated_at` | timestamp | yes | Server-set. |

**Invariants**:

- `item_type_id` and `storage_location_id` must reference live rows.
- `quantity >= 0`.
- `low_stock_threshold >= 0` when set.
- Two items **may** share a name (e.g., a kitchen "paprika" and a pantry "paprika") — uniqueness is not enforced on name.

**Derived flags** (computed, not stored):

- `is_low_stock` = `quantity <= effective_low_stock_threshold` (where `effective_low_stock_threshold` falls back through the item type).
- `is_expired` = `expiration_date < today`.
- `is_expiring_soon` = `today <= expiration_date <= today + expiring_soon_window_days` (default window: 7).

## ItemType

A category for items. Powers defaults and filtering.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Opaque. |
| `name` | string | yes | 1–60 chars. **Unique (case-insensitive)**. |
| `parent_id` | string \| null | no | References own `ItemType.id`. `null` means root type. |
| `default_unit` | string | yes | Used when an item of this type is created without a unit. |
| `default_low_stock_threshold` | number | no | Nullable. |
| `icon` | string | no | Short string or SVG identifier for UI. |
| `color` | string | no | CSS hex color. |
| `created_at` | timestamp | yes | |
| `updated_at` | timestamp | yes | |

**Invariants**:

- Deleting an `ItemType` that is referenced by any `Item` is **blocked** — the UI must offer a reassign-then-delete flow.
- Deleting a type that has children is **blocked** — children must be reassigned or reparented first.
- Renaming preserves the `id`.
- `parent_id` must not create a cycle (a type cannot be its own ancestor).
- Hierarchy depth must not exceed 10 levels.

## StorageLocation

A specific place items are kept. Always belongs to a `Room`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Opaque. |
| `name` | string | yes | 1–60 chars. **Unique within its `room_id`** (case-insensitive). |
| `room_id` | string | yes | References an existing `Room`. |
| `shape_on_plan` | shape | yes | See [Shape](#shape-on-plan-coordinate-system). |
| `created_at` | timestamp | yes | |
| `updated_at` | timestamp | yes | |

**Invariants**:

- Deleting a `StorageLocation` referenced by any `Item` is **blocked** — the UI must offer a reassign-then-delete flow.
- `shape_on_plan` must lie entirely within its parent `Room.shape_on_plan` (see coordinate system below).

## Room

A top-level area of the home.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Opaque. |
| `name` | string | yes | 1–60 chars. **Unique (case-insensitive)**. |
| `shape_on_plan` | shape | yes | See [Shape](#shape-on-plan-coordinate-system). |
| `created_at` | timestamp | yes | |
| `updated_at` | timestamp | yes | |

**Invariants**:

- Deleting a `Room` that contains any `StorageLocation` is **blocked** — storage locations must be reassigned or deleted first.

## FloorPlan

The 2D layout the UI renders. Exactly one active plan.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Opaque. |
| `name` | string | yes | 1–60 chars. |
| `width` | number | yes | Logical units. See [Shape](#shape-on-plan-coordinate-system). |
| `height` | number | yes | Logical units. |
| `background_image_photo_id` | string | no | Optional reference to an uploaded plan image used as background. |
| `doors` | Door[] | yes | JSON array of door placements. May be empty. Stored with the plan record. |
| `created_at` | timestamp | yes | |
| `updated_at` | timestamp | yes | |

**Invariants**:

- The system stores at most one `FloorPlan` in v1 (multi-plan households are deferred — see `OI-003`).
- All `Room.shape_on_plan` rectangles/polygons must lie entirely within the plan's bounds.

## Door

An opening on a room wall. Not a standalone DB entity — stored as a JSON array within `FloorPlan.doors`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Opaque, unique within the floor plan. |
| `room_id` | string | yes | Which room this door belongs to. |
| `wall` | enum(`north`, `south`, `east`, `west`) | yes | Which wall of the room the door is on. |
| `t` | number | yes | Normalised position along the wall in `[0, 1]`. |
| `width` | number | yes | Opening width in floor-plan logical units. The implied segment must not exceed the room boundary. |

## Photo

An image associated with an item (or, optionally, with a floor plan as a background).

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Opaque. |
| `owner_kind` | enum(`item`, `floor_plan`, `recipe`) | yes | Distinguishes item photos, plan backgrounds, and recipe photos. |
| `owner_id` | string | yes | References `Item.id`, `FloorPlan.id`, or `Recipe.id`. |
| `file_path` | string | yes | Object key in the S3-compatible store (see `07-data-and-storage.md`). |
| `mime_type` | string | yes | E.g. `image/jpeg`, `image/png`, `image/webp`. |
| `size_bytes` | number | yes | ≤ 10 MB (see `NFR-SCALE-002`). |
| `created_at` | timestamp | yes | |

**Invariants**:

- Deleting the owning `Item`, `FloorPlan`, or `Recipe` cascades to delete its photos (DB row **and** object in the object store).

## QuantityChange

An audit record emitted every time an item's quantity is modified. Used to show "last change" and to debug unexpected deltas.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | |
| `item_id` | string | yes | References `Item.id`. |
| `delta` | number | yes | Positive for additions, negative for decrements. `0` for explicit sets where the quantity did not change. |
| `new_quantity` | number | yes | The post-change quantity. |
| `reason` | enum(`manual`, `quick_add`, `shopping_restock`, `import`, `recipe_cooked`) | yes | Why the change happened. |
| `created_at` | timestamp | yes | |

**Retention**: last 100 changes per item, enforced on write.

## ShoppingListEntry

Manual entries only. Auto-derived entries (low-stock + expired) are computed on read and **not** stored.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | |
| `label` | string | yes | 1–120 chars. |
| `checked` | boolean | yes | Default false. |
| `created_at` | timestamp | yes | |
| `updated_at` | timestamp | yes | |

## Recipe

A collection of cooking steps and ingredients. Ingredients reference `ItemType`s so the system can check whether sufficient inventory is on hand.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Opaque. |
| `name` | string | yes | 1–120 chars. **Unique (case-insensitive)**. |
| `description` | string | no | Free text. Nullable. |
| `steps` | string[] | yes | Ordered list of instruction strings. May be empty. |
| `tags` | string[] | yes | Free-form tags for filtering/grouping. May be empty. |
| `servings` | number | no | Positive integer. Nullable. |
| `prep_minutes` | number | no | Non-negative integer. Nullable. |
| `cook_minutes` | number | no | Non-negative integer. Nullable. |
| `notes` | string | no | Free text. Nullable. |
| `photo_ids` | string[] | yes | Ordered. Matches `Photo.id`s whose `owner_id` equals this recipe's id. |
| `created_at` | timestamp | yes | Server-set. |
| `updated_at` | timestamp | yes | Server-set. |

**Derived flags** (computed, not stored):

- `match_status` — `'makeable'` if all required ingredients are satisfied; `'partial'` if some required ingredients are short; `'missing'` if any required ingredient has zero on-hand quantity.

## RecipeIngredient

One ingredient line of a recipe. References an `ItemType` rather than a specific item so it matches any item of that type regardless of storage location.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Opaque. |
| `recipe_id` | string | yes | References `Recipe.id`. |
| `item_type_id` | string | yes | References `ItemType.id`. |
| `required_quantity` | number | yes | Positive. |
| `required_unit` | string | yes | E.g. `g`, `ml`, `pcs`. |
| `optional` | boolean | yes | If true, shortage does not affect `match_status`. |
| `note` | string | no | Per-ingredient free text (e.g., "finely chopped"). Nullable. |
| `sort_order` | number | yes | Display order within the recipe. |

**Invariants**:

- Deleting a `Recipe` cascades to delete its `RecipeIngredient` rows.
- `item_type_id` must reference a live `ItemType`; deleting a type referenced by an ingredient is **blocked**.

## Shape-on-plan coordinate system

The floor plan uses a **logical coordinate system** independent of pixels:

- Origin (`0, 0`) is the top-left corner of the plan.
- `x` increases to the right, `y` increases downward.
- Units are arbitrary numbers; the UI scales the plan to fit the viewport.
- `FloorPlan.width` and `FloorPlan.height` define the bounds.

A `shape_on_plan` is a JSON object with one of two forms:

```json
{ "type": "rect", "x": 10, "y": 20, "w": 100, "h": 40 }
```

or

```json
{ "type": "polygon", "points": [[10,20],[110,20],[110,60],[10,60]] }
```

Rectangles are preferred for storage locations to keep the editor simple. Polygons are available for rooms with irregular shapes.

## Referential-integrity summary

| From → To | On delete of target |
|---|---|
| `Item.item_type_id` → `ItemType` | Blocked if any item references it. |
| `Item.storage_location_id` → `StorageLocation` | Blocked if any item references it. |
| `StorageLocation.room_id` → `Room` | Blocked if the room has any locations. |
| `Photo.owner_id` → `Item` or `FloorPlan` or `Recipe` | Cascade delete photo row + object in store. |
| `QuantityChange.item_id` → `Item` | Cascade delete changes when item is deleted. |
| `ItemType.parent_id` → `ItemType` | Blocked if any child types reference it (children must be reassigned first). |
| `RecipeIngredient.recipe_id` → `Recipe` | Cascade delete ingredient rows when recipe is deleted. |
| `RecipeIngredient.item_type_id` → `ItemType` | Blocked if any recipe ingredient references it. |
