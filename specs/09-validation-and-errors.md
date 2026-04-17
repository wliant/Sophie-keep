# Validation and Errors

Every field constraint and every error code is listed here so the implementation (and tests) have a single source of truth.

## Field constraints

### Item

| Field | Constraint |
|---|---|
| `name` | Required. Trimmed. 1–120 chars after trim. |
| `item_type_id` | Required. Must reference an existing `ItemType`. |
| `storage_location_id` | Required. Must reference an existing `StorageLocation`. |
| `quantity` | Required. Number ≥ 0. Finite. |
| `unit` | Required. 1–16 chars. Must match `^[a-zA-Z%°µ]+$` (letters + a small set of symbols). |
| `expiration_date` | Optional. ISO 8601 date (`YYYY-MM-DD`). Any date from 1900-01-01 to 2999-12-31. |
| `low_stock_threshold` | Optional. Number ≥ 0. Finite. |
| `notes` | Optional. ≤ 2,000 chars. |
| `photo_ids` | Optional. Array of existing photo ids belonging to this item. ≤ 10 entries (`NFR-SCALE-002`). |

### ItemType

| Field | Constraint |
|---|---|
| `name` | Required. Trimmed. 1–60 chars. Unique case-insensitively (`FR-TYPES-002`). |
| `default_unit` | Required. 1–16 chars. Same character class as `Item.unit`. |
| `default_low_stock_threshold` | Optional. Number ≥ 0. |
| `icon` | Optional. ≤ 32 chars. Either a short identifier or a small inline SVG-safe string (`<`/`>` not allowed to prevent injection). |
| `color` | Optional. Must match `^#[0-9a-fA-F]{6}$`. |

### StorageLocation

| Field | Constraint |
|---|---|
| `name` | Required. 1–60 chars. Unique per room, case-insensitively (`FR-LOCS-011`). |
| `room_id` | Required. References an existing `Room`. |
| `shape_on_plan` | Required. Either rect `{type,x,y,w,h}` or polygon `{type,points}`. All numeric fields finite. `w > 0`, `h > 0`. Polygon must have ≥ 3 points; coordinates must lie within the parent room (`FR-LOCS-015`). |

### Room

| Field | Constraint |
|---|---|
| `name` | Required. 1–60 chars. Unique case-insensitively (`FR-LOCS-002`). |
| `shape_on_plan` | Required. Rect or polygon. All numeric fields finite, positive sizes. Shape must lie within the floor plan bounds. |

### FloorPlan

| Field | Constraint |
|---|---|
| `name` | Required. 1–60 chars. |
| `width` | Required. Number > 0. |
| `height` | Required. Number > 0. |
| `background_image_photo_id` | Optional. Must reference an existing photo with `owner_kind=floor_plan`. |

### ShoppingListEntry

| Field | Constraint |
|---|---|
| `label` | Required. Trimmed. 1–120 chars. |
| `checked` | Required. Boolean. |

### Photo upload

| Field | Constraint |
|---|---|
| MIME | One of `image/jpeg`, `image/png`, `image/webp` (`FR-PHOTOS-002`). Magic-byte verification (`NFR-SEC-005`). |
| Size | ≤ 10 MB per file (`FR-PHOTOS-003`). |
| Count per item | ≤ 10 (`NFR-SCALE-002`). |

### Settings

| Field | Constraint |
|---|---|
| `expiring_soon_window_days` | Integer 1–90 (`FR-EXPIRY-002`). |

## Uniqueness rules

| Scope | Fields | ID of rule |
|---|---|---|
| Global | lower(`ItemType.name`) | `FR-TYPES-002` |
| Global | lower(`Room.name`) | `FR-LOCS-002` |
| Per room | (`room_id`, lower(`StorageLocation.name`)) | `FR-LOCS-011` |

## Deletion rules

| Entity | Blocked when | Error code |
|---|---|---|
| `ItemType` | Any item references it | `REFERENCED` |
| `StorageLocation` | Any item references it | `REFERENCED` |
| `Room` | Any storage location in it | `NON_EMPTY` |
| `Item` | Never blocked | — |
| `Photo` | Never blocked | — |
| `ShoppingListEntry` (manual) | Never blocked | — |

Blocked deletes return `409 CONFLICT` with a sub-code from the table above and a message naming the count of references.

## Error code taxonomy

All API errors use one of these codes (`error.code` in the response body).

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | One or more fields failed constraints. `fields` map lists per-field messages. |
| `NOT_FOUND` | 404 | The requested resource does not exist. |
| `CONFLICT_STALE` | 409 | The `base_updated_at` does not match the current row (`FR-DATA-030`). |
| `CONFLICT_UNIQUE` | 409 | A uniqueness rule would be violated. |
| `CONFLICT_REFERENCED` | 409 | Deletion is blocked because the entity is referenced. |
| `CONFLICT_NON_EMPTY` | 409 | Room deletion is blocked because it contains locations. |
| `SEMANTIC_ERROR` | 422 | Rules that aren't simple field validation (e.g., shape outside parent room, negative quantity after decrement, incompatible restore schema). |
| `PAYLOAD_TOO_LARGE` | 413 | Upload exceeds size limits. |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Upload MIME not accepted. |
| `MAGIC_BYTES_MISMATCH` | 415 | Declared MIME does not match file content (`NFR-SEC-005`). |
| `SCHEMA_MISMATCH` | 422 | Backup schema version is incompatible (`FR-BACKUP-034`). |
| `BACKUP_CHECKSUM_MISMATCH` | 422 | Backup checksum verification failed (`FR-BACKUP-010`). |
| `RESTORE_FAILED` | 500 | Restore aborted; pre-restore snapshot used to roll back (`FR-BACKUP-033`). |
| `INTERNAL_ERROR` | 500 | Unhandled server error. Message is generic; `request_id` lets the user report it (`FR-UI-111`). |

## Input sanitization

- **FR-VAL-001**: All string fields that appear in UI text must be stored as-is and output-encoded at render time (`NFR-SEC-004`). The server must not strip user text silently.
- **FR-VAL-002**: HTML in `notes` must not be interpreted — clients render it as plain text.
- **FR-VAL-003**: File uploads must verify magic bytes against the declared MIME (`NFR-SEC-005`). Mismatches return `MAGIC_BYTES_MISMATCH`.

## Dependencies

- API error shape: `08-api.md`.
- Security posture: `05-non-functional.md`.
- Domain invariants: `03-domain-model.md`.
