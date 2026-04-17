# Domain Model

The domain is intentionally small. This file is the single source of truth for entities, fields, and invariants. All functional specs reference this file rather than redefining fields.

## Entity summary

| Entity | Purpose |
|---|---|
| [Item](#item) | A tracked thing in the household inventory. |
| [ItemType](#itemtype) | A category for items, providing defaults and filtering. |
| [StorageLocation](#storagelocation) | A specific place items are kept. Belongs to a Room. |
| [Room](#room) | A top-level area of the home containing storage locations. |
| [FloorPlan](#floorplan) | The 2D layout shown in the UI. One active plan. |
| [Photo](#photo) | A photo attached to an item. |
| [QuantityChange](#quantitychange) | An audit record of a quantity delta. |
| [ShoppingListEntry](#shoppinglistentry) | A manual entry on the shopping list (auto entries are derived, not stored). |

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
| `default_unit` | string | yes | Used when an item of this type is created without a unit. |
| `default_low_stock_threshold` | number | no | Nullable. |
| `icon` | string | no | Short string or SVG identifier for UI. |
| `color` | string | no | CSS hex color. |
| `created_at` | timestamp | yes | |
| `updated_at` | timestamp | yes | |

**Invariants**:

- Deleting an `ItemType` that is referenced by any `Item` is **blocked** — the UI must offer a reassign-then-delete flow.
- Renaming preserves the `id`.

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
| `created_at` | timestamp | yes | |
| `updated_at` | timestamp | yes | |

**Invariants**:

- The system stores at most one `FloorPlan` in v1 (multi-plan households are deferred — see `OI-003`).
- All `Room.shape_on_plan` rectangles/polygons must lie entirely within the plan's bounds.

## Photo

An image associated with an item (or, optionally, with a floor plan as a background).

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Opaque. |
| `owner_kind` | enum(`item`, `floor_plan`) | yes | Distinguishes item photos from plan backgrounds. |
| `owner_id` | string | yes | References `Item.id` or `FloorPlan.id`. |
| `file_path` | string | yes | Server-relative path under the photo storage root. |
| `mime_type` | string | yes | E.g. `image/jpeg`, `image/png`, `image/webp`. |
| `size_bytes` | number | yes | ≤ 10 MB (see `NFR-SCALE-002`). |
| `created_at` | timestamp | yes | |

**Invariants**:

- Deleting the owning `Item` or `FloorPlan` cascades to delete its photos (DB row **and** file on disk).

## QuantityChange

An audit record emitted every time an item's quantity is modified. Used to show "last change" and to debug unexpected deltas.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | |
| `item_id` | string | yes | References `Item.id`. |
| `delta` | number | yes | Positive for additions, negative for decrements. `0` for explicit sets where the quantity did not change. |
| `new_quantity` | number | yes | The post-change quantity. |
| `reason` | enum(`manual`, `quick_add`, `shopping_restock`, `import`) | yes | Why the change happened. |
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
| `Photo.owner_id` → `Item` or `FloorPlan` | Cascade delete photo row + file. |
| `QuantityChange.item_id` → `Item` | Cascade delete changes when item is deleted. |
